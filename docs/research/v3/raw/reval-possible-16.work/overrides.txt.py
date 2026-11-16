OV = {}
EXTRA = {}
OV[("EVM","Toggl Track")] = dict(status="POSSIBLE", confidence_score=15,
  status_reason="Company cannot be identified: 'EVM' with no domain on TheirStack Spain Toggl page; searches only return Earned Value Management (EVM) content.",
  notes="Wave-3 recheck 2026-10-07: searched '\"EVM\" Toggl Track' and 'EVM empresa España Toggl horas' - no company found; 'EVM' is also a common acronym (Earned Value Management), so the TheirStack match may be a false hit. No domain, so liveness could not be checked. No contact research (unidentified). Effectively unworkable lead.")
OV[("UX Insights LLP","Everhour")] = dict(status="POSSIBLE", confidence_score=15,
  status_reason="Company identity not found; only TheirStack UK Everhour page.",
  notes="Wave-3 recheck 2026-10-07: searched '\"UX Insights LLP\"' and '\"UX Insights\" LLP UK Everhour' - no company website or record found (results were AnswerLab, Baymard, Koru UX Design LLP - unrelated). No domain to verify. No contact research.")
OV[("Arete Education","QuickBooks Time")] = dict(status="POSSIBLE", confidence_score=15,
  industry="Higher education group (likely the Global University Systems / Brightstar JV that acquired Study Group) - identity unconfirmed",
  status_reason="Only TheirStack Ireland QuickBooks Time page; company identity ambiguous (several 'Arete Education' entities) and no QuickBooks Time mention found.",
  second_source_url="https://www.studygroup.com/blog/study-group-acquired-by-arete-education",
  notes="Wave-3 recheck 2026-10-07: searched '\"Arete Education\" Ireland QuickBooks' and '\"Arete Education\" Ireland'. Candidates: Arete Education (GUS + Brightstar Capital JV that acquired Study Group - large), Arete Educational Consulting (Cardiff, new 2026), Arete Education Inc (Bronx nonprofit). None linked to QuickBooks Time. Not a remote/BPO fit; no contact research.")
OV[("Blackbaud","Replicon")] = dict(status="POSSIBLE", confidence_score=20, company_domain="",
  source_publication_date="2016-08", second_source_url="https://www.replicon.com/wp-assets/uploads/2016/08/Blackbaud_Casestudy_Updated.pdf",
  evidence_summary="Replicon case study (PDF uploaded 2016-08): Blackbaud's Research, Delivery and Operations division replaced a cumbersome on-prem time system with Replicon to track hours against product development. No newer evidence of use found.",
  status_reason="Explicit but ~10-year-old vendor case study; no 2023+ corroboration.",
  notes="Wave-3 recheck 2026-10-07: searched 'Blackbaud Replicon time tracking' and 'Blackbaud Replicon timesheet employees 2024 OR 2025' - only the 2016 case study PDF; Replicon now part of Deltek. Large company (~3,000 staff), not remote/BPO; no contact research. Domain left blank as in input (blackbaud.com).")
OV[("Zagirova Design (Zagirova)","Time Doctor")] = dict(status="POSSIBLE", confidence_score=35,
  source_publication_date="2024-09-08", evidence_quote="TimeDoctor has been a disaster. I faced random billing charges with no explanation and zero refunds.",
  status_reason="Company-named 2024 Trustpilot complaint proves past paying use; no evidence of current use, and billing dispute suggests they may have left (not stated).",
  unhappy_type="complaint", complaint_category="billing", complaint_summary="Random unexplained billing charges, no refunds, unresponsive support; had to cancel card.",
  complaint_url="https://www.trustpilot.com/review/timedoctor.com?stars=1&stars=2", complaint_date="2024-09-08",
  contacts=[], company_phone="+1 (213) 514-9999", public_email="hi@zagirova.com", contact_source_url="https://zagirova.com",
  pitch_angle="Billing-transparent alternative to Time Doctor for a distributed agency burned by surprise charges.",
  notes="Wave-3 recheck 2026-10-07: Trustpilot review re-seen (dated 2024-09-08; does not say they stopped). Site live, '20+ professionals on staff', hi@ and +1 213 514-9999 on homepage; no leader named on site. Founder Liza Zagirova's own LinkedIn shows she left the director role in 2022, so contact removed (not confirmed in role). Search '\"Zagirova\" \"Time Doctor\"' found nothing else. Below 25 staff threshold for extra contact work.")
