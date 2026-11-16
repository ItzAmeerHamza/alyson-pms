D = "2026-10-07"
def P(score, notes, **kw):
    d = {"status": "POSSIBLE", "confidence_score": score,
         "status_reason": "Only TheirStack technographic signal; no first-party or independent confirmation found in re-check " + D + ".",
         "notes": notes}
    d.update(kw); return d
def X(reason, notes="", **kw):
    d = {"status": "DO_NOT_TARGET", "confidence_score": 5, "status_reason": reason, "notes": notes}
    d.update(kw); return d
O = {}
EXTRA = []
O["Frankton Group Ltd"] = P(25, "Searched '\"Frankton Group\" Connecteam' and 'Frankton Group security jobs Connecteam app clock in': no mention of Frankton Group using Connecteam. UK security/guarding firm (~68) - deskless guards fit Connecteam's security vertical, so plausible but unconfirmed. No contact research (no remote/BPO/offshore team; field guards).", workforce_signals="Security guarding (deskless field staff)")
O["GSC Grays"] = P(20, "Searched '\"GSC Grays\" Connecteam' and 'GSC Grays careers job Connecteam app': nothing links GSC Grays to Connecteam. Rural chartered surveyors / estate agency (UK, ~106) - office-based professionals, weak fit for Connecteam. No contact research.")
O["Grapefruit"] = P(15, "Searched 'Grapefruit Romania agency Connecteam' and generic Connecteam queries: no link. Grapefruit (Romanian UX/digital agency, 26 yrs, now part of RCI Holding) is an office/digital firm - weak fit for deskless Connecteam; generic name, no domain in input, so the TheirStack match itself is uncertain. No contact research.")
O["Hera Beauty"] = P(20, "Searched '\"Hera Beauty\" Connecteam' and 'Hera Beauty ... job \"Connecteam\"': no mention. Hera Beauty Ltd is a live Peterborough (UK) personal-care contract manufacturer with current job ads on CV-Library (2026); factory staff make Connecteam plausible but unconfirmed. No contact research (not remote/BPO/agency).", second_source_url="https://www.cv-library.co.uk/list-jobs/466972/Hera-Beauty")
O["join.com"] = X("JOIN (join.com) is a recruiting / job-multiposting platform. The TheirStack 'Connecteam' hit is most likely a misattribution from customers' job ads hosted on join.com rather than JOIN itself using Connecteam; JOIN is a ~270-person Berlin software company with no deskless workforce. Searches '\"join.com\" Connecteam' and 'JOIN recruiting platform Connecteam integration' found no evidence of JOIN using Connecteam.", "Also an HR-tech vendor (ATS) - not a buyer profile for Tavilo.")
O["KABAM Robotics"] = P(15, "Searched '\"KABAM Robotics\" Connecteam': only company profile pages (Singapore security-robotics maker, founded 2020). No evidence of Connecteam use; small engineering firm, weak fit. No contact research.")
O["Love, Bonito"] = P(20, "Searched '\"Love Bonito\" Connecteam': no link found. Singapore fashion retailer (~900) with store staff - Connecteam plausible for retail shift staff but unconfirmed. Not remote/BPO; no contact research.", workforce_signals="Retail store staff (SG/MY)")
LOGO_RETAIL = "https://connecteam.com/industries/retail-app"
O["Love, Bonito"] = dict(status="PROBABLE", confidence_score=60,
  evidence_type="Vendor testimonial/logo",
  evidence_summary="Connecteam lists 'Love, Bonito' among customer logos on its retail-app industry page and on the connecteam.com homepage (retail section), fetched " + D + "; TheirStack also lists Love, Bonito as a Connecteam user.",
  source_url=LOGO_RETAIL, source_publication_date="2026-10", second_source_url="https://connecteam.com/", third_source_url="https://theirstack.com/en/technology/connecteam/sg",
  status_reason="Vendor logo wall (current Connecteam pages) + TheirStack signal; no first-party or employee confirmation, so PROBABLE not CURRENT.",
  workforce_signals="Omnichannel womenswear retailer; physical stores in SG/MY/ID - deskless store staff (Connecteam use is likely store shift/time clock, not desk monitoring).",
  contacts=[{"name":"Dione Song","title":"CEO","linkedin":"","source_url":"https://www.marketing-interactive.com/love-bonito-chief-commercial-officer-leadership-promotions"},
            {"name":"Rachel Lim","title":"Co-founder","linkedin":"","source_url":"https://www.marketing-interactive.com/love-bonito-chief-commercial-officer-leadership-promotions"}],
  company_phone="+65 6844 8914", contact_source_url="https://salestools.io/nl/report/love-bonito-headquarters",
  pitch_angle="Already pays for Connecteam for store staff; pitch Tavilo for HQ/e-commerce/design teams that need desktop time and productivity tracking, or as a combined attendance + activity tool.",
  notes="Searches: '\"Love Bonito\" Connecteam' (no first-party hit); Connecteam retail page and homepage both show the Love, Bonito logo. CEO per Dec-2022 article (Dione Song, CEO since 2021); a prospeo snippet names an 'Alison Lee' as CEO - unverified, so not recorded. Phone/HQ (115 Eunos Ave 3, SG) from a third-party listing (salestools.io), not the company site. Logo walls can be stale; confirm in outreach.")
