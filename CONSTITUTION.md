# Buendía — Constitution

> A guide for decisions, not a roadmap of features.
>
> **What this document describes is what we want to be, not what we are.**
>
> The aspiration is here so the MVP doesn't paint us into a corner. The MVP is here so we ship. When in doubt, prefer the smaller, simpler, more concrete thing. This document gives us direction, not permission to build more.

---

## Preamble

Most projects fail not by building the wrong thing, but by building too many things, or by building infrastructure for users that don't exist. This document exists to keep us honest on both counts.

The companion document is `MVP.md`. Where the MVP spec describes what we are building right now, this constitution describes the world that work is heading toward. If the MVP spec and this document conflict, **the MVP spec wins for what we ship**, and this document gets amended to match the reality.

Reread this when:
- A design choice feels generic ("should we make this configurable?")
- Scope is creeping ("while we're at it, let's also...")
- A "platform-shaped" idea appears ("we should support plugins")
- A vendor lock-in temptation arises ("just use this hosted service")

---

## Article I — The Vision

The long-term aspiration is **a personal cloud**: an open, self-hostable substrate where:

- A user configures a standard stack once (Postgres, email, LLM provider, auth) and gets a working personal cloud.
- They install **skills** — small composable applications, written by the project or by users — that run in that cloud.
- All skills share access to a **personal context layer**: a knowledge base about the user that any skill can read or write to, with explicit permissions.
- The user brings their own LLM (any provider, including local). The cloud is AI-native by default, not by retrofit.
- Eventually, optionally, the user owns the hardware too. Software first. Hardware indefinitely deferred.

Today we are building one skill (Buendía itself) on a stack that, with discipline, will become this platform. Today, the platform is implicit. Tomorrow, if the first skill works, we extract it.

We do not market the platform vision. We do not promise it. We build toward it.

---

## Article II — Core Principles

1. **User sovereignty.** Data, keys, and (eventually) hardware belong to the user. No mandatory third-party services.
2. **Open by default.** AGPL-3.0. Vanilla web stack. No proprietary lock-in. Anyone can clone, fork, and self-host.
3. **AI-native, not AI-bolted-on.** Designed from day one assuming the user has LLM access. BYOK is non-negotiable.
4. **Boring, opinionated stack.** Postgres + standard tools. Easy to deploy. Hard to break.
5. **One config, many capabilities.** The user configures the stack once, then composes. Adding a skill should be small.
6. **Personal context is the platform.** Every other piece is plumbing.

---

## Article III — Anti-Goals

We are explicitly **not** building:

- A Docker app marketplace. Cloudron, Umbrel, Yunohost, Sandstorm exist. We are not them.
- A multi-tenant SaaS. Single-user, self-hosted first. Multi-tenancy is a packaging concern, not a primary product.
- Hardware. Indefinitely. Until software has traction.
- A general-purpose note-taking app. We don't out-polish Notion or Obsidian. Our angle is the personal context layer, not the editor.
- Infrastructure for skills that don't yet exist. Skills must be built and used before they're generalized from.

---

## Article IV — Architecture Tenets

Concrete principles that affect code:

1. **The core knows nothing about specific skills.** Auth, provider config, job queue, context store — all skill-agnostic. If a "core" file imports something app-specific, it is in the wrong layer.
2. **Skills register, the core enables.** A skill owns its migrations, its routes, its UI, its jobs. The core provides session, user, provider config, the context-layer API, the job runner.
3. **Provider-agnosticism is structural.** Never hardcode a vendor. The Vercel AI SDK abstraction (or its equivalent) is non-negotiable.
4. **Postgres-first.** Anything that needs a separate datastore (Redis, Elasticsearch, dedicated vector DB) must justify itself against pgvector + pg-boss + `tsvector`.
5. **Self-hostable in one command.** `docker compose up` brings everything online. No required external accounts to run the project.
6. **Secrets stay server-side.** API keys are encrypted at rest, decrypted just-in-time, never exposed to the client.

---

## Article V — The Personal Context Layer

This is the platform. Get it right early. Everything else is plumbing.

The personal context layer is a **shared, skill-agnostic store of knowledge about the user**. Skills write to it; skills read from it; the user controls who can do what.

In Buendía today, this layer holds summaries, key points, and embeddings of captured items. In the platform tomorrow, it holds whatever any installed skill writes: meeting transcripts, journal entries, voice memos, browsing context, code snippets — whatever the user accumulates.

Three properties matter, and they must be true on day one:

- **Skill-agnostic schema.** No tables named `buendia_summaries`. The schema describes documents, embeddings, tags, sources — not any one skill's domain. Every write carries a `source_skill` field; that is how we know who wrote it without coupling the schema to who wrote it.
- **Permissions are first-class.** A skill declares the scopes it needs (`read:source=meetings`, `write:source=self`). The user grants, revokes, audits. In MVP, the only skill is Buendía and permissions are implicit; the schema is still permission-shaped.
- **Embeddings are cross-skill substrate.** Semantic search over the context layer is a platform capability, not a Buendía capability. Any future skill should be able to query "what does the user know about X" without re-embedding.

Every design choice in Buendía's data layer must answer: *would this generalize cleanly to a second, unrelated skill?* If no, redesign before shipping.

---

## Article VI — Decision Heuristics

When in doubt, ask:

- **"Is this skill-specific or platform-shaped?"** If platform-shaped, name it generally and put it in the core. If skill-specific, scope it tight and keep it in the skill.
- **"Could the user already do this with five separate self-hosted apps?"** If yes, our value is the *integration*, not the feature. Lean into integration.
- **"Are we building infrastructure for skills that don't exist yet?"** Push back. Generalize from working code, never from imagined code. (This is the Sandstorm trap.)
- **"Will this require an external paid service to self-host?"** If yes, either find an alternative or make it truly optional with a documented degraded mode.
- **"Are we adding a config option to avoid making a decision?"** Decide. Configs are debt.
- **"Would this still be the right call with ten skills installed?"** If no, change it now.
- **"Are we marketing the platform before it exists?"** Don't.

---

## Article VII — Buendía's Role in the Larger Story

Buendía is **the first skill**, currently shipped as a monolith with the core because the core does not yet exist as a separable thing. That is fine. The platform emerges from a working application, never from an empty platform.

Buendía's job:

1. Prove the personal-context layer is useful (summaries, embeddings, tags, search) for one concrete domain — saved links and videos.
2. Force the architectural separation between "core" and "skill" to be real, even when both ship together.
3. Earn the right to extract. Once Buendía works and is in real use, attempt a second small skill on the same stack. If that's easy, the platform vision is validated and extraction begins. If it's hard, the abstraction was wrong; iterate.

We do not extract early. We do not generalize speculatively. We earn each generalization by needing it.

---

## Amendments

This document changes when reality changes. Amend it deliberately — date the change and note what shifted.

A drift in this document without a corresponding drift in the code means we are kidding ourselves. A drift in the code without a corresponding drift in this document means we are losing the plot.

| Date | Change |
|---|---|
| 2026-05-09 | Initial constitution. |
