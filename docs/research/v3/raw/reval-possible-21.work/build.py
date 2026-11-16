import json, os, sys
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.abspath(os.path.join(here, '..', '..'))
batch = json.load(open(os.path.join(root, 'batches', 'possible-21.json')))
sys.path.insert(0, here)
import importlib.util
spec = importlib.util.spec_from_file_location('decisions', os.path.join(here, 'decisions.py'))
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
D = mod.D
out = []
for comp in batch:
    for r in comp:
        key = (r['company_name'], r['competitor_vendor'])
        if key not in D:
            continue
        d = D[key]
        rec = {
          "company_name": r['company_name'], "company_domain": r['company_domain'],
          "industry": r.get('industry',''), "hq_country": r.get('HQ_country',''),
          "employee_count": r.get('employee_count',''), "employee_count_source_url": "",
          "estimated_tracked_seats": "", "vendor": r['competitor_vendor'],
          "evidence_type": r.get('evidence_type',''), "evidence_summary": r.get('evidence_summary',''),
          "evidence_quote": "", "source_url": r.get('source_url',''), "source_publication_date": "",
          "second_source_url": "", "third_source_url": "",
          "first_detected_date": "", "last_detected_date": "", "theirstack_jobs_count": "",
          "status": "", "status_reason": "", "confidence_score": 0,
          "unhappy_type": "", "complaint_category": "", "complaint_summary": "", "complaint_url": "", "complaint_date": "",
          "left_tool": "", "now_tool": "", "workforce_signals": r.get('workforce_signals',''),
          "contacts": [], "company_linkedin": "", "company_phone": "", "public_email": "",
          "contact_source_url": "", "pitch_angle": "", "notes": ""}
        for k, v in d.items():
            rec[k] = v
        out.append(rec)
p = os.path.join(root, 'raw', 'reval-possible-21.json')
json.dump(out, open(p, 'w'), indent=1, ensure_ascii=False)
total = sum(len(c) for c in batch)
from collections import Counter
print(len(out), 'of', total, Counter(o['status'] for o in out))
