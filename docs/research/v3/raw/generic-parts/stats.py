import json, os
from collections import Counter
HERE = os.path.dirname(os.path.abspath(__file__))
out = json.load(open(os.path.join(HERE, '..', 'reval-theirstack-generic.json')))
co = [r for r in out if not r['company_name'].startswith('__TECH_VERDICT__')]
print('records', len(out), 'companies', len(co), 'verdicts', len(out) - len(co))
print('status', Counter(r['status'] for r in co))
tgt = [r for r in co if r['status'] in ('CURRENT', 'PROBABLE')]
print('dm', sum(1 for r in tgt if r.get('contacts')), 'li', sum(1 for r in tgt if any(c.get('linkedin') for c in r.get('contacts', []))),
      'phone', sum(1 for r in tgt if r.get('company_phone')), 'email', sum(1 for r in tgt if r.get('public_email')))
for r in sorted(tgt, key=lambda r: -r.get('confidence_score', 0)):
    print(r['status'], r['confidence_score'], r['vendor'], r['company_name'])
print(Counter((r['vendor'], r['status']) for r in co if r['status'] != 'DO_NOT_TARGET').most_common(40))
