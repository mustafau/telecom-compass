# Evaluation assets

`cases.json` is the evaluation specification. `pnpm eval:offline` exercises scripted fixture turns for core outage cases and records coverage notes for the rest (authz/unit suites cover adversarial gates).

Keep fixture definitions and assertions in version control. Keep raw model transcripts in ignored `.artifacts`. Never commit production customer data. Live-model quality gates remain opt-in when provider credentials exist.

See [evaluation design](../docs/design/evaluation.md).
