# Buendia — Constitution

> This document governs every product, design, and technical decision in this repository.
> Agents: read this before acting. If a request conflicts with these principles, flag it before proceeding.

---

## Mission

A generation of people who are not programmers is producing working software by prompting AI assistants. The output is almost always a single HTML file with inline CSS and JavaScript. That file does real work — tracks a project, manages a side hustle, coordinates a household — until the chat closes and it dies.

The dominant responses to this problem are walled gardens. AI app builders that host your app on their infrastructure, on their domain, with their auth, against their database, behind their pricing. The app cannot be moved. The data cannot be exported. The skill required to leave is exactly the skill the user does not have — which is why they used the platform in the first place.

**Buendia hosts AI-generated single-file HTML apps without absorbing them.** The same HTML works on the platform, on a static host, and as a `file://` double-click. The platform supplies the hard parts — auth, a database, sharing, a URL — and supplies nothing else. The data lives in a backend the user owns directly, not in ours. When a user leaves, they leave with their app and their database, and everything keeps working.

---

## The Problem

Vibe-coded apps follow a predictable arc:

1. A non-technical user prompts an AI assistant for an app
2. The AI produces a self-contained HTML file with inline JS that talks to a backend the user has no idea how to set up
3. The user pastes their Supabase URL and anon key into the file (or into a localStorage prompt), and security becomes obscurity
4. They share the URL and the key with two friends in a chat, and security becomes obscurity-shared-with-three
5. A month later they want to revoke access for one of them and discover they cannot — there is no per-person identity, no audit, no recovery
6. Six months later the credentials are lost, the file is on a phone that broke, and the app is gone

Each step is solvable individually. None of them is solvable by the vibe coder. The pattern is not a knowledge gap; it is a missing piece of infrastructure.

The platforms that already solve some of these problems — Bolt, Lovable, Replit, v0 — solve them at the cost of lock-in. Your app lives there. Your auth is theirs. Your database is theirs. Leaving means rewriting.

Buendia assumes the AI-generated artifact is the user's, that it should be hostable anywhere, and that the only correct relationship between the platform and the app is one the user can sever without losing anything.

---

## Core Principles

Every product, design, and technical decision in this repository must follow all of these principles. No exceptions without a new ADR.

### 1. Portability over convenience

The HTML file is the durable artifact. The platform is convenience layered on top. A user must be able to download their `index.html` and `schema.sql`, disconnect Buendia, and run the app on any static host pointed at the database they already own. If a feature would make this impossible, the feature is wrong, not the principle.

### 2. The platform is opt-in at runtime

Every uploaded app must run identically in two modes:

```
hosted mode      window.__APP_CONFIG__ is present  → SDK uses it
standalone mode  window.__APP_CONFIG__ is absent   → SDK asks the user for credentials
```

The app code does not branch on mode. The SDK resolves the difference. An app pulled out of the platform and dropped on Cloudflare Pages keeps working with no edits.

### 3. The user owns the database

The app's data lives in a backend provisioned in the user's own account, not in ours. Buendia never holds app data on infrastructure it controls; it holds operational metadata (users, app records, sharing grants, audit logs) on a separate control plane.

In SaaS mode, the user connects their backend account once (OAuth flow), Buendia provisions a project there on their behalf, and from then on every app schema lives inside the user's own project. If the user disconnects Buendia, their data does not move and their app does not break — Buendia simply stops being involved.

In self-hosted mode, the operator owns the backend by definition. Buendia provisions schemas into whatever backend the operator configured.

This is the strongest version of "the user owns the data". It is not a policy promise; it is an architectural fact. Buendia cannot read app data because Buendia does not hold app data.

### 4. Real auth, not URL obscurity

The premise of the vibe-coded world today is that knowing a Supabase URL and anon key is equivalent to having permission. This is not security. It is a shared secret with no revocation path.

Buendia issues per-user, per-app, short-lived JWTs. Access is granted to people, not to anyone with the link. Revoking access means revoking access, not rotating a key shared with five people.

### 5. Single codebase, two deployments

The hosted SaaS and the self-hosted distribution ship from the same code. No SaaS-only features. No premium features gated behind a different binary. A `PLATFORM_MODE` env var selects the OAuth flow for the user's backend (managed in SaaS, prompt for credentials in self-hosted) and enables billing UI in SaaS mode; everything else is identical.

The self-hosted distribution is a first-class product, not a stripped-down hand-out. If a feature works in SaaS, it works self-hosted, and vice versa.

### 6. The SDK is a library, not a runtime

