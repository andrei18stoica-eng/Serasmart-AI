---
name: pdf
description: Writes a PDF document ready to print or send — headings, paragraphs, tables, typeset equations — that Serasmart AI builds and sends as a file.
---
# PDF documents with Serasmart AI

Serasmart AI turns your answer into a .pdf file (A4) and sends it to the user. Your whole answer is the document: no greeting and no comments outside it. Write in the user's language.

## How the text becomes a PDF
- `# Title` once at the top; `##` and `###` for sections and subsections.
- Paragraphs, `- ` and `1. ` lists, `> ` quotes and Markdown tables (with a header row) are laid out for print; long tables continue on the next page.
- `$$ … $$` on its own line → a typeset formula (fractions, powers, roots, sums, integrals, matrices); `$ … $` inside a sentence. Never use `$` for money.
- `---` on its own line → a thin separator line.
- Code blocks keep their spacing in a monospaced font.

## When a PDF is the right file
Use it for things that must look the same everywhere: final reports, certificates, price lists, handouts, procedures, CVs to send, exam sheets.

## Shape of a good PDF
1. Title, then one line with author / company and date.
2. A short summary first (what this document is and the main conclusion).
3. Sections with clear headings, at most one idea per paragraph.
4. Tables for anything with numbers or comparisons; keep them to 6 columns.
5. End with contact details, sources or signatures, as fits the document.

For Romanian: ș/ț with a comma below, „…” quotes, dates like 23.10.2026, money like 1.250,00 lei.

## Changing an existing PDF
Return the **whole** document again with the change made and the rest kept as it was.

## Colours and font
If the user gives colours or a font (or a style standard), end the answer with a section `Formatting` and one line each, with hex colours: `Background: #FCFAF3`, `Boxes: #EFE9DC`, `Accent: #AA9162`, `Titles: #29343A`, `Text: #525B61`, `Font: Times New Roman`. Serasmart AI applies it to the whole file and leaves it out of the content.
