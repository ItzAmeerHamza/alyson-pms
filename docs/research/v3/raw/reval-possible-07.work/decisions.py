NOSEARCH = "No evidence beyond TheirStack."

DECISIONS = {
"Aunty's Kitchen": dict(
    status="PROBABLE", confidence_score=50,
    evidence_type="Older job posting",
    evidence_summary="A Store Manager job ad for Aunty's Kitchen (6039 Erin Mills Pkwy, Mississauga) for its '20-person team' is hosted through Homebase's hiring tool (Homebase job-board mirror). Hiring via Homebase usually means the account also runs Homebase scheduling/time clock, but that is not stated.",
    evidence_quote="looking for a store manager to join their 20-person strong team",
    source_url="https://new.efe.edu.co/gig/job/store-manager-at-auntys-kitchen-canada-RmtIVUhTcnZJSHQrRzA5ejdCU3pOVjd3QXc9PQ==",
    source_publication_date="",
    status_reason="Job posting hosted on Homebase hiring (seen in two search snippets of Homebase job-board mirrors); mirror page would not fetch (DNS error), date unknown.",
    workforce_signals="Hourly restaurant staff, 2 locations (Mississauga, Waterloo ON), ~20 staff at Mississauga; also catering and tiffin delivery.",
    estimated_tracked_seats="25",
    company_phone="(905) 567-6696; Waterloo (519) 954-5633", public_email="info@AuntysKitchen.ca",
    contact_source_url="https://auntyskitchen.ca",
    pitch_angle="Two-location Pakistani restaurant/caterer on Homebase for hiring; pitch simple shift time clock + payroll-ready timesheets across both stores. Small deal (~25 seats).",
    notes="Searched: '\"Aunty's Kitchen\" Homebase schedule', '\"Aunty's Kitchen\" Mississauga hiring Homebase', store-manager snippet query. Owner name not found on site, listings (zabihah, visitmississauga) or an owner/interview search. Company LinkedIn not found. Site uses Toast POS. estimated_tracked_seats is an estimate."),
"Banh Mi Boys": dict(
    status="POSSIBLE", confidence_score=25,
    status_reason="No public evidence of Homebase use beyond TheirStack.",
    workforce_signals="Hourly QSR staff, multiple Toronto-area locations.",
    notes="Searched: '\"Banh Mi Boys\" Homebase hiring', '\"Banh Mi Boys\" Toronto jobs joinhomebase', '\"Banh Mi Boys\" job Homebase'. Jobs seen on Job Bank / Workopolis / CareerBeacon with no Homebase mention. banhmiboys.com fetch returned empty content. Restaurant (not remote/BPO) so no contact research per spec. Operated by brothers David, Philip and Peter Chau (torontolife.com)."),
"Beech Mountain Resort": dict(
    status="POSSIBLE", confidence_score=25,
    status_reason="No public evidence of Homebase use beyond TheirStack.",
    workforce_signals="Seasonal ski resort hourly staff (lifts, F&B, retail).",
    notes="Searched: '\"Beech Mountain Resort\" Homebase app employees', '\"Beech Mountain\" resort employees Homebase clock in', '\"Beech Mountain Resort\" job posting Homebase'. Jobs found on Handshake, ZipRecruiter, Boone Chamber; none mention Homebase. Not remote/BPO so no contact research."),
"MELT Ice Creams": dict(
    status="PROBABLE", confidence_score=50,
    evidence_type="Older job posting",
    evidence_summary="Search snippets of job-board mirrors show MELT Ice Creams (Fort Worth) roles (Ice Cream Production Assistant, Scooper, Shift Lead) posted through Homebase's hiring tool. The mirror page now returns 404; seasoned.co copies of the same jobs do not mention Homebase.",
    evidence_quote="",
    source_url="https://media.bci.lk/career/job/ice-cream-production-assistant-at-melt-ice-creams-fort-worth-tx-YXlxMTR0Z2UxaCtiU0lLRjA3dHZPRFJxWGc9PQ==",
    third_source_url="https://www.seasoned.co/job/scooper-melt-ice-creams-fort-worth-tx_9ae55bbd-753e-4142-a268-defe3926b738",
    status_reason="Homebase-hosted job ads seen only in search snippets (source page 404); not verified verbatim.",
    workforce_signals="6 scoop shops in DFW + production kitchen ('Joy Factory'), catering trucks/carts, wholesale; hourly staff.",
    estimated_tracked_seats="60",
    contacts=[{"name": "Kari Crowe-Seher", "title": "Founder", "linkedin": "", "source_url": "https://fwtx.com/news/building-joy-factory-kari-crowe-seher-growing-melt/"}],
    company_phone="(817) 886-8365", public_email="info@melticecreams.com", contact_source_url="https://melticecreams.com",
    pitch_angle="Multi-shop DFW creamery with a production kitchen and catering crew; pitch GPS/selfie time clock and job-costing across shops + kitchen.",
    notes="Searched: '\"MELT Ice Creams\" Homebase', '\"MELT Ice Creams\" Fort Worth jobs scoop Homebase', founder + homebase query. Employee count in input (27) looks low for 6 shops; tracked seats is an estimate. Founder LinkedIn not found."),
"PJ's Coffee of New Orleans": dict(
    status="PROBABLE", confidence_score=60,
    evidence_type="Current job posting",
    evidence_summary="A PJ's Coffee careers posting (PJ's Coffee of San Antonio, Hwy 281 N - a franchise store) on the official PJ's careers site lists as a requirement being comfortable staying in touch on platforms such as Homebase and iMessage. Shows Homebase use at franchise-store level, not necessarily chain-wide.",
    evidence_quote="Comfortable staying in touch across various platforms such as Homebase & iMessage.",
    source_url="https://pjs-coffee-careers.careerplug.com/jobs/3240658",
    source_publication_date="",
    status_reason="Explicit Homebase mention in a PJ's job ad, but it is one franchisee; PJ's is a franchise system (150+ stores) and scheduling tools are chosen per franchisee.",
    workforce_signals="Franchise coffee chain, 150+ stores, hourly baristas; per-franchisee tool choice.",
    contacts=[
        {"name": "David Mesa", "title": "President, Franchise Division (PJ's Coffee & WOW American Eats), Ballard Brands", "linkedin": "", "source_url": "https://www.restaurantdive.com/news/Ballard-brands-ceo-david-mesa-retires-david-mesa-president-franchise-development/744103/"},
        {"name": "Scott Ballard", "title": "Founder & CEO, Ballard Brands (owner of PJ's)", "linkedin": "", "source_url": "https://www.restaurantdive.com/news/Ballard-brands-ceo-david-mesa-retires-david-mesa-president-franchise-development/744103/"}],
    contact_source_url="https://www.pjscoffee.com/contact",
    pitch_angle="Franchise system where stores pick their own tools; pitch a franchisor-recommended time clock/scheduling standard, or target individual multi-unit franchisees (e.g. San Antonio group).",
    notes="Searched: '\"PJ's Coffee\" Homebase scheduling', '\"PJ's Coffee\" Homebase app employee', '\"PJ's Coffee\" \"platforms such as Homebase\"'. Corporate contact page has no phone/email (feedback form only). Leadership per Restaurant Dive (2025): Peter Boylan retired April 2025; David Mesa leads franchise division. Personal LinkedIn not searched/seen. Company HQ Mandeville, LA (owner Ballard Brands) per CB Insights/ZoomInfo snippets; company LinkedIn URL not seen in results."),
"POWERHOUSE RETAIL SERVICES": dict(
    status="POSSIBLE", confidence_score=20,
    status_reason="No public evidence of Homebase use beyond TheirStack.",
    workforce_signals="US retail facilities/refresh services contractor (Lincolnshire Management portfolio) with field technicians.",
    notes="Searched: '\"Powerhouse Retail Services\" Homebase' (results only about the company and its acquisitions, no Homebase). Input says Canada but the company appears US-based (Lincolnshire Management portfolio). Not remote/BPO so no contact research."),
}

