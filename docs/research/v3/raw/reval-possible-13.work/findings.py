F = {}

F[("Fuse (sports & entertainment marketing agency)", "Toggl Track")] = dict(
    industry="Sports & entertainment marketing agency (Omnicom Media Group)",
    hq_country="UK",
    employee_count="~420 (120 London HQ + ~300 in other offices, per job-ad text)",
    employee_count_source_url="https://builtin.com/job/account-director-events/3969931",
    evidence_type="Vendor case study",
    evidence_summary="Toggl customer story: Fuse's in-house international brand & design team moved from Toggl Plan + Toggl Track to the unified Toggl platform in Dec 2025 (Starter plan), using timeline/board views, task estimates and time off.",
    evidence_quote="feels more collaborative as a planning tool",
    source_url="https://toggl.com/customers/fuse",
    source_publication_date="2026",
    second_source_url="https://fuseint.com/",
    status="CURRENT",
    status_reason="Live 2026 Toggl customer story naming Fuse and a named team lead; migration to unified Toggl dated Dec 2025.",
    confidence_score=92,
    workforce_signals="Global agency, 20+ offices, hybrid (50% office); use is one in-house design team and mostly resource planning rather than hour tracking",
    contacts=[
        {"name": "James Leighfield", "title": "Head of International Brand & Design (named in Toggl story)", "linkedin": "", "source_url": "https://toggl.com/customers/fuse"},
        {"name": "Lucy Basden-Smith", "title": "Managing Director (appointed Sep 2025)", "linkedin": "", "source_url": "https://sponsorship.org/fuse-names-lucy-basden-smith-as-managing-director/"},
    ],
    company_phone="", public_email="",
    contact_source_url="https://fuseint.com/",
    pitch_angle="Design team already plans work in Toggl; pitch Tavilo as planning + actual tracked time across Fuse's 20+ offices, priced per seat below Toggl's unified plans. Low priority: Omnicom procurement and use is team-level only.",
    notes="Confidence held below 100 because the story covers one in-house team inside an Omnicom agency. HQ Bankside 2-3, 90-100 Southwark St, London SE1 0SW (fuseint.com). Searched LinkedIn for James Leighfield: no matching profile found. Company LinkedIn not found on fuseint.com.",
)

F[("UpBuild", "Everhour")] = dict(
    industry="SEO/marketing agency (acquired)",
    hq_country="US",
    evidence_type="Vendor testimonial/logo",
    source_url="https://everhour.com/customers",
    status="DO_NOT_TARGET",
    status_reason="UpBuild (Portland technical-SEO agency) was acquired: upbuild.io team page says Mike Arnesen 'served as its CEO for seven years before UpBuild got acquired'. upbuild.io now sells link-building / guest-post / PBN backlink packages, so the original agency that gave the Everhour testimonial no longer exists in that form.",
    confidence_score=10,
    notes="Checked upbuild.io (live, (c)2026, link-building services) and upbuild.io/meet-the-team/. Searches 'UpBuild Everhour Mike Arnesen' and closure/acquisition found only 2017-2019 material. Testimonial undated and from the pre-acquisition CEO. No contact research per DO_NOT_TARGET.",
)

F[("Ekipa", "Clockify")] = dict(
    industry="Agile & AI consultancy",
    hq_country="Indonesia",
    employee_count="11-50",
    employee_count_source_url="https://theorg.com/org/ekipa",
    evidence_type="Current job posting",
    evidence_summary="Himalayas Agile Coach posting (shared 2026-07-19, Indonesia only): candidates familiar with JIRA, Trello, Miro, Clockify, Google Workspace and Slack have an advantage, which reads as Ekipa's own tool stack.",
    evidence_quote="Familiar with tools such as JIRA, TRELLO, MIRO, CLOCKIFY, Google Workspace and Slack is an advantage",
    source_url="https://himalayas.app/companies/ekipa/jobs/agile-coach",
    source_publication_date="2026-07-19",
    status="PROBABLE",
    status_reason="Recent (Jul 2026) job ad lists Clockify within what looks like the company's internal tool stack; 'advantage' wording, no second source.",
    confidence_score=60,
    workforce_signals="Consultants placed at client sites across Jakarta, Singapore, Kuala Lumpur; hybrid; billable consulting hours",
    contacts=[
        {"name": "Nicodemus Winata", "title": "CEO (Indonesia)", "linkedin": "https://www.linkedin.com/in/nicodemus-winata-05593b10", "source_url": "https://ekipa.co/about-us/who-we-are/our-team/"},
        {"name": "Hugo Messer", "title": "Founder (Indonesia, Singapore & Malaysia)", "linkedin": "https://www.linkedin.com/in/hugomesser/", "source_url": "https://ekipa.co/about-us/who-we-are/our-team/"},
        {"name": "Ugeng Wijaya", "title": "Chief Operating Officer", "linkedin": "https://www.linkedin.com/in/ugengwijaya/", "source_url": "https://ekipa.co/about-us/who-we-are/our-team/"},
    ],
    public_email="hello@ekipa.co",
    contact_source_url="https://ekipa.co/",
    pitch_angle="Small consultancy billing client time from Clockify; Tavilo adds activity proof and per-client reports for consultants embedded at bank/insurer clients.",
    notes="LinkedIn URLs copied verbatim from ekipa.co team page (2026-10-07). Search '\"Ekipa\" Clockify' found nothing beyond the job ad. Phone not published.",
)

