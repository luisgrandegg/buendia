# Buendía — MVP Specification

> Self-hostable, open-source personal knowledge assistant. Capture links (articles, YouTube videos, etc.), let AI summarize and tag them, browse them by topic, and get smart suggestions on when to revisit.

**Status:** MVP spec, ready for implementation.
**Project name:** Buendía (display) / `buendia` (code, package names, URLs — no accent for portability).
**Name origin:** *buen día* — the daily ritual of opening your second brain. Also a nod to the Buendía family in *Cien años de soledad*: generations of accumulated memory, knowledge moving through time.
**License intent:** AGPL-3.0 (protects the SaaS use case for an open-source service).

---

## 1. Vision

A "second brain" that's:

- **Yours.** Self-hostable end-to-end. No mandatory third-party services.
- **Provider-agnostic.** Bring your own LLM key (Gemini free tier, Anthropic, OpenAI, OpenRouter, local via Ollama).
- **Active, not passive.** Doesn't just store — surfaces things at the right time.
- **Open.** AGPL, vanilla web stack, no proprietary lock-in.

A user drops in a URL (article, YouTube video) via web, browser extension, or share sheet. The system extracts content, summarizes it, suggests tags, embeds it for semantic search, and queues it for resurfacing. The user browses by tag tree, searches semantically, and receives a weekly digest of things to revisit.

---

## 2. Goals & Non-Goals

### MVP Goals

1. Capture URLs (articles + YouTube) with one click from anywhere
2. AI-powered summary + auto-tagging on every captured item
3. Searchable, taggable inbox with semantic search
4. Pluggable LLM provider with BYOK (Bring Your Own Key)
5. Weekly digest email surfacing 3 items worth revisiting
6. Self-hostable: single `docker compose up` brings everything online
7. Works with both vanilla Postgres and Supabase

### Non-Goals (MVP)

- Mobile native app (PWA + Web Share Target API is enough)
- Knowledge graph visualization (premature without ~100+ items)
- Multi-user teams / sharing (single-user accounts only)
- Highlighting / annotation (read-it-later territory; defer)
- RAG chat over your library (post-MVP — the embeddings are there, the UI is the work)
- Paywall bypass (Readability handles ~80%; the rest defer)

---

## 3. Tech Stack

| Concern | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript strict | Mainstream, deployable anywhere |
| ORM | Drizzle ORM | Lightweight, edge-friendly, great pgvector support |
| DB | Postgres 16+ with `pgvector` | Works vanilla or via Supabase — same connection string |
| Auth | Better Auth | Self-contained, no external services, email/password + OAuth optional |
| LLM | Vercel AI SDK + provider packages | Unified interface across providers |
| Job queue | `pg-boss` | Postgres-backed, no Redis needed |
| Browser extension | WXT | Vite-based, modern DX, Chrome + Firefox |
| UI | Tailwind v4 + shadcn/ui | Standard, customizable |
| Validation | Zod | Pairs with AI SDK structured outputs |
| Email (digest) | nodemailer + user-supplied SMTP | No vendor lock-in; users point at any SMTP |
| Containerization | Docker + docker-compose | One-command local + self-host |

### Why these choices

- **Drizzle over Prisma:** lighter, no separate engine, better TS inference, native `pgvector` types via `drizzle-orm/pg-core`.
- **Better Auth over NextAuth:** zero external dependencies; runs entirely on your Postgres.
- **pg-boss over BullMQ/Inngest:** no Redis, no SaaS — uses the Postgres you already have.
- **Postgres + pgvector over dedicated vector DB:** simplifies ops; performance is more than enough at MVP scale.

---

## 4. Architecture