OV[("WOW Remote Teams","Hubstaff")] = dict(status="POSSIBLE", confidence_score=40,
  source_publication_date="2026-07-22", evidence_type="Current job posting",
  evidence_quote="Ability to use time-tracking and productivity software such as Hubstaff or an equivalent platform.",
  evidence_summary="Himalayas posting (2026-07-22) for a Leasing Specialist placed with an unnamed real-estate client asks for ability to use Hubstaff or an equivalent platform.",
  status_reason="'Hubstaff or equivalent' wording, and the role is for an unnamed client - does not prove WOW Remote Teams itself uses Hubstaff.",
  contacts=[{"name":"Juli Brown","title":"Founder & CEO","linkedin":"https://www.linkedin.com/in/juli-rey-2a896b108/","source_url":"https://wowremoteteams.com/about-us/"},
            {"name":"Cynthia Tanabe","title":"Chief Operating Officer","linkedin":"https://www.linkedin.com/in/desertviewrealtyllc/","source_url":"https://wowremoteteams.com/about-us/"},
            {"name":"Chris Brown","title":"CTO & Partner","linkedin":"https://www.linkedin.com/in/nbdrcto/","source_url":"https://wowremoteteams.com/about-us/"}],
  employee_count="38 (Built In profile); 11-50 (Himalayas)", employee_count_source_url="https://www.builtincolorado.com/company/wow-remote-teams",
  contact_source_url="https://wowremoteteams.com/about-us/",
  pitch_angle="Staffing firm placing LATAM remote staff with US clients: offer Tavilo as the tracking layer it bundles for clients (white-label/reseller angle).",
  notes="Wave-3 recheck 2026-10-07: posting re-fetched (dated 2026-07-22, client role). Searches '\"WOW Remote Teams\" Hubstaff' and 'wowremoteteams.com jobs Hubstaff' found nothing further. LinkedIn URLs are linked next to names on the company About page (re-confirmed today). Phone (+1 632 232 9177 - odd area code) and info@ email kept from input, not re-checked today.")
OV[("Symbicore Inc.","Screenshot Monitor")] = dict(status="POSSIBLE", confidence_score=20,
  status_reason="TheirStack-only; no Screenshot Monitor mention found.",
  contacts=[{"name":"Donovan Fowke","title":"Founder & CEO","linkedin":"https://www.linkedin.com/in/donovanfowke/","source_url":"https://symbicore.com"}],
  notes="Wave-3 recheck 2026-10-07: site live (copyright 2026), positions as 'outside marketing department' for B2B firms; only contact is Donovan Fowke's Calendly link; no phone/email. Search 'Symbicore \"Screenshot Monitor\" OR screenshotmonitor' found nothing. 13 employees - below threshold for further contact work. LinkedIn kept from input (seen in earlier search result).")
OV[("Virtual Connection Hub","Hubstaff")] = dict(status="POSSIBLE", confidence_score=30,
  status_reason="Single undated Glassdoor employee review names Hubstaff; company identity/website not found, so cannot verify it is alive.",
  notes="Wave-3 recheck 2026-10-07: searched '\"Virtual Connection Hub\" virtual assistant' - only unrelated NiCE 'Virtual Agent Hub', The Virtual Hub, Virtually Connected Solutions. No domain. Review (Glassdoor) not re-fetched (Glassdoor blocks). No contact research (identity unknown, tiny). Complaint in review is from an anonymous worker about monitoring, not a company leader.")
OV[("MyPortal Marketing Inc.","Time Doctor")] = dict(status="POSSIBLE", confidence_score=30,
  status_reason="TheirStack-only; no Time Doctor mention found.",
  contacts=[{"name":"Grant Gooley","title":"Founder","linkedin":"","source_url":"https://myportalmarketing.com/contact/"}],
  company_phone="+1 647-598-0986", public_email="sales@myportalmarketing.com; support@myportalmarketing.com",
  contact_source_url="https://myportalmarketing.com/contact/",
  notes="Wave-3 recheck 2026-10-07: contact page re-fetched (phone, both emails, 20 Bay St 11th Floor Toronto, founder Grant Gooley). Search '\"MyPortal\" \"Time Doctor\" virtual assistants Cebu' found nothing linking them. Sister company MyPortal Virtual Assistants (Cebu) is a plausible Time Doctor user but unproven; consider as separate lead. ~11 staff.")
OV[("Save The Robots","Clockify")] = dict(status="DO_NOT_TARGET", confidence_score=5, contacts=[],
  status_reason="Domain savetherobots.com is parked: the page is only a JavaScript redirect to '/lander' (domain-parking lander), no agency site. Company appears defunct; Clockify evidence was a ~2019 Glassdoor review.",
  notes="Wave-3 recheck 2026-10-07: curl of savetherobots.com returns a bare redirect to /lander (parked). Searches '\"Save The Robots\" agency Clockify' and '\"Save The Robots\" Ullash Tiwari' found nothing current.")
