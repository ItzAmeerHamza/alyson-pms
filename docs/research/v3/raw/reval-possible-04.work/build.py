import json, os, sys
V3 = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
batch = json.load(open(os.path.join(V3, "batches/possible-04.json")))
fpath = os.path.join(V3, "raw/reval-possible-04.work/findings.txt")
findings = {}
extra = []
if os.path.exists(fpath):
    for line in open(fpath):
        line = line.strip()
        if not line: continue
        d = json.loads(line)
        if d.get("_extra"):
            d.pop("_extra"); extra.append(d); continue
        findings[(d["company_name"], d["vendor"])] = d
def base(r):
    return {
      "company_name": r["company_name"], "company_domain": r["company_domain"], "industry": r["industry"],
      "hq_country": r["HQ_country"], "employee_count": r["employee_count"], "employee_count_source_url": "",
      "estimated_tracked_seats": "", "vendor": r["competitor_vendor"], "evidence_type": r["evidence_type"],
      "evidence_summary": r["evidence_summary"], "evidence_quote": "", "source_url": r["source_url"],
      "source_publication_date": "", "second_source_url": "", "third_source_url": "",
      "first_detected_date": "", "last_detected_date": "", "theirstack_jobs_count": "",
      "status": "POSSIBLE", "status_reason": "", "confidence_score": 25, "unhappy_type": "",
      "complaint_category": "", "complaint_summary": "", "complaint_url": "", "complaint_date": "",
      "left_tool": "", "now_tool": "", "workforce_signals": r.get("workforce_signals", ""), "contacts": [],
      "company_linkedin": "", "company_phone": "", "public_email": "", "contact_source_url": "",
      "pitch_angle": "", "notes": r.get("notes", ""), "reval_done": False}
out = []
for comp in batch:
    for r in comp:
        rec = base(r)
        f = findings.get((r["company_name"], r["competitor_vendor"]))
        if f:
            for k, v in f.items():
                if k in ("company_name", "vendor"): continue
                if k == "notes_add":
                    rec["notes"] = (rec["notes"] + " | Reval 2026-10-07: " + v).strip(" |"); continue
                rec[k] = v
            rec["reval_done"] = True
        out.append(rec)
for e in extra:
    rec = {k: "" for k in base(batch[0][0])}; rec["contacts"] = []; rec.update(e); rec["reval_done"] = True
    out.append(rec)
json.dump(out, open(os.path.join(V3, "raw/reval-possible-04.json"), "w"), indent=1, ensure_ascii=False)
print(len(out), "records;", sum(1 for o in out if o["reval_done"]), "revalidated")