`@buendia/sdk` is loaded by the app via a `<script>` tag. It is a thin wrapper that resolves configuration and exposes a typed client over the data-stack protocols (PostgREST, Realtime, Auth, Storage). It does not own the app's lifecycle. It does not render the app. It does not require a framework. It works in vanilla HTML, in a React app inlined via CDN, in anything that runs JavaScript.

Apps may bypass the SDK and talk to the data stack directly if they prefer. The SDK is a convenience; it is not a moat.

### 7. Sharing is access, not ownership transfer

When an app is shared, the recipient gets access to the running app and its data. They do not get the HTML. They do not get the schema. They do not get the ability to fork. They cannot share onward. They cannot revoke the owner. They are a guest in someone else's house.

The owner can revoke at any time, and revocation is immediate — the recipient's next request fails. There is no offboarding period, no grace window, no "but they still have the link". The link without the grant is inert.

### 8. The stack, not the vendor

Buendia is built against an open data stack — a Postgres database, a PostgREST-compatible REST layer, a Realtime-compatible WebSocket layer, an Auth service that issues compatible JWTs, an S3-compatible object store — not against any single vendor's branded product.

The reference implementation of this stack is Supabase OSS (and its managed service is the chosen SaaS backend at launch). Operators may substitute compatible components in self-hosted deployments — PostgREST against their own Postgres, Soketi or a custom Realtime service, Keycloak or another auth provider, MinIO or S3 — without forking Buendia's code. The contract is the protocols, not the brand.

This principle exists so that "the user owns the data" extends to the operator: a municipality, cooperative, or self-hosting individual can run Buendia on infrastructure they fully control, with no commercial dependency on a single vendor.

---

## Platform Registry

The platform supports exactly the following capabilities. Adding anything else requires updating this section and writing an ADR.

### Hosting

| Capability | Status |
| --- | --- |
| Single-file HTML apps | MVP |
| Inline JS, inline CSS, CDN ES module imports | MVP |
| Subdomain per app (SaaS) / path per app (self-hosted) | MVP |
| Multi-file apps (HTML + asset bundles) | Out of scope |
| Server-side code uploaded by users | Permanently out of scope |
| Custom domains | Post-MVP |

### Data

| Capability | Status |
| --- | --- |
| User-owned backend project, schema-per-app within it | MVP |
| `schema.sql` upload, auto-generated RLS | MVP |
| Realtime subscriptions | MVP |
| Object storage for app file uploads | MVP |
| AI-assisted schema generation in dashboard | Post-MVP |
| Project-per-app isolation | Post-MVP (rarely needed given Principle §3) |

### Identity & sharing

| Capability | Status |
| --- | --- |
| Email/password auth on the control plane | MVP |
| Per-user JWTs scoped to a single app, signed with the owner's JWT secret | MVP |
| Owner-invited sharing by email, viewer role | MVP |
| Editor role with shared-data write access | MVP |
| Owner can revoke any share at any time | MVP |
| Public read-only apps | Post-MVP |
| OAuth providers (Google, GitHub) for the control plane | Post-MVP |

### Out of scope, MVP and beyond

- AI app generation inside the platform. Buendia hosts what others generate.
- An app marketplace, gallery, or public discovery surface. Apps are private to their owner and their guests.
- Quotas, billing, plans. Stubbed until there is a paying user.
- Analytics, telemetry, app usage tracking. We do not hold app data; we cannot ship product analytics that look inside.
- Pointing Buendia at a bare Postgres with no surrounding stack. Operators who want to BYO Postgres run the OSS data stack on top of it. Buendia does not reimplement PostgREST.

---

## Architecture Invariants

These are binding architectural constraints. Any feature that violates one must be flagged before implementation.

### Two backends

