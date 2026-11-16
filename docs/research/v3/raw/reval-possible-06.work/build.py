import json, os
D = os.path.dirname(os.path.abspath(__file__))
V3 = os.path.abspath(os.path.join(D, '..', '..'))
batch = json.load(open(os.path.join(V3, 'batches', 'possible-06.json')))
dec = {}
p = os.path.join(D, 'decisions.txt')
if os.path.exists(p):
    for line in open(p):
        line = line.strip()
        if line:
            o = json.loads(line)
            dec[(o['company_name'], o.get('vendor'))] = o
out = []
for comp in batch:
    for r in comp:
        key = (r['company_name'], r['competitor_vendor'])
        if key not in dec:
            continue
        o = dec[key]
        rec = {
          "company_name": r['company_name'], "company_domain": r['company_domain'],
          "industry": r.get('industry',''), "hq_country": r.get('HQ_country',''),
          "employee_count": r.get('employee_count',''), "employee_count_source_url": "",
          "estimated_tracked_seats": "", "vendor": r['competitor_vendor'],
          "evidence_type": r.get('evidence_type',''), "evidence_summary": r.get('evidence_summary',''),
          "evidence_quote": "", "source_url": r.get('source_url',''), "source_publication_date": "",
          "second_source_url": "", "third_source_url": "", "first_detected_date": "",
          "last_detected_date": "", "theirstack_jobs_count": "", "status": "POSSIBLE",
          "status_reason": "", "confidence_score": 25, "unhappy_type": "", "complaint_category": "",
          "complaint_summary": "", "complaint_url": "", "complaint_date": "", "left_tool": "",
          "now_tool": "", "workforce_signals": r.get('workforce_signals',''), "contacts": [],
          "company_linkedin": r.get('company_linkedin',''), "company_phone": "",
          "public_email": "", "contact_source_url": "", "pitch_angle": "", "notes": ""}
        for k, v in o.items():
            if k in ('company_name', 'vendor'): continue
            rec[k] = v
        out.append(rec)
    # extra records (different vendor) for this company
    for (cn, vn), o in dec.items():
        if cn == comp[0]['company_name'] and vn not in [x['competitor_vendor'] for x in comp]:
            rec = dict(o); rec['company_domain'] = comp[0]['company_domain']
            out.append(rec)
json.dump(out, open(os.path.join(V3, 'raw', 'reval-possible-06.json'), 'w'), indent=1, ensure_ascii=False)
print(len(out), 'records written')
