import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
out = json.load(open(os.path.join(HERE, '..', 'enrich-gaps-1i.json')))
batch = {c['company_name']: c for c in json.load(open(os.path.join(HERE, '..', '..', 'batches', 'enrich-gaps-1i.json')))}
g = {'dm': 0, 'li': 0, 'phone': 0, 'email': 0, 'co_li': 0, 'second': 0}
have = {'dm': 0, 'li': 0, 'phone': 0, 'email': 0}
for r in out:
    c = batch[r['company_name']]
    m = set(c['missing'])
    contacts = r.get('contacts', [])
    if contacts: have['dm'] += 1
    if any(x.get('linkedin') for x in contacts): have['li'] += 1
    if r.get('company_phone'): have['phone'] += 1
    if r.get('public_email'): have['email'] += 1
    if 'decision_maker' in m and contacts: g['dm'] += 1
    if ('decision_maker_linkedin' in m or 'second_contact_linkedin' in m) and any(x.get('linkedin') for x in contacts): g['li'] += 1
    if 'second_contact' in m and len(contacts) >= 2: g['second'] += 1
    if 'company_phone' in m and r.get('company_phone'): g['phone'] += 1
    if 'public_email' in m and r.get('public_email'): g['email'] += 1
    if 'company_linkedin' in m and r.get('company_linkedin'): g['co_li'] += 1
print('records', len(out), 'DNT', sum(1 for r in out if r.get('status') == 'DO_NOT_TARGET'))
print('gained', g)
print('have', have)