```
┌─────────────────────┐     ┌──────────────────────┐
│  Browser Extension  │────▶│                      │
│      (WXT)          │     │   Next.js App        │
└─────────────────────┘     │   - /api/capture     │
┌─────────────────────┐     │   - /api/items       │
│   Web App (PWA)     │────▶│   - /api/search      │
│  + Web Share Target │     │   - /api/settings    │
└─────────────────────┘     │   - UI routes        │
                            └──────────┬───────────┘
                                       │
                                       ▼
                            ┌──────────────────────┐
                            │   Postgres + pgvector│◀──┐
                            │   - items, tags,     │   │
                            │     embeddings,      │   │
                            │     pgboss.* tables  │   │
                            └──────────┬───────────┘   │
                                       │               │
                                       ▼               │
                            ┌──────────────────────┐   │
                            │   Worker process     │   │
                            │   (pg-boss consumer) │───┘
                            │   - extract content  │
                            │   - summarize/tag    │
                            │   - embed chunks     │
                            └──────────┬───────────┘
                                       │
                                       ▼
                            ┌──────────────────────┐
                            │   LLM Provider       │
                            │   (user-configured)  │
                            └──────────────────────┘
```

Two long-running processes: `web` (Next.js) and `worker` (pg-boss consumer). Both connect to the same Postgres. Both use the same provider config from DB.

---

## 5. Data Model

Drizzle schema sketch — full implementation in `db/schema.ts`.

```ts
// users (Better Auth manages base columns; extend as needed)
users {
  id: uuid pk
  email: text unique
  created_at: timestamptz
}

// LLM provider configuration per user
provider_configs {
  user_id: uuid fk
  provider: text  // 'anthropic' | 'google' | 'openai' | 'openrouter' | 'ollama'
  encrypted_api_key: text  // AES-256-GCM, key from APP_SECRET
  chat_model: text         // e.g. 'gemini-2.5-flash'
  embedding_model: text    // e.g. 'text-embedding-004'
  embedding_dim: integer   // 768 or 1536, locks the embeddings table
  base_url: text nullable  // for ollama / openai-compatible endpoints
  is_active: boolean
  created_at: timestamptz
  primary key (user_id, provider)
}

// Captured items
items {
  id: uuid pk
  user_id: uuid fk
  url: text
  canonical_url: text
  title: text
  source_type: text  // 'article' | 'youtube' | 'other'
  raw_content: text  // full extracted text or transcript
  metadata: jsonb    // { author, published_at, duration, channel, ... }
  status: text       // 'pending' | 'processing' | 'ready' | 'failed'
  error: text nullable
  captured_at: timestamptz
  processed_at: timestamptz nullable
  unique (user_id, canonical_url)
}

// AI-generated summaries (one per item)
summaries {
  item_id: uuid pk fk
  tldr: text
  key_points: text[]
  reading_time_minutes: integer
  generated_by: text  // model used
  generated_at: timestamptz
}

// Tag tree (hierarchical)
tags {
  id: uuid pk
  user_id: uuid fk
  parent_id: uuid nullable fk -> tags.id
  name: text
  slug: text
  source: text  // 'user' | 'ai'
  unique (user_id, parent_id, slug)
}

item_tags {
  item_id: uuid fk
  tag_id: uuid fk
  confidence: real  // 0-1, AI confidence
  primary key (item_id, tag_id)
}

// Embeddings: one row per chunk for retrieval
embeddings {
  id: uuid pk
  item_id: uuid fk
  user_id: uuid fk  // denormalized for filter performance
  chunk_index: integer
  text: text
  embedding: vector(EMBEDDING_DIM)  // see note below
  created_at: timestamptz
}
// Index: HNSW on embedding (cosine distance)

// Resurfacing schedule
revisits {
  item_id: uuid pk fk
  due_at: timestamptz
  score: real        // priority for next digest
  last_shown_at: timestamptz nullable
  shown_count: integer default 0
  dismissed: boolean default false
}
```

### Embedding dimension caveat

Different providers use different embedding dimensions (Gemini `text-embedding-004` → 768, OpenAI `text-embedding-3-small` → 1536). The `vector(N)` column type fixes the dimension at table-creation time.

**MVP approach:** standardize on **768** for v1 (Gemini compatible, smaller index), and refuse to switch *embedding* providers in settings unless the dimension matches. Show a clear warning + "re-embed all items" action when changing. Document this in settings UI.

