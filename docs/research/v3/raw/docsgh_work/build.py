import json, glob, os
from collections import Counter
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "discover-docs-github.json")
FIELDS = ["company_name","company_domain","industry","hq_country","employee_count","employee_count_source_url","estimated_tracked_seats","vendor","evidence_type","evidence_summary","evidence_quote","source_url","source_publication_date","second_source_url","third_source_url","first_detected_date","last_detected_date","theirstack_jobs_count","status","status_reason","confidence_score","unhappy_type","complaint_category","complaint_summary","complaint_url","complaint_date","left_tool","now_tool","workforce_signals","contacts","company_linkedin","company_phone","public_email","contact_source_url","pitch_angle","notes"]
recs = []
for f in sorted(glob.glob(os.path.join(HERE, "recs_*.json"))):
    for r in json.load(open(f)):
        full = {k: "" for k in FIELDS}
        full["contacts"] = []
        full["confidence_score"] = 0
        full.update(r)
        for k in ("first_detected_date", "last_detected_date"):
            if not full[k]:
                full[k] = "2026-10-05"
        recs.append(full)
# later files override earlier ones for the same company+vendor
dedup = {}
for r in recs:
    dedup[(r["company_name"].lower(), r["vendor"].lower())] = r
recs = list(dedup.values())
json.dump(recs, open(OUT, "w"), indent=1, ensure_ascii=False)
print(len(recs), Counter(r["status"] for r in recs))
print("contacts", sum(1 for r in recs if r["contacts"]), "li", sum(1 for r in recs if any(c.get("linkedin") for c in r["contacts"])), "phone", sum(1 for r in recs if r["company_phone"]), "email", sum(1 for r in recs if r["public_email"]))
