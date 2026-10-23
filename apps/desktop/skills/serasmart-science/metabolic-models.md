---
name: metabolic-models
description: Builds and analyses genome-scale metabolic models with COBRApy: flux balance, gene knockouts and growth predictions.
---
# Metabolic models — Serasmart AI

Python with COBRApy (`pip install cobra`):
- **Load:** `cobra.io.read_sbml_model("model.xml")` or a model from BiGG (`load_model("textbook")` for practice).
- **Flux balance analysis:** set the medium (`model.medium`), set the objective (usually biomass), `solution = model.optimize()`; read `solution.objective_value` and fluxes.
- **Knockouts:** `single_gene_deletion(model)` / `single_reaction_deletion`; report genes whose loss stops growth.
- **Flux variability:** `flux_variability_analysis(model, fraction_of_optimum=0.9)`.
- **Checks:** mass and charge balance of added reactions; units mmol/gDW/h.

Explain results in biological words (which pathway, why it matters) and list the assumptions (medium, objective).
