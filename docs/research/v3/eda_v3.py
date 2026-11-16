#!/usr/bin/env python3
"""Exploratory summary of the v3 master dataset. Prints markdown; also writes out/EDA.md."""
import csv, re
from collections import Counter
from pathlib import Path

OUT = Path(__file__).resolve().parent / "out"
ORDER = {"CURRENT": 0, "PROBABLE": 1, "POSSIBLE": 2, "FORMER": 3, "DO_NOT_TARGET": 4}
master = list(csv.DictReader((OUT / "1-master-dataset.csv").open()))

# One row per company: its strongest relationship.
best = {}
for r in master:
    k = r["company_domain"] or re.sub(r"[^a-z0-9]", "", r["company_name"].lower())
    if k not in best or (ORDER[r["current_status"]], -int(r["Tavilo_priority_score"] or 0)) < \
            (ORDER[best[k]["current_status"]], -int(best[k]["Tavilo_priority_score"] or 0)):
        best[k] = r
cos = list(best.values())
strong = [r for r in cos if r["current_status"] in ("CURRENT", "PROBABLE")]
lines = []


def p(s=""):
    lines.append(s)


def num(v):
    m = re.search(r"\d[\d,]*", v or "")
    return int(m.group(0).replace(",", "")) if m else None


def money(v):
    m = re.search(r"(-?)\$?(-?)([\d,]+)", v or "")
    if not m:
        return None
    return (-1 if "-" in m.group(1) + m.group(2) else 1) * float(m.group(3).replace(",", ""))


def table(title, counter, total, n=12):
    p(f"\n### {title}\n")
    p("| | Companies | % |")
    p("|---|---:|---:|")
    for k, v in counter.most_common(n):
        p(f"| {k or '(blank)'} | {v} | {100 * v / total:.0f}% |")


def size_band(e):
    n = num(e)
    if n is None:
        return "unknown"
    for lo, hi, lab in [(0, 9, "1–9"), (10, 24, "10–24"), (25, 99, "25–99"), (100, 499, "100–499"),
                        (500, 2500, "500–2,500"), (2501, 10000, "2,501–10,000")]:
        if lo <= n <= hi:
            return lab
    return "10,000+"


COUNTRY = {"usa": "United States", "us": "United States", "u.s.": "United States", "united states of america": "United States",
           "uk": "United Kingdom", "england": "United Kingdom", "ph": "Philippines"}


def country(c):
    c = (c or "").split(";")[0].split("/")[0].split("(")[0].strip()
    c = COUNTRY.get(c.lower(), c)
    return c


def year(d):
    m = re.search(r"(20\d\d)", d or "")
    return int(m.group(1)) if m else None


p("# Tavilo v3 dataset — EDA\n")
p(f"- Relationship rows (company + tool): **{len(master):,}**")
p(f"- Unique companies: **{len(cos):,}**")
p(f"- Strong evidence (CURRENT + PROBABLE): **{len(strong):,}**")
p(f"- Companies using 2+ tools: {sum(v > 1 for v in Counter(r['company_domain'] or r['company_name'] for r in master if r['current_status'] != 'DO_NOT_TARGET').values())}")

table("Companies by status (strongest relationship)", Counter(r["current_status"] for r in cos), len(cos))
table("Strong-evidence companies by tool", Counter(r["competitor_vendor"] for r in strong), len(strong), 20)
table("Strong-evidence companies by category", Counter(r["competitor_category"] for r in strong), len(strong))
table("Strong-evidence companies by HQ country", Counter(country(r["HQ_country"]) for r in strong), len(strong), 15)
order = ["1–9", "10–24", "25–99", "100–499", "500–2,500", "2,501–10,000", "10,000+", "unknown"]
sb = Counter(size_band(r["employee_count"]) for r in strong)
p("\n### Strong-evidence companies by employee count\n")
p("| Band | Companies | % |")
p("|---|---:|---:|")
for b in order:
    p(f"| {b} | {sb[b]} | {100 * sb[b] / len(strong):.0f}% |")
fit = sum(1 for r in strong if (num(r["employee_count"]) or 0) in range(25, 2501))
p(f"\nIn Tavilo's 25–2,500 sweet spot: **{fit}**")

ind = Counter()
for r in strong:
    t = (r["industry"] + " " + r["workforce_signals"]).lower()
    lab = ("BPO / outsourcing / VA / staffing" if re.search(r"bpo|outsourc|virtual assist|\bva\b|staffing|call cent|contact cent|offshore", t)
           else "Agency (marketing / creative / digital)" if re.search(r"agency|marketing|advertis|creative|design|seo", t)
           else "Software / IT services" if re.search(r"software|it serv|develop|tech|saas|consult", t)
           else "Healthcare / RCM / billing" if re.search(r"health|medical|rcm|billing|dental|clinic", t)
           else "E-commerce / retail" if re.search(r"e-?commerce|retail|amazon|shopify", t)
           else "Construction / field services" if re.search(r"construct|hvac|electric|field|engineering", t)
           else "Finance / legal / accounting" if re.search(r"financ|legal|law|account|insur|mortgage", t)
           else "Other / unknown")
    ind[lab] += 1
