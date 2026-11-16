import json, glob, os
base = "/Users/revcloudmac/Desktop/alyson-time-doctor/.claude/worktrees/tavilo-research-v3/docs/research/outreach-sources/"
for f in ["unhappy-reviews-primary-1.json", "unhappy-reviews-primary-2.json", "unhappy-switchers-primary.json"]:
    d = json.load(open(base + f))
    rows = d if isinstance(d, list) else d.get("records", d.get("companies", []))
    print(f, len(rows))
    for r in rows:
        print(" |", r.get("company_name") or r.get("company"), "|", r.get("vendor") or r.get("competitor_vendor"), "|", (r.get("source_url") or r.get("complaint_url") or "")[:110])