Post-MVP: per-provider embeddings tables, or use OpenAI's `dimensions` parameter to truncate to a common size.

---

## 6. LLM Provider Abstraction

The thing that makes the project useful: any user can plug in any provider via Vercel AI SDK.

### Supported providers (MVP)

| Provider | Chat models | Embedding models | Notes |
|---|---|---|---|
| Google | `gemini-2.5-flash`, `gemini-2.5-pro` | `text-embedding-004` | **Default.** Free tier. |
| Anthropic | `claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-opus-4-7` | — (use Google or OpenAI for embeds) | Best quality |
| OpenAI | `gpt-4o-mini`, `gpt-4o` | `text-embedding-3-small`, `text-embedding-3-large` | |
| OpenRouter | (any model) | (limited) | Meta-provider |
| Ollama | (any local) | `nomic-embed-text`, etc. | Self-host, OpenAI-compatible API |

### Implementation: `lib/ai/providers.ts`

```ts
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { LanguageModel, EmbeddingModel } from 'ai'

export type ProviderId =
  | 'anthropic'
  | 'google'
  | 'openai'
  | 'openrouter'
  | 'ollama'

export type ProviderConfig = {
  provider: ProviderId
  apiKey: string
  chatModel: string
  embeddingModel: string | null
  baseUrl?: string
}

export function getChatModel(c: ProviderConfig): LanguageModel {
  switch (c.provider) {
    case 'anthropic':
      return createAnthropic({ apiKey: c.apiKey })(c.chatModel)
    case 'google':
      return createGoogleGenerativeAI({ apiKey: c.apiKey })(c.chatModel)
    case 'openai':
      return createOpenAI({ apiKey: c.apiKey, baseURL: c.baseUrl })(c.chatModel)
    case 'openrouter':
      return createOpenRouter({ apiKey: c.apiKey })(c.chatModel)
    case 'ollama':
      // Ollama exposes an OpenAI-compatible endpoint
      return createOpenAI({
        apiKey: c.apiKey || 'ollama',
        baseURL: c.baseUrl || 'http://localhost:11434/v1',
      })(c.chatModel)
  }
}

export function getEmbeddingModel(c: ProviderConfig): EmbeddingModel<string> {
  if (!c.embeddingModel) {
    throw new Error(`No embedding model configured for ${c.provider}`)
  }
  switch (c.provider) {
    case 'google':
      return createGoogleGenerativeAI({ apiKey: c.apiKey })
        .textEmbeddingModel(c.embeddingModel)
    case 'openai':
      return createOpenAI({ apiKey: c.apiKey, baseURL: c.baseUrl })
        .textEmbeddingModel(c.embeddingModel)
    case 'ollama':
      return createOpenAI({
        apiKey: c.apiKey || 'ollama',
        baseURL: c.baseUrl || 'http://localhost:11434/v1',
      }).textEmbeddingModel(c.embeddingModel)
    case 'anthropic':
    case 'openrouter':
      throw new Error(
        `${c.provider} does not provide embeddings — configure a separate embedding provider`,
      )
  }
}
```

### BYOK encryption: `lib/crypto.ts`

```ts
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const KEY = scryptSync(process.env.APP_SECRET!, 'buendia-byok', 32)

export function encryptKey(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, KEY, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptKey(payload: string): string {
  const buf = Buffer.from(payload, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const enc = buf.subarray(28)
  const decipher = createDecipheriv(ALGO, KEY, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}
```

API keys never leave the server. The settings UI accepts the key, posts to `/api/settings/provider`, server encrypts and stores. On read (worker), decrypt just-in-time, hold in memory only for the duration of the call.

---

## 7. Core MVP Features

### 7.1 Capture

- **Web form** at `/capture` — paste URL, optional title override, save.
- **Browser extension** — toolbar button captures current tab; supports text-selection capture (saves selection as note attached to item).
- **PWA Web Share Target** — registered in manifest so mobile share sheet sends URLs to `/capture/share`.

