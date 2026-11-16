"""Append records from reval1_new.json into reval-outreach-1.inline.json (replace same company+vendor), then merge."""
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
inl = os.path.join(HERE, "reval-outreach-1.inline.json")
cur = json.load(open(inl)) if os.path.exists(inl) else []
new = json.load(open(os.path.join(HERE, "reval1_new.json")))
keys = {(r["company_name"].lower(), r["vendor"].lower()) for r in new}
cur = [r for r in cur if (r["company_name"].lower(), r["vendor"].lower()) not in keys] + new
json.dump(cur, open(inl, "w"), indent=1, ensure_ascii=False)
print("inline records", len(cur))
subprocess.run([sys.executable, os.path.join(HERE, "reval1_merge.py")])
