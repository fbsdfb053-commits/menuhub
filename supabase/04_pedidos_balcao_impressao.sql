-- Execute no SQL Editor do Supabase do projeto de teste antes de usar Pedidos balcão.
-- A origem padrão dos pedidos existentes e novos será Menu digital.
alter table public.pedidos
  add column if not exists origem text not null default 'Menu digital',
  add column if not exists forma_pagamento text not null default 'A combinar';

update public.pedidos
set origem = 'Menu digital'
where origem is null or btrim(origem) = '';

update public.pedidos
set forma_pagamento = 'A combinar'
where forma_pagamento is null or btrim(forma_pagamento) = '';
