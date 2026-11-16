D = {}

def add(name, vendor, **kw):
    D[(name, vendor)] = kw

TS_ONLY = "Nothing found beyond the TheirStack listing."

# ---- Connecteam ----
add("Holie Pizza", "Connecteam", status="POSSIBLE", confidence_score=25,
    status_reason="Company is live (mobile pizza catering, Delft NL) but no evidence of Connecteam use beyond TheirStack.",
    workforce_signals="Mobile event catering crews across 5 Dutch provinces (shift-based, deskless).",
    second_source_url="https://holiepizza.nl",
    notes="Searched: '\"Holie Pizza\" Connecteam', 'Holie Pizza vacature Connecteam app rooster', fetched holiepizza.nl (no app mention). Small (~12), not remote/BPO, so no contact research. " + TS_ONLY)
add("Imperiall", "Connecteam", status="POSSIBLE", confidence_score=15,
    status_reason="Could not identify the company: no domain in input and searches for 'Imperiall' only return unrelated 'Imperial' businesses.",
    notes="Searched: '\"Imperiall\" facilities services Connecteam', 'Imperiall cleaning facilities company website', '\"Imperiall\" LLC'. No company identified; no Connecteam evidence. " + TS_ONLY)
add("Rapid Retail Ltd", "Connecteam", status="POSSIBLE", confidence_score=25,
    status_reason="Company live (modular retail units, Pershore UK; news Jan 2025) but no Connecteam evidence beyond TheirStack.",
    second_source_url="https://rapidretail.co.uk",
    workforce_signals="Field installation crews for modular retail units (UK/EU).",
    notes="Searched: '\"Rapid Retail\" Connecteam', fetched rapidretail.co.uk (no staff app mention). ~23 staff, not remote/BPO, no contact research. " + TS_ONLY)
add("Regus", "Connecteam", status="POSSIBLE", confidence_score=15,
    status_reason="Regus/IWG is a 10k+ enterprise; no evidence it uses Connecteam (SMB deskless tool). Likely a stray detection (e.g., a single franchise/centre job ad).",
    notes="Searched: 'Regus Connecteam app employees', '\"Regus\" OR \"IWG\" community manager job \"Connecteam\"' -> no Connecteam mention in IWG job ads. Enterprise outside target size; no contact research. " + TS_ONLY)
add("Soccer Shots Los Angeles", "Connecteam", status="POSSIBLE", confidence_score=20,
    status_reason="Soccer Shots franchise; coach job ads (CareerPlug) do not mention Connecteam; Soccer Shots network uses its own SportsEngine Motion-based app for coach operations.",
    second_source_url="https://soccershotscareers.careerplug.com/jobs/1933666",
    workforce_signals="Part-time hourly youth soccer coaches travelling between schools/parks.",
    notes="Searched: '\"Soccer Shots\" Connecteam coaches app', '\"Soccer Shots Los Angeles\" Connecteam OR \"time clock\" coach job'. Domain soccershots.org is the national franchisor, not the LA franchise. " + TS_ONLY)
add("WeCcelerate Ltd.", "Connecteam", status="POSSIBLE", confidence_score=15,
    status_reason="Tel Aviv digital-health accelerator/consultancy (CEO Alon Pinhas per CB Insights); an office consultancy is an unlikely Connecteam (deskless) user and no evidence found. Connecteam is also Israeli, so a local-network/test detection is plausible.",
    second_source_url="https://www.cbinsights.com/company/weccelerate/",
    notes="Searched: '\"WeCcelerate\" Israel', 'WeCcelerate Alon Pinhas Connecteam'. ~19 staff, not remote/BPO; no contact research. " + TS_ONLY)