OV[("LA Web Development Firm","Hubstaff")] = dict(status="POSSIBLE", confidence_score=35,
  source_publication_date="2024-02-09",
  status_reason="Company-named 2024 Trustpilot complaint shows use since 2021; strong dissatisfaction and an un-updated site (copyright 2000-2020) make current use uncertain.",
  unhappy_type="complaint", complaint_category="support", complaint_summary="Hubstaff project broke so Jira tickets were not visible; support took ~8 months and called project type unsupported; refund denied; recommends alternatives.",
  complaint_url="https://www.trustpilot.com/reviews/65cb1453313c6d0eaa0b510d", complaint_date="2024-02-09",
  contacts=[], company_phone="(877) 862-4242", contact_source_url="https://lawebdevfirm.com",
  pitch_angle="Hubstaff-Jira sync failures and slow support - pitch reliable Jira integration and responsive support.",
  notes="Wave-3 recheck 2026-10-07: homepage still live with (877) 862-4242 and 500 N. Brand Blvd Ste 2000 Glendale, but copyright 2000-2020 and no named owner; no email. Searches '\"LA Web Dev Firm\" Hubstaff' and '\"Arby Leon\" \"LA Web Development\"' found nothing new, so Arby Leon could not be re-confirmed and was removed from contacts (was named CEO per earlier snippet). Small (<20) agency.")
OV[("Think Visa (Alliance International Migration Services)","Time Doctor")] = dict(status="POSSIBLE", confidence_score=35,
  status_reason="TheirStack-only; careers page lists fully-remote Philippines roles with PC/internet specs but names no tracking tool.",
  contacts=[{"name":"Richard Tan","title":"CEO / Company Owner","linkedin":"https://www.linkedin.com/in/richard-tan-72030188/","source_url":"https://prospeo.io/c/think-visa-email-format"},
            {"name":"Donghua Xu","title":"Leads Think Visa (registered migration agent, 25+ yrs)","linkedin":"","source_url":"https://migratio.com.au/agents/donghua-xu-1910318"}],
  company_phone="+61 3 9078 6819", public_email="support@thinkvisa.com.au; hr@thinkvisa.com.au", contact_source_url="https://thinkvisa.com.au/careers/",
  pitch_angle="Melbourne law firm running fully remote Philippines processing/sales/CSR staff - pitch proof-of-work tracking for offshore team.",
  notes="Wave-3 recheck 2026-10-07: careers page re-fetched: 2 hybrid Melbourne lawyer roles + 3 remote Philippines roles (Processing Officer, Sales Rep, CSR); WhatsApp +61432903718; no monitoring software named. Search '\"Think Visa\" \"Time Doctor\" OR \"time tracking\" Philippines' found nothing. Richard Tan listed as CEO & owner in search snippet (prospeo/datanyze); LinkedIn URL kept from earlier search result 'Richard Tan - Think Visa'. Donghua Xu named as leading Think Visa on migratio.com.au snippet.")
OV[("Sustainable Growth Experts","Time Doctor")] = dict(status="POSSIBLE", confidence_score=20,
  status_reason="TheirStack-only; no Time Doctor mention found.",
  notes="Wave-3 recheck 2026-10-07: site responds (HTTP 200). Search '\"Sustainable Growth Experts\" \"Time Doctor\"' found nothing. 15 employees (below 25) so no further contact work; phone/email from earlier list remain unconfirmed on the current contact page.")
OV[("Maritess Pasag Virtual Assistants","Time Doctor")] = dict(status="DO_NOT_TARGET", confidence_score=5,
  status_reason="Domain maritesspasag.com does not resolve (no DNS, no HTTP response); Time Doctor story was removed (2016-2022). Business appears closed or rebranded.",
  notes="Wave-3 recheck 2026-10-07: curl to maritesspasag.com fails (no DNS answer). Search '\"Maritess Pasag\" OR \"Allie Pasag\" virtual assistant' shows Allie Pasag now presents as CEO of Streamline Mavens (online business management) in 2024 podcasts - possibly a successor business, but no Time Doctor link found; not added as a record.")
OV[("Uplers","Flowace")] = dict(status="POSSIBLE", confidence_score=50,
  source_publication_date="2026-04", evidence_quote="alt=\"Uplers Logo\"",
  evidence_summary="Flowace homepage customer-logo strip includes an image with alt text 'Uplers Logo' (image uploaded 2026-04). No case study or testimonial text about Uplers found.",
  status_reason="Current vendor logo only; logo walls are not proof of current use.",
  contacts=[{"name":"Jaymin Bhuptani","title":"CEO (since Oct 2019)","linkedin":"https://in.linkedin.com/in/jayminbhuptani","source_url":"https://www.affluense.ai/profile/jaymin-bhuptani-uplers-49e2dd"}],
  pitch_angle="Remote-talent marketplace placing Indian engineers with global clients - pitch Tavilo as proof-of-work layer for placed talent.",
  notes="Wave-3 recheck 2026-10-07: curl of flowace.ai confirmed <img alt=\"Uplers Logo\"> in the customer strip (wp-content/uploads/2026/04). Search 'flowace.ai Uplers case study OR testimonial' found none. Uplers contact page returns 403 (no phone/email captured). CEO confirmed by affluense/Owler snippets (CEO since 2019; also co-founded Mavlers 2023). LinkedIn kept from input.")
