import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
V3 = os.path.abspath(os.path.join(HERE, '..', '..'))
batch = json.load(open(os.path.join(V3, 'batches', 'possible-08.json')))
dec = {}
exec(open(os.path.join(HERE, 'decisions.py.txt')).read())  # defines dec
TODAY = '2026-10-07'
out = []
for comp in batch:
    for r in comp:
        d = dec.get(r['company_name'])
        if d is None:
            continue
        rec = {
          "company_name": r['company_name'], "company_domain": r['company_domain'],
          "industry": r['industry'], "hq_country": r['HQ_country'],
          "employee_count": r['employee_count'], "employee_count_source_url": "",
          "estimated_tracked_seats": "", "vendor": r['competitor_vendor'],
          "evidence_type": d.get('evidence_type', r['evidence_type']),
          "evidence_summary": d.get('evidence_summary', r['evidence_summary']),
          "evidence_quote": d.get('evidence_quote', ''),
          "source_url": d.get('source_url', r['source_url']),
          "source_publication_date": d.get('source_publication_date', ''),
          "second_source_url": d.get('second_source_url', ''), "third_source_url": d.get('third_source_url', ''),
          "first_detected_date": "", "last_detected_date": "", "theirstack_jobs_count": "",
          "status": d['status'], "status_reason": d['status_reason'],
          "confidence_score": d['confidence'],
          "unhappy_type": "", "complaint_category": "", "complaint_summary": "", "complaint_url": "", "complaint_date": "",
          "left_tool": "", "now_tool": "",
          "workforce_signals": d.get('workforce_signals', ''),
          "contacts": d.get('contacts', []),
          "company_linkedin": d.get('company_linkedin', ''), "company_phone": d.get('company_phone', ''),
          "public_email": d.get('public_email', ''), "contact_source_url": d.get('contact_source_url', ''),
          "pitch_angle": d.get('pitch_angle', ''),
          "notes": d['notes'] + (" | Original TheirStack source: " + r['source_url'] if d.get('source_url') and d.get('source_url') != r['source_url'] else '') + f" | Re-validated {TODAY} (wave 3, possible-08).",
        }
        out.append(rec)
json.dump(out, open(os.path.join(V3, 'raw', 'reval-possible-08.json'), 'w'), indent=1, ensure_ascii=False)
total = sum(len(c) for c in batch)
from collections import Counter
print(len(out), 'of', total, Counter(x['status'] for x in out))
missing = [r['company_name'] for c in batch for r in c if r['company_name'] not in dec]
print('missing:', missing)
