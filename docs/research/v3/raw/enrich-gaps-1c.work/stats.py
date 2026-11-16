import json, os
V3 = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
inp = json.load(open(os.path.join(V3, 'batches', 'enrich-gaps-1c.json')))
out = json.load(open(os.path.join(V3, 'raw', 'enrich-gaps-1c.json')))
g = {'dm': [], 'second': [], 'li': [], 'co_li': [], 'phone': [], 'email': []}
for c, r in zip(inp, out):
    assert c['company_name'] == r['company_name']
    names_before = {c['decision_maker'], c['second_contact']} - {''}
    li_before = {c['decision_maker_linkedin'], c['second_contact_linkedin']} - {''}
    cs = r['contacts']
    if cs and cs[0]['name'] != c['decision_maker']: g['dm'].append(c['company_name'])
    if len(cs) > 1 and not c['second_contact'] and 'second_contact' in c['missing']: g['second'].append(c['company_name'])
    if any(x['linkedin'] and x['linkedin'] not in li_before for x in cs): g['li'].append(c['company_name'])
    if r['company_linkedin'] and not c['company_linkedin']: g['co_li'].append(c['company_name'])
    if r['company_phone'] and not c['company_phone']: g['phone'].append(c['company_name'])
    if r['public_email'] and not c['public_email']: g['email'].append(c['company_name'])
for k, v in g.items():
    print(k, len(v), v)
print('total', len(out), 'DNT', sum(1 for r in out if r['status']))