OV[("Uplers","Hubstaff")] = dict(status="POSSIBLE", confidence_score=20,
  status_reason="TheirStack-only; likely HubSpot/Hubstaff confusion (Uplers is a big HubSpot services shop) - no Hubstaff evidence.",
  contacts=[{"name":"Jaymin Bhuptani","title":"CEO (since Oct 2019)","linkedin":"https://in.linkedin.com/in/jayminbhuptani","source_url":"https://www.affluense.ai/profile/jaymin-bhuptani-uplers-49e2dd"}],
  notes="Wave-3 recheck 2026-10-07: search 'Uplers \"Hubstaff\" time tracking talent' found nothing about Uplers. Uplers does show a 2026 Flowace logo (see Flowace row), which makes Flowace the more likely tracker.")
OV[("Tallyfy","Hubstaff")] = dict(status="POSSIBLE", confidence_score=45,
  source_publication_date="2019-12-30",
  evidence_quote="If we didn't have Hubstaff, it would be chaos. I just literally wouldn't know who is doing what.",
  status_reason="Explicit Hubstaff case story still live on hubstaff.com/customers in 2026, but content dates from 2019; no newer independent evidence.",
  notes="Wave-3 recheck 2026-10-07: hubstaff.com/customers/tallyfy re-fetched - live, quotes co-founder Amit Kothari on time tracking, payroll and invoices for global remote team. site:tallyfy.com Hubstaff search finds no own-use statement. Amit Kothari still CEO (tallyfy.com author pages). Contacts, LinkedIn (linked from Tallyfy About page), phone and email kept from input. Pitch: remote global contractors paid off tracked hours - offer migration from Hubstaff.",
  pitch_angle="Long-time Hubstaff user (2019 story) with global remote contractors paid by tracked time - pitch a modern switch with payroll/invoice export.")
OV[("Hard Hat Helpers","Hubstaff")] = dict(status="POSSIBLE", confidence_score=35,
  evidence_quote="Continuous monitoring of activity, performance, and attendance throughout the day using a third-party platform. (You get access to this).",
  second_source_url="https://hardhathelpers.com",
  status_reason="Hubstaff job-ad mention cannot be re-verified (Foundit 403, no search hits); company site confirms an unnamed third-party activity/attendance monitoring platform, so a competitor tool is in use but which one is unproven.",
  public_email="hello@hardhathelpers.com", contact_source_url="https://hardhathelpers.com",
  pitch_angle="VA staffing firm that sells 'continuous activity, performance and attendance monitoring' to contractor clients - Tavilo can be the client-facing monitoring platform.",
  notes="Wave-3 recheck 2026-10-07: Foundit job page still 403; searches '\"Hard Hat Helpers\" Hubstaff' and '\"Hard Hat Helpers\" job virtual assistant time tracking OR Time Doctor OR Hubstaff' found nothing. Homepage (live) 'Monitoring System' section quoted; homepage text does not name Hubstaff/Time Doctor/Insightful/Teramind/Clockify. Email hello@hardhathelpers.com decoded from site (Cloudflare-protected mailto); no phone on site. Founder Shy Z. Poosti kept from input (RocketReach + LinkedIn search result) - not re-confirmed by today's search.")
OV[("Innovation With Pixels (IWP)","Time Doctor")] = dict(status="POSSIBLE", confidence_score=25,
  status_reason="TheirStack-only; no Time Doctor mention found.",
  notes="Wave-3 recheck 2026-10-07: site live ('AI Automation & Web Development Agency | IWP'), no tracking-tool names in homepage HTML, no email/phone. Search '\"Innovation With Pixels\" \"Time Doctor\" OR \"time tracking\"' found nothing. 17 employees (below 25) - contacts kept from input, no new contact work.")
OV[("Ad-Lab","Hubstaff")] = dict(status="POSSIBLE", confidence_score=20,
  status_reason="TheirStack-only; no Hubstaff mention found; performance-priced agency.",
  public_email="hi@ad-lab.io", contact_source_url="https://www.ad-lab.io/",
  notes="Wave-3 recheck 2026-10-07: site live, hi@ad-lab.io on homepage, no Hubstaff in homepage HTML. Search '\"Ad-Lab\" ad-lab.io Hubstaff OR \"time tracking\" jobs' found nothing. ~10-17 staff (below 25); contacts kept from input.")
