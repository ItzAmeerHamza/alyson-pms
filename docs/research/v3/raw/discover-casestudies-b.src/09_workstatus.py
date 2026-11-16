V = "Workstatus"
CS = "Vendor case study"
LG = "Vendor testimonial/logo"
HP = "https://www.workstatus.io/"
WB = "http://web.archive.org/web/2025/https://www.workstatus.io/case-study/"
ANON = "Named version (Jul-Aug 2025, seen on Wayback) was replaced by an anonymized case study (lastmod 2026-06), so naming may not have been authorized; treat with caution."
def cs(name, slug, now, summary, industry, country="India", domain="", contacts=None, li="", emp="", empsrc="", notes=""):
    return dict(company_name=name, company_domain=domain, industry=industry, hq_country=country, employee_count=emp, employee_count_source_url=empsrc,
        vendor=V, evidence_type=CS, evidence_summary=summary, source_url=WB+slug, source_publication_date="2025-07-08",
        second_source_url="https://www.workstatus.io/case-study/"+now, status="POSSIBLE", status_reason="Named 2025 case study later anonymized by the vendor",
        confidence_score=55, contacts=contacts or [], company_linkedin=li, notes=(ANON+" "+notes).strip())
def tm(name, who, title, domain="", industry="", country="India", contacts_extra=None, li="", conf=65, second="", notes=""):
    return dict(company_name=name, company_domain=domain, industry=industry, hq_country=country, vendor=V, evidence_type=LG,
        evidence_summary=f"Named testimonial on the Workstatus homepage (2026) from {who}{', '+title if title else ''} saying they use Workstatus for time, attendance and productivity tracking.",
        source_url=HP, source_publication_date="2026", second_source_url=second, status="PROBABLE",
        status_reason="Named testimonial on live vendor homepage; date unknown", confidence_score=conf,
        contacts=[{"name":who,"title":title,"linkedin":"","source_url":HP}]+(contacts_extra or []), company_linkedin=li, notes=notes)
RECS = [
 cs("2COMS Consulting", "how-2coms-solved-their-project-management-problems", "recruitment-firm-solved-their-project-management-problems",
    "Workstatus case study (Jul 2025): 2COMS, a large Indian staffing firm (1,000+ recruiters, 10+ cities, on-ground and remote teams), cut manual work 45% in 100 days with Workstatus.",
    "Staffing & recruitment", domain="2coms.com", emp="~1,400-1,500", empsrc="https://in.linkedin.com/company/2coms",
    contacts=[{"name":"Prashant Pachisa","title":"Founder & CEO","linkedin":"","source_url":"https://tracxn.com/d/companies/2coms/__e_gX62otHxvIDx5pArX88LyxBLiz6iKBvvVgSbHY6eo"}],
    li="https://in.linkedin.com/company/2coms", notes="Kolkata HQ."),
 cs("Keystone Realtors", "keystone-realtors", "real-estate-team-challenges",
    "Workstatus case study (Jul 2025): Keystone Realtors (Mumbai real estate developer) made team management easier in 70 days.", "Real estate development"),
 cs("Practo", "practo-pulse-productivity-challenges", "healthcare-firm-productivity-challenges",
    "Workstatus case study (Jul 2025): 'Practo Pulse' (500+ staff across time zones) reported a 35% productivity rise in 90 days.", "Digital healthcare",
    notes="Company description in the story looks inflated or generic."),
 cs("W.S. Kane & Co.", "w-s-kane-and-co-legal-delay-challenges", "legal-firm-delay-challenges",
    "Workstatus case study (Jul 2025): Mumbai IP law firm W.S. Kane & Co. (founded 1942) cut case delays 63%.", "Law firm (IP)", domain="wskaneandco.com",
    contacts=[{"name":"Himanshu Kane","title":"Managing Partner","linkedin":"","source_url":"https://chambers.com/department/ws-kane-and-co-intellectual-property-asia-pacific-8:34:110:1:146401"}]),
 tm("Execube Digital", "Ripple Nagpal", "CEO (Founder & COO per Tracxn)", industry="Digital marketing agency",
    li="https://in.linkedin.com/company/execube-digital", second="https://www.youtube.com/watch?v=T4MBom_NgTc", conf=75,
    notes="Also a Workstatus customer video 'From Manual to Seamless: Execube Digital's Journey with Workstatus'. Noida."),
 tm("Chetan Pabari & Associates", "Chetan Pabari", "", industry="Accounting / CA firm (probable)"),
 tm("InsightsTap", "Ritesh Osta", "Founder", "insightstap.com", "GTM / marketing services", contacts_extra=[],
    notes="Founder LinkedIn found in search: https://www.linkedin.com/in/riteshosta1/ (not set as the contact URL because the testimonial gives only 'Ritesh')."),
 tm("RF Solutions", "Alvaro J Ruiz", "", country=""),
 tm("DITS", "Sudha / Akash", "", country="", notes="Two testimonials; identity of DITS not resolved."),
 tm("Investment House", "Karna Shah", "", country=""),
 tm("Experts Bio", "Karthik", "CEO", country=""),
]
