insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('customer-avatars', 'customer-avatars', true, 5242880, array['image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "customer avatars readable" on storage.objects;
create policy "customer avatars readable"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'customer-avatars');

drop policy if exists "customer avatars insertable" on storage.objects;
create policy "customer avatars insertable"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'customer-avatars');

drop policy if exists "customer avatars updatable" on storage.objects;
create policy "customer avatars updatable"
on storage.objects
for update
to authenticated
using (bucket_id = 'customer-avatars')
with check (bucket_id = 'customer-avatars');

drop policy if exists "customer avatars deletable" on storage.objects;
create policy "customer avatars deletable"
on storage.objects
for delete
to authenticated
using (bucket_id = 'customer-avatars');