OV[("Minty Digital","Hubstaff")] = dict(status="POSSIBLE", confidence_score=20,
  status_reason="TheirStack-only; no Hubstaff mention found.",
  notes="Wave-3 recheck 2026-10-07: mintydigital.com behind Cloudflare challenge (403) so not re-read. Search '\"Minty Digital\" Hubstaff OR \"time tracking\" OR \"Time Doctor\"' found nothing. ~20 staff (below 25); contacts kept from input, not re-confirmed.")
OV[("Concept Me by Nina","Time Doctor")] = dict(status="POSSIBLE", confidence_score=20,
  status_reason="TheirStack-only; no Time Doctor mention found.",
  company_phone="+971 4 323 9707", contact_source_url="https://concept-me.com/",
  notes="Wave-3 recheck 2026-10-07: site live (title 'ConceptMe'), phone +971 4 323 9707 confirmed in homepage tel: link; email not in homepage HTML (info@ kept from input, unconfirmed). Search '\"Concept Me\" Dubai \"Time Doctor\" OR timedoctor' found nothing. ~10 staff; no further contact work.")
OV[("UNBXD (creative agency)","Hubstaff")] = dict(status="POSSIBLE", confidence_score=20,
  status_reason="Only a 2023 generic blog listicle mentioning Hubstaff (no statement of use) plus TheirStack; nothing newer.",
  source_publication_date="2023-09-01",
  notes="Wave-3 recheck 2026-10-07: unbxd.co.uk returned 403 to a scripted fetch (site exists). Search '\"UNBXD\" Poole agency Hubstaff OR \"time tracking\"' found nothing beyond the 2023 listicle. 11-50 staff and 75% remote (company blog) - fits the remote profile, but no director found (input searches returned the unrelated Unbxd Inc.); phone and email kept from input.")
OV[("LDX Digital","Hubstaff")] = dict(status="POSSIBLE", confidence_score=10,
  status_reason="TheirStack-only; and the website is currently unreachable (ldxdigital.io redirects to HTTPS, which fails with a TLS error), so the company may be inactive.",
  notes="Wave-3 recheck 2026-10-07: DNS resolves but https://ldxdigital.io and www. fail TLS handshake (WebFetch and curl). Searches '\"LDX Digital\" Hubstaff OR \"time tracking\" OR Workable' and '\"LDX Digital\" Dubai agency 2026' found nothing. Possible HubSpot/Hubstaff confusion. Verify the company is alive before any outreach; contacts kept from input, not re-confirmed.")
OV[("S&T Properties","Hubstaff")] = dict(status="POSSIBLE", confidence_score=30,
  status_reason="TheirStack-only; no Hubstaff mention found, though the team includes Philippines-based staff.",
  contacts=[{"name":"Svet Pargov","title":"CEO","linkedin":"","source_url":"https://stproperties.com/team/"},
            {"name":"Tina Pargov","title":"Co-Founder","linkedin":"","source_url":"https://stproperties.com/team/"}],
  company_phone="(587) 983-6164", company_linkedin="https://www.linkedin.com/company/s-t-properties",
  contact_source_url="https://stproperties.com/team/",
  workforce_signals="Philippines-based accountants, QA specialist and assistant shift manager on the team page; 24/7 guest-services shifts.",
  pitch_angle="Vacation-rental manager with Philippines-based shift and back-office staff - pitch shift/attendance and activity tracking for offshore staff.",
  notes="Wave-3 recheck 2026-10-07: team page re-fetched - CEO Svet Pargov, Co-Founder Tina Pargov, ~20+ staff including 4 Philippines-based (accountants, Q/A, assistant shift manager); no tracking tool named. Homepage tel (587) 983-6164 and company LinkedIn link confirmed. Searches '\"S&T Properties\" Canmore Hubstaff OR time tracking OR Time Doctor' and '... careers remote Philippines' found nothing. Email hello@stproperties.org from input not seen on site - removed.",
  public_email="")
OV[("Mediboost","Hubstaff")] = dict(status="POSSIBLE", confidence_score=20,
  status_reason="TheirStack-only; no Hubstaff mention found.",
  notes="Wave-3 recheck 2026-10-07: mediboost.com.au behind Cloudflare challenge (site exists). Search 'Mediboost Hubstaff OR \"time tracking\" jobs' found nothing. 22 staff (below 25); contacts kept from input, not re-confirmed.")
OV[("Air Sharks LLC","Time Doctor")] = dict(status="POSSIBLE", confidence_score=15,
  status_reason="TheirStack-only; field HVAC workforce is a poor fit and no Time Doctor mention found.",
  notes="Wave-3 recheck 2026-10-07: airsharks.com live (bot-check page). No new searches found Time Doctor (earlier job ads on-site HVAC roles). 14 staff; contacts kept from input, not re-confirmed.")
