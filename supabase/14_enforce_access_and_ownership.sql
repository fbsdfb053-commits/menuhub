-- Enforce account access AND restaurant ownership for all management tables.
-- Generic access-only policies were permissive and could bypass ownership checks.
drop policy if exists menuhub_access_gate on public.empresas;
drop policy if exists menuhub_access_gate on public.categorias;
drop policy if exists menuhub_access_gate on public.produtos;
drop policy if exists menuhub_access_gate on public.grupos_complementos;
drop policy if exists menuhub_access_gate on public.opcoes_complementos;
drop policy if exists menuhub_access_gate on public.produto_grupos_complementos;
drop policy if exists menuhub_access_gate on public.pedidos;
drop policy if exists menuhub_access_gate on public.itens_pedido;
drop policy if exists menuhub_access_gate on public.comandas;
drop policy if exists menuhub_access_gate on public.itens_comanda;
drop policy if exists menuhub_access_gate on public.garcons;
drop policy if exists menuhub_access_gate on public.whatsapp_bot_config;

alter policy dono_empresas_select on public.empresas
  using (dono_id = auth.uid() and public.menuhub_user_has_access());
alter policy dono_empresas_insert on public.empresas
  with check (dono_id = auth.uid() and public.menuhub_user_has_access());
alter policy dono_empresas_update on public.empresas
  using (dono_id = auth.uid() and public.menuhub_user_has_access())
  with check (dono_id = auth.uid() and public.menuhub_user_has_access());
alter policy dono_empresas_delete on public.empresas
  using (dono_id = auth.uid() and public.menuhub_user_has_access());

alter policy dono_categorias_all on public.categorias
  using (public.menuhub_user_has_access() and exists(select 1 from public.empresas e where e.id = categorias.empresa_id and e.dono_id = auth.uid()))
  with check (public.menuhub_user_has_access() and exists(select 1 from public.empresas e where e.id = categorias.empresa_id and e.dono_id = auth.uid()));

alter policy dono_produtos_all on public.produtos
  using (public.menuhub_user_has_access() and exists(select 1 from public.empresas e where e.id = produtos.empresa_id and e.dono_id = auth.uid()))
  with check (public.menuhub_user_has_access() and exists(select 1 from public.empresas e where e.id = produtos.empresa_id and e.dono_id = auth.uid()));

alter policy dono_grupos_complementos_all on public.grupos_complementos
  using (public.menuhub_user_has_access() and exists(select 1 from public.empresas e where e.id = grupos_complementos.empresa_id and e.dono_id = auth.uid()))
  with check (public.menuhub_user_has_access() and exists(select 1 from public.empresas e where e.id = grupos_complementos.empresa_id and e.dono_id = auth.uid()));

alter policy dono_opcoes_complementos_all on public.opcoes_complementos
  using (public.menuhub_user_has_access() and exists(select 1 from public.grupos_complementos g join public.empresas e on e.id = g.empresa_id where g.id = opcoes_complementos.grupo_id and e.dono_id = auth.uid()))
  with check (public.menuhub_user_has_access() and exists(select 1 from public.grupos_complementos g join public.empresas e on e.id = g.empresa_id where g.id = opcoes_complementos.grupo_id and e.dono_id = auth.uid()));

alter policy dono_produto_grupos_complementos_all on public.produto_grupos_complementos
  using (public.menuhub_user_has_access() and exists(select 1 from public.produtos p join public.empresas e on e.id = p.empresa_id where p.id = produto_grupos_complementos.produto_id and e.dono_id = auth.uid()))
  with check (public.menuhub_user_has_access() and exists(select 1 from public.produtos p join public.empresas e on e.id = p.empresa_id where p.id = produto_grupos_complementos.produto_id and e.dono_id = auth.uid()));

alter policy dono_pedidos_select on public.pedidos
  using (public.menuhub_user_has_access() and exists(select 1 from public.empresas e where e.id = pedidos.empresa_id and e.dono_id = auth.uid()));
alter policy dono_pedidos_update on public.pedidos
  using (public.menuhub_user_has_access() and exists(select 1 from public.empresas e where e.id = pedidos.empresa_id and e.dono_id = auth.uid()))
  with check (public.menuhub_user_has_access() and exists(select 1 from public.empresas e where e.id = pedidos.empresa_id and e.dono_id = auth.uid()));

alter policy dono_itens_select on public.itens_pedido
  using (public.menuhub_user_has_access() and exists(select 1 from public.pedidos p join public.empresas e on e.id = p.empresa_id where p.id = itens_pedido.pedido_id and e.dono_id = auth.uid()));
alter policy dono_itens_insert on public.itens_pedido
  with check (public.menuhub_user_has_access() and exists(select 1 from public.pedidos p join public.empresas e on e.id = p.empresa_id where p.id = itens_pedido.pedido_id and e.dono_id = auth.uid()));
alter policy dono_itens_delete on public.itens_pedido
  using (public.menuhub_user_has_access() and exists(select 1 from public.pedidos p join public.empresas e on e.id = p.empresa_id where p.id = itens_pedido.pedido_id and e.dono_id = auth.uid()));

alter policy comandas_owner_all on public.comandas
  using (public.menuhub_user_has_access() and exists(select 1 from public.empresas e where e.id = comandas.empresa_id and e.dono_id = auth.uid()))
  with check (public.menuhub_user_has_access() and exists(select 1 from public.empresas e where e.id = comandas.empresa_id and e.dono_id = auth.uid()));

alter policy itens_comanda_owner_all on public.itens_comanda
  using (public.menuhub_user_has_access() and exists(select 1 from public.comandas c join public.empresas e on e.id = c.empresa_id where c.id = itens_comanda.comanda_id and e.dono_id = auth.uid()))
  with check (public.menuhub_user_has_access() and exists(select 1 from public.comandas c join public.empresas e on e.id = c.empresa_id where c.id = itens_comanda.comanda_id and e.dono_id = auth.uid()));

alter policy garcons_owner_all on public.garcons
  using (public.menuhub_user_has_access() and exists(select 1 from public.empresas e where e.id = garcons.empresa_id and e.dono_id = auth.uid()))
  with check (public.menuhub_user_has_access() and exists(select 1 from public.empresas e where e.id = garcons.empresa_id and e.dono_id = auth.uid()));

alter policy dono_whatsapp_bot_config_all on public.whatsapp_bot_config
  using (public.menuhub_user_has_access() and exists(select 1 from public.empresas e where e.id = whatsapp_bot_config.empresa_id and e.dono_id = auth.uid()))
  with check (public.menuhub_user_has_access() and exists(select 1 from public.empresas e where e.id = whatsapp_bot_config.empresa_id and e.dono_id = auth.uid()));
