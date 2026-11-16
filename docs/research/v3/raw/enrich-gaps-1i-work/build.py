import json, os, glob
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'enrich-gaps-1i.json')
BATCH = os.path.join(HERE, '..', '..', 'batches', 'enrich-gaps-1i.json')
batch = json.load(open(BATCH))
recs = {}
for f in sorted(glob.glob(os.path.join(HERE, 'r_*.json'))):
    for r in json.load(open(f)):
        recs[r['company_name']] = r
out = []
for c in batch:
    r = recs.get(c['company_name'])
    if not r:
        continue
    base = {"company_name": c['company_name'], "company_domain": c.get('company_domain', ''),
            "vendor": c['competitor_vendor'], "evidence_type": "Contact enrichment", "status": "",
            "confidence_score": 0, "employee_count": c.get('employee_count', ''),
            "hq_country": c.get('HQ_country', ''), "contacts": [],
            "company_linkedin": c.get('company_linkedin', ''), "company_phone": c.get('company_phone', ''),
            "public_email": c.get('public_email', ''), "contact_source_url": c.get('contact_source_url', ''),
            "notes": ""}
    base.update(r)
    out.append(base)
json.dump(out, open(OUT, 'w'), indent=1, ensure_ascii=False)
print(len(out), 'records written of', len(batch))
missing = [c['company_name'] for c in batch if c['company_name'] not in recs]
print('remaining:', missing)
