import json, os
D = os.path.dirname(os.path.abspath(__file__))
r = json.load(open(os.path.join(D, '..', 'enrich-gaps-1e.json')))
b = json.load(open(os.path.join(D, '..', '..', 'batches', 'enrich-gaps-1e.json')))
print(len(r), len(b), set(x['company_name'] for x in b) - set(x['company_name'] for x in r))
print('with dm', sum(1 for x in r if x['contacts']), 'with personal li', sum(1 for x in r if any(c['linkedin'] for c in x['contacts'])),
      'phone', sum(1 for x in r if x['company_phone']), 'email', sum(1 for x in r if x['public_email']),
      'coLI', sum(1 for x in r if x['company_linkedin']), 'DNT', sum(1 for x in r if x['status']))
bi = {x['company_name']: x for x in b}
g = {k: [] for k in ['dm', 'li', 'phone', 'email', 'coli', 'second']}
for x in r:
    i = bi[x['company_name']]
    if not i['decision_maker'] and x['contacts']: g['dm'].append(x['company_name'])
    old = {i['decision_maker_linkedin'], i['second_contact_linkedin']} - {''}
    if any(c['linkedin'] and c['linkedin'] not in old for c in x['contacts']): g['li'].append(x['company_name'])
    if not i['company_phone'] and x['company_phone']: g['phone'].append(x['company_name'])
    if not i['public_email'] and x['public_email']: g['email'].append(x['company_name'])
    if not i['company_linkedin'] and x['company_linkedin']: g['coli'].append(x['company_name'])
    if not i['second_contact'] and len(x['contacts']) > 1: g['second'].append(x['company_name'])
for k, v in g.items():
    print(k, len(v), v)