F[("BurnsGroup", "Replicon")] = dict(
    industry="Brand/marketing agency (acquired)",
    hq_country="US",
    source_url="https://www.replicon.com/case-study/burns-group/",
    second_source_url="https://www.adweek.com/agencyspy/tombras-acquires-new-york-agency-the-burns-group/",
    source_publication_date="2016",
    status="DO_NOT_TARGET",
    status_reason="The Burns Group was acquired by Tombras in Oct 2024 and folded into Tombras New York (~10 staff at the time); Replicon story is a 2016 PDF.",
    confidence_score=5,
    notes="Replicon case study PDF uploaded 2016-06 (replicon.com/wp-assets/uploads/2016/06/CaseStudy_BurnGroup.pdf). burnsgroup.com returns an empty JS shell. No contact research.",
)

F[("Communicopia", "Replicon")] = dict(
    hq_country="Canada",
    source_url="https://www.replicon.com/case-study/communicopia/",
    status="DO_NOT_TARGET",
    status_reason="communicopia.com now serves an Indonesian lottery/gambling spam page ('Haitogel ~ Agen Togel Sidney'); the agency's domain has lapsed, so the company appears defunct. Replicon story is pre-2020.",
    confidence_score=0,
    notes="Fetched communicopia.com on 2026-10-07. No contact research.",
)

F[("VentureWeb (now Kindred)", "Replicon")] = dict(
    industry="Marketing/creative/digital talent staffing agency (Kindred, formerly VentureWeb)",
    hq_country="Canada",
    employee_count="300",
    employee_count_source_url="https://builtinvancouver.org/company/hellokindred",
    source_url="https://www.replicon.com/case-study/ventureweb/",
    second_source_url="https://de.replicon.com/wp-assets/uploads/2016/06/casestudy-ventureweb.pdf",
    source_publication_date="2016",
    status="POSSIBLE",
    status_reason="Only a 2016-era Replicon case study (client billing, time & expense replacing Excel). No current evidence found that Kindred still uses Replicon.",
    confidence_score=20,
    workforce_signals="Staffing agency placing marketing/creative/digital contractors on short and long-term contracts; staff in Canada, US, UK, South Africa; hybrid",
    contacts=[
        {"name": "Matthew Jankelow", "title": "Chief Executive Officer (founder)", "linkedin": "", "source_url": "https://hellokindred.com/who-we-are/meet-the-team/"},
        {"name": "Roland Glass", "title": "Chief Commercial Officer", "linkedin": "", "source_url": "https://hellokindred.com/who-we-are/meet-the-team/"},
    ],
    company_linkedin="https://www.linkedin.com/company/hellokindred/",
    company_phone="+1 647 556 1552; +1 917 765 7302",
    public_email="peopleoperations@hellokindred.com",
    contact_source_url="https://hellokindred.com/",
    pitch_angle="Contract-talent agency billing clients for placed contractors' hours; Tavilo gives verifiable contractor time + activity for client invoices.",
    notes="ventureweb.com redirects to hellokindred.com. Searches: 'Kindred VentureWeb time tracking', '\"BurnsGroup\" Replicon'-style search for Kindred found only the old Replicon PDF. Phones/email taken from hellokindred.com homepage HTML (which number is which office not labelled). Personal LinkedIn not searched (POSSIBLE row).",
)

F[("Safety Research Corporation of America (SRCA)", "Replicon")] = dict(
    industry="Government contractor (IT services, training, management consulting; VOSB)",
    hq_country="US",
    source_url="https://www.replicon.com/case-study/srca/",
    second_source_url="https://govconinabox.com/explore/contractors/profile/safety-research-corporation-of-america-llc-exbmfs",
    status="POSSIBLE",
    status_reason="Company alive (Dothan, AL; federal awards through Nov 2025) but only an old, pre-2020 Replicon case study; no current evidence.",
    confidence_score=20,
    workforce_signals="Federal contractor (DCAA-style timekeeping likely needed)",
    notes="srca.net returns an empty page to curl. Searched 'Safety Research Corporation of America SRCA' and '... government contractor'. Govcon profile: VOSB, est. 1993, $1.70M across 99 awards 2022-2025. Size unknown, likely small; not enriched.",
)