OV[("Pure Elements Technologies","Time Doctor")] = dict(status="POSSIBLE", confidence_score=20,
  status_reason="TheirStack-only; no Time Doctor mention found.",
  company_phone="+971 52 674 7295", public_email="sales@petech.ae", company_linkedin="https://www.linkedin.com/company/petechae",
  contact_source_url="https://www.petech.ae/",
  notes="Wave-3 recheck 2026-10-07: input domain pureelements.ae does not respond, but the company is live at petech.ae (title 'Custom Digital Solutions Dubai & Abu Dhabi | Pure Elements', copyright 2025) with sales@petech.ae, tel +971526747295 and LinkedIn company/petechae on the homepage (input phone +44 7360 269978 not seen there). The Manifest lists offices in Dubai and Islamabad (offshore dev team). Search '\"Pure Elements\" petech Dubai \"Time Doctor\"' found nothing. ~20 staff; no decision maker found.")
OV[("WNW Group","Hubstaff")] = dict(status="POSSIBLE", confidence_score=10,
  status_reason="TheirStack-only; website currently unreachable (wnwgroup.co HTTPS fails TLS handshake) and no web footprint found - company may be inactive.",
  notes="Wave-3 recheck 2026-10-07: DNS resolves; http redirects to https which fails with TLS error (curl and WebFetch). Search '\"WNW Group\" ecommerce Melbourne' found nothing. Possible HubSpot/Hubstaff confusion. Verify alive before outreach.")
OV[("Telemarketing Professionals (TEPRO Pty Ltd)","Hubstaff")] = dict(status="POSSIBLE", confidence_score=25,
  status_reason="TheirStack-only; no Hubstaff mention found.",
  notes="Wave-3 recheck 2026-10-07: site returned 406 to scripted fetch (bot filter; site exists). Search '\"Telemarketing Professionals\" Australia Hubstaff OR \"work from home\" callers' found only the company description (founded 2010, local Australian callers) - no Hubstaff. 20 staff (below 25); contacts/phone/email kept from input (confirmed on about page 2026-10-05).")
OV[("Andersen Lab","Hubstaff")] = dict(status="POSSIBLE", confidence_score=15,
  status_reason="TheirStack-only; no Hubstaff mention found. Andersen's only public tracker reference is Time Doctor in an old (c. 2015-16) company deck.",
  notes="Wave-3 recheck 2026-10-07: searches 'Andersen andersenlab Hubstaff developers time tracking' and 'site:andersenlab.com \"Time Doctor\" OR \"Hubstaff\"' found nothing for Hubstaff. Andersen also builds custom time-tracking software for clients (2023 press release for a German manufacturer), which may explain technographic hits. >2,500 staff; contacts kept from input, not re-researched.")
OV[("Innova Solutions","ProHance")] = dict(status="POSSIBLE", confidence_score=15,
  status_reason="TheirStack-only; searches for Innova + ProHance return only the ProHance MRI contrast drug (known trap). No evidence of the workforce-analytics product.",
  notes="Wave-3 recheck 2026-10-07: '\"Innova Solutions\" ProHance' returns only gadoteridol (MRI agent) pages; 'Innova Solutions ProHance productivity tool BPO jobs' returns only ProHance vendor pages. >5,000 staff; no contact research.")
EXTRA["Andersen Lab"] = [dict(
  company_name="Andersen Lab", company_domain="andersenlab.com", industry="IT Services / software outsourcing", hq_country="Poland",
  employee_count="3,500+ (Andersen press release 2023)", employee_count_source_url="https://www.manufacturingdive.com/press-release/20231129-efficient-tracking-of-working-hours-with-andersens-software-solution",
  estimated_tracked_seats="", vendor="Time Doctor", evidence_type="Company documentation",
  evidence_summary="Andersen's own company presentation on SlideShare (financials through 2014, so c. 2015-16) lists 'Transparent development by using Time Doctor' with app/site tracking, workplace video and screen charts as a client-facing feature.",
  evidence_quote="Transparent development by using Time Doctor: most used apps, sites visited, working place video, screen charts",
  source_url="https://www.slideshare.net/slideshow/andersencompany-presentationeng-60713110/60713110", source_publication_date="2016",
  second_source_url="", third_source_url="", first_detected_date="", last_detected_date="", theirstack_jobs_count="",
  status="POSSIBLE", status_reason="Explicit but ~10-year-old company deck; no current evidence of Time Doctor use.", confidence_score=25,
  unhappy_type="", complaint_category="", complaint_summary="", complaint_url="", complaint_date="", left_tool="", now_tool="",
  workforce_signals="3,500+ outstaffed developers billed by hour; historically offered clients activity tracking and workplace video.",
  contacts=[{"name":"Alexandr Khomich","title":"Founder & CEO","linkedin":"https://cy.linkedin.com/in/a-khomich","source_url":""}],
  company_linkedin="https://www.linkedin.com/company/andersen-softwaredev", company_phone="", public_email="", contact_source_url="",
  pitch_angle="Outstaffing firm that historically sold Time Doctor-based 'transparent development' to clients - pitch Tavilo as the modern client-facing proof-of-work layer.",
  notes="New row found in wave-3 recheck 2026-10-07 while checking the Hubstaff row. SlideShare deck text re-fetched. >2,500 staff; contact kept from input row, not re-researched.")]
