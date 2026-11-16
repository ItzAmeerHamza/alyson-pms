import json, os, sys, importlib.util
V3 = "/Users/revcloudmac/Desktop/alyson-time-doctor/.claude/worktrees/tavilo-research-v3/docs/research/v3"
W = V3 + "/raw/reval-possible-22.work"
spec = importlib.util.spec_from_file_location("dec", W + "/decisions.py"); dec = importlib.util.module_from_spec(spec); spec.loader.exec_module(dec)
batch = json.load(open(V3 + "/batches/possible-22.json"))
TS = "https://theirstack.com/en/technology/homebase"
out = []
for comp in batch:
    rows = comp if isinstance(comp, list) else [comp]
    for r in rows:
        name = r["company_name"]
        d = dec.D.get(name)
        if d is None: continue
        rec = {
          "company_name": name, "company_domain": r.get("company_domain",""), "industry": r.get("industry",""),
          "hq_country": d.get("hq_country", r.get("HQ_country") or ""), "employee_count": d.get("employee_count", r.get("employee_count","")),
          "employee_count_source_url": d.get("employee_count_source_url",""), "estimated_tracked_seats": "",
          "vendor": r["competitor_vendor"], "evidence_type": "Technographic signal — requires validation",
          "evidence_summary": r.get("evidence_summary",""), "evidence_quote": "",
          "source_url": r.get("source_url") or TS, "source_publication_date": "",
          "second_source_url": d.get("second_source_url",""), "third_source_url": "",
          "first_detected_date": "", "last_detected_date": "", "theirstack_jobs_count": "",
          "status": d["status"], "status_reason": d["reason"], "confidence_score": d.get("conf", 10 if d["status"]=="POSSIBLE" else 0),
          "unhappy_type": "", "complaint_category": "", "complaint_summary": "", "complaint_url": "", "complaint_date": "",
          "left_tool": "", "now_tool": "", "workforce_signals": d.get("ws",""), "contacts": [],
          "company_linkedin": "", "company_phone": "", "public_email": "", "contact_source_url": "",
          "pitch_angle": "", "notes": "Reval possible-22 (2026-10-07): " + d["notes"] + " | Homebase = joinhomebase.com, US/Canada hourly scheduling & time-clock app; TheirStack 'homebase' tech (11,748 companies) is collision-prone. Original row: " + (r.get("source_url") or TS),
        }
        out.append(rec)
json.dump(out, open(V3 + "/raw/reval-possible-22.json", "w"), indent=1, ensure_ascii=False)
print(len(out), "records")