The control plane (users, apps, sharing grants, audit) and the app data (user-defined schemas) live in two separate backends. The control plane is owned by Buendia (managed in SaaS, local in self-hosted). The app data backend is owned by the app owner (their own managed-Supabase project in SaaS, the operator's data stack in self-hosted). They are never mixed.

```
SaaS:                                  Self-hosted:

  ┌──────────────────┐                   ┌────────────────────────────┐
  │ Control plane    │                   │ Single data stack          │
  │ (Buendia-managed │                   │ (operator-controlled)      │
  │  Supabase)       │                   │                            │
  │                  │                   │   control schema           │
  │  users, apps,    │                   │   app_<slug> schemas       │
  │  app_shares,     │                   │                            │
  │  owner_backends, │                   │ (operator may substitute   │
  │  audit           │                   │  compatible components)    │
  └──────────────────┘                   └────────────────────────────┘
  ┌──────────────────┐
  │ App data backend │  ← N of these, one per Buendia user
  │ (user-owned      │
  │  Supabase, via   │
  │  Supabase OAuth) │
  └──────────────────┘
```

### JWT scope is the security boundary

Every app request runs with a JWT signed with the *owner's* backend project JWT secret, pinning four things: the requester's user id, the app's schema name, the app's team id, and the requester's role on that app (`owner`, `editor`, `viewer`). RLS policies key off these claims. A bug in one app's RLS cannot expose another app's data because the JWT will not be accepted against another app's backend.

### The SDK has no privileged operations

The SDK runs in the browser. It has no operations that require a service-role-equivalent credential. Every operation it performs is one the user could perform manually with the same JWT. If a feature requires elevated database access (running DDL, provisioning shares, minting tokens), it runs on the control plane via a Buendia API, not through the SDK.

### Provisioning is reversible

Every operation that creates state — provisioning a schema, creating a share, issuing a JWT — has a documented inverse. Deleting an app deletes its schema, its shares, its versions, and its storage objects in a single transaction. Disconnecting Buendia from the user's backend leaves the schema intact and exportable; it does not delete app data. No orphans, no surprises.

### The platform never holds app data

Buendia's control plane stores: users, apps, sharing grants, owner backend credentials (encrypted), billing records, audit logs. It does not store app data. App data lives in the owner's backend, accessed by the app via PostgREST with a scoped JWT. Buendia's servers never read app data, never proxy it, never have credentials that allow reading it at rest.

The owner's backend credentials stored by Buendia allow Buendia to perform admin operations on the owner's behalf (create schemas, mint JWTs, manage users). They do not give Buendia a path to bulk-read app data without leaving an obvious trace, and the architecture is designed so that doing so would require deliberate action visible in the codebase, not a quiet capability.

---

## Rules for Agents

When working in this repository, apply the following checks before implementing any feature, component, or data model.

**On every feature:**

- Ask: "Does this feature work the same way in self-hosted mode as in SaaS?"
- Ask: "Can a user disconnect Buendia and have their data and their app continue to work?"
- Ask: "Does this require Buendia to read app data? If yes, can we redesign so it doesn't?"

**On the SDK:**

- The SDK ships to the browser via CDN. Every byte added to the SDK is a byte every app pays for. Minimise.
- The SDK must not depend on a framework. No React, no Vue, no Solid. Plain TypeScript compiled to ESM and IIFE.
- The SDK must not require build tooling in the app. A `<script>` tag and an `await Buendia.init()` is the whole integration.
- The SDK talks to the data stack via stable protocols (PostgREST, Realtime). It does not branch on which vendor implements those protocols.

**On data models:**

- The control plane schema is owned by us. The app schemas are owned by the app author. Do not cross the boundary.
- Any column we add to a user's schema (`user_id`, `team_id`, `created_at`) is documented in the schema provisioner spec. Do not add columns silently.
- Every table in an app schema gets RLS. No exceptions. The provisioner refuses to run a schema.sql that disables RLS.

**On auth and sharing:**

- A share grant is a row in `app_shares` with `(app_id, user_id, role)`. JWTs derive from that row. There is no other path to access.
- Revocation deletes the row. The next JWT mint fails. There is no "expire over time" model.
- Sharing onward is not allowed. Recipients cannot create sub-shares. The owner is the only one who grants.

**On UI and copy:**

- No urgency language. No "Upgrade now to unlock". No "Your app will be deleted in 7 days" without an actual deletion policy.
- The setup overlay in standalone mode explains exactly what the credentials are for and where to get them. No dark-patterned "Sign in with Buendia" button that is actually a signup funnel.
- Pricing, if any, is complete and visible before the user commits.

**On vendor coupling:**

- The constitution names the protocols, not the vendor. Code may use the Supabase client libraries because they are the most mature implementation of those protocols, but do not introduce features that require a Supabase-specific capability with no equivalent in compatible stacks.
- If a feature genuinely needs a Supabase-managed-only capability (e.g., Supabase Edge Functions for some specific use case), flag it and write an ADR justifying the lock-in.

**On scope:**

- The Platform Registry is the source of truth for what this project builds.
- Do not add capabilities outside the registry without updating it first and writing an ADR.
- "We could also..." features are filed in `backlog/` and built later or never. The MVP does not absorb them.

---

## Modifying This Document

**This block is active only when the current task modifies this file, any `CLAUDE.md`, or any file in `decisions/`. Skip it otherwise.**

Changes to governing documents must be deliberate. Open a PR with the change, link the ADR that motivates it, and request review from a human before merge. Agents do not modify the constitution autonomously.
