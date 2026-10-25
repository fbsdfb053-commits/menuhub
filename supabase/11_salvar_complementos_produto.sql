create or replace function public.definir_complementos_produto(p_produto_id integer, p_grupo_ids integer[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id integer;
begin
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
$$;

revoke all on function public.definir_complementos_produto(integer, integer[]) from public, anon;
grant execute on function public.definir_complementos_produto(integer, integer[]) to authenticated;
