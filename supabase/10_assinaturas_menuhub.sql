-- Menuhub billing: execute in Supabase SQL Editor on the intended project.
create table if not exists public.menuhub_assinaturas (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  vence_em timestamptz,
  atualizado_em timestamptz not null default now()
);
create table if not exists public.menuhub_acessos_gratis (
  email text primary key,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id) on delete set null,
  constraint menuhub_acessos_gratis_email_lower check (email = lower(trim(email)))
);
create table if not exists public.menuhub_pagamentos (
  pagamento_id text primary key,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  valor numeric(10,2) not null check (valor = 20.00),
  aprovado_em timestamptz not null default now()
);
alter table public.menuhub_assinaturas enable row level security;
alter table public.menuhub_acessos_gratis enable row level security;
alter table public.menuhub_pagamentos enable row level security;
revoke all on public.menuhub_assinaturas from anon, authenticated;
revoke all on public.menuhub_acessos_gratis from anon, authenticated;
revoke all on public.menuhub_pagamentos from anon, authenticated;
create or replace function public.menuhub_registrar_pagamento(p_pagamento_id text, p_usuario_id uuid, p_valor numeric)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_inserted integer;
begin
  if p_pagamento_id is null or p_pagamento_id = '' or p_usuario_id is null or p_valor <> 20.00 then
    raise exception 'Pagamento inválido.';
  end if;
  insert into public.menuhub_pagamentos(pagamento_id, usuario_id, valor)
  values (p_pagamento_id, p_usuario_id, p_valor)
  on conflict (pagamento_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return false; end if;
  insert into public.menuhub_assinaturas(usuario_id, vence_em, atualizado_em)
  values (p_usuario_id, now() + interval '30 days', now())
  on conflict (usuario_id) do update
  set vence_em = greatest(coalesce(menuhub_assinaturas.vence_em, now()), now()) + interval '30 days',
      atualizado_em = now();
  return true;
end;
$$;
revoke all on function public.menuhub_registrar_pagamento(text, uuid, numeric) from public, anon, authenticated;
grant execute on function public.menuhub_registrar_pagamento(text, uuid, numeric) to service_role;
