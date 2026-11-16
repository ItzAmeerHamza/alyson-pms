import json, os, glob
V3 = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
W = os.path.join(V3, 'raw', 'enrich-gaps-1c.work')
inp = json.load(open(os.path.join(V3, 'batches', 'enrich-gaps-1c.json')))
upd = {}
for f in sorted(glob.glob(os.path.join(W, 'u*.json'))):
    for k, v in json.load(open(f)).items():
        upd[int(k)] = v
out = []
for i, c in enumerate(inp):
    if i not in upd:
        continue
    u = upd[i]
    contacts = u.get('contacts')
    if contacts is None:
        contacts = []
        for n, t, l in [('decision_maker', 'decision_maker_title', 'decision_maker_linkedin'),
                        ('second_contact', 'second_contact_title', 'second_contact_linkedin')]:
            if c.get(n):
                contacts.append({'name': c[n], 'title': c[t], 'linkedin': c[l], 'source_url': c['source_url']})
    r = {'company_name': c['company_name'], 'company_domain': u.get('company_domain', c['company_domain']),
         'vendor': c['competitor_vendor'], 'evidence_type': 'Contact enrichment',
         'status': u.get('status', ''), 'confidence_score': u.get('confidence_score', 70),
         'employee_count': u.get('employee_count', c['employee_count']),
         'hq_country': u.get('hq_country', c['HQ_country']),
         'contacts': contacts}
    for k in ['company_linkedin', 'company_phone', 'public_email', 'contact_source_url']:
        r[k] = u.get(k, c[k])
    if 'status_reason' in u:
        r['status_reason'] = u['status_reason']
    r['notes'] = u.get('notes', '')
    out.append(r)
json.dump(out, open(os.path.join(V3, 'raw', 'enrich-gaps-1c.json'), 'w'), indent=1, ensure_ascii=False)
print(len(out), 'records written')