O["RETAILORS"] = dict(status="PROBABLE", confidence_score=62,
  evidence_type="Vendor testimonial/logo",
  evidence_summary="Connecteam's retail-app page shows a 'Retailors (Europe)' customer logo (fetched " + D + "). Connecteam also features FOX Group (Israel; Retailors is the Fox-linked Nike/Foot Locker franchise operator) as a retail testimonial. TheirStack lists RETAILORS as a Connecteam user on 6 pages.",
  source_url=LOGO_RETAIL, source_publication_date="2026-10", second_source_url="https://connecteam.com/retail-companies-choose-connecteam/", third_source_url="https://theirstack.com/en/technology/connecteam",
  status_reason="Current vendor logo wall + TheirStack (6 pages) + group-level Connecteam testimonial (FOX Group); no first-party statement.",
  hq_country="Israel",
  workforce_signals="Nike/Foot Locker/Converse/Samsung franchise retailer: 292 stores in 21 countries (Canada, Israel, Europe, Australia/NZ) - large deskless store workforce.",
  contacts=[{"name":"Tomer Alfred Czapnik","title":"CEO","linkedin":"","source_url":"https://sg.finance.yahoo.com/quote/RTLS.TA/profile"}],
  company_phone="+972 3 905 0231", contact_source_url="https://sg.finance.yahoo.com/quote/RTLS.TA/profile",
  pitch_angle="Multi-country store estate already on Connecteam for frontline staff; pitch Tavilo for regional/HQ office and e-commerce teams (time + productivity analytics), not for store floors.",
  notes="Input said HQ Netherlands; retailors.com says Retailors Ltd is TASE-listed (ticker 1908/RTLS), HQ 6 Hermon, Airport City, Israel; 'Retailors Europe' is the European arm. Phone/CEO from Yahoo Finance profile. Searches: '\"Retailors\" Connecteam' -> Connecteam retail page logo.")
