D = {}

D["Axioma servisas"] = dict(
    hq_country="Lithuania", employee_count="149 (company says ~300 engineers)",
    employee_count_source_url="https://www.developmentaid.org/organizations/view/120944/axioma-servisas",
    confidence_score=20,
    workforce_signals="Field engineering/maintenance crews across the Baltics, 24/7 service; job ads mention filling work-time sheets (darbo laiko apskaitos tabeliai).",
    second_source_url="https://www.cvbankas.lt/mechanikos-darbu-vadovas-e-kaune/1-14086288",
    notes="Searched '\"Axioma servisas\" Kimai' and Lithuanian time-tracking/job-ad queries: no Kimai mention. Job ad mentions manual work-time sheets only. Company was acquired by City Service SE (still operating as subsidiary). Field-service workforce, weak fit for desktop monitoring. No contact research (not remote/BPO/agency).",
)

D["EPODEX GmbH"] = dict(
    hq_country="Germany", confidence_score=20,
    notes="Searched '\"EPODEX\" Toggl' and 'EPODEX GmbH Stellenanzeige Zeiterfassung Toggl': nothing beyond TheirStack. Epoxy-resin e-commerce brand; no remote/agency signal, so no contact research.",
)

D["Freedom Care Group"] = dict(
    hq_country="Australia", confidence_score=20,
    workforce_signals="ASX-listed (FCG) NDIS disability-support provider in Sydney; shift-based support workers in the field (SIL, day programs, allied health).",
    second_source_url="https://www.morningstar.com.au/investments/security/ASX/FCG",
    notes="Searched '\"Freedom Care Group\" QuickBooks Time OR TSheets' and NDIS support-worker timesheet queries: no QuickBooks Time evidence. Company is real (ASX:FCG, Villawood NSW, phone 1800 979 783 per Yahoo/Morningstar listings, CEO Jamal Sabsabi per Morningstar snippet). No domain in input. Field care workforce, not remote/BPO, so no further contact research. NDIS providers usually use care-specific rostering apps (e.g. ShiftCare, CareMaster).",
)

D["Healthdirect Australia"] = dict(
    hq_country="Australia", confidence_score=20,
    notes="Searched '\"Healthdirect\" Replicon timesheet' and 'Healthdirect Australia job Replicon': no Replicon mention on Replicon pages or Healthdirect careers results. Government-owned not-for-profit (about.healthdirect.gov.au). Low monitoring fit; no contact research.",
)

D["Milken Institute"] = dict(
    hq_country="United States", confidence_score=15,
    notes="Searched '\"Milken Institute\" Toggl' and Milken job posting + Toggl/time tracking: nothing beyond TheirStack (TheirStack source URL is the Peru Toggl page, an odd mismatch). Non-profit think tank; low monitoring fit; no contact research.",
)

D["Mkt Virtual"] = dict(
    hq_country="Brazil", confidence_score=20,
    workforce_signals="Digital marketing agency (Santos/SP) with in-house content, film (Mokoto) and games (Mukutu) spin-offs; agency billable-hours model.",
    contacts=[
        {"name": "Ludmilla Rossi", "title": "Co-founder / partner", "linkedin": "", "source_url": "https://grandesnomesdapropaganda.com.br/agencias/mkt-virtual-comemora-15-anos-com-reposicionamento-de-marca/"},
        {"name": "Maurício Matias", "title": "Co-founder / partner", "linkedin": "", "source_url": "https://grandesnomesdapropaganda.com.br/agencias/mkt-virtual-comemora-15-anos-com-reposicionamento-de-marca/"},
    ],
    company_linkedin="https://www.linkedin.com/company/mkt-virtual",
    company_phone="+55 (11) 3304-6129", public_email="",
    contact_source_url="https://mktvirtual.com.br/contato",
    pitch_angle="Agency billing clients by the hour: Tavilo can tie tracked time to client projects with proof-of-work for billing.",
    notes="Input had no domain; site found at mktvirtual.com.br (input company_domain left blank to match merge). Searched '\"Mkt Virtual\" Everhour' and Portuguese 'controle de horas' queries: no Everhour mention; homepage has no tool mention. No email on contact page.",
)

