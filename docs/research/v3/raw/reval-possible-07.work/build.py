import json, os, sys, runpy

HERE = os.path.dirname(os.path.abspath(__file__))
V3 = os.path.abspath(os.path.join(HERE, '..', '..'))
batch = json.load(open(os.path.join(V3, 'batches', 'possible-07.json')))
D = runpy.run_path(os.path.join(HERE, 'decisions.py'))['DECISIONS']
TODAY = '2026-10-07'

SCHEMA = ["company_name", "company_domain", "industry", "hq_country", "employee_count",
          "employee_count_source_url", "estimated_tracked_seats", "vendor", "evidence_type",
          "evidence_summary", "evidence_quote", "source_url", "source_publication_date",
          "second_source_url", "third_source_url", "first_detected_date", "last_detected_date",
          "theirstack_jobs_count", "status", "status_reason", "confidence_score", "unhappy_type",
          "complaint_category", "complaint_summary", "complaint_url", "complaint_date", "left_tool",
          "now_tool", "workforce_signals", "contacts", "company_linkedin", "company_phone",
          "public_email", "contact_source_url", "pitch_angle", "notes"]

out = []
missing = []
for comp in batch:
    for r in comp:
        key = r['company_name']
        if key not in D:
            missing.append(key)
            continue
        d = D[key]
        rec = {k: "" for k in SCHEMA}
        rec['contacts'] = []
        rec.update({
            'company_name': r['company_name'], 'company_domain': r['company_domain'],
            'industry': r['industry'], 'hq_country': r['HQ_country'],
            'employee_count': r['employee_count'], 'vendor': r['competitor_vendor'],
            'evidence_type': r['evidence_type'], 'evidence_summary': r['evidence_summary'],
            'source_url': r['source_url'],
        })
        ts_note = ('Original TheirStack row: ' + r['source_url'] + ' (TheirStack tech "homebase", 11748 companies; '
                   'likely name-collision-prone).')
        # TheirStack source is kept as second source when new evidence replaces it
        if d.get('source_url') and d['source_url'] != r['source_url']:
            d.setdefault('second_source_url', r['source_url'])
        for k, v in d.items():
            if k in ('company_name', 'company_domain', 'vendor'):
                continue
            rec[k] = v
        if 'status' not in d:
            rec['status'] = 'POSSIBLE'
        rec['confidence_score'] = int(rec['confidence_score'] or 0)
        rec['notes'] = (rec['notes'] + ' | ' if rec['notes'] else '') + ts_note + ' Re-validated ' + TODAY + '.'
        out.append(rec)

dest = os.path.join(V3, 'raw', 'reval-possible-07.json')
json.dump(out, open(dest, 'w'), indent=1, ensure_ascii=False)
from collections import Counter
print('written', len(out), 'missing', len(missing))
print(Counter(x['status'] for x in out))
if '--missing' in sys.argv:
    print(missing)