O["waterdrop®"] = dict(status="PROBABLE", confidence_score=60,
  evidence_type="Vendor testimonial/logo",
  evidence_summary="Connecteam shows a 'Waterdrop' customer logo on its retail-app page and homepage (fetched " + D + "); TheirStack also lists waterdrop as a Connecteam user.",
  source_url=LOGO_RETAIL, source_publication_date="2026-10", second_source_url="https://connecteam.com/", third_source_url="https://theirstack.com/en/technology/connecteam/at",
  status_reason="Vendor logo wall + TheirStack; not confirmed first-party (store-manager job ads on Teamtailor were gone/410 when fetched).",
  workforce_signals="~50 own stores in Europe/US/Japan/Australia plus D2C; store staff; 400+ employees; raised >EUR100m in 2026 to expand retail.",
  contacts=[{"name":"Martin Murray","title":"Founder & CEO (Geschaeftsfuehrer)","linkedin":"","source_url":"https://www.wirtschaftsforum.de/waterdrop-microdrink-gmbh"}],
  company_phone="+43 800 6566500", public_email="info@waterdrop.com", contact_source_url="https://www.wirtschaftsforum.de/waterdrop-microdrink-gmbh",
  pitch_angle="Fresh EUR100m+ round (2026) to scale retail and local teams; pitch Tavilo for HQ/remote D2C, marketing and customer-care teams alongside existing Connecteam store tooling.",
  notes="Domain blank in input; brand site is waterdrop.com (Waterdrop Microdrink GmbH, Laimgrubengasse 14, 1060 Wien). Phone/email are from a business-directory listing of the company (wirtschaftsforum.de), not fetched from waterdrop.com itself. Funding: retaildive.com press release 2026-05-06.")
O["Saint-Gobain"] = dict(status="PROBABLE", confidence_score=50,
  evidence_type="Vendor testimonial/logo",
  evidence_summary="Connecteam's manufacturing-app page lists 'Saint Gobain' (and Saint-Gobain subsidiary CertainTeed) among customer logos (fetched " + D + "); TheirStack also lists Saint-Gobain as a Connecteam user.",
  source_url="https://connecteam.com/industries/manufacturing-app/", source_publication_date="2026-10", second_source_url="https://theirstack.com/en/technology/connecteam/fr",
  status_reason="Vendor logo wall + TheirStack. For a 170k-employee group this almost certainly means one site/business unit, not group-wide; buyer unknown.",
  workforce_signals="Global building-materials manufacturer; plant/shift workers.",
  pitch_angle="Enterprise - only worth pursuing at the business-unit level that uses Connecteam; low priority for Tavilo's desk-activity product.",
  notes="Searched '\"Saint-Gobain\" Connecteam' via Connecteam industry pages. No contact research: enterprise group, user site unknown.")
O["Tennessee Performing Arts Center"] = dict(status="PROBABLE", confidence_score=75,
  evidence_type="Current job posting",
  evidence_summary="TPAC job ads (Stagehand; Lead Event Technical Director) list 'Software and Services Used' including ADP Workforce Now, Microsoft Suite, Concur, Momentus Elite and Connecteam.",
  evidence_quote="", source_url="https://www.mediabistro.com/jobs/3542058514-stagehand", source_publication_date="2026",
  second_source_url="https://www.mediabistro.com/jobs/3541919549-stagehand", third_source_url="https://playbill.com/job/lead-event-technical-director/33f202c3-b5d3-43f5-9e4d-a717f8ba0375",
  status_reason="Employer's own job ads name Connecteam as software used (likely for part-time stagehand/event staff scheduling and time clock).",
  workforce_signals="Large part-time/hourly event workforce (stagehands, ushers); ~500 performances/yr.",
  contacts=[{"name":"Jennifer Turner","title":"President & CEO","linkedin":"","source_url":"https://capitalanalyticsassociates.com/jennifer-turner-president-ceo-tennessee-performing-arts-center/"}],
  company_phone="615-782-4040", contact_source_url="https://www.tpac.org/",
  pitch_angle="Uses Connecteam for hourly event crews and ADP for payroll; pitch Tavilo for admin/box-office/marketing staff time and productivity tracking with ADP export.",
  notes="Job pages returned 405/404 when fetched; evidence from search snippets (query 'TPAC Nashville job \"Connecteam\"' and '\"Tennessee Performing Arts Center\" stagehand \"Connecteam\" \"ADP Workforce Now\"'). Posting date not visible; ads appear 2026. Phone is the box office number (tpac.org footer); address 505 Deaderick St, Nashville. TPAC was recruiting a VP of HR in Apr 2026 (tnnonprofits.org) - new HR leader may be revisiting tools.")
