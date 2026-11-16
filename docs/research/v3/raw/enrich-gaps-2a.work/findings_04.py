OJ = "onlinejobs.ph posting gives no website; "
F = {
19: dict(  # SV Estimating
    contacts=[
        {"name": "Masood (surname not published)", "title": "Named contact (role not stated)", "linkedin": "", "source_url": "https://svestimatingservices.com/contact-us/"},
    ],
    public_email="masood@svestimatingservices.com",
    contact_source_url="https://svestimatingservices.com/contact-us/",
    notes="Contact page shows 'Email: Masood at svestimatingservices.com' (written out on the site, recorded as given, not built from a pattern). Company LinkedIn linkedin.com/company/silicon-valley-construction-services/ confirmed. No phone on any page; site footer also shows info@ndiscovered.com (web vendor, not the company)."),
20: dict(  # Crowe Tijuana
    contacts=[
        {"name": "Daniel Arturo Cano Falomir", "title": "Office Director - Tax Partner, Tijuana", "linkedin": "", "source_url": ""},
        {"name": "Alejandro Vega", "title": "Project Manager, Crowe Global Tijuana", "linkedin": "", "source_url": "https://trackingtime.co/best-practices/crowe-global-success-story-with-trackingtime.html"},
    ],
    notes="crowe.com/mx returns 403 to curl and WebFetch, so the Tijuana office page, email and still-in-role checks could not be done. TrackingTime case study reconfirms Alejandro Vega (Project Manager, 40 Tijuana staff on TrackingTime). Existing contacts kept."),
24: dict(  # Kwittken
    company_domain="kwtglobal.com",
    contacts=[
        {"name": "Jay Gallwitz", "title": "Global Finance Director (per ClickTime case study; still-in-role unverified)", "linkedin": "", "source_url": "https://www.clicktime.com/case-studies/kwittken-drives-increased-productivity-and-employee-utilization-with-clicktime"},
    ],
    company_linkedin="https://www.linkedin.com/company/kwtglobal/",
    public_email="info@kwtglobal.com",
    contact_source_url="https://www.kwtglobal.com/about",
    notes="Kwittken rebranded as KWT Global (integrated communications agency, NYC One World Trade Center + LA, Chicago, London). The rename is from general knowledge - kwittken.com serves a blank page and kwtglobal.com does not mention the old name, so verify before outreach. KWT Global site uses the Stagwell privacy policy and links to Hunter PR, i.e. part of Stagwell. No phone or named leaders on site."),
25: dict(  # Kunder
    hq_country="Chile",
    employee_count="50 (per Paymo case study)",
    contacts=[
        {"name": "Luis Hernan", "title": "COO", "linkedin": "", "source_url": "https://www.paymoapp.com/kunder/"},
        {"name": "Manuel Ibáñez", "title": "CCO", "linkedin": "", "source_url": "https://www.paymoapp.com/kunder/"},
    ],
    notes="Paymo case study: Kunder, Santiago de Chile, software development, 50 employees, 6 years on Paymo; names COO Luis Hernan and CCO Manuel Ibáñez. Likely site kunder.cl refuses connections (reset/closed) to curl and WebFetch, so domain, phone, email and company LinkedIn left blank."),
26: dict(  # Vital Virtuals
    contacts=[
        {"name": "Dr. Harveer Parmar", "title": "CEO / Founder", "linkedin": "", "source_url": "https://vitalvirtuals.com/about-us"},
    ],
    company_linkedin="https://www.linkedin.com/company/vitalvirtuals/",
    public_email="hello@vitalvirtuals.com",
    contact_source_url="https://vitalvirtuals.com/",
    notes="About page: 'Founded in 2023 by Dr. Parmar, a board-certified Family Physician based in Dallas, Texas' (Vital Virtual Global HR Solutions LLC). Company LinkedIn from site footer. No second contact named on site. Company is a healthcare VA staffing provider (an end user of Time Doctor, not a monitoring vendor)."),
27: dict(  # Nolters Gold
    contacts=[
        {"name": "Ben (surname not published)", "title": "Owner/Founder", "linkedin": "", "source_url": "https://www.onlinejobs.ph/jobseekers/job/paid-ads-specialist-meta-google-gold-jewelry-e-commerce-1736472"},
    ],
    public_email="support@nolters.com",
    contact_source_url="https://www.nolters.com/pages/contact",
    notes="nolters.com home, About, Contact and privacy pages give no owner surname, phone, legal entity or company LinkedIn (contact form + support@nolters.com only)."),
28: dict(  # Superb Concepts
    contacts=[
        {"name": "Tyler Youmell", "title": "Owner / Founder", "linkedin": "", "source_url": ""},
        {"name": "William Youmell", "title": "", "linkedin": "", "source_url": ""},
    ],
    notes="superbconcepts.com now 301-redirects to superblandscapeco.com; both time out / refuse connections to curl and WebFetch, so nothing could be checked. Existing contacts kept unverified."),
34: dict(  # Altura Funding
    notes="alturafunding.com returns 403 to curl and WebFetch; no contact or leadership info could be read. Nothing found without search."),
36: dict(  # Sam Sikes Photography
    hq_country="United States",
    contacts=[
        {"name": "Sam Sikes", "title": "Owner", "linkedin": "", "source_url": "https://samsikesphotography.com/"},
    ],
    contact_source_url="https://samsikesphotography.com/inquire",
    notes="Site confirms Sam Sikes, wedding photography & videography, Memphis TN. Contact is an inquiry form only; no phone, email or LinkedIn on site. Solo/small studio."),
37: dict(  # GoShopBlack
    company_linkedin="https://www.linkedin.com/company/goshopblack",
    public_email="support@goshopblack.com",
    contact_source_url="https://www.goshopblack.com/contact",
    notes="goshopblack.com contact page gives support@goshopblack.com; company LinkedIn in footer. About page (goshopblack.org/about-goshopblack) names no founder or leaders; no phone. Decision maker not found without search."),
41: dict(  # Start Small Property
    company_domain="startsmall.com.au",
    hq_country="Australia",
    contacts=[
        {"name": "Sean (surname not published)", "title": "Founder & Principal Licensee", "linkedin": "", "source_url": "https://www.startsmall.com.au/about"},
        {"name": "May (surname not published)", "title": "Director of Operations", "linkedin": "", "source_url": "https://www.startsmall.com.au/about"},
    ],
    company_phone="1300 388 886",
    public_email="noworries@startsmall.com.au",
    contact_source_url="https://www.startsmall.com.au/contact",
    notes=OJ + "startsmall.com.au = Start Small Property (Queensland property management, co-living specialist; matches posting). Contact page: PO Box 7636 Sippy Downs QLD 4556, phone 1300 388 886, QLD Real Estate licence 4035781. About page gives first names only."),
42: dict(  # Premier Vitality
    notes=OJ + "premiervitality.com 404s and premiervitality.net is a 'Coming Soon' page; neither confirmed. Nothing found without search."),
43: dict(  # Welch Products LLC
    company_domain="welchproductsllc.com",
    hq_country="United States",
    contacts=[
        {"name": "Todd Welch", "title": "Founder", "linkedin": "", "source_url": "https://welchproductsllc.com/"},
    ],
    notes=OJ + "welchproductsllc.com (read via WebFetch, 403 to curl) = Amazon Seller Central account management / PPC agency 'established in January 2015 by founder Todd Welch' - matches posting. No phone, email or LinkedIn shown (contact form / schedule-call only)."),
44: dict(  # Blazing Boost Srl
    company_domain="blazingboost.com",
    hq_country="Italy",
    company_phone="+39 02 87167 055",
    public_email="support@blazingboost.com",
    contact_source_url="https://blazingboost.com",
    notes=OJ + "blazingboost.com matches (game boosting services since 2012). Footer: Blazing Boost Srl, Via Zenale 13, 20213 Milano. No people or company LinkedIn on site; Italian registry lookup not done."),
45: dict(  # ALBRICE LLC / T&V Tires
    company_domain="albrice.com",
    hq_country="United States",
    company_phone="+1 201-914-6655",
    public_email="info@albrice.com",
    contact_source_url="https://www.albrice.com/",
    notes=OJ + "albrice.com = ALBRICE LLC, truck tire casings and used commercial truck tires for retreaders (matches posting). Phone and email from site; no people named on Home/About; T&V Tires Inc. site not found."),
46: dict(  # Leio Industrial
    hq_country="China",
    contacts=[
        {"name": "Stephy (surname not published)", "title": "Founder", "linkedin": "", "source_url": "https://www.onlinejobs.ph/jobseekers/job/looking-for-professional-full-time-vitual-assistant-1380884"},
    ],
    notes=OJ + "posting: 'Hi, I'm Stephy, Founder of Leio Industrial Co., Ltd., a leading pearlescent pigment supplier based in China'. Candidate domain leiopigment.com timed out; leio.com is a parked domain. Nothing confirmed."),
47: dict(  # Little Dot Studios
    contacts=[
        {"name": "Zara (surname not given)", "title": "Director of Operations", "linkedin": "", "source_url": "https://www.timely.com/little-dot-studios---case-study/"},
    ],
    company_phone="020 3967 3710 (London)",
    public_email="la@littledotstudios.com",
    contact_source_url="https://www.littledotstudios.com/en-gb/contact",
    notes="Contact page: London, The Old Truman Brewery, 91 Brick Lane, E1 6QL, 020 3967 3710; offices in LA and Munich. Only email shown is la@littledotstudios.com (LA office). About page names no leaders; Zara's surname not found without search. Company LinkedIn reconfirmed."),
48: dict(  # IDT Australia
    contacts=[
        {"name": "Mark Simari", "title": "Executive Chair and CEO", "linkedin": "", "source_url": "https://idtaus.com.au/about-us/team/"},
        {"name": "Jim Sosic", "title": "Chief Operating Officer", "linkedin": "", "source_url": "https://idtaus.com.au/about-us/team/"},
        {"name": "Kellie Watchman", "title": "Finance and Accounting Manager (per My Hours case study; not on current team page)", "linkedin": "", "source_url": "https://myhours.com/case-study-idt-australia"},
    ],
    company_phone="1300 554 474; +61 3 9801 8888",
    public_email="info@idtaus.com.au",
    contact_source_url="https://idtaus.com.au/contact-us/",
    notes="Executive Team page lists Mark Simari (Executive Chair & CEO), Jim Sosic (COO), Malika Perera (Head of Finance) and others. Kellie Watchman is not on the team page (may have left or be below exec level). Contact page also lists bd@idtaus.com.au and joe.desneves@idtaus.com.au. No personal LinkedIn on site."),
49: dict(  # Zagaran
    contacts=[
        {"name": "Benjamin \"Zags\" Zagorsky", "title": "Co-Founder and CTO", "linkedin": "https://www.linkedin.com/in/zagorsky", "source_url": "https://zagaran.com/team/"},
        {"name": "Josh Zagorsky", "title": "Co-Founder (handles company finances)", "linkedin": "https://www.linkedin.com/in/joshzagorsky", "source_url": "https://zagaran.com/team/"},
        {"name": "Kevin Fan", "title": "Co-Founder", "linkedin": "https://www.linkedin.com/in/kevinfan", "source_url": "https://zagaran.com/team/"},
    ],
    contact_source_url="https://zagaran.com/contact-us/",
    notes="CORRECTION: existing record conflated two people. 'Zags' (Timely case-study quote, Co-Founder and CTO) is Benjamin Zagorsky; Josh Zagorsky is a separate co-founder who handles finances. LinkedIn URLs taken from the team page in card order. Contact page: info@zagaran.com, 141 Tremont St. 12th Floor, Boston, MA 02111; no phone and no company LinkedIn on site."),
}
