import json, os, sys
D = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(D, '..', 'enrich-gaps-1e.json')
STAGE = os.path.join(D, sys.argv[1] if len(sys.argv) > 1 else 'stage.json')
recs = json.load(open(OUT)) if os.path.exists(OUT) else []
new = json.load(open(STAGE))
names = {r['company_name']: i for i, r in enumerate(recs)}
for r in new:
    base = {"company_name": "", "company_domain": "", "vendor": "", "evidence_type": "Contact enrichment",
            "status": "", "confidence_score": 0, "employee_count": "", "hq_country": "", "contacts": [],
            "company_linkedin": "", "company_phone": "", "public_email": "", "contact_source_url": "", "notes": ""}
    base.update(r)
    if base['company_name'] in names:
        recs[names[base['company_name']]] = base
    else:
        names[base['company_name']] = len(recs)
        recs.append(base)
order=[c['company_name'] for c in json.load(open(os.path.join(D,'..','..','batches','enrich-gaps-1e.json')))]
recs.sort(key=lambda x: order.index(x['company_name']) if x['company_name'] in order else 999)
json.dump(recs, open(OUT, 'w'), indent=1, ensure_ascii=False)
print(len(recs), 'records')