O["NTI"] = P(15, "Searched 'NTI Netherlands e-learning Connecteam' and Connecteam customer/industry pages: no link. NTI (nti.nl) is a Dutch distance-learning provider (~840) - office/remote tutors, weak fit for deskless Connecteam; TheirStack hit may be a name collision. No contact research.")
O["Puppy Sphere"] = P(25, "Searched '\"Puppy Sphere\" Connecteam' and site:connecteam.com: nothing. Puppy-yoga studio chain (13 studios in North America) with hourly studio staff - Connecteam plausible but unconfirmed. Not remote/BPO; no contact research.", workforce_signals="Multi-location studios, hourly staff")
O["RBG SECURITY INC"] = P(20, "Searched '\"RBG Security\" Connecteam' and Connecteam security-industry page logos (not listed). No domain in input; Canadian guard company - fits Connecteam's security vertical but unconfirmed. No contact research.")
O["Time+Tide Watches"] = P(15, "Searched site:connecteam.com for Time+Tide: nothing. Australian watch media publisher (~42) with a Melbourne retail boutique; small, weak fit. No contact research.")
O["Tourism Kingston"] = P(15, "Searched '\"Tourism Kingston\" Connecteam': only its annual plans/AGM docs, no Connecteam mention. Small DMO (~25) in Kingston, Ontario; may employ seasonal visitor-centre/tour staff. No domain in input (site is visitkingston.ca). No contact research.")
O["QATestLab"] = P(15, "Searched 'QATestLab Replicon time tracking' and 'qatestlab.com \"Replicon\"': no link. QATestLab (QA outsourcing, Ukraine/Cyprus, ~170) - a remote/offshore testing workforce, good Tavilo fit in principle, but no Replicon evidence (earlier validation 2026-10-05 also found none). Contact research skipped: no confirmed tool; could be added if prioritised.", workforce_signals="QA outsourcing / offshore testing teams")
O["Sourcebae"] = P(10, "Searched 'Sourcebae Replicon' and 'sourcebae.com job \"Replicon\"': only biology 'replicon' and Replicon's own jobs. Sourcebae is a remote-developer hiring marketplace (India); TheirStack hit likely comes from client job ads it hosts (e.g. roles requiring Replicon), not its own use. Treat as near-false match. No contact research.", workforce_signals="Remote developer staffing marketplace")
O["5 Points Electrical"] = P(20, "Searched '\"5 Points Electrical\" busybusy' and busybusy customer pages: no mention. Atlanta electrical contractor (~200, Norcross GA) actively hiring field electricians (CareerBuilder) - busybusy fits construction field crews but unconfirmed. No contact research (field crews, not remote/BPO).")
O["Advanced Roofing"] = P(20, "Searched '\"Advanced Roofing\" busybusy' and busybusy customer stories: nothing. Advanced Roofing Inc (FL commercial roofing/electrical/HVAC, est. 1983, ~500) - field crews fit busybusy; unconfirmed. No contact research.")
O["Align"] = X("Name collision: busybusy is made by 'Align Technologies' (St. George, UT) - TheirStack appears to have attached the vendor's own parent name to Align (align.com, an unrelated IT services firm). No evidence that align.com uses busybusy.",
  "Search 'align.com \"busybusy\"' -> forconstructionpros.com lists 'busybusy by Align Technologies'.", source_url="https://www.forconstructionpros.com/construction-technology/company/21001451/busybusy-by-align-technologies")
O["Capozza Floor Covering Center"] = P(15, "Searched '\"Capozza\" busybusy time tracking': nothing. Small flooring retailer/installer (~33); no domain in input. No contact research.")
O["Gallo Construction Corporation"] = P(15, "Searched '\"Gallo Construction\" busybusy': nothing; several unrelated 'Gallo Construction' firms exist (NY, AZ, MA). Input domain gallogc.com. No contact research.")
O["Silver Creek Modular"] = P(15, "Searched '\"Silver Creek Modular\" busybusy': nothing. Silver Creek Modular (CA modular school buildings, Webb Investments) - factory + site crews; unconfirmed. No contact research.")
O["Savance"] = P(35, "Careers page (savance.com/careers/implementation-technical-resource/) previously seen via search snippet listing Everhour among preferred tools with Asana, Google Workspace, Azure; in this re-check the page and /careers/ returned empty content and a search ('Savance \"Everhour\" careers Implementation Technical Resource') did not resurface it. Kept POSSIBLE: a skills list in an ad is not proof of internal use, though a 30-person firm naming Everhour suggests it. Savance makes EIOBoard in/out-board software (adjacent, not a Tavilo competitor). No contact research (<25-person-range fit and not remote/BPO).",
  evidence_type="Older job posting", status_reason="Own job ad lists Everhour as a preferred tool (snippet only, not re-fetchable); not confirmed as current internal use.")
O["Feedonomics"] = P(30, "Searched 'Feedonomics Toggl time tracking' and '\"Feedonomics\" \"Toggl\" job OR careers': only TheirStack pages; no first-party mention. Feedonomics (product-feed management, ~350, fully remote per FlexIndex/careers) is a BigCommerce/Commerce subsidiary since 2021. Contacts: Sharon Gee is SVP & GM of Feedonomics per search snippet (BigCommerce press). Email/phone not found on own site.",
  workforce_signals="Fully remote workforce (FlexIndex); full-service feed management teams",
  contacts=[{"name":"Sharon Gee","title":"SVP & General Manager, Feedonomics","linkedin":"","source_url":"https://www.bigcommerce.com/press/releases/amer-customer-and-partner-awards/"}],
  company_linkedin="https://www.linkedin.com/company/feedonomics", contact_source_url="https://www.bigcommerce.com/press/releases/amer-customer-and-partner-awards/",
  pitch_angle="Fully remote services team inside BigCommerce; pitch remote-team time + productivity visibility. Procurement may sit with parent.")
O["HCM Unlocked"] = P(25, "Searched '\"HCM Unlocked\" Everhour': no first-party mention; only the LeadIQ aggregator snippet from input. HCM Unlocked (Miami, founded 2018; payroll/HR managed services and tech consulting, ~240). No contact research done beyond this (fit unclear: not confirmed remote/BPO).")
O["Margo Conseil"] = P(20, "Searched 'Margo conseil Replicon feuille de temps' and '\"Margo\" consulting Paris \"Replicon\"': no mention. Margo (Paris IT consultancy, ~260 in France; offices Paris/London/Warsaw) - consultants on client sites; Replicon plausible but unconfirmed. No contact research (not remote/BPO).")
O["Clinovations"] = P(20, "Harvest story still live: CEO/co-founder Dr. Trenor Williams quoted - 'Harvest is our anchor...' - at 70 staff. That Clinovations was acquired by The Advisory Board Company in Feb 2015 (~90 staff; healthcareitnews.com), so the story predates 2015 and the original firm no longer exists independently. A separate firm, Clinovations Government + Health (Washington DC, CEO Anita Samarth), still operates; no evidence it uses Harvest. Kept POSSIBLE at low confidence; arguably DO_NOT_TARGET for the original entity.",
  evidence_type="Vendor case study", source_url="https://www.getharvest.com/customers/clinovations", second_source_url="https://healthcareitnews.com/news/advisory-board-acquires-clinovations",
  status_reason="Pre-2015 vendor story about a firm that was acquired in 2015; successor/spin-off use unconfirmed.")
