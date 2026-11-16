#!/usr/bin/env python3
"""Merge public TheirStack rows with validated customer evidence and score Tavilo prospects."""
import csv, json, re
from collections import defaultdict
from pathlib import Path

ROOT = Path("/Users/revcloudmac/Desktop/alyson-time-doctor/docs/research")
RAW = ROOT / "theirstack-raw.jsonl"
OVERLAY = ROOT / "validated-overlay.json"
CSV_PATH = ROOT / "tavilo-competitor-customers.csv"
SUMMARY_PATH = ROOT / "tavilo-prospect-summary.json"

# Annual per-user USD for a monitoring-capable public tier. Blank means not estimated.
RATES = {
    "Time Doctor": (11.67, "Time Doctor Standard, $11.67/user/month billed annually. Screenshot-heavy Premium is $16.70. https://support.timedoctor.com/knowledge/time-doctor-pricing-plans-and-features"),
    "Hubstaff": (7.50, "Hubstaff Grow, $7.50/user/month billed annually (app and URL tracking). https://hubstaff.com/hubstaff-pricing-guide"),
    "DeskTime": (9.17, "DeskTime Premium, $9.17/user/month billed annually, the tier that includes screenshots. https://desktime.com/pricing"),
    "Insightful": (8.00, "Insightful time-tracking plan cited at $8/user/month on Insightful's DeskTime review. https://www.insightful.io/blog/desktime-honest-guide"),
    "WebWork Time Tracker": (None, "Public WebWork price not confirmed in this pass."),
    "We360.ai": (4.80, "We360.ai schema.org price is INR 399 per user per month (https://www.we360.ai/case-studies). USD figure uses roughly 83 INR per USD and is an estimate."),
}

MONITORING = {
    "Time Doctor", "Hubstaff", "Insightful", "DeskTime", "Teramind", "ActivTrak", "ProHance",
    "WebWork Time Tracker", "We360.ai", "Time Champ", "Apploye", "Screenshot Monitor",
    "Work Examiner", "Ekran System", "Time Cop", "RescueTime", "Veriato Investigator",
    "CleverControl", "WorkPuls", "Sapience", "Prodoscore",
}
ADJACENT = {
    "Toggl", "Toggl Track", "Everhour", "My Hours", "TrackingTime", "clockodo", "Kimai",
    "HourStack", "Jibble", "QuickBooks Time", "Replicon", "Clockify",
}
AMBIGUOUS = {"Timesheets", "Time Analytics"}

VENDOR_SELF = {
    "time doctor", "hubstaff", "insightful", "workpuls", "desktime", "teramind", "activtrak",
    "toggl", "replicon", "we360.ai", "we360", "time champ", "webwork", "webwork time tracker",
    "apploye", "prodoscore", "kickidler", "monitask", "controlio", "timecamp", "traqq",
    "veriato", "jibble", "harvest", "clockify",
}

PRODOSCORE = [
    "Tristarr", "Cannon Jeffries Search Group", "AtWork Group", "Visual Visitor", "PangeaTwo",
    "Dietitians on Demand", "Caprae Capital", "Creative Financial Staffing", "General Informatics",
    "Brickwork", "Blue Mantis", "Telarus", "DTiQ", "Specialty Lighting Group", "UpCurve Cloud",
    "Grove Group",
]

COLUMNS = [
    "company_name", "company_domain", "industry", "HQ_country", "employee_count",
    "estimated_tracked_seats", "competitor_vendor", "competitor_category", "evidence_type",
    "evidence_summary", "source_url", "source_publication_date", "first_detected_date",
    "last_detected_date", "confidence_score", "current_status", "second_source_url",
    "third_source_url", "cross_validated", "estimated_competitor_monthly_cost",
    "estimated_Tavilo_monthly_cost", "estimated_annual_savings", "Tavilo_priority_score",
    "suggested_buyer_titles", "notes",
]


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def parse_employees(s):
    if s is None:
        return None
    text = str(s).lower().replace(",", "").strip()
    if not text:
        return None
    m = re.search(r"(\d+(?:\.\d+)?)\s*k", text)
    if m:
        return int(float(m.group(1)) * 1000)
    m = re.search(r"(\d{1,3}(?:\.\d+)?)", text)
    if m and "m" in text and "employee" not in text:
        # revenue strings should not land here
        pass
    digits = re.findall(r"\d+", text)
    if not digits:
        return None
    # "25 in-house; 1300 freelancers" -> first number is safer
    return int(digits[0])


def tavilo_monthly(seats):
    if not seats or seats <= 0:
        return None
    starter = 49 + max(0, seats - 10) * 4
    business = 199 + max(0, seats - 50) * 3
    growth = 399 + max(0, seats - 100) * 2.5
    return round(min(starter, business, growth), 2)


