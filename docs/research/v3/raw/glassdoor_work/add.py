import json, sys, os
BASE = '/Users/revcloudmac/Desktop/alyson-time-doctor/.claude/worktrees/tavilo-research-v3/docs/research/v3'
OUT = BASE + '/raw/discover-glassdoor.json'
KNOWN = set(l.strip().lower() for l in open(BASE + '/known-companies.txt') if l.strip())
KEYS = ["company_name","company_domain","industry","hq_country","employee_count","employee_count_source_url","estimated_tracked_seats","vendor","evidence_type","evidence_summary","evidence_quote","source_url","source_publication_date","second_source_url","third_source_url","first_detected_date","last_detected_date","theirstack_jobs_count","status","status_reason","confidence_score","unhappy_type","complaint_category","complaint_summary","complaint_url","complaint_date","left_tool","now_tool","workforce_signals","contacts","company_linkedin","company_phone","public_email","contact_source_url","pitch_angle","notes"]
data = json.load(open(OUT)) if os.path.exists(OUT) else []
if len(sys.argv) > 1 and sys.argv[1]:
    new = json.load(open(sys.argv[1]))
    idx = {(r['company_name'].lower(), r['vendor'].lower()): i for i, r in enumerate(data)}
    for r in new:
        rec = {k: r.get(k, [] if k == 'contacts' else '') for k in KEYS}
        if not rec['evidence_type']:
            rec['evidence_type'] = 'Employee review'
        if rec['company_name'].lower() in KNOWN and 'known-companies' not in rec['notes']:
            rec['notes'] = ('[In known-companies.txt - cross-validation only, not enriched] ' + rec['notes']).strip()
        k = (rec['company_name'].lower(), rec['vendor'].lower())
        if k in idx:
            data[idx[k]] = rec
        else:
            idx[k] = len(data)
            data.append(rec)
    json.dump(data, open(OUT, 'w'), indent=1, ensure_ascii=False)
print(len(data), 'records')
for q in sys.argv[2:]:
    print(q, '-> KNOWN' if q.lower() in KNOWN else '-> new', [k for k in KNOWN if q.lower() in k][:5])
