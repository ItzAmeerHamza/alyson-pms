F = {}
CK = "Re-checked 2026-10-07 (wave 3). "

F[0] = dict(status="POSSIBLE", confidence_score=15,
    industry="Contact-center / unified-communications solutions integrator",
    hq_country="Brazil (Sao Paulo)",
    status_reason="Only TheirStack signal; no source ties A5 Solutions to QuickBooks Time (a US/QuickBooks-payroll product, rare in Brazil).",
    notes=CK + "Company is real: Sao Paulo contact-center/UC integrator (group with Coddera, Viridi, Omnize; Miami branch) per tiinside.com.br 2017 and baguete.com.br. Searched '\"A5 Solutions\" \"QuickBooks Time\" OR TSheets' and company profile queries: nothing. Domain not confirmed (blank kept). Not a remote/BPO tracked-seat fit; no contact research.",
    second_source_url="https://tiinside.com.br/20/01/2017/a5-solution-cresce-35-e-inicia-expansao-internacional/")

F[1] = dict(status="POSSIBLE", confidence_score=15,
    industry="Office meal delivery / connected fridges",
    hq_country="France (Strasbourg)",
    status_reason="Company alive (Q1 2026 revenue EUR 2.1M) but no evidence of Toggl use beyond TheirStack.",
    second_source_url="https://www.lejournaldesentreprises.com/breve/le-strasbourgeois-hoplunch-franchit-les-800-000-eu-de-chiffre-daffaires-mensuel-2140803",
    notes=CK + "hoplunch.com returns 403 to fetch; company active per Le Journal des Entreprises 2026. Searched 'HopLunch Toggl', 'HopLunch welcometothejungle toggl/time tracking': nothing. On-site delivery/food business, not a remote team; no contact research.")

F[2] = dict(status="POSSIBLE", confidence_score=15,
    industry="Christian not-for-profit early learning, preschool and family services",
    hq_country="Australia (Burwood, NSW)",
    status_reason="TheirStack-only; no Toggl evidence. Organisation identified as Sydney childcare/family-services charity (not disability services as input said).",
    second_source_url="https://www.ethicaljobs.com.au/members/Integricare/family-support-worker",
    notes=CK + "Searched 'Integricare Australia disability Toggl', '\"Integricare\" family services', NDIS registry: no Toggl link. Integricare = NFP running 8 early learning centres, 6 preschools (Burwood NSW). Childcare centre staff, poor fit for desktop tracking; no contact research.")

F[3] = dict(status="POSSIBLE", confidence_score=10,
    industry="Children's Aid Society (First Nations child protection)",
    hq_country="Canada (Ontario, Sudbury/Manitoulin)",
    status_reason="TheirStack-only; no Replicon evidence in job postings (OACAS PDFs, betterteam, careerbeacon) or elsewhere.",
    notes=CK + "Searched '\"Kina Gbezhgomi\" Replicon', 'Kina Gbezhgomi ... Replicon time entry', job postings: none mention Replicon. Public child-protection agency; poor fit; no contact research.")

F[4] = dict(status="POSSIBLE", confidence_score=10,
    industry="NGO - migrant/refugee integration (volunteer-run)",
    hq_country="Spain (Barcelona); also Polykastro, Greece",
    status_reason="TheirStack-only; no Jibble evidence. Volunteer NGO.",
    notes=CK + "Searched '\"Open Cultural Center\" Jibble', 'OCC volunteer ... jibble OR clock in': nothing. Site openculturalcenter.org (per European Youth Portal). Volunteer-run NGO, poor fit; no contact research.")

F[5] = dict(status="POSSIBLE", confidence_score=15,
    industry="Mail-order / e-commerce retailer (electronics, household)",
    hq_country="Germany (Buggingen)",
    status_reason="TheirStack-only; no Toggl evidence in StepStone listings or elsewhere.",
    notes=CK + "Searched '\"PEARL GmbH\" \"Toggl\"', 'PEARL GmbH Buggingen Toggl Stellenanzeige': nothing. Large mail-order retailer (founded 1989); on-site warehouse/office staff; no contact research.")

F[6] = dict(status="POSSIBLE", confidence_score=10,
    status_reason="TheirStack-only; no Replicon evidence for CIMIC or subsidiaries (CPB, UGL, Thiess, Sedgman).",
    notes=CK + "Searched 'CIMIC Group Replicon timesheet', '\"CIMIC\" OR \"CPB Contractors\" OR \"UGL\" Replicon time': nothing. Large enterprise contractor (HOCHTIEF-owned), poor fit; no contact research.")

F[7] = dict(status="POSSIBLE", confidence_score=10,
    hq_country="United States (Dallas, TX) / Canada (Squamish, BC manufacturing)",
    status_reason="TheirStack-only. Original Nexii Building Solutions entered creditor protection Jan 2024; assets bought by 3 Gates and relaunched as NEXII, Inc. (Dallas). Any Replicon signal likely predates the restructuring.",
    notes=CK + "Searched 'Nexii Replicon', 'Nexii Building Solutions 2026': no Replicon link. Manufacturing/construction workforce; poor fit; no contact research.")

F[8] = dict(status="POSSIBLE", confidence_score=10,
    hq_country="Canada (Castlegar, BC)",
    status_reason="TheirStack-only; no Toggl evidence.",
    notes=CK + "Searched 'Selkirk College Toggl' and college profiles: nothing. Public college; poor fit; no contact research.")

F[9] = dict(status="POSSIBLE", confidence_score=5,
    status_reason="TheirStack 'My Hours' match is most likely the generic phrase: Tailster is a marketplace of self-employed pet carers who set their own hours (Indeed reviews/FAQ talk about flexible hours). No sign of the My Hours software.",
    second_source_url="https://uk.indeed.com/cmp/Tailster/faq/working-hours",
    notes=CK + "Searched 'Tailster \"My Hours\" OR myhours time tracking', '\"Tailster\" \"my hours\"': only generic working-hours content. Kept POSSIBLE (could not see TheirStack's source text) but probable false match; no contact research.")

