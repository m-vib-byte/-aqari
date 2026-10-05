"""Ensure review candidates are byte-identical across Python hash seeds."""
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
FILES = [ROOT / 'staging-database/reconciliation' / kind / name
         for kind in ('tenant-rating', 'tenant-contact')
         for name in ('candidate.sql', 'manifest.json')]

baseline = None
for seed in ('1', '2', '42'):
    subprocess.run([sys.executable, str(ROOT / 'scripts/build-production-contact-reconciliation.py')],
                   cwd=ROOT, env={**os.environ, 'PYTHONHASHSEED': seed}, check=True)
    current = {str(path.relative_to(ROOT)): path.read_bytes() for path in FILES}
    if baseline is not None:
        changed = [name for name in current if current[name] != baseline[name]]
        if changed:
            raise AssertionError(f'Non-reproducible output for seed {seed}: {changed}')
    baseline = current

print('PASS: tenant SQL and manifests match across three Python hash seeds')