F[("MyBikeMx", "Monitask")] = dict(
    industry="Custom bicycle manufacturer / e-commerce with delivery operation",
    hq_country="Mexico",
    employee_count="2-10 (per Capterra reviewer profile)",
    employee_count_source_url="https://www.capterra.com/p/163622/Monitask/reviews/",
    evidence_type="Public review by company (G2/Capterra/Trustpilot/app store)",
    evidence_summary="Capterra review dated 2025-11-07 by 'Sebastian C., CEO at MyBikeMx' (2-10 employees): Monitask time tracking, task management and monitoring keep remote and field teams organised and dispatchers and drivers in sync; reports no drawbacks.",
    evidence_quote="dispatchers and drivers in sync",
    source_url="https://www.capterra.com/p/163622/Monitask/reviews/",
    source_publication_date="2025-11-07",
    second_source_url="https://www.chicmagazine.com.mx/sociedad/sebastian-cedeno-my-bike-mx-busca-cambiar-puebla",
    status="CURRENT",
    status_reason="CEO's own public Capterra review from Nov 2025 describing ongoing use.",
    confidence_score=88,
    workforce_signals="Field dispatchers and delivery drivers plus remote staff; small factory in Puebla",
    contacts=[
        {"name": "Sebastián Cedeño Manrique", "title": "Founder & CEO", "linkedin": "https://www.linkedin.com/in/sebastian-cede%C3%B1o-manrique/", "source_url": "https://www.chicmagazine.com.mx/sociedad/sebastian-cedeno-my-bike-mx-busca-cambiar-puebla"},
    ],
    company_phone="+52 222 754 0651 (WhatsApp)",
    public_email="hola@mybikemx.com",
    contact_source_url="https://mybikemx.com/",
    pitch_angle="Happy Monitask user with field + remote staff; only a fit if Tavilo offers GPS/field tracking or a cheaper small-team plan. Very small (2-10 staff): low revenue potential.",
    notes="Re-checked 2026-10-07: review visible on Capterra, dated 2025-11-07 (earlier row lacked the date). Role confirmed by Capterra title and Chic Magazine profile ('directs MyBikeMx'). Personal LinkedIn URL kept from the earlier pass (seen in search results then); not re-surfaced in today's searches. Searched 'MyBikeMx Monitask review'. Too small for Tavilo Starter (10 seats) maybe.",
)

F[("Keystone Realtors", "Workstatus")] = dict(
    industry="Real estate development (Rustomjee group, listed)",
    hq_country="India",
    source_url="https://www.workstatus.io/case-study/real-estate-team-challenges",
    second_source_url="http://web.archive.org/web/2025/https://www.workstatus.io/case-study/keystone-realtors",
    source_publication_date="2025-07",
    status="POSSIBLE",
    status_reason="Named Workstatus case study (Jul 2025) now redirects to an anonymised version; Keystone only remains in an image caption ('Keystone Realtors Results with Workstatus'). Story has no quotes, generic numbers, and describes Keystone as a homebuyer-connecting firm, which does not match the listed developer. Not credible enough to upgrade.",
    confidence_score=30,
    notes="workstatus.io/case-study/keystone-realtors 301s to /case-study/real-estate-team-challenges (checked 2026-10-07). Searched Workstatus + Keystone Realtors: only the vendor page. Listed large company (>1,000 staff); not enriched.",
)

F[("Practo", "Workstatus")] = dict(
    industry="Digital healthcare",
    hq_country="India",
    source_url="https://www.workstatus.io/case-study/healthcare-firm-productivity-challenges",
    second_source_url="https://www.workstatus.io/category/case-study/page/3",
    source_publication_date="2025-07",
    status="POSSIBLE",
    status_reason="Vendor story names 'Practo Pulse' (headline still in Workstatus category listings) but the page now redirects to an anonymised 'healthcare firm' story; no quotes, no named people, no independent evidence that Practo uses Workstatus.",
    confidence_score=25,
    notes="Old URL /case-study/practo-pulse-productivity-challenges 301s to /case-study/healthcare-firm-productivity-challenges. Searched 'Practo Workstatus time tracking'. Practo is a large company; not enriched.",
)

F[("W.S. Kane & Co.", "Workstatus")] = dict(
    industry="Law firm (IP)",
    hq_country="India",
    source_url="https://www.workstatus.io/case-study/legal-firm-delay-challenges",
    second_source_url="http://web.archive.org/web/2025/https://www.workstatus.io/case-study/w-s-kane-and-co-legal-delay-challenges",
    source_publication_date="2025-07",
    status="POSSIBLE",
    status_reason="Named Workstatus story (Jul 2025) now redirects to an anonymised 'legal firm' version; no independent evidence. Vendor may have named it without consent.",
    confidence_score=25,
    company_linkedin="https://www.linkedin.com/company/w-s-kane-co/",
    company_phone="+91 22 6614 1414",
    public_email="contact@wskaneandco.com",
    contact_source_url="https://www.wskaneandco.com/",
    notes="Old URL 301s to /case-study/legal-firm-delay-challenges. Searched W.S. Kane + Workstatus / Himanshu Kane: no hits; could not confirm Himanshu Kane's role (Ashutosh Kane appears as a ranked IP practitioner), so input contact dropped. Address: Merchant Chamber, 6th Floor, 41 Sir Vithaldas Thackersey Rd, Churchgate, Mumbai 400020. Contact data copied from homepage; no further contact research (not a remote/BPO firm).",
)

