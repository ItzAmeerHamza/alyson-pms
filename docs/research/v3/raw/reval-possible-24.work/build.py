import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
V3 = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
from decisions import D
inp = json.load(open(os.path.join(V3, 'batches', 'possible-24.json')))
out = []
missing = []
for grp in inp:
    for r in grp:
        key = (r['company_name'], r['competitor_vendor'])
        d = D.get(key)
        if d is None:
            missing.append(key); continue
        rec = {
          "company_name": r['company_name'], "company_domain": r['company_domain'],
          "industry": r.get('industry',''), "hq_country": r.get('HQ_country',''),
          "employee_count": r.get('employee_count',''), "employee_count_source_url": "",
          "estimated_tracked_seats": "", "vendor": r['competitor_vendor'],
          "evidence_type": r.get('evidence_type',''), "evidence_summary": r.get('evidence_summary',''),
          "evidence_quote": "", "source_url": r.get('source_url',''), "source_publication_date": "",
          "second_source_url": "", "third_source_url": "",
          "first_detected_date": "", "last_detected_date": "", "theirstack_jobs_count": "",
          "status": "POSSIBLE", "status_reason": "", "confidence_score": 20,
          "unhappy_type": "", "complaint_category": "", "complaint_summary": "", "complaint_url": "", "complaint_date": "",
          "left_tool": "", "now_tool": "", "workforce_signals": r.get('workforce_signals',''),
          "contacts": [], "company_linkedin": "", "company_phone": "", "public_email": "", "contact_source_url": "",
          "pitch_angle": "", "notes": ""}
        if not rec['evidence_summary']:
            rec['evidence_summary'] = "TheirStack lists %s among companies using %s (public TheirStack page only)." % (r['company_name'], r['competitor_vendor'])
        extra = d.pop('_extra', None) if isinstance(d, dict) else None
        rec.update(d)
        old = r.get('notes','')
        rec['notes'] = (rec['notes'] + ' | Re-validated 2026-10-07 (reval-possible-24). | Prior notes: ' + old).strip(' |')
        out.append(rec)
        if extra:
            for e in extra:
                x = dict(rec); x.update(e); out.append(x)
json.dump(out, open(os.path.join(V3, 'raw', 'reval-possible-24.json'), 'w'), indent=1, ensure_ascii=False)
print('written', len(out), 'missing', len(missing))
for m in missing: print('  todo', m)