NA_ONLY = ("Homebase (joinhomebase.com) is sold for US and Canada hourly teams; a company with no North American operations is very likely a "
           "name collision (generic 'home base', UK DIY retailer Homebase, crew/aircraft base).")

def weak(searches, extra="", conf=10, ws=""):
    return dict(status="POSSIBLE", confidence_score=conf,
                status_reason="No public evidence of Homebase (software) use beyond TheirStack; likely name collision.",
                workforce_signals=ws,
                notes="Searched: " + searches + ". Nothing found linking the company to Homebase software. " + NA_ONLY + (" " + extra if extra else "") +
                      " No contact research (POSSIBLE, not a remote/BPO/agency team).")

def dnt(reason, searches, extra=""):
    return dict(status="DO_NOT_TARGET", confidence_score=5, status_reason=reason,
                notes="Searched: " + searches + "." + (" " + extra if extra else ""))

DECISIONS.update({
"Ascom UMS": weak("'\"Ascom UMS\" homebase'", "Ascom UMS is an Italian healthcare-IT subsidiary of Swiss Ascom; results only about other 'UMS' products."),
"Bauhaus Suomi": weak("'\"Bauhaus\" Suomi \"homebase\"'", "Bauhaus (German DIY chain, 6 stores in Finland) is a direct peer of UK DIY retailer HomeBase; the TheirStack hit is most likely that retailer name.", conf=5),
"Beach Burrito Company": weak("'\"Beach Burrito Company\" Homebase OR Deputy rostering'", "Australian restaurant group; Australian hospitality typically uses Deputy/Tanda etc. Nothing found."),
"Block House": weak("'\"Block House\" Restaurant Hamburg \"Homebase\"'", "German steakhouse chain (Block Gruppe, ~53 restaurants)."),
"CRH": weak("'\"CRH\" \"Homebase\" job'", "CRH (global building materials, ~80k staff) hires through SAP SuccessFactors; hirebase.org results are a different site. Homebase targets small businesses, implausible at CRH scale.", conf=5),
"Call For Referral": dnt("Job-referral / job-listing platform (Kolkata, founded 2022) that republishes other companies' jobs; any 'Homebase' text in its postings is not its own tool use. Employee count (826) appears to be community members.",
                        "'\"Call For Referral\" company homebase'"),
"Candlewood Suites": weak("'\"Candlewood Suites\" Homebase scheduling employees hotel'", "Candlewood Suites is an IHG extended-stay hotel brand; hotels are franchised and choose their own scheduling tools. A single US/Canada franchisee could use Homebase but no evidence found; 'Mexico' HQ in input is wrong (brand is IHG).", conf=15),
"COMERSO": weak("'\"COMERSO\" homebase'", "French (Bordeaux) unsold-inventory valorisation company; results only about UK retailer HomeBase."),
"Cheeky Monkeys": weak("'\"Cheeky Monkeys\" Dubai \"homebase\"'", "UAE kids' play-centre chain."),
"Delex Pharma International, Inc.": weak("'\"Delex Pharma\" homebase'", "Filipino pharma/medical-device company (Quezon City)."),
"DroneShield": weak("'\"DroneShield\" \"homebase\"'", "Australian counter-drone defence manufacturer; results about its Sydney HQ only. Has a US subsidiary but no Homebase link found.", conf=5),
"Finsiders": weak("'\"Finsiders\" homebase'", "Belgian financial-services firm (Sint-Martens-Latem)."),
"Mons Royale": weak("'\"Mons Royale\" \"homebase\" job', '\"Mons Royale\" Wanaka \"home base\" OR \"homebase\" store manager'",
                    "NZ merino apparel brand; has a Whistler (Canada) store, so Homebase is possible there, but job ads seen (NZTE, Job Bank) show no Homebase mention; TheirStack text likely 'Wanaka is our home base'.", conf=15),
"Eurowings Europe": dnt("Name collision: in aviation 'homebase' means the crew/aircraft home base (e.g. Vienna base). Not Homebase software. Airline is a Lufthansa Group carrier; Homebase software is not plausible.",
                        "'\"Eurowings Europe\" homebase Vienna crew'"),
"International Jet Management GmbH": dnt("Name collision: business-jet operator based at Vienna airport; 'homebase' in aviation job ads means the crew/aircraft base, not Homebase software.",
                        "'\"International Jet Management\" homebase Vienna'"),
})