OV[("Positive Business Online (now SmashGo)","Time Doctor")] = dict(status="POSSIBLE", confidence_score=35,
  source_publication_date="2023-12",
  evidence_quote="It saves time from the perspective that I don't have to go through various spreadsheets.",
  status_reason="Explicit Time Doctor case study still live, but the agency has since become SmashGo, a founder-led coaching/consulting brand; no sign of a tracked team today.",
  contacts=[{"name":"Nik Cree","title":"Founder (SmashGo; formerly Positive Business Online)","linkedin":"https://www.linkedin.com/in/nikcree/","source_url":"https://smashgo.co/"}],
  contact_source_url="https://smashgo.co/",
  notes="Wave-3 recheck 2026-10-07: Time Doctor case study re-fetched (live; 1-25 staff; time per client led to 30% price rise). smashgo.co live (copyright 2026, 'Digital Strategy, Coaching & Consulting') and links Nik Cree's LinkedIn (/in/nikcree) - LinkedIn now confirmed from the company site. Search '\"Nik Cree\" SmashGo OR \"Positive Business Online\" 2026' shows him as SmashGo founder and podcast host. No phone/email on site. Tiny; low priority.")
OV[("GENESIX","Hubstaff")] = dict(status="DO_NOT_TARGET", confidence_score=10,
  source_publication_date="2019-09",
  status_reason="Company website genesix.pro now returns '404 page not found'; the Hubstaff-Azure DevOps sync repo was last committed 2019-09-03 (repo pushed 2023-01); Russia-based (Kaliningrad), so sales/payment are likely restricted.",
  notes="Wave-3 recheck 2026-10-07: GitHub API: org GENESIX (blog genesix.pro, Kaliningrad), repo created 2019-07-04, last commit 2019-09-03. genesix.pro https/http both 404. A GENESIX front-end vacancy on career.habr.com exists (undated in snippet), so the team may still exist, but with a dead site, 2019-only evidence and Russia location it is not a workable lead.")
OV[("Shoutify Me","Hubstaff")] = dict(status="POSSIBLE", confidence_score=20,
  status_reason="TheirStack-only; searches show HubSpot certification, not Hubstaff - likely HubSpot/Hubstaff confusion.",
  notes="Wave-3 recheck 2026-10-07: shoutifyme.com responds 200 (content rendered by JS; no tools/contacts in HTML). Search '\"Shoutify Me\" Hubstaff OR \"time tracking\"' found nothing. ~13 staff (below 25); contacts kept from input (CEO page shoutifyme.com/our-ceo/), not re-confirmed.")
OV[("Drop Zero Digital","Hubstaff")] = dict(status="POSSIBLE", confidence_score=20,
  status_reason="TheirStack-only; no Hubstaff mention found.",
  notes="Wave-3 recheck 2026-10-07: dropzerodigital.com live (bot-check page). Search '\"Drop Zero Digital\" Hubstaff OR \"time tracking\" OR Dynamite Jobs' found nothing. <10 staff; contacts kept from input.")
OV[("AlgaWorks","Hubstaff")] = dict(status="POSSIBLE", confidence_score=15,
  status_reason="TheirStack-only; no Hubstaff mention found; online course company is a weak fit.",
  public_email="contato@algaworks.com", contact_source_url="https://www.algaworks.com/",
  notes="Wave-3 recheck 2026-10-07: algaworks.com live; contato@algaworks.com and LinkedIn company/algaworks in homepage HTML; no tracking tools named. Search 'AlgaWorks Hubstaff' found nothing. ~11 staff; contacts/phone kept from input.")
OV[("DABLTECH LTD","Screenshot Monitor")] = dict(status="POSSIBLE", confidence_score=15,
  status_reason="TheirStack-only; no Screenshot Monitor mention found.",
  notes="Wave-3 recheck 2026-10-07: dabltech.co.il live ('DABLTECH LTD | Monetizing the web', copyright 2026), no tools or contacts in HTML. Search '\"DABLTECH\" \"Screenshot Monitor\"' found nothing. ~14 staff; no contact work.")
