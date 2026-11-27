"""Independent development-only PDF verification. Private inputs stay outside repos."""
import json
import os
from pathlib import Path
import re
import sys
import pymupdf

pdf_path, json_path = map(Path, sys.argv[1:3])
report = json.loads(json_path.read_text())
doc = pymupdf.open(pdf_path)
assert pdf_path.read_bytes().startswith(b'%PDF-'), 'Not a PDF file'
assert not doc.is_repaired and not doc.is_encrypted
assert len(doc) >= 5, 'Unexpected page count'
normalize = lambda value: ' '.join(value.split())
pages = [normalize(p.get_text()) for p in doc]
text = ' '.join(pages)
sections = ['Session report', 'Session & Data Quality', 'Session information',
            'Data quality checks', 'Data quality notes', 'Demonstration Signals',
            'Signal observations', 'SDK Parameter Register', 'Complete parameter register',
            'Reference notes', 'Signal Interpretation & Reading Notes',
            'Signal interpretation', 'Reading notes']
assert all(section in text for section in sections)
assert 'Demonstration proxies, not SDK parameters.' in text
assert 'position within this session only' in text
assert text.count('Demonstration only. No emotion or health assessment.') == len(doc)
assert doc.metadata['author'] == ''
assert doc.metadata['creator'] == doc.metadata['producer'] == 'Local report export'
assert all(not p.get_links() for p in doc) and doc.embfile_count() == 0
assert not any('/JavaScript' in doc.xref_object(i) for i in range(1, doc.xref_length()))

def number(value):
    return format(value, '.15g') if value is not None else 'Unavailable'

def find_page(marker):
    for i, page_text in enumerate(pages):
        if marker in page_text:
            return i
    raise AssertionError(f'Missing page marker: {marker}')

cover = pages[0]
signals_page = pages[find_page('Signal observations')]
register_pages = [pages[i] for i in range(len(doc)) if 'Reference range (v1.0)' in pages[i]]
assert register_pages, 'Register page not found'
register_text = ' '.join(register_pages)
interp_start = find_page('Signal Interpretation & Reading Notes')
interp_text = ' '.join(pages[interp_start:])

metric_checks = stat_checks = interpretation_checks = 0
for m in report['demo_metrics'].values():
    value = f"{number(m['value'])} {m['unit']}" if m['value'] is not None else 'Unavailable'
    assert normalize(f"{m['label']} {value}") in signals_page, m['label']
    metric_checks += 1
    for stat in ('mean', 'min', 'max'):
        assert number(m[stat]) in signals_page, (m['label'], stat)
        stat_checks += 1
    assert f'Current reading: {value}' in interp_text
    assert normalize(m['description']) in interp_text
    if m['value'] is None:
        assert normalize(m['reason']) in interp_text
    elif m['min'] == m['max']:
        assert f"constant at {number(m['min'])} {m['unit']}" in interp_text
    else:
        ratio = 100 * (m['value'] - m['min']) / (m['max'] - m['min'])
        assert f"range of {number(m['min'])} to {number(m['max'])} {m['unit']}" in interp_text
        assert f'{ratio:.1f}% of the way' in interp_text
    interpretation_checks += 1

session_checks = 0
for value in [report['session']['started_at'], report['generated_at'],
              f"{number(report['session']['elapsed_seconds'])} s",
              str(report['session']['valid_frames'])]:
    assert str(value) in cover
    session_checks += 1
assert ('Synthetic sample (artificial landmarks)' if report['synthetic'] else 'Camera session') in cover
session_checks += 1
quality_text = pages[find_page('Data quality checks')]
for value in [f"{number(report['session']['valid_tracking_seconds'])} s",
              str(report['session']['missing_frames']), str(report['session']['blink_count'])]:
    assert value in quality_text
    session_checks += 1

# Independent constants, transcribed from the sole v1.0 standard (not runtime data).
ranges = [(15,45),(10,40),(10,38),(12,42),(25,65),(45,80),(35,78),(40,80),
          (35,75),(45,85),(10,40),(40,80),(-5,5),(20,50),(0,6.5),(10,20)]