D["Moodle"] = dict(
    hq_country="Australia", confidence_score=20,
    workforce_signals="Remote-friendly global team (Moodle HQ, Perth).",
    notes="Searched 'Moodle HQ Toggl time tracking' and 'Moodle careers job Toggl': only generic Moodle-Toggl integration pages (Integrately) - no evidence Moodle Pty Ltd uses Toggl. Moodle is also an LMS vendor whose name collides with integration listings. No contact research beyond this (no tool evidence; corporate open-source vendor).",
)

D["Open Ocean Robotics"] = dict(
    hq_country="Canada", confidence_score=20,
    workforce_signals="Victoria BC hardware/robotics startup; R&D (SR&ED-style project time tracking plausible).",
    notes="Searched '\"Open Ocean Robotics\" Toggl' and OOR job postings + time tracking: only TheirStack listing pages; careers pages do not mention Toggl. Not remote/BPO; no further contact research.",
)

ENT = "Enterprise far outside the 10-2,500 employee band; no contact research for POSSIBLE rows."

def ent(searched, extra="", score=15):
    return dict(confidence_score=score, notes=f"Searched {searched}: nothing beyond TheirStack. {extra} {ENT}".strip())

D["ABB"] = ent("'ABB employees Toggl time tracking' and ABB jobs + Toggl on Indeed/Glassdoor/LinkedIn", "Likely a single team or job-ad mention in a 100k+ org.")
D["Johnson Controls"] = ent("'\"Johnson Controls\" \"Replicon\"' and JCI job postings + Replicon", "JCI job ads (e.g. Fire Business Support Specialist, apply.johnsoncontrols.com/.../505513) describe Kronos plus an internal 'Time Entry system', not Replicon.", 10)
D["Roche"] = ent("'\"Roche\" \"Replicon\" timesheet' and 'Roche Genentech job Replicon'")
D["Tata Consultancy Services"] = ent("'TCS Replicon timesheet job' and 'Tata Consultancy Services Replicon customer case study'", "TCS uses its own internal timesheet tooling; a TheirStack hit is most likely a TCS job ad for a client Replicon/SAP project.", 10)
D["DXC Technology"] = ent("'\"DXC\" Replicon timesheet' and 'DXC Technology job Replicon timesheets'", "IT services firm; hit likely a client-project job ad.", 10)
D["Dassault Systèmes"] = ent("'Dassault Systemes Replicon' and 'Dassault Systemes job Replicon timesheet'")
D["Downer Group"] = ent("'\"Downer\" Replicon timesheet' and 'Downer Group job Replicon'", "Downer 'Time Capture Administrator' ad (2026-08-04, https://www.interviewpal.com/jobs/2293746574) names Kronos/WebTimes, not Replicon.", 10)
D["Publicis Groupe"] = ent("'\"Publicis\" \"Toggl\" time tracking agency' and 'Publicis Sapient/Groupe job Toggl'", "A Toggl mention could come from a small acquired agency within the group.")
D["Serco"] = ent("'\"Serco\" \"Replicon\" timesheet' and 'Serco job Replicon time recording'")
D["Solvay"] = ent("'\"Solvay\" \"Replicon\"' and 'Solvay OR Syensqo job Replicon timesheet'")
D["Syneos Health Commercial Solutions"] = ent("'\"Syneos Health\" \"Toggl\"' and Syneos job ads + Toggl", "Job ads mention generic 'time tracking' compliance only.")

