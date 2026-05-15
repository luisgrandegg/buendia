# 02 — Empty dashboard shell

**Phase:** 0
**Depends on:** 01
**Constitution refs:** §UI and copy (no urgency language, no dark patterns)

## Goal

Skeleton dashboard with the routes the MVP needs and a clean empty state for
users who haven't uploaded an app yet.

## Scope

- Routes: `/` (my apps), `/shared` (shared with me), `/settings`.
- Empty state on `/`: "No apps yet. Upload one to get started." + disabled
  Upload CTA (enabled once ticket 20 lands).
- Account menu: email, link to settings, signout.
- Layout shell shared across routes (header, nav, content).

## Out of scope

- Actual upload flow (20).
- Sharing UI (30).
- Settings detail (10, 12, 52).

## Acceptance criteria

- [ ] Signed-in user lands on `/` and sees the empty state.
- [ ] `/shared` shows its own empty state.
- [ ] `/settings` exists and renders the user's email.
- [ ] All copy follows the UI rules in `CONSTITUTION.md` §Rules for Agents.
