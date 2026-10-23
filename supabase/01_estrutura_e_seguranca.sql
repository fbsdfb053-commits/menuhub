-- ============================================================================
-- FB3d2y Menu — estrutura do banco + segurança (RLS)
-- Cole este arquivo inteiro no Supabase: SQL Editor > New query > Run.
-- Pode rodar mais de uma vez sem estragar nada.
-- ============================================================================

-- 1) TABELAS -----------------------------------------------------------------

create table if not exists public.empresas (
  id serial primary key,
  nome varchar(255) not null,
  whatsapp_contato varchar(20),
  criado_em timestamptz default now()
);

create table if not exists public.produtos (
  id serial primary key,
  empresa_id int references public.empresas(id) on delete cascade,
  nome varchar(255) not null,
  preco decimal(10,2) not null,
  descricao text,
  imagem_url text,
  disponivel boolean default true,
  criado_em timestamptz default now()
);

create table if not exists public.pedidos (
  id serial primary key,
  empresa_id int references public.empresas(id) on delete cascade,
  cliente_nome varchar(255) not null,
  cliente_whatsapp varchar(20) not null,
  total decimal(10,2) not null,
  status varchar(50) default 'Novo',
  tipo_entrega varchar(50) not null,
  endereco_entrega text,
  criado_em timestamptz default now()
);

create table if not exists public.itens_pedido (
  id serial primary key,
  pedido_id int references public.pedidos(id) on delete cascade,
  produto_id int references public.produtos(id) on delete set null,
  quantidade int not null default 1,
  preco_unitario decimal(10,2) not null
);

-- 2) COLUNAS NOVAS (identidade do menu, dono, categorias) --------------------

alter table public.empresas add column if not exists slug text;
alter table public.empresas add column if not exists descricao text;
alter table public.empresas add column if not exists localizacao text;
alter table public.empresas add column if not exists horario text;
alter table public.empresas add column if not exists instagram text;
alter table public.empresas add column if not exists cor_destaque text default '#0e4f59';
alter table public.empresas add column if not exists logo_url text;
alter table public.empresas add column if not exists capa_url text;
alter table public.empresas add column if not exists dono_id uuid references auth.users(id) on delete set null;
alter table public.empresas add column if not exists ativo boolean not null default true;
alter table public.empresas add column if not exists aceita_pedidos boolean not null default true;

-- Restaurantes que já existiam ganham um endereço provisório (você troca depois)
update public.empresas set slug = 'restaurante-' || id where slug is null;

alter table public.empresas alter column slug set not null;
create unique index if not exists empresas_slug_unico on public.empresas (slug);
do $$ begin
  alter table public.empresas add constraint empresas_slug_formato check (slug ~ '^[a-z0-9-]{3,60}$');
exception when duplicate_object then null; end $$;

create table if not exists public.categorias (
  id serial primary key,
  empresa_id int not null references public.empresas(id) on delete cascade,
  nome varchar(100) not null,
  ordem int not null default 0,
  criado_em timestamptz default now()
);

alter table public.produtos add column if not exists categoria_id int references public.categorias(id) on delete set null;
alter table public.produtos add column if not exists ordem int not null default 0;
alter table public.itens_pedido add column if not exists nome_produto text;

create index if not exists produtos_empresa_idx on public.produtos (empresa_id);
create index if not exists categorias_empresa_idx on public.categorias (empresa_id);
create index if not exists pedidos_empresa_idx on public.pedidos (empresa_id, criado_em desc);

-- 3) SEGURANÇA (RLS) ----------------------------------------------------------
-- Regra geral: visitantes NÃO leem nem escrevem nas tabelas diretamente.
-- Eles só usam as duas funções da seção 4 (obter_menu e criar_pedido).
-- Donos logados só enxergam e mexem no que é deles.

alter table public.empresas     enable row level security;
alter table public.categorias   enable row level security;
alter table public.produtos     enable row level security;
alter table public.pedidos      enable row level security;
alter table public.itens_pedido enable row level security;

-- Limpa políticas antigas com os mesmos nomes (para poder rodar de novo)
drop policy if exists dono_empresas_select on public.empresas;
drop policy if exists dono_empresas_insert on public.empresas;
drop policy if exists dono_empresas_update on public.empresas;
drop policy if exists dono_empresas_delete on public.empresas;
drop policy if exists dono_categorias_all  on public.categorias;
drop policy if exists dono_produtos_all    on public.produtos;
drop policy if exists dono_pedidos_select  on public.pedidos;
drop policy if exists dono_pedidos_update  on public.pedidos;
drop policy if exists dono_itens_select    on public.itens_pedido;

create policy dono_empresas_select on public.empresas
  for select to authenticated using (dono_id = auth.uid());
create policy dono_empresas_insert on public.empresas
  for insert to authenticated with check (dono_id = auth.uid());
create policy dono_empresas_update on public.empresas
  for update to authenticated using (dono_id = auth.uid()) with check (dono_id = auth.uid());
create policy dono_empresas_delete on public.empresas
  for delete to authenticated using (dono_id = auth.uid());

create policy dono_categorias_all on public.categorias
  for all to authenticated
  using (exists (select 1 from public.empresas e where e.id = empresa_id and e.dono_id = auth.uid()))
  with check (exists (select 1 from public.empresas e where e.id = empresa_id and e.dono_id = auth.uid()));