F[10] = dict(status="POSSIBLE", confidence_score=5,
    status_reason="TheirStack 'My Hours' hit, probably generic phrase (gunnercooke's model is self-employed consultant lawyers choosing their own hours). No software evidence.",
    notes=CK + "Searched 'gunnercooke \"My Hours\" myhours.com', '\"gunnercooke\" \"my hours\"': no relevant results. Law firm of self-employed partners; poor fit; no contact research.")

F[11] = dict(status="POSSIBLE", confidence_score=25,
    status_reason="Still TheirStack-only; no job, review or document naming Hubstaff. Company is live and has remote roles (Indeed lists a remote Fulfilment Center Specialist).",
    second_source_url="https://ca.indeed.com/cmp/Pulse-Alert/locations/ON/Hamilton",
    contacts=[{"name": "Todd Griffiths", "title": "Founder (Navy veteran)", "linkedin": "", "source_url": "https://pulsealert.ca"}],
    contact_source_url="https://pulsealert.ca",
    pitch_angle="Veteran-owned 24/7 monitoring service with remote fulfilment/operator staff: simple time + activity tracking for remote shift workers.",
    notes=CK + "Searched '\"Pulse Alert\" Hubstaff', '\"Pulse Alert\" Hamilton jobs remote operator', '\"Pulse Alert\" remote ... time tracking': no Hubstaff evidence. Homepage re-fetched 2026-10-07: founder Todd Griffiths, phone 1-888-571-6818, support@mypulsemedical.ca, 150 Main St E Hamilton ON. Indeed page 403.")

F[12] = dict(status="POSSIBLE", confidence_score=30,
    employee_count="150+ VAs (company site)", employee_count_source_url="https://vastaffer.com/",
    status_reason="Only evidence is the company's own 2014-12-21 'How to Use Hubstaff' guide; current site has no Hubstaff/time-tracker mention and no newer source found.",
    source_publication_date="2014-12-21",
    contacts=[{"name": "Jeff J Hunter", "title": "Founder & CEO", "linkedin": "https://www.linkedin.com/in/jeffjhunter/", "source_url": "https://vastaffer.com/"}],
    contact_source_url="https://vastaffer.com/",
    pitch_angle="Philippine VA agency (150+ VAs, 250+ clients) - client-facing proof-of-work reports and VA billing; Hubstaff use dates from 2014, so a modern alternative is an easy conversation.",
    notes=CK + "Homepage fetched 2026-10-07: active, Founder & CEO Jeff J Hunter, contact@vastaffer.com, 150+ VAs, 250+ clients. How-to page fetched: dated 2014-12-21, instructional only, no policy statement. Searched 'vastaffer Hubstaff OR \"Time Doctor\" 2025 OR 2026', '\"VA Staffer\" time tracking Hubstaff': nothing newer. Founder LinkedIn kept from input (stated as linked on company page).")

F[13] = dict(status="POSSIBLE", confidence_score=35,
    evidence_summary="OnlineJobs.ph 'Bookkeeping Assistant with WaveApps Experience' (posted 2026-03-30) by The Farm SoHo lists 'Familiarity with tools like QuickBooks, Google Sheets, Excel, and Hubstaff' under Nice to Have.",
    evidence_quote="Familiarity with tools like QuickBooks, Google Sheets, Excel, and Hubstaff",
    source_publication_date="2026-03-30",
    status_reason="Hubstaff is only a 'nice to have' familiarity for one offshore bookkeeping hire; suggests but does not state that The Farm uses Hubstaff.",
    contacts=[{"name": "Lucas Seyhun", "title": "Founder & CEO", "linkedin": "", "source_url": "https://blog.cobot.me/interview-lucas-seyhun-farm-soho-coworking-new-york/"}],
    contact_source_url="https://blog.cobot.me/interview-lucas-seyhun-farm-soho-coworking-new-york/",
    pitch_angle="NYC coworking operator hiring offshore PH support staff; likely a handful of tracked seats.",
    notes=CK + "Posting fetched: Nice-to-Have only (downgraded confidence 50 -> 35). Searched '\"The Farm SoHo\" Hubstaff OR onlinejobs', founder query. Founder from Cobot interview and Starter Story. Phone/email/company LinkedIn kept from input (not re-verified).")

F[14] = dict(status="POSSIBLE", confidence_score=40,
    evidence_summary="OnlineJobs.ph 'Payroll & Commission Coordinator' (part time, posted 2026-09-19) by Capital Access Solutions Hub (CASH) lists Time Doctor under Preferred Experience, alongside QuickBooks Online and Stripe/Square.",
    source_publication_date="2026-09-19",
    status_reason="Time Doctor named only as preferred experience for a payroll role; suggests offshore payroll runs off Time Doctor but not stated. Employer cannot be tied to a website.",
    notes=CK + "Posting fetched 2026-10-07. Searched '\"Capital Access Solutions Hub\" business credit', '\"Capital Access Solutions\" CASH funding consultants website': only unrelated firms (CAN Capital etc.). No domain, size or contacts found.")

