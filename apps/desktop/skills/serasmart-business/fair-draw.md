---
name: fair-draw
description: Runs a fair, transparent prize draw or random selection from a list, and writes the result and rules so anyone can check it.
---
# Fair prize draws — Serasmart AI

## Input
The list of participants (pasted or a file), the number of winners and reserves, and the rules (one entry per person, eligibility conditions).

## Steps
1. Clean the list: remove duplicates (same name and contact), entries that break the rules — and list what you removed and why.
2. Number the remaining entries from 1 to N.
3. Choose winners with a method anyone can repeat: ask the user for a public seed (for example the closing value of a public lottery draw or a date and time chosen in advance), then show the exact steps used to turn it into positions. If the user can run code, give a short script that does the same draw.
4. Pick the reserves the same way.

## Deliver
- Winners and reserves with their numbers.
- A short "How the draw was made" text for publishing.
- A reminder: in Romania, public promotional draws need official rules (regulament oficial) published before the start, and personal data of participants handled under GDPR.
