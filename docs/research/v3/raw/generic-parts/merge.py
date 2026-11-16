import json, glob, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
d = json.load(open(os.path.join(ROOT, 'batches', 'theirstack-generic.json')))
verdicts = json.load(open(os.path.join(HERE, 'verdicts.json')))

FIELDS = ["company_name","company_domain","industry","hq_country","employee_count","employee_count_source_url",
 "estimated_tracked_seats","vendor","evidence_type","evidence_summary","evidence_quote","source_url",
 "source_publication_date","second_source_url","third_source_url","first_detected_date","last_detected_date",
 "theirstack_jobs_count","status","status_reason","confidence_score","unhappy_type","complaint_category",
 "complaint_summary","complaint_url","complaint_date","left_tool","now_tool","workforce_signals","contacts",
 "company_linkedin","company_phone","public_email","contact_source_url","pitch_angle","notes"]
GENERIC = {"Timesheets": "Generic word: TheirStack matches 'timesheets' in ordinary job-ad duties (submit/approve/maintain timesheets), not timesheets.com software. No product confirmation.",
           "Time Analytics": "Generic phrase: TheirStack matches 'time analytics' inside 'real-time analytics' in data/BI job ads, not timeanalyticssoftware.com. No product confirmation.",
           "My Hours": "Generic phrase: 'my hours' is ordinary job-ad/schedule text; 0 of 19 mid-size hits confirmed myhours.com. Outside 10–2,500 band and unvalidated.",
           "Time Cop": "Collision: matches the Ruby `timecop` test gem in developer job ads (Modus Create, SAIC, Social Impact), not the tiny Time Cop app."}

def emp(x):
    s = str(x['employee_count']).replace(',', '').strip()
    if not s: return None
    m = 1000 if s.endswith('k') else 1
    return int(float(s.rstrip('k')) * m)

checked = {}
for f in sorted(glob.glob(os.path.join(HERE, 'batch-*.json'))):
    for r in json.load(open(f)):
        checked.setdefault(r['input_index'], {}).update(r)

out = []
for v in verdicts:
    rec = {k: "" for k in FIELDS}; rec['contacts'] = []
    rec.update(v); out.append(rec)

for i, x in enumerate(d):
    v = x['competitor_vendor']; e = emp(x)
    base = {"company_name": x['company_name'], "company_domain": x['company_domain'], "vendor": v,
            "input_index": i}
    if i in checked:
        rec = {k: "" for k in FIELDS}; rec['contacts'] = []
        rec.update({"company_name": x['company_name'], "company_domain": x['company_domain'],
                    "industry": x['industry'], "hq_country": x['HQ_country'], "employee_count": x['employee_count'],
                    "employee_count_source_url": x['source_url'], "vendor": v,
                    "evidence_type": "Technographic signal — requires validation", "source_url": x['source_url']})
        c = dict(checked[i])
        if not c.get('source_url'): c.pop('source_url', None)
        rec.update({k: val for k, val in c.items() if val != "" or k in ('status',)})
        if rec['source_url'] != x['source_url'] and not rec.get('second_source_url'):
            rec['second_source_url'] = x['source_url']
        rec['input_index'] = i
        out.append(rec); continue
    if v in GENERIC:
        out.append({**base, "status": "DO_NOT_TARGET", "status_reason": GENERIC[v], "source_url": x['source_url']})
        continue
    if e is None or e < 10 or e > 2500:
        out.append({**base, "employee_count": x['employee_count'], "status": "POSSIBLE",
                    "status_reason": f"Low priority: outside 10–2,500 employee band ({x['employee_count'] or 'unknown'}); TheirStack {v} signal not validated.",
                    "confidence_score": 30, "source_url": x['source_url'],
                    "evidence_type": "Technographic signal — requires validation"})
        continue
    out.append({**base, "employee_count": x['employee_count'], "status": "POSSIBLE",
                "status_reason": "PENDING validation (TheirStack signal only so far).", "confidence_score": 35,
                "source_url": x['source_url'], "evidence_type": "Technographic signal — requires validation"})

json.dump(out, open(os.path.join(ROOT, 'raw', 'reval-theirstack-generic.json'), 'w'), indent=1, ensure_ascii=False)
from collections import Counter
print(len(out), Counter(r['status'] for r in out), 'checked', len(checked),
      'pending', sum(1 for r in out if str(r.get('status_reason','')).startswith('PENDING')))
