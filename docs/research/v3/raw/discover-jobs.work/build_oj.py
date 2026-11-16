"""Build bNN.json from OJ selections: python3 build_oj.py <spec.json> <out bNN.json>
spec: list of {i, company_name, vendor, status, confidence_score, quote, ...extra fields}; url/date/title filled from oj_sel.json"""
import json, os, sys, datetime
D = os.path.dirname(os.path.abspath(__file__))
sel = {o['i']: o for o in json.load(open(os.path.join(D, 'oj_sel.json')))}
spec = json.load(open(os.path.join(D, sys.argv[1])))
out = []
for s in spec:
    o = sel[s.pop('i')]
    date = datetime.datetime.strptime(o['date'], '%b %d, %Y').strftime('%Y-%m-%d')
    title = o['title'].split(' - OnlineJobs')[0]
    q = s.pop('quote')
    rec = {'evidence_type': 'Current job posting' if date >= '2025-01-01' else 'Older job posting',
           'evidence_summary': s.pop('summary', f"OnlineJobs.ph posting '{title}' ({o['type']}) by {s['company_name']} names {s['vendor']} for tracking remote staff."),
           'evidence_quote': q, 'source_url': o['url'], 'source_publication_date': date,
           'status_reason': s.pop('reason', f"{date[:7]} OnlineJobs.ph posting names {s['vendor']} for remote staff time tracking."),
           'workforce_signals': s.pop('ws', 'remote, offshore Philippines VA/contractors')}
    rec.update(s)
    out.append(rec)
json.dump(out, open(os.path.join(D, sys.argv[2]), 'w'), indent=1, ensure_ascii=False)
print(len(out), 'written')
