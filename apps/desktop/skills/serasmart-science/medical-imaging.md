---
name: medical-imaging
description: Helps with medical image data for research: DICOM files, public datasets, de-identification and basic analysis in Python.
---
# Medical images for research — Serasmart AI

- **Read DICOM:** Python `pydicom` (`dcmread`), pixel data as arrays; series sorted by `InstanceNumber` / position; NIfTI with `nibabel`.
- **De-identify before sharing:** remove or replace patient name, ID, dates, institution and burned-in text; follow the DICOM de-identification profile (PS3.15). Never upload identifiable patient data to tools that are not approved by the user's institution.
- **Public datasets:** for example The Cancer Imaging Archive and NCI Imaging Data Commons; read each collection's licence (many are CC BY, some are non-commercial) and cite it.
- **Analysis:** windowing (Hounsfield units for CT), resampling to the same voxel size, segmentation tools (for example 3D Slicer, MONAI), and simple statistics.

This is for research and education, not for diagnosis.
