import json, glob, os
RAW = '/Users/revcloudmac/Desktop/alyson-time-doctor/.claude/worktrees/tavilo-research-v3/docs/research/v3/raw'
OUT = RAW + '/reval-theirstack-core-1.json'
KEYS = ["company_name","company_domain","industry","hq_country","employee_count","employee_count_source_url","estimated_tracked_seats","vendor","evidence_type","evidence_summary","evidence_quote","source_url","source_publication_date","second_source_url","third_source_url","first_detected_date","last_detected_date","theirstack_jobs_count","status","status_reason","confidence_score","unhappy_type","complaint_category","complaint_summary","complaint_url","complaint_date","left_tool","now_tool","workforce_signals","contacts","company_linkedin","company_phone","public_email","contact_source_url","pitch_angle","notes"]

def norm(r):
    rec = {"input_row": r.get("input_row")}
    for k in KEYS:
        rec[k] = r.get(k, [] if k == "contacts" else (0 if k == "confidence_score" else ""))
    if not rec["evidence_type"]:
        rec["evidence_type"] = "Technographic signal — requires validation"
    for c in rec["contacts"]:
        for k in ("name", "title", "linkedin", "source_url"):
            c.setdefault(k, "")
    return rec

byrow = {}
p1 = RAW + '/reval-theirstack-core-1.part1.json'
if os.path.exists(p1):
    for i, r in enumerate(json.load(open(p1))):
        if r.get('input_row') is None:
            r['input_row'] = i
        byrow[r['input_row']] = norm(r)
srcs = ['/tmp/p2/b1.json'] + sorted(glob.glob(RAW + '/core1work/r*.json'))
for f in srcs:
    if os.path.exists(f):
        for r in json.load(open(f)):
            byrow[r['input_row']] = norm(r)
out = [byrow[k] for k in sorted(byrow)]
json.dump(out, open(OUT, 'w'), indent=1, ensure_ascii=False)
from collections import Counter
print(len(out), 'records; rows', sorted(byrow))
print(Counter(r['status'] for r in out))
