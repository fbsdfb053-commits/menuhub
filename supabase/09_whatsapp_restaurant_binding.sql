-- Cada número de WhatsApp só pode ficar vinculado a um restaurante.
-- A tabela é privada: somente o servidor (service_role) consulta e altera os vínculos.
create table if not exists public.whatsapp_bot_connections (
  empresa_id integer primary key references public.empresas(id) on delete cascade,
  whatsapp_phone text not null,
  connected_at timestamptz not null default now(),
  constraint whatsapp_bot_connections_phone_unique unique (whatsapp_phone)
);

alter table public.whatsapp_bot_connections enable row level security;
revoke all on table public.whatsapp_bot_connections from anon, authenticated;
