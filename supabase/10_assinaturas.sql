-- Menuhub: assinatura Pix e acessos gratuitos
-- Execute uma vez no Supabase: SQL Editor > New query > Run.
create table if not exists public.assinaturas (
 user_id uuid primary key references auth.users(id) on delete cascade,
 status text not null default 'inativa' check(status in ('ativa','inativa')),
 inicio_em timestamptz,
 expira_em timestamptz,
 mp_payment_id text,
 atualizado_em timestamptz not null default now()
);
create table if not exists public.pagamentos_assinatura (
 payment_id text primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 valor numeric(10,2) not null default 20 check(valor=20),
 status text not null default 'pending',
 processado boolean not null default false,
 processado_em timestamptz,
 criado_em timestamptz not null default now()
);
create table if not exists public.assinaturas_gratuitas (
 email text primary key,
 criado_em timestamptz not null default now()
);
alter table public.assinaturas enable row level security;
alter table public.pagamentos_assinatura enable row level security;
alter table public.assinaturas_gratuitas enable row level security;
revoke all on public.assinaturas from anon, authenticated;
revoke all on public.pagamentos_assinatura from anon, authenticated;
revoke all on public.assinaturas_gratuitas from anon, authenticated;
grant all on public.assinaturas to service_role;
grant all on public.pagamentos_assinatura to service_role;
grant all on public.assinaturas_gratuitas to service_role;
