GEN_TT = "TheirStack 'time-tracker' is the generic phrase 'time tracker', not a specific competitor product"
GEN_TS = "TheirStack 'timesheets' usually matches ordinary job-ad duties (submit/approve timesheets), not Timesheets.com software"
D = {}
D[("UNITED BUILDERS","Time Tracker")] = dict(status="POSSIBLE", confidence_score=10,
  status_reason="Real Damascus construction contractor (est. 2003, Al-Mazza). " + GEN_TT + "; no software evidence found.",
  notes="Searched '\"United Builders\" Syria construction' and Time Tracker combinations; only company-profile listings (prospeo.io/c/united-builders-email-format). Very small per input (4); no contact research.")
D[("Woodbridge","Time Tracker")] = dict(status="POSSIBLE", confidence_score=10,
  status_reason="Real Canadian automotive foam/components maker (~5k). " + GEN_TT + "; no evidence of a time-tracking product.",
  notes="Searched '\"Woodbridge\" woodbridgegroup \"time tracker\" software' - nothing about the company. Outside 25-2,500 band; manufacturing plant workforce, poor ICP fit. No contact research.")
D[("equation digital","Time Tracker")] = dict(status="POSSIBLE", confidence_score=10,
  status_reason="Small UK digital marketing agency (8 per input; listed at marketplace.iqm.com/workspaces/z8rUqL4m). " + GEN_TT + "; no evidence found.",
  notes="Searched '\"equation digital\" agency UK'; name also collides with IDHL's 'equation' paid-media agency. Under 25 staff; no contact research.")
D[("ACWA Power","Timesheets")] = dict(status="POSSIBLE", confidence_score=10,
  status_reason="Real Saudi utility/IPP developer. " + GEN_TS + "; nothing found tying ACWA Power to a timesheet product.",
  notes="Searched '\"ACWA Power\" timesheets software' - only generic timesheet vendor pages. Enterprise, outside ICP; no contact research.")
D[("Alter Domus","Timesheets")] = dict(status="POSSIBLE", confidence_score=10,
  status_reason="Real Luxembourg fund-administration group (6k+). " + GEN_TS + "; no evidence of Timesheets.com.",
  notes="Searched '\"Alter Domus\" timesheet tool employees time tracking' - nothing company-specific. Outside size band; no contact research.")
D[("CR3","Timesheets")] = dict(status="POSSIBLE", confidence_score=10,
  status_reason="Real Bangkok energy maintenance/shutdown services group (formerly CR Asia; owned by Liberty Energy per cbinsights.com/company/cr3-group). " + GEN_TS + " - field/shutdown crews submitting timesheets is normal job-ad wording.",
  notes="Searched '\"CR3\" cr3.group oil gas Thailand company'. No software evidence. Industrial field workforce, weak ICP fit; no contact research.")
D[("Colas","Timesheets")] = dict(status="POSSIBLE", confidence_score=10,
  status_reason="Real (Colas Maroc, part of the Colas/Bouygues road-construction group). " + GEN_TS + "; nothing found.",
  notes="Searched '\"Colas Maroc\" timesheets logiciel pointage' - only generic vendor pages. Construction field workforce, enterprise group; no contact research.")
D[("QualityKiosk Technologies","Timesheets")] = dict(status="POSSIBLE", confidence_score=10,
  status_reason="Real Mumbai IT/QA services firm (~4.4k). " + GEN_TS + "; Glassdoor search showed nothing about a named timesheet product.",
  notes="Searched '\"QualityKiosk\" timesheet tool Glassdoor'. Outside size band; no contact research.")
D[("SOFTSWISS","Timesheets")] = dict(status="POSSIBLE", confidence_score=10,
  status_reason="Real iGaming software developer (~1.6k). " + GEN_TS + "; nothing found.",
  notes="Searched '\"SOFTSWISS\" time tracking tool employees timesheets' - nothing company-specific. Large in-house dev company, not remote/BPO; no contact research.")
D[("Turtle Trax S.A.","Timesheets")] = dict(status="POSSIBLE", confidence_score=5,
  status_reason="Real Costa Rican sea-turtle conservation / volunteer-tourism operator (Nicoya Peninsula, since 1998). " + GEN_TS + "; most likely from a volunteer/coordinator job ad. No software evidence.",
  notes="Searched '\"Turtle Trax\" Costa Rica' (shouldertoshoulder.com/shoulder-to-shoulder-with-turtle-trax/, careers.conbio.org volunteer coordinator ad). 5 staff; no contact research.")