create policy dono_produtos_all on public.produtos
  for all to authenticated
  using (exists (select 1 from public.empresas e where e.id = empresa_id and e.dono_id = auth.uid()))
  with check (exists (select 1 from public.empresas e where e.id = empresa_id and e.dono_id = auth.uid()));

create policy dono_pedidos_select on public.pedidos
  for select to authenticated
  using (exists (select 1 from public.empresas e where e.id = empresa_id and e.dono_id = auth.uid()));
create policy dono_pedidos_update on public.pedidos
  for update to authenticated
  using (exists (select 1 from public.empresas e where e.id = empresa_id and e.dono_id = auth.uid()))
  with check (exists (select 1 from public.empresas e where e.id = empresa_id and e.dono_id = auth.uid()));

create policy dono_itens_select on public.itens_pedido
  for select to authenticated
  using (exists (
    select 1 from public.pedidos p join public.empresas e on e.id = p.empresa_id
    where p.id = pedido_id and e.dono_id = auth.uid()
  ));

-- 4) FUNÇÕES PÚBLICAS (o que o cliente do menu pode fazer) --------------------

-- 4a) Devolve o menu de um restaurante pelo endereço (slug).
create or replace function public.obter_menu(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'empresa', jsonb_build_object(
      'id', e.id, 'nome', e.nome, 'slug', e.slug, 'descricao', e.descricao,
      'localizacao', e.localizacao, 'horario', e.horario, 'instagram', e.instagram,
      'cor_destaque', e.cor_destaque, 'logo_url', e.logo_url, 'capa_url', e.capa_url,
      'aceita_pedidos', e.aceita_pedidos
    ),
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome) order by c.ordem, c.id)
      from public.categorias c where c.empresa_id = e.id
    ), '[]'::jsonb),
    'produtos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'nome', p.nome, 'descricao', p.descricao, 'preco', p.preco,
        'imagem_url', p.imagem_url, 'categoria_id', p.categoria_id
      ) order by p.ordem, p.id)
      from public.produtos p where p.empresa_id = e.id and p.disponivel
    ), '[]'::jsonb)
  )
  from public.empresas e
  where e.slug = p_slug and e.ativo;
$$;

-- 4b) Cria um pedido. Os preços são lidos do banco (o cliente não consegue
--     alterar valores) e tudo é validado antes de gravar.
create or replace function public.criar_pedido(
  p_slug text,
  p_nome text,
  p_whatsapp text,
  p_tipo_entrega text,
  p_endereco text,
  p_itens jsonb
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
  v_qtd int;
  v_fone text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
  v_total numeric(10,2) := 0;
  v_pedido_id int;
begin
  select * into v_emp from public.empresas where slug = p_slug and ativo;
  if not found then raise exception 'Restaurante não encontrado.'; end if;
  if not v_emp.aceita_pedidos then raise exception 'Este restaurante não está aceitando pedidos agora.'; end if;

  if length(trim(coalesce(p_nome, ''))) < 2 or length(p_nome) > 100 then
    raise exception 'Informe seu nome.';
  end if;
  if length(v_fone) < 10 or length(v_fone) > 13 then
    raise exception 'Informe um WhatsApp válido com DDD.';
  end if;
  if p_tipo_entrega not in ('Retirada', 'Entrega') then
    raise exception 'Escolha retirada ou entrega.';
  end if;
  if p_tipo_entrega = 'Entrega' and length(trim(coalesce(p_endereco, ''))) < 5 then
    raise exception 'Informe o endereço de entrega.';
  end if;
  if length(coalesce(p_endereco, '')) > 300 then raise exception 'Endereço muito longo.'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array'
     or jsonb_array_length(p_itens) = 0 or jsonb_array_length(p_itens) > 50 then
    raise exception 'Seu carrinho está vazio.';
  end if;

  insert into public.pedidos (empresa_id, cliente_nome, cliente_whatsapp, total, status, tipo_entrega, endereco_entrega)
  values (v_emp.id, trim(p_nome), v_fone, 0, 'Novo', p_tipo_entrega,
          case when p_tipo_entrega = 'Entrega' then trim(p_endereco) else null end)
  returning id into v_pedido_id;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := (v_item ->> 'quantidade')::int;
    if v_qtd is null or v_qtd < 1 or v_qtd > 50 then
      raise exception 'Quantidade inválida.';
    end if;

    select * into v_prod from public.produtos
      where id = (v_item ->> 'produto_id')::int and empresa_id = v_emp.id and disponivel;
    if not found then
      raise exception 'Um dos produtos não está mais disponível. Atualize a página.';
    end if;

    insert into public.itens_pedido (pedido_id, produto_id, nome_produto, quantidade, preco_unitario)
    values (v_pedido_id, v_prod.id, v_prod.nome, v_qtd, v_prod.preco);

    v_total := v_total + v_prod.preco * v_qtd;
  end loop;

  update public.pedidos set total = v_total where id = v_pedido_id;
  return v_pedido_id;
end;
$$;

revoke all on function public.obter_menu(text) from public;
revoke all on function public.criar_pedido(text, text, text, text, text, jsonb) from public;
grant execute on function public.obter_menu(text) to anon, authenticated;
grant execute on function public.criar_pedido(text, text, text, text, text, jsonb) to anon, authenticated;
