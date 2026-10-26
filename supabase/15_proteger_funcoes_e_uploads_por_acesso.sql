-- Ensure privileged RPCs cannot bypass the same access gate as direct table writes.
create or replace function public.definir_complementos_produto(p_produto_id integer, p_grupo_ids integer[])
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
declare v_empresa_id integer;
begin
  if auth.uid() is null or not public.menuhub_user_has_access() then
    raise exception 'Sua conta não tem acesso ativo ao gerenciamento do MenuHub.';
  end if;

  select p.empresa_id into v_empresa_id
  from public.produtos p
  join public.empresas e on e.id = p.empresa_id
  where p.id = p_produto_id and e.dono_id = auth.uid();

  if v_empresa_id is null then
    raise exception 'Produto não encontrado ou sem permissão.';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_grupo_ids, array[]::integer[])) requested(grupo_id)
    left join public.grupos_complementos g on g.id = requested.grupo_id and g.empresa_id = v_empresa_id
    where g.id is null
  ) then
    raise exception 'Um ou mais grupos de complementos não pertencem a este restaurante.';
  end if;

  delete from public.produto_grupos_complementos where produto_id = p_produto_id;
  insert into public.produto_grupos_complementos (produto_id, grupo_id)
  select p_produto_id, requested.grupo_id
  from (select distinct unnest(coalesce(p_grupo_ids, array[]::integer[])) as grupo_id) requested;
end;
$function$;

create or replace function public.criar_pedido_balcao(
  p_empresa_id integer, p_nome text, p_whatsapp text, p_tipo_entrega text,
  p_endereco text, p_forma_pagamento text, p_itens jsonb
)
returns integer
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_emp public.empresas%rowtype;
  v_prod public.produtos%rowtype;
  v_item jsonb;
  v_qtd integer;
  v_fone text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
  v_total numeric(10,2) := 0;
  v_pedido_id integer;
begin
  if auth.uid() is null or not public.menuhub_user_has_access() then
    raise exception 'Sua conta não tem acesso ativo ao gerenciamento do MenuHub.';
  end if;

  select * into v_emp
  from public.empresas
  where id = p_empresa_id and dono_id = auth.uid() and ativo;

  if not found then raise exception 'Restaurante não encontrado ou sem permissão.'; end if;
  if length(trim(coalesce(p_nome, ''))) < 2 or length(p_nome) > 100 then
    raise exception 'Informe um nome válido para o pedido.';
  end if;
  if length(v_fone) < 10 or length(v_fone) > 13 then v_fone := '0000000000'; end if;
  if p_tipo_entrega not in ('Retirada', 'Entrega') then raise exception 'Escolha retirada ou entrega.'; end if;
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
    if v_qtd is null or v_qtd < 1 or v_qtd > 50 then raise exception 'Quantidade inválida.'; end if;
    select * into v_prod from public.produtos
    where id = (v_item ->> 'produto_id')::integer and empresa_id = v_emp.id and disponivel;
    if not found then raise exception 'Um produto não está disponível.'; end if;
    insert into public.itens_pedido (pedido_id, produto_id, nome_produto, quantidade, preco_unitario)
    values (v_pedido_id, v_prod.id, v_prod.nome, v_qtd, v_prod.preco);
    v_total := v_total + v_prod.preco * v_qtd;
  end loop;

  update public.pedidos set total = v_total where id = v_pedido_id;
  return v_pedido_id;
end;
$function$;

-- Uploaded menu images must also belong to an approved or subscribed account.
drop policy if exists menu_images_owner_insert on storage.objects;
drop policy if exists menu_images_owner_update on storage.objects;
drop policy if exists menu_images_owner_delete on storage.objects;
create policy menu_images_owner_insert on storage.objects
for insert to authenticated
with check (bucket_id='menu-images' and (storage.foldername(name))[1]=(auth.uid())::text and public.menuhub_user_has_access());
create policy menu_images_owner_update on storage.objects
for update to authenticated
using (bucket_id='menu-images' and (storage.foldername(name))[1]=(auth.uid())::text and public.menuhub_user_has_access())
with check (bucket_id='menu-images' and (storage.foldername(name))[1]=(auth.uid())::text and public.menuhub_user_has_access());
create policy menu_images_owner_delete on storage.objects
for delete to authenticated
using (bucket_id='menu-images' and (storage.foldername(name))[1]=(auth.uid())::text and public.menuhub_user_has_access());
