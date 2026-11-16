import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
V3 = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from decisions import D  # dict: company_name -> overrides

batch = json.load(open(os.path.join(V3, 'batches', 'possible-11.json')))
TS = "Technographic signal — requires validation"
out = []
for comp in batch:
    for r in comp:
        d = D.get(r['company_name'])
        if d is None:
            continue
        rec = {
            "company_name": r['company_name'], "company_domain": r['company_domain'],
            "industry": r.get('industry', ''), "hq_country": r.get('HQ_country', ''),
            "employee_count": r.get('employee_count', ''), "employee_count_source_url": "",
            "estimated_tracked_seats": "", "vendor": r['competitor_vendor'],
            "evidence_type": TS, "evidence_summary": "TheirStack lists the company under this vendor; no corroborating public source found.",
            "evidence_quote": "", "source_url": r.get('source_url', ''), "source_publication_date": "",
            "second_source_url": "", "third_source_url": "",
            "first_detected_date": "", "last_detected_date": "", "theirstack_jobs_count": "",
            "status": "POSSIBLE", "status_reason": "TheirStack-only signal; no independent evidence found.",
            "confidence_score": 25, "unhappy_type": "", "complaint_category": "", "complaint_summary": "",
            "complaint_url": "", "complaint_date": "", "left_tool": "", "now_tool": "",
            "workforce_signals": r.get('workforce_signals', ''), "contacts": [],
            "company_linkedin": r.get('company_linkedin', ''), "company_phone": "", "public_email": "",
            "contact_source_url": "", "pitch_angle": "", "notes": "",
        }
        rec.update(d)
        out.append(rec)

path = os.path.join(V3, 'raw', 'reval-possible-11.json')
with open(path, 'w') as f:
    json.dump(out, f, indent=1, ensure_ascii=False)
from collections import Counter
print(len(out), 'records', Counter(x['status'] for x in out))
missing = [r['company_name'] for c in batch for r in c if r['company_name'] not in D]
print('remaining', len(missing))