table("Strong-evidence companies by industry group", ind, len(strong))
table("Evidence type (strongest row)", Counter(r["evidence_type"] for r in strong), len(strong))
yrs = Counter()
for r in strong:
    y = year(r["source_publication_date"]) or year(r["last_detected_date"])
    yrs["unknown" if not y else "2025–2026" if y >= 2025 else "2023–2024" if y >= 2023 else "2019–2022" if y >= 2019 else "before 2019"] += 1
table("Evidence recency", yrs, len(strong))
cb = Counter(("90–100" if c >= 90 else "80–89" if c >= 80 else "60–79" if c >= 60 else "<60")
             for c in (int(r["confidence_score"] or 0) for r in strong))
table("Confidence score", cb, len(strong))
pb = Counter(("70+" if s >= 70 else "50–69" if s >= 50 else "30–49" if s >= 30 else "<30")
             for s in (int(r["Tavilo_priority_score"] or 0) for r in strong))
table("Tavilo priority score", pb, len(strong))

p("\n### Outreach coverage (strong-evidence companies)\n")
p("| Field | Companies | % |")
p("|---|---:|---:|")
for k, lab in [("decision_maker", "Decision maker"), ("second_contact", "Second contact"),
               ("decision_maker_linkedin", "Personal LinkedIn"), ("company_linkedin", "Company LinkedIn"),
               ("company_phone", "Phone"), ("public_email", "Email")]:
    v = sum(bool(r[k]) for r in strong)
    p(f"| {lab} | {v} | {100 * v / len(strong):.0f}% |")
full = sum(bool(r["decision_maker"] and (r["company_phone"] or r["public_email"])) for r in strong)
p(f"| Decision maker + phone or email (ready to contact) | {full} | {100 * full / len(strong):.0f}% |")
none = sum(not (r["decision_maker"] or r["company_phone"] or r["public_email"]) for r in strong)
p(f"| Nothing at all | {none} | {100 * none / len(strong):.0f}% |")

uh = Counter(r["unhappy_signal"] for r in cos if r["unhappy_signal"] and r["current_status"] != "DO_NOT_TARGET")
cc = Counter(r["complaint_category"] for r in cos if r["complaint_category"] and r["current_status"] != "DO_NOT_TARGET")
table("Unhappy signals (all non-DNT companies)", uh, max(sum(uh.values()), 1))
table("Complaint categories", cc, max(sum(cc.values()), 1))

ec = [r for r in strong if r["estimated_annual_savings"] and (num(r["estimated_tracked_seats"]) or 0) <= 2500]
sav = [money(r["estimated_annual_savings"]) for r in ec]
pos = sorted(s for s in sav if s > 0)
neg = [s for s in sav if s <= 0]
comp = sorted(money(r["estimated_competitor_monthly_cost"]) * 12 for r in ec)
p("\n### Economics (estimates; strong-evidence companies with ≤2,500 estimated seats)\n")
p(f"- With a cost estimate: {len(ec)} (seats = stated seats, else headcount)")
p(f"- Estimated competitor spend: median ~${comp[len(comp) // 2]:,.0f}/yr per company; total ~${sum(comp):,.0f}/yr")
p(f"- Tavilo cheaper for {len(pos)} of {len(ec)}; median saving ~${pos[len(pos) // 2]:,.0f}/yr; "
  f"total ~${sum(pos):,.0f}/yr" if pos else "- Tavilo cheaper for none")
p(f"- Tavilo not cheaper for {len(neg)} (mostly cheap per-seat time trackers such as Clockify/Jibble/Connecteam, or tiny teams)")
bands = Counter("<$1k" if s < 1000 else "$1k–5k" if s < 5000 else "$5k–20k" if s < 20000 else "$20k+" for s in pos)
p("\n| Estimated annual saving | Companies |")
p("|---|---:|")
for b in ["<$1k", "$1k–5k", "$5k–20k", "$20k+"]:
    p(f"| {b} | {bands[b]} |")

pv = [r for r in cos if r["current_status"] == "POSSIBLE"]
table("POSSIBLE queue by tool (needs validation)", Counter(r["competitor_vendor"] for r in pv), len(pv), 12)

text = "\n".join(lines)
(OUT / "EDA.md").write_text(text + "\n")
print(text)