DECISIONS.update({
"BTH": weak("'\"BTH\" Belgium retail \"homebase\"'", "Company not identifiable (no domain in input; only a 'BTHS' BV in Elsene found)."),
"Breakout": weak("'\"Breakout\" breakout.in fashion India homebase'", "Indian fashion retail brand; results only about other brands/stock charts."),
"Centrico": weak("'\"Centrico\" Italia \"homebase\"'", "Centrico is the ICT provider of Italy's Sella group; nothing about Homebase."),
"Compass Hospitality": weak("'\"Compass Hospitality\" Thailand \"homebase\"'", "Bangkok hotel group (Compass, Citrus, Citin brands); 'homebase' in its text likely means its Bangkok base."),
"Ella Skin Care": weak("'\"Ella Skin Care\" homebase'", "Indonesian skin-clinic chain (Surakarta, 24 branches)."),
"Firefly": weak("'\"Firefly\" fireflyeducate homebase'", "Input mixes 'Restaurants' industry with domain fireflyeducate.com; results only about unrelated Firefly ed-tech firms."),
"Food Industries": dnt("Not an identifiable company: 'Food Industries' is a generic industry label (LinkedIn page that people list as employer); no domain, no website found.",
                       "'\"Food Industries\" France company linkedin 386 employees wholesale'"),
"G&L Group (IND-BA)": weak("'\"G&L Group\" Argentina \"homebase\"'", "Argentine tech-solutions/training company (CEO María Laura Palacios per search snippet); no Homebase link."),
"Golden Sands": weak("'\"Golden Sands\" hotel apartments Dubai \"homebase\"'", "Dubai aparthotel (Golden Sands Hotel Apartments, Bur Dubai)."),
"Greasy Spoon": weak("'\"Greasy Spoon\" Stockholm homebase'", "Stockholm brunch chain, 4 venues; Swedish hospitality typically uses local rostering tools (e.g. Caspeco, Planday)."),
"GuideCom AG": weak("'\"GuideCom\" \"homebase\"'", "German IT company; no link found."),
"Hove": weak("'\"Hove\" France IT startup \"homebase\"'", "Paris mobility-data company (ex-Kisio Digital, ~110 staff)."),
"ICC GROUP": weak("'\"ICC Group\" Lebanon \"homebase\"'", "Lebanese ICT integrator (ISSA Holding subsidiary, 250+ staff)."),
"IFS International Facilities Services": weak("'\"IFS\" \"International Facilities Services\" Mauritius homebase'", "Facilities management for remote mining/oil sites in Africa (HQ Mapou, Mauritius); 'homebase' likely refers to staff rotation home base."),
"Joinrs Italia": weak("'\"Joinrs\" homebase'", "Italian job/careers platform (Joinrs); results only about Homebase itself. As a job platform its job text may be third-party.", conf=5),
"LA PERGOLETTA": weak("'\"La Pergoletta\" restaurante homebase', '\"La Pergoletta\" Los Angeles jobs server homebase'",
                      "Brazilian Italian-restaurant group (São Paulo). The same Seganti family runs a La Pergoletta in Los Feliz, Los Angeles; the TheirStack hit (7 pages) may come from that LA restaurant's Homebase-hosted job ads, but no such ad was found. If anything, the LA restaurant (separate small business) is the lead, not the Brazilian company.", conf=15),
"Maccura": weak("'\"Maccura\" \"homebase\"'", "Chinese IVD/medical equipment maker (Maccura Biotechnology); results only about Homebase itself.", conf=5),
"Midas Research": weak("'\"Midas Research\" India homebase'", "Company not clearly identifiable; results only for other 'Midas' entities."),
"Mining Industry": dnt("Not an identifiable company: 'Mining Industry' is a generic industry label (LinkedIn page people list as employer); no domain or website.",
                       "Generic-name check; no company of that name found"),
"Motion Asia Pacific": weak("'\"Motion Asia Pacific\" OR \"Motion Australia\" homebase'", "Industrial parts distributor (Genuine Parts Co. subsidiary; ~200 branches in AU/NZ). GPC enterprise scale makes Homebase (SMB tool) unlikely."),
"Niederwieser Spa": weak("'\"Niederwieser\" packaging \"homebase\"'", "Italian/German flexible-packaging family group."),
"One Business School": weak("'\"One Business School\" France \"homebase\"'", "School not clearly identifiable in results."),
"Otomashen": weak("'\"Otomashen\" homebase', '\"Otomashen\" software company India'",
                  "Indian software firm founded 2022 by Vishal Aggarwal (who since July 2023 is CEO of SnapCheck Workforce Management, a workforce-management company - so Otomashen/SnapCheck may be a Tavilo competitor rather than a buyer). otomashen.com showed only a bot-check page."),
"Overseas Family School": weak("'\"Overseas Family School\" Singapore \"homebase\" OR \"home base\"'", "Singapore international school (Pasir Ris); 'homebase' is a common school term (homeroom/homebase class)."),
})
