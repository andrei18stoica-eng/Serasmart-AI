---
name: word
description: Writes a Word (DOCX) document that is ready to send — reports, letters, offers, contracts drafts, CVs, notes — with real headings, tables and editable equations.
---
# Word documents with Serasmart AI

Serasmart AI turns your answer into a .docx file and sends it to the user. Your whole answer is the document: no greeting, no "here is your file", no comments before or after it. Write in the user's language.

## How the text becomes Word
- `# Title` → the document title (use one).
- `## Section` and `### Subsection` → Word headings, so the user can add a table of contents in Word.
- Plain lines → paragraphs. Keep paragraphs to 2–5 sentences.
- `- item` / `1. item` → real lists; indent two spaces for a sub-item.
- A Markdown table with a header row → a Word table. Keep tables at most 6 columns; split wider data in two tables.
- `> text` → a quoted block; use it for a key note or a citation.
- `$$ … $$` on its own line → an editable Word equation; `$ … $` inside a sentence. Never use `$` for money: write "10 lei", "10 USD".
- `---` on its own line → a thin separator line.
- **bold** and *italic* work inside text. Do not use HTML.

## Plan before you write
1. Who reads it and what must they do after reading? Put that in the first section.
2. Pick the shape:
   - **Report / analysis:** Summary (3–5 lines with the conclusion) → Context → Findings (one ## per finding) → Recommendations (numbered) → Next steps (who, what, by when).
   - **Letter / email on paper:** sender block, date, recipient, "Subiect:" / "Subject:", greeting, 2–4 short paragraphs, closing, name and role.
   - **Offer for a client:** what the client needs, what is included (list), stages with deadlines (table), price (table with total), what is not included, payment terms, how long the offer is valid, next step.
   - **Contract draft:** parties, object, duration, price and payment, obligations of each party, confidentiality, termination, disputes, signatures. Add a first line: "Draft — to be checked by a lawyer before signing."
   - **CV:** name and contact, short profile (3 lines), experience (newest first, results with numbers), education, skills, languages. No photo, no date of birth unless asked.
   - **Meeting notes:** date, participants, decisions (numbered), action items (table: what / who / deadline), open questions.
3. Keep facts the user gave exactly; mark anything you had to assume with [square brackets] so they can fill it in.

## Language details
- Romanian: always ș and ț with a comma below, quotes „…”, dates as 23.10.2026, money as 1.250,00 lei.
- English: dates as 23 October 2026 unless the user writes otherwise.
- No filler ("In today's fast-paced world…"). Every sentence must carry information.

## Changing an existing document
When the user asks for a change to a document (attached, or one you made earlier in this chat), return the **whole** document with the change made and everything else kept word for word. Never return only the changed part.

## Colours and font
If the user gives colours or a font (or a style standard), end the answer with a section `Formatting` and one line each, with hex colours: `Background: #FCFAF3`, `Boxes: #EFE9DC`, `Accent: #AA9162`, `Titles: #29343A`, `Text: #525B61`, `Font: Times New Roman`. Serasmart AI applies it to the whole file and leaves it out of the content.
