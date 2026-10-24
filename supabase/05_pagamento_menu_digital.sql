-- Execute este arquivo no SQL Editor do Supabase do projeto de TESTE.
-- Cria a versão da função com forma de pagamento obrigatória e recarrega o cache do PostgREST.
create or replace function public.criar_pedido(
  p_slug text,
  p_nome text,
  p_whatsapp text,
  p_tipo_entrega text,
  p_endereco text,
  p_itens jsonb,
  p_forma_pagamento text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp public.empresas%rowtype;
  v_prod public.produtos%rowtype;
  v_item jsonb;
  v_qtd int;
  v_fone text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
  v_total numeric(10,2) := 0;
  v_pedido_id int;
  v_pagamento text := trim(coalesce(p_forma_pagamento, ''));
begin
  select * into v_emp from public.empresas where slug = p_slug and ativo;
  if not found then raise exception 'Restaurante não encontrado.'; end if;
  if not v_emp.aceita_pedidos then raise exception 'Este restaurante não está aceitando pedidos agora.'; end if;

  if length(trim(coalesce(p_nome, ''))) < 2 or length(p_nome) > 100 then
    raise exception 'Informe seu nome.';
  end if;
  if length(v_fone) < 10 or length(v_fone) > 13 then
    raise exception 'Informe um WhatsApp válido com DDD.';
  end if;
  if p_tipo_entrega not in ('Retirada', 'Entrega') then
    raise exception 'Escolha retirada ou entrega.';
  end if;
  if p_tipo_entrega = 'Entrega' and length(trim(coalesce(p_endereco, ''))) < 5 then
    raise exception 'Informe o endereço de entrega.';
  end if;
  if length(coalesce(p_endereco, '')) > 300 then raise exception 'Endereço muito longo.'; end if;
  if v_pagamento not in ('Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito') then
    raise exception 'Escolha uma forma de pagamento válida.';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array'
     or jsonb_array_length(p_itens) = 0 or jsonb_array_length(p_itens) > 50 then
    raise exception 'Seu carrinho está vazio.';
  end if;

  insert into public.pedidos
    (empresa_id, cliente_nome, cliente_whatsapp, total, status, tipo_entrega, endereco_entrega, forma_pagamento)
  values
    (v_emp.id, trim(p_nome), v_fone, 0, 'Novo', p_tipo_entrega,
     case when p_tipo_entrega = 'Entrega' then trim(p_endereco) else null end, v_pagamento)
  returning id into v_pedido_id;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := (v_item ->> 'quantidade')::int;
    if v_qtd is null or v_qtd < 1 or v_qtd > 50 then
      raise exception 'Quantidade inválida.';
    end if;

    select * into v_prod from public.produtos
      where id = (v_item ->> 'produto_id')::int and empresa_id = v_emp.id and disponivel;
    if not found then
      raise exception 'Um dos produtos não está mais disponível. Atualize a página.';
    end if;

    insert into public.itens_pedido (pedido_id, produto_id, nome_produto, quantidade, preco_unitario)
    values (v_pedido_id, v_prod.id, v_prod.nome, v_qtd, v_prod.preco);

    v_total := v_total + v_prod.preco * v_qtd;
  end loop;

  update public.pedidos set total = v_total where id = v_pedido_id;
  return v_pedido_id;
end;
$$;

revoke all on function public.criar_pedido(text, text, text, text, text, jsonb, text) from public;
grant execute on function public.criar_pedido(text, text, text, text, text, jsonb, text) to anon, authenticated;

-- Atualiza o cache de funções usado pelo Supabase/PostgREST após criar a assinatura nova.
notify pgrst, 'reload schema';
