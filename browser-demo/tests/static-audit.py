"""Audit public source, local request surfaces and vendored bytes. No dependencies.

Optional PRIVACY_TERMS_FILE points to private, one-per-line identity markers OUTSIDE
the repo. Only counts are emitted. Git history is audited separately, never silently
included in a worktree-zero claim.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parents[2]
DEMO = ROOT / 'browser-demo'
failures = []
external = []
local_refs = []


def check_ref(value, source):
    if re.match(r'^(?:https?:)?//', value, re.I):
        external.append({'file': str(source.relative_to(ROOT)), 'reference': value})
    elif value.startswith(('./', '../')):
        local_refs.append(value)
        if not (source.parent / value).exists():
            failures.append(f'Missing local reference in {source.name}: {value}')


class Requests(HTMLParser):
    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if not value:
                continue
            if key in ('src', 'poster', 'srcset', 'data') or (tag == 'link' and key == 'href'):
                for ref in value.split(',') if key == 'srcset' else [value]:
                    check_ref(ref.strip().split()[0], DEMO / 'index.html')


Requests().feed((DEMO / 'index.html').read_text())
runtime = [p for p in DEMO.rglob('*') if p.suffix in ('.mjs', '.js', '.css', '.html', '.svg', '.json')
           and not any(x in p.parts for x in ('tests', 'evidence')) and p.name != 'asset-manifest.json']
for p in runtime:
    text = p.read_text()
    if p.suffix in ('.js', '.mjs', '.css'):
        # Vendor loaders use computed local paths. Their entire source contains
        # no URL literals; check constants as well as direct fetch/XHR references.
        for match in re.finditer(r'''["']((?:https?:)?//[^"'\s]+)["']''', text):
            # An SVG namespace identifier passed to createElementNS is not a request.
            if match[1] == 'http://www.w3.org/2000/svg' and text[max(0, match.start()-16):match.start()].endswith('createElementNS('):
                continue
            check_ref(match[1], p)
        for pattern in [r'''(?:from\s*|import\s*|fetch\(\s*)["']([^"']+)["']''', r'''url\(\s*["']?([^\s)'";]+)''']:
            for match in re.finditer(pattern, text):
                check_ref(match[1], p)

manifest = json.loads((DEMO / 'vendor/asset-manifest.json').read_text())
for asset in manifest['assets']:
    data = (DEMO / 'vendor' / asset['path']).read_bytes()
    if len(data) != asset['bytes'] or hashlib.sha256(data).hexdigest() != asset['sha256']:
        failures.append('Asset integrity mismatch: ' + asset['path'])

raw = subprocess.check_output(['git', 'ls-files', '-co', '--exclude-standard', '-z'], cwd=ROOT)
files = sorted(set(p.decode() for p in raw.split(b'\0') if p))
terms_file = os.environ.get('PRIVACY_TERMS_FILE')
terms = [s.strip().casefold() for s in Path(terms_file).read_text().splitlines() if s.strip()] if terms_file else []
identity_hits = 0
personal_email_hits = 0
account_links = []
for name in files:
    p = ROOT / name
    if not p.is_file(): continue
    text = p.read_bytes().decode('utf-8', errors='ignore')
    lowered = text.casefold()
    identity_hits += sum(lowered.count(term) for term in terms)
    personal_email_hits += len(re.findall(r'[\w.+-]+@(?:gmail|outlook|hotmail|yahoo|qq|163|126|icloud)\.(?:com|net)', text, re.I))
    for domain, account in re.findall(r'https?://(github\.com|x\.com|twitter\.com|linkedin\.com)/(?:in/)?([\w.-]+)', text):
        # The unchanged, SHA-256-pinned PDF distribution includes its upstream
        # project URL in default metadata. reportPDF replaces that metadata.
        if name == 'browser-demo/vendor/pdf-lib/pdf-lib.esm.min.mjs' and domain == 'github.com' and account == 'Hopding':
            continue
        if account.casefold() not in {'micromotion-labs','google','google-ai-edge','protocolbuffers','emscripten-core','tensorflow','opencv'}:
            account_links.append({'file': name, 'domain': domain})

result = {
    'executed_checks': 5, 'runtime_files_scanned': len(runtime), 'worktree_files_scanned': len(files),
    'checks': ['External runtime request references', 'Local reference existence', 'Vendored asset sizes and SHA-256',
               'Known private identity markers', 'Personal emails and account links'],
    'external_request_references': len(external), 'external_references': external,
    'local_references_checked': len(local_refs), 'vendored_assets_verified': len(manifest['assets']),
    'identity_scan': {'scope': 'All tracked and non-ignored worktree files, including binary bytes; excludes .git history/config',
                      'known_private_markers_supplied': len(terms), 'known_marker_hits': identity_hits,
                      'personal_email_hits': personal_email_hits, 'unreviewed_personal_account_links': len(account_links)},
    'failures': failures, 'failure_classification': 'product_or_packaging_defect' if failures or external or identity_hits or personal_email_hits or account_links else 'none',
}
output = Path(os.environ.get('DEMO_EVIDENCE', DEMO / 'evidence'))
output.mkdir(parents=True, exist_ok=True)
(output / 'static-audit.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
raise SystemExit(bool(failures or external or identity_hits or personal_email_hits or account_links))
