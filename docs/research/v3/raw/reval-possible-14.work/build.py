import json, os
V3 = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
W = os.path.join(V3, 'raw', 'reval-possible-14.work')
batch = json.load(open(os.path.join(V3, 'batches', 'possible-14.json')))
upd = {}
p = os.path.join(W, 'updates.txt')
if os.path.exists(p):
    for line in open(p):
        line = line.strip()
        if not line: continue
        u = json.loads(line)
        upd[(u['company_name'], u['vendor'])] = u
out = []
for comp in batch:
    for r in comp:
        k = (r['company_name'], r['competitor_vendor'])
        if k not in upd: continue
        u = upd[k]
        rec = {
          "company_name": r['company_name'], "company_domain": r['company_domain'],
          "industry": r.get('industry',''), "hq_country": r.get('HQ_country',''),
          "employee_count": r.get('employee_count',''), "employee_count_source_url": "",
          "estimated_tracked_seats": "", "vendor": r['competitor_vendor'],
          "evidence_type": r.get('evidence_type',''), "evidence_summary": r.get('evidence_summary',''),
          "evidence_quote": "", "source_url": r.get('source_url',''), "source_publication_date": "",
          "second_source_url": "", "third_source_url": "", "first_detected_date": "",
          "last_detected_date": "", "theirstack_jobs_count": "", "status": "POSSIBLE",
          "status_reason": "", "confidence_score": 0, "unhappy_type": "", "complaint_category": "",
          "complaint_summary": "", "complaint_url": "", "complaint_date": "", "left_tool": "",
          "now_tool": "", "workforce_signals": r.get('workforce_signals',''), "contacts": [],
          "company_linkedin": r.get('company_linkedin',''), "company_phone": r.get('company_phone',''),
          "public_email": r.get('public_email',''), "contact_source_url": "", "pitch_angle": "",
          "notes": ""}
        for kk, vv in u.items():
            if kk in ('company_name','vendor'): continue
            rec[kk] = vv
        rec['company_domain'] = u.get('company_domain_override', r['company_domain']) if False else r['company_domain']
        out.append(rec)
# extra records (other vendors found)
ep = os.path.join(W, 'extra.txt')
if os.path.exists(ep):
    for line in open(ep):
        if line.strip(): out.append(json.loads(line))
json.dump(out, open(os.path.join(V3, 'raw', 'reval-possible-14.json'), 'w'), indent=1, ensure_ascii=False)
total = sum(len(c) for c in batch)
print(len(out), 'records;', len(upd), 'of', total, 'input rows done')