# ---- Timesheet Mobile / Timesheets / busybusy ----
add("Hindson Marina Inc.", "Timesheet Mobile", status="POSSIBLE", confidence_score=25,
    status_reason="Live full-service marina (Penetanguishene, ON); no public evidence of Timesheet Mobile. Marinas often use DockMaster's own mobile time clock instead.",
    second_source_url="https://hindsonmarina.com",
    workforce_signals="Seasonal marina attendants, service techs, housekeeping (hourly, on-site).",
    notes="Searched: '\"Hindson Marina\" timesheet mobile', '\"Hindson Marina\" jobs hiring' (Workopolis ads 403; snippets show no app). Fetched site: no timesheet app mentioned. ~15 staff, not remote/BPO; no contact research. " + TS_ONLY)
add("Laser Pavement Solutions", "Timesheet Mobile", status="POSSIBLE", confidence_score=25,
    status_reason="Real company (Prince George, BC pavement maintenance; president Cam Roberts per ForConstructionPros) but no Timesheet Mobile evidence beyond TheirStack.",
    second_source_url="https://www.forconstructionpros.com/business/article/22954213/inside-the-growth-of-laser-pavement-solutions",
    workforce_signals="Field crews (line painting, sealcoating, snow removal).",
    notes="Searched: '\"Laser Pavement Solutions\"', '\"Laser Pavement Solutions\" \"Timesheet Mobile\" OR timesheetmobile'. ~14 staff; no contact research. " + TS_ONLY)
add("Infant Toddler Family Day Care", "Timesheets", status="POSSIBLE", confidence_score=20,
    status_reason="Real Northern Virginia nonprofit (licensed family day home system since 1983). 'Timesheets' is a name-collision-prone label; no evidence they use Timesheets.com software.",
    second_source_url="https://childcare.virginia.gov/providers/program-types/licensed-family-day-system",
    notes="Searched: '\"Infant Toddler Family Day Care\" timesheets.com', '\"Infant Toddler Family Day Care\" job \"timesheets\" OR \"time clock\"', '\"Infant Toddler Family Day Care\" Virginia'. Nonprofit childcare; no contact research. " + TS_ONLY)
add("Real Projectives®", "Timesheets", status="POSSIBLE", confidence_score=20,
    status_reason="Live real-estate consulting/project management firm (Laurel, MD). Job posts on its ApplicantStack ATS do not name Timesheets.com; 'Timesheets' likely generic.",
    second_source_url="https://realprojectives.com",
    third_source_url="https://realprojectives.applicantstack.com/x/detail/a208elb8h6ft",
    workforce_signals="Hybrid project managers, 10-50% travel nationwide (billable consulting).",
    notes="Searched: '\"Real Projectives\" timesheets', '\"Real Projectives\" job project manager Laurel Maryland'; fetched site and a job post (expired, no software named). ~17 staff; no contact research. " + TS_ONLY)
add("Get Flooring", "busybusy", status="POSSIBLE", confidence_score=25,
    status_reason="Live commercial flooring installer (Wheeling IL and Addison TX) with in-house installer crews - plausible busybusy user but no public evidence beyond TheirStack.",
    second_source_url="https://get-flooring.com",
    workforce_signals="Large team of in-house installers across IL/IN/WI/MI/TX.",
    company_phone="(331) 244-7711; (682) 499-0197", public_email="info@get-flooring.com",
    contact_source_url="https://get-flooring.com",
    notes="Searched: '\"Get Flooring\" busybusy', '\"Get Flooring\" Wheeling Illinois installers jobs time tracking app'; fetched site (no app mention). Phone/email copied from own site while checking it is live. " + TS_ONLY)
add("JDavis Painting", "busybusy", status="POSSIBLE", confidence_score=25,
    status_reason="Live family-run Toronto painting contractor (since 2020); no busybusy evidence beyond TheirStack.",
    second_source_url="https://jdavispainting.com",
    workforce_signals="Painting crews on residential/commercial job sites.",
    company_phone="647.490.4030", public_email="hello@jdavispainting.com", contact_source_url="https://jdavispainting.com",
    notes="Searched: '\"JDavis Painting\" busybusy'; fetched site (no app mention). Phone/email copied from own site while checking it is live. " + TS_ONLY)

