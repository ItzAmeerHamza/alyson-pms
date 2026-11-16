import json
R = json.load(open("/Users/revcloudmac/Desktop/alyson-time-doctor/.claude/worktrees/tavilo-research-v3/docs/research/v3/raw/discover-complaints-primary.json"))
co = {}
for r in R:
    co.setdefault(r["company_name"], r)
print("records", len(R), "companies", len(co))
print("with DM", sum(1 for r in co.values() if r["contacts"]))
print("with personal LI", sum(1 for r in co.values() if any(c["linkedin"] for c in r["contacts"])))
print("with phone", sum(1 for r in co.values() if r["company_phone"]))
print("with email", sum(1 for r in co.values() if r["public_email"]))
print("unhappy", sum(1 for r in R if r["unhappy_type"]))
