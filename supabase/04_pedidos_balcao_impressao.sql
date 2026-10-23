-- Execute no SQL Editor do Supabase do projeto de TESTE antes de usar as novas funções.
-- Origem e forma de pagamento dos pedidos.
alter table public.pedidos
  add column if not exists origem text not null default 'Menu digital',
  add column if not exists forma_pagamento text not null default 'A combinar';

update public.pedidos set origem = 'Menu digital'
where origem is null or btrim(origem) = '';
update public.pedidos set forma_pagamento = 'A combinar'
where forma_pagamento is null or btrim(forma_pagamento) = '';

-- Pedido de balcão: exige sessão autenticada e que o usuário seja dono do restaurante.
-- Não depende de o cardápio público estar aceitando pedidos.
create or replace function public.criar_pedido_balcao(
  p_empresa_id integer,
  p_nome text,
  p_whatsapp text,
  p_tipo_entrega text,
  p_endereco text,
  p_forma_pagamento text,
  p_itens jsonb
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
  v_qtd integer;
  v_fone text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
  v_total numeric(10,2) := 0;
  v_pedido_id integer;
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta para registrar pedido de balcão.';
  end if;

  select * into v_emp
  from public.empresas
  where id = p_empresa_id and dono_id = auth.uid() and ativo;

  if not found then raise exception 'Restaurante não encontrado ou sem permissão.'; end if;
  if length(trim(coalesce(p_nome, ''))) < 2 or length(p_nome) > 100 then
    raise exception 'Informe um nome válido para o pedido.';
  end if;
  if length(v_fone) < 10 or length(v_fone) > 13 then v_fone := '0000000000'; end if;
  if p_tipo_entrega not in ('Retirada', 'Entrega') then
    raise exception 'Escolha retirada ou entrega.';
  end if;
  if p_tipo_entrega = 'Entrega' and length(trim(coalesce(p_endereco, ''))) < 5 then
    raise exception 'Informe o endereço de entrega.';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array'
     or jsonb_array_length(p_itens) = 0 or jsonb_array_length(p_itens) > 50 then
    raise exception 'Adicione pelo menos um produto.';
  end if;

  insert into public.pedidos
    (empresa_id, cliente_nome, cliente_whatsapp, total, status, tipo_entrega, endereco_entrega, origem, forma_pagamento)
  values
    (v_emp.id, trim(p_nome), v_fone, 0, 'Novo', p_tipo_entrega,
     case when p_tipo_entrega = 'Entrega' then trim(p_endereco) else null end,
     'Balcão', coalesce(nullif(trim(p_forma_pagamento), ''), 'A combinar'))
  returning id into v_pedido_id;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := (v_item ->> 'quantidade')::integer;
    if v_qtd is null or v_qtd < 1 or v_qtd > 50 then
      raise exception 'Quantidade inválida.';
    end if;

    select * into v_prod from public.produtos
    where id = (v_item ->> 'produto_id')::integer
      and empresa_id = v_emp.id and disponivel;

    if not found then raise exception 'Um produto não está disponível.'; end if;

    insert into public.itens_pedido
      (pedido_id, produto_id, nome_produto, quantidade, preco_unitario)
    values
      (v_pedido_id, v_prod.id, v_prod.nome, v_qtd, v_prod.preco);

    v_total := v_total + v_prod.preco * v_qtd;
  end loop;

  update public.pedidos set total = v_total where id = v_pedido_id;
  return v_pedido_id;
end;
$$;

revoke all on function public.criar_pedido_balcao(integer, text, text, text, text, text, jsonb) from public;
grant execute on function public.criar_pedido_balcao(integer, text, text, text, text, text, jsonb) to authenticated;