# ---- Toggl / Everhour / QuickBooks Time / clockodo ----
add("Creative For More", "Toggl Track", status="POSSIBLE", confidence_score=25,
    status_reason="Live cross-border digital marketing agency (Singapore HQ, Tokyo, NYC from Nov 2025); billable agency profile fits Toggl but no public evidence beyond TheirStack.",
    second_source_url="https://markets.financialcontent.com/pennwell.renewableenergy/article/abnewswire-2025-11-4-creative-for-more-expands-to-new-york-city-helping-us-brands-grow-across-asia",
    employee_count="15-25", employee_count_source_url="https://syncgtm.com/directory/agency/creative-for-more",
    workforce_signals="Agency with distributed team across Singapore, Tokyo and New York (billable client work).",
    contacts=[{"name": "Geraldine Pang", "title": "Founder", "linkedin": "", "source_url": "https://markets.financialcontent.com/pennwell.renewableenergy/article/abnewswire-2025-11-4-creative-for-more-expands-to-new-york-city-helping-us-brands-grow-across-asia"}],
    company_phone="+65 9699 5377", contact_source_url="https://markets.financialcontent.com/pennwell.renewableenergy/article/abnewswire-2025-11-4-creative-for-more-expands-to-new-york-city-helping-us-brands-grow-across-asia",
    pitch_angle="Multi-office agency (SG/Tokyo/NYC) - one tool for billable time plus remote team visibility across time zones.",
    notes="Searched: '\"Creative For More\" Singapore Toggl', '\"Creative For More\" job tools Toggl OR time tracking', founder search. creativeformore.com returned empty page to fetch. Syncgtm lists ~25 staff (input says 15). Phone from Nov 2025 press release (ABNewswire). " + TS_ONLY)
add("Iceberg RevOps", "Everhour", status="POSSIBLE", confidence_score=25,
    status_reason="Live RevOps consultancy (founded 2018; HubSpot/Salesforce partner; remote consultants per job ads). Billable consulting fits Everhour but no public evidence beyond TheirStack.",
    second_source_url="https://builtinaustin.com/company/iceberg-revops",
    workforce_signals="Remote RevOps consultants/architects (jobgether remote listing), billable client projects.",
    notes="Searched: '\"Iceberg RevOps\" Everhour', '\"Iceberg RevOps\" job remote consultant \"time tracking\" OR Everhour OR Harvest'. ~14 staff (below 25), no contact research. " + TS_ONLY)
add("Myosin Marketing", "Toggl Track", status="POSSIBLE", confidence_score=15,
    status_reason="myosin.io now 301-redirects to thesingulariti.ai ('marketing intelligence platform'), suggesting the agency rebranded/pivoted; no Toggl evidence. Verify company status before outreach.",
    second_source_url="https://thesingulariti.ai/",
    notes="Searched: 'Myosin myosin.io Toggl time tracking', '\"Myosin\" marketing agency job \"Toggl\"', 'Myosin Singulariti rebrand Austin' (no confirmation of rebrand). Fetched myosin.io -> 301 to thesingulariti.ai. " + TS_ONLY)
add("Pixel", "Everhour", status="POSSIBLE", confidence_score=25,
    status_reason="Live web design/dev firm (Edmonton + Victoria, since 2005); agency fits Everhour but no public evidence beyond TheirStack.",
    second_source_url="https://wearepixel.ca",
    company_phone="780-887-3897", public_email="YEG@wearepixel.ca", contact_source_url="https://wearepixel.ca",
    workforce_signals="Agency with two offices (Edmonton, Victoria); billable client projects.",
    notes="Searched: '\"wearepixel\" OR \"Pixel\" Edmonton agency Everhour'; fetched wearepixel.ca (no time tool named). Phone/email copied from own site while checking it is live. " + TS_ONLY)
