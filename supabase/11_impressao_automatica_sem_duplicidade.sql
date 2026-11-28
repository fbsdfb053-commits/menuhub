-- Evita que duas abas ou computadores imprimam automaticamente o mesmo pedido.
create table if not exists public.fb3d2y_auto_print_claims (
  empresa_id integer not null,
  pedido_id integer not null,
  claimed_at timestamptz not null default now(),
  primary key (empresa_id, pedido_id)
);
alter table public.fb3d2y_auto_print_claims enable row level security;

create or replace function public.fb3d2y_claim_auto_print(p_empresa_id integer, p_pedido_id integer)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.menuhub_user_can_access_empresa(p_empresa_id) then return false; end if;
  if not exists (select 1 from public.pedidos p where p.id=p_pedido_id and p.empresa_id=p_empresa_id and lower(coalesce(p.status,''))='novo') then return false; end if;
  insert into public.fb3d2y_auto_print_claims(empresa_id,pedido_id) values(p_empresa_id,p_pedido_id)
  on conflict (empresa_id,pedido_id) do nothing;
  return found;
end; $$;

create or replace function public.fb3d2y_release_auto_print(p_empresa_id integer, p_pedido_id integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.menuhub_user_can_access_empresa(p_empresa_id) then raise exception 'Sem permissão para liberar impressão.'; end if;
  delete from public.fb3d2y_auto_print_claims where empresa_id=p_empresa_id and pedido_id=p_pedido_id;
end; $$;

revoke all on public.fb3d2y_auto_print_claims from anon, authenticated;
revoke all on function public.fb3d2y_claim_auto_print(integer,integer) from public, anon;
revoke all on function public.fb3d2y_release_auto_print(integer,integer) from public, anon;
grant execute on function public.fb3d2y_claim_auto_print(integer,integer) to authenticated;
grant execute on function public.fb3d2y_release_auto_print(integer,integer) to authenticated;
