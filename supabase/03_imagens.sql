-- Execute no Supabase > SQL Editor > New query.
-- Fotos públicas dos cardápios; apenas o dono autenticado pode enviar/alterar/excluir.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-images', 'menu-images', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];

drop policy if exists "menu_images_owner_insert" on storage.objects;
drop policy if exists "menu_images_owner_update" on storage.objects;
drop policy if exists "menu_images_owner_delete" on storage.objects;

create policy "menu_images_owner_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'menu-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "menu_images_owner_update" on storage.objects
for update to authenticated
using (
  bucket_id = 'menu-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'menu-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "menu_images_owner_delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'menu-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
