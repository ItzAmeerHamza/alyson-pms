"""One workbook with every v3 list as a tab, plus a ready-to-work prospect list and a combined
unhappy-customers list. Reads the CSVs that build_v3.py writes to out/, so run build_v3.py first.

Output: out/tavilo-v3-workbook.xlsx
"""
import csv
import json
import re
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

V3 = Path(__file__).resolve().parent
RAW, OUT = V3 / "raw", V3 / "out"

STATUS_ORDER = {"CURRENT": 0, "PROBABLE": 1, "POSSIBLE": 2, "FORMER": 3, "DO_NOT_TARGET": 4}
# Clock-in apps for hourly / field staff. Tavilo is a desktop tracker, so these users are a weak fit.
FRONTLINE_TOOLS = {"Homebase", "Connecteam", "QuickBooks Time", "ClockShark", "busybusy", "Timeero",
                   "Buddy Punch", "Timesheet Mobile", "TimeClick"}
MAX_EMPLOYEES = 2500
REVIEW_SITES = ("glassdoor.", "indeed.", "ambitionbox.", "comparably.", "kununu.", "jobstreet.")
OUTREACH_STATUSES = ["Not contacted", "Contacted", "Replied", "Meeting booked", "Not interested", "Wrong contact"]


def norm(s):
    s = re.sub(r"\(.*?\)", "", (s or "").lower())
    s = re.sub(r"\b(inc|llc|ltd|limited|corp|corporation|co|gmbh|pvt|private|pty|plc|sa|bv|srl)\b\.?", "", s)
    return re.sub(r"[^a-z0-9]", "", s)


def num(v):
    m = re.search(r"\d[\d,]*", str(v or ""))
    return int(m.group(0).replace(",", "")) if m else None


