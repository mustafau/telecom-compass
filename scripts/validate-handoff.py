#!/usr/bin/env python3
"""Validate docs/config integrity (links, JSON, examples). Not a substitute for pnpm test. Stdlib only."""
from pathlib import Path
from urllib.parse import unquote
import json
import re
import sys

root = Path(__file__).resolve().parents[1]
errors = []
skip_dirs = {'.git', 'node_modules', 'dist', '.wrangler', '.pnpm-store', 'coverage', '.artifacts'}
files = sorted(
    p
    for p in root.rglob('*')
    if p.is_file() and not any(part in skip_dirs for part in p.parts)
)
required = ['AGENTS.md', 'README.md', 'CONTRIBUTING.md',
            'docs/design/low-level-design.md', 'docs/design/tmf-integration.md',
            'docs/design/contracts/answer.schema.json', 'evals/cases.json']
for rel in required:
    if not (root / rel).is_file():
        errors.append(f'Missing required file: {rel}')
for p in files:
    if p.suffix == '.json':
        try:
            json.loads(p.read_text())
        except (ValueError, UnicodeError) as error:
            errors.append(f'{p.relative_to(root)}: invalid JSON: {error}')
    if p.suffix != '.md':
        continue
    content = re.sub(r'```.*?```', '', p.read_text(), flags=re.S)
    if p.read_text().count('```') % 2:
        errors.append(f'{p.relative_to(root)}: unbalanced code fences')
    for dest in re.findall(r'\[[^\]]*\]\(([^)]+)\)', content):
        if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', dest) or dest.startswith('#'):
            continue
        target = unquote(dest.split('#')[0].strip('<>'))
        if target and not (p.parent / target).exists():
            errors.append(f'{p.relative_to(root)}: broken local link: {dest}')
try:
    spec = json.loads((root / 'evals/cases.json').read_text())
    ids = [case['id'] for case in spec['cases']]
    if len(ids) != len(set(ids)):
        errors.append('Duplicate evaluation IDs')
    for case in spec['cases']:
        if not all(case.get(k) for k in ('id', 'scenario', 'audience', 'prompt', 'expected', 'forbidden')):
            errors.append(f'Incomplete evaluation case: {case.get("id")}')
    schema = json.loads((root / 'docs/design/contracts/answer.schema.json').read_text())
    def walk(value):
        if isinstance(value, dict):
            ref = value.get('$ref')
            if ref and ref.startswith('#/'):
                current = schema
                try:
                    for segment in ref[2:].split('/'):
                        current = current[segment.replace('~1', '/').replace('~0', '~')]
                except (KeyError, TypeError):
                    errors.append(f'Unresolved schema reference: {ref}')
            for item in value.values():
                walk(item)
        elif isinstance(value, list):
            for item in value:
                walk(item)
    walk(schema)
except (KeyError, ValueError, OSError) as error:
    errors.append(str(error))
if errors:
    print('\n'.join(errors), file=sys.stderr)
    sys.exit(1)
print(f'PASS: {len(files)} files; local Markdown links, JSON, schema references and evaluation structure checked.')
print('Use pnpm test / integration gates for application behavior and TMF compatibility.')
