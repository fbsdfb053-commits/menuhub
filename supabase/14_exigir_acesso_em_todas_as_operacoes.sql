-- Centraliza a regra de acesso ao painel e exige dono + aprovação/assinatura.
-- As policies permissivas do PostgreSQL combinam-se por OR; por isso, substituímos
-- as policies de dono existentes, em vez de simplesmente acrescentar uma nova.
create or replace function public.menuhub_user_has_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    exists (
      select 1
      from public.assinaturas_gratuitas g
      where lower(g.email) = lower(coalesce(auth.jwt()->>'email',''))
    )
    or exists (
      select 1
      from public.assinaturas s
      where s.user_id = auth.uid()
        and s.status = 'ativa'
        and s.expira_em > now()
    );
$function$;

-- Empresas: ler, criar, editar e excluir somente quando a conta tem acesso.
drop policy if exists dono_empresas_select on public.empresas;
drop policy if exists dono_empresas_insert on public.empresas;
drop policy if exists dono_empresas_update on public.empresas;
drop policy if exists dono_empresas_delete on public.empresas;
create policy empresas_owner_access_select on public.empresas
for select to authenticated
using (dono_id = auth.uid() and public.menuhub_user_has_access());
create policy empresas_owner_access_insert on public.empresas
for insert to authenticated
with check (dono_id = auth.uid() and public.menuhub_user_has_access());
create policy empresas_owner_access_update on public.empresas
for update to authenticated
using (dono_id = auth.uid() and public.menuhub_user_has_access())
with check (dono_id = auth.uid() and public.menuhub_user_has_access());
create policy empresas_owner_access_delete on public.empresas
for delete to authenticated
using (dono_id = auth.uid() and public.menuhub_user_has_access());

-- Substitui políticas antigas de proprietário, que de outra forma se combinariam por OR.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and policyname in (
        'dono_categorias_all','dono_grupos_complementos_all',
        'dono_opcoes_complementos_all','dono_produtos_all',
        'dono_produto_grupos_complementos_all',
        'dono_pedidos_select','dono_pedidos_update',
        'dono_itens_select','dono_itens_insert','dono_itens_delete',
        'comandas_owner_all','garcons_owner_all','itens_comanda_owner_all',
        'dono_whatsapp_bot_config_all'
      )
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Categorias e produtos.
create policy categorias_owner_access_all on public.categorias
for all to authenticated
using (exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=auth.uid()) and public.menuhub_user_has_access())
with check (exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=auth.uid()) and public.menuhub_user_has_access());

create policy grupos_complementos_owner_access_all on public.grupos_complementos
for all to authenticated
using (exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=auth.uid()) and public.menuhub_user_has_access())
with check (exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=auth.uid()) and public.menuhub_user_has_access());

create policy opcoes_complementos_owner_access_all on public.opcoes_complementos
for all to authenticated
using (exists(select 1 from public.grupos_complementos g join public.empresas e on e.id=g.empresa_id where g.id=grupo_id and e.dono_id=auth.uid()) and public.menuhub_user_has_access())
with check (exists(select 1 from public.grupos_complementos g join public.empresas e on e.id=g.empresa_id where g.id=grupo_id and e.dono_id=auth.uid()) and public.menuhub_user_has_access());

create policy produtos_owner_access_all on public.produtos
for all to authenticated
using (exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=auth.uid()) and public.menuhub_user_has_access())
with check (exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=auth.uid()) and public.menuhub_user_has_access());

create policy produto_grupos_complementos_owner_access_all on public.produto_grupos_complementos
for all to authenticated
using (exists(select 1 from public.produtos p join public.empresas e on e.id=p.empresa_id where p.id=produto_id and e.dono_id=auth.uid()) and public.menuhub_user_has_access())
with check (exists(select 1 from public.produtos p join public.empresas e on e.id=p.empresa_id where p.id=produto_id and e.dono_id=auth.uid()) and public.menuhub_user_has_access());

-- Pedidos: o dono só pode consultar/alterar pedidos do próprio estabelecimento com acesso.
create policy pedidos_owner_access_select on public.pedidos
for select to authenticated
using (exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=auth.uid()) and public.menuhub_user_has_access());
create policy pedidos_owner_access_update on public.pedidos
for update to authenticated
using (exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=auth.uid()) and public.menuhub_user_has_access())
with check (exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=auth.uid()) and public.menuhub_user_has_access());

create policy itens_pedido_owner_access_select on public.itens_pedido
for select to authenticated
using (exists(select 1 from public.pedidos pe join public.empresas e on e.id=pe.empresa_id where pe.id=pedido_id and e.dono_id=auth.uid()) and public.menuhub_user_has_access());
create policy itens_pedido_owner_access_insert on public.itens_pedido
for insert to authenticated
with check (exists(select 1 from public.pedidos pe join public.empresas e on e.id=pe.empresa_id where pe.id=pedido_id and e.dono_id=auth.uid()) and public.menuhub_user_has_access());
create policy itens_pedido_owner_access_delete on public.itens_pedido
for delete to authenticated
using (exists(select 1 from public.pedidos pe join public.empresas e on e.id=pe.empresa_id where pe.id=pedido_id and e.dono_id=auth.uid()) and public.menuhub_user_has_access());

-- Comandas, garçons, itens de comanda e configuração do bot.
create policy comandas_owner_access_all on public.comandas
for all to authenticated
using (exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=auth.uid()) and public.menuhub_user_has_access())
with check (exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=auth.uid()) and public.menuhub_user_has_access());

create policy garcons_owner_access_all on public.garcons
for all to authenticated
using (exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=auth.uid()) and public.menuhub_user_has_access())
with check (exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=auth.uid()) and public.menuhub_user_has_access());

create policy itens_comanda_owner_access_all on public.itens_comanda
for all to authenticated
using (exists(select 1 from public.comandas c join public.empresas e on e.id=c.empresa_id where c.id=comanda_id and e.dono_id=auth.uid()) and public.menuhub_user_has_access())
with check (exists(select 1 from public.comandas c join public.empresas e on e.id=c.empresa_id where c.id=comanda_id and e.dono_id=auth.uid()) and public.menuhub_user_has_access());

create policy whatsapp_bot_config_owner_access_all on public.whatsapp_bot_config
for all to authenticated
using (exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=auth.uid()) and public.menuhub_user_has_access())
with check (exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=auth.uid()) and public.menuhub_user_has_access());

-- Remover policies amplas adicionais, se existirem, para que não contornem o bloqueio.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname='public'
      and policyname='menuhub_access_gate'
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;
