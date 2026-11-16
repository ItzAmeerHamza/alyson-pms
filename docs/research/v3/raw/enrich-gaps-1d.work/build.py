import json, os, importlib.util
H = os.path.dirname(os.path.abspath(__file__))
V3 = os.path.abspath(os.path.join(H, '..', '..'))
inp = json.load(open(os.path.join(V3, 'batches', 'enrich-gaps-1d.json')))
spec = importlib.util.spec_from_file_location('u', os.path.join(H, 'updates.py'))
u = importlib.util.module_from_spec(spec); spec.loader.exec_module(u)
U = u.U
p2 = os.path.join(H, 'updates2.py')
if os.path.exists(p2):
    s2 = importlib.util.spec_from_file_location('u2', p2)
    u2 = importlib.util.module_from_spec(s2); s2.loader.exec_module(u2)
    U.update(u2.U)
out = []
stats = dict(dm=0, li=0, phone=0, email=0)
for i, c in enumerate(inp):
    if i not in U:
        continue
    x = U[i]
    rec = {
        "company_name": c['company_name'], "company_domain": x.get('company_domain', c['company_domain']),
        "vendor": c['competitor_vendor'], "evidence_type": "Contact enrichment",
        "status": x.get('status', ''), "confidence_score": x.get('confidence_score', 0),
        "employee_count": x.get('employee_count', c.get('employee_count', '')),
        "hq_country": x.get('hq_country', c.get('HQ_country', '')),
        "contacts": [dict(name=a[0], title=a[1], linkedin=a[2], source_url=a[3]) for a in x['contacts']],
        "company_linkedin": x.get('company_linkedin', c['company_linkedin']),
        "company_phone": x.get('company_phone', c['company_phone']),
        "public_email": x.get('public_email', c['public_email']),
        "contact_source_url": x.get('contact_source_url', c['contact_source_url']),
        "notes": x.get('notes', ''),
    }
    if x.get('status_reason'):
        rec['status_reason'] = x['status_reason']
    # gains vs input
    if not c['decision_maker'] and rec['contacts']:
        stats['dm'] += 1
    old_li = {c['decision_maker_linkedin'], c['second_contact_linkedin']} - {''}
    if any(k['linkedin'] and k['linkedin'] not in old_li for k in rec['contacts']):
        stats['li'] += 1
    if not c['company_phone'] and rec['company_phone']:
        stats['phone'] += 1
    if not c['public_email'] and rec['public_email']:
        stats['email'] += 1
    out.append(rec)
json.dump(out, open(os.path.join(V3, 'raw', 'enrich-gaps-1d.json'), 'w'), indent=1, ensure_ascii=False)
print(len(out), 'records', stats)