caps = [None,None,53.6,52.7,6.5]
source = os.environ.get('PDF_STANDARD_FILE')
source_checks = 0
if source:
    md = Path(source).read_text()
    rows = re.findall(r'^\| (\d\d) \| `([^`]+)` \|.*?\| (?:NEG|POS|NEU) \| ([−\d.]+) \| ([\d.]+) \|', md, re.M)
    assert len(rows) == 16
    for i, (_, key, lo, hi) in enumerate(rows):
        assert key == report['items'][i]['key']
        assert (float(lo.replace('−','-')), float(hi)) == ranges[i]
        source_checks += 1
    raw = re.findall(r'^\| (1[789]|2[01]) \| `([^`]+)` \|.*?\| (—|[\d.]+) \| C2 \|', md, re.M)
    assert len(raw) == 5
    for i, (_, key, cap) in enumerate(raw):
        assert key == report['items'][i+16]['key']
        assert (None if cap == '—' else float(cap)) == caps[i]
        source_checks += 1

result = 'Not computed in this demo — available in the SDK'
assert result in register_text
assert set(re.findall(r'\bU\d\d\b', register_text)) == {f'U{i:02d}' for i in range(1, 22)}
assert register_text.count('—') >= 21 * 5
for i, item in enumerate(report['items']):
    assert item['u'] in register_text and item['name_en'] in register_text
    if i < 16:
        lo, hi = ranges[i]
        expected = f'{number(lo)} to {number(hi)}'
        if i == 11: expected += ' (provisional)'
        if i == 14: expected += ' (empirical upper limit)'
        assert (item['standard_reference']['min'],item['standard_reference']['max']) == (lo,hi)
    else:
        cap = caps[i-16]
        expected = 'Not established' + (f'; empirical upper limit {number(cap)}' if cap is not None else '')
        assert item['standard_reference']['min'] is item['standard_reference']['max'] is None
        assert item['standard_reference']['empirical_max'] == cap
    assert expected in register_text, (item['u'], expected)
    assert all(item[field] is None for field in ['raw','display','mean','std','vi','detect_min','detect_max','ref_min','ref_max'])
    assert item['level'] == 'unavailable'

spans = 0
for i, page in enumerate(doc):
    assert f'{i+1} / {len(doc)}' in pages[i]
    for block in page.get_text('dict')['blocks']:
        for line in block.get('lines', []):
            for span in line['spans']:
                x0,y0,x1,y1 = span['bbox']
                assert 31 <= x0 < x1 <= 564 and 10 <= y0 < y1 <= 815, (i,span['text'])
                spans += 1

scans = {}
private = os.environ.get('PDF_PRIVATE_TERMS_FILE')
if private:
    haystack = normalize(text + ' ' + json.dumps(doc.metadata)).casefold()
    for category, terms in json.loads(Path(private).read_text()).items():
        hits = sum(bool(re.search(r'(?<![\w.])'+re.escape(normalize(term).casefold())+r'(?![\w.])',haystack)) for term in terms)
        scans[category] = {'terms':len(terms), 'hits':hits}
        assert hits == 0, f'Private scan failed: {category}; {hits} matches (values withheld)'

summary = {'pages':len(doc),'section_titles':len(sections),'proxy_values_compared':metric_checks,
           'proxy_statistics_compared':stat_checks,'proxy_interpretations_compared':interpretation_checks,
           'session_fields_compared':session_checks,'sdk_rows':21,'sdk_names_compared':21,'sdk_ranges_compared':21,
           'source_standard_rows_compared':source_checks,'sdk_uncomputed_results':21,'footers':len(doc),
           'text_spans_within_page_bounds':spans,'brand_and_sample_scans':scans,'active_content':0,
           'metadata_unbranded':True,'pdf_bytes':pdf_path.stat().st_size,'parser':'PyMuPDF '+pymupdf.VersionBind}
print(json.dumps(summary))
