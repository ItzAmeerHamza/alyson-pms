import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from decisions import D  # noqa

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
batch = json.load(open(os.path.join(BASE, "batches", "possible-18.json")))
TODAY = "2026-10-07"
out = []
for comp in batch:
    for r in comp:
        d = D.get((r["company_name"], r["competitor_vendor"]))
        if d is None:
            continue
        rec = {
            "company_name": r["company_name"], "company_domain": r["company_domain"],
            "industry": r.get("industry", ""), "hq_country": r.get("HQ_country", ""),
            "employee_count": r.get("employee_count", ""), "employee_count_source_url": "",
            "estimated_tracked_seats": "",
            "vendor": r["competitor_vendor"],
            "evidence_type": r.get("evidence_type", ""),
            "evidence_summary": r.get("evidence_summary", "") or ("TheirStack lists %s as using %s (technographic only)." % (r["company_name"], r["competitor_vendor"])),
            "evidence_quote": "",
            "source_url": r.get("source_url", ""), "source_publication_date": "",
            "second_source_url": "", "third_source_url": "",
            "first_detected_date": "", "last_detected_date": "", "theirstack_jobs_count": "",
            "status": "POSSIBLE", "status_reason": "", "confidence_score": 25,
            "unhappy_type": "", "complaint_category": "", "complaint_summary": "",
            "complaint_url": "", "complaint_date": "", "left_tool": "", "now_tool": "",
            "workforce_signals": r.get("workforce_signals", ""),
            "contacts": [],
            "company_linkedin": r.get("company_linkedin", ""), "company_phone": "",
            "public_email": "", "contact_source_url": "",
            "pitch_angle": "", "notes": "",
        }
        rec.update(d)
        rec["notes"] = ("Re-validated %s (wave 3). " % TODAY) + rec["notes"]
        out.append(rec)
json.dump(out, open(os.path.join(BASE, "raw", "reval-possible-18.json"), "w"), indent=1, ensure_ascii=False)
total = sum(len(c) for c in batch)
from collections import Counter
print(len(out), "of", total, Counter(o["status"] for o in out))
