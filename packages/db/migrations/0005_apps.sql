-- 0005_apps.sql
-- The control-plane registry of every Buendia app: who owns it, what slug
-- it resolves to, where the HTML blob is stored, and which schema in the
-- owner's backend it should be wired to once the schema provisioner
-- (ticket 21) runs.
--
-- See backlog/done/20-html-upload.md and decisions/0005-html-storage.md.

create table public.apps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  slug text not null unique,
  name text not null,
  schema_name text not null,
  team_id uuid not null default gen_random_uuid(),
  html_storage_path text not null,
  current_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, schema_name)
);

create index apps_owner_id_idx on public.apps (owner_id);

create table public.app_versions (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete cascade,
  version int not null,
  html_storage_path text not null,
  schema_sql text,
  created_at timestamptz not null default now(),
  unique (app_id, version)
);

create index app_versions_app_id_idx on public.app_versions (app_id);

alter table public.apps enable row level security;
alter table public.app_versions enable row level security;

-- Owners manage their own apps. Sharing (ticket 30) will widen reads via a
-- new policy keyed off app_shares; that lands separately.
create policy "owner reads own apps"
  on public.apps for select
  using (auth.uid() = owner_id);

create policy "owner inserts own apps"
  on public.apps for insert
  with check (auth.uid() = owner_id);

create policy "owner updates own apps"
  on public.apps for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "owner deletes own apps"
  on public.apps for delete
  using (auth.uid() = owner_id);

create policy "owner reads own app versions"
  on public.app_versions for select
  using (
    exists (
      select 1 from public.apps a
      where a.id = app_versions.app_id and a.owner_id = auth.uid()
    )
  );

create policy "owner inserts own app versions"
  on public.app_versions for insert
  with check (
    exists (
      select 1 from public.apps a
      where a.id = app_versions.app_id and a.owner_id = auth.uid()
    )
  );

-- HTML blobs live in a private Supabase Storage bucket on the control
-- plane, keyed by user folder so RLS can scope reads + writes to the owner.
insert into storage.buckets (id, name, public)
values ('app-html', 'app-html', false)
on conflict (id) do nothing;

create policy "owner reads own html"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'app-html'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "owner uploads own html"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'app-html'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "owner deletes own html"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'app-html'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
