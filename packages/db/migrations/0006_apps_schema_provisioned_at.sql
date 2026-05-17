-- 0006_apps_schema_provisioned_at.sql
-- Track when the schema provisioner (ticket 21) ran successfully against
-- an app's schema in the owner's Supabase project. NULL means "not yet
-- provisioned" — the dashboard surfaces a Provision button.
--
-- See backlog/done/21-schema-provisioner.md.

alter table public.apps
  add column if not exists schema_provisioned_at timestamptz;
