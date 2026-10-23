---
name: phylogenetics
description: Builds and reads evolutionary trees: alignment, choosing a model, building the tree and drawing it.
---
# Evolutionary trees — Serasmart AI

## Workflow
1. **Sequences:** same gene or region for all taxa, FASTA, clear short names.
2. **Alignment:** MAFFT or MUSCLE; trim badly aligned regions (trimAl).
3. **Model:** choose the substitution model with ModelFinder (IQ-TREE) or jModelTest.
4. **Tree:** maximum likelihood with IQ-TREE or RAxML-NG, with branch support (ultrafast bootstrap 1000 or standard bootstrap 100+).
5. **Draw and edit:** in Python with `ete3`/`ete4` or `Bio.Phylo`; in R with `ggtree`; root with an outgroup.

## Reading the tree
Explain clades, support values (below ~70% bootstrap is weak), branch lengths (substitutions per site) and what the tree cannot prove.

Give exact commands and the versions used.
