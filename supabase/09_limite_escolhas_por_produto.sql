-- Atualização segura: adiciona o limite de escolhas sem recriar nem apagar tabelas.
alter table public.produto_grupos_complementos
  add column if not exists max_selecoes integer not null default 0
  check (max_selecoes >= 0);

create or replace function public.obter_menu(p_slug text)
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
  'empresa',jsonb_build_object('id',e.id,'nome',e.nome,'slug',e.slug,'descricao',e.descricao,'localizacao',e.localizacao,'horario',e.horario,'instagram',e.instagram,'cor_destaque',e.cor_destaque,'logo_url',e.logo_url,'capa_url',e.capa_url,'aceita_pedidos',e.aceita_pedidos),
  'categorias',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'nome',c.nome) order by c.ordem,c.id) from public.categorias c where c.empresa_id=e.id),'[]'::jsonb),
  'produtos',coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'nome',p.nome,'descricao',p.descricao,'preco',p.preco,'imagem_url',p.imagem_url,'categoria_id',p.categoria_id,
    'complementos',coalesce((select jsonb_agg(jsonb_build_object(
      'id',g.id,'nome',g.nome,'descricao',g.descricao,'max_selecoes',ppg.max_selecoes,
      'opcoes',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'nome',o.nome,'preco_adicional',o.preco_adicional) order by o.ordem,o.id)
        from public.opcoes_complementos o where o.grupo_id=g.id and o.ativo),'[]'::jsonb)
    ) order by g.ordem,g.id) from public.produto_grupos_complementos pg join public.grupos_complementos g on g.id=pg.grupo_id
      where pg.produto_id=p.id and g.ativo),'[]'::jsonb)
  ) order by p.ordem,p.id) from public.produtos p where p.empresa_id=e.id and p.disponivel),'[]'::jsonb)
 ) from public.empresas e where e.slug=p_slug and e.ativo;
$$;

revoke all on function public.obter_menu(text) from public;
grant execute on function public.obter_menu(text) to anon, authenticated;

create or replace function public.criar_pedido(
 p_slug text,p_nome text,p_whatsapp text,p_tipo_entrega text,p_endereco text,p_itens jsonb,
 p_forma_pagamento text,p_observacoes text,p_precisa_troco boolean,p_troco_para numeric
) returns integer language plpgsql security definer set search_path=public as $$
declare
 v_emp public.empresas%rowtype; v_prod public.produtos%rowtype; v_item jsonb; v_opt jsonb; v_option public.opcoes_complementos%rowtype;
 v_qtd int; v_fone text:=regexp_replace(coalesce(p_whatsapp,''),'\\D','','g'); v_total numeric(10,2):=0;
 v_pedido_id int; v_pagamento text:=trim(coalesce(p_forma_pagamento,'')); v_obs text:=trim(coalesce(p_observacoes,''));
 v_troco boolean:=coalesce(p_precisa_troco,false); v_extra numeric(10,2); v_names text; v_unit numeric(10,2);
