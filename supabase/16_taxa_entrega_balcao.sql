-- Taxa de entrega configurável em cada pedido de balcão.
alter table public.pedidos
  add column if not exists taxa_entrega numeric(10,2) not null default 0;

drop function if exists public.criar_pedido_balcao(integer, text, text, text, text, text, jsonb);

create or replace function public.criar_pedido_balcao(
  p_empresa_id integer,
  p_nome text,
  p_whatsapp text,
  p_tipo_entrega text,
  p_endereco text,
  p_forma_pagamento text,
  p_itens jsonb,
  p_taxa_entrega numeric default 0
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
  v_fone text := regexp_replace(coalesce(p_whatsapp, ''), '\\D', '', 'g');
  v_total numeric(10,2) := 0;
  v_taxa numeric(10,2) := coalesce(p_taxa_entrega, 0);
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
  if p_tipo_entrega <> 'Entrega' then v_taxa := 0; end if;
  if v_taxa < 0 or v_taxa > 5000 then raise exception 'Taxa de entrega inválida.'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array'
     or jsonb_array_length(p_itens) = 0 or jsonb_array_length(p_itens) > 50 then
    raise exception 'Adicione pelo menos um produto.';
  end if;

  insert into public.pedidos
    (empresa_id, cliente_nome, cliente_whatsapp, total, status, tipo_entrega, endereco_entrega, origem, forma_pagamento, taxa_entrega)
  values
    (v_emp.id, trim(p_nome), v_fone, 0, 'Novo', p_tipo_entrega,
     case when p_tipo_entrega = 'Entrega' then trim(p_endereco) else null end,
     'Balcão', coalesce(nullif(trim(p_forma_pagamento), ''), 'A combinar'), v_taxa)
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

  update public.pedidos
  set total = v_total + v_taxa
  where id = v_pedido_id;
  return v_pedido_id;
end;
$$;

revoke all on function public.criar_pedido_balcao(integer, text, text, text, text, text, jsonb, numeric) from public;
grant execute on function public.criar_pedido_balcao(integer, text, text, text, text, text, jsonb, numeric) to authenticated;