D[("Live to Thrive","Toggl Track")] = dict(status="POSSIBLE", confidence_score=5,
  status_reason="Small Canadian counselling practice (2 staff per input). No evidence of Toggl; name is generic and matches several practices.",
  notes="Searched '\"Live to Thrive\" Canada counselling Toggl' - no Toggl link. No domain in input. Too small; no contact research.")
D[("Producement","Toggl Track")] = dict(status="POSSIBLE", confidence_score=5,
  status_reason="1-person Estonian IT consultancy per input; could not even confirm the company online. No Toggl evidence.",
  notes="Searched '\"Producement\" Estonia' - only economic statistics pages. No contact research.")
D[("Quorum Software","Replicon")] = dict(status="POSSIBLE", confidence_score=20,
  status_reason="Real Houston energy-software company (~1.8k). Replicon is a real time product, but nothing beyond the TheirStack Taiwan-page hit was found.",
  notes="Searched '\"Quorum Software\" Replicon' and '\"Quorum Software\" job timesheet \"Replicon\" OR \"time entry\"' - only generic Replicon pages. Not a remote/BPO profile; no contact research.")
D[("Sectra","Replicon")] = dict(status="POSSIBLE", confidence_score=20,
  status_reason="Real Swedish medical-imaging/cybersecurity company (~1.7k). No evidence of Replicon beyond TheirStack.",
  notes="Searched 'Sectra Replicon time reporting' - only generic Replicon pages. Not remote/BPO; no contact research.")
D[("MCI Group","Toggl Track")] = dict(status="POSSIBLE", confidence_score=15,
  status_reason="Real global events/association-management group (input industry 'Construction' looks wrong). No Toggl evidence found; TheirStack also flags Replicon, so at most one is likely.",
  notes="Searched '\"MCI Group\" Replicon OR Toggl timesheet' - only comparison sites. No contact research (not remote/BPO; enterprise agency group).")
D[("MCI Group","Replicon")] = dict(status="POSSIBLE", confidence_score=20,
  status_reason="Real global events/association-management agency group; a services/agency business could plausibly use Replicon for billable time, but nothing beyond TheirStack was found.",
  notes="Searched '\"MCI Group\" Replicon OR Toggl timesheet' - nothing company-specific. No contact research.")
D[("ServiceMaster Restore","QuickBooks Time")] = dict(status="PROBABLE", confidence_score=50,
  evidence_type="Current job posting",
  evidence_summary="A Lead Restoration Technician ad for ServiceMaster TRS (an independently owned ServiceMaster Restore franchisee in Connecticut/Texas) asks for QuickBooks Time experience or willingness to learn it quickly. Evidence is at franchisee level, not brand HQ.",
  evidence_quote="",
  source_url="https://grabjobs.co/us/job/full-time/others/lead-restoration-technician-152076938",
  second_source_url="https://www.servicemasterrestore.com/locations/texas/servicemaster-trs/",
  third_source_url="https://theirstack.com/en/technology/quickbooks-time/uy",
  status_reason="QuickBooks Time required in a ServiceMaster TRS franchisee job ad (search snippet; page 403). Each franchise is independently owned, so this shows use inside the network, not a brand-wide standard.",
  workforce_signals="Franchise network; field restoration technicians (hourly, mobile clock-in) - field-service fit rather than desktop monitoring.",
  pitch_angle="Better as a franchisee-by-franchisee pitch (e.g. ServiceMaster TRS, multi-state CT/TX operator): mobile time + job tracking for hourly restoration crews vs QuickBooks Time.",
  notes="Searched '\"ServiceMaster Restore\" \"QuickBooks Time\" OR TSheets' (nothing) and '\"ServiceMaster\" restoration franchise job \"QuickBooks Time\"' (grabjobs snippet quoted QBT; grabjobs and hireheroesusa pages returned 403, posting date not visible). ServiceMaster TRS 'Total Restoration Services' per ihireconstruction.com/jobs/view/481176555; Rippling ATS page had no open roles. Could not get franchisee owner name or phone (servicemasterrestore.com location page 403). Brand HQ (ServiceMaster Brands) not contacted-researched: franchisor does not buy time tools for franchisees.")
