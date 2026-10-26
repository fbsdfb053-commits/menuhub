CREATE OR REPLACE FUNCTION public.obter_menu(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'empresa', jsonb_build_object(
      'id', e.id,
      'nome', e.nome,
      'slug', e.slug,
      'descricao', e.descricao,
      'localizacao', e.localizacao,
      'horario', e.horario,
      'telefone_contato', e.telefone_contato,
      'horario_funcionamento', e.horario_funcionamento,
      'status_loja_manual', e.status_loja_manual,
      'instagram', e.instagram,
      'whatsapp_contato', e.whatsapp_contato,
      'cor_destaque', e.cor_destaque,
      'logo_url', e.logo_url,
      'capa_url', e.capa_url,
      'aceita_pedidos', e.aceita_pedidos
    ),
    'categorias', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome) ORDER BY c.ordem, c.id)
      FROM public.categorias c
      WHERE c.empresa_id = e.id
    ), '[]'::jsonb),
    'produtos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'nome', p.nome,
        'descricao', p.descricao,
        'preco', p.preco,
        'imagem_url', p.imagem_url,
        'categoria_id', p.categoria_id,
        'complementos', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'id', g.id,
            'nome', g.nome,
            'descricao', g.descricao,
            'max_selecoes', pg.max_selecoes,
            'opcoes', coalesce((
              SELECT jsonb_agg(jsonb_build_object(
                'id', o.id,
                'nome', o.nome,
                'preco_adicional', o.preco_adicional
              ) ORDER BY o.ordem, o.id)
              FROM public.opcoes_complementos o
              WHERE o.grupo_id = g.id AND o.ativo
            ), '[]'::jsonb)
          ) ORDER BY g.ordem, g.id)
          FROM public.produto_grupos_complementos pg
          JOIN public.grupos_complementos g ON g.id = pg.grupo_id
          WHERE pg.produto_id = p.id AND g.ativo
        ), '[]'::jsonb)
      ) ORDER BY p.ordem, p.id)
      FROM public.produtos p
      WHERE p.empresa_id = e.id AND p.disponivel
    ), '[]'::jsonb)
  )
  FROM public.empresas e
  WHERE e.slug = p_slug AND e.ativo;
$function$;