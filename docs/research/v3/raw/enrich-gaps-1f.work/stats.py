import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
V3 = os.path.dirname(os.path.dirname(HERE))
inp = json.load(open(os.path.join(V3, 'batches', 'enrich-gaps-1f.json')))
out = json.load(open(os.path.join(V3, 'raw', 'enrich-gaps-1f.json')))
byname = {r['company_name']: r for r in out}
g = dict(dm=0, li=0, cli=0, ph=0, em=0, second=0)
for c in inp:
    r = byname[c['company_name']]
    if r.get('status') == 'DO_NOT_TARGET':
        continue
    if not c['decision_maker'] and r['contacts']: g['dm'] += 1
    had_li = bool(c['decision_maker_linkedin'] or c['second_contact_linkedin'])
    in_li = {c['decision_maker_linkedin'], c['second_contact_linkedin']} - {''}
    new_li = {x['linkedin'] for x in r['contacts']} - {''} - in_li
    if new_li: g['li'] += 1
    if not c['company_linkedin'] and r['company_linkedin']: g['cli'] += 1
    if not c['company_phone'] and r['company_phone']: g['ph'] += 1
    if not c['public_email'] and r['public_email']: g['em'] += 1
    if not c['second_contact'] and len(r['contacts']) >= 2: g['second'] += 1
print(g)
print('DNT', [r['company_name'] for r in out if r['status']])
tot = dict(dm=sum(1 for r in out if r['contacts']), li=sum(1 for r in out if any(x['linkedin'] for x in r['contacts'])),
           ph=sum(1 for r in out if r['company_phone']), em=sum(1 for r in out if r['public_email']), cli=sum(1 for r in out if r['company_linkedin']))
print('totals', tot)
