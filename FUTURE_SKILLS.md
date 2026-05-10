# Buendía — Future Skills

> **This is not a roadmap. This is a parking lot for design pressure.**
>
> Each entry is a thought experiment about a *second* skill that could one day live in the personal cloud. The entries exist for one purpose: to pressure-test Buendía's architecture *without us building any of them*.
>
> Per the [Constitution](./CONSTITUTION.md), Article III and Article VII: we do not build infrastructure for skills that don't yet exist. We earn each generalization by needing it. The skills sketched here are *candidates*, not commitments. Most will never ship. That is fine — their job is to do work right now, on paper, by surfacing what would or wouldn't generalize cleanly from the choices we make in MVP.

---

## How to use this document

When making a Buendía design decision that smells "platform-shaped":

1. Pick a skill from this document.
2. Ask: *would the choice I'm about to make support this skill cleanly, or would it require a rewrite?*
3. If a rewrite, either redesign now (cheap) or accept the future debt explicitly.
4. If multiple skills below would all need the same generalization — that's a real signal. Promote it into the design.
5. If no skill would benefit — don't generalize. Stay specific.

When new skill ideas arrive, add them here. **Adding here is not adding to the backlog.** It is documenting a thought experiment.

---

## 1. Cooking Assistant

A skill that captures recipes (URL, image, plain text), structures them into ingredients and steps, and walks the user through cooking with timers per step and scaling per serving count.

**What it shares with Buendía (validates platform primitives):**
- **Capture pipeline.** URL/image/text → fetch → extract → store. Identical pattern to Buendía's article/YouTube capture.
- **LLM structuring.** `generateObject({ schema: recipeSchema })` is the same shape as `generateObject({ schema: summarySchema })`. Provider abstraction reused unchanged.
- **Embeddings on extracted content.** "Find me a recipe with chickpeas and lemon" is the same query pattern as Buendía's semantic search.
- **Tag tree.** Cuisine / course / dietary / technique slots cleanly into the existing hierarchical tag model.
- **BYOK provider config.** No change.

**What it adds (reveals new platform requirements):**
- **Stateful, in-progress sessions.** "I am currently cooking recipe X, on step 3, timer at 4:23." Buendía today has no model of in-progress state. The platform will eventually need a generic `sessions` primitive — not now, but the existence of this need is logged.
- **Real-time / device-aware execution.** Timers fire on the user's device. Push notifications, lock-screen interaction, possibly voice. This is OS-level infrastructure that Buendía does not need.
- **Action triggers.** "When user taps Next → start timer for step duration." A skill needs the ability to define interactive UI flows beyond CRUD pages.
- **Different UI affordances.** Cooking-mode UI (huge touch targets, hands-free, voice) is a legitimately different mode from Buendía's reading-mode UI. The platform may need a notion of skill-defined "modes."
- **Unit math and scaling.** "Scale to 6 servings" requires structured quantities. Buendía's text-only summaries do not need this.

**Sketch data model:**
```
recipes        # title, source_url, servings, total_time_minutes, image_url, description
ingredients    # recipe_id, position, name, quantity, unit, prep_note
steps          # recipe_id, position, content, duration_seconds, ingredient_refs[]
cooking_sessions  # recipe_id, started_at, current_step_idx, paused_at, scaling_factor
```

Embeddings, tags, source metadata reuse the platform tables.

**Hardest parts (in honest order):**
1. **Kitchen UX.** Large touch, voice, hands-free, lock-screen-friendly. This is where Paprika / Mela / Crouton actually win. AI is the easy part.
2. **Recipe extraction from blog spam.** Modern recipe sites bury the recipe under SEO narrative; reliable extraction needs more than Readability.
3. **Cross-platform push notifications from a self-hosted service.** Web Push works but iOS PWA push is fiddly; native apps reopen the door we tried to close.
4. **Ingredient parsing and scaling.** "1 cup flour" ≠ "1 cup spinach" by weight; metric/imperial; "to taste"; "1 medium onion."

