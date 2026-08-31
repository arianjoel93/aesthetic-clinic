-- Close legacy anonymous reads and keep public access limited to non-sensitive branding.
drop policy if exists appointments_anon_select on public.appointments;
drop policy if exists notifications_anon_select on public.notifications;

drop policy if exists "Public branding read" on public.app_settings;
create policy "Public branding read"
on public.app_settings for select
to anon
using (key in ('company_name', 'app_theme'));

-- Preserve the canonical service relation while keeping display snapshots on historical appointments.
alter table public.appointments
  add column if not exists service_id uuid references public.services(id) on delete set null;

create index if not exists appointments_service_id_idx
  on public.appointments(service_id);

update public.appointments appointment
set service_id = service.id
from public.services service
where appointment.service_id is null
  and lower(service.name) = lower(
    case
      when nullif(trim(appointment.service_subtype), '') is null then trim(appointment.service)
      else trim(appointment.service) || ' - ' || trim(appointment.service_subtype)
    end
  );

update public.appointments appointment
set customer_id = customer.id
from public.customers customer
where appointment.customer_id is null
  and (
    (nullif(trim(appointment.customer_email), '') is not null and lower(customer.email) = lower(appointment.customer_email))
    or lower(customer.full_name) = lower(appointment.customer_name)
  );

update public.appointments appointment
set service_id = service.id
from public.services service
where appointment.service_id is null
  and translate(lower(trim(service.name)), 'áéíóúüñ', 'aeiouun')
      = translate(lower(trim(appointment.service)), 'áéíóúüñ', 'aeiouun');

-- Seen state is persisted so notification badges never reappear after a refresh.
alter table public.notifications
  add column if not exists seen_at timestamptz;

create index if not exists notifications_unseen_idx
  on public.notifications(created_at desc)
  where seen_at is null and read = false;

-- Administrator avatars are private and scoped to the authenticated user's folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('admin-avatars', 'admin-avatars', false, 5242880, array['image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admin avatar read" on storage.objects;
drop policy if exists "Admin avatar insert" on storage.objects;
drop policy if exists "Admin avatar update" on storage.objects;
drop policy if exists "Admin avatar delete" on storage.objects;

create policy "Admin avatar read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'admin-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Admin avatar insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'admin-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Admin avatar update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'admin-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'admin-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Admin avatar delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'admin-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