add("eeCPA plc", "Everhour", status="POSSIBLE", confidence_score=20,
    status_reason="Live Scottsdale CPA firm (since 2004) that says it does not use billable-hour quotas; no Everhour evidence beyond TheirStack. Gusto job post could not be fetched (403).",
    second_source_url="https://jobs.gusto.com/postings/eecpa-plc-certified-public-accountant-cpa-06841347-75a8-42b7-ad49-f86e1512479b",
    notes="Searched: 'eeCPA Scottsdale Everhour'; Gusto job post 403. ~24 staff, office-based; no contact research. " + TS_ONLY)
add("Bay Area Innovations", "QuickBooks Time", status="POSSIBLE", confidence_score=15,
    status_reason="Could not verify the company: bayareainnovations.com shows only a bot-verification screen and searches return unrelated 'Bay Area innovation' content. No QuickBooks Time evidence.",
    notes="Searched: '\"Bay Area Innovations\" QuickBooks Time OR TSheets', '\"Bay Area Innovations\" manufacturer'; fetched domain (verification page only). " + TS_ONLY)
add("EIG Australia", "QuickBooks Time", status="POSSIBLE", confidence_score=15,
    status_reason="EIG Australia (Canning Vale WA fuel & electrical infrastructure) was acquired by ASX-listed Duratec on 31 Jul 2025; its systems are likely to be absorbed into the parent. No QuickBooks Time evidence.",
    second_source_url="https://announcements.asx.com.au/asxpdf/20250801/pdf/06mf4ssgk3jvn6.pdf",
    notes="Searched: '\"EIG Australia\" construction', 'EIG Australia Duratec electrician job QuickBooks OR TSheets OR timesheet app'. Now a Duratec subsidiary - any outreach should go via Duratec. " + TS_ONLY)
add("Kawartha Lakes Construction", "QuickBooks Time", status="POSSIBLE", confidence_score=25,
    status_reason="Live design-build firm (Lakefield, ON; new owners Mark Reid and Ben Reynolds from Sept 2024); no QuickBooks Time evidence beyond TheirStack.",
    second_source_url="https://kawarthanow.com/2024/09/17/lakefields-kawartha-lakes-construction-is-under-new-ownership/",
    workforce_signals="Site construction crews (custom homes, cottages, renovations).",
    notes="Searched: '\"Kawartha Lakes Construction\" QuickBooks Time OR TSheets OR time tracking', ownership search; fetched site (no app). ~20 staff, not remote/BPO; owner names noted from news only, no further contact research. " + TS_ONLY)
add("Scene Ideas Inc.", "QuickBooks Time", status="POSSIBLE", confidence_score=25,
    status_reason="Live staging/set fabrication shop (Richmond/Vancouver BC); scenic carpenter job ads (Betterteam) found but no QuickBooks Time mention seen (posting 404 on fetch).",
    second_source_url="https://sceneideas.ca", third_source_url="https://sceneideas.betterteam.com/scenic-carpenter",
    workforce_signals="Shop and off-site event crews (scenic carpenters).",
    notes="Searched: '\"Scene Ideas\" QuickBooks Time OR TSheets', '\"Scene Ideas\" Vancouver job carpenter timesheet app'. ~22 staff; no contact research. " + TS_ONLY)
add("Stattonrock Construction", "QuickBooks Time", status="POSSIBLE", confidence_score=25,
    status_reason="Live design-build/renovation firm (Abbotsford BC, 15+ years) with in-house crew and millwork shop; no QuickBooks Time evidence beyond TheirStack.",
    second_source_url="https://stattonrock.com",
    workforce_signals="In-house construction crew and millwork shop.",
    notes="Searched: '\"Stattonrock\" construction QuickBooks Time OR TSheets'; fetched site (no app). ~13 staff; no contact research. " + TS_ONLY)
