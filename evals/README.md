# Evaluation assets

`cases.json` is the seed evaluation specification. Implement its fixture variants and runners during M1/M6. No results have been produced. Run all relevant cases against more than one TMF deployment representation to test portability.

Keep fixture definitions, expected assertions and evaluation summaries in version control. Keep raw model transcripts and generated reports in ignored .artifacts unless deliberately reviewed and redacted. Never commit production customer data. Expand to at least 30 varied prompts before the initial live-model quality gate.

See [evaluation design](../docs/design/evaluation.md) for mandatory deterministic tests beyond these model prompts.