D["KPMG"] = dict(
    hq_country="United Kingdom (global network)", employee_count="~275,000 (per vendor page)",
    employee_count_source_url="https://sapinsider.org/videos/inside-kpmgs-ai-powered-workforce-transformation/",
    status="CURRENT", confidence_score=90,
    evidence_type="Vendor case study",
    evidence_summary="SAPinsider session page 'Inside KPMG's AI-powered workforce transformation' says KPMG selected (Deltek) Replicon to automate time tracking with AI, capturing time from 100+ collaboration tools and integrating with SAP S/4HANA and SuccessFactors across 75+ countries.",
    evidence_quote="Unifying time, billing, pay, and compliance in one scalable platform",
    source_url="https://sapinsider.org/videos/inside-kpmgs-ai-powered-workforce-transformation/",
    source_publication_date="",
    second_source_url="https://theirstack.com/en/technology/replicon/ca",
    status_reason="Vendor/SAP conference session describing KPMG's enterprise Replicon rollout (post-2023 'Deltek | Replicon' branding) plus TheirStack hit.",
    workforce_signals="Big-4 professional services; billable time captured for client billing; Replicon tied to SAP S/4HANA.",
    pitch_angle="Very poor fit: firm-wide SAP-integrated Replicon deployment at 275k people; not a realistic Tavilo displacement target.",
    notes="Page date not shown; 'Deltek | Replicon' naming dates it to after Aug 2023. Contacts not researched: global Big-4 network far outside the 10-2,500 band (enterprise procurement).",
)