F[15] = dict(status="POSSIBLE", confidence_score=30,
    status_reason="Hubstaff appears only as an example tool ('e.g., Hubstaff, Cadence') in one client-placement job ad; Inside Out runs its own Cadence AI platform and clients employ the assistants, so Inside Out may not buy seats.",
    contacts=[{"name": "Chris (Christopher) Martin", "title": "Founder & CEO", "linkedin": "", "source_url": "https://insideoutva.com/"}],
    pitch_angle="Offshore EA/VA placement firm (PH, LatAm, Egypt, South Africa) - could recommend a tracker to placed clients; partnership/referral angle more than direct seats. Own Cadence AI platform may overlap with Tavilo.",
    notes=CK + "Searched '\"Inside Out\" virtual assistants Hubstaff OR \"Time Doctor\" insideoutva', '\"Inside Out\" Chris Martin Cadence AI': nothing new. Barchart profile 'Chris Martin built a global talent machine' (barchart.com/story/news/743897) found but body did not load. insideoutva.com is JS-only (no contact data extracted). Founder kept from input (site schema.org); still believed in role per Barchart headline. Confidence 40 -> 30.")

F[16] = dict(status="POSSIBLE", confidence_score=30,
    evidence_summary="OnlineJobs.ph 'Remote Digital Solutions Specialist' (posted 2025-07-22) by MyCleanBnb asks the hire to 'Implement WorkTime, Controlio (or any other recommended tool) to ensure team members are active during working hours.' Buyer evaluating a monitoring tool, not a confirmed Controlio user.",
    evidence_quote="Implement WorkTime, Controlio (or any other recommended tool) to ensure team members are active during working hours",
    source_publication_date="2025-07-22",
    industry="Airbnb / short-stay housekeeping and cleaning",
    hq_country="Australia (Miami, QLD - Gold Coast)",
    company_phone="+61420699399", public_email="hola@mycleanbnb.com.au",
    contact_source_url="https://mycleanbnb.com.au",
    status_reason="In-market buyer in 2025 (considering WorkTime or Controlio); no proof Controlio was adopted.",
    pitch_angle="Small Gold Coast Airbnb-cleaning firm with offshore PH admin staff that wanted activity monitoring in 2025 - check whether it ever picked a tool.",
    notes=CK + "Posting fetched 2026-10-07 (quote verified). Website found: mycleanbnb.com.au (input domain blank, kept blank in company_domain for merge). Owner name and size not on site. Searched 'MyCleanBnb Gold Coast cleaning'. Likely <25 staff.")

F[17] = dict(status="POSSIBLE", confidence_score=10,
    status_reason="Only a removed Time Doctor case study (archived to 2024). vepeople.com resolves (AWS IP) but refuses HTTPS/HTTP connections (2026-10-05 and 2026-10-07); no recent trace of the company found - may be defunct.",
    notes=CK + "curl/WebFetch to vepeople.com: connection refused. Searched '\"VE People\" Matt Bowd Philippines staffing 2025', '\"VE People\" OR vepeople virtual employees Australia': no current presence (results are Virtual Elves, Virtual Employee - different companies). Contacts not re-confirmed; Matt Bowd kept from input but unverified. Check if trading before outreach.")

F[18] = dict(status="POSSIBLE", confidence_score=15,
    status_reason="Only old Hubstaff testimonial/case quote (GM Karyn Lurie: Hubstaff helped GMT nearly double its team). growmyteam.com.au refuses HTTPS and HTTP redirects to an empty location; newest trace found is a 2019 GoHire job post - may be inactive.",
    second_source_url="https://redbooth.com/blog/remote-team-hubstaff",
    notes=CK + "Searched '\"Grow My Team\" Hubstaff' (Redbooth guest post + Hubstaff reviews page reference), '\"Grow My Team\" Australia remote staffing 2026' (only 2019 GoHire post, no Hubstaff mention). Domain DNS resolves but site down. Contacts kept from input, not re-confirmed. Verify trading before outreach.")

F[19] = dict(status="POSSIBLE", confidence_score=10,
    status_reason="Job ad only asked for experience with tools like Time Doctor/Hubstaff (ad no longer loads). Magic tracks assistant hours in its own dashboard (help center), so it is unlikely to buy Time Doctor seats.",
    second_source_url="https://getmagic.com/help/monitoring-hours",
    notes=CK + "Himalayas job URL now shows a generic listing (posting gone). getmagic.com help 'monitoring hours' says hours are tracked in Magic's own dashboard; no third-party tracker named. Searched 'getmagic ... Time Doctor OR Hubstaff OR time tracking'. In-house tracker = low prospect value; partly a competitor-like model. No contact research beyond input.")

F[20] = dict(status="POSSIBLE", confidence_score=40,
    evidence_summary="OnlineJobs.ph 'SaaS Sales Team Lead - SMB Market (B2B North America)' (posted 2026-09-30) by TrustAnalytica: 'Experience with the following tools is an advantage: LinkedIn Sales Navigator, Asana, Hubstaff, Slack.' Team of at least 5 PH sales reps, remote then on-site.",
    evidence_quote="Experience with the following tools is an advantage: LinkedIn Sales Navigator, Asana, Hubstaff, Slack",
    source_publication_date="2026-09-30",
    status_reason="Hubstaff listed among tools where experience is 'an advantage' - implies their stack but does not state current use.",
    pitch_angle="Vancouver SaaS with a growing Philippines SDR team (5+ reps) - sales-floor activity tracking and productivity reporting.",
    notes=CK + "Posting fetched 2026-10-07; quote verified. trustanalytica.com 301-redirects to trustanalytica.org (403 to fetch). Searched 'TrustAnalytica Hubstaff OR onlinejobs time tracking', 'TrustAnalytica CEO \"Andrew Us\" Vancouver': CEO not confirmed by any public source; kept from input as unverified. Confidence 55 -> 40 (advantage-only wording).")

F[21] = dict(status="POSSIBLE", confidence_score=35,
    status_reason="Only a March 2024 OnlineJobs.ph post (hire must work with Hubstaff time tracker); company/product 'Construction Site App' (Fort Wayne, IN) has no findable website or newer activity.",
    notes=CK + "Searched '\"Construction Site App\" Fort Wayne software', '\"Construction Site Technologies\" Hubstaff OR onlinejobs': only unrelated construction apps (Sitemate, ConstructApps) and Hubstaff marketing. No contacts found.")

