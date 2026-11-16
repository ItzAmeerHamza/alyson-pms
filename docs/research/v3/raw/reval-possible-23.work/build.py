import json, os, importlib.util
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.abspath(os.path.join(here, '..', '..'))
batch = json.load(open(os.path.join(root, 'batches', 'possible-23.json')))
spec = importlib.util.spec_from_file_location('findings', os.path.join(here, 'findings.py'))
F = importlib.util.module_from_spec(spec); spec.loader.exec_module(F)
out = []
for comp in batch:
    for r in comp:
        key = (r['company_name'], r['competitor_vendor'])
        f = F.FINDINGS.get(key)
        if f is None:
            continue
        rec = {
          "company_name": r['company_name'], "company_domain": r['company_domain'],
          "industry": r['industry'], "hq_country": r['HQ_country'],
          "employee_count": r['employee_count'], "employee_count_source_url": "",
          "estimated_tracked_seats": "", "vendor": r['competitor_vendor'],
          "evidence_type": r['evidence_type'], "evidence_summary": r['evidence_summary'],
          "evidence_quote": "", "source_url": r['source_url'], "source_publication_date": "",
          "second_source_url": "", "third_source_url": "",
          "first_detected_date": "", "last_detected_date": "", "theirstack_jobs_count": "",
          "status": "POSSIBLE", "status_reason": "", "confidence_score": 20,
          "unhappy_type": "", "complaint_category": "", "complaint_summary": "",
          "complaint_url": "", "complaint_date": "", "left_tool": "", "now_tool": "",
          "workforce_signals": r.get('workforce_signals', ''), "contacts": [],
          "company_linkedin": "", "company_phone": "", "public_email": "",
          "contact_source_url": "", "pitch_angle": "",
          "notes": "", "revalidated": True,
        }
        prior = r.get('notes', '')
        rec.update({k: v for k, v in f.items() if k != 'notes'})
        rec['notes'] = 'Reval 2026-10-07: ' + f.get('notes', '') + ' | PRIOR: ' + prior
        out.append(rec)
json.dump(out, open(os.path.join(root, 'raw', 'reval-possible-23.json'), 'w'), indent=1, ensure_ascii=False)
from collections import Counter
print(len(out), Counter(o['status'] for o in out))