add("Online Rebellion", "clockodo", status="POSSIBLE", confidence_score=25,
    status_reason="Live Würzburg digital marketing agency (Rebel GmbH; SEO/SEA/Shopware) - not broadcast media as input says. Agency fits clockodo but no evidence beyond TheirStack.",
    second_source_url="https://online-rebellion.de", industry="Marketing Services (digital agency)",
    company_phone="+49 931 66399732", public_email="business@online-rebellion.de", contact_source_url="https://online-rebellion.de",
    notes="Searched: '\"Online Rebellion\" clockodo', '\"Online Rebellion\" Würzburg Zeiterfassung OR clockodo Stellenanzeige'; fetched site/imprint (MD Holger Maser). Phone/email copied from own imprint while checking it is live. " + TS_ONLY)

# ---- Harvest Forecast ----
HF = "TheirStack 'harvest-forecast' label is collision-prone (agricultural 'harvest forecast' tools, generic word). "
add("FCB Montréal", "Harvest Forecast", status="POSSIBLE", confidence_score=15,
    status_reason="Montreal office of the FCB network (FCB Canada/IPG, now part of Omnicom). Network agencies normally use group-wide timesheet systems; no Harvest/Forecast evidence found.",
    notes=HF + "Searched: '\"FCB Montréal\" Harvest Forecast OR \"Harvest\" time tracking', '\"FCB Montréal\" agence fermeture OR 2025' (only CF Montréal soccer results). No domain in input. " + TS_ONLY)
add("LEGAL INTERNET SOLUTIONS INC", "Harvest Forecast", status="POSSIBLE", confidence_score=20,
    status_reason="Real company: Legal Internet Solutions Inc. (LISI), Philadelphia law-firm web/marketing agency founded 1998 by Jason P. Lisi. Agency fits Harvest/Forecast but no evidence beyond TheirStack.",
    second_source_url="https://www.brightlocal.com/agency-directory/agencies/legal-internet-solutions-incorporated",
    notes=HF + "Searched: '\"Legal Internet Solutions\" Harvest Forecast OR getharvest', '\"Legal Internet Solutions\" law firm marketing'. Website legalisi.com, phone 215-523-8580 (from BrightLocal snippet, not verified on own site). ~15 staff; no further contact research. " + TS_ONLY)
add("Pixel Fridge", "Harvest Forecast", status="POSSIBLE", confidence_score=10,
    status_reason="Could not identify a UK agency called 'Pixel Fridge' (searches return only harvest-forecasting agri tools and other 'Pixel' agencies). No domain in input.",
    notes=HF + "Searched: '\"Pixel Fridge\" Harvest Forecast', '\"Pixel Fridge\" agency UK'. " + TS_ONLY)
add("Triumph Tech, LLC", "Harvest Forecast", status="POSSIBLE", confidence_score=20,
    status_reason="Live Rock RMS (church management) implementation/dev partner (triumph.tech, (c)2026). Dev consultancy fits Harvest/Forecast but no evidence beyond TheirStack; a job ad seen was in-person.",
    second_source_url="https://triumph.tech",
    workforce_signals="Software consultancy / custom development for churches (billable projects).",
    notes=HF + "Searched: '\"Triumph Tech\" Harvest Forecast OR getharvest', '\"Triumph Tech\" Rock RMS job remote \"Harvest\"'; fetched triumph.tech (no Harvest mention). ~22 staff; no contact research. " + TS_ONLY)
add("iamota", "Harvest Forecast", status="POSSIBLE", confidence_score=25,
    status_reason="Live Shopify Plus agency (Vancouver, founded 2004) with a remote team across Canada - a plausible Harvest/Forecast user, but no evidence beyond TheirStack.",
    company_domain="", second_source_url="https://www.shopify.com/partners/directory/partner/iamota",
    workforce_signals="Remote team across Canada; agency billing enterprise Shopify Plus clients.",
    contacts=[{"name": "Pete Smyth", "title": "CEO & President", "linkedin": "", "source_url": "https://www.cbinsights.com/company/iamota"}],
    pitch_angle="Fully remote agency billing client hours - time tracking with activity visibility for distributed devs.",
    notes=HF + "Searched: 'iamota Harvest Forecast', 'iamota digital agency Canada Shopify', 'iamota job posting Harvest OR Forecast developer remote Canada', CEO search. CEO name from CB Insights search snippet (not verified on own site). " + TS_ONLY)

