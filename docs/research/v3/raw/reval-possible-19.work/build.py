import json, os, sys
ROOT = "/Users/revcloudmac/Desktop/alyson-time-doctor/.claude/worktrees/tavilo-research-v3/docs/research/v3"
batch = json.load(open(f"{ROOT}/batches/possible-19.json"))
import glob
dec = {}
for f in sorted(glob.glob(f"{ROOT}/raw/reval-possible-19.work/dec-*.txt")):
    dec.update(json.load(open(f)))
TODAY = "2026-10-07"
out = []
for comp in batch:
    for r in comp:
        key = r["company_name"] + "||" + r["competitor_vendor"]
        if key not in dec:
            continue
        d = dec[key]
        rec = {
            "company_name": r["company_name"], "company_domain": r["company_domain"],
            "industry": d.get("industry", r.get("industry", "")),
            "hq_country": d.get("hq_country", r.get("HQ_country", "")),
            "employee_count": d.get("employee_count", r.get("employee_count", "")),
            "employee_count_source_url": d.get("employee_count_source_url", ""),
            "estimated_tracked_seats": "",
            "vendor": r["competitor_vendor"],
            "evidence_type": d.get("evidence_type", r.get("evidence_type", "")),
            "evidence_summary": d.get("evidence_summary", r.get("evidence_summary", "")),
            "evidence_quote": d.get("evidence_quote", ""),
            "source_url": d.get("source_url", r.get("source_url", "")),
            "source_publication_date": d.get("source_publication_date", ""),
            "second_source_url": d.get("second_source_url", ""), "third_source_url": "",
            "first_detected_date": "", "last_detected_date": TODAY, "theirstack_jobs_count": "",
            "status": d["status"], "status_reason": d["status_reason"],
            "confidence_score": d.get("confidence_score", 0),
            "unhappy_type": "", "complaint_category": "", "complaint_summary": "", "complaint_url": "", "complaint_date": "",
            "left_tool": "", "now_tool": "",
            "workforce_signals": d.get("workforce_signals", ""),
            "contacts": d.get("contacts", []),
            "company_linkedin": d.get("company_linkedin", r.get("company_linkedin", "")),
            "company_phone": d.get("company_phone", ""), "public_email": d.get("public_email", ""),
            "contact_source_url": d.get("contact_source_url", ""),
            "pitch_angle": d.get("pitch_angle", ""),
            "notes": d.get("notes", ""),
        }
        out.append(rec)
json.dump(out, open(f"{ROOT}/raw/reval-possible-19.json", "w"), indent=1, ensure_ascii=False)
print(len(out), "records;", sum(len(c) for c in batch), "input rows")
