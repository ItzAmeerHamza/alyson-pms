import json, sys, os
OUT = '/Users/revcloudmac/Desktop/alyson-time-doctor/.claude/worktrees/tavilo-research-v3/docs/research/v3/raw/reval-outreach-3.json'
KEYS = ["company_name","company_domain","industry","hq_country","employee_count","employee_count_source_url","estimated_tracked_seats","vendor","evidence_type","evidence_summary","evidence_quote","source_url","source_publication_date","second_source_url","third_source_url","first_detected_date","last_detected_date","theirstack_jobs_count","status","status_reason","confidence_score","unhappy_type","complaint_category","complaint_summary","complaint_url","complaint_date","left_tool","now_tool","workforce_signals","contacts","company_linkedin","company_phone","public_email","contact_source_url","pitch_angle","notes"]
cur = json.load(open(OUT)) if os.path.exists(OUT) else []
new = json.load(open(sys.argv[1]))
for r in new:
    rec = {k: r.get(k, [] if k == "contacts" else "") for k in KEYS}
    rec["input_row"] = r["input_row"]
    cur = [c for c in cur if c.get("input_row") != r["input_row"]] + [rec]
cur.sort(key=lambda c: c["input_row"])
json.dump(cur, open(OUT, 'w'), indent=1, ensure_ascii=False)
print(len(cur), "records; rows:", [c["input_row"] for c in cur])
