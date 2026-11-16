import json, os, sys
D = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(D, '..', '..'))
batch = json.load(open(os.path.join(ROOT, 'batches', 'possible-20.json')))
dec = {}
for fn in sorted(os.listdir(D)):
    if fn.startswith('dec') and fn.endswith('.txt'):
        for r in json.load(open(os.path.join(D, fn))):
            dec[(r['company_name'], r['vendor'])] = r
EMPTY = {"company_name":"","company_domain":"","industry":"","hq_country":"","employee_count":"","employee_count_source_url":"","estimated_tracked_seats":"","vendor":"","evidence_type":"","evidence_summary":"","evidence_quote":"","source_url":"","source_publication_date":"","second_source_url":"","third_source_url":"","first_detected_date":"","last_detected_date":"","theirstack_jobs_count":"","status":"","status_reason":"","confidence_score":0,"unhappy_type":"","complaint_category":"","complaint_summary":"","complaint_url":"","complaint_date":"","left_tool":"","now_tool":"","workforce_signals":"","contacts":[],"company_linkedin":"","company_phone":"","public_email":"","contact_source_url":"","pitch_angle":"","notes":""}
out = []; done = 0; extra_keys = set(dec)
for comp in batch:
    for row in comp:
        k = (row['company_name'], row['competitor_vendor'])
        if k not in dec: continue
        extra_keys.discard(k); done += 1
        r = dict(EMPTY)
        r.update({"company_name":row['company_name'],"company_domain":row['company_domain'],"industry":row.get('industry',''),"hq_country":row.get('HQ_country',''),"employee_count":row.get('employee_count',''),"vendor":row['competitor_vendor'],"evidence_type":row.get('evidence_type',''),"evidence_summary":row.get('evidence_summary',''),"source_url":row.get('source_url',''),"workforce_signals":row.get('workforce_signals',''),"company_linkedin":row.get('company_linkedin',''),"company_phone":row.get('company_phone','')})
        d = dec[k]
        for kk, v in d.items():
            if kk in ('company_name','vendor'): continue
            r[kk] = v
        r['company_name'] = row['company_name']; r['vendor'] = row['competitor_vendor']
        if not r.get('company_domain'): r['company_domain'] = row['company_domain'] or d.get('company_domain','')
        r['confidence_score'] = int(r['confidence_score'])
        out.append(r)
for k in extra_keys:  # additional tool records
    r = dict(EMPTY); r.update(dec[k]); r['confidence_score']=int(r['confidence_score']); out.append(r)
json.dump(out, open(os.path.join(ROOT, 'raw', 'reval-possible-20.json'), 'w'), indent=1, ensure_ascii=False)
total = sum(len(c) for c in batch)
from collections import Counter
print('written', len(out), 'input rows done', done, '/', total, Counter(r['status'] for r in out))