# ---- Homebase ----
HB = "TheirStack 'homebase' label is collision-prone (generic 'home base', Homebase UK DIY chain, Homecare Homebase EHR, HomeBase homelessness nonprofit). "
ENT = "Enterprise far outside Homebase's SMB hourly-team market; "
add("Arla Foods", "Homebase", status="POSSIBLE", confidence_score=5,
    status_reason=ENT + "no evidence of Homebase software; very likely a name collision (generic phrase or the UK Homebase retailer).",
    notes=HB + "Searched: '\"Arla Foods\" \"Homebase\"' (only generic Arla profiles). No contact research. " + TS_ONLY)
add("Black Sheep", "Homebase", status="POSSIBLE", confidence_score=15,
    status_reason="Ambiguous name; the most prominent Brazilian 'Black Sheep' is a Korean-Japanese restaurant in Florianópolis. Homebase barely operates in Brazil; no evidence found.",
    second_source_url="https://www-lonelyplanet-com-6c06.imagizer.com/brazil/the-south/florianopolis/restaurants/black-sheep/a/poi-eat/1373956/363252",
    notes=HB + "Searched: '\"Black Sheep\" restaurante Brasil Homebase'. No domain in input; identity uncertain (TheirStack page was /sa region). " + TS_ONLY)
add("Bunnings", "Homebase", status="DO_NOT_TARGET", confidence_score=5,
    status_reason="Name collision: Bunnings' owner Wesfarmers bought the UK DIY chain Homebase in 2016, rebranded stores to Bunnings, then sold Homebase to Hilco in 2018. 'Homebase' text about Bunnings refers to that retailer, not Homebase software.",
    second_source_url="https://www.itv.com/news/2018-06-28/303-homebase-jobs-axed-as-bunnings-brand-disappears-from-uk",
    third_source_url="https://www.retailgazette.co.uk/blog/2018/08/wesfarmers-profits-dive-58-homebase-sale/",
    notes=HB + "Searched: 'Bunnings Homebase UK acquisition 2016 sold', 'Bunnings \"Homebase\" team member scheduling app OR joinhomebase'.")
add("District Brewing", "Homebase", status="POSSIBLE", confidence_score=25,
    status_reason="Regina SK microbrewery/taproom (founded 2012) still hiring bartenders/servers and chefs - fits Homebase's hourly hospitality market, but no public evidence beyond TheirStack.",
    second_source_url="https://www.workopolis.com/jobsearch/viewjob/e8feJ3zvY7qXwhfGmvZXfMgnyLhDk1ekDXX8DbBl8qvx94m94V66rnxeroscDhcC",
    workforce_signals="Hourly taproom/kitchen staff (servers, bartenders, chef).",
    notes=HB + "Searched: '\"District Brewing\" Regina Homebase', '\"District Brewing\" Regina job posting 2025 OR closed', '\"District Brewing\" joinhomebase.com OR Homebase hiring'. Note a separate District Brewing exists in Washington State; this row is the Canadian one. ~11 staff; no contact research. " + TS_ONLY)
add("EEI Corporation", "Homebase", status="POSSIBLE", confidence_score=5,
    status_reason=ENT + "PSE-listed Philippine construction group (10k+); no Homebase software evidence; likely generic 'home base' (overseas manpower supply).",
    second_source_url="https://en.wikipedia.org/wiki/EEI_Corporation",
    notes=HB + "Searched: '\"EEI Corporation\" Homebase OR \"home base\"'. No contact research. " + TS_ONLY)