PWC_SRC = "https://salestechstar.com/predictive-ai-artificial-intelligence/replicon-announces-time-intelligence-platform-for-cloud-based-solutions-from-sap-for-the-professional-services-industry/"
D["PwC"] = dict(
    hq_country="United Kingdom (global network)",
    status="PROBABLE", confidence_score=70,
    evidence_type="Vendor case study",
    evidence_summary="Replicon press release (Oct 2020) on its SAP professional-services platform says PwC chose Replicon as its go-forward partner for practitioner time capture, integrated with SAP S/4HANA. Quote from Paul West, Engagement Management & Finance Transformation Leader at PwC.",
    evidence_quote="PwC chose Replicon as their go-forward partner to provide frontline practitioners with a powerful, flexible and easy-to-use time capture capability",
    source_url=PWC_SRC, source_publication_date="2020-10-23",
    second_source_url="https://theirstack.com/en/technology/replicon/il",
    status_reason="Explicit vendor announcement of PwC selecting Replicon, but dated 2020 (stale, -15); TheirStack still shows Replicon job mentions.",
    workforce_signals="Big-4 professional services; billable practitioner time feeding SAP S/4HANA billing.",
    pitch_angle="Very poor fit: enterprise SAP-integrated Replicon; not a realistic Tavilo target.",
    notes="Contacts not researched: global Big-4 network far outside band.",
)
D["PwC India"] = dict(
    hq_country="India", status="PROBABLE", confidence_score=50,
    evidence_type=TS if False else "Technographic signal — requires validation",
    evidence_summary="TheirStack lists PwC India under Replicon; PwC (network) publicly chose Replicon for practitioner time capture in 2020. No India-specific source found.",
    second_source_url=PWC_SRC,
    status_reason="TheirStack India hit corroborated by PwC network-level Replicon selection (2020); member firms are separate entities, so not CURRENT.",
    notes="Searched 'PwC India Replicon timesheet': only the PwC network press release. Enterprise (30k); no contact research - poor fit.",
)
D["PwC Uruguay"] = dict(
    hq_country="Uruguay", status="PROBABLE", confidence_score=45,
    evidence_type="Technographic signal — requires validation",
    evidence_summary="TheirStack lists PwC Uruguay under Replicon; PwC network chose Replicon for time capture in 2020. No Uruguay-specific source found.",
    second_source_url=PWC_SRC,
    status_reason="TheirStack hit plus PwC network-level Replicon selection; member-firm adoption not confirmed.",
    employee_count="314 (input); PwC Uruguay says 400+ staff",
    employee_count_source_url="https://www.uruguayxxi.gub.uy/en/buyer-catalog/pwc/",
    workforce_signals="Audit/tax/advisory practice operationally integrated with PwC Argentina; billable hours.",
    pitch_angle="Poor fit: Big-4 member firm bound to network-standard SAP/Replicon tooling.",
    notes="Searched 'PwC Uruguay Replicon': nothing specific. Contacts not researched (Big-4 member firm; network tooling decisions made centrally).",
)
D["Siemens"] = dict(
    hq_country="Germany", status="PROBABLE", confidence_score=60,
    evidence_type="Vendor testimonial/logo",
    evidence_summary="Replicon's SAP PartnerEdge announcement (Dec 2020) quotes Chris Pegg, Head of UK&I IT Site Management at Siemens Mobility Limited, saying Replicon gave them a mobile, employee-friendly time-entry frontend without modifying their SAP environment.",
    evidence_quote="we did not have to modify our SAP environment",
    source_url="https://www.replicon.com/?p=121851", source_publication_date="2020-12-02",
    second_source_url="https://theirstack.com/en/technology/replicon/de",
    status_reason="Named customer testimonial for Siemens Mobility UK&I (2020, stale) plus TheirStack Germany hit; scope is one Siemens subsidiary.",
    workforce_signals="Rail engineering; Replicon used as SAP time-entry front end at Siemens Mobility UK&I.",
    contacts=[
        {"name": "Rob Morris", "title": "Joint CEO, Siemens Mobility UK&I", "linkedin": "", "source_url": "https://news.siemens.co.uk/news/aglaja-schneider-appointed-as-joint-ceo-for-siemens-mobility-uk-and-ireland"},
        {"name": "Aglaja Schneider", "title": "Joint CEO & MD Rolling Stock and Customer Services, Siemens Mobility UK&I (from 2026-01-01)", "linkedin": "", "source_url": "https://news.siemens.co.uk/news/aglaja-schneider-appointed-as-joint-ceo-for-siemens-mobility-uk-and-ireland"},
    ],
    contact_source_url="https://news.siemens.co.uk/news/aglaja-schneider-appointed-as-joint-ceo-for-siemens-mobility-uk-and-ireland",
    pitch_angle="Very poor fit: SAP-integrated enterprise time entry in a 300k-person group.",
    notes="Testimonial quote paraphrased from search snippet of the Replicon page (redirects to Deltek now). Evidence covers Siemens Mobility Ltd (UK), not the whole Siemens group. Testimonial author Chris Pegg not added as decision maker (current role unverified).",
)
D["Balfour Beatty plc"] = dict(
    hq_country="United Kingdom", employee_count="~25,000",
    status="CURRENT", confidence_score=92,
    evidence_type="Current job posting",
    evidence_summary="Balfour Beatty UK Construction 'Project Administrator' / site admin ads (Scotland, Edinburgh) list uploading timesheets/hours onto Oracle R12 & Replicon and assisting the site team with Replicon timesheets; Oracle R12/Replicon familiarity desirable.",
    evidence_quote="uploading timesheets/hours onto Oracle R12 & Replicon software",
    source_url="https://findajob.dwp.gov.uk/details/17254769", source_publication_date="",
    second_source_url="https://findajob.dwp.gov.uk/details/17714768",
    third_source_url="https://theirstack.com/en/technology/replicon/gb",
    status_reason="Two UK government job-board listings explicitly name Replicon as the timesheet system used by site teams.",
    workforce_signals="Construction site teams; Replicon used for project time/cost allocation alongside Oracle R12.",
    contacts=[{"name": "Philip Hoare", "title": "Group Chief Executive", "linkedin": "", "source_url": "https://www.constructiondive.com/news/balfour-beatty-new-ceo-philip-hoare/759945/"}],
    contact_source_url="https://www.constructiondive.com/news/balfour-beatty-new-ceo-philip-hoare/759945/",
    pitch_angle="Poor fit for desktop monitoring (site-based construction workforce, 25k staff, Oracle-integrated); only a long-shot for office/back-office teams.",
    notes="DWP Find-a-Job pages returned 503; content taken from search snippets (posting dates not visible, listing IDs indicate recent). CEO since Sept 2025 per Construction Dive.",
)

D["Brainbox"] = dict(
    hq_country="Australia", employee_count="68 (input); 100-249 per Outsource Accelerator",
    employee_count_source_url="https://www.outsourceaccelerator.com/company/brainbox/",
    confidence_score=25,
    workforce_signals="Perth advisory/offshoring firm: builds dedicated offshore teams for clients and handles office space, IT, hiring, HR admin and payroll (Outsource Accelerator listing). Offshore staffing = strong monitoring use case.",
    second_source_url="https://www.outsourceaccelerator.com/company/brainbox/",
    pitch_angle="Offshore-staffing provider managing client-dedicated remote teams: Tavilo gives clients proof-of-work (activity, screenshots) and payroll-ready hours per seat.",
    notes="Site is brain-box.com.au (input domain blank; left blank to match merge) - site behind a captcha, could not read contact page. Searched 'Brainbox Australia consulting Toggl' and 'Brainbox Group Perth offshore staff Hubstaff/Toggl/Time Doctor': no tool evidence. A data-broker snippet (prospeo) listed names (CEO/MD/owner) that look mixed with other 'Brainbox' companies, so not recorded. Address per same snippet: 896 Beaufort Street, Inglewood WA (unverified). Worth a manual look: offshore-staffing fit is good even though Toggl is unconfirmed.",
)
D["株式会社ROBOT PAYMENT"] = dict(
    hq_country="Japan", confidence_score=20,
    notes="Searched 'ROBOT PAYMENT Toggl' and Japanese 'ロボットペイメント Toggl 工数管理': nothing beyond TheirStack. TSE-listed (4374) subscription-billing fintech; no remote/BPO signal; no contact research.",
)
D["ARGO"] = dict(
    hq_country="Switzerland", employee_count="201 (input); 650+ staff per jobup",
    employee_count_source_url="https://www.jobup.ch/en/enterprises/67674ce8-50dd-436e-b1e0-f709b0fd101f-argo-stiftung-fuer-integration-von-menschen-mit-behinderung-in-graubuenden/",
    confidence_score=15,
    notes="ARGO Stiftung (Graubünden foundation running sheltered housing/workshops for adults with disabilities; industry tag 'Vehicle Repair' is wrong). Searched 'ARGO Graubünden Replicon' and German Zeiterfassung/Replicon job queries: nothing. Care/workshop staff; poor fit; no contact research.",
)
D["AllKinds"] = dict(
    hq_country="Australia", confidence_score=15,
    workforce_signals="Kids' bath/body brand with e-commerce and ~10 retail stores (retail shift staff).",
    notes="Searched '\"AllKinds\" allkinds.com Toggl' and company background: no Toggl mention. Retail/brand business, poor fit; no contact research.",
)
D["Crest Nicholson plc"] = dict(
    hq_country="United Kingdom", confidence_score=15,
    notes="Searched '\"Crest Nicholson\" Replicon' and Crest Nicholson job vacancies + Replicon/time recording: nothing beyond TheirStack. UK housebuilder; not remote/BPO; no contact research.",
)
D["Imperio Real Estate"] = dict(
    hq_country="United States", confidence_score=15,
    notes="Searched '\"Imperio Real Estate\" Jibble' and company identity: two different US firms use the name (McAllen TX brokerage; St. Petersburg FL, 21-50 staff) - cannot tell which TheirStack meant; no Jibble evidence. No domain; no contact research.",
)
D["La DoubleJ"] = dict(
    hq_country="Italy", confidence_score=15,
    notes="Searched '\"La DoubleJ\" Toggl' and La DoubleJ job ads + Toggl/time tracking: only a BoF 'Personal Assistant to the Founder' ad, no Toggl mention. Milan fashion brand; no contact research.",
)
D["Oxfam"] = dict(
    hq_country="New Zealand", confidence_score=15,
    notes="Searched 'Oxfam Aotearoa Replicon timesheet' and '\"Oxfam\" \"Replicon\" timesheet job': nothing. Oxfam Aotearoa is a legally autonomous Auckland charity (~40 staff); no confederation-wide Replicon evidence found. No contact research.",
)
D["Regina Open Door Society"] = dict(
    hq_country="Canada", confidence_score=15,
    notes="Searched '\"Regina Open Door Society\" Replicon' and RODS careers + Replicon/time tracking: nothing. Settlement non-profit funded by IRCC grants (grant-funded time allocation could explain a Replicon mention, but unconfirmed). No contact research.",
)
D["Renjana Offset"] = dict(
    hq_country="Indonesia", confidence_score=15,
    second_source_url="https://id.indeed.com/cmp/Renjana-Offset",
    notes="Searched '\"Renjana Offset\" Jibble' (only crane 'jib' noise) and company identity: real printing firm in Sleman, Yogyakarta (founded 2020, 51-200 staff per Indeed/Glints). No Jibble evidence. Factory workforce; no contact research.",
)
D["Rentkar"] = dict(
    hq_country="India", confidence_score=15,
    notes="Searched 'Rentkar Jibble attendance' and Rentkar jobs + Jibble/time tracking: nothing. rentkar.app is live. TheirStack source is the Chile Jibble page (odd mismatch). 25 staff; no remote signal; no contact research.",
)

