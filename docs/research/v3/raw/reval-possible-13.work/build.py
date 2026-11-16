import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
V3 = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
from findings import F  # dict: (company_name, vendor) -> overrides

batch = json.load(open(os.path.join(V3, 'batches', 'possible-13.json')))
out = []
missing = []
for comp in batch:
    for r in comp:
        key = (r['company_name'], r['competitor_vendor'])
        if key not in F:
            missing.append(key)
            continue
        o = F[key]
        rec = {
            "company_name": r['company_name'], "company_domain": r['company_domain'],
            "industry": r.get('industry', ''), "hq_country": r.get('HQ_country', ''),
            "employee_count": "", "employee_count_source_url": "", "estimated_tracked_seats": "",
            "vendor": r['competitor_vendor'], "evidence_type": r.get('evidence_type', ''),
            "evidence_summary": r.get('evidence_summary', ''), "evidence_quote": "",
            "source_url": r.get('source_url', ''), "source_publication_date": "",
            "second_source_url": "", "third_source_url": "",
            "first_detected_date": "", "last_detected_date": "", "theirstack_jobs_count": "",
            "status": "POSSIBLE", "status_reason": "", "confidence_score": 0,
            "unhappy_type": "", "complaint_category": "", "complaint_summary": "", "complaint_url": "",
            "complaint_date": "", "left_tool": "", "now_tool": "",
            "workforce_signals": r.get('workforce_signals', ''), "contacts": [],
            "company_linkedin": "", "company_phone": "", "public_email": "", "contact_source_url": "",
            "pitch_angle": "", "notes": "",
        }
        for k, v in o.items():
            if k not in rec:
                raise SystemExit(f"bad key {k} for {key}")
            rec[k] = v
        rec['company_name'] = r['company_name']; rec['company_domain'] = r['company_domain']; rec['vendor'] = r['competitor_vendor']
        out.append(rec)
json.dump(out, open(os.path.join(V3, 'raw', 'reval-possible-13.json'), 'w'), indent=1, ensure_ascii=False)
print(len(out), 'records written;', len(missing), 'rows still to do')