D[("Collabera Digital","Replicon")] = dict(status="POSSIBLE", confidence_score=20,
  status_reason="Real IT staffing/digital services firm (~2.7k). Staffing firms commonly use contractor timesheet tools, but no Replicon evidence found beyond TheirStack.",
  notes="Searched '\"Collabera\" Replicon timesheet' - only generic Replicon pages. Outside band; no contact research.")
D[("PwC Polska","Replicon")] = dict(status="PROBABLE", confidence_score=80,
  evidence_type="Older job posting",
  evidence_summary="PwC Advisory (Poland) advertised a 'Replicon Functional Lead (Product team)' role in Poznan inside PwC's Internal Business Application Centre, owning the global vision for time & expense management and keeping territory deployments aligned. Shows PwC runs Replicon as its time & expense system, managed from Poland. Posting now expired; date not shown.",
  evidence_quote="Contribute to the development and alignment of the global vision for time & expense management",
  source_url="https://www.karierawfinansach.pl/oferta-pracy/276673,replicon-functional-lead-product-team-poznan",
  second_source_url="https://theirstack.com/en/technology/replicon/tw",
  status_reason="Explicit PwC Poland job ad for a Replicon product lead (expired, undated) plus TheirStack signal; consistent with PwC's earlier global Replicon selection. Enterprise network far outside Tavilo ICP.",
  pitch_angle="Not a realistic Tavilo target: global Big-4 enterprise Replicon rollout run centrally.",
  notes="Searched '\"PwC\" Poland Replicon timesheet' and fetched the karierawfinansach.pl ad (employer PwC Advisory sp. z o.o. sp.k., Poznan; marked expired). Contacts not researched: enterprise procurement, outside 25-2,500 band.")
D[("BrandHouzz Digital","Toggl Track")] = dict(status="POSSIBLE", confidence_score=15,
  status_reason="Real Aberdeen B2B digital-marketing agency (10th anniversary per agcc.co.uk news). Agency profile fits Toggl, but no Toggl evidence beyond TheirStack.",
  notes="Searched '\"BrandHouzz\" digital' (https://www.agcc.co.uk/news-article/new-appointment-at-brandhouzz-strengthens-digital-marketing-expertise) and Toggl combos. Tiny (2 per input); no contact research.")
D[("Social Land","Everhour")] = dict(status="POSSIBLE", confidence_score=15,
  status_reason="Small UK social-media agency (9 per input). No Everhour mention found beyond TheirStack.",
  notes="Searched '\"Social Land\" agency UK Everhour' - only Everhour marketing pages. Under 25 staff; no contact research.")
D[("Three Omens","Everhour")] = dict(status="POSSIBLE", confidence_score=15,
  status_reason="Small US agency (4 per input). No Everhour evidence beyond TheirStack.",
  notes="Searched '\"Three Omens\" agency Everhour' - only Everhour marketing pages. Under 25 staff; no contact research.")
D[("mygolfGroup","TrackingTime")] = dict(status="POSSIBLE", confidence_score=10,
  status_reason="myGolf is a golf course/tournament booking platform (dealroom: app.dealroom.co/companies/mygolf_1). No TrackingTime evidence beyond TheirStack (Uruguay page).",
  notes="Searched '\"mygolfGroup\" OR \"mygolf group\" TrackingTime'. 7 staff; no contact research.")
D[("Amplify","Jibble")] = dict(status="POSSIBLE", confidence_score=10,
  status_reason="amplify.com is the US K-12 curriculum company; the TheirStack hit is on the Chile Jibble page, so the match may be a different 'Amplify'. No Jibble evidence found.",
  notes="Searched '\"Amplify\" amplify.com education Jibble' - nothing. Outside band (3.1k); no contact research.")
D[("Consilio LLC","Replicon")] = dict(status="POSSIBLE", confidence_score=20,
  status_reason="Real eDiscovery/legal-services firm (~3.8k) with billable document-review staff - plausible Replicon fit, but nothing beyond TheirStack was found.",
  notes="Searched '\"Consilio\" Replicon timesheet document review' - only generic Replicon pages. Outside band; no contact research.")