D["Texas RioGrande Legal Aid, Inc. (TRLA)"] = dict(
    hq_country="United States", confidence_score=15,
    notes="Searched '\"Texas RioGrande Legal Aid\" Toggl' and TRLA timekeeping software (Toggl/LegalServer): nothing linking TRLA to Toggl. Legal-aid orgs typically keep time in their case-management system (e.g. LegalServer timekeeping). TheirStack source is the Uruguay Toggl page (mismatch). Non-profit; no contact research.",
)
D["Tire Rack"] = dict(
    hq_country="United States", confidence_score=10,
    notes="Searched '\"Tire Rack\" HourStack' and Tire Rack South Bend job ads + HourStack: no HourStack mention (results were store-hours pages and warehouse/customer-care ads). Now part of Discount Tire. Warehouse/contact-centre workforce; no contact research.",
)
D["mothers2mothers"] = dict(
    hq_country="South Africa", confidence_score=15,
    notes="Searched '\"mothers2mothers\" Replicon timesheet' and m2m job vacancies + Replicon/timesheet: no Replicon mention in listed ads (MyJobMag). Donor-funded NGOs often use Replicon-style grant time allocation, but unconfirmed. Field health workforce; no contact research.",
)
D["sneleentaxi"] = dict(
    hq_country="Netherlands", confidence_score=15,
    notes="Searched '\"sneleentaxi\" Toggl' and Dutch 'sneleentaxi vacature Toggl uren': nothing beyond TheirStack. Utrecht taxi-booking platform (founded 2015; founders Sven Braam, Jorrit van Wijk, Bram de Bruin per CB Insights snippet). Site returns 403 to bots but company appears active. Not remote/BPO; no further contact research.",
)
D["DigiHelic Solutions Pvt. Ltd."] = dict(
    hq_country="India", confidence_score=10,
    workforce_signals="Pune IT services/staffing firm (SAP, Salesforce, Java, .NET), 25+ staff; places consultants on client projects.",
    notes="Searched '\"DigiHelic\" Replicon' (only DNA 'replicon' biology noise) and '\"DigiHelic Solutions\" job Replicon OR timesheet': nothing. A Replicon mention would most likely be a client-placement job ad. digihelic.com did not load (301 then connection failure) on 2026-10-07; company still listed on directories. No contact research.",
)
D["Hammerjack"] = dict(
    hq_country="Australia", employee_count="210 (input); 100-249 per Outsource Accelerator; site claims 1,000+ professionals placed",
    employee_count_source_url="https://www.outsourceaccelerator.com/company/hammerjack",
    confidence_score=20,
    status_reason="TheirStack 'My Hours' hit only; 'My Hours' is a common phrase and no source ties Hammerjack to the My Hours software.",
    workforce_signals="Sydney-HQ offshore outsourcing/BPO provider with offices in Makati, Manila and Pampanga (Philippines): dedicated offshore finance/accounting, IT, VA and back-office staff for AU/US/UK SMEs; seat-leasing BPO; hybrid work for many roles.",
    contacts=[{"name": "Nicholas Hastings", "title": "Founder & Managing Director", "linkedin": "https://www.linkedin.com/in/nicholas-hastings-529a55b3/", "source_url": "https://www.outsourceaccelerator.com/company/hammerjack"}],
    company_linkedin="https://www.linkedin.com/company/hammerjack",
    company_phone="1300 788 451", public_email="info@hammerjack.com.au",
    contact_source_url="https://hammerjack.com.au/contact-us/",
    pitch_angle="Offshore staffing provider with 1,000+ Philippine staff serving SME clients: Tavilo gives each client proof-of-work (activity, screenshots, hours) per seat and payroll-ready timesheets - a white-label-able transparency layer for its offshore teams.",
    notes="Industry tag 'Accounting' reflects its finance/accounting outsourcing focus. Searched '\"Hammerjack\" \"My Hours\" OR myhours', 'Hammerjack My Hours job Philippines' and 'Hammerjack outsourcing Time Doctor/Hubstaff/ActivTrak': no tool named. LinkedIn URL for Nicholas Hastings appears verbatim on the Outsource Accelerator profile. Phone and email from hammerjack.com.au contact/about pages. A 2017 Microsoft article named a country manager (Andrew Mault) - not recorded (current role unverified). Top prospect by workforce fit despite unconfirmed tool.",
)
D["Iversoft"] = dict(
    hq_country="Canada", confidence_score=15,
    status_reason="TheirStack 'My Hours' hit only; likely generic phrase, no link to the My Hours software found.",
    workforce_signals="Ottawa software/mobile app development agency (founded 2009), under 49 staff, billable client projects (~$199/hr per DesignRush).",
    contacts=[
        {"name": "Graeme Barlow", "title": "CEO", "linkedin": "https://www.linkedin.com/in/graemebarlow/", "source_url": "https://www.iversoft.ca/about"},
        {"name": "Laura Townson", "title": "COO", "linkedin": "https://ca.linkedin.com/in/lauratownson/", "source_url": "https://www.iversoft.ca/about"},
    ],
    company_linkedin="https://www.linkedin.com/company/iversoft",
    company_phone="1-855-760-4064", public_email="info@iversoft.ca",
    contact_source_url="https://www.iversoft.ca/contact",
    pitch_angle="Dev agency billing clients hourly: Tavilo ties developer time to client projects with activity evidence for invoices.",
    notes="Searched '\"Iversoft\" \"My Hours\" OR Harvest OR Toggl' and Iversoft careers + My Hours: nothing. Leadership and LinkedIn links taken verbatim from iversoft.ca/about (also lists Vicki Iverson CTO & co-founder, Matt Strentse Chief Relationship Officer). Phone/email from site.",
)
D["Telefónica Tech (EN)"] = dict(
    hq_country="United Kingdom", confidence_score=15,
    notes="Searched '\"Telefónica Tech\" UK Replicon timesheet' and 'Telefonica Tech UK job Replicon': no Replicon mention in UK job ads (SmartRecruiters/BuiltIn). Subsidiary of Telefónica group; enterprise procurement; no contact research.",
)
D["8400 The Health Network"] = dict(
    hq_country="Israel", confidence_score=15,
    notes="Searched '\"8400 The Health Network\" Toggl' and 8400 jobs + Toggl: nothing. Tel Aviv HealthTech ecosystem non-profit (fellowship programs); employee count 191 looks inflated by network members. No contact research.",
)