begin
 select * into v_emp from public.empresas where slug=p_slug and ativo;
 if not found then raise exception 'Restaurante não encontrado.'; end if;
 if not v_emp.aceita_pedidos then raise exception 'Este restaurante não está aceitando pedidos agora.'; end if;
 if length(trim(coalesce(p_nome,'')))<2 or length(p_nome)>100 then raise exception 'Informe seu nome.'; end if;
 if length(v_fone)<10 or length(v_fone)>13 then raise exception 'Informe um WhatsApp válido com DDD.'; end if;
 if p_tipo_entrega not in ('Retirada','Entrega') then raise exception 'Escolha retirada ou entrega.'; end if;
 if p_tipo_entrega='Entrega' and length(trim(coalesce(p_endereco,'')))<5 then raise exception 'Informe o endereço de entrega.'; end if;
 if length(coalesce(p_endereco,''))>300 then raise exception 'Endereço muito longo.'; end if;
 if v_pagamento not in ('Pix','Dinheiro','Cartão de débito','Cartão de crédito') then raise exception 'Escolha uma forma de pagamento válida.'; end if;
 if length(v_obs)>500 then raise exception 'As observações devem ter no máximo 500 caracteres.'; end if;
 if v_troco and v_pagamento<>'Dinheiro' then raise exception 'Troco só pode ser solicitado para pagamento em dinheiro.'; end if;
 if v_troco and (p_troco_para is null or p_troco_para<=0) then raise exception 'Informe o valor para o qual precisa de troco.'; end if;
 if p_itens is null or jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens)=0 or jsonb_array_length(p_itens)>50 then raise exception 'Seu carrinho está vazio.'; end if;
 insert into public.pedidos(empresa_id,cliente_nome,cliente_whatsapp,total,status,tipo_entrega,endereco_entrega,forma_pagamento,observacoes,precisa_troco,troco_para)
 values(v_emp.id,trim(p_nome),v_fone,0,'Novo',p_tipo_entrega,case when p_tipo_entrega='Entrega' then trim(p_endereco) else null end,v_pagamento,nullif(v_obs,''),v_troco,case when v_troco then p_troco_para else null end)
 returning id into v_pedido_id;
 for v_item in select * from jsonb_array_elements(p_itens) loop
  v_qtd:=(v_item->>'quantidade')::int;
  if v_qtd is null or v_qtd<1 or v_qtd>50 then raise exception 'Quantidade inválida.'; end if;
  select * into v_prod from public.produtos where id=(v_item->>'produto_id')::int and empresa_id=v_emp.id and disponivel;
  if not found then raise exception 'Um dos produtos não está mais disponível. Atualize a página.'; end if;
  v_extra:=0; v_names:='';
  if jsonb_typeof(coalesce(v_item->'complementos','[]'::jsonb))<>'array' then raise exception 'Complementos inválidos.'; end if;
  if exists (
   select 1
   from jsonb_array_elements(coalesce(v_item->'complementos','[]'::jsonb)) chosen(value)
   join public.opcoes_complementos o on o.id=(chosen.value->>'id')::int
   join public.grupos_complementos g on g.id=o.grupo_id
   join public.produto_grupos_complementos pg on pg.grupo_id=g.id and pg.produto_id=v_prod.id
   where o.ativo and g.ativo and pg.max_selecoes>0
   group by g.id,pg.max_selecoes
   having count(*)>pg.max_selecoes
  ) then raise exception 'Você selecionou mais opções do que o permitido em um dos grupos.'; end if;
  for v_opt in select * from jsonb_array_elements(coalesce(v_item->'complementos','[]'::jsonb)) loop
   select o.* into v_option from public.opcoes_complementos o
    join public.grupos_complementos g on g.id=o.grupo_id
    join public.produto_grupos_complementos pg on pg.grupo_id=g.id and pg.produto_id=v_prod.id
    where o.id=(v_opt->>'id')::int and o.ativo and g.ativo and g.empresa_id=v_emp.id;
   if not found then raise exception 'Um complemento selecionado não pertence a este produto.'; end if;
   v_extra:=v_extra+v_option.preco_adicional;
   v_names:=concat_ws(', ',nullif(v_names,''),v_option.nome);
  end loop;
  v_unit:=v_prod.preco+v_extra;
  insert into public.itens_pedido(pedido_id,produto_id,nome_produto,quantidade,preco_unitario)
  values(v_pedido_id,v_prod.id,case when v_names<>'' then v_prod.nome||' ('||v_names||')' else v_prod.nome end,v_qtd,v_unit);
  v_total:=v_total+v_unit*v_qtd;
 end loop;
 update public.pedidos set total=v_total where id=v_pedido_id;
 return v_pedido_id;
end;
$$;

revoke all on function public.criar_pedido(text,text,text,text,text,jsonb,text,text,boolean,numeric) from public;
grant execute on function public.criar_pedido(text,text,text,text,text,jsonb,text,text,boolean,numeric) to anon,authenticated;
notify pgrst,'reload schema';
