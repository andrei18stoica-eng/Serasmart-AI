---
name: excel
description: Builds an Excel (XLSX) workbook — one sheet per table, clean numbers, live formulas for totals and calculations — that Serasmart AI sends as a ready file.
---
# Excel workbooks with Serasmart AI

Serasmart AI turns your answer into an .xlsx file and sends it to the user. Your whole answer is the workbook: only sheet titles and tables, nothing else. Write in the user's language.

## How the text becomes a workbook
- Each Markdown table becomes a sheet. Write `## Sheet name` right above each table (at most 31 characters, no `/ \ ? * [ ]`). With one table, the file title names the sheet.
- The first row of each table is the header row: it is bold and stays frozen while scrolling.
- Row numbers in Excel: the header is row 1, the first data row is row 2. Column A is the first column of your table.

## Cells
- Numbers alone in the cell, without units: put the unit in the header ("Price (lei)", "Weight (kg)", "Share (%)" with 18 for 18%).
- Decimals: 1250.5 or 1.250,50 both work; never mix styles in one column.
- Dates: 2026-10-23 (they sort correctly).
- Codes that must keep leading zeros or long digit strings (postal codes, IDs, phone numbers) stay text automatically.
- **Formulas work.** Start the cell with `=` and use English function names with commas between arguments, exactly as stored by Excel: `=SUM(B2:B10)`, `=AVERAGE(C2:C10)`, `=B2*C2`, `=IF(D2>0,"Profit","Loss")`, `=ROUND(B2*0.19,2)`, `=VLOOKUP(A2,Prices!A:B,2,FALSE)`. Excel works them out when the file opens. Formulas that call the internet or other programs are not allowed and stay as text.
- Prefer formulas to numbers you calculated yourself for totals, VAT, differences and percentages, so the workbook keeps working when the user changes a value.

## Shape of a good workbook
1. **Data first, then summary:** a "Data" sheet with one row per item, then a "Summary" sheet whose cells refer to it (`=SUM(Data!D2:D50)`).
2. Totals in the last row, with "Total" in the first column and `=SUM(...)` below each number column.
3. Typical layouts:
   - **Budget:** Category | Planned | Actual | Difference (`=C2-B2`) | % used (`=ROUND(C2/B2*100,1)`).
   - **Invoice list:** No. | Date | Client | Amount without VAT | VAT (`=ROUND(D2*0.21,2)`, use the VAT rate the user gives) | Total (`=D2+E2`) | Paid (Yes/No).
   - **Schedule / tracker:** Task | Owner | Start | Deadline | Status | Notes.
   - **Price comparison:** Product | Supplier A | Supplier B | Cheapest (`=MIN(B2:C2)`).
4. Up to 50 sheets; keep each table to the columns that matter.

## Changing an existing workbook
Return **all** sheets again, with the change made and every other cell kept as it was.
