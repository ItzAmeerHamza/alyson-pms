import json, glob, os
W = os.path.dirname(os.path.abspath(__file__))
V3 = os.path.dirname(os.path.dirname(W))
inp = json.load(open(os.path.join(V3, 'batches/enrich-gaps-1h.json')))
order = {r['company_name']: i for i, r in enumerate(inp)}
recs = {}
for f in sorted(glob.glob(os.path.join(W, 'part*.json'))):
    for r in json.load(open(f)):
        assert r['company_name'] in order, r['company_name']
        base = {"company_name": "", "company_domain": "", "vendor": "", "evidence_type": "Contact enrichment",
                "status": "", "confidence_score": 0, "employee_count": "", "hq_country": "", "contacts": [],
                "company_linkedin": "", "company_phone": "", "public_email": "", "contact_source_url": "", "notes": ""}
        src = inp[order[r['company_name']]]
        base.update({"company_domain": src.get('company_domain', ''), "vendor": src['competitor_vendor'],
                     "employee_count": src.get('employee_count', ''), "hq_country": src.get('HQ_country', ''),
                     "company_linkedin": src.get('company_linkedin', ''), "company_phone": src.get('company_phone', ''),
                     "public_email": src.get('public_email', ''), "contact_source_url": src.get('contact_source_url', '')})
        r = {k: v for k, v in r.items() if k != 'confidence_score'}  # enrichment doesn't re-score evidence
        base.update(r)
        recs[r['company_name']] = base
out = [recs[n] for n in sorted(recs, key=lambda n: order[n])]
json.dump(out, open(os.path.join(V3, 'raw/enrich-gaps-1h.json'), 'w'), indent=1, ensure_ascii=False)
done = set(recs)
left = [r['company_name'] for r in inp if r['company_name'] not in done]
st = dict(records=len(out), with_decision_maker=sum(1 for r in out if r['contacts']),
          with_personal_linkedin=sum(1 for r in out if any(c.get('linkedin') for c in r['contacts'])),
          with_phone=sum(1 for r in out if r['company_phone']), with_email=sum(1 for r in out if r['public_email']),
          do_not_target=sum(1 for r in out if r['status'] == 'DO_NOT_TARGET'))
with open(os.path.join(V3, 'raw/enrich-gaps-1h.progress.md'), 'w') as f:
    f.write('# enrich-gaps-1h progress\n\n')
    f.write(f'Stats: {st}\n\nDone ({len(done)}):\n' + ''.join(f'- {n}\n' for n in sorted(done, key=lambda n: order[n])))
    f.write(f'\nLeft ({len(left)}):\n' + ''.join(f'- {n}\n' for n in left))
print(st, 'left', len(left))
