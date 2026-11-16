import json, glob, os
from collections import Counter
D = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(D, '..', 'discover-jobs.json')
KEYS = ["company_name","company_domain","industry","hq_country","employee_count","employee_count_source_url",
"estimated_tracked_seats","vendor","evidence_type","evidence_summary","evidence_quote","source_url",
"source_publication_date","second_source_url","third_source_url","first_detected_date","last_detected_date",
"theirstack_jobs_count","status","status_reason","confidence_score","unhappy_type","complaint_category",
"complaint_summary","complaint_url","complaint_date","left_tool","now_tool","workforce_signals","contacts",
"company_linkedin","company_phone","public_email","contact_source_url","pitch_angle","notes"]
known = set(l.strip().lower() for l in open(os.path.join(D, '..', '..', 'known-companies.txt')) if l.strip())
rows = {}
for f in sorted(glob.glob(os.path.join(D, 'b*.json'))):
    for r in json.load(open(f)):
        rec = {k: ([] if k == 'contacts' else (0 if k == 'confidence_score' else '')) for k in KEYS}
        rec.update(r)
        rec['first_detected_date'] = rec['first_detected_date'] or '2026-10-05'
        rec['last_detected_date'] = rec['last_detected_date'] or '2026-10-05'
        if rec['company_name'].lower() in known and 'known company' not in rec['notes']:
            rec['notes'] = (rec['notes'] + ' | known company: evidence only, not enriched').strip(' |')
        rows[(rec['company_name'].lower(), rec['vendor'].lower())] = rec
out = list(rows.values())
json.dump(out, open(OUT, 'w'), indent=1, ensure_ascii=False)
print(len(out), Counter(r['status'] for r in out))
print('with contact', sum(1 for r in out if r['contacts']),
      'li', sum(1 for r in out if any(c.get('linkedin') for c in r['contacts'])),
      'phone', sum(1 for r in out if r['company_phone']), 'email', sum(1 for r in out if r['public_email']))
