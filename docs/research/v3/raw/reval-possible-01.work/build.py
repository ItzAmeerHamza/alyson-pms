import json, os, sys, runpy
HERE = os.path.dirname(os.path.abspath(__file__))
V3 = os.path.abspath(os.path.join(HERE, '..', '..'))
inp = json.load(open(os.path.join(V3, 'batches', 'possible-01.json')))
u = runpy.run_path(os.path.join(HERE, 'updates.py'))
UPD, EXTRA = u['UPD'], u.get('EXTRA', [])
out = []
FIELDS = ["company_name","company_domain","industry","hq_country","employee_count","employee_count_source_url",
 "estimated_tracked_seats","vendor","evidence_type","evidence_summary","evidence_quote","source_url",
 "source_publication_date","second_source_url","third_source_url","first_detected_date","last_detected_date",
 "theirstack_jobs_count","status","status_reason","confidence_score","unhappy_type","complaint_category",
 "complaint_summary","complaint_url","complaint_date","left_tool","now_tool","workforce_signals","contacts",
 "company_linkedin","company_phone","public_email","contact_source_url","pitch_angle","notes"]
done = 0
for comp in inp:
    for r in comp:
        key = (r['company_name'], r['competitor_vendor'])
        rec = {f: "" for f in FIELDS}
        rec.update(company_name=r['company_name'], company_domain=r['company_domain'], industry=r.get('industry',''),
            hq_country=r.get('HQ_country',''), employee_count=r.get('employee_count',''), vendor=r['competitor_vendor'],
            evidence_type=r.get('evidence_type',''), evidence_summary=r.get('evidence_summary',''),
            source_url=r.get('source_url',''), status=r.get('current_status','POSSIBLE'),
            confidence_score=int(float(r.get('confidence_score') or 0)), workforce_signals=r.get('workforce_signals',''),
            company_linkedin=r.get('company_linkedin',''), company_phone=r.get('company_phone',''),
            public_email=r.get('public_email',''), notes=r.get('notes',''), contacts=[])
        if r.get('decision_maker'):
            rec['contacts'] = [{"name": r['decision_maker'], "title": r.get('decision_maker_title',''),
                                "linkedin": r.get('decision_maker_linkedin',''), "source_url": ""}]
        if key in UPD:
            done += 1
            up = dict(UPD[key])
            pn = up.pop('prepend_notes', None)
            rec.update(up)
            if pn: rec['notes'] = pn + ' | PRIOR: ' + r.get('notes','')
            rec['revalidated'] = True
        else:
            rec['revalidated'] = False
        out.append(rec)
out.extend(EXTRA)
json.dump(out, open(os.path.join(V3, 'raw', 'reval-possible-01.json'), 'w'), indent=1, ensure_ascii=False)
print('records', len(out), 'revalidated', done)
