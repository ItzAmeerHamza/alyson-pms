import json, os
here = os.path.dirname(os.path.abspath(__file__))
v3 = os.path.join(here, '..', '..')
inp = json.load(open(os.path.join(v3, 'batches', 'enrich-gaps-1g.json')))
out = json.load(open(os.path.join(v3, 'raw', 'enrich-gaps-1g.json')))
assert len(inp) == len(out)
g = dict(dm=0, li=0, cli=0, ph=0, em=0, second=0)
for i, o in zip(inp, out):
    m = i['missing']
    if 'decision_maker' in m and o['contacts']: g['dm'] += 1
    if 'decision_maker_linkedin' in m and o['contacts'] and o['contacts'][0].get('linkedin'): g['li'] += 1
    if 'company_linkedin' in m and o['company_linkedin']: g['cli'] += 1
    if 'company_phone' in m and o['company_phone']: g['ph'] += 1
    if 'public_email' in m and o['public_email']: g['em'] += 1
    if 'second_contact' in m and len(o['contacts']) > 1: g['second'] += 1
print(g)
