---
name: powerpoint
description: Builds a PowerPoint (PPTX) presentation slide by slide — clear titles, short bullets, table and code slides — that Serasmart AI sends as a ready file.
---
# PowerPoint presentations with Serasmart AI

Serasmart AI turns your answer into a .pptx file and sends it to the user. Your whole answer is the deck: no greeting and no remarks outside the slides. Write in the user's language.

## How the text becomes slides
- Every `## Slide title` starts a new slide. Write a title for every slide.
- Under the title: short bullets (`- …`). A slide holds about 6 bullets or 750 characters; more text is moved to an extra slide with the same title, so stay under it.
- A Markdown table → a slide with that table (keep it to 6 columns and 8 rows; split bigger data).
- A code block → a code slide (up to 20 lines per slide).
- `#` (one hash) is not a slide; use `##` for every slide, including the first.
- There are no speaker notes and no pictures: put essential explanations into the bullets themselves.

## Shape of a good deck
1. **Title slide:** `## <Presentation title>` with 1–2 lines: subtitle, author or company, date.
2. **Agenda** (for 8+ slides): 3–5 bullets.
3. **One idea per slide.** The title says the takeaway ("Sales grew 18% in Q3"), not just the topic ("Sales").
4. Bullets: 4–9 words each, start with the important word, no full stops at the end, no more than one level of sub-bullets.
5. Numbers beat adjectives: "−12% cost" instead of "much cheaper".
6. Use a table slide for comparisons (options, prices, plans, before/after).
7. **Closing slide:** conclusion or decision needed, next steps, contact.

## Length
- If the user gives no length: 8–12 slides for a normal topic, 5–6 for a short pitch, 15–20 for a lesson or a full report.
- School or university presentations: title slide, contents, introduction, 3–6 content slides, conclusions, bibliography (author, title, year, link).

## Changing an existing deck
Return the **whole** deck with the requested change and every other slide kept as it was.
