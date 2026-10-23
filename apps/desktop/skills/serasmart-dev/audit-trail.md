---
name: audit-trail
description: Designs an audit trail that shows who did what and when, and that nobody can quietly change afterwards.
---
# Audit trails you can trust — Serasmart AI

## What to record
For each event: when (UTC time), who (user or system, never a password), what action, on what object (id), from where (app, IP if allowed), result, and a link to the previous event.

## Making it tamper-evident
- Write events append-only (no update, no delete for normal users).
- Chain them: each record stores a hash (SHA-256) of the previous record plus its own content; checking the chain shows any change.
- Periodically sign or publish the latest hash (for example in a separate system or a daily email to an admin) so the history cannot be rewritten without notice.
- Keep clocks synchronised and store times in UTC.

## Privacy and retention
Record the minimum personal data (GDPR), mask sensitive values, decide how long logs are kept and who may read them.

## Deliver
The event format (a table of fields), where it is stored, how it is checked, and who reviews it and how often.
