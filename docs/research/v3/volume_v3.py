#!/usr/bin/env python3
"""How much data the v3 research holds: raw records, final rows/columns, URLs, contacts, disk size."""
import csv, json, re
from pathlib import Path

V3 = Path(__file__).resolve().parent
OUT, RAW = V3 / "out", V3 / "raw"


def size(p):
    return sum(f.stat().st_size for f in p.rglob("*") if f.is_file())


master = list(csv.DictReader((OUT / "1-master-dataset.csv").open()))
audit = list(csv.DictReader((OUT / "7-source-audit.csv").open()))
print("Raw agent records (source audit rows):", len(audit))
print("Research streams:", len({a["stream"] for a in audit}))
print("Master rows x columns:", len(master), "x", len(master[0]))
cells = sum(bool(v) for r in master for v in r.values())
print(f"Filled cells in master: {cells:,} of {len(master) * len(master[0]):,}")

urls = set()
for r in master:
    for k, v in r.items():
        urls |= set(re.findall(r"https?://[^\s;|,\"]+", v or ""))
print("Unique URLs cited in master:", len(urls))
print("Unique source domains:", len({re.sub(r"^https?://(www\.)?", "", u).split("/")[0] for u in urls}))

people = set()
for r in master:
    for k in ("decision_maker", "second_contact"):
        if r[k]:
            people.add((r["company_name"], r[k]))
    for chunk in (r["other_contacts"] or "").split(";"):
        n = chunk.split("(")[0].strip()
        if n:
            people.add((r["company_name"], n))
print("Named contacts (company, person):", len(people))
print("Personal LinkedIn URLs:", len({r[k] for r in master for k in ("decision_maker_linkedin", "second_contact_linkedin") if r[k]}))
print("Phones:", sum(bool(r["company_phone"]) for r in master), " Emails:", sum(bool(r["public_email"]) for r in master))

themes = 0
for f in RAW.glob("complaint-themes-*.json"):
    for v in json.loads(f.read_text()):
        for t in v.get("themes", []):
            themes += len(t.get("examples", [])) if isinstance(t, dict) else 0
print("Dated complaint examples:", themes)
print("Competitor vendors profiled:", len(json.loads((RAW / "competitors.json").read_text())))

print(f"\nDisk: deliverables {size(OUT) / 1e6:.1f} MB, raw stream JSON "
      f"{sum(f.stat().st_size for f in RAW.rglob('*.json')) / 1e6:.1f} MB, whole v3 folder {size(V3) / 1e6:.1f} MB")
for f in sorted(OUT.iterdir()):
    if f.suffix == ".csv":
        n = sum(1 for _ in f.open()) - 1
        print(f"  {f.name}: {n:,} rows, {f.stat().st_size / 1e6:.2f} MB")
