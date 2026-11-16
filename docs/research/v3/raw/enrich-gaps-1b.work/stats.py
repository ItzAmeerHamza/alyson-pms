import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
V3 = os.path.dirname(os.path.dirname(HERE))
inp = json.load(open(os.path.join(V3, 'batches', 'enrich-gaps-1b.json')))
out = {r['company_name']: r for r in json.load(open(os.path.join(V3, 'raw', 'enrich-gaps-1b.json')))}
g = dict(dm=[], second=[], dm_li=[], co_li=[], phone=[], email=[])
for c in inp:
    r = out.get(c['company_name'])
    if not r:
        print('MISSING RECORD', c['company_name']); continue
    m = c['missing']
    cs = r['contacts']
    if 'decision_maker' in m and cs and cs[0]['name']:
        g['dm'].append(c['company_name'])
    if 'second_contact' in m and len([x for x in cs if x['name']]) >= 2:
        g['second'].append(c['company_name'])
    if 'decision_maker_linkedin' in m and cs and cs[0]['linkedin']:
        g['dm_li'].append(c['company_name'])
    if 'company_linkedin' in m and r['company_linkedin']:
        g['co_li'].append(c['company_name'])
    if 'company_phone' in m and r['company_phone']:
        g['phone'].append(c['company_name'])
    if 'public_email' in m and r['public_email']:
        g['email'].append(c['company_name'])
print('records', len(out))
for k, v in g.items():
    print(k, len(v), v)
print('status set:', [r['company_name'] for r in out.values() if r['status']])
