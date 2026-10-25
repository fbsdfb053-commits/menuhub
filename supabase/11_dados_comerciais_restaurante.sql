-- Dados comerciais editáveis do estabelecimento.
-- Idempotente: pode ser executado mais de uma vez sem apagar dados existentes.
alter table public.empresas
  add column if not exists cnpj text,
  add column if not exists endereco text,
  add column if not exists cep text,
  add column if not exists cidade text,
  add column if not exists estado text,
  add column if not exists email_contato text,
  add column if not exists telefone_contato text;

-- A política dono_empresas_update existente restringe a edição ao dono autenticado.
