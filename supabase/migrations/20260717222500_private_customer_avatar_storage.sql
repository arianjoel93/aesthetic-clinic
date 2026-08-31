insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('customer-avatars', 'customer-avatars', false, 5242880, array['image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "customer avatars readable" on storage.objects;
create policy "customer avatars readable"
on storage.objects
for select
to authenticated
using (bucket_id = 'customer-avatars' and (select auth.uid()) is not null);

drop policy if exists "customer avatars insertable" on storage.objects;
create policy "customer avatars insertable"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'customer-avatars' and (select auth.uid()) is not null);

drop policy if exists "customer avatars updatable" on storage.objects;
create policy "customer avatars updatable"
on storage.objects
for update
to authenticated
using (bucket_id = 'customer-avatars' and (select auth.uid()) is not null)
with check (bucket_id = 'customer-avatars' and (select auth.uid()) is not null);

drop policy if exists "customer avatars deletable" on storage.objects;
create policy "customer avatars deletable"
on storage.objects
for delete
to authenticated
using (bucket_id = 'customer-avatars' and (select auth.uid()) is not null);