def read(name):
    with (OUT / name).open(encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def key(r):
    return r["company_domain"].strip().lower() or norm(r["company_name"])


def split_tools(s):
    out = []
    for t in re.split(r"\s*;\s*", s or ""):
        t = t.strip()
        if not t:
            continue
        if re.search(r"unnamed|unknown|legacy|previous|prior", t, re.I) or t == "(unnamed)":
            t = "Unnamed previous tool"
        m = re.match(r"^(.*?)\s*\((.*)\)$", t)
        if m and len(m.group(2)) > 20:
            t = m.group(1)
        out.append(t)
    return out


def size_band(n):
    if n is None:
        return "Unknown"
    for hi, label in ((10, "1-10"), (24, "11-24"), (100, "25-100"), (500, "101-500"), (2500, "501-2,500")):
        if n <= hi:
            return label
    return "2,500+"


# ---------- company level ----------

def companies(master):
    groups = defaultdict(list)
    for r in master:
        groups[key(r)].append(r)
    out = []
    for rows in groups.values():
        rows.sort(key=lambda r: (STATUS_ORDER[r["current_status"]], -(num(r["Tavilo_priority_score"]) or 0)))
        best = dict(rows[0])
        best["_rows"] = rows
        best["all_tools"] = "; ".join(dict.fromkeys(f"{r['competitor_vendor']} ({r['current_status']})" for r in rows))
        out.append(best)
    return out


def has(r, k):
    return bool((r.get(k) or "").strip())


def contact_route(c):
    if has(c, "decision_maker") and (has(c, "company_phone") or has(c, "public_email") or has(c, "decision_maker_linkedin")):
        return "Decision maker + direct route"
    if has(c, "company_phone") or has(c, "public_email") or has(c, "company_linkedin"):
        return "Company contact only"
    return "None found"


# ---------- unhappy customers ----------

def unhappy(master, comp_by_key):
    """One row per company + tool they were unhappy with."""
    merged = {}
    for r in master:
        sig = r["unhappy_signal"].strip()
        if not (sig or r["left_tool"].strip() or r["complaint_summary"].strip()):
            continue
        if sig == "complaint" or (not sig and not r["left_tool"].strip()):
            kind, tools = "Complaint (still using)", [r["competitor_vendor"]]
        else:
            kind, tools = "Switched away", split_tools(r["left_tool"]) or [r["competitor_vendor"]]
        for tool in tools:
            k = (key(r), tool.lower())
            m = merged.get(k)
            if m is None:
                merged[k] = m = {"_r": r, "kind": kind, "tool": tool, "themes": [], "summaries": [], "urls": [], "now": []}
            if kind == "Complaint (still using)":
                m["kind"] = kind if m["kind"] == kind else "Complaint, then switched"
            elif m["kind"] == "Complaint (still using)":
                m["kind"] = "Complaint, then switched"
            for c in re.split(r"[;,/]", r["complaint_category"]):
                if c.strip():
                    m["themes"].append(c.strip())
            s = r["complaint_summary"].strip() or r["evidence_summary"].strip()
            if s:
                m["summaries"].append(s)
            for u in (r["complaint_url"], r["source_url"]):
                if u.strip():
                    m["urls"].append(u.strip())
            if r["now_tool"].strip() and r["now_tool"].strip().lower() != tool.lower():
                m["now"].append(r["now_tool"].strip())

    rows = []
    for (ck, _), m in merged.items():
        r, c = m["_r"], comp_by_key[ck]
        urls = list(dict.fromkeys(m["urls"]))
        first = urls[0] if urls else ""
        who = "Employees (review site)" if any(s in first for s in REVIEW_SITES) else "Company / public statement"
        st = c["current_status"]
        target = "No (ruled out)" if st == "DO_NOT_TARGET" else "Yes"
        rows.append({
            "company_name": c["company_name"], "company_domain": c["company_domain"],
            "unhappy_with_tool": m["tool"], "signal": m["kind"],
            "complaint_theme": "; ".join(dict.fromkeys(m["themes"])),
            "what_happened": " | ".join(dict.fromkeys(m["summaries"]))[:1500],
            "complaint_from": who,
            "source_url": first, "other_source_urls": " ".join(urls[1:]),
            "now_using": "; ".join(dict.fromkeys(m["now"])) or ("" if m["kind"] == "Switched away" else m["tool"]),
            "company_status": st, "target": target,
            "HQ_country": c["HQ_country"], "employee_count": c["employee_count"], "industry": c["industry"],
            "decision_maker": c["decision_maker"], "decision_maker_title": c["decision_maker_title"],
            "decision_maker_linkedin": c["decision_maker_linkedin"], "company_linkedin": c["company_linkedin"],
            "company_phone": c["company_phone"], "public_email": c["public_email"],
            "contact_source_url": c["contact_source_url"], "pitch_angle": c["pitch_angle"],
            "Tavilo_priority_score": num(c["Tavilo_priority_score"]),
        })
    rank = {"Yes": 0}
    rows.sort(key=lambda x: (rank.get(x["target"], 1), x["signal"] == "Switched away", -(x["Tavilo_priority_score"] or 0)))
    return rows


# ---------- prospects ----------

def why(c, unhappy_tools, complains_now):
    bits = [f"{c['current_status'].title()} {c['competitor_vendor']} user ({c['evidence_type'] or 'evidence'}"
            + (f", {c['source_publication_date']}" if c["source_publication_date"] else "") + ")"]
    if complains_now:
        bits.append(f"Complaints about {c['competitor_vendor']} on record")
    past = [t for t in unhappy_tools if t != c["competitor_vendor"] or not complains_now]
    if past:
        bits.append("Previously left " + ", ".join(past))
    if c["estimated_annual_savings"]:
        bits.append(f"Est. saving {c['estimated_annual_savings'].replace(' (estimate)', '')}/yr (estimate)")
    return ". ".join(bits) + "."


def prospects(comps, unhappy_rows):
    unhappy_by = defaultdict(list)
    for u in unhappy_rows:
        unhappy_by[u["company_domain"].strip().lower() or norm(u["company_name"])].append(u)
    picked, strong_all = [], []
    for c in comps:
        if c["current_status"] not in ("CURRENT", "PROBABLE"):
            continue
        n = num(c["employee_count"])
        route = contact_route(c)
        mine = unhappy_by.get(key(c), [])
        unhappy_tools = list(dict.fromkeys(u["unhappy_with_tool"] for u in mine))
        # A complaint about the tool they use today is the best lead; an old switch away from another tool is weaker.
        complains_now = any(u["signal"] != "Switched away" and u["unhappy_with_tool"] == c["competitor_vendor"] for u in mine)
        prio = num(c["Tavilo_priority_score"]) or 0
        conf = num(c["confidence_score"]) or 0
        reason = ""
        if n is not None and n > MAX_EMPLOYEES:
            reason = f"Too large (over {MAX_EMPLOYEES:,} staff)"
        elif c["competitor_vendor"] in FRONTLINE_TOOLS:
            reason = "Uses a clock-in app for hourly/field staff"
        elif route == "None found":
            reason = "No contact found yet"
        if reason:
            tier = ""
        elif route == "Decision maker + direct route" and n is not None and n >= 11 and (complains_now or prio >= 50):
            tier = "A"
        elif route == "Decision maker + direct route":
            tier = "B"
        else:
            tier = "C"
        row = dict(c, tier=tier, excluded_reason=reason, contact_route=route, size_band=size_band(n),
                   unhappy_with=", ".join(unhappy_tools),
                   complains_now="Yes" if complains_now else "", why_target=why(c, unhappy_tools, complains_now),
                   Tavilo_priority_score=prio, confidence_score=conf)
        strong_all.append(row)
        if tier:
            picked.append(row)
    order = {"A": 0, "B": 1, "C": 2}
    picked.sort(key=lambda r: (order[r["tier"]], not r["complains_now"], -r["Tavilo_priority_score"], -r["confidence_score"]))
    for i, r in enumerate(picked, 1):
        r["rank"] = i
    strong_all.sort(key=lambda r: (bool(r["excluded_reason"]), -r["Tavilo_priority_score"]))
    return picked, strong_all


# ---------- workbook ----------

HEAD_FILL = PatternFill("solid", fgColor="1F3864")
STATUS_FILL = {"CURRENT": "C6EFCE", "PROBABLE": "DDEBF7", "POSSIBLE": "F2F2F2", "FORMER": "FFF2CC", "DO_NOT_TARGET": "F8CBAD"}
TIER_FILL = {"A": "C6EFCE", "B": "DDEBF7", "C": "F2F2F2"}
WIDE = {"why_target": 60, "evidence_summary": 55, "what_happened": 70, "pitch_angle": 55, "notes": 60,
        "complaint_summary": 55, "workforce_signals": 40, "all_tools": 35, "other_source_urls": 40, "Notes": 40,
        "Next step": 30}


def sheet(wb, title, rows, cols, labels=None, fill_col=None, fills=None, tracking=False):
    ws = wb.create_sheet(title)
    labels = labels or {}
    allcols = cols + (["Owner", "Outreach status", "Last contacted", "Next step", "Notes"] if tracking else [])
    for j, k in enumerate(allcols, 1):
        cell = ws.cell(1, j, labels.get(k, k))
        cell.font = Font(name="Arial", bold=True, color="FFFFFF")
        cell.fill = HEAD_FILL
        cell.alignment = Alignment(wrap_text=True, vertical="center")
        ws.column_dimensions[get_column_letter(j)].width = WIDE.get(k, 22)
    body = Font(name="Arial", size=10)
    link = Font(name="Arial", size=10, color="0563C1", underline="single")
    wrap = Alignment(wrap_text=True, vertical="top")
    top = Alignment(vertical="top")
    for i, r in enumerate(rows, 2):
        for j, k in enumerate(cols, 1):
            v = r.get(k, "")
            if isinstance(v, (list, dict)):
                v = json.dumps(v)
            cell = ws.cell(i, j, v)
            cell.font = body
            cell.alignment = wrap if k in WIDE else top
            if isinstance(v, str) and v.startswith("http") and " " not in v:
                cell.hyperlink = v
                cell.font = link
        if fill_col and fills:
            f = fills.get(r.get(fill_col))
            if f:
                ws.cell(i, 1).fill = PatternFill("solid", fgColor=f)
        if tracking:
            ws.cell(i, len(cols) + 2, "Not contacted").font = body
    ws.freeze_panes = "C2" if len(allcols) > 3 else "A2"
    ws.row_dimensions[1].height = 32
    ws.auto_filter.ref = f"A1:{get_column_letter(len(allcols))}{max(len(rows) + 1, 2)}"
    if tracking and rows:
        dv = DataValidation(type="list", formula1='"' + ",".join(OUTREACH_STATUSES) + '"', allow_blank=True)
        col = get_column_letter(len(cols) + 2)
        dv.add(f"{col}2:{col}{len(rows) + 1}")
        ws.add_data_validation(dv)
    return ws


PROSPECT_COLS = ["rank", "tier", "company_name", "company_domain", "why_target", "competitor_vendor", "current_status",
                 "complains_now", "unhappy_with", "decision_maker", "decision_maker_title", "decision_maker_linkedin",
                 "company_phone", "public_email", "company_linkedin", "second_contact", "second_contact_title",
                 "second_contact_linkedin", "contact_source_url", "pitch_angle", "suggested_buyer_titles",
                 "HQ_country", "employee_count", "size_band", "industry", "estimated_tracked_seats",
                 "estimated_competitor_monthly_cost", "estimated_Tavilo_monthly_cost", "estimated_annual_savings",
                 "evidence_type", "source_publication_date", "source_url", "evidence_summary",
                 "Tavilo_priority_score", "confidence_score", "all_tools", "contact_route"]
PROSPECT_LABELS = {"rank": "Rank", "tier": "Tier", "company_name": "Company", "company_domain": "Website",
                   "why_target": "Why target", "competitor_vendor": "Uses", "current_status": "Evidence",
                   "complains_now": "Complains about current tool", "unhappy_with": "Unhappy with (any tool)", "decision_maker": "Decision maker", "decision_maker_title": "Title",
                   "decision_maker_linkedin": "DM LinkedIn", "company_phone": "Phone", "public_email": "Email",
                   "company_linkedin": "Company LinkedIn", "second_contact": "2nd contact",
                   "second_contact_title": "2nd contact title", "second_contact_linkedin": "2nd contact LinkedIn",
                   "contact_source_url": "Contact source", "pitch_angle": "Pitch angle",
                   "suggested_buyer_titles": "Other buyer titles", "HQ_country": "HQ", "employee_count": "Employees",
                   "size_band": "Size band", "industry": "Industry", "estimated_tracked_seats": "Est. seats",
                   "estimated_competitor_monthly_cost": "Est. competitor cost/mo",
                   "estimated_Tavilo_monthly_cost": "Est. Tavilo cost/mo", "estimated_annual_savings": "Est. saving/yr",
                   "evidence_type": "Evidence type", "source_publication_date": "Evidence date",
                   "source_url": "Evidence URL", "evidence_summary": "Evidence summary",
                   "Tavilo_priority_score": "Priority score", "confidence_score": "Confidence",
                   "all_tools": "All tools found", "contact_route": "Contact route"}
UNHAPPY_COLS = ["company_name", "company_domain", "unhappy_with_tool", "signal", "complaint_theme", "what_happened",
                "complaint_from", "source_url", "other_source_urls", "now_using", "company_status", "target",
                "decision_maker", "decision_maker_title", "decision_maker_linkedin", "company_phone", "public_email",
                "company_linkedin", "contact_source_url", "pitch_angle", "HQ_country", "employee_count", "industry",
                "Tavilo_priority_score"]
UNHAPPY_LABELS = {"company_name": "Company", "company_domain": "Website", "unhappy_with_tool": "Unhappy with (tool)",
                  "signal": "Signal", "complaint_theme": "Theme", "what_happened": "What happened",
                  "complaint_from": "Who said it", "source_url": "Source", "other_source_urls": "Other sources",
                  "now_using": "Now using", "company_status": "Company status", "target": "Target?",
                  **{k: PROSPECT_LABELS[k] for k in PROSPECT_LABELS if k in UNHAPPY_COLS and k not in ("company_name", "company_domain")}}


def main():
    master = read("1-master-dataset.csv")
    comps = companies(master)
    comp_by_key = {key(c): c for c in comps}
    uh = unhappy(master, comp_by_key)
    picked, strong_all = prospects(comps, uh)
    mcols = list(master[0].keys())

    possible = sorted([c for c in comps if c["current_status"] == "POSSIBLE"],
                      key=lambda c: -(num(c["Tavilo_priority_score"]) or 0))
    dnt = [c for c in comps if c["current_status"] == "DO_NOT_TARGET"]
    former = [r for r in master if r["current_status"] == "FORMER"]

    tiers = Counter(r["tier"] for r in picked)
    excl = Counter(r["excluded_reason"] for r in strong_all if r["excluded_reason"])
    tool_counts = Counter(u["unhappy_with_tool"] for u in uh if u["target"] == "Yes")

    wb = Workbook()
    g = wb.active
    g.title = "Read me"
    lines = [
        (f"Tavilo competitor-user research v3 - workbook built {date.today()}", True),
        ("", False),
        ("TABS", True),
        (f"1. Prospects - start here: {len(picked)} companies with strong evidence they use a competitor, ranked. Work top to bottom. "
         "Use the Owner / Outreach status / Notes columns at the right to track outreach.", False),
        (f"   Tier A ({tiers['A']}): named decision maker with a direct route, 11-2,500 staff, and complaints about their current tool or priority score 50+.", False),
        (f"   Tier B ({tiers['B']}): named decision maker with a direct route.", False),
        (f"   Tier C ({tiers['C']}): only a company phone, email or LinkedIn. Find the decision maker first.", False),
        ("   Left out: " + "; ".join(f"{k} ({v})" for k, v in excl.most_common()) + ". They are still in the Strong evidence tab.", False),
        (f"2. Unhappy customers: {len(uh)} company + tool pairs where a company complained about a tool or switched away from it. "
         "'Unhappy with (tool)' names the tool that caused it.", False),
        ("   " + ", ".join(f"{t} {n}" for t, n in tool_counts.most_common(10)) + " (targetable rows).", False),
        (f"3. Strong evidence - all: all {len(strong_all)} CURRENT or PROBABLE companies, including those left out of the prospect list and why.", False),
        (f"4. Needs validation: {len(possible)} POSSIBLE companies (weak or ambiguous evidence, mostly technographic). Do not cold-pitch as users.", False),
        (f"5. Former customers: {len(former)} rows where a company stopped using a tool.", False),
        (f"6. Do not target: {len(dnt)} companies ruled out (vendor, false match, defunct, no evidence). Reason in Notes.", False),
        ("7. Competitor summary / Competitor pricing / Channel summary / Source audit: reference tables.", False),
        (f"8. Master (all rows): all {len(master)} company + tool rows with every field.", False),
        ("", False),
        ("DEFINITIONS", True),
        ("CURRENT = strong recent evidence they use the tool. PROBABLE = strong but not fully confirmed. POSSIBLE = weak/ambiguous. "
         "FORMER = a source says they stopped. DO_NOT_TARGET = ruled out.", False),
        ("Confidence (0-100) = how sure we are they use the tool. Priority score (0-100) = how good a Tavilo prospect they are.", False),
        ("Seats, costs and savings are ESTIMATES from list prices. When no seat count was stated, seats = headcount.", False),
        ("", False),
        ("CONTACT RULES", True),
        ("Every name, LinkedIn, phone and email was copied from a public page (see Contact source). Nothing was guessed: no email was "
         "built from a name pattern and no LinkedIn URL was constructed. Blank = not found.", False),
        ("Anonymous reviewers were never identified. 'Who said it = Employees' means the complaint came from staff reviews, not management: "
         "use it as a privacy/morale angle, never quote or name the reviewer.", False),
        ("Contacts can go stale. Check the person is still in the role before reaching out.", False),
    ]
    for i, (t, bold) in enumerate(lines, 1):
        g.cell(i, 1, t).font = Font(name="Arial", size=11 if not bold else 12, bold=bold)
    g.column_dimensions["A"].width = 160

    sheet(wb, "Prospects - start here", picked, PROSPECT_COLS, PROSPECT_LABELS, "tier", TIER_FILL, tracking=True)
    sheet(wb, "Unhappy customers", uh, UNHAPPY_COLS, UNHAPPY_LABELS, "company_status", STATUS_FILL, tracking=True)
    sheet(wb, "Strong evidence - all", strong_all, ["excluded_reason", "tier"] + [c for c in PROSPECT_COLS if c not in ("rank", "tier")],
          {**PROSPECT_LABELS, "excluded_reason": "Left out of prospects because"}, "current_status", STATUS_FILL)
    sheet(wb, "Needs validation", possible, ["company_name", "company_domain", "competitor_vendor", "all_tools"] +
          [c for c in mcols if c not in ("company_name", "company_domain", "competitor_vendor")], fill_col="current_status", fills=STATUS_FILL)
    sheet(wb, "Former customers", former, mcols, fill_col="current_status", fills=STATUS_FILL)
    sheet(wb, "Do not target", dnt, ["company_name", "company_domain", "all_tools", "notes", "evidence_summary", "source_url"],
          fill_col="current_status", fills=STATUS_FILL)
    summ = read("6-competitor-summary.csv")
    sheet(wb, "Competitor summary", summ, list(summ[0].keys()))
    p = RAW / "competitors.json"
    if p.exists():
        cmp = json.loads(p.read_text())
        ccols = [c for c in dict.fromkeys(k for c in cmp for k in c) if c not in ("theirstack_real_slices", "theirstack_note")]
        sheet(wb, "Competitor pricing", cmp, ccols)
    chan = read("8-channel-summary.csv")
    sheet(wb, "Channel summary", chan, list(chan[0].keys()))
    audit = read("7-source-audit.csv")
    sheet(wb, "Source audit", audit, list(audit[0].keys()))
    sheet(wb, "Master (all rows)", master, mcols, fill_col="current_status", fills=STATUS_FILL)

    wb.save(OUT / "tavilo-v3-workbook.xlsx")
    print(json.dumps({"prospects": len(picked), "tiers": tiers, "excluded": excl, "unhappy_pairs": len(uh),
                      "unhappy_targetable": sum(u["target"] == "Yes" for u in uh),
                      "unhappy_by_tool": tool_counts.most_common(), "strong_all": len(strong_all),
                      "possible": len(possible), "dnt": len(dnt), "former_rows": len(former)}, indent=1, default=str))


if __name__ == "__main__":
    main()