F[22] = dict(status="POSSIBLE", confidence_score=35,
    employee_count="100-200 (We360 case study)",
    employee_count_source_url="https://web.archive.org/web/2024/https://www.we360.ai/case-studies/callarity-private-limited/",
    industry="Contact center / outsourcing (Outsourcing and Offshoring Consulting)",
    hq_country="India (Mumbai)",
    evidence_summary="Archived We360.ai case study 'Data-Driven Success: Callarity Private Limited's Experience with We360.ai': Mumbai contact center, 100-200 staff, onboarded We360.ai activity monitoring and timeline features for agent visibility and salary calculation. Page now removed from we360.ai.",
    evidence_quote="Implementing We360.ai's activity monitoring and timeline features has revolutionized how we understand and maximize team productivity.",
    contacts=[{"name": "Rajesh Satyanarayan Jha", "title": "Director (MCA registry)", "linkedin": "", "source_url": "https://www.thecompanycheck.com/company/callarity-private-limited/U72900MH2020PTC344132"},
              {"name": "Gurjeetsingh Oberoi", "title": "Director (MCA registry)", "linkedin": "", "source_url": "https://www.thecompanycheck.com/company/callarity-private-limited/U72900MH2020PTC344132"}],
    contact_source_url="https://www.thecompanycheck.com/company/callarity-private-limited/U72900MH2020PTC344132",
    status_reason="Vendor story removed from We360 (could mean churn or just site cleanup); no current evidence. Company incorporated 2020-08-20 (CIN U72900MH2020PTC344132).",
    pitch_angle="100-200 seat Mumbai contact center that pays agents from tracked activity; We360 story was pulled - ask whether they still use it.",
    notes=CK + "Archived case study text read via curl (Wayback 2024). callarity.com returns 403 (server up) / TLS error. Searched '\"Callarity\" Mumbai contact center', '\"Callarity\" We360', '\"Callarity Private Limited\" director OR founder'. Director names from search snippet of thecompanycheck.com (page 403 to fetch). No phone/email found.")

F[23] = dict(status="POSSIBLE", confidence_score=20,
    status_reason="Only a logo on insightful.io homepage; alt text 'Point Business Process Partners Logo: Strategic partners delivering tailored business process optimization' looks auto-generated. No company with this exact name found.",
    evidence_quote="Point Business Process Partners Logo: Strategic partners delivering tailored business process optimization",
    notes=CK + "Re-read insightful.io homepage HTML 2026-10-07: logo still present (image Group 3031.svg). Searched '\"Point Business Process Partners\"' and '... Insightful': only Point B, PointSource etc. Identity unresolved; no contacts.")

F[24] = dict(status="DO_NOT_TARGET", confidence_score=0,
    status_reason="lindencare.com is parked: the homepage JS-redirects to /lander, which points to forsale.godaddy.com/forsale/lindencare.com. Company settled False Claims Act (Subsys/fentanyl) for $9M in May 2023 and appears to have ceased operating.",
    second_source_url="https://violationtracker.goodjobsfirst.org/violation-tracker/-linden-care-llc-et-al",
    contacts=[],
    notes=CK + "curl lindencare.com 2026-10-07 -> window.location '/lander' -> GoDaddy for-sale page. Only ActivTrak evidence is the 2020 blog story. Searched '\"Linden Care\" pharmacy Woodbury 2026', '\"Linden Care\" ActivTrak', '\"Linden Care\" ... closed OR settlement'. Contacts removed (company not targetable).")

F[25] = dict(status="POSSIBLE", confidence_score=40,
    status_reason="Live 2026-07-22 OnlineJobs.ph post pays PH contractors via 'Time Doctor (or similar)'; hedged wording and employer cannot be tied to a website or registered company.",
    notes=CK + "Searched '\"Kairos Product Labs\"': only unrelated Kairos firms (Kairos Labs fintech, Kairos facial recognition, Kairos Technologies K-Labs). Kept POSSIBLE; no contacts.")

F[26] = dict(status="POSSIBLE", confidence_score=40,
    employee_count="12 in the Philippines office (case study)",
    employee_count_source_url="https://sprout.ph/customer-stories/terran/",
    evidence_summary="Hubstaff customer story (still live at hubstaff.com/customers/terran, undated; first archived 2020-08): CEO Michael Jackness and Operations Manager Mia Pamisa use Hubstaff for time tracking, screenshots/activity, attendance and PayPal payroll for their Philippines office. Same story republished on sprout.ph.",
    evidence_quote="We have an office over in the Philippines with 12 people, and Hubstaff is a critical part of that management.",
    second_source_url="https://sprout.ph/customer-stories/terran/",
    status_reason="Story still published by Hubstaff but dates from 2020 or earlier; no recent confirmation of use.",
    contacts=[{"name": "Michael Jackness", "title": "CEO", "linkedin": "", "source_url": "https://hubstaff.com/customers/terran"},
              {"name": "Mia Pamisa", "title": "Operations Manager (Philippines)", "linkedin": "", "source_url": "https://hubstaff.com/customers/terran"}],
    contact_source_url="https://hubstaff.com/customers/terran",
    pitch_angle="E-commerce holding co. (ColorIt, Tactical.com, WildBaby; EcomCrew podcast) with a ~12-person Philippines office on Hubstaff for payroll and screenshots - small but warm; EcomCrew audience is a referral channel.",
    notes=CK + "Fetched hubstaff.com/customers/terran (live) and sprout.ph copy. Searched 'Terran Michael Jackness Hubstaff Philippines team 2025', 'EcomCrew Mike Jackness Hubstaff', 'Mike Jackness EcomCrew 2026 Terran': no newer info. Company LinkedIn and support@ecomcrew.com kept from input.")

