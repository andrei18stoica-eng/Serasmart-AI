---
name: comp-chemistry
description: Plans computational chemistry work: molecular properties, conformers, quantum calculations and docking, with open tools.
---
# Computational chemistry — Serasmart AI

- **Molecules:** read SMILES or SDF with RDKit; compute descriptors (molecular weight, logP, H-bond donors/acceptors, TPSA), check drug-likeness rules.
- **3D and conformers:** RDKit ETKDG to embed, MMFF to optimise; keep the lowest-energy conformers.
- **Quantum calculations:** open tools such as xtb (fast, semi-empirical), Psi4 or ORCA (free for academic use — check the licence before commercial work); choose method and basis set for the question (geometry, energies, spectra) and state them.
- **Docking:** AutoDock Vina or smina; prepare protein (remove water, add hydrogens) and ligand; define the box from a known binding site; report scores as rough ranking, not as binding energies.

Give commands or Python code, expected run time, and how to check that results make sense.
