create or replace function public.obter_menu(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
 select jsonb_build_object(
  'empresa',jsonb_build_object('id',e.id,'nome',e.nome,'slug',e.slug,'descricao',e.descricao,'localizacao',e.localizacao,'horario',e.horario,'horario_funcionamento',e.horario_funcionamento,'status_loja_manual',e.status_loja_manual,'instagram',e.instagram,'whatsapp_contato',e.whatsapp_contato,'cor_destaque',e.cor_destaque,'logo_url',e.logo_url,'capa_url',e.capa_url,'aceita_pedidos',e.aceita_pedidos),
  'categorias',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'nome',c.nome) order by c.ordem,c.id) from public.categorias c where c.empresa_id=e.id),'[]'::jsonb),
  'produtos',coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'nome',p.nome,'descricao',p.descricao,'preco',p.preco,'imagem_url',p.imagem_url,'categoria_id',p.categoria_id,
    'complementos',coalesce((select jsonb_agg(jsonb_build_object(
      'id',g.id,'nome',g.nome,'descricao',g.descricao,'max_selecoes',g.max_selecoes,
      'opcoes',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'nome',o.nome,'preco_adicional',o.preco_adicional,'imagem_url',o.imagem_url) order by o.ordem,o.id)
        from public.opcoes_complementos o where o.grupo_id=g.id and o.ativo),'[]'::jsonb)
    ) order by g.ordem,g.id) from public.produto_grupos_complementos pg join public.grupos_complementos g on g.id=pg.grupo_id
      where pg.produto_id=p.id and g.ativo),'[]'::jsonb)
  ) order by p.ordem,p.id) from public.produtos p where p.empresa_id=e.id and p.disponivel),'[]'::jsonb)
 ) from public.empresas e where e.slug=p_slug and e.ativo;
$$;
revoke all on function public.obter_menu(text) from public;
grant execute on function public.obter_menu(text) to anon, authenticated;