D[("Seaspan ULC","Replicon")] = dict(status="POSSIBLE", confidence_score=15,
  status_reason="Real Vancouver shipbuilder (Seaspan ULC). No Replicon evidence beyond TheirStack.",
  notes="Searched '\"Seaspan\" Replicon timesheet' - only generic Replicon pages. Shipyard workforce, outside band; no contact research.")
D[("TC Transcontinental","Toggl Track")] = dict(status="POSSIBLE", confidence_score=10,
  status_reason="Real Canadian packaging/printing group (~5k+). No Toggl evidence; 'toggl' is collision-prone and a single team's use would not make this a target.",
  notes="Searched '\"Transcontinental\" OR \"TC Transcontinental\" Toggl' - only TheirStack/Capterra listings. Outside band; no contact research.")
BOOK = "An accounting/bookkeeping firm: a QuickBooks Time hit may reflect setting it up for clients (QuickBooks ProAdvisor work) rather than internal use"
D[("ACTO Technologies","Replicon")] = dict(status="POSSIBLE", confidence_score=10,
  status_reason="Real Toronto life-sciences sales-enablement SaaS (ACTO, founded 2014; acquired 4th Down Solutions 2024). Input size (1) understates it. No Replicon evidence beyond TheirStack.",
  notes="Searched '\"ACTO Technologies\" Canada' (betakit.com/how-acto-created-30x-revenue-growth-with-the-right-international-expansion-strategy/) and Replicon combos. Not a remote/BPO profile; no contact research.")
D[("Agni Ajurweda","Toggl Track")] = dict(status="POSSIBLE", confidence_score=5,
  status_reason="Tiny Polish Ayurveda business (5 per input); could not find the business online. No Toggl evidence.",
  notes="Searched '\"Agni Ajurweda\"' - only general Ayurveda pages. No contact research.")
D[("Assystem","Replicon")] = dict(status="POSSIBLE", confidence_score=15,
  status_reason="Real French engineering group (~8k). No Replicon evidence beyond TheirStack (Taiwan page).",
  notes="Searched '\"Assystem\" Replicon' - only generic Replicon pages. Outside band; no contact research.")
D[("Blueprint Accounting Inc.","QuickBooks Time")] = dict(status="POSSIBLE", confidence_score=10,
  status_reason="Small Canadian accounting firm (8 per input). " + BOOK + ". No evidence found.",
  notes="Searched '\"Blueprint Accounting\" Canada QuickBooks Time' - nothing company-specific. Under 25 staff; no contact research.")
D[("Brand Warrior","Everhour")] = dict(status="POSSIBLE", confidence_score=15,
  status_reason="Real Australian marketing/brand agency (syncgtm.com/directory/agency/brand-warrior). Agency fits Everhour, but no evidence beyond TheirStack.",
  notes="Searched '\"Brand Warrior\" agency Australia Everhour'. 8 staff; no contact research.")
D[("Breeze Business Management","Toggl Track")] = dict(status="POSSIBLE", confidence_score=5,
  status_reason="1-person Canadian business per input; could not identify it online (results were Breeze accounting software / Yardi Breeze). No Toggl evidence.",
  notes="Searched '\"Breeze Business Management\" Canada'. No contact research.")
D[("Datacom","Toggl Track")] = dict(status="POSSIBLE", confidence_score=10,
  status_reason="Real NZ IT services group (~6.4k). No Toggl evidence; Datacom builds its own timesheet/payroll systems, so a TheirStack 'toggl' hit is likely a stray mention.",
  notes="Searched '\"Datacom\" Toggl time tracking New Zealand' - only Toggl/Capterra pages. Outside band; no contact research.")
D[("Eurotechsol","Replicon")] = dict(status="POSSIBLE", confidence_score=10,
  status_reason="Small German IT firm (7 per input); eurotechsol.com only returned a bot-check page, so activity unconfirmed. No Replicon evidence.",
  notes="Searched '\"Eurotechsol\" Replicon'; fetched eurotechsol.com 2026-10-07 (verification interstitial only). No contact research.")
D[("HELPGINI GLOBAL CONSULTING","QuickBooks Time")] = dict(status="POSSIBLE", confidence_score=5,
  status_reason="Small Indian consultancy (5 per input) that could not be found online; if it does bookkeeping/outsourced accounting, a QuickBooks Time mention would likely be client work. No evidence.",
  notes="Searched '\"HELPGINI\" consulting' - no match. No contact research.")
