# @buendia/db

Migrations, RLS policies, and (later) the schema provisioner for the
control-plane database.

## Applying migrations

Migrations are plain SQL files in [`migrations/`](./migrations), numbered and
applied in lexical order. There is no Buendia-specific migration runner;
apply them by piping into `psql` against the control-plane Supabase project,
or paste them into the Supabase SQL editor.

```bash
export DATABASE_URL="postgres://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
for f in packages/db/migrations/*.sql; do
  echo "Applying $f"
  psql "$DATABASE_URL" -f "$f"
done
```

In Supabase's dashboard: SQL editor → New query → paste the file → Run.

## What lives where

| Concern                    | Path                        | Ticket         |
| -------------------------- | --------------------------- | -------------- |
| Control-plane tables, RLS  | `migrations/000N_*.sql`     | 01, 12, 30, 60 |
| Schema provisioner (DDL)   | `src/schema-provisioner.ts` | 21             |
| Credential envelope crypto | `src/credentials.ts`        | 12             |
| Audit log helper           | `src/audit.ts`              | 60             |

Only `migrations/` exists in this commit. The rest land with their tickets.