add("Enhabit Home Health & Hospice", "Homebase", status="DO_NOT_TARGET", confidence_score=5,
    status_reason="Name collision: Enhabit uses Homecare Homebase (HCHB), the home-health/hospice EHR - its clinical job ads ask for EMR skills 'preferably HCHB'. Not Homebase (joinhomebase) scheduling software.",
    second_source_url="https://careers.ehab.com/job/dallas/manager-of-clinical-applications/39891/92934133760",
    third_source_url="https://themuse.com/jobs/enhabithomehealthhospice/registered-nurse-rn-clinical-team-leader-home-health-ca727e",
    notes=HB + "Searched: 'Enhabit \"Homecare Homebase\" OR HCHB', 'Enhabit home health job \"HCHB\" OR \"Homecare Homebase\" clinician'.")
add("Fortum", "Homebase", status="POSSIBLE", confidence_score=5,
    status_reason=ENT + "Finnish energy utility (20k); no Homebase software evidence; likely generic phrase.",
    notes=HB + "Searched: 'Fortum \"Homebase\"' (only generic Fortum results). No contact research. " + TS_ONLY)
add("Future Evidence Foundation", "Homebase", status="POSSIBLE", confidence_score=10,
    status_reason="Live remote-first nonprofit behind Covidence (UK/ANZ teams of salaried knowledge workers) - not an hourly-shift Homebase profile; no evidence. Possible collision with HomeBase (homelessness nonprofit) or generic 'home base'.",
    second_source_url="https://futureevidence.org",
    workforce_signals="Fully remote global team (UK and ANZ).",
    notes=HB + "Searched: '\"Future Evidence Foundation\" Homebase', 'Covidence \"Future Evidence Foundation\" \"Homebase\" OR \"home base\" team'; fetched site (no mention). ~21 staff; no contact research. " + TS_ONLY)
add("Gategroup", "Homebase", status="DO_NOT_TARGET", confidence_score=5,
    status_reason=ENT + "airline catering group (40k+ staff, 200+ kitchens) with its own workforce systems; 'home base' is a standard aviation/crew term in its job ads. Treated as name collision; no Homebase software evidence.",
    notes=HB + "Searched: 'gategroup \"Homebase\" OR \"home base\" job'. No contact research.")
add("Gentiva", "Homebase", status="DO_NOT_TARGET", confidence_score=5,
    status_reason="Name collision: Gentiva (formerly Kindred at Home) selected Homecare Homebase (HCHB) as its EMR in 2019. 'Homebase' refers to the home-health EHR, not Homebase scheduling software.",
    second_source_url="https://www.dmagazine.com/healthcare-business/2019/03/local-software-company-lands-nations-largest-home-health-provider/",
    third_source_url="https://careers-gentivahs.icims.com/jobs/124102/enterprise-emr-solution-specialist/job",
    notes=HB + "Searched: 'Gentiva \"Homecare Homebase\" HCHB', 'Gentiva job \"HCHB\" experience preferred', '\"Kindred at Home\" OR Gentiva hospice \"Homecare Homebase\" EMR'.")
add("HIVE", "Homebase", status="POSSIBLE", confidence_score=10,
    status_reason="Live co-living operator (Hive JVC Dubai, ARM Holding; expanding to Abu Dhabi/RAK/Riyadh). No Homebase mention on site or in searches; Homebase has little UAE presence.",
    second_source_url="https://cometohive.com",
    notes=HB + "Searched: 'HIVE co-living Dubai JVC \"Homebase\"'; fetched cometohive.com (no mention). ~23 staff; no contact research. " + TS_ONLY)