def category_for(vendor):
    if vendor in AMBIGUOUS:
        return "Ambiguous technographic keyword"
    if vendor in ADJACENT:
        return "Adjacent time tracking / attendance"
    if vendor in MONITORING:
        return "Employee monitoring / time tracking"
    return "Employee monitoring / time tracking"


def blank():
    return {c: "" for c in COLUMNS}


JUNK_NAMES = {"admin", "test", "user", "company", "home", "unknown", "n a", "na", "none", "null"}


def evidence_text(row):
    text = (row.get("evidence_summary") or "") + " " + (row.get("notes") or "")
    return text.replace(row.get("company_name") or "", " ")


def priority(row, employees, seats, remote, screenshots, cost_sensitive, complaints):
    if row["current_status"] in ("FORMER CUSTOMER", "DO NOT TARGET"):
        return 0
    if norm(row["company_name"]) in JUNK_NAMES:
        return 0
    if row["competitor_vendor"] in AMBIGUOUS:
        return 12
    score = 18
    size = seats or employees
    if size and 25 <= size <= 2500:
        score += 28
    elif size and (10 <= size < 25 or 2500 < size <= 5000):
        score += 10
    elif size and size > 10000:
        score -= 20
    industry = (row["industry"] or "").lower()
    if any(k in industry for k in ("outsourc", "staffing", "bpo", "advertis", "customer", "call center", "support", "virtual", "agency")):
        score += 16
    elif any(k in industry for k in ("it services", "software", "consult", "professional", "accounting", "market")):
        score += 8
    if remote:
        score += 12
    if screenshots:
        score += 8
    elif row["competitor_vendor"] in MONITORING:
        score += 4
    if cost_sensitive:
        score += 8
    if complaints:
        score += 6
    blob = evidence_text(row).lower()
    if "payroll" in blob or "billing" in blob or "billable" in blob:
        score += 6
    if row["current_status"] == "CURRENT CUSTOMER":
        score += 16
    elif row["current_status"] == "PROBABLE CUSTOMER":
        score += 6
    elif row["current_status"] == "POSSIBLE CUSTOMER":
        score -= 18
    return max(0, min(100, score))


def money(n):
    if n is None or n == "":
        return ""
    return f"{n:.0f}" if isinstance(n, float) and n >= 100 else (f"{n:.2f}" if isinstance(n, float) else str(n))


def main():
    rows_by_key = {}

    def add(rec, replace=False):
        key = (norm(rec["company_name"]), norm(rec["competitor_vendor"]))
        if not key[0] or not key[1]:
            return
        if key in rows_by_key and not replace:
            existing = rows_by_key[key]
            if rec.get("source_url") and rec["source_url"] != existing.get("source_url"):
                if not existing.get("second_source_url"):
                    existing["second_source_url"] = rec["source_url"]
                elif rec["source_url"] not in (existing.get("second_source_url"), existing.get("third_source_url")):
                    existing["third_source_url"] = rec["source_url"]
                existing["cross_validated"] = "yes"
                try:
                    existing["confidence_score"] = min(100, int(existing["confidence_score"]) + 6)
                except Exception:
                    pass
            # fill blanks
            for field in ("company_domain", "industry", "HQ_country", "employee_count"):
                if not existing.get(field) and rec.get(field):
                    existing[field] = rec[field]
            return
        rows_by_key[key] = rec

    if RAW.exists():
        for line in RAW.read_text().splitlines():
            if not line.strip():
                continue
            src = json.loads(line)
            vendor = src.get("competitor_vendor") or ""
            name = src.get("company_name") or ""
            if norm(name) in VENDOR_SELF:
                status, conf, etype = "DO NOT TARGET", 20, "Technographic signal"
                notes = "Company name matches a software vendor. Excluded as a prospect."
            elif vendor in AMBIGUOUS:
                status, conf = "POSSIBLE CUSTOMER", 32
                etype = "Technographic signal — requires validation"
                notes = "TheirStack lists this under a generic technology name (Timesheets or Time Analytics). It may be a keyword in job posts, not confirmed use of Timesheets.com or a branded Time Analytics product. No confidence score, job count, or detection dates are on the public page."
            else:
                status, conf = "POSSIBLE CUSTOMER", 68 if vendor in MONITORING else 55
                etype = "Technographic signal — requires validation"
                notes = "Public TheirStack detection only. TheirStack does not prove current use. The public page does not show confidence, job counts, or first/last detected dates."
            detected = src.get("theirstack_detected_count") or ""
            if detected:
                notes += f" TheirStack reports about {detected} companies for this technology."
            rec = blank()
            rec.update({
                "company_name": name,
                "company_domain": src.get("company_domain") or "",
                "industry": src.get("industry") or "",
                "HQ_country": src.get("HQ_country") or "",
                "employee_count": src.get("employee_count") or "",
                "competitor_vendor": vendor,
                "competitor_category": category_for(vendor),
                "evidence_type": etype,
                "evidence_summary": f"TheirStack's public {vendor} page lists {name}. Technographic signal — requires validation.",
                "source_url": src.get("source_url") or "",
                "source_publication_date": "Fetched 2026-09-30",
                "first_detected_date": "",
                "last_detected_date": "",
                "confidence_score": conf,
                "current_status": status,
                "cross_validated": "no",
                "notes": notes + (f" Revenue on TheirStack: {src.get('revenue')}." if src.get("revenue") else ""),
                "suggested_buyer_titles": "Head of Operations; COO; IT / workplace technology",
            })
            add(rec)

    overlay = json.loads(OVERLAY.read_text())
    for src in overlay:
        rec = blank()
        rec.update({k: src.get(k, "") or "" for k in COLUMNS if k in src})
        rec["company_name"] = src["company_name"]
        rec["competitor_vendor"] = src["competitor_vendor"]
        rec["competitor_category"] = src.get("competitor_category") or category_for(src["competitor_vendor"])
        rec["evidence_type"] = src.get("evidence_type") or ""
        rec["evidence_summary"] = src.get("evidence_summary") or ""
        rec["source_url"] = src.get("source_url") or ""
        rec["source_publication_date"] = src.get("source_publication_date") or ""
        rec["confidence_score"] = src.get("confidence_score") or 0
        rec["current_status"] = src.get("current_status") or "POSSIBLE CUSTOMER"
        if not rec.get("cross_validated"):
            rec["cross_validated"] = "yes" if rec.get("second_source_url") else "no"
        rec["suggested_buyer_titles"] = src.get("buyer_titles") or "Head of Operations; COO"
        rec["notes"] = src.get("notes") or ""
        if src.get("estimated_tracked_seats"):
            rec["estimated_tracked_seats"] = src["estimated_tracked_seats"]
        # Former always replaces a weaker technographic row.
        replace = rec["current_status"] in ("FORMER CUSTOMER", "CURRENT CUSTOMER", "PROBABLE CUSTOMER", "DO NOT TARGET")
        key = (norm(rec["company_name"]), norm(rec["competitor_vendor"]))
        if key in rows_by_key and replace:
            old = rows_by_key[key]
            if old.get("source_url") and old["source_url"] != rec["source_url"]:
                rec["second_source_url"] = old["source_url"]
                rec["cross_validated"] = "yes"
                rec["confidence_score"] = min(100, int(rec["confidence_score"]) + 4)
            for field in ("company_domain", "industry", "HQ_country", "employee_count"):
                if not rec.get(field) and old.get(field):
                    rec[field] = old[field]
            rows_by_key[key] = rec
        else:
            add(rec, replace=False)

    for name in PRODOSCORE:
        rec = blank()
        rec.update({
            "company_name": name,
            "competitor_vendor": "Prodoscore",
            "competitor_category": "Workforce productivity analytics",
            "evidence_type": "Vendor case-study index",
            "evidence_summary": f"{name} is named on Prodoscore's live case-study index. The individual story was not fully read in this pass.",
            "source_url": "https://www.prodoscore.com/resources/case-studies/",
            "source_publication_date": "Index reviewed 2026-09-30",
            "confidence_score": 88,
            "current_status": "CURRENT CUSTOMER",
            "cross_validated": "no",
            "suggested_buyer_titles": "COO; VP Sales Operations; Managing partner",
            "notes": "Index-level evidence. Confirm the story is still current before outreach.",
        })
        add(rec, replace=True)

    final = []
    for rec in rows_by_key.values():
        if norm(rec["company_name"]) in JUNK_NAMES and rec["current_status"] not in ("FORMER CUSTOMER",):
            rec["current_status"] = "DO NOT TARGET"
            rec["notes"] = (rec.get("notes") or "") + " Name is too generic to identify an employer. Insufficient evidence."
            rec["Tavilo_priority_score"] = 0
        elif norm(rec["company_name"]) in VENDOR_SELF and rec["current_status"] != "FORMER CUSTOMER":
            rec["current_status"] = "DO NOT TARGET"
            rec["notes"] = (rec.get("notes") or "") + " Vendor self-match excluded from prospecting."
            rec["Tavilo_priority_score"] = 0
        employees = parse_employees(rec.get("employee_count"))
        seats = rec.get("estimated_tracked_seats")
        try:
            seats = int(seats) if seats not in ("", None) else None
        except Exception:
            seats = None
        if seats is None and employees and rec["competitor_vendor"] in MONITORING and 25 <= employees <= 2500 and rec["current_status"] == "CURRENT CUSTOMER":
            # Only estimate seats when a case study implies broad rollout and the company is in range.
            if "seat" in (rec.get("notes") or "").lower() or "users" in (rec.get("evidence_summary") or "").lower():
                pass
        blob = evidence_text(rec).lower()
        remote = any(w in blob for w in ("remote", "offshore", "distributed", "hybrid", "work from home", "virtual assistant", "work-from-home"))
        screenshots = "screenshot" in blob or "screencast" in blob
        cost_sensitive = any(w in blob for w in ("cost", "expensive", "cheaper", "saving", "afford"))
        complaints = any(w in blob for w in ("replac", "switch", "lack", "complaint", "micromonit"))
        # overlay flags via notes keywords already in summary
        if rec["current_status"] not in ("FORMER CUSTOMER", "DO NOT TARGET"):
            rec["Tavilo_priority_score"] = priority(rec, employees, seats, remote, screenshots, cost_sensitive, complaints)
        else:
            rec["Tavilo_priority_score"] = 0
        rate, rate_note = RATES.get(rec["competitor_vendor"], (None, ""))
        if seats and rate and rec["current_status"] not in ("FORMER CUSTOMER", "DO NOT TARGET"):
            comp = round(rate * seats, 2)
            tav = tavilo_monthly(seats)
            rec["estimated_competitor_monthly_cost"] = money(comp)
            rec["estimated_Tavilo_monthly_cost"] = money(tav)
            rec["estimated_annual_savings"] = money(round((comp - tav) * 12, 2))
            rec["notes"] = (rec.get("notes") or "") + f" Spend is an estimate using {seats} seats. {rate_note} Tavilo price uses this repo's billing catalog (Starter $49 incl. 10 seats + $4 extra; Business $199 incl. 50 + $3; Growth $399 incl. 100 + $2.50), cheapest plan selected."
        elif rate_note and seats:
            rec["notes"] = (rec.get("notes") or "") + " " + rate_note
        if rec.get("estimated_tracked_seats") in (None, ""):
            rec["estimated_tracked_seats"] = seats or ""
        rec["confidence_score"] = int(rec["confidence_score"])
        final.append(rec)

    final.sort(key=lambda r: (-int(r["Tavilo_priority_score"] or 0), -int(r["confidence_score"] or 0), r["company_name"]))

    with CSV_PATH.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS, extrasaction="ignore")
        w.writeheader()
        for rec in final:
            w.writerow(rec)

    companies = {norm(r["company_name"]) for r in final if r["current_status"] != "DO NOT TARGET"}
    companies_specific = {
        norm(r["company_name"]) for r in final
        if r["current_status"] != "DO NOT TARGET" and r["competitor_vendor"] not in AMBIGUOUS
    }
    by_vendor = defaultdict(lambda: {"accounts": 0, "high_conf": 0, "seats": 0, "industries": defaultdict(int), "complaints": 0})
    for r in final:
        if r["current_status"] == "DO NOT TARGET":
            continue
        b = by_vendor[r["competitor_vendor"]]
        b["accounts"] += 1
        if int(r["confidence_score"]) >= 85 and r["current_status"] in ("CURRENT CUSTOMER", "PROBABLE CUSTOMER"):
            b["high_conf"] += 1
        try:
            b["seats"] += int(r["estimated_tracked_seats"] or 0)
        except Exception:
            pass
        if r["industry"]:
            b["industries"][r["industry"]] += 1
        if any(w in (r["evidence_summary"] or "").lower() for w in ("replac", "micromonit", "expensive", "lack")):
            b["complaints"] += 1

    def status_count(s):
        return sum(1 for r in final if r["current_status"] == s)

    channels = defaultdict(int)
    for r in final:
        channels[r["evidence_type"] or "unknown"] += 1

    summary = {
        "relationship_rows": len(final),
        "unique_companies_excluding_do_not_target": len(companies),
        "unique_companies_excluding_ambiguous_keywords": len(companies_specific),
        "current": status_count("CURRENT CUSTOMER"),
        "probable": status_count("PROBABLE CUSTOMER"),
        "possible": status_count("POSSIBLE CUSTOMER"),
        "former": status_count("FORMER CUSTOMER"),
        "do_not_target": status_count("DO NOT TARGET"),
        "vendors": {
            k: {
                "accounts": v["accounts"],
                "high_conf": v["high_conf"],
                "estimated_seats": v["seats"],
                "top_industries": [i for i, _ in sorted(v["industries"].items(), key=lambda kv: -kv[1])[:3]],
                "complaint_mentions": v["complaints"],
            }
            for k, v in sorted(by_vendor.items(), key=lambda kv: -kv[1]["accounts"])
        },
        "channels": dict(channels),
    }
    SUMMARY_PATH.write_text(json.dumps(summary, indent=2))
    print(json.dumps({k: summary[k] for k in summary if k != "vendors"}, indent=2))
    print("vendors", len(summary["vendors"]))
    print("csv", CSV_PATH)


if __name__ == "__main__":
    main()
