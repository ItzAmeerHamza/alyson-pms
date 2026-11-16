import json, collections
OUT = '/Users/revcloudmac/Desktop/alyson-time-doctor/.claude/worktrees/tavilo-research-v3/docs/research/v3/raw/reval-outreach-3.json'
d = json.load(open(OUT))
print("records", len(d), "pending", [r["input_row"] for r in d if "PENDING" in r["notes"]])
print("status", collections.Counter(r["status"] for r in d))
nt = [r for r in d if r["status"] != "DO_NOT_TARGET"]
print("non-DNT", len(nt))
print("with DM", sum(1 for r in nt if r["contacts"]))
print("with personal LinkedIn", sum(1 for r in nt if any(c.get("linkedin") for c in r["contacts"])))
print("with phone", sum(1 for r in nt if r["company_phone"]))
print("with email", sum(1 for r in nt if r["public_email"]))
print("DNT", [(r["input_row"], r["company_name"]) for r in d if r["status"] == "DO_NOT_TARGET"])
for r in sorted(d, key=lambda r: -r["confidence_score"])[:14]:
    print(r["input_row"], r["company_name"], r["vendor"], r["status"], r["confidence_score"])