add("Health New Zealand | Te Whatu Ora", "Homebase", status="DO_NOT_TARGET", confidence_score=5,
    status_reason="Public health system; rosters 15k+ staff on UKG Workforce Pro ('Mahi e Taea') and Core Schedule in some districts. No Homebase software; match is a collision (e.g., 'Home-Based Treatment' teams / generic phrase).",
    second_source_url="https://careers.adhb.govt.nz/health-careers-job-search/details/ADHB22337",
    notes=HB + "Searched: '\"Te Whatu Ora\" \"Homebase\"', '\"Health New Zealand\" OR \"Te Whatu Ora\" Homebase app rostering OR \"HomeBase\" system'. Government agency - not a sales target.")
add("Korean Air", "Homebase", status="DO_NOT_TARGET", confidence_score=5,
    status_reason="Name collision: 'home base' is a standard aviation crew term; Korean Air runs crew management on IBS Software iFlight. No Homebase software evidence.",
    second_source_url="https://centreforaviation.com/news/korean-air-deploysibs-softwares-iflight-platform-for-flight-operations-and-crew-management-1352258",
    notes=HB + "Searched: '\"Korean Air\" \"Homebase\" job OR software'.")
add("Midea Group", "Homebase", status="POSSIBLE", confidence_score=5,
    status_reason=ENT + "Chinese appliance maker (20k+); no Homebase software evidence; likely collision with smart-home/'home base' product wording.",
    notes=HB + "Searched: 'Midea \"Homebase\" OR \"HomeBase\" product'. No contact research. " + TS_ONLY)
add("Orbit Teleservices", "Homebase", status="POSSIBLE", confidence_score=10,
    status_reason="Philippine BPO (Indeed lists 51-200 staff; offices Pasig/Makati, Jakarta, SF virtual address) - strong Tavilo profile, but no Homebase evidence, and its domain orbit-teleservices.com no longer resolves (DNS ENOTFOUND on 2026-10-07). Verify the company is still operating before outreach.",
    second_source_url="https://www.kalibrr.com/id-ID/c/orbit-teleservices/jobs",
    third_source_url="https://ph.indeed.com/cmp/Orbit-Teleservices/faq",
    employee_count="51-200", employee_count_source_url="https://ph.indeed.com/cmp/Orbit-Teleservices/salaries",
    workforce_signals="BPO / call center (customer service agents, IT support) in Philippines and Indonesia.",
    pitch_angle="Offshore BPO - per-agent time, activity and screenshot proof for client billing.",
    notes=HB + "Searched: '\"Orbit Teleservices\" Philippines', '\"Orbit Teleservices\" CEO OR founder OR president' (no leader found), '\"Orbit Teleservices\" Homebase OR \"Time Doctor\" OR Hubstaff OR time tracking', website/LinkedIn search. Domain DNS fails (with and without www); Indeed 403; OnlineJobs.ph post is from 2017. No decision maker, phone or email found on public pages. " + TS_ONLY)
add("PAWLS", "Homebase", status="POSSIBLE", confidence_score=15,
    status_reason="Live Puerto Rico pet-supplement/care brand (San Juan; sold via retail points in 78 municipalities + app). Homebase operates in PR, but no public evidence beyond TheirStack.",
    second_source_url="https://pawls.co",
    notes=HB + "Searched: '\"Pawls\" Puerto Rico joinhomebase OR Homebase empleo'; fetched pawls.co (no staff tool mention). ~11 staff; no contact research. " + TS_ONLY)

add("Matte PR", "Toggl Track", status="POSSIBLE", confidence_score=25,
    status_reason="Live Toronto boutique lifestyle PR agency (~11 staff). Search summaries claiming 'Matte PR uses Toggl' trace back only to TheirStack's own Toggl list pages, so no independent evidence.",
    second_source_url="https://www.princanada.com/directory/agencies/matte-pr/",
    workforce_signals="PR agency tracking billable client hours.",
    notes="Searched: '\"Matte PR\" Toggl', '\"Matte PR\" job account coordinator time tracking Toggl OR \"track your time\"' (only theirstack.com/de|it/technology/toggl hits). Below 25 staff; no contact research. " + TS_ONLY)