OV[("RemotelyTalents","Hubstaff")] = dict(status="POSSIBLE", confidence_score=25,
  status_reason="Earlier Hubstaff requirements were in now-expired postings for unnamed client companies; the 7 current postings (Jul-Oct 2026) do not mention Hubstaff or any tracker. Recruiter-only firm, so Hubstaff belonged to clients.",
  notes="Wave-3 recheck 2026-10-07: careers.remotelytalents.com/jobs lists 7 openings (req IDs 26071701-26100501); full text of each scanned - no Hubstaff/Time Doctor/time-tracking mention. Search 'RemotelyTalents Hubstaff job 2026' found nothing. ~5-person recruiter (below 25); contacts kept from input (founder LinkedIn seen in search result).")
OV[("SHS Advisory Group","DeskTime")] = dict(status="POSSIBLE", confidence_score=15,
  status_reason="TheirStack-only; no DeskTime mention found; small advisory firm, weak fit.",
  company_phone="+91 94452 24631", public_email="shsfinancial@shsadvisorygroup.com", contact_source_url="https://www.shsadvisorygroup.com/",
  notes="Wave-3 recheck 2026-10-07: site live (copyright 2025); phone and email confirmed in homepage HTML. Search '\"SHS Advisory\" DeskTime' found nothing. Not remote/BPO; contacts kept from input.")
OV[("LinkYou Inc.","Hubstaff")] = dict(status="POSSIBLE", confidence_score=15,
  status_reason="TheirStack-only; no Hubstaff mention found. Note a similarly named Ukrainian agency 'LinkUp' is a real Hubstaff case study - possible name mix-up in technographic data.",
  company_phone="+1 647 988 2333", public_email="info@linkyou.ca", contact_source_url="https://linkyou.ca/en",
  notes="Wave-3 recheck 2026-10-07: linkyou.ca live ('Software Development, AI & Cybersecurity Solutions'); info@ and +16479882333 in homepage HTML. Search '\"LinkYou\" Hubstaff' returns only hubstaff.com/customers/linkup (different company). Very small firm; contacts kept from input (CEO identity conflicting across directories).")
OV[("Grupo Xcaret","Teramind")] = dict(status="POSSIBLE", confidence_score=20,
  status_reason="TheirStack-only; no Teramind job, review or case study found.",
  notes="Wave-3 recheck 2026-10-07: search '\"Grupo Xcaret\" OR \"Experiencias Xcaret\" Teramind' returned only company history pages. >2,500 staff; contacts kept from input, no new contact work.")
OV[("Supergasbras Energia Ltda","Teramind")] = dict(status="POSSIBLE", confidence_score=20,
  status_reason="TheirStack-only; no Teramind mention found.",
  notes="Wave-3 recheck 2026-10-07: search 'Supergasbras Teramind' returned only Teramind product pages. 2.7k staff, not remote/BPO; contacts kept from input, not re-researched.")
OV[("1UP Digital Marketing","Hubstaff")] = dict(status="POSSIBLE", confidence_score=15,
  status_reason="TheirStack-only; tech-stack listings show HubSpot - likely HubSpot/Hubstaff confusion.",
  public_email="optimization@1updigitalmarketing.com", company_linkedin="https://www.linkedin.com/company/1up-digital-marketing",
  contact_source_url="https://1updigitalmarketing.com/",
  notes="Wave-3 recheck 2026-10-07: site live (copyright 2026); email and company LinkedIn found in homepage HTML; no tracking tools named. Search '\"1UP Digital Marketing\" Hubstaff' found only a job post with no Hubstaff mention. <10 staff.")
OV[("Pyramid Consulting, Inc.","ProHance")] = dict(status="POSSIBLE", confidence_score=15,
  status_reason="TheirStack-only; staffing firm whose job ads describe client environments; no ProHance mention found.",
  notes="Wave-3 recheck 2026-10-07: search '\"Pyramid Consulting\" ProHance' returned only company directory pages (6,500+ consultants, brands Pyramid Talent, Celsior, GenSpark). >2,500 staff; no contact work.")
OV[("Setsail Marketing","Everhour")] = dict(status="POSSIBLE", confidence_score=20,
  status_reason="TheirStack-only (Everhour Chile page); no Everhour mention found.",
  company_phone="604-484-0651; 503-342-8868", public_email="team@setsail.ca", company_linkedin="https://www.linkedin.com/company/setsailmarketing",
  contact_source_url="https://www.setsail.ca/",
  notes="Wave-3 recheck 2026-10-07: setsail.ca live (Vancouver PPC/digital agency, copyright 2025); phones, team@setsail.ca and company LinkedIn in homepage HTML (a personal LinkedIn /in/jasonatakhanov is also linked on the site, role not stated - not added as decision maker). Search '\"Setsail\" marketing Everhour OR \"time tracking\"' found nothing. ~20 staff.")
