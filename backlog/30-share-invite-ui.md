# 30 — Share invite UI

**Phase:** 3
**Depends on:** 02, 20, 60 (audit log)
**Constitution refs:** §7 (sharing is access, not ownership transfer)

## Goal

Owner can invite collaborators by email and role from the app's detail page,
see current members, and remove any of them.

## Scope

- Share panel on each app's detail page.
- Invite form: email + role (viewer | editor).
- Member list with role badge and Remove button. Owner row is locked.
- Write to `app_shares` (or update if a row already exists for that email).
- Emit an `audit_log` entry on invite, role change, and removal.
- Surface invitation status: "Invitation sent", "Pending signup", "Active".

## Out of scope

- Email delivery itself (ticket 31).
- Onward sharing (forbidden by §7).
- Public sharing links (post-MVP).

## Acceptance criteria

- [ ] Owner can invite and remove members from the UI.
- [ ] Non-owners cannot see or use the share panel.
- [ ] Removal triggers the revocation path within JWT TTL (ties to 26 + 33).
