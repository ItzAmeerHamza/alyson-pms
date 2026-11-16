import json, os
here = os.path.dirname(os.path.abspath(__file__))
import glob
recs = []
lines = []
for p in sorted(glob.glob(os.path.join(here, 'recs*.jsonl'))):
    lines += open(p).read().splitlines()
if True:
    for line in lines:
        line = line.strip()
        if line:
            r = json.loads(line)
            base = {"company_name": "", "company_domain": "", "vendor": "", "evidence_type": "Contact enrichment",
                    "status": "", "confidence_score": 0, "employee_count": "", "hq_country": "", "contacts": [],
                    "company_linkedin": "", "company_phone": "", "public_email": "", "contact_source_url": "", "notes": ""}
            base.update(r)
            recs.append(base)
out = os.path.join(here, '..', 'enrich-gaps-1g.json')
json.dump(recs, open(out, 'w'), indent=1, ensure_ascii=False)
print(len(recs), 'records')
dm = sum(1 for r in recs if r['contacts'])
li = sum(1 for r in recs if any(c.get('linkedin') for c in r['contacts']))
ph = sum(1 for r in recs if r['company_phone'])
em = sum(1 for r in recs if r['public_email'])
print('dm', dm, 'li', li, 'phone', ph, 'email', em)