O["Beacon Health (IT)"] = P(35, "ClickTime case study still live: 'ClickTime Empowers Beacon Health IT to Track Their Time Spent on Support Tickets' - 80+ IT employees across 6 campuses; quote from Carmen Cast, Director of Business Applications. Undated, content appears pre-2022. No newer confirmation found (search 'Beacon Health System ClickTime IT time tracking Carmen Cast'). Health system is large (>2,500), so no contact research per spec; Carmen Cast not re-confirmed in role.",
  evidence_type="Vendor case study", source_url="https://www.clicktime.com/case-studies/beacon-health",
  status_reason="Older, undated vendor case study; current use not re-confirmed.")
O["Artemis Digital"] = P(25, "Searched '\"Artemis Digital\" Everhour' and 'Artemis Digital agency Australia job time tracking Everhour': no mention. Boutique digital agency founded 2020 with offices in Melbourne and Ho Chi Minh City (offshore Vietnam team per syncgtm.com directory) - good Tavilo fit. artemisdigital.com returned empty content when fetched; no phone/email/DM found on own site.",
  workforce_signals="Agency with offshore delivery team in Ho Chi Minh City, Vietnam",
  company_linkedin="https://au.linkedin.com/company/artemis-digital-marketing", contact_source_url="https://syncgtm.com/directory/agency/artemis-digital",
  pitch_angle="AU agency with offshore Vietnam staff - remote-team activity and billable-hours tracking.")
O["Ambrosys"] = P(20, "Searched 'Ambrosys clockodo Zeiterfassung' and 'ambrosys.de Stellenanzeige clockodo OR Zeiterfassung': nothing. German AI/data R&D firm (~38); clockodo is a distinctive tool name so the TheirStack hit is plausible, but unconfirmed. No contact research (not remote/BPO/agency).")
O["Codit"] = P(15, "Searched 'Codit Replicon timesheet' and 'Codit Belgium job \"Replicon\" OR \"Deltek Replicon\"': only an unrelated Codit Sales Executive ad. Belgian Microsoft integration consultancy (~214). Codit may implement integrations for clients' Replicon rather than use it. No contact research.")
O["Solaris MCI"] = dict(status="PROBABLE", confidence_score=65,
  evidence_type="Current job posting",
  evidence_summary="Solaris Management Consultants Inc (Solaris MCI) job ad for a Financial Accountant (Surrey, BC) says experience in Replicon and QuickBooks Online would be an asset - finance role naming Replicon implies the firm runs Replicon timesheets for its engineering/project staff.",
  evidence_quote="Experience in Replicon, QuickBooks Online would be an asset",
  source_url="https://www.simplyhired.ca/job/_8uySu8kynI_wgp4XTiOtG78D6PiHcwvp_o1o4ttI9YmP5DAUOn9kg", source_publication_date="2026",
  second_source_url="https://theirstack.com/en/technology/replicon/ca", third_source_url="https://jobgether.com/offer/6a740ddae9f5b786586d5135-financial-accountant",
  status_reason="Employer's own accountant job ad names Replicon (as an 'asset', not a hard requirement) + TheirStack; strong but indirect.",
  workforce_signals="EPCM / engineering consultancy; billable project hours; offices Vancouver, Surrey, Calgary, Fort St. John, Houston, Ensenada (MX). Part of the iniem group.",
  contacts=[], company_phone="+1 604-575-8300", contact_source_url="https://www.solaris-mci.com/contact-us",
  pitch_angle="Engineering consultancy tracking billable project time in Replicon (now Deltek, price rises post-acquisition); pitch Tavilo for project time + productivity across multi-office and Mexico teams.",
  notes="Searches: '\"Solaris MCI\" Replicon', 'Solaris MCI job posting \"Replicon\"', '\"Solaris Management Consultants\" Financial Accountant Replicon'. SimplyHired page shows the quote (no date visible; listing live 2026-10); the jobgether copy of the same ad did not show the Replicon line. No leadership names on solaris-mci.com; DM searches returned only unrelated 'Solaris' companies - left blank. Phones on contact page: Vancouver/Surrey +1 604-575-8300, Calgary +1 403-269-8895, Houston +1 337-485-5253.")
