"""Merge reval-outreach-1 part files + inline file into reval-outreach-1.json; report row coverage."""
import json, os, re, collections

HERE = os.path.dirname(os.path.abspath(__file__))
srcs = [f"reval-outreach-1.part{i}.json" for i in range(1, 6)] + ["reval-outreach-1.inline.json"]
recs = []
for s in srcs:
    p = os.path.join(HERE, s)
    if os.path.exists(p):
        recs.extend(json.load(open(p)))

def row_of(r):
    m = re.search(r"[Ii]nput row[s]?\s*(?:index\s*)?#?(\d+)", r.get("notes", ""))
    return int(m.group(1)) if m else None

def rows_of(r):
    m = re.search(r"[Ii]nput row[s]?\s*(?:index\s*)?#?([\d ,/&AND-]+)", r.get("notes", ""))
    return {int(x) for x in re.findall(r"\d+", m.group(1))} if m else set()

# dedupe on (row, company, vendor) - later sources (inline) win
seen = {}
for r in recs:
    seen[(row_of(r), r.get("company_name", "").lower(), r.get("vendor", "").lower())] = r
out = sorted(seen.values(), key=lambda r: (row_of(r) if row_of(r) is not None else 999))
json.dump(out, open(os.path.join(HERE, "reval-outreach-1.json"), "w"), indent=1, ensure_ascii=False)

rows = set().union(*[rows_of(r) for r in out])
print("records", len(out), collections.Counter(r.get("status") for r in out))
print("missing rows", [i for i in range(70) if i not in rows])
print("no-row records", [r["company_name"] for r in out if row_of(r) is None])
