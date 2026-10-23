-- ============================================================================
-- Dados de exemplo para TESTAR o menu (restaurante nº 1).
-- Rode depois do arquivo 01. Pode apagar tudo depois pelo painel.
-- ============================================================================

update public.empresas set
  nome = 'Yamamoto Sushibar',
  slug = 'yamamoto-sushibar',
  descricao = 'Sushi artesanal, combinado fresquinho e carinho em cada pedido.',
  localizacao = 'Centro · Mulungu',
  horario = 'Hoje, das 12h às 22h',
  instagram = '@yamamoto_sushibar',
  cor_destaque = '#b8794d'
where id = 1;

-- só cria categorias/produtos se o restaurante 1 ainda não tiver nenhum
do $$
declare c_combos int; c_temaki int; c_bebidas int; c_extras int;
begin
  if exists (select 1 from public.empresas where id = 1)
     and not exists (select 1 from public.categorias where empresa_id = 1) then

    insert into public.categorias (empresa_id, nome, ordem) values (1, 'Combinados', 1) returning id into c_combos;
    insert into public.categorias (empresa_id, nome, ordem) values (1, 'Temakis', 2)    returning id into c_temaki;
    insert into public.categorias (empresa_id, nome, ordem) values (1, 'Bebidas', 3)    returning id into c_bebidas;
    insert into public.categorias (empresa_id, nome, ordem) values (1, 'Extras', 4)     returning id into c_extras;

    insert into public.produtos (empresa_id, categoria_id, nome, descricao, preco, ordem) values
      (1, c_combos,  'Japinha',               '20 peças para compartilhar sem pressa.', 40,  1),
      (1, c_combos,  'Entusiasta',            '15 peças com salmão, kani e crocantes.', 30,  2),
      (1, c_combos,  'Samurai',               '30 peças para matar a vontade de sushi.', 60, 3),
      (1, c_combos,  'Hot ball',              '10 unidades quentinhas e crocantes.',    25,  4),
      (1, c_temaki,  'Temaki hot · Camarão',  'Camarão cremoso e toque picante.',       13,  5),
      (1, c_temaki,  'Temaki · Salmão',       'Salmão, arroz temperado e cebolinha.',   13,  6),
      (1, c_bebidas, 'Coca-Cola lata',        '350 ml bem gelada.',                      5,  7),
      (1, c_bebidas, 'Fanta Laranja',         '350 ml bem gelada.',                      5,  8),
      (1, c_extras,  'Molho tarê',            'Porção extra.',                         0.5,  9),
      (1, c_extras,  'Wasabi',                'Raiz forte para completar.',            0.5, 10);
  end if;
end $$;