F[("Coronis Health", "ProHance")] = dict(
    industry="Healthcare revenue cycle management (RCM) / BPO",
    hq_country="US",
    employee_count="10,000+ (US, India, Philippines)",
    employee_count_source_url="https://coronishealth.com/news/pranil-vadgama-ceo-president",
    evidence_type="Vendor testimonial/logo",
    evidence_summary="ProHance testimonials page (live 2026) has a Coronis story card: Gokul Venkatesan, Assistant General Manager - Systems, says ProHance improved work hygiene and self time management and was very effective during WFH via consolidated team efficiency/utilisation views.",
    evidence_quote="This tool was very effective during remote working methodology (WFH scenario) by getting consolidated view of team efficiency & utilization.",
    source_url="https://www.prohance.ai/testimonials",
    source_publication_date="",
    status="PROBABLE",
    status_reason="Explicit named testimonial with a named Coronis manager, still live on the vendor site in 2026; wording ('WFH scenario') suggests it dates from ~2020-22, so current use not confirmed.",
    confidence_score=55,
    workforce_signals="Large offshore RCM delivery teams in Chennai and Mohali (India) and the Philippines; medical coding, AR calling; WFH",
    contacts=[
        {"name": "Pranil Vadgama", "title": "CEO & President (appointed May 2026)", "linkedin": "", "source_url": "https://coronishealth.com/news/pranil-vadgama-ceo-president"},
        {"name": "Gokul Venkatesan", "title": "Assistant General Manager - Systems (per ProHance testimonial; date unknown)", "linkedin": "", "source_url": "https://www.prohance.ai/testimonials"},
    ],
    company_linkedin="https://www.linkedin.com/company/coronishealth",
    contact_source_url="https://coronishealth.com/about/our-team",
    pitch_angle="Offshore RCM workforce measured with ProHance; new CEO (May 2026) investing in workflow intelligence - pitch Tavilo as cheaper per-seat time + activity analytics for India/Philippines production teams.",
    notes="Testimonial text read from prohance.ai/testimonials HTML (story card '8) Coronis'). Search '\"Coronis\" ProHance' only returns the MRI drug ProHance (name collision); no job ads naming ProHance found. 10k+ staff is above Tavilo's sweet spot; phone/email not researched.",
)

F[("Lloyd Harrington", "Apploye")] = dict(
    industry="Recruitment (banking/finance, accounting, insurance, construction, HR, IT)",
    hq_country="Australia",
    source_url="https://apploye.com/",
    source_publication_date="2026-05-11",
    status="POSSIBLE",
    status_reason="Logo ('lloydharrington') in Apploye homepage 'Trusted by' strip, image uploaded 2026-05-11 (Webflow asset id); no story, review or other evidence.",
    confidence_score=40,
    workforce_signals="Recruitment consultants; input notes a possible India entity (not confirmed on the AU site)",
    company_linkedin="https://au.linkedin.com/company/lloyd-harrington",
    company_phone="(02) 8377 7150",
    public_email="info@lloydharrington.com.au",
    contact_source_url="https://lloydharrington.com.au/",
    notes="Domain lloydharrington.com.au. Searched 'Lloyd Harrington recruitment Apploye OR time tracking' and Apploye customer-stories page: no story. Homepage names no leaders. Logo upload date decoded from the Webflow asset id (6a019ea6 = 2026-05-11).",
)

F[("ADL Advisory", "Apploye")] = dict(
    industry="Shariah advisory",
    hq_country="Malaysia",
    source_url="https://apploye.com/",
    source_publication_date="2025-10-01",
    status="POSSIBLE",
    status_reason="Logo 'ADL Advisory' in Apploye 'Trusted by' strip (asset uploaded 2025-10-01); no other evidence.",
    confidence_score=35,
    notes="adladvisory.co is live. Searched Apploye + company names and Apploye customer stories: nothing. Small advisory firm, not remote/BPO; not enriched.",
)

F[("AVEO Software", "Apploye")] = dict(
    company_domain="aveosoftware.ca",
    industry="Custom software development studio",
    hq_country="Canada",
    source_url="https://apploye.com/",
    source_publication_date="2025-10-01",
    status="POSSIBLE",
    status_reason="Logo 'AVEO Software' in Apploye 'Trusted by' strip (asset uploaded 2025-10-01); no story or review.",
    confidence_score=35,
    workforce_signals="Software agency; MVP/app development (team location not stated)",
    company_linkedin="https://ca.linkedin.com/company/aveosoftware",
    company_phone="+1-587-200-5079",
    public_email="sales@aveosoftware.ca",
    contact_source_url="https://aveosoftware.ca/",
    notes="Identified as Aveo Software Inc., Suite 2000 - 125 9 Ave SE, Calgary (aveosoftware.com redirects to aveosoftware.ca); match to the logo is likely but not certain. Leaders not named on site.",
)

F[("Ecom Igniter", "Apploye")] = dict(
    source_url="https://apploye.com/",
    source_publication_date="2026-05-11",
    status="POSSIBLE",
    status_reason="Logo 'ecomigniter' in Apploye strip (uploaded 2026-05-11); company could not be identified.",
    confidence_score=20,
    notes="Searched '\"Ecom Igniter\" agency': no match; ecomigniter.com did not respond. Not enriched.",
)

F[("SecureWP", "Apploye")] = dict(
    industry="WordPress security scanning & malware repair service",
    source_url="https://apploye.com/",
    source_publication_date="2026-05-11",
    status="POSSIBLE",
    status_reason="Logo 'securewp' in Apploye strip (uploaded 2026-05-11); no other evidence.",
    confidence_score=30,
    notes="Likely securewp.net (founder 'Tuhin A.', also SiteFort). Very small service business. Not enriched.",
)