`POST /api/capture`:
```ts
// Request
{ url: string, title?: string, note?: string }
// Response (202)
{ itemId: string, status: 'pending' }
```

Server: dedupe on `(user_id, canonical_url)`, insert `items` row, enqueue `process-item` job, return.

### 7.2 Process pipeline (worker)

Job: `process-item`, payload `{ itemId }`. Steps:

1. **Fetch + extract**
   - Article: `fetch` HTML → `@mozilla/readability` (run in jsdom) → markdown via `turndown`
   - YouTube: detect `youtube.com` / `youtu.be` → fetch transcript via `youtube-transcript-plus` → metadata via oEmbed endpoint
   - Failure → `status='failed'`, log error, do not retry indefinitely
2. **Chunk** content (~500 tokens per chunk, 50 token overlap)
3. **Embed** chunks via `embedMany({ model: getEmbeddingModel(cfg), values })`
4. **Summarize + tag** in one call via `generateObject` with Zod schema:
   ```ts
   z.object({
     tldr: z.string().max(500),
     keyPoints: z.array(z.string()).max(7),
     readingTimeMinutes: z.number().int(),
     suggestedTags: z.array(z.object({
       path: z.array(z.string()).max(3),  // ["Tech", "AI", "RAG"]
       confidence: z.number().min(0).max(1),
     })).max(5),
   })
   ```
5. **Persist** summary, embeddings, ensure tag tree exists, link `item_tags`
6. **Schedule revisit:** insert `revisits` row with `due_at = now() + 7 days`
7. **Update item** `status='ready'`, `processed_at=now()`

### 7.3 Browse & search

- `/inbox` — paginated list of items, newest first, filter by status/tag
- `/tags` — tree view of tags with counts; clicking drills into items
- `/search` — semantic + keyword hybrid:
  ```sql
  SELECT i.*, ts_rank(...) + (1 - (e.embedding <=> $1)) AS score
  FROM items i JOIN embeddings e ON ...
  ORDER BY score DESC LIMIT 20
  ```
- `/items/:id` — detail view: TL;DR, key points, full extracted content, tags (editable), original URL, revisit controls

### 7.4 Resurfacing (MVP: weekly digest)

A scheduled pg-boss job runs every Monday 09:00 user-local time:

1. Query `revisits` where `due_at <= now()` and `dismissed = false`
2. Score = `recency_decay(captured_at) * tag_relevance(recent_activity)` — start with simple `time-since-captured` heuristic, refine later
3. Pick top 3 per user
4. Render email via React Email + send via configured SMTP
5. Update `last_shown_at`, `shown_count`, push `due_at += 14 days`

User actions in email: "I read it" (mark dismissed), "Remind me later" (push +14 days), "Not interested" (dismissed permanently).

### 7.5 Settings

- `/settings/provider` — provider picker, model selectors (populated from a small static JSON of known model IDs per provider), API key input (write-only), test-connection button
- `/settings/digest` — SMTP config, day/time of week, on/off toggle
- `/settings/account` — email change, password change, export-all-data (JSON download), delete account

---

## 8. Project Structure

```
buendia/
├── apps/
│   ├── web/                      # Next.js 15 app
│   │   ├── app/
│   │   │   ├── (auth)/login, signup
│   │   │   ├── (app)/inbox, tags, search, items/[id], settings
│   │   │   ├── api/
│   │   │   │   ├── capture/route.ts
│   │   │   │   ├── items/...
│   │   │   │   ├── search/route.ts
│   │   │   │   └── settings/provider/route.ts
│   │   │   └── layout.tsx
│   │   ├── components/ui/        # shadcn
│   │   ├── components/...
│   │   └── lib/
│   ├── worker/                   # pg-boss consumer process
│   │   ├── src/index.ts
│   │   └── src/jobs/
│   │       ├── process-item.ts
│   │       └── weekly-digest.ts
│   └── extension/                # WXT browser extension
│       ├── entrypoints/
│       │   ├── popup/
│       │   └── background.ts
│       └── wxt.config.ts
├── packages/
│   ├── db/                       # Drizzle schema + migrations
│   │   ├── schema.ts
│   │   ├── migrations/
│   │   └── client.ts
│   ├── ai/                       # provider abstraction + pipeline pieces
│   │   ├── providers.ts
│   │   ├── extract.ts            # readability + youtube transcript
│   │   ├── chunk.ts
│   │   └── prompts.ts
│   └── shared/                   # zod schemas, types shared by web + worker + ext
├── docker-compose.yml
├── docker-compose.dev.yml
├── Dockerfile.web
├── Dockerfile.worker
├── .env.example
├── README.md
├── LICENSE                       # AGPL-3.0
└── pnpm-workspace.yaml
```