**Status:** Thought experiment. Not in scope. **Will never be built unless Buendía ships and is in real use.**

---

## 2. Meetings / Voice-Memo Capture

A skill that ingests audio (uploaded file, recorded session, calendar-linked recording) and extracts a transcript, decisions, action items, and topics — searchable across all past meetings.

**Shares with Buendía:**
- Capture, extract, embed, tag. Identical pipeline conceptually.
- "What did we decide about X" is exactly the semantic search Buendía already supports.

**Adds:**
- **Audio handling.** Storage (large files), transcription (Whisper local? cloud STT? user choice?), speaker diarization.
- **Calendar integration.** Optional — link transcripts to meeting events.
- **Privacy tier.** Audio recordings may be the most sensitive data a user has. The platform's permission model needs to support per-source sensitivity flags.

**Status:** Thought experiment. Not in scope. Useful pressure on the audio-storage + privacy-tier questions.

---

## 3. Journal / Reflection

A skill for daily or weekly reflective writing with prompts, mood tracking, and longitudinal pattern surfacing.

**Shares with Buendía:**
- Storage, embeddings, tags.
- Resurfacing pattern: the digest mechanism Buendía uses for "things to revisit" maps onto "memories from this week last year."

**Adds:**
- **Scheduled outbound prompts.** The system reaches out to the user ("here's tonight's prompt") rather than waiting for input. Buendía has push *digest*; this is push *invitation* — similar infra, different intent.
- **Highest-sensitivity context.** Default privacy must be stricter; permissions for other skills to read this layer should be off by default.
- **Longitudinal queries.** "When was the last time I felt anxious about work?" — date-range + semantic + sentiment. Pushes the search layer.

**Status:** Thought experiment. Not in scope. Useful pressure on scheduling and privacy defaults.

---

## 4. Code Snippet Capture

A skill that captures code from anywhere (browser extension on GitHub/StackOverflow, IDE extension, paste) with surrounding context, and lets the user search by what code *does* rather than by exact string.

**Shares with Buendía:**
- Capture, extract, tag, search.

**Adds:**
- **Code-aware extraction.** Detect language, framework, dependencies; extract intent ("this debounces a function").
- **Code-aware embeddings.** Likely a different embedding model than prose. The platform's embedding-dimension constraint becomes interesting — confirms the value of per-source embedding configuration that Buendía MVP defers.
- **Optional execution sandbox.** Far future; ignore for now.

**Status:** Thought experiment. Not in scope. Useful pressure on the embedding-dimension question.

---

## What the four entries collectively reveal

Reading them as a set, design pressure clusters around three areas:

1. **Stateful sessions.** Cooking needs them most acutely; meetings have a lighter version (recording in progress); journal does not. → Not needed in Buendía MVP. Note in architecture docs that a `sessions` primitive will likely emerge.

2. **Per-skill embedding configuration.** Cooking uses prose, code uses code-aware embeddings, audio could embed transcripts (prose) or audio fingerprints (different). Buendía's MVP locks dimension at 768. → Confirmed acceptable for MVP; flag the constraint in the schema comments so future-us doesn't forget.

3. **Push from system to user.** Buendía's weekly digest is the seed of this. Journal and cooking timers extend it. → The digest infrastructure should be cleanly separable from Buendía's specific email content. Already implied by Article IV but worth re-stating: name the abstraction `notifications` or similar, not `digest_emails`.

These three observations are the reason this document exists. They cost ten minutes of writing and they will save real refactoring later.

---

## Adding new entries

Format per entry:

```
### N. <Name>

<One-line description.>

**Shares with Buendía:** ...
**Adds:** ...
**Sketch data model:** (optional — only if it pressures the schema)
**Hardest parts:** (only if non-obvious)
**Status:** Thought experiment. Not in scope.
```

Keep entries short. The point is to think, not to plan.
