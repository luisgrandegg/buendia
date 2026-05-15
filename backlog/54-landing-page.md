# 54 — Landing page

**Phase:** 5
**Depends on:** 02
**Constitution refs:** §Rules for Agents §On UI and copy

## Goal

A signed-out visitor at `buendia.app` (or the self-hosted equivalent) gets a
landing page that explains what Buendia does, links to the OSS repo, and has
a clear signup CTA.

## Scope

- Sections: what it is (one paragraph), the two-mode demo (file:// vs hosted),
  the eight principles by name, self-hosted CTA, signup CTA.
- Pricing visible if any (none in MVP — say so explicitly).
- Signed-in visitors redirect to `/`.
- No urgency language. No "Upgrade now to unlock". No dark patterns.

## Out of scope

- Marketing analytics (we don't ship telemetry).
- A/B testing.

## Acceptance criteria

- [ ] Lighthouse accessibility ≥95.
- [ ] Copy passes the constitution's §UI and copy rules (manual review).
- [ ] Signed-in users never see the landing page.