F[27] = dict(status="POSSIBLE", confidence_score=30,
    employee_count="600+ multilingual specialists (Replicon case study)",
    employee_count_source_url="https://www.replicon.com/wp-content/uploads/2016/07/casestudy-ICUC.pdf",
    hq_country="Canada (Montreal; offices London, New York; earlier Winnipeg)",
    evidence_summary="Replicon case study PDF (uploaded 2016-07): ICUC tried three solutions over six months before choosing Replicon's project/scheduling module with stopwatch time tracking against client projects for its global workforce.",
    source_publication_date="2016-07",
    second_source_url="https://www.replicon.com/wp-content/uploads/2016/07/casestudy-ICUC.pdf",
    status_reason="Only evidence is a 2016 vendor case study; no recent confirmation (Replicon now part of Deltek).",
    contacts=[{"name": "Jan Reischek", "title": "Co-President & Chief Operations Officer", "linkedin": "", "source_url": "https://icuc.social/about-us/"},
              {"name": "Nicole van Zanten", "title": "Co-President & Chief Growth Officer", "linkedin": "", "source_url": "https://icuc.social/about-us/"},
              {"name": "Amanda Wagner", "title": "SVP Operations", "linkedin": "", "source_url": "https://icuc.social/about-us/"}],
    company_phone="1 (800) 710-2713", public_email="sales@icuc.social",
    contact_source_url="https://icuc.social/about-us/",
    pitch_angle="24/7 social moderation firm with 600+ remote multilingual moderators billing time to 200+ client accounts - per-client time + activity proof; legacy Replicon (2016) now under Deltek may be up for review.",
    notes=CK + "Searched 'ICUC social moderation time tracking Replicon 2025', 'ICUC careers moderator remote time tracking OR Replicon OR Hubstaff OR Time Doctor', 'ICUC icuc.social CEO 2026'. About page fetched 2026-10-07 for leadership/contact. Size from case study (dated).")

F[28] = dict(status="POSSIBLE", confidence_score=45,
    evidence_summary="DearDoc logo (alt 'DearDoc') in Apploye homepage 'trusted by' strip; the logo asset ID's embedded timestamp suggests it was added around 2025-10. Logo only - no case study or quote.",
    source_publication_date="2025-10",
    status_reason="Recent vendor logo-wall placement only; no independent source of Apploye use.",
    employee_count="", 
    contacts=[{"name": "Joe Brown", "title": "Founder & CEO", "linkedin": "https://www.linkedin.com/in/josephrbrown/", "source_url": "https://ceoworld.biz/2021/12/14/ceo-spotlight-joe-brown-founder-and-ceo-of-deardoc-on-his-personal-path-to-success/"}],
    contact_source_url="https://getlatka.com/companies/DearDoc",
    pitch_angle="Bootstrapped NY healthcare-marketing SaaS (~$27M 2024 revenue per Latka) with creative/support services teams; on low-cost Apploye - pitch richer analytics.",
    notes=CK + "Re-read apploye.com HTML 2026-10-07: DearDoc logo still present. Searched 'DearDoc Apploye', 'DearDoc jobs remote ... Apploye', 'DearDoc founder CEO Joe Brown'. Founder confirmed by CEOWORLD and Latka; personal LinkedIn kept from input (not re-seen this run). Revenue from Latka snippet.")

F[29] = dict(status="POSSIBLE", confidence_score=40,
    evidence_summary="petshopboxstudio logo (alt 'petshopboxstudio') in Apploye homepage 'trusted by' strip; asset timestamp suggests added around 2026-05. Logo only.",
    source_publication_date="2026-05",
    industry="Illustration, game art, UI/UX and 2D animation studio",
    hq_country="Indonesia (Bandung)",
    public_email="contact@petshopboxstudio.com", company_phone="+62-85-888-999-280 (WhatsApp)",
    contact_source_url="https://petshopboxstudio.com",
    status_reason="Recent vendor logo-wall placement only; no independent confirmation.",
    notes=CK + "Re-read apploye.com HTML: logo present. Site active (Bandung studio). Searched '\"Petshopbox\" Apploye OR time tracking': nothing. Founder name 'Kuswanto' kept from input, not re-confirmed on site. Small studio, size unknown.")

F[30] = dict(status="POSSIBLE", confidence_score=35,
    hq_country="United States (Murray, Utah)",
    status_reason="Only the 2021 Prodoscore case study; no newer evidence. Company is active (Paylocity job ads for Business Formation Specialist; claims 150,000+ businesses formed).",
    second_source_url="https://www.shipoffers.com/partners/prime-corporate-services",
    contacts=[{"name": "Steve Harward", "title": "CEO", "linkedin": "", "source_url": "https://prospeo.io/p/steve-harward-email-and-phone"},
              {"name": "Matthew Harward", "title": "IT Manager (per 2021 Prodoscore case study)", "linkedin": "", "source_url": "https://www.prodoscore.com/resources/case-studies/prime-corporate-services/"}],
    contact_source_url="https://www.zoominfo.com/c/prime-corporate-services-llc/373352241",
    pitch_angle="Utah business-formation/credit/tax services firm with remote sales and service staff; Prodoscore (2021) scores app activity only - pitch time + activity + screenshots.",
    notes=CK + "Searched '\"Prime Corporate Services\" Prodoscore' (no new hits), '... business formation credit tax Utah', '... CEO OR president Murray Utah'. Address 5250 S Commerce Dr Ste 200, Murray UT. CEO name from prospeo search snippet (name/title only). Domain not confirmed (input blank). Paylocity job pages now expired.")

