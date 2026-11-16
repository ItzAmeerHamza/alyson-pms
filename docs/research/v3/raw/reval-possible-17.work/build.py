import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
V3 = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
from decisions import D  # dict: index -> overrides

inp = json.load(open(os.path.join(V3, 'batches', 'possible-17.json')))
rows = [r for c in inp for r in c]
TODAY = '2026-10-07'
out = []
for i, r in enumerate(rows):
    if i not in D:
        continue
    d = D[i]
    rec = {
        "company_name": r['company_name'], "company_domain": r['company_domain'],
        "industry": d.get('industry', r.get('industry', '')),
        "hq_country": d.get('hq_country', r.get('HQ_country', '')),
        "employee_count": d.get('employee_count', r.get('employee_count', '')),
        "employee_count_source_url": d.get('employee_count_source_url', ''),
        "estimated_tracked_seats": d.get('estimated_tracked_seats', ''),
        "vendor": r['competitor_vendor'],
        "evidence_type": d.get('evidence_type', r.get('evidence_type', '')),
        "evidence_summary": d.get('evidence_summary', r.get('evidence_summary', '')),
        "evidence_quote": d.get('evidence_quote', ''),
        "source_url": d.get('source_url', r.get('source_url', '')),
        "source_publication_date": d.get('source_publication_date', ''),
        "second_source_url": d.get('second_source_url', ''), "third_source_url": d.get('third_source_url', ''),
        "first_detected_date": "", "last_detected_date": "", "theirstack_jobs_count": "",
        "status": d['status'], "status_reason": d['status_reason'],
        "confidence_score": d['confidence_score'],
        "unhappy_type": d.get('unhappy_type', ''), "complaint_category": d.get('complaint_category', ''),
        "complaint_summary": d.get('complaint_summary', ''), "complaint_url": d.get('complaint_url', ''),
        "complaint_date": d.get('complaint_date', ''),
        "left_tool": d.get('left_tool', ''), "now_tool": d.get('now_tool', ''),
        "workforce_signals": d.get('workforce_signals', r.get('workforce_signals', '') or ''),
        "contacts": d.get('contacts', []),
        "company_linkedin": d.get('company_linkedin', ''), "company_phone": d.get('company_phone', ''),
        "public_email": d.get('public_email', ''), "contact_source_url": d.get('contact_source_url', ''),
        "pitch_angle": d.get('pitch_angle', ''),
        "notes": ("Reval possible-17 (" + TODAY + "): " + d.get('notes', '')).strip(),
    }
    out.append(rec)
p = os.path.join(V3, 'raw', 'reval-possible-17.json')
json.dump(out, open(p, 'w'), indent=1, ensure_ascii=False)
print('wrote', len(out), 'of', len(rows))