F[("Servpad", "Apploye")] = dict(
    industry="Field-service CRM SaaS for small home-services businesses",
    source_url="https://apploye.com/",
    source_publication_date="2026-05-11",
    status="POSSIBLE",
    status_reason="Logo 'servpad' in Apploye strip (uploaded 2026-05-11); no other evidence.",
    confidence_score=30,
    notes="Likely servpad.com ('Free CRM - FSM Software To Run Small Home Services Business'). Small SaaS; not enriched.",
)

F[("LSFG", "Apploye")] = dict(
    source_url="https://apploye.com/",
    source_publication_date="2026-05-11",
    status="POSSIBLE",
    status_reason="Logo 'lsfg' in Apploye strip (uploaded 2026-05-11); company not identified.",
    confidence_score=20,
    notes="lsfg.com did not respond; acronym ambiguous. Not enriched.",
)

F[("Cudy", "Apploye")] = dict(
    industry="Online tutoring marketplace (Asia)",
    source_url="https://apploye.com/",
    source_publication_date="2026-05-11",
    status="POSSIBLE",
    status_reason="Logo 'cudy-co' in Apploye strip (uploaded 2026-05-11); no other evidence.",
    confidence_score=30,
    notes="Logo filename points to cudy.co ('Find Asia's Leading Tutors Online'). Not enriched.",
)

F[("fGrade", "Apploye")] = dict(
    industry="Zoho CRM consulting",
    source_url="https://apploye.com/",
    source_publication_date="2026-05-11",
    status="POSSIBLE",
    status_reason="Logo 'fgrade' in Apploye strip (uploaded 2026-05-11); no other evidence.",
    confidence_score=30,
    notes="Likely fgrade.com ('FGRADE ZOHO CRM Consulting'). Small consultancy; not enriched.",
)

F[("RCCGD", "Apploye")] = dict(
    source_url="https://apploye.com/",
    source_publication_date="2026-05-11",
    status="POSSIBLE",
    status_reason="Logo 'rccgd' in Apploye strip (uploaded 2026-05-11); company not identified.",
    confidence_score=20,
    notes="rccgd.org did not respond; acronym ambiguous. Not enriched.",
)

F[("Fabdesigns", "EmpMonitor")] = dict(
    industry="3-D knit technical textiles: product development, prototyping, training",
    hq_country="US",
    evidence_type="Vendor case study",
    evidence_summary="EmpMonitor case study (undated, live 2026) on Fabdesigns (3-D knit textiles since 1988): unattributed quote that EmpMonitor gives regular insight into employee productivity; claims 10% productivity rise in one week.",
    evidence_quote="EmpMonitor has been exceptional in providing regular insights into our employees' productivity.",
    source_url="https://empmonitor.com/case-study/fabdesigns/",
    second_source_url="https://knittingindustry.com/how-fabdesigns-developed-its-highquality-3d-knitted-face-coverings/",
    status="POSSIBLE",
    status_reason="Undated vendor story with an unattributed quote; EmpMonitor's site has placeholder reviewers, so vendor claims are weak. Company is real (California, founded 1988 by Bruce and Connie Huffa).",
    confidence_score=30,
    notes="Searched 'Fabdesigns knitting 3D design since 1988' (trade press confirms company) and fetched the case study. Small specialist firm, not remote/BPO; not enriched.",
)

F[("Netscribes", "Flowace")] = dict(
    industry="Market research / data & insights services",
    hq_country="India",
    employee_count="1,200+ (company leadership page)",
    employee_count_source_url="https://netscribes.com/about-us/leadership-team",
    evidence_type="Vendor testimonial/logo",
    evidence_summary="'Netscribes Logo' in Flowace homepage customer strip (image uploaded 2026-04). Flowace also published (Jun 2026) an anonymised case study on 'a global data and insights firm serving Fortune 500 clients' with offices in India and the US, 1,391 employees and 22 delivery teams, which matches Netscribes' profile but does not name it.",
    source_url="https://flowace.ai/",
    source_publication_date="2026-04",
    second_source_url="https://flowace.ai/case-studies/data-insights-firm/",
    status="PROBABLE",
    status_reason="Current (Apr 2026) vendor logo plus an anonymised Jun 2026 Flowace case study whose profile closely matches Netscribes; match is inferred, not stated.",
    confidence_score=50,
    workforce_signals="1,200-1,400 analysts/researchers in India delivery centres serving US clients; idle-time tracking by delivery team",
    contacts=[
        {"name": "Sourav Mukherjee", "title": "Founder & CEO", "linkedin": "", "source_url": "https://netscribes.com/about-us/leadership-team"},
    ],
    company_linkedin="https://www.linkedin.com/company/netscribes/",
    contact_source_url="https://www.netscribes.com/contact-us/",
    pitch_angle="Large Indian research-services workforce now (or recently) on Flowace and also shown by EmpMonitor; pitch Tavilo's per-seat pricing at 1,000+ seats and idle-cost reporting by delivery team.",
    notes="Also appears in EmpMonitor's Jan 2026 client-logo image (separate row) - possibly evaluated/switched between tools. Searched 'Flowace case study Netscribes...' (no named hit). netscribes.com contact page: no phone/email in HTML (TLS error on fetch tool). LinkedIn search for Sourav Mukherjee found no verbatim profile URL.",
)