F[31] = dict(status="POSSIBLE", confidence_score=35,
    status_reason="Handbook page requiring Hubstaff (screenshots on, idle removal) is deleted (repo 404); date unknown, probably 2018-2020. No current evidence. Link HackerBay = OneUptime now confirmed.",
    hq_country="United States (Delaware corp.; GitHub org location Boston, MA); OneUptime also listed in London",
    second_source_url="https://oneuptime.com/legal/terms",
    contacts=[{"name": "Nawaz Dhandala", "title": "Founder & CTO", "linkedin": "", "source_url": "https://www.cbinsights.com/company/oneuptime/people"}],
    public_email="hello@hackerbay.io",
    contact_source_url="https://api.github.com/orgs/hackerbay",
    pitch_angle="Open-source observability company with a remote engineering team that once enforced Hubstaff screenshots and idle-time policing.",
    notes=CK + "oneuptime.com/legal/terms says 'HackerBay, Inc. (doing business as OneUptime), Delaware, USA' - link confirmed. gh api: hackerbay/Employee-Handbook 404; hackerbay org has 2 public repos, email hello@hackerbay.io (org profile last updated 2019). gh code search for 'hubstaff' in OneUptime and hackerbay orgs: no hits. Searched 'OneUptime HackerBay Hubstaff', 'OneUptime founder CEO'. Team size unknown (small).")

F[32] = dict(status="POSSIBLE", confidence_score=20,
    status_reason="Only an undated, old FeaturedCustomers testimonial; partneris.lv is active but does not mention Hubstaff.",
    company_phone="+371-29250203",
    contacts=[{"name": "Guntis Endzelis", "title": "Owner (per Hubstaff testimonial)", "linkedin": "", "source_url": "https://www.featuredcustomers.com/vendor/hubstaff/testimonials"}],
    contact_source_url="https://partneris.lv",
    notes=CK + "partneris.lv fetched 2026-10-07: active OpenCart/web-shop developer since 2010; phone +371-29250203 (differs from input +371 20505841); email obfuscated by Cloudflare (input info@partneris.lv kept, not re-seen); Telegram t.me/xguntis consistent with owner Guntis. Searched '\"Guntis Endzelis\" Partneris': only unrelated namesakes. Small agency.")

F[33] = dict(status="DO_NOT_TARGET", confidence_score=10,
    status_reason="Vendor-affiliated: TrueSix is DeskTime's own PR/content agency - truesix.co lists DeskTime as a client with a testimonial from DeskTime CEO Artis Rozentals. The DeskTime case study is co-marketing; a switch pitch is unrealistic.",
    second_source_url="https://truesix.co",
    company_phone="(+371) 261 00 633",
    contacts=[],
    notes=CK + "Fetched truesix.co (active; clients include DeskTime, Catchbox, TestDevLab etc.) and DeskTime case study. Searched 'Julia Gifford DeskTime TrueSix'. Co-founders Krista Krumina and Julia Gifford (Julia was on Printful founding team).")

F[34] = dict(status="DO_NOT_TARGET", confidence_score=0,
    status_reason="Wrong company: the TimeCamp story at /customer-stories/saatchi/ is about M&C Saatchi (a separate agency network), not Saatchi & Saatchi. Re-recorded under M&C Saatchi.",
    notes=CK + "Archived story (Jakub Szyszka, 2019-12-31) read via Wayback: 'M&C Saatchi ... Using TimeCamp since June, 2019 ... Team size 2,000+'; user is Principal Analyst Mike Spencer's analyst team (NY, London, Singapore). See extra M&C Saatchi record.",
    extra=[dict(company_name="M&C Saatchi", company_domain="mcsaatchi.com", industry="Advertising agency network",
        hq_country="United Kingdom (London)", employee_count="2,000+ (TimeCamp story)",
        employee_count_source_url="https://www.timecamp.com/customer-stories/saatchi/",
        vendor="TimeCamp", evidence_type="Vendor case study",
        evidence_summary="TimeCamp customer story (2019-12-31): M&C Saatchi's global analyst team, led by Principal Analyst Mike Spencer (New York, London, Singapore), has used TimeCamp since June 2019 via the Trello power-up to measure time per project. Story later removed/redirected.",
        evidence_quote="Using TimeCamp since June, 2019",
        source_url="https://www.timecamp.com/customer-stories/saatchi/", source_publication_date="2019-12-31",
        second_source_url="https://web.archive.org/web/2021/https://www.timecamp.com/customer-stories/saatchi/",
        status="POSSIBLE", confidence_score=20,
        status_reason="2019 departmental use (one analyst team) in a 2,000+ person network; story removed; no recent evidence.",
        workforce_signals="Distributed analyst team across 3 offices; Trello-based workflow",
        pitch_angle="Enterprise network; only one small team used TimeCamp - low priority.",
        notes="Added in wave-3 re-check of batch possible-12 (input row 'Saatchi & Saatchi' was a misidentification). Large enterprise; no contact research per rules.")])

F[35] = dict(status="POSSIBLE", confidence_score=10,
    industry="AI automation agency (rebranded from Conversion Bug digital marketing agency)",
    hq_country="Offices New York, Dubai, Hyderabad, Sydney",
    status_reason="Only an undated, old FeaturedCustomers Hubstaff testimonial for Conversion Bug; the business has pivoted to an AI agency (MornningStar) with no Hubstaff mention.",
    contact_source_url="https://mornningstar.ai",
    notes=CK + "mornningstar.ai fetched 2026-10-07: active AI agency, hello@mornningstar.ai, offices NY/Dubai/Hyderabad/Sydney; founder not named on homepage. Searched '\"Conversion Bug\" Hubstaff OR time tracking': nothing. Founder/LinkedIn kept from input (input says linked from site), not re-seen this run. Low priority.")

