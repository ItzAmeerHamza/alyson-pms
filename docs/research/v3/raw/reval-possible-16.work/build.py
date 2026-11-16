import json, os, sys
W = os.path.dirname(os.path.abspath(__file__))
V3 = os.path.dirname(os.path.dirname(W))
sys.path.insert(0, W)
import importlib.util
spec = importlib.util.spec_from_file_location("ov", os.path.join(W, "overrides.txt.py"))
ov = importlib.util.module_from_spec(spec); spec.loader.exec_module(ov)
batch = json.load(open(os.path.join(V3, "batches", "possible-16.json")))
out = []
done = 0
for comp in batch:
    for r in comp:
        key = (r["company_name"], r["competitor_vendor"])
        rec = {
          "company_name": r["company_name"], "company_domain": r["company_domain"],
          "industry": r.get("industry",""), "hq_country": r.get("HQ_country",""),
          "employee_count": r.get("employee_count",""), "employee_count_source_url": "",
          "estimated_tracked_seats": "", "vendor": r["competitor_vendor"],
          "evidence_type": r.get("evidence_type",""), "evidence_summary": r.get("evidence_summary",""),
          "evidence_quote": "", "source_url": r.get("source_url",""), "source_publication_date": "",
          "second_source_url": "", "third_source_url": "",
          "first_detected_date": "", "last_detected_date": "", "theirstack_jobs_count": "",
          "status": "POSSIBLE", "status_reason": "", "confidence_score": int(r.get("confidence_score") or 0),
          "unhappy_type": "", "complaint_category": "", "complaint_summary": "", "complaint_url": "", "complaint_date": "",
          "left_tool": "", "now_tool": "", "workforce_signals": r.get("workforce_signals",""),
          "contacts": [], "company_linkedin": r.get("company_linkedin",""), "company_phone": r.get("company_phone",""),
          "public_email": r.get("public_email",""), "contact_source_url": "", "pitch_angle": "",
          "notes": r.get("notes",""), "_rechecked": False,
        }
        if r.get("decision_maker"):
            rec["contacts"] = [{"name": r["decision_maker"], "title": r.get("decision_maker_title",""),
                                "linkedin": r.get("decision_maker_linkedin",""), "source_url": ""}]
        o = ov.OV.get(key)
        if o:
            rec.update(o); rec["_rechecked"] = True; done += 1
        out.append(rec)
    for k in ov.EXTRA.get(comp[0]["company_name"], []):
        out.append(k)
# only write rechecked rows + pending marked
for rec in out:
    if not rec.pop("_rechecked", True):
        rec["notes"] = "[NOT YET RECHECKED in wave 3] " + rec["notes"]
json.dump(out, open(os.path.join(V3, "raw", "reval-possible-16.json"), "w"), indent=1, ensure_ascii=False)
print(len(out), "records;", done, "rechecked")
