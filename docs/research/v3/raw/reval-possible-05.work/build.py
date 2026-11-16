import json, os, sys, runpy
V3 = "/Users/revcloudmac/Desktop/alyson-time-doctor/.claude/worktrees/tavilo-research-v3/docs/research/v3"
W = V3 + "/raw/reval-possible-05.work"
batch = json.load(open(V3 + "/batches/possible-05.json"))
ov = runpy.run_path(W + "/overrides.py")["O"]   # key: company_name -> dict(fields) ; extra: list of new records
extra = runpy.run_path(W + "/overrides.py").get("EXTRA", [])
out = []
for comp in batch:
    for r in comp:
        name = r["company_name"]
        if name not in ov: continue
        o = ov[name]
        rec = {
          "company_name": name, "company_domain": r["company_domain"], "industry": r.get("industry",""),
          "hq_country": r.get("HQ_country",""), "employee_count": r.get("employee_count",""),
          "employee_count_source_url": "", "estimated_tracked_seats": "",
          "vendor": r["competitor_vendor"], "evidence_type": r.get("evidence_type",""),
          "evidence_summary": r.get("evidence_summary","") or ("TheirStack technographic listing shows %s as using %s (prior record notes: %s)" % (r["company_name"], r["competitor_vendor"], r.get("notes","")[:200])), "evidence_quote": "",
          "source_url": r.get("source_url",""), "source_publication_date": "",
          "second_source_url": "", "third_source_url": "",
          "first_detected_date": "", "last_detected_date": "", "theirstack_jobs_count": "",
          "status": "POSSIBLE", "status_reason": "", "confidence_score": 25,
          "unhappy_type": "", "complaint_category": "", "complaint_summary": "", "complaint_url": "", "complaint_date": "",
          "left_tool": "", "now_tool": "", "workforce_signals": r.get("workforce_signals",""),
          "contacts": [], "company_linkedin": r.get("company_linkedin",""), "company_phone": "", "public_email": "",
          "contact_source_url": "", "pitch_angle": "", "notes": ""}
        o = dict(o)
        if "_note_prefix_input" in o: o.pop("_note_prefix_input")
        rec.update(o)
        rec["company_name"] = name; rec["company_domain"] = r["company_domain"]; rec["vendor"] = r["competitor_vendor"]
        out.append(rec)
out.extend(extra)
json.dump(out, open(V3 + "/raw/reval-possible-05.json", "w"), indent=1, ensure_ascii=False)
total = sum(len(c) for c in batch)
print(len(out), "records;", len(ov), "of", total, "input rows done")
