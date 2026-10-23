---
name: spatial-omics
description: Analyses spatial transcriptomics and single-cell data in Python: quality control, clustering, cell types and spatial patterns.
---
# Spatial and single-cell data — Serasmart AI

Python with Scanpy and Squidpy (or R with Seurat):
1. **Load:** AnnData (`.h5ad`) or 10x outputs; spatial coordinates in `adata.obsm["spatial"]`.
2. **Quality control:** counts per spot or cell, genes per cell, mitochondrial share; remove poor spots.
3. **Normalise and reduce:** normalise total, log1p, highly variable genes, PCA, neighbours, UMAP.
4. **Clusters and cell types:** Leiden clustering, marker genes (`rank_genes_groups`), label with known markers or a reference.
5. **Spatial:** neighbourhood enrichment, spatially variable genes (Moran's I), deconvolution of spots into cell types with a reference atlas.

Report parameters and versions; check every model's licence before commercial use.
