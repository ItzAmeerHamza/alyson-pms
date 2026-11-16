import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
from decisions import D  # dict keyed by (company_name, vendor)

batch = json.load(open(os.path.join(ROOT, 'batches', 'possible-15.json')))
TODAY = '2026-10-07'
out = []
for comp in batch:
    for r in comp:
        key = (r['company_name'], r['competitor_vendor'])
        d = D.get(key)
        if d is None:
            continue
        rec = {
            "company_name": r['company_name'], "company_domain": r['company_domain'],
            "industry": r.get('industry', ''), "hq_country": r.get('HQ_country', ''),
            "employee_count": "", "employee_count_source_url": "",
            "estimated_tracked_seats": "",
            "vendor": r['competitor_vendor'],
            "evidence_type": r.get('evidence_type', ''),
            "evidence_summary": r.get('evidence_summary', ''),
            "evidence_quote": "",
            "source_url": r.get('source_url', ''), "source_publication_date": "",
            "second_source_url": "", "third_source_url": "",
            "first_detected_date": "", "last_detected_date": "", "theirstack_jobs_count": "",
            "status": "POSSIBLE", "status_reason": "", "confidence_score": 30, "prior_notes": r.get('notes',''),
            "unhappy_type": "", "complaint_category": "", "complaint_summary": "",
            "complaint_url": "", "complaint_date": "", "left_tool": "", "now_tool": "",
            "workforce_signals": r.get('workforce_signals', ''),
            "contacts": [],
            "company_linkedin": r.get('company_linkedin',''), "company_phone": r.get('company_phone',''), "public_email": r.get('public_email',''),
            "contact_source_url": "", "pitch_angle": "", "notes": "",
        }
        extra = dict(d)
        extra_records = extra.pop('_extra', [])
        rec.update(extra)
        prior = rec.pop('prior_notes')
        rec['notes'] = (rec['notes'] + f' | Re-validated {TODAY} (reval-possible-15).' + (' | Prior notes: ' + prior if prior else '')).strip(' |')
        out.append(rec)
        for x in extra_records:
            e = dict(rec); e.update(x); out.append(e)

json.dump(out, open(os.path.join(ROOT, 'raw', 'reval-possible-15.json'), 'w'), indent=1, ensure_ascii=False)
total_in = sum(len(c) for c in batch)
done = sum(1 for c in batch for r in c if (r['company_name'], r['competitor_vendor']) in D)
print(f'wrote {len(out)} records; input rows covered {done}/{total_in}')
from collections import Counter
print(Counter(o['status'] for o in out))