O["Henderson Construction"] = P(15, "Searched '\"Henderson Construction\" Saskatoon \"QuickBooks Time\" OR TSheets' and 'hendersonconstruction.ca careers time tracking app QuickBooks': nothing. Saskatoon construction firm (~87); QBT plausible for field crews but unconfirmed. No contact research.")
O["ServiceMaster TRS: Total Restoration Services"] = dict(status="PROBABLE", confidence_score=70,
  evidence_type="Current job posting",
  evidence_summary="ServiceMaster TRS: Total Restoration Services mitigation-technician ads (Houston TX and Hartford CT; aggregated on career.io) state that accurate time tracking using QuickBooks Time (T-Sheets) is a job requirement.",
  evidence_quote="", source_url="https://career.io/job/mitigation-technician-houston-servicemaster-rrh-96408d0c81585a7da4341bd983bc4020", source_publication_date="2026",
  second_source_url="https://career.io/job/mitigation-technician-hartford-servicemaster-rrh-bd67b6e0f02e6e5eea10f576dc75a04d", third_source_url="https://theirstack.com/en/technology/quickbooks-time/uy",
  status_reason="Own job ads require staff to clock time in QuickBooks Time; seen via search snippet (career.io pages returned empty on fetch).",
  workforce_signals="Field restoration technicians (water/fire/mold), hourly $16-22; offices in Connecticut (Stamford) and Houston.",
  contacts=[], public_email="hr@smtrs.com", company_phone="203-327-3477", contact_source_url="https://servicemaster-trs.careerplug.com",
  pitch_angle="Field crews on QuickBooks Time; Tavilo fits office/estimating/admin staff more than technicians - modest fit.",
  notes="career.io URLs are labelled 'servicemaster-rrh' but the posting text names ServiceMaster TRS: Total Restoration Services - the aggregator mislabelled the employer; RRH is a separate Wisconsin franchise. Email/phone came from a search snippet of TRS job pages (not verified on smtrs.com, which failed TLS on fetch). Owner not identified ('under new management' per ads). Searches: '\"ServiceMaster\" restoration job \"QuickBooks Time\"...', '\"ServiceMaster TRS\" \"QuickBooks Time\" OR \"T-Sheets\"'.")
O["ServiceMaster RRH"] = P(25, "Searched '\"ServiceMaster RRH\" \"QuickBooks Time\"' and restoration-job queries: the only QuickBooks Time job ads found are for ServiceMaster TRS (CT/Houston), which career.io mislabels as 'ServiceMaster RRH'. ServiceMaster RRH itself is a Wisconsin/Minnesota/Upper Michigan franchise group (owners Todd and Candie Frank per servicemasterrestore.com) with no QBT evidence of its own; TheirStack may have picked up the mislabelled ads. Field crews; no contact research.",
  second_source_url="https://www.servicemasterrestore.com/locations/wisconsin/servicemaster-rrh")
O["Chil & Co."] = P(25, "Searched '\"Chil & Co\" OR \"Chil and Co\" Atlanta Jibble' and '\"Chil & Co\" Atlanta creative agency Bhargava Chiluveru': no Jibble mention. Atlanta creative/production agency (~23-28). Existing contact kept: Bhargava ('B. Chil') Chiluveru, founder/CEO & creative director - confirmed by chilatl.com ('Bhargava and his team') and builtin/podcast snippets.",
  workforce_signals="Creative agency with in-house production studio",
  contacts=[{"name":"Bhargava Chiluveru","title":"Founder, CEO & Creative Director","linkedin":"","source_url":"https://chilatl.com/"},
            {"name":"Anu Chiluveru","title":"Co-Founder & COO (Chil Media LLC)","linkedin":"","source_url":"https://together.emory.edu/alumni/awards/emory-entrepreneur-awards/anu-chiluveru-07c"}],
  company_linkedin="https://www.linkedin.com/company/chil-co", company_phone="(470) 289-0316", public_email="admin@chilatl.com", contact_source_url="https://chilatl.com/contact",
  pitch_angle="Small agency billing client hours - simple time tracking + productivity.")
