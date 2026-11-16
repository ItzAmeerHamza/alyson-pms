import json, os, sys, importlib.util
W = os.path.dirname(os.path.abspath(__file__))
V3 = os.path.dirname(os.path.dirname(W))
batch = json.load(open(os.path.join(V3, 'batches/possible-12.json')))
spec = importlib.util.spec_from_file_location('findings', os.path.join(W, 'findings.py'))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
F = m.F  # dict: index -> dict of overrides (+ optional 'extra': [records])
KEYS = ["company_name","company_domain","industry","hq_country","employee_count","employee_count_source_url",
 "estimated_tracked_seats","vendor","evidence_type","evidence_summary","evidence_quote","source_url",
 "source_publication_date","second_source_url","third_source_url","first_detected_date","last_detected_date",
 "theirstack_jobs_count","status","status_reason","confidence_score","unhappy_type","complaint_category",
 "complaint_summary","complaint_url","complaint_date","left_tool","now_tool","workforce_signals","contacts",
 "company_linkedin","company_phone","public_email","contact_source_url","pitch_angle","notes"]
out = []
done = 0
for i, comp in enumerate(batch):
    for r in comp:
        rec = {k: "" for k in KEYS}; rec["contacts"] = []
        rec.update(company_name=r["company_name"], company_domain=r["company_domain"], industry=r.get("industry",""),
            hq_country=r.get("HQ_country",""), employee_count=r.get("employee_count",""), vendor=r["competitor_vendor"],
            evidence_type=r.get("evidence_type",""), evidence_summary=r.get("evidence_summary",""), source_url=r.get("source_url",""),
            status=r.get("current_status","POSSIBLE"), confidence_score=int(r.get("confidence_score") or 0),
            workforce_signals=r.get("workforce_signals",""), company_linkedin=r.get("company_linkedin",""),
            company_phone=r.get("company_phone",""), public_email=r.get("public_email",""), notes=r.get("notes",""))
        if r.get("decision_maker"):
            rec["contacts"] = [{"name": r["decision_maker"], "title": r.get("decision_maker_title",""), "linkedin": r.get("decision_maker_linkedin",""), "source_url": ""}]
        f = F.get(i)
        if f is None:
            rec["notes"] = "NOT YET RE-CHECKED (wave 3). " + rec["notes"]
        else:
            done += 1
            ov = {k: v for k, v in f.items() if k != 'extra'}
            if 'notes' in ov:
                ov['notes'] = ov['notes'] + " | Prior notes: " + rec['notes']
            rec.update(ov)
            # copy-exact fields
            rec["company_name"] = r["company_name"]; rec["company_domain"] = r["company_domain"]; rec["vendor"] = r["competitor_vendor"]
        out.append(rec)
    for x in (F.get(i) or {}).get('extra', []):
        rec = {k: "" for k in KEYS}; rec["contacts"] = []; rec.update(x); out.append(rec)
json.dump(out, open(os.path.join(V3, 'raw/reval-possible-12.json'), 'w'), indent=1, ensure_ascii=False)
print(len(out), 'records;', done, 'companies re-checked of', len(batch))