F[("Netscribes", "EmpMonitor")] = dict(
    industry="Market research / data & insights services",
    hq_country="India",
    employee_count="1,200+ (company leadership page)",
    employee_count_source_url="https://netscribes.com/about-us/leadership-team",
    source_url="https://empmonitor.com/wp-content/uploads/2026/01/emp-clients-updated.webp",
    source_publication_date="2026-01",
    status="POSSIBLE",
    status_reason="Logo only in an EmpMonitor client-logo image (Jan 2026); EmpMonitor's customer claims are low quality, and Flowace evidence for the same company is stronger.",
    confidence_score=30,
    contacts=[
        {"name": "Sourav Mukherjee", "title": "Founder & CEO", "linkedin": "", "source_url": "https://netscribes.com/about-us/leadership-team"},
    ],
    company_linkedin="https://www.linkedin.com/company/netscribes/",
    notes="No EmpMonitor story or review naming Netscribes found. See Flowace row.",
)

F[("Anarock", "Flowace")] = dict(
    industry="Real estate services",
    hq_country="India",
    source_url="https://flowace.ai/",
    source_publication_date="2026-04",
    status="POSSIBLE",
    status_reason="'Anarock Logo' in Flowace homepage strip (uploaded 2026-04); no case study or other evidence.",
    confidence_score=35,
    notes="Searched Flowace + Anarock: only Anarock's own pages. Large firm (thousands of staff); not enriched.",
)

F[("Bhuta Shah & Co", "Flowace")] = dict(
    industry="Chartered accountants (audit, tax, advisory)",
    hq_country="India",
    employee_count="~350 (20 partners)",
    employee_count_source_url="https://www.internationaltaxreview.com/itrworldtax/firms/bhuta-shah-co-india",
    evidence_type="Vendor testimonial/logo",
    evidence_summary="'Bhuta shah & co Logo' in Flowace homepage strip (uploaded 2026-04). Flowace also published Jun 2026 anonymised stories on 'a prominent mid-tier chartered accountancy firm' (238 users, 7 delivery teams, billable-hour capture) and 'a large-footprint CA firm' (attendance accuracy) - consistent with, but not naming, Bhuta Shah.",
    source_url="https://flowace.ai/",
    source_publication_date="2026-04",
    second_source_url="https://flowace.ai/case-studies/chartered-accountancy-firm/",
    third_source_url="https://flowace.ai/case-studies/ca-firm-case-study/",
    status="PROBABLE",
    status_reason="Current vendor logo; the only CA-firm logo on Flowace's homepage and Flowace has two 2026 anonymised CA-firm case studies; link inferred.",
    confidence_score=45,
    workforce_signals="9 offices across India; billable hours by service line",
    contacts=[
        {"name": "Harsh Bhuta", "title": "Managing Partner", "linkedin": "", "source_url": "https://www.internationaltaxreview.com/itrworldtax/firms/bhuta-shah-co-india"},
        {"name": "Shailesh Bhuta", "title": "Founder / senior partner", "linkedin": "", "source_url": "https://www.internationaltaxreview.com/itrworldtax/firms/bhuta-shah-co-india"},
    ],
    company_phone="+91 22 4343 9191; +91 22 2283 2727",
    public_email="mail@bhutashah.com",
    contact_source_url="https://bhutashah.com/contact-us/",
    pitch_angle="CA firm tracking billable hours and attendance across 9 offices; Tavilo can cover billable-hour capture + attendance at lower per-seat cost.",
    notes="Address: 2nd Floor, Bajaj Bhawan, Jamnalal Bajaj Marg, Nariman Point, Mumbai 400021. Searched '\"Harsh Bhuta\" Bhuta Shah linkedin': no verbatim profile URL. Company LinkedIn page not found on site.",
)

F[("Cliantha Research", "Flowace")] = dict(
    industry="Clinical research (CRO)",
    hq_country="India",
    source_url="https://flowace.ai/",
    source_publication_date="2026-04",
    status="POSSIBLE",
    status_reason="'Cliantha Research Logo' in Flowace homepage strip (uploaded 2026-04); no story or other evidence.",
    confidence_score=35,
    notes="Searched Flowace + Cliantha: nothing beyond logo. Lab/clinical workforce, not remote/BPO; not enriched.",
)

F[("Codemantra", "Flowace")] = dict(
    industry="Content/accessibility services (document remediation, composition, conversion)",
    hq_country="India",
    employee_count="501-1,000",
    employee_count_source_url="https://himalayas.app/companies/codemantra",
    source_url="https://flowace.ai/",
    source_publication_date="2026-04",
    status="POSSIBLE",
    status_reason="'Codemantra Logo' in Flowace homepage strip (uploaded 2026-04); no story or other evidence.",
    confidence_score=35,
    workforce_signals="Offshore production centre in Chennai serving US/UK publishers; content-services BPO model",
    contacts=[
        {"name": "Murali Krishnan", "title": "Chief Operating Officer, codeMantra U.S. LLC (Chennai)", "linkedin": "", "source_url": "https://origami.chat/people/murali-krishnan-3153658"},
    ],
    company_linkedin="https://www.linkedin.com/company/codemantraonline/",
    contact_source_url="https://www.codemantra.com/",
    pitch_angle="Chennai production team doing billable remediation work; Tavilo per-seat time + activity tracking for offshore delivery.",
    notes="Company domain codemantra.com (input blank). CEO unclear: sources name both Anantha Tirupati and Daniel Serpico, neither confirmed, so not listed. Site HTML has no phone/email. Searched 'codemantra CEO employees', 'codemantra appoints CEO'.",
)

