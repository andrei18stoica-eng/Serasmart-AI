---
name: invoice-organizer
description: Puts invoices and receipts in order: reads them, names them the same way, sorts them by month and supplier and makes an Excel summary.
---
# Organising invoices — Serasmart AI

## Input
Invoices and receipts the user attaches (PDF, photos, Excel exports). Ask for the period and whether they are purchases, sales or both.

## For each document, read
Supplier or client, document number, date, amount without VAT, VAT, total, currency, due date, paid or not (if shown). Mark anything unreadable instead of guessing.

## Deliver
1. **A naming rule** for the files, the same for all: `2026-10_Supplier_InvoiceNo_Total.pdf`, and the new name of every file.
2. **A folder plan:** `Year/Month/Purchases|Sales`.
3. **An Excel summary** (one row per document) with totals per month and per supplier as formulas (`=SUM(...)`), and a "To pay" sheet with documents not yet paid, sorted by due date.
4. **Checks:** duplicates (same number and supplier), totals that do not equal amount + VAT, missing numbers in a series.

Serasmart AI cannot move files on the user's computer: it gives the names and plan, and the user (or a connected Drive) applies them.
