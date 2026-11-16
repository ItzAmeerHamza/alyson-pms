import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
V3 = os.path.abspath(os.path.join(HERE, '..', '..'))
batch = json.load(open(os.path.join(V3, 'batches', 'possible-09.json')))
decisions = {}
p = os.path.join(HERE, 'decisions.jsonl.txt')
if os.path.exists(p):
    for line in open(p):
        line = line.strip()
        if line:
            d = json.loads(line); decisions[d['company_name']] = d
KEYS = ["company_name","company_domain","industry","hq_country","employee_count","employee_count_source_url",
"estimated_tracked_seats","vendor","evidence_type","evidence_summary","evidence_quote","source_url",
"source_publication_date","second_source_url","third_source_url","first_detected_date","last_detected_date",
"theirstack_jobs_count","status","status_reason","confidence_score","unhappy_type","complaint_category",
"complaint_summary","complaint_url","complaint_date","left_tool","now_tool","workforce_signals","contacts",
"company_linkedin","company_phone","public_email","contact_source_url","pitch_angle","notes"]
out = []
done = 0
for comp in batch:
    for r in comp:
        rec = {k: "" for k in KEYS}; rec["contacts"] = []
        rec.update({"company_name": r["company_name"], "company_domain": r.get("company_domain",""),
            "industry": r.get("industry",""), "hq_country": r.get("HQ_country") or r.get("hq_country",""),
            "employee_count": r.get("employee_count",""), "vendor": r["competitor_vendor"],
            "evidence_type": r.get("evidence_type",""), "evidence_summary": r.get("evidence_summary",""),
            "source_url": r.get("source_url",""), "status": "POSSIBLE", "confidence_score": 30,
            "notes": "NOT YET RE-VALIDATED (reval-possible-09). " + r.get("notes","")})
        d = decisions.get(r["company_name"])
        if d:
            done += 1
            for k, v in d.items():
                if k in ("company_name",): continue
                rec[k] = v
            rec["company_domain"] = r.get("company_domain","")  # keep exact
            rec["vendor"] = r["competitor_vendor"]
        out.append(rec)
json.dump(out, open(os.path.join(V3, 'raw', 'reval-possible-09.json'), 'w'), ensure_ascii=False, indent=1)
from collections import Counter
print(len(out), 'records;', done, 'validated;', Counter(x['status'] for x in out if x['company_name'] in decisions))
