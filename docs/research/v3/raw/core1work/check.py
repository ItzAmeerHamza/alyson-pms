import json
B = '/Users/revcloudmac/Desktop/alyson-time-doctor/.claude/worktrees/tavilo-research-v3/docs/research/v3'
inp = json.load(open(B + '/batches/theirstack-core-1.json'))
out = json.load(open(B + '/raw/reval-theirstack-core-1.json'))
for i, (a, b) in enumerate(zip(inp, out)):
    if i < 16 or a['competitor_vendor'] != b['vendor']:
        print(i, a['company_name'], '|', a['competitor_vendor'], '=>', b['company_name'], '|', b['vendor'], '|', b['status'])
t = [r for r in out if r['status'] != 'DO_NOT_TARGET']
print('targetable', len(t))
print('dm', sum(1 for r in t if any(c['name'] for c in r['contacts'])))
print('li', sum(1 for r in t if any(c['linkedin'] for c in r['contacts'])))
print('phone', sum(1 for r in t if r['company_phone']))
print('email', sum(1 for r in t if r['public_email']))
print('complaint', [r['company_name'] for r in out if r['unhappy_type']])