Monorepo via pnpm workspaces. Web and worker share `packages/db`, `packages/ai`, `packages/shared`.

---

## 9. Implementation Phases

Each phase ends with a working, demo-able state. Claude Code should treat phases as discrete PRs.

### Phase 0 — Scaffold (foundations)
- pnpm monorepo, TS strict, eslint, prettier
- Next.js app shell, Tailwind v4 + shadcn init
- `packages/db` with Drizzle, initial migration creating `users`, `provider_configs`, `items`, `summaries`, `tags`, `item_tags`, `embeddings`, `revisits`, `pgvector` extension
- docker-compose with Postgres 16 + pgvector image (`pgvector/pgvector:pg16`)
- `.env.example` documenting `DATABASE_URL`, `APP_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
- README quickstart

**Done when:** `docker compose up` boots Postgres; `pnpm dev` boots web; migrations run cleanly.

### Phase 1 — Auth + capture
- Better Auth wired up with email/password + session cookies
- `/login`, `/signup`, `/logout` pages
- `/api/capture` endpoint (auth-required), inserts `items` rows
- `/inbox` page lists items for current user (no processing yet — items stay `pending`)
- Basic UI with shadcn

**Done when:** user can sign up, paste a URL, see it in inbox.

### Phase 2 — Worker + AI pipeline
- `apps/worker` package, pg-boss bootstrap on shared DB
- `process-item` job: extract → chunk → embed → summarize+tag → persist
- Provider abstraction (`packages/ai/providers.ts`) + BYOK encryption
- `/settings/provider` page with provider/model/key form, test-connection
- Default config (env-level fallback): Gemini free tier
- Item detail page shows TL;DR, key points, tags

**Done when:** item goes from `pending` → `ready` automatically; user can switch provider in settings and re-process.

### Phase 3 — Browse & search
- Tag tree page with counts
- Hybrid search route (`pg_trgm` + pgvector cosine), search UI
- Item detail page edit-tags affordance, revisit-now/snooze controls
- Inbox filters (status, tag)

**Done when:** user with ~20 items can find anything by keyword, semantic query, or tag.

### Phase 4 — Resurfacing & digest
- `revisits` scheduling logic at process-item completion
- `weekly-digest` cron job in worker
- React Email templates
- SMTP config in `/settings/digest`
- Email action endpoints (`/r/dismiss/:token`, `/r/snooze/:token`) — signed tokens, no auth required from email

**Done when:** test SMTP delivery shows a digest with 3 items and working action links.

### Phase 5 — Browser extension
- WXT scaffold (Chrome MV3 + Firefox)
- Popup with "Save this page" + optional note + tag suggestions
- Auth via API token issued from web (`/settings/extension`)
- Build artifacts published in repo releases

**Done when:** loading the unpacked extension in Chrome captures the active tab to logged-in account.

### Phase 6 — Polish & ship
- PWA manifest with Web Share Target
- Export all data (JSON), delete account (cascade)
- Rate limiting on `/api/capture`
- Production Dockerfiles, multi-arch
- CI: GitHub Actions running lint, typecheck, drizzle migration check
- Deploy guide for: bare VPS (docker compose), Railway, Fly.io, self-hosted Coolify

**Done when:** someone can clone the repo, `cp .env.example .env`, fill 3 vars, `docker compose up -d`, and have a working instance.

---

## 10. Configuration

### Required env vars

```bash
# Postgres (Supabase: copy the connection pooler string from project settings)
DATABASE_URL=postgresql://user:pass@host:5432/buendia