F[36] = dict(status="POSSIBLE", confidence_score=10,
    industry="Full-service marketing agency (web, design, SEO, Shopify/BigCommerce)",
    status_reason="Only an undated FeaturedCustomers testimonial ('Lumia uses Hubstaff every single day'). lumiaagency.com is now a parked domain (redirects to /lander parking page) - agency may be defunct or moved.",
    second_source_url="https://www.featuredcustomers.com/vendor/lumia-agency",
    notes=CK + "curl lumiaagency.com 2026-10-07 -> '/lander' parking page (LANDER_SYSTEM, ap:parking). Searched '\"Lumia Agency\" Louis Morales', '\"Lumia\" agency Hubstaff testimonial COO'. FeaturedCustomers vendor profile describes Lumia Marketing Agency but gives no site/location. Not confirmed lumiaagency.com was its domain. Contact kept from input, unverified. Verify existence before outreach.")

F[37] = dict(status="DO_NOT_TARGET", confidence_score=5,
    status_reason="Company appears defunct: splashopm.com is an empty directory listing and co-founder Derric Haynie lists Vulpine Interactive as a past role (now runs EcommerceTech.io). Only evidence is a 2016 Time Doctor story.",
    second_source_url="https://magemontreal.libsyn.com/what-does-the-future-of-ecommerce-look-like-with-derric-haynie-of-ecommercetechio",
    contacts=[],
    notes=CK + "Searched 'Vulpine Interactive Derric Haynie 2025', '\"Derric Haynie\" Vulpine OR SplashOPM OR \"Ecommerce Tech\"': bios say he 'held executive roles at ... Gorgias, BoxyCharm, and Vulpine Interactive' (past). No current Vulpine site found.")

F[38] = dict(status="POSSIBLE", confidence_score=10,
    status_reason="Only a removed DeskTime case study (last archived 2022-10). toastit.lv is active (full-cycle SEO agency) but has no DeskTime mention.",
    company_phone="+371 28319563",
    contact_source_url="https://toastit.lv",
    notes=CK + "toastit.lv fetched 2026-10-07: active, info@toastit.lv, +371 28319563; owner not named on site (Ivars Scerbakovs kept from input, unverified). Very small Latvian agency; low priority.")

F[39] = dict(status="POSSIBLE", confidence_score=15,
    industry="SEO / digital marketing agency (now 'Zeo', zeo.org)",
    hq_country="Turkey (Istanbul; offices Ankara, London)",
    employee_count="50-95 (Latka/builtin snippets: 95 in 2023, 75, '50+ consultants')",
    employee_count_source_url="https://getlatka.com/companies/zeo.org",
    status_reason="Only a removed pre-2022 Time Doctor case study. SEOzeo rebranded to Zeo (zeo.org); no current Time Doctor evidence.",
    second_source_url="https://zeo.org/team/yigit-konur",
    contacts=[{"name": "Yigit Konur", "title": "Founder & Chief Strategy Officer", "linkedin": "", "source_url": "https://zeo.org/team/yigit-konur"}],
    pitch_angle="50-95 person Istanbul/London SEO agency with remote analysts and 100+ client accounts; used Time Doctor with Slack years ago - client-hour reporting angle.",
    notes=CK + "seozeo.com did not respond; search shows SEOzeo = Zeo Agency (founded 2012, 130 clients, seo.do tool, Digitalzone conference). Searched 'SEOzeo Yigit Konur 2025 agency', 'zeo.org ... Time Doctor OR time tracking', 'Zeo agency CEO Istanbul'. zeo.org/team pages 404 to fetch; title from search snippet. Remote SEO analyst job on remoterocketship. No phone/email found.")

F[40] = dict(status="POSSIBLE", confidence_score=25,
    employee_count="51-200 (LinkedIn snippet)", employee_count_source_url="https://pr.linkedin.com/in/metroitresources",
    hq_country="Puerto Rico (Guaynabo)",
    evidence_summary="Replicon case study 'Metro IT Resources uses web-based time tracking to increase productivity...' (PDF uploaded 2019-08; story itself older): Puerto Rico IT staffing firm adopted Replicon Web TimeSheet (Project & Billing, Time & Attendance) and Web Expense to unify time tracking across PR and US offices.",
    second_source_url="https://de.replicon.com/wp-assets/uploads/2019/08/metroit.pdf",
    status_reason="Stale vendor story (pre-2020); no current evidence. NOTE input domain metroit.com is a different company (SMB IT support 'Metro IT'); real site is metroitresources.com.",
    company_phone="(787) 936-3876",
    contact_source_url="https://www.metroitresources.com/contact",
    pitch_angle="Puerto Rico IT staffing firm (since 1985) placing contract consultants across the US - contractor timesheets/billing; legacy Replicon now under Deltek.",
    notes=CK + "metroit.com fetched: unrelated SMB IT services firm. metroitresources.com is active (IT Staffing, Agile, Pega, PM practices); contact page: P.O. Box 2378 Guaynabo PR 00970, (787) 936-3876; no names/emails. Searched '\"Metro IT Resources\" Replicon OR timesheet', '... Puerto Rico', '... president OR CEO OR founder Guaynabo': no leader found. company_domain kept as input for merge.")

