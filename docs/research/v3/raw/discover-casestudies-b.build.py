# Builds discover-casestudies-b.json from per-vendor record files in discover-casestudies-b.src/*.py
import json, glob, os, re, runpy
from collections import Counter
D = os.path.dirname(os.path.abspath(__file__))
KEYS = ["company_name","company_domain","industry","hq_country","employee_count","employee_count_source_url",
 "estimated_tracked_seats","vendor","evidence_type","evidence_summary","evidence_quote","source_url",
 "source_publication_date","second_source_url","third_source_url","first_detected_date","last_detected_date",
 "theirstack_jobs_count","status","status_reason","confidence_score","unhappy_type","complaint_category",
 "complaint_summary","complaint_url","complaint_date","left_tool","now_tool","workforce_signals","contacts",
 "company_linkedin","company_phone","public_email","contact_source_url","pitch_angle","notes"]
known = {l.strip().lower() for l in open(os.path.join(D,"..","known-companies.txt")) if l.strip()}
def norm(s): return re.sub(r'[^a-z0-9]','',s.lower().replace('llc','').replace(' inc',''))
knorm = {norm(k) for k in known}
out = []
for f in sorted(glob.glob(os.path.join(D,"discover-casestudies-b.src","*.py"))):
    for r in runpy.run_path(f)["RECS"]:
        rec = {k: ([] if k=="contacts" else (0 if k=="confidence_score" else "")) for k in KEYS}
        rec.update(r)
        rec["first_detected_date"] = rec["first_detected_date"] or "2026-10-05"
        rec["last_detected_date"] = rec["last_detected_date"] or "2026-10-05"
        isk = rec["company_name"].lower() in known or norm(rec["company_name"]) in knorm
        if isk and "known company" not in rec["notes"]:
            rec["notes"] = ("known company — not enriched. " + rec["notes"]).strip()
        out.append({k: rec[k] for k in KEYS})
json.dump(out, open(os.path.join(D,"discover-casestudies-b.json"),"w"), indent=1, ensure_ascii=False)
nt = [r for r in out if r["status"]!="DO_NOT_TARGET" and "known company" not in r["notes"]]
print(len(out), dict(Counter(r["status"] for r in out)))
print(dict(Counter(r["vendor"] for r in out)))
print("new non-DNT:", len(nt), "dm:", sum(1 for r in nt if r["contacts"]),
      "li:", sum(1 for r in nt if any("linkedin.com/in/" in c.get("linkedin","") for c in r["contacts"])),
      "phone:", sum(1 for r in nt if r["company_phone"]), "email:", sum(1 for r in nt if r["public_email"]))
