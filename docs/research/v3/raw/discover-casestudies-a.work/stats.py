import json, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
R = json.load(open('../discover-casestudies-a.json'))
from collections import Counter
print('records', len(R), Counter(r['status'] for r in R))
print('companies', len({r['company_name'] for r in R}))
known = [r for r in R if 'known-companies' in r['notes']]
print('known-flag rows', len(known), 'new rows', len(R) - len(known))
nd = [r for r in R if r['status'] != 'DO_NOT_TARGET']
print('with decision-maker contact', sum(1 for r in nd if r['contacts']))
print('with personal linkedin', sum(1 for r in nd if any(c.get('linkedin') for c in r['contacts'])))
print('with company linkedin', sum(1 for r in nd if r['company_linkedin']))
print('with phone', sum(1 for r in nd if r['company_phone']))
print('with email', sum(1 for r in nd if r['public_email']))
print('recent (2024+) stories', sum(1 for r in R if r['source_publication_date'][:4] >= '2024'))
print('domain flags', sum(1 for r in R if 'not verified by fetch' in r['notes']))
