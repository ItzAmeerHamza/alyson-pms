import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
V3 = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import glob, importlib
U = {}
for f in sorted(glob.glob(os.path.join(HERE, 'data*.py'))):
    U.update(importlib.import_module(os.path.basename(f)[:-3]).U)

inp = json.load(open(os.path.join(V3, 'batches', 'enrich-gaps-1b.json')))
out = []
for i, c in enumerate(inp):
    if i not in U:
        continue
    u = U[i]
    rec = {
        "company_name": c["company_name"], "company_domain": c["company_domain"],
        "vendor": c["competitor_vendor"], "evidence_type": "Contact enrichment",
        "status": "", "confidence_score": 0,
        "employee_count": c.get("employee_count", ""), "hq_country": c.get("HQ_country", ""),
        "contacts": [],
        "company_linkedin": c["company_linkedin"], "company_phone": c["company_phone"],
        "public_email": c["public_email"], "contact_source_url": c["contact_source_url"],
        "notes": "",
    }
    rec.update(u)
    out.append(rec)

json.dump(out, open(os.path.join(V3, 'raw', 'enrich-gaps-1b.json'), 'w'), indent=1, ensure_ascii=False)
print(len(out), 'records written')