D[("Lucky Seven Marketing","Toggl Track")] = dict(status="POSSIBLE", confidence_score=5,
  status_reason="Small UK marketing business (8 per input); could not identify it confidently (closest: LUCKY7 AGENCY LTD, London). No Toggl evidence.",
  notes="Searched '\"Lucky Seven Marketing\" UK'. No contact research.")
D[("QuantumWork","Everhour")] = dict(status="POSSIBLE", confidence_score=5,
  status_reason="Small US company (5 per input) not found online. No Everhour evidence.",
  notes="Searched '\"QuantumWork\" company Everhour'. No contact research.")
D[("Royal Fox s.r.o.","Toggl Track")] = dict(status="POSSIBLE", confidence_score=5,
  status_reason="Tiny Prague company (IČO 08722978, est. 2019, 1-5 staff, broad trade/IT/real-estate activities per mesec.cz). No Toggl evidence.",
  notes="Searched '\"Royal Fox s.r.o.\" OR \"Royal Fox\" Czech Toggl' (https://www.mesec.cz/rejstrik-firem/firma-royal-fox-s-r-o-08722978). No contact research.")
D[("Studio Alt","Toggl Track")] = dict(status="POSSIBLE", confidence_score=15,
  status_reason="Real Melbourne Shopify/e-commerce design studio (founded 2020, 1-10 staff). Agency profile fits Toggl, but no evidence beyond TheirStack.",
  notes="Searched '\"Studio Alt\" Australia design studio' and Toggl combos. Under 25 staff; no contact research.")
D[("Talentloop","Toggl Track")] = dict(status="POSSIBLE", confidence_score=10,
  status_reason="Live UK outsourced recruitment/people-function provider for small businesses (talentloop.co.uk). No Toggl mention on site or in search; TheirStack hit was on the Peru 'toggl-track' page, so the match is doubtful.",
  notes="Searched '\"Talentloop\" recruitment UK Toggl' (results only about Toggl Hire); fetched talentloop.co.uk 2026-10-07. 6 staff; no contact research.")
D[("Total Accounting & Bookkeeping","QuickBooks Time")] = dict(status="POSSIBLE", confidence_score=5,
  status_reason="Tiny UK bookkeeping practice (3 per input); several UK firms share the name, could not pin down which. " + BOOK + ".",
  notes="Searched '\"Total Accounting & Bookkeeping\" UK' - several similarly named firms (Total Accounting Kent, Total Bookkeeping Ltd). No contact research.")
D[("Total Management Consulting","Toggl Track")] = dict(status="POSSIBLE", confidence_score=5,
  status_reason="Small HR/talent-management consultancy (totalmanagement.es site, (c) 2024-2025). No Toggl mention on site or in search.",
  notes="Searched '\"Total Management Consulting\" totalmanagement.es'; fetched totalmanagement.es 2026-10-07. 2 staff; no contact research.")
D[("clickbits GmbH","clockodo")] = dict(status="DO_NOT_TARGET", confidence_score=0,
  status_reason="Vendor itself: clickbits GmbH (Unna, Germany) is the developer of clockodo and has since renamed itself Clockodo GmbH.",
  notes="Searched 'clickbits GmbH clockodo' - mobile.softpedia.com/apk/developer/clickbits-gmbh-3111 and https://www.clockodo.com/en/about-us/ confirm clickbits = clockodo maker.")
D[("langhauser GmbH","clockodo")] = dict(status="POSSIBLE", confidence_score=5,
  status_reason="1-person German company per input; could not find it online. No clockodo evidence beyond TheirStack (Peru page, which is odd for a German firm).",
  notes="Searched '\"langhauser GmbH\"' - only similarly named firms (Langzauner, Lang GmbH). No contact research.")
D[("ATB Financial","Replicon")] = dict(status="POSSIBLE", confidence_score=15,
  status_reason="Real Alberta Crown-owned bank (~6k). Replicon is Calgary-based, so local adoption is plausible, but nothing beyond TheirStack was found.",
  notes="Searched '\"ATB Financial\" Replicon' - only generic Replicon pages. Outside band; no contact research.")