# 32+ char random string; rotate carefully (re-encrypts all stored API keys)
APP_SECRET=...

# Better Auth
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=http://localhost:3000

# Worker
WORKER_CONCURRENCY=4
```

### Optional env vars

```bash
# Default provider for new users (also used for "system" features if any)
DEFAULT_PROVIDER=google
DEFAULT_CHAT_MODEL=gemini-2.5-flash
DEFAULT_EMBEDDING_MODEL=text-embedding-004
DEFAULT_EMBEDDING_DIM=768

# If you want a globally-shared fallback key (single-user deployments)
SYSTEM_PROVIDER_API_KEY=

# SMTP for digests (per-user override available in settings)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM="Buendía <noreply@example.com>"
```

### Supabase compatibility

Because Supabase is just managed Postgres + auth + storage:

- **Database:** point `DATABASE_URL` at Supabase's pooler. `pgvector` is enabled by default in new Supabase projects (verify with `create extension if not exists vector`).
- **Auth:** ignore Supabase Auth — Buendía uses Better Auth, which writes to its own tables in the same DB.
- **Storage:** not needed in MVP.

The migrations and queries are identical for vanilla Postgres and Supabase.

---

## 11. Open Source Considerations

- **License:** AGPL-3.0. Anyone can self-host or modify; running it as a public service requires sharing modifications.
- **Contribution:** standard GitHub flow, `CONTRIBUTING.md`, DCO sign-off, no CLA.
- **Community:** GitHub Discussions for now; defer Discord.
- **Branding:** project name, logo, marketing copy live in a separate `/branding` directory and are MIT — anyone can fork and rebrand without dragging the trademarks.
- **Telemetry:** **none** in MVP. If added later, must be opt-in and documented.
- **Funding/sustainability:** not an MVP concern. Once usable, options are GitHub Sponsors, a hosted version (with the AGPL guaranteeing the open version stays in lockstep), or grants.

---

## 12. Out of Scope (MVP)

Defer with prejudice:

- Knowledge graph visualization
- RAG chat interface
- Highlighting / annotations
- Read-it-later "reader mode" UI (just show extracted content as markdown)
- Native mobile apps
- Team / multi-user accounts
- OAuth providers in auth (email/password only — OAuth is a config addition later)
- Third-party integrations (Readwise import, Pocket import) — backlog
- Paywall bypass
- LLM cost tracking / quotas

---

## 13. Post-MVP Roadmap

In rough priority order:

1. **RAG chat** over the user's library — "What did I save about React Server Components?"
2. **Knowledge tree v2** — hybrid clustering: user seeds top buckets, LLM proposes sub-buckets as items accumulate, user approves/merges
3. **Highlights & annotations** — Readwise-style passage capture with linked notes
4. **Smart resurfacing v2** — context-aware (calendar / active repo / current chat)
5. **Read-it-later reader UI** with typography controls
6. **Native iOS share extension** (the PWA Share Target gets you ~80% there but iOS Safari is fiddly)
7. **Multi-user / sharing** — shared collections, team plans
8. **Plugins** — extension API for custom extractors (e.g. Twitter/X, Mastodon, Bluesky, Substack)
9. **Local-first sync** — CRDT-backed offline mode

---

## 14. Quickstart for Claude Code

When picking this up:

1. Read this entire spec end-to-end before writing code.
2. Start with **Phase 0**, finish it completely, get sign-off, then proceed.
3. Don't skip ahead. Each phase's "Done when" is a hard gate.
4. When in doubt about a tech choice, prefer the choice in §3. When in doubt about scope, prefer to defer to §13.
5. Open questions (anything not covered here) get raised before implementation, not after.
6. Every PR includes: passing `pnpm typecheck`, passing `pnpm lint`, updated migrations if schema changed, updated `.env.example` if config changed.

Phase 0 is the next deliverable.