F[41] = dict(status="POSSIBLE", confidence_score=50,
    industry="AI platform / software dev shop (Open-Connect MCP & AI gateway)",
    evidence_summary="hillstreet-ph/open-connect (pushed 2026-10-06) contains hubstaff-admin.server.ts and a 2026-09-22 migration publishing an 'Open Hubstaff Admin Kit' ('Governed Hubstaff organization, workforce, time-tracking, and task administration through the Open-Connect MCP gateway', author 'HillStreet Information Technology Services'). The toolkit registry marks hubstaff_admin as 'connected_read_write' with one admin credential (credential://hubstaff/admin) and health check 'Hubstaff current user and organization inventory'.",
    evidence_quote="Governed Hubstaff organization, workforce, time-tracking, and task administration through the Open-Connect MCP gateway.",
    source_publication_date="2026-09-22",
    second_source_url="https://github.com/hillstreet-ph/open-connect/blob/main/supabase/migrations/20260922113500_hubstaff_admin_open_connect.sql",
    third_source_url="https://github.com/hillstreet-ph/open-connect/blob/main/config/app-toolkits.registry.json",
    status_reason="A single connected Hubstaff admin credential suggests HillStreet connects its own Hubstaff organization, but the kit is also published as a marketplace product, so it may serve customers rather than internal staff.",
    workforce_signals="Philippines tech company; AI agent tooling; size unknown (org is mostly forks, 1 human contributor 'master-kanor')",
    notes=CK + "Inspected via gh api: org 'HILL STREET', Philippines, repos mostly forks of AI tools (open-webui, n8n, litellm, etc.). No credentials recorded. open-connect.site is the product site (no phone/email). Searched '\"HillStreet Information Technology Services\" Philippines': nothing. Likely very small; no contact research.")

F[42] = dict(status="POSSIBLE", confidence_score=35,
    evidence_summary="Workable 'Operational Automations Officer - Remote (Contractor)' (posted 2026-01-04) by Human Intelligence (website shaewellness.com) lists as a must-have 'Experience implementing productivity tools (Clockify, Time Doctor, Hubstaff) and automation monitoring'. Company also hires remote PH roles (remoteleaf).",
    evidence_quote="Experience implementing productivity tools (Clockify, Time Doctor, Hubstaff) and automation monitoring",
    source_publication_date="2026-01-04",
    status_reason="Experience-with requirement naming three tools; does not say which (if any) the company runs.",
    contacts=[{"name": "Matt Riemann", "title": "Founder & CEO (ShaeWellness)", "linkedin": "", "source_url": "https://yscouts.com/?p=15338"}],
    second_source_url="https://remoteleaf.com/company/shaewellness/flutterflow-product-designer-ai-first-mobile-apps-philippines/",
    pitch_angle="AI-first health/education group running global remote contractors (PH, Poland) with a KPI/automation culture and an explicit plan to instrument productivity - in-market for a tracker.",
    notes=CK + "Posting fetched 2026-10-07 (quote verified; pay $1,000-1,500/mo). Searched '\"Shae Group\" OR \"Human Intelligence\" shaewellness Time Doctor OR Hubstaff OR Clockify', 'Shae Wellness founder CEO'. CEO from search snippets (yscouts, company profile). No phone/email found.")

F[43] = dict(status="POSSIBLE", confidence_score=35,
    employee_count="~90 (Hubstaff case study; US HQ + Kolkata office)",
    employee_count_source_url="https://www.casestudies.com/company/hubstaff",
    evidence_summary="Hubstaff case studies listed on casestudies.com: 'Using Hubstaff to Manage an Agency Team of 90 Employees' (Concertium, CEO Pratik Roy Choudhury) and 'Transparent, Profitable Agency Management for 90 Employees with Hubstaff' (Shield Watch, MD Kausik Sarkar). Concertium HQ Tampa with a Kolkata, India office doing web/mobile/marketing delivery. Original Hubstaff pages now 404.",
    second_source_url="https://www.casestudies.com/company/hubstaff",
    third_source_url="https://www.businesswire.com/news/home/20231004494855/en/Concertium-Appoints-New-CEO-and-Expands-Services-Amid-Record-Industry-Demand",
    status_reason="Old (undated, likely 2016-2019) Hubstaff stories, pages removed; leadership changed in Oct 2023 (new CEO Robert Atherton) - current use unknown.",
    contacts=[{"name": "Robert Atherton", "title": "CEO (since Oct 2023)", "linkedin": "", "source_url": "https://www.businesswire.com/news/home/20231004494855/en/Concertium-Appoints-New-CEO-and-Expands-Services-Amid-Record-Industry-Demand"}],
    contact_source_url="https://www.businesswire.com/news/home/20231004494855/en/Concertium-Appoints-New-CEO-and-Expands-Services-Amid-Record-Industry-Demand",
    pitch_angle="Tampa MSP/cybersecurity firm with an offshore Kolkata delivery team that ran Hubstaff for ~90 staff; new CEO since 2023 may be reviewing tooling.",
    notes=CK + "Searched 'Concertium CEO 2026 Tampa cybersecurity', 'Concertium \"Shield Watch\" Hubstaff ...'. hubstaff.com/customers/concertium and /shield-watch return 404. Phone 813-490-4260 and info@concertium.com kept from input (not re-fetched).")

F[44] = dict(status="POSSIBLE", confidence_score=35,
    status_reason="Logo only, inside an EmpMonitor client-logo image (Jan 2026); EmpMonitor's testimonials include placeholder names, so vendor claims are low quality. No independent evidence.",
    contacts=[{"name": "Vinod Nair", "title": "CEO", "linkedin": "", "source_url": "https://www.techjockey.com/brand/practicesuite-inc"}],
    contact_source_url="https://www.bbb.org/us/ca/newark/profile/computer-software-developers/practicesuite-inc-1116-440939",
    pitch_angle="Medical billing SaaS + RCM services provider (92,000+ users, $10B claims/yr) - RCM billing teams are a classic monitored workforce.",
    notes=CK + "Searched 'PracticeSuite EmpMonitor' (nothing), 'PracticeSuite CEO medical billing India offshore employees' (CEO Vinod Nair per search snippet; BBB profile Newark CA). Phone/company LinkedIn kept from input. Offshore staffing not confirmed.")