F[("Naik Naik & Company", "Flowace")] = dict(
    industry="Law firm",
    hq_country="India",
    source_url="https://flowace.ai/",
    source_publication_date="2026-04",
    status="POSSIBLE",
    status_reason="'NAIK NAIK Logo' (file naik_naik__co__advocates_logo) in Flowace strip (uploaded 2026-04); no other evidence.",
    confidence_score=35,
    notes="Mumbai law firm; not remote/BPO; not enriched.",
)

F[("NCS", "Flowace")] = dict(
    industry="IT services (Singtel group)",
    hq_country="Australia",
    source_url="https://flowace.ai/",
    source_publication_date="2026-04",
    status="POSSIBLE",
    status_reason="Logo file 'NCS-Australia-Logo' in Flowace strip (uploaded 2026-04) identifies NCS Australia (1,500+ staff, part of Singtel's 12,000-staff NCS Group); no other evidence. Input's India HQ is wrong.",
    confidence_score=30,
    notes="Enterprise subsidiary; low Tavilo priority; not enriched.",
)

F[("PDCOR", "Flowace")] = dict(
    industry="Infrastructure PPP advisory (Govt of Rajasthan + IL&FS JV)",
    hq_country="India",
    source_url="https://flowace.ai/",
    source_publication_date="2026-04",
    status="POSSIBLE",
    status_reason="'PDCOR Logo' in Flowace strip (uploaded 2026-04); no other evidence.",
    confidence_score=30,
    notes="Identified as PDCOR Limited, Jaipur (active company, est. 1997). Not remote/BPO; not enriched.",
)

F[("Parasoft", "Flowace")] = dict(
    industry="Software testing tools",
    hq_country="US",
    source_url="https://flowace.ai/",
    source_publication_date="2026-04",
    status="POSSIBLE",
    status_reason="'Parasoft Logo' in Flowace strip (uploaded 2026-04); no other evidence; use probably limited to an India office.",
    confidence_score=30,
    notes="Parasoft is US-headquartered (input listed India). Not enriched.",
)

F[("AISECT", "Flowace")] = dict(
    industry="Education/skilling",
    hq_country="India",
    source_url="https://flowace.ai/",
    source_publication_date="2026-04",
    status="POSSIBLE",
    status_reason="'Aisectindia Logo' in Flowace strip (uploaded 2026-04); no other evidence.",
    confidence_score=30,
    notes="Large education group; not enriched.",
)

F[("Aiwa Japan", "Flowace")] = dict(
    industry="Consumer electronics (India brand operation)",
    hq_country="India",
    source_url="https://flowace.ai/",
    source_publication_date="2026-04",
    status="POSSIBLE",
    status_reason="'Aiwa Japan Logo' in Flowace strip (uploaded 2026-04); no other evidence.",
    confidence_score=30,
    notes="Not enriched.",
)

F[("Optum", "ProHance")] = dict(
    industry="Healthcare services (UnitedHealth Group); testimonial is from Episource, a medical-coding/risk-adjustment BPO acquired by Optum",
    hq_country="US",
    evidence_type="Vendor testimonial/logo",
    evidence_summary="ProHance testimonials page (live 2026) shows a story card with the Optum logo whose text is an Episource testimonial by 'Angshuman, VP Operations': ProHance helped Episource's BPO/KPO staff use work hours better, with real-time tracking, roster-based attendance and good support.",
    evidence_quote="ProHance is a simple, friendly-to-use tool, which has helped Episource move towards this direction.",
    source_url="https://www.prohance.ai/testimonials",
    status="POSSIBLE",
    status_reason="Explicit testimonial, but it was given by Episource (pre-Optum branding, undated) and the vendor relabelled it with the Optum logo; current use inside Optum unknown. 10k+ enterprise.",
    confidence_score=40,
    workforce_signals="Offshore medical coding / BPO-KPO production teams (Episource India)",
    notes="Read from prohance.ai/testimonials HTML (story card with optum.png). Enterprise far above Tavilo's target size; not enriched. Episource itself could be a separate lead if still run as its own unit.",
)

F[("CloudCodes", "Prodoscore")] = dict(
    industry="SaaS / cloud security (CASB)",
    hq_country="India",
    source_url="https://www.prodoscore.com/resources/case-studies/cloudcodes/",
    source_publication_date="2020",
    status="DO_NOT_TARGET",
    status_reason="CloudCodes has been absorbed into Plurilock (its news pages now live at cloudcodes.marketing.plurilock.com with 'We have joined the Plurilock Family'); cloudcodes.com returns 403. Prodoscore story is 2020-21 only.",
    confidence_score=5,
    notes="Searched 'CloudCodes Prodoscore' (no new evidence) and 'CloudCodes CASB Debasish Pramanik'. No contact research.",
)