O["Impressive"] = P(25, "Searched 'Impressive Digital Melbourne HourStack' and 'Impressive ... careers HourStack': no mention. B Corp digital agency, 90+ staff across Melbourne, Sydney, Brisbane and Austin TX. Existing contacts confirmed on own site: Robert Tadros, CEO & Founder; phone 1300 191 943. Note: TheirStack source was its /dk page, odd for an AU agency.",
  workforce_signals="Multi-office (AU + US) SEO/paid-media agency, 90+ staff",
  contacts=[{"name":"Robert Tadros","title":"CEO & Founder","linkedin":"","source_url":"https://impressive.com.au/contact-us/"}],
  company_phone="1300 191 943", contact_source_url="https://impressive.com.au/contact-us/",
  pitch_angle="Distributed AU/US agency team - billable-hours and productivity visibility.")
O["ORCAFY"] = P(20, "Searched 'ORCAFY Jibble' and site: search: no mention. Toronto performance-marketing agency (team members listed by first name on site; 27 staff). Contact from own site.",
  company_phone="(647) 955-6722", contact_source_url="https://orcafy.com/",
  workforce_signals="Digital agency")
O["Peak Seven Advertising"] = P(20, "Searched '\"Peak Seven\" Everhour' and site: search: nothing. Boca Raton FL full-service ad agency (~38), founded 1999. peakseven.com could not be fetched (blocked).",
  contacts=[{"name":"Darren Seys","title":"Founder & CEO","linkedin":"","source_url":"https://old.peakseven.com/blog/author/darren"}],
  contact_source_url="https://old.peakseven.com/blog/author/darren", workforce_signals="Ad agency")
O["RichClicks"] = P(20, "Searched '\"RichClicks\" OR \"Rich Clicks\" Everhour' and site: search: nothing. London/Milan performance-marketing agency (~25; UK Co. No. 08815509). Founders per economyup.it: Simone Luciani (founder) and Simone Passacantilli (co-founder) - article is older, roles not re-confirmed for 2026.",
  contacts=[{"name":"Simone Luciani","title":"Founder","linkedin":"","source_url":"https://www.economyup.it/startup/rich-clicks-la-startup-italiana-che-ha-battuto-le-big-agency-inglesi/"}],
  company_phone="+39 02 3031 4466", public_email="hello@richclicks.co.uk", contact_source_url="https://www.richclicks.co.uk/contact/",
  workforce_signals="Agency, UK + Italy staff")
O["Stiff"] = P(20, "Searched 'Stiff agency Ottawa Toggl' and site: search: nothing. Ottawa strategic communications agency since 1988 (~27-36). CEO James Hanington per search snippet (prospeo/bouncewatch aggregator) - not confirmed on stiff.ca.",
  contacts=[{"name":"James Hanington","title":"CEO","linkedin":"","source_url":"https://bouncewatch.com/company/stiff"}],
  company_phone="613-683-4100", public_email="get@stiff.ca", contact_source_url="https://stiff.ca/", workforce_signals="Communications agency")
O["Valor de Ley"] = P(15, "Searched '\"Valor de Ley\" agencia Toggl' and '\"Valor de Ley\" agencia publicidad Madrid fundador CEO': nothing about the company (results were a Peruvian agency 'Valor'). No domain in input; small Spanish agency (~28). No contact found.")
O["W5 Publicidade"] = P(20, "Searched '\"W5 Publicidade\" Everhour': only Everhour marketing pages. W5 is a Sao Paulo 360 ad agency (31+ years). Contact from own site; no directors named.",
  company_phone="+55 11 2341-2277", public_email="publicidade@w5.com.br", contact_source_url="https://w5.com.br/", workforce_signals="Ad agency")
