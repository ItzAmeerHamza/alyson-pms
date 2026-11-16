import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
V3 = os.path.dirname(os.path.dirname(HERE))
inp = json.load(open(os.path.join(V3, 'batches', 'enrich-gaps-1f.json')))
F = json.load(open(os.path.join(HERE, 'findings.json')))

out = []
for i, c in enumerate(inp):
    f = F.get(str(i))
    if f is None:
        continue
    contacts = f.get('contacts')
    if contacts is None:
        contacts = []
        if c.get('decision_maker'):
            contacts.append({"name": c['decision_maker'], "title": c['decision_maker_title'],
                             "linkedin": c['decision_maker_linkedin'], "source_url": c.get('contact_source_url', '')})
        if c.get('second_contact'):
            contacts.append({"name": c['second_contact'], "title": c['second_contact_title'],
                             "linkedin": c['second_contact_linkedin'], "source_url": c.get('contact_source_url', '')})
    r = {"company_name": c['company_name'], "company_domain": f.get('company_domain', c['company_domain']),
         "vendor": c['competitor_vendor'], "evidence_type": "Contact enrichment",
         "status": f.get('status', ''), "confidence_score": f.get('confidence_score', 0),
         "employee_count": f.get('employee_count', c.get('employee_count', '')),
         "hq_country": f.get('hq_country', c.get('HQ_country', '')),
         "contacts": contacts,
         "company_linkedin": f.get('company_linkedin', c.get('company_linkedin', '')),
         "company_phone": f.get('company_phone', c.get('company_phone', '')),
         "public_email": f.get('public_email', c.get('public_email', '')),
         "contact_source_url": f.get('contact_source_url', c.get('contact_source_url', '')),
         "notes": f.get('notes', '')}
    if f.get('status_reason'):
        r['status_reason'] = f['status_reason']
    out.append(r)
json.dump(out, open(os.path.join(V3, 'raw', 'enrich-gaps-1f.json'), 'w'), indent=1, ensure_ascii=False)
print(len(out), 'records written')