F[("Grove Group", "Prodoscore")] = dict(
    industry="Cyber security & cloud services (Salesforce/Google partner)",
    hq_country="South Africa / UK",
    source_url="https://www.prodoscore.com/resources/case-studies/grove-group/",
    second_source_url="https://www.oaklins.com/ie/en/deals/110328/",
    source_publication_date="2022",
    status="DO_NOT_TARGET",
    status_reason="Grove Group (~50 staff, South Africa with London office) was acquired by Integrity360 in Aug 2024, so it no longer operates independently; Prodoscore story is 2020-22 and the page body is gone.",
    confidence_score=5,
    notes="Searched '\"Grove Group\" Prodoscore Salesforce Pip Witheridge' and Grove Group acquisition. grovegroup.co.uk is an unrelated automotive refinishing firm. No contact research.",
)

F[("Skyway Capital Markets", "Prodoscore")] = dict(
    industry="Investment banking / broker-dealer (M&A advisory, alternative-investment wholesaling)",
    hq_country="US",
    source_url="https://www.prodoscore.com/resources/case-studies/skyway-capital-markets/",
    source_publication_date="2020",
    status="POSSIBLE",
    status_reason="Company alive (skywaycapitalmarkets.com live) but only a 2020-21 Prodoscore story; no newer evidence.",
    confidence_score=20,
    notes="Searched 'Skyway Capital Markets Prodoscore Barry Shevlin': results confirm Shevlin as Senior Managing Director (technology practice) but nothing on Prodoscore. Tampa, FL; office-based, not remote/BPO; not enriched.",
)

F[("Lexmores", "EmpMonitor")] = dict(
    industry="Legal services",
    source_url="https://empmonitor.com/case-study/lexmores/",
    source_publication_date="2024-01",
    status="DO_NOT_TARGET",
    status_reason="Company cannot be verified: lexmores.com and lexmores.in do not respond and a web search for 'Lexmores law firm' finds no such firm; the 'global law firm' exists only in an EmpMonitor story (vendor known for placeholder testimonials).",
    confidence_score=5,
    notes="Checked 2026-10-07. No contact research.",
)

_tm = "Teramind homepage 'Trusted by 10,000+ Companies' logo wall; logo file uploaded 2026-02 (wp-content/uploads/2026/02/{f}). No case study, quote or alt text."

F[("Elevate Agency", "Teramind")] = dict(
    source_url="https://www.teramind.co/", source_publication_date="2026-02",
    evidence_summary=_tm.format(f="ElevateAgency_logo.png"),
    status="POSSIBLE", status_reason="Logo only; plain 'ELEVATE' wordmark, company not identifiable (many 'Elevate' agencies).",
    confidence_score=20,
    notes="Viewed the logo image; no tagline or domain. Not enriched.",
)
F[("Energo", "Teramind")] = dict(
    source_url="https://www.teramind.co/", source_publication_date="2026-02",
    evidence_summary=_tm.format(f="energo_logo.png"),
    status="POSSIBLE", status_reason="Logo only; 'energo' wordmark, company not identifiable.",
    confidence_score=20,
    notes="Viewed the logo image; no tagline. Not enriched.",
)
F[("Felner", "Teramind")] = dict(
    source_url="https://www.teramind.co/", source_publication_date="2026-02",
    evidence_summary=_tm.format(f="felner_logo.png"),
    status="POSSIBLE", status_reason="Logo only; image reads 'FELNER CORPORATION'; no matching company found by search.",
    confidence_score=20,
    notes="Searched '\"Felner Corporation\"': no match. Not enriched.",
)
F[("Manila Health", "Teramind")] = dict(
    industry="Primary & urgent care clinic (likely Maniya Health, Hamilton NJ)",
    hq_country="US",
    source_url="https://www.teramind.co/", source_publication_date="2026-02",
    evidence_summary=_tm.format(f="manilahealth_logo.png"),
    status="POSSIBLE", status_reason="Logo only. The logo actually reads 'MANIYA HEALTH - Primary & Urgent Care. Reimagined.' (stethoscope forms the Y), i.e. Maniya Health, a NJ clinic group - the 'Manila Health' name is a misreading of the file name.",
    confidence_score=25,
    notes="Viewed logo image; search for the tagline returns Maniya Health (Hamilton, NJ). Clinic, not remote/BPO; not enriched.",
)
F[("Patriot Group", "Teramind")] = dict(
    hq_country="US",
    source_url="https://www.teramind.co/", source_publication_date="2026-02",
    evidence_summary=_tm.format(f="patriotgroup_logo.png"),
    status="POSSIBLE", status_reason="Logo only ('Patriot Group' + 'Veteran Owned Business' badge); several US veteran-owned 'Patriot Group' firms exist (Patriot Group International, The Patriot Group BPO, a CA utility contractor), so identity is unresolved.",
    confidence_score=20,
    notes="Searched '\"Patriot Group\" veteran owned business'. Not enriched.",
)
F[("Prime Buy", "Teramind")] = dict(
    source_url="https://www.teramind.co/", source_publication_date="2026-02",
    evidence_summary=_tm.format(f="prime-buy_logo.png"),
    status="POSSIBLE", status_reason="Logo only ('Prime Buy - We're here to help you'); company not identifiable.",
    confidence_score=20,
    notes="Viewed logo image. Not enriched.",
)
