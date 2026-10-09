# Research boundaries

No models, datasets, inference service, experiment tracker, or benchmark engine is shipped. Future research belongs in independently scoped projects/packages with explicit interfaces to analyzer evidence, not in the domain core. Create real directories only when they contain an actual responsibility.

Every dataset needs a versioned manifest covering source, collection method, consent/rights, redistribution restrictions, transformations, labels and uncertainty, splits, duplicate handling, and retention. Private or sensitive data must not enter the repository. Keep training, calibration, and evaluation splits separate and measure generator/source leakage.

Every analyzer/model needs a model card with training/evaluation scope, license, intended use, unsupported cases, failure modes, calibration, resource costs, and evidence interpretation. Pin code, weights, datasets, parameters, seeds where relevant, and runtime versions to reproduce experiments. Document nondeterminism honestly.

Evaluation should include ROC-AUC, PR-AUC, precision, recall, F1, FPR, TPR at fixed FPR, calibration curves, Brier score, ECE, localization accuracy, temporal localization, latency, peak memory, and model size as applicable. Report operating thresholds and uncertainty, not only headline accuracy. Performance varies with prevalence and distribution shifts.

Robustness suites should include JPEG compression, resizing, cropping, screenshots, re-encoding, social-platform transformations, screen recording, re-photography, and unknown generators. Compare original and acquired media contexts separately. Track failure/unavailable rates and abstention quality; a detector that refuses input must not receive credit for an authentic decision.

Fusion research must account for correlated evidence, provenance trust, conflicts, calibration, and independent validation. Do not present a vote of detector scores as a validated posterior. Research results become product capabilities only after adapter, licensing, resource, security, privacy, and reproducibility reviews.
