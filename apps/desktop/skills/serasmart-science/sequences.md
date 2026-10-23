---
name: sequences
description: Works with DNA, RNA and protein sequences in Python (Biopython): reading files, translating, aligning and searching databases.
---
# Sequence analysis — Serasmart AI

Write Python code with Biopython (`pip install biopython`) and explain each step; Serasmart AI does not run it unless the user runs it.

- **Read and write files:** `SeqIO.parse(path, "fasta")` / `"genbank"`; write with `SeqIO.write`.
- **Basic operations:** `seq.complement()`, `reverse_complement()`, `transcribe()`, `translate(to_stop=True)`; GC content with `Bio.SeqUtils.gc_fraction`.
- **Alignment:** `Bio.Align.PairwiseAligner` (choose global/local, scoring); for many sequences use an external aligner (MAFFT, Clustal Omega) and read the result with `AlignIO`.
- **Database search:** `Bio.Entrez` for NCBI (always set `Entrez.email`; respect the limit of 3 requests per second without an API key); BLAST over the web with `NCBIWWW.qblast` for small jobs only — for many queries use local BLAST+.
- **Report:** sequence lengths, statistics, the key result and how to check it.

Always state versions, the database and the date of the search, so the analysis can be repeated.
