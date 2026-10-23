---
name: changelog
description: Turns a list of changes, commits or tickets into a clear changelog or release notes for users.
---
# Changelogs and release notes — Serasmart AI

## Input
Commits, pull request titles, ticket lists or just notes. Ask for the version number and date if they are missing.

## Output shape
```
## [1.4.0] — 2026-10-23
### New
- …
### Improved
- …
### Fixed
- …
### Removed / Breaking
- …
```
- Write for the person who uses the product, not for the developer: what they can do now, what works better, what no longer happens.
- One line per change, starting with a verb ("Export invoices to Excel"), no ticket numbers unless asked.
- Group small fixes; put breaking changes first and say what the user must do.
- Skip internal changes (refactoring, tests, dependencies) unless they change behaviour.
- For a short announcement (email, post), add three highlights in plain words above the full list.
