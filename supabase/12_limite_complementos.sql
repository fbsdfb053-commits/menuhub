alter table public.grupos_complementos
  add column if not exists max_selecoes integer not null default 0;
alter table public.grupos_complementos
  drop constraint if exists grupos_complementos_max_selecoes_check;
alter table public.grupos_complementos
  add constraint grupos_complementos_max_selecoes_check
  check (max_selecoes >= 0 and max_selecoes <= 10);
notify pgrst, 'reload schema';