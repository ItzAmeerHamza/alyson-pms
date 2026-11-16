#!/usr/bin/env python3
"""Merge the v3 agent research (v3/raw/*.json) into the deliverables.

Run with the openpyxl venv:
  ../outreach-sources/work/.venv/bin/python build_v3.py   (or any python with openpyxl)

Outputs in v3/out/: master, top-50, current, needs-validation, former, competitor summary,
source audit, channel summary (CSV) and tavilo-v3-outreach.xlsx with every list as a sheet.
"""
import csv, json, re
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlparse

V3 = Path(__file__).resolve().parent
RAW, OUT = V3 / "raw", V3 / "out"
OUT.mkdir(exist_ok=True)

# Re-validation streams checked the earlier rows most recently, so their contact fields win.
TRUST = ["enrich-", "reval-", "discover-"]

VENDOR_ALIASES = {
    "toggl": "Toggl Track", "toggl track": "Toggl Track", "timedoctor": "Time Doctor",
    "time doctor 2": "Time Doctor", "webwork": "WebWork Time Tracker", "we360": "We360.ai",
    "we360.ai": "We360.ai", "kickidler": "Kickidler", "keepactive": "Kickidler",
    "veriato": "Veriato", "veriato vision": "Veriato", "tsheets": "QuickBooks Time",
    "quickbooks time": "QuickBooks Time", "timely": "Timely", "memtime": "Memtime",
    "insightful (workpuls)": "Insightful", "workpuls": "Insightful", "timesheets.com": "Timesheets",
    "timeular": "Timeular", "early": "Timeular", "harvest": "Harvest", "clockify": "Clockify",
    "timeular (early)": "Timeular", "replicon (deltek)": "Replicon", "controlio (we controlio)": "Controlio",
    "ekran system (syteca)": "Ekran System", "kickidler / keepactive": "Kickidler",
    "sapience analytics": "Sapience", "staffcop enterprise": "StaffCop", "7pace timetracker": "7pace",
}
MONITORING = {"Time Doctor", "Hubstaff", "Insightful", "DeskTime", "Time Champ", "WebWork Time Tracker",
              "We360.ai", "ActivTrak", "Teramind", "Controlio", "Monitask", "ProHance", "Prodoscore",
              "Kickidler", "Veriato", "Work Examiner", "TimeCamp", "Apploye", "Traqq", "Workstatus",
              "EmpMonitor", "Sapience", "CurrentWare", "Screenshot Monitor", "Ekran System", "Flowace"}

# Fallback list prices (USD per user per month, monthly billing, the plan a small team would pick
# to get the features they use). Overridden by v3/raw/competitors.json `price_per_seat` when present.
FALLBACK_PRICE = {}

# Orchestrator decisions after reading the agent reports (normalized-name fragment -> reason).
MANUAL_DNT = {
    "buildarocketboy": "Do not contact: active litigation involving Teramind monitoring.",
    "7shifts": "Sells its own restaurant scheduling and time-clock software (competitor).",
}

# Contacts an agent showed belong to a different, same-named company (company fragment -> names).
MANUAL_DROP_CONTACTS = {
    "aliaservices": ["krzysztofdzietczenia"],  # Polish "Alia Services Sp. z o.o.", not the Insightful customer
}

# Companies whose older company-level phone/email/LinkedIn belonged to a different, same-named firm
# (exact normalized name). The POSSIBLE re-check cleared them; keep older streams from refilling them.
MANUAL_CLEAR_COMPANY_CONTACT = {
    "raindrop",  # TimeCamp story is Raindrop Marketing (San Diego); old details were raindrop.com's
}

STATUS_ORDER = {"CURRENT": 0, "PROBABLE": 1, "POSSIBLE": 2, "FORMER": 3, "DO_NOT_TARGET": 4}
COMPANY_LEVEL_DNT = re.compile(r"vendor|competitor|defunct|parked|closed|shut|dissolved|liquidat|bankrupt|for sale|absorbed|now part of|redirects to|no longer resolve|bought by|not a real|"
                               r"reseller|partner|review site|directory|affiliate|no longer exists|no longer active|inactive|dead|"
                               r"duplicate|acquired and|individual|freelancer|false match|wrong company", re.I)


def canon_vendor(v):
    v = (v or "").strip()
    return VENDOR_ALIASES.get(v.lower(), v)


def host(url):
    try:
        h = urlparse(url if "//" in url else "//" + url).hostname or ""
    except ValueError:
        return ""
    return h.lower().removeprefix("www.")


def domain_of(r):
    for k in ("company_domain", "website"):
        v = (r.get(k) or "").strip().lower()
        if v and " " not in v and "." in v:
            h = host(v)
            if h and not any(s in h for s in ("linkedin.", "facebook.", "glassdoor.", "theirstack.")):
                return h
    return ""


def norm(s):
    s = re.sub(r"\(.*?\)", "", (s or "").lower())
    s = re.sub(r"\b(inc|llc|ltd|limited|corp|corporation|co|gmbh|pvt|private|pty|plc|sa|bv|srl)\b\.?", "", s)
    return re.sub(r"[^a-z0-9]", "", s)


def num(v):
    m = re.search(r"\d[\d,]*", str(v or ""))
    return int(m.group(0).replace(",", "")) if m else None


def li(url):
    url = (url or "").strip()
    return url if "linkedin.com/in/" in url else ""


def year(d):
    m = re.search(r"(20\d\d)", str(d or ""))
    return int(m.group(1)) if m else None


STREAM_FILE = re.compile(r"^((?:reval|discover|enrich)-[a-z0-9-]+?)(?:[.-]part-?\d+)?\.json$")


def stream_files():
    """Final <stream>.json per stream; its part files only when the final file is missing."""
    found = defaultdict(lambda: {"final": None, "parts": []})
    for p in sorted(RAW.rglob("*.json")):
        m = STREAM_FILE.match(p.name)
        if not m:
            continue
        slot = found[m.group(1)]
        if p.name == m.group(1) + ".json" and p.parent == RAW:
            slot["final"] = p
        else:
            slot["parts"].append(p)
    for stream, slot in sorted(found.items()):
        for p in ([slot["final"]] if slot["final"] else slot["parts"]):
            yield stream, p


def load_raw():
    recs = []
    for stream, p in stream_files():
        try:
            data = json.loads(p.read_text())
        except json.JSONDecodeError as e:
            print(f"!! {p.name}: {e}")
            continue
        for r in data if isinstance(data, list) else []:
            if not isinstance(r, dict) or str(r.get("company_name", "")).startswith("__"):
                continue
            r["_stream"] = stream
            if stream.startswith("enrich-"):
                # Enrichment rows carry contacts only; their scores are about contact quality, not tool use.
                r["confidence_score"] = 0
                if r.get("status") != "DO_NOT_TARGET":
                    r["status"] = ""
                for k in ("evidence_summary", "source_url", "source_publication_date"):
                    r.pop(k, None)
            # Some agents merged two tools into one record ("Hubstaff + Time Doctor"): one row per tool.
            for v in re.split(r"\s*\+\s*", r.get("vendor") or r.get("competitor_vendor") or ""):
                recs.append(dict(r, vendor=canon_vendor(v)))
    return recs


def load_prices():
    prices, urls = dict(FALLBACK_PRICE), {}
    p = RAW / "competitors.json"
    comps = json.loads(p.read_text()) if p.exists() else []
    for c in comps:
        v = canon_vendor(c.get("vendor"))
        pp = c.get("price_per_seat")
        if isinstance(pp, (int, float)) and pp > 0:
            prices[v] = float(pp)
        urls[v] = c.get("pricing_url", "")
    return prices, urls, comps


def tavilo_cost(seats):
    if not seats:
        return None
    plans = [49 + 4 * max(0, seats - 10), 199 + 3 * max(0, seats - 50), 399 + 2.5 * max(0, seats - 100)]
    return round(min(plans), 2)


class Company:
    def __init__(self):
        self.recs = []

    def add(self, r):
        self.recs.append(r)

    def sorted_recs(self):
        def trust(r):
            return next((i for i, t in enumerate(TRUST) if r["_stream"].startswith(t)), 9)
        return sorted(self.recs, key=trust)

    def first(self, *keys):
        for r in self.sorted_recs():
            for k in keys:
                v = r.get(k)
                if v not in (None, "", [], 0):
                    return v
        return ""


def merge_contacts(recs):
    out, seen = [], set()
    # Enrichment agents re-checked who is still in role and re-listed the confirmed contacts,
    # so when they found any, older streams' contacts (which may have left) are not mixed in.
    enriched = [r for r in recs if r["_stream"].startswith("enrich-") and r.get("contacts")]
    # The POSSIBLE re-check came last and kept input contacts only if still confirmed in role,
    # so its list (even an empty one) replaces every older stream's.
    rechecked = [r for r in recs if r["_stream"].startswith("reval-possible")]
    for r in rechecked or enriched or recs:
        cs = r.get("contacts") or []
        if not cs and r.get("contact_name"):
            cs = [{"name": r.get("contact_name"), "title": r.get("contact_title"),
                   "linkedin": r.get("contact_linkedin"), "source_url": r.get("contact_source_url")}]
        for c in cs:
            n = (c.get("name") or "").strip()
            if not n or norm(n) in seen:
                if n:  # fill a LinkedIn the first copy lacked
                    for o in out:
                        if norm(o["name"]) == norm(n) and not o["linkedin"]:
                            o["linkedin"] = li(c.get("linkedin"))
                continue
            seen.add(norm(n))
            out.append({"name": n, "title": c.get("title", ""), "linkedin": li(c.get("linkedin")),
                        "source_url": c.get("source_url", "")})
    company = norm(recs[0].get("company_name")) if recs else ""
    drop = {p for k, names in MANUAL_DROP_CONTACTS.items() if k in company for p in names}
    out = [o for o in out if norm(o["name"]) not in drop
           and not re.search(r"^former\b|\bformer (ceo|coo|head|global)|no longer|has left|left the company",
                             o["title"], re.I)]
    # Contacts an agent flagged as unverified / possible name collision go last.
    out.sort(key=lambda o: bool(re.search(r"unverified|name collision|not verified", o["title"], re.I)))
    return out


def build():
    recs = load_raw()
    prices, price_urls, comps = load_prices()

    # --- dedupe companies (domain first, then normalized name) ---
    by_key, companies = {}, []
    for r in recs:
        keys = [k for k in (domain_of(r), norm(r.get("company_name"))) if k]
        if not keys:
            continue
        c = next((by_key[k] for k in keys if k in by_key), None)
        if c is None:
            c = Company()
            companies.append(c)
        c.add(r)
        for k in keys:
            by_key.setdefault(k, c)

    master, people = [], []
    for c in companies:
        recs_c = c.sorted_recs()
        name = c.first("company_name")
        dom = next((domain_of(r) for r in recs_c if domain_of(r)), "")
        emp = c.first("employee_count")
        emp_n = num(emp)
        contacts = merge_contacts(recs_c)
        if norm(name) in MANUAL_CLEAR_COMPANY_CONTACT:
            for r in recs_c:
                for k in ("company_linkedin", "company_phone", "public_email", "contact_source_url"):
                    r[k] = ""
        company_dnt = [r for r in recs_c if r.get("status") == "DO_NOT_TARGET"
                       and COMPANY_LEVEL_DNT.search(r.get("status_reason", "") + " " + r.get("notes", ""))]
        manual = next((why for k, why in MANUAL_DNT.items() if k in norm(name)), "")
        if manual:
            company_dnt = [{"status_reason": manual}]
            for r in recs_c:
                r["status_reason"] = manual + " " + r.get("status_reason", "")
        signals = " ".join(str(r.get("workforce_signals", "")) for r in recs_c)
        industry = c.first("industry")
        complaints = [r for r in recs_c if r.get("unhappy_type")]

        by_vendor = defaultdict(list)
        evidence = [r for r in recs_c if not r["_stream"].startswith("enrich-")] or recs_c
        for r in evidence:
            if r["vendor"]:
                by_vendor[r["vendor"]].append(r)
        rels = []
        for vendor, rs in by_vendor.items():
            urls = []
            for r in rs:
                for k in ("source_url", "second_source_url", "third_source_url", "complaint_url"):
                    u = (r.get(k) or "").strip()
                    if u.startswith("http") and u not in urls:
                        urls.append(u)
            indep = {host(u) for u in urls if not host(u).endswith("theirstack.com")}
            all_rs = rs
            # A re-check of a POSSIBLE row is the latest verdict on that company + tool.
            rs = [r for r in rs if r["_stream"].startswith("reval-possible")] or rs
            best = max(rs, key=lambda r: (int(r.get("confidence_score") or 0), -STATUS_ORDER.get(r.get("status"), 5)))
            conf = int(best.get("confidence_score") or 0) + 5 * max(0, len(indep) - 1)
            conf = min(conf, 100)
            statuses = [r.get("status") for r in rs]
            pos = [r for r in rs if r.get("status") in ("CURRENT", "PROBABLE", "POSSIBLE")]
            former = [r for r in rs if r.get("status") == "FORMER"]
            if company_dnt:
                status = "DO_NOT_TARGET"
            elif former and not any((year(r.get("source_publication_date")) or 0) >
                                    max(year(f.get("source_publication_date")) or 0 for f in former)
                                    for r in pos if r.get("status") != "POSSIBLE"):
                status = "FORMER"
            elif pos:
                status = min((r.get("status") for r in pos), key=STATUS_ORDER.get)
            elif "DO_NOT_TARGET" in statuses:
                status = "DO_NOT_TARGET"
            else:
                status = best.get("status") or "POSSIBLE"
            if status == "CURRENT" and conf < 80:
                status = "PROBABLE"
            seats_stated = num(c.first("estimated_tracked_seats"))
            seats = seats_stated or emp_n
            price = prices.get(vendor)
            comp_cost = round(price * seats, 2) if (price and seats) else None
            tav = tavilo_cost(seats)
            saving = round(12 * (comp_cost - tav), 2) if (comp_cost and tav) else None
            rs = all_rs
            dates = [r.get("source_publication_date") for r in rs if r.get("source_publication_date")]
            rels.append(dict(
                vendor=vendor, status=status, conf=conf, best=best, urls=urls,
                cross=len(indep) >= 2, seats=seats, seats_stated=bool(seats_stated),
                comp_cost=comp_cost, tav=tav, saving=saving, dates=dates, streams=sorted({r["_stream"] for r in rs}),
                evidence_types=sorted({r.get("evidence_type", "") for r in rs if r.get("evidence_type")}),
                unhappy=next((r for r in rs if r.get("unhappy_type")), None),
            ))

        for rel in rels:
            score = priority(emp_n, rel, signals + " " + industry, complaints, c)
            b, u = rel["best"], rel["unhappy"] or {}
            row = {
                "company_name": name, "company_domain": dom, "industry": industry,
                "HQ_country": c.first("hq_country", "HQ_country"), "employee_count": emp,
                "estimated_tracked_seats": (f"{rel['seats']} (stated)" if rel["seats_stated"] else
                                            f"{rel['seats']} (estimate = headcount)" if rel["seats"] else ""),
                "competitor_vendor": rel["vendor"],
                "competitor_category": "Employee monitoring / activity tracking" if rel["vendor"] in MONITORING else "Time tracking",
                "evidence_type": b.get("evidence_type", ""), "evidence_summary": b.get("evidence_summary", ""),
                "evidence_quote": b.get("evidence_quote", ""),
                "source_url": rel["urls"][0] if rel["urls"] else b.get("source_url", ""),
                "source_publication_date": b.get("source_publication_date", ""),
                "first_detected_date": b.get("first_detected_date", "") or (min(rel["dates"]) if rel["dates"] else ""),
                "last_detected_date": b.get("last_detected_date", "") or (max(rel["dates"]) if rel["dates"] else ""),
                "confidence_score": rel["conf"], "current_status": rel["status"],
                "second_source_url": rel["urls"][1] if len(rel["urls"]) > 1 else "",
                "third_source_url": rel["urls"][2] if len(rel["urls"]) > 2 else "",
                "cross_validated": "yes" if rel["cross"] else "no",
                "estimated_competitor_monthly_cost": f"~${rel['comp_cost']:,.0f} (estimate)" if rel["comp_cost"] else "",
                "competitor_pricing_source": price_urls.get(rel["vendor"], "") if rel["comp_cost"] else "",
                "estimated_Tavilo_monthly_cost": f"~${rel['tav']:,.0f} (estimate)" if rel["tav"] else "",
                "estimated_annual_savings": f"~${rel['saving']:,.0f} (estimate)" if rel["saving"] else "",
                "Tavilo_priority_score": score,
                "suggested_buyer_titles": buyer_titles(signals + " " + industry, emp_n),
                "unhappy_signal": u.get("unhappy_type", ""), "complaint_category": u.get("complaint_category", ""),
                "complaint_summary": u.get("complaint_summary", ""), "complaint_url": u.get("complaint_url", ""),
                "left_tool": c.first("left_tool"), "now_tool": c.first("now_tool"),
                "workforce_signals": c.first("workforce_signals"),
                "decision_maker": contacts[0]["name"] if contacts else "",
                "decision_maker_title": contacts[0]["title"] if contacts else "",
                "decision_maker_linkedin": contacts[0]["linkedin"] if contacts else "",
                "decision_maker_source": contacts[0]["source_url"] if contacts else "",
                "second_contact": contacts[1]["name"] if len(contacts) > 1 else "",
                "second_contact_title": contacts[1]["title"] if len(contacts) > 1 else "",
                "second_contact_linkedin": contacts[1]["linkedin"] if len(contacts) > 1 else "",
                "other_contacts": "; ".join(f"{x['name']} ({x['title']}) {x['linkedin']}".strip() for x in contacts[2:]),
                "company_linkedin": c.first("company_linkedin"), "company_phone": c.first("company_phone"),
                "public_email": c.first("public_email"), "contact_source_url": c.first("contact_source_url"),
                "pitch_angle": c.first("pitch_angle"),
                "found_by_streams": ", ".join(rel["streams"]),
                "notes": " | ".join(dict.fromkeys(filter(None, [b.get("status_reason", "")] +
                                                         [r.get("notes", "") for r in recs_c[:3]])))[:1500],
            }
            master.append(row)

    master.sort(key=lambda r: (STATUS_ORDER[r["current_status"]], -r["Tavilo_priority_score"], -r["confidence_score"]))
    write_outputs(master, recs, comps, prices, price_urls)


def priority(emp, rel, text, complaints, c):
    t = text.lower()
    s = 0
    if emp:
        s += 20 if 25 <= emp <= 2500 else 8 if (10 <= emp < 25 or 2500 < emp <= 5000) else 0
    if (rel["seats"] or 0) >= 25:
        s += 10
    if re.search(r"remote|hybrid|distributed|work from home|wfh", t):
        s += 8
    if re.search(r"bpo|call cent|contact cent|customer (service|support)|outsourc|virtual assist|\bva\b|staffing", t):
        s += 12
    if re.search(r"agency|agencies|marketing|creative|design studio", t):
        s += 8
    if re.search(r"offshore|contractor|freelanc|philippin|pakistan|india|latam", t):
        s += 6
    s += 8 if rel["vendor"] in MONITORING else 3
    if re.search(r"payroll|billing|invoice|billable", t):
        s += 4
    if any(r.get("unhappy_type") == "complaint" for r in complaints):
        s += 15
    elif complaints:
        s += 8
    if any(r.get("complaint_category") == "price" for r in complaints) or "price" in t:
        s += 5
    s += {"CURRENT": 10, "PROBABLE": 6}.get(rel["status"], 0)
    if rel["status"] in ("DO_NOT_TARGET",):
        return 0
    if rel["status"] == "FORMER":
        s -= 10
    return max(0, min(100, s))


def buyer_titles(text, emp):
    t = text.lower()
    if re.search(r"bpo|call cent|outsourc|virtual assist|staffing", t):
        return "COO; Head of Operations; Workforce Manager; CEO"
    if emp and emp < 50:
        return "Founder/CEO; Operations Manager"
    if re.search(r"software|it services|develop", t):
        return "CTO; VP Engineering; Head of Operations"
    return "COO; Head of Operations; HR Director; CEO"


OUTREACH_COLS = ["company_name", "company_domain", "HQ_country", "employee_count", "industry",
                 "competitor_vendor", "current_status", "confidence_score", "Tavilo_priority_score",
                 "unhappy_signal", "complaint_category", "complaint_summary", "complaint_url", "left_tool", "now_tool",
                 "evidence_type", "source_publication_date", "source_url", "evidence_summary",
                 "decision_maker", "decision_maker_title", "decision_maker_linkedin", "decision_maker_source",
                 "second_contact", "second_contact_title", "second_contact_linkedin", "other_contacts",
                 "company_linkedin", "company_phone", "public_email", "contact_source_url",
                 "estimated_tracked_seats", "estimated_competitor_monthly_cost", "estimated_Tavilo_monthly_cost",
                 "estimated_annual_savings", "suggested_buyer_titles", "pitch_angle", "workforce_signals",
                 "second_source_url", "third_source_url", "cross_validated", "found_by_streams", "notes"]


def per_company(rows):
    """One row per company: its best non-DNT relationship, with the other tools listed."""
    best = {}
    for r in rows:
        k = r["company_domain"] or norm(r["company_name"])
        o = best.get(k)
        if o is None or (STATUS_ORDER[r["current_status"]], -r["Tavilo_priority_score"]) < \
                (STATUS_ORDER[o["current_status"]], -o["Tavilo_priority_score"]):
            if o is not None:
                r = dict(r, notes=f"Also: {o['competitor_vendor']} ({o['current_status']}). " + r["notes"])
            best[k] = r
        else:
            best[k] = dict(o, notes=f"Also: {r['competitor_vendor']} ({r['current_status']}). " + o["notes"])
    return list(best.values())


def write_csv(name, rows, cols):
    with (OUT / name).open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def write_outputs(master, recs, comps, prices, price_urls):
    cols = list(master[0].keys()) if master else []
    write_csv("1-master-dataset.csv", master, cols)
    companies = per_company(master)
    active = [r for r in companies if r["current_status"] in ("CURRENT", "PROBABLE", "POSSIBLE")]
    active.sort(key=lambda r: (-r["Tavilo_priority_score"], -r["confidence_score"]))
    top50 = [r for r in active if r["current_status"] in ("CURRENT", "PROBABLE")][:50]
    write_csv("2-top-50-prospects.csv", top50, OUTREACH_COLS)
    current = [r for r in master if r["current_status"] == "CURRENT" and r["confidence_score"] >= 90]
    write_csv("3-high-confidence-current.csv", current, cols)
    needs = [r for r in master if r["current_status"] == "POSSIBLE" or
             (r["current_status"] == "PROBABLE" and r["confidence_score"] < 80)]
    needs.sort(key=lambda r: -r["Tavilo_priority_score"])
    write_csv("4-needs-validation.csv", needs, cols)
    former = [r for r in master if r["current_status"] == "FORMER"]
    write_csv("5-former-customers.csv", former, cols)

    themes = {}
    for f in RAW.glob("complaint-themes-*.json"):
        try:
            for t in json.loads(f.read_text()):
                v = canon_vendor(t.get("vendor"))
                themes.setdefault(v, []).extend(
                    x.get("theme", "") if isinstance(x, dict) else str(x) for x in t.get("themes", []))
        except (json.JSONDecodeError, AttributeError):
            pass
    summ = []
    for v in sorted({r["competitor_vendor"] for r in master}):
        rs = [r for r in master if r["competitor_vendor"] == v and r["current_status"] != "DO_NOT_TARGET"]
        if not rs:
            continue
        ind = Counter(r["industry"] for r in rs if r["industry"]).most_common(3)
        seats = sum(num(r["estimated_tracked_seats"]) or 0 for r in rs if "(stated)" in r["estimated_tracked_seats"])
        summ.append({"vendor": v, "accounts_discovered": len(rs),
                     "current": sum(r["current_status"] == "CURRENT" for r in rs),
                     "high_confidence_accounts": sum(r["current_status"] == "CURRENT" and r["confidence_score"] >= 90 for r in rs),
                     "probable": sum(r["current_status"] == "PROBABLE" for r in rs),
                     "possible": sum(r["current_status"] == "POSSIBLE" for r in rs),
                     "former": sum(r["current_status"] == "FORMER" for r in rs),
                     "estimated_seats_stated": seats,
                     "primary_industries": "; ".join(i for i, _ in ind),
                     "companies_with_complaints": sum(bool(r["unhappy_signal"]) for r in rs),
                     "common_complaints": "; ".join(dict.fromkeys(filter(None, themes.get(v, []))))[:600],
                     "price_per_seat_used": prices.get(v, ""), "pricing_source": price_urls.get(v, "")})
    summ.sort(key=lambda s: -s["accounts_discovered"])
    write_csv("6-competitor-summary.csv", summ, list(summ[0].keys()) if summ else ["vendor"])

    audit = [{"company_name": r.get("company_name"), "vendor": r["vendor"], "stream": r["_stream"],
              "evidence_type": r.get("evidence_type", ""), "status_given_by_stream": r.get("status", ""),
              "confidence_given": r.get("confidence_score", ""), "source_url": r.get("source_url", ""),
              "source_publication_date": r.get("source_publication_date", "")} for r in recs]
    write_csv("7-source-audit.csv", audit, list(audit[0].keys()) if audit else ["company_name"])

    useful = {(r["company_domain"] or norm(r["company_name"])) for r in active if r["Tavilo_priority_score"] >= 60
              and r["current_status"] in ("CURRENT", "PROBABLE")}
    ch = defaultdict(lambda: Counter())
    for r in recs:
        for key in (("stream", r["_stream"]), ("evidence_type", r.get("evidence_type") or "?")):
            c = ch[key]
            c["records"] += 1
            k = domain_of(r) or norm(r.get("company_name"))
            c[f"status:{r.get('status')}"] += 1
            if k in useful:
                c["useful"] += 1
    chan = [{"dimension": d, "channel": n, "records": c["records"], "CURRENT": c["status:CURRENT"],
             "PROBABLE": c["status:PROBABLE"], "POSSIBLE": c["status:POSSIBLE"], "FORMER": c["status:FORMER"],
             "DO_NOT_TARGET": c["status:DO_NOT_TARGET"], "records_on_useful_prospects": c["useful"]}
            for (d, n), c in ch.items()]
    chan.sort(key=lambda x: (x["dimension"], -x["records_on_useful_prospects"]))
    write_csv("8-channel-summary.csv", chan, list(chan[0].keys()) if chan else ["channel"])

    stats = {
        "relationships": len(master), "unique_companies": len(companies),
        "unique_active_companies": len(active),
        "by_status": dict(Counter(r["current_status"] for r in companies)),
        "active_with_decision_maker": sum(bool(r["decision_maker"]) for r in active),
        "active_with_personal_linkedin": sum(bool(r["decision_maker_linkedin"]) for r in active),
        "active_with_phone": sum(bool(r["company_phone"]) for r in active),
        "active_with_email": sum(bool(r["public_email"]) for r in active),
        "active_unhappy": sum(bool(r["unhappy_signal"]) for r in active),
        "streams": dict(Counter(r["_stream"] for r in recs)),
    }
    (OUT / "stats.json").write_text(json.dumps(stats, indent=1))
    print(json.dumps(stats, indent=1))
    try:
        write_xlsx(active, top50, current, needs, former, summ, chan, audit, master, comps, stats)
    except ImportError:
        print("openpyxl missing; skipped xlsx")


def write_xlsx(active, top50, current, needs, former, summ, chan, audit, master, comps, stats):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    guide = wb.active
    guide.title = "How to read"
    lines = [
        f"Tavilo competitor-customer research v3 — built {__import__('datetime').date.today()} from public sources.",
        "",
        "Every row was re-checked: the earlier lists were treated as unverified.",
        "Status: CURRENT = strong recent evidence; PROBABLE = strong but not fully confirmed; POSSIBLE = technographic/ambiguous;",
        "FORMER = a source says they stopped; DO_NOT_TARGET = vendor, false match, defunct, or no evidence.",
        "confidence_score = how sure we are they use the tool (0-100). Tavilo_priority_score = how good a prospect they are (0-100).",
        "Seat counts and costs are ESTIMATES. When no seat count is stated, seats = headcount. Competitor list prices: Competitors sheet.",
        "Contacts: every name, LinkedIn, phone and email was copied from a public page (source column). Nothing was guessed;",
        "no email was built from a name pattern and no LinkedIn URL was constructed. Blank = not found.",
        "Anonymous reviewers / Reddit users were never identified; companies appear only when publicly named.",
        "",
        *[f"{k}: {v}" for k, v in stats.items() if k != "streams"],
    ]
    for i, t in enumerate(lines, 1):
        guide.cell(i, 1, str(t)).font = Font(name="Arial", bold=(i == 1))
    guide.column_dimensions["A"].width = 130

    def sheet(title, rows, cols):
        ws = wb.create_sheet(title)
        head = Font(name="Arial", bold=True, color="FFFFFF")
        fills = {"CURRENT": "C6EFCE", "PROBABLE": "DDEBF7", "POSSIBLE": "F2F2F2", "FORMER": "FFF2CC", "DO_NOT_TARGET": "F8CBAD"}
        for j, k in enumerate(cols, 1):
            cell = ws.cell(1, j, k)
            cell.font, cell.fill = head, PatternFill("solid", fgColor="1F3864")
            cell.alignment = Alignment(wrap_text=True, vertical="center")
            ws.column_dimensions[get_column_letter(j)].width = 45 if k in ("evidence_summary", "notes", "complaint_summary", "pitch_angle") else 20
        body = Font(name="Arial", size=10)
        for i, r in enumerate(rows, 2):
            for j, k in enumerate(cols, 1):
                v = r.get(k, "")
                if isinstance(v, (list, dict)):
                    v = json.dumps(v)
                cell = ws.cell(i, j, v)
                cell.font = body
                if isinstance(v, str) and v.startswith("http"):
                    cell.hyperlink = v
                    cell.font = Font(name="Arial", size=10, color="0563C1", underline="single")
            st = r.get("current_status")
            if st in fills:
                ws.cell(i, 1).fill = PatternFill("solid", fgColor=fills[st])
        ws.freeze_panes = "B2"
        ws.auto_filter.ref = f"A1:{get_column_letter(max(len(cols), 1))}{max(len(rows) + 1, 2)}"

    mcols = list(master[0].keys()) if master else []
    sheet("Outreach (all active)", active, OUTREACH_COLS)
    sheet("Top 50", top50, OUTREACH_COLS)
    sheet("Unhappy with tool", [r for r in active if r["unhappy_signal"]], OUTREACH_COLS)
    sheet("High-confidence current", current, mcols)
    sheet("Needs validation", needs, mcols)
    sheet("Former customers", former, mcols)
    sheet("Competitor summary", summ, list(summ[0].keys()) if summ else [])
    if comps:
        ccols = list(dict.fromkeys(k for c in comps for k in c.keys()))
        sheet("Competitors", comps, ccols)
    sheet("Channel summary", chan, list(chan[0].keys()) if chan else [])
    sheet("Source audit", audit, list(audit[0].keys()) if audit else [])
    sheet("Master (all relationships)", master, mcols)
    wb.save(OUT / "tavilo-v3-outreach.xlsx")


if __name__ == "__main__":
    build()
