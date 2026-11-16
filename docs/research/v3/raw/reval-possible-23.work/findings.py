HB = "Homebase (joinhomebase.com) is a US/Canada hourly-shift scheduling + time-clock app; it does not do activity/screenshot monitoring. "
P = lambda reason, score, notes, **kw: dict(status="POSSIBLE", status_reason=reason, confidence_score=score, notes=notes, **kw)
D = lambda reason, notes, **kw: dict(status="DO_NOT_TARGET", status_reason=reason, confidence_score=5, notes=notes, **kw)

FINDINGS = {
 ("QinetiQ", "Homebase"): P(
   "Only TheirStack; no source ties QinetiQ to Homebase software. UK defence contractor (salaried/cleared staff) is an unlikely Homebase customer; 'Homebase' in UK text usually means the DIY retailer or 'home base' location.",
   10, "Searched '\"QinetiQ\" \"Homebase\" app scheduling' and 'QinetiQ job \"home base\" OR \"homebase\" location': nothing about Homebase software. Over 2,500 staff, not remote/BPO: no contact research."),
 ("Radisson Hotel Philadelphia", "Homebase"): P(
   "Only TheirStack. Searches return only 'perfect home base for exploring the city' marketing copy (generic phrase), nothing on Homebase software.",
   15, "Searched '\"Radisson Hotel Philadelphia\" Homebase' (hits are travel copy calling the hotel a 'home base') and 'Radisson Hotel Philadelphia hiring job Homebase app clock in' (nothing). Single franchised US hotel (212 rooms); employee count 9.2k is the Radisson group. No domain given. Hourly US hotel staff make Homebase plausible but unproven; probable TheirStack collision with 'home base' wording. No contact research (not remote/BPO).",
   second_source_url="https://lodgingmagazine.com/radisson-hotel-philadelphia-opens/"),
 ("SKINTIFIC", "Homebase"): P(
   "Only TheirStack; Indonesian skincare brand. No source mentions Homebase software; Homebase does not target Indonesia. Likely 'homebase' wording (e.g. work location) in a job ad.",
   10, "Searched '\"SKINTIFIC\" \"Homebase\"' and 'SKINTIFIC lowongan \"homebase\"' (job ads on Dealls/Kalibrr show on-site Jakarta roles; no Homebase software). Not remote/BPO: no contact research."),
 ("SLATE", "Homebase"): P(
   "Only TheirStack; 8-person Australian ad agency could not be clearly identified; no Homebase evidence.",
   10, "Searched 'SLATE advertising agency Australia homebase' and the company name: could not identify the company or any Homebase mention. Under 25 staff: no contact research."),
 ("Singapore American School", "Homebase"): P(
   "Only TheirStack. Schools commonly use 'homebase' for homeroom/advisory periods; no source shows Homebase software at SAS, and Homebase does not serve Singapore schools.",
   8, "Searched '\"Singapore American School\" \"Homebase\"' and 'site:sas.edu.sg homebase': only a 'home base' alumni-event phrase, nothing about the software. Not remote/BPO: no contact research."),
 ("Spark", "Homebase"): P(
   "Only TheirStack; Spark NZ (telco, 5k staff). No source ties Spark to Homebase software; 'Spark' + 'homebase' also collides with generic text.",
   10, "Searched '\"Spark\" New Zealand \"Homebase\" app staff rostering OR \"Spark homebase\"': only Homebase vendor/Capterra NZ pages, nothing about Spark using it. Over 2,500 staff: no contact research."),
 ("Sticky Rice", "Homebase"): P(
   "Only TheirStack; 9-person Malaysian restaurant not clearly identifiable; no Homebase evidence.",
   10, "Searched '\"Sticky Rice\" Malaysia restaurant Homebase': results are unrelated Sticky Rice restaurants (Singapore, London, Japan). Could not identify this company. Under 25 staff: no contact research."),
 ("Symbiote Technologies Pvt. LTD", "Homebase"): P(
   "Only TheirStack; 4-person Lahore software house. No Homebase evidence; Homebase (US hourly scheduling) unlikely for a Pakistani software house.",
   10, "Searched '\"Symbiote Technologies\" Pakistan' (Mustakbil profile: Lahore software house, no open roles) and the Homebase pairing: nothing. Under 25 staff: no contact research.",
   second_source_url="https://www.mustakbil.com/companies/company/116930"),
 ("THG", "Homebase"): P(
   "Only TheirStack; THG (UK e-commerce, 5k+). No source ties THG to Homebase software. In UK text 'Homebase' is usually the DIY retail chain (likely collision).",
   10, "Searched '\"THG\" Homebase app OR \"THG\" \"homebase\" job': only Homebase vendor pages. Over 2,500 staff: no contact research."),
 ("TMS", "Homebase"): P(
   "Only TheirStack; 'TMS' (Greek restaurants, 1.3k) could not be identified with confidence; no Homebase evidence. Homebase does not serve Greece.",
   8, "Searched 'TMS Greece restaurants' (results only about Goody's-Everest group, not clearly TMS). No domain. Not remote/BPO: no contact research."),
 ("The Breakroom", "Homebase"): P(
   "Only TheirStack; 4-person Egyptian facilities company could not be identified; 'breakroom' is a generic word. No Homebase evidence.",
   8, "Searched '\"The Breakroom\" Egypt facilities homebase': only generic breakroom pages. Under 25 staff: no contact research."),
 ("V-ZUG", "Homebase"): P(
   "Only TheirStack; Swiss appliance maker. A V-ZUG field-sales ad on jobup.ch surfaced for 'Homebase' (Swiss ads use 'Homebase' for a field worker's home region); no Homebase software evidence.",
   8, "Searched '\"V-ZUG\" \"Homebase\"': hits were a jobup.ch regional advisor ad (page now 404, so the wording could not be read) and Homey smart-home app pages. Likely collision with 'Homebase: region' job-ad wording. Not remote/BPO: no contact research.",
   second_source_url="https://jobup.ch/en/jobs/detail/b0d2403e-cec1-4e78-aa58-cfdd5d830809"),
 ("Vintage Hotels", "Homebase"): P(
   "Only TheirStack. Canadian hotel group (Niagara-on-the-Lake, hourly staff) is a plausible Homebase-type user, but no source names the tool.",
   20, "Searched '\"Vintage Hotels\" Niagara Homebase' and 'Vintage Hotels ... job scheduling app Homebase OR 7shifts OR Deputy': nothing names any scheduling tool. HQ 526 Regent St, Niagara-on-the-Lake ON. Not remote/BPO: no contact research.",
   second_source_url="https://www.vintage-hotels.com/niagara-on-the-lake-hotels/"),
 ("Vonas", "Homebase"): P(
   "Only TheirStack; VONAS Media is a ~10-person Makati video-production house. No Homebase evidence.",
   10, "Searched '\"Vonas\" Philippines media production': company confirmed real (Indeed PH, Twine), no mention of Homebase. Under 25 staff: no contact research.",
   second_source_url="https://ph.indeed.com/cmp/Vonas-Media/about"),
 ("Zalo", "Homebase"): P(
   "Only TheirStack; Zalo (VNG, Vietnam). In Vietnam 'Homebase' is also a proptech company (homebase.vn), a likely collision; no Homebase software evidence.",
   8, "Searched '\"Zalo\" tuyển dụng \"homebase\"': results are Homebase VN proptech and Base E-Hiring/Zalo OA, nothing showing Zalo uses Homebase scheduling. Not remote/BPO: no contact research."),
 ("cablex AG", "Homebase"): P(
   "Only TheirStack; cablex AG (Swisscom group network-infrastructure contractor). No Homebase software evidence; Swiss job ads use 'Homebase' for a technician's home region, and eufy 'HomeBase' is a product.",
   8, "Searched '\"cablex\" \"Homebase\"': only eufy HomeBase device pages and Crunchbase/Craft profiles. Not remote/BPO: no contact research."),
}

TA = "Time Analytics (timeanalyticssoftware.com, London) is a small timesheet tool; the phrase 'time analytics' mostly appears as part of 'real-time analytics'. "
FINDINGS.update({
 ("Programmed", "Paymo"): P(
   "Only TheirStack; Programmed (Australian staffing/facility maintenance, ~30k staff incl. casual workforce). Paymo is built for small teams (<20 people); no source ties Programmed to Paymo.",
   8, "Searched '\"Programmed\" Australia \"Paymo\"' and 'Programmed Skilled Workforce job \"Paymo\" timesheet': only Paymo review pages and Programmed Indeed salary pages. Over 2,500 staff: no contact research.",
   second_source_url="https://www.programmed.com.au/services"),
 ("Almosafer", "Time Analytics"): P(
   "Only TheirStack. Almosafer's TheirStack-indexed jobs are Data Intelligence analyst roles (sabbar.com), where 'time analytics' most likely comes from 'real-time analytics'; no source names the Time Analytics product.",
   8, TA + "Searched '\"Almosafer\" \"Time Analytics\"' and 'Almosafer job \"real-time analytics\" Riyadh': hits are Specialist/Officer Data Intelligence ads on sabbar.com (page returned 410, wording not read). Probable 'real-time analytics' collision. Not remote/BPO: no contact research.",
   second_source_url="https://sabbar.com/en/jobs/c-riyadh-r-specialist-data-intelligence/id-688d442c-87a2-4e43-bcf7-76af9e7c690a"),
 ("FQM Zambia", "Time Analytics"): P(
   "Only TheirStack; First Quantum (Kansanshi/Sentinel mines). No source mentions the Time Analytics product; likely 'real-time analytics' wording in a mining/HR-systems job ad.",
   8, TA + "Searched '\"First Quantum\" Zambia \"time analytics\"' (only 2018 tax-analysis news) and 'First Quantum Minerals Kansanshi job \"real-time analytics\" OR \"time analytics\"' (job ads on gozambiajobs, none naming the tool). Not remote/BPO: no contact research."),
 ("Istekki Oy", "Time Analytics"): P(
   "Only TheirStack; Istekki (Finnish public-sector health IT company). No source mentions Time Analytics; likely 'real-time analytics' wording.",
   8, TA + "Searched '\"Istekki\" \"Time Analytics\" OR \"reaaliaikainen analytiikka\"' and 'Istekki Oy työaikaseuranta OR tuntikirjaus järjestelmä': nothing about Istekki's time tool. Not remote/BPO: no contact research."),
 ("Sword Group", "Time Analytics"): P(
   "Only TheirStack; Sword Group (Luxembourg IT services). No source ties Sword to the Time Analytics product; likely 'real-time analytics' in an IT job ad.",
   8, TA + "Searched '\"Sword Group\" OR \"Sword Technologies\" timesheets tool \"time analytics\"': only vendor/StackShare pages. Not remote/BPO (consultants on client sites): no contact research."),
 ("Sword Group", "Timesheets"): P(
   "Only TheirStack; 'timesheets' is a generic word (consultants submit timesheets); no source names a Timesheets.com product at Sword.",
   8, "Searched 'Sword Group careers \"timesheets\" job description Luxembourg': only generic timesheet roles at other Luxembourg firms. Likely generic-word collision. No contact research."),
 ("Temenos", "Time Analytics"): D(
   "False match: Temenos is a banking-software vendor whose own product and job text repeatedly says 'real-time analytics' (Temenos Analytics: 'real-time customer analytics'). No source ties Temenos to the Time Analytics timesheet product.",
   TA + "Searched '\"Temenos\" \"Time Analytics\" software': results are Temenos Analytics product pages describing real-time analytics, plus separate Time Analytics vendor listings. No contact research.",
   second_source_url="https://www.temenos.com/?p=1311"),
})

TT = "TheirStack 'time-tracker' is a generic phrase (many unrelated apps: eBillity Time Tracker, CloudApper, in-house 'time tracker' sheets). "
FINDINGS.update({
 ("2020 Companies", "Time Tracker"): P(
   "Only TheirStack; 2020 Companies (US retail-merchandising/field-marketing staffing). No source names a 'Time Tracker' product; field staff hourly time-keeping makes some time tool likely, but the vendor is unknown.",
   12, TT + "Searched '\"2020 Companies\" \"time tracker\" app' (only unrelated 2020 Insight / ExhibitForce TimeTracker) and '2020 Companies careers retail merchandising \"Time Tracker\" app clock hours' (generic retail time-clock pages). Over 2,500 staff: no contact research."),
 ("Advertising Saga", "Time Tracker"): P(
   "Only TheirStack; could not identify a company named Advertising Saga in India (searches return Social Samosa's 'Brand Saga' series).",
   8, TT + "Searched '\"Advertising Saga\" India': no matching company. Under 25 staff: no contact research."),
 ("Applegreen", "Time Tracker"): P(
   "No evidence for a 'Time Tracker' product. A CloudApper case study says Applegreen (US forecourt stores) clocks staff with CloudApper AI TimeClock on iPads integrated with UKG Dimensions, so the TheirStack hit is most likely generic 'time tracking' wording.",
   10, TT + "Searched '\"Applegreen\" \"time tracker\" OR \"timetracker\" staff': CloudApper case study (ukg.cloudapper.ai, undated) on Applegreen moving to CloudApper AI TimeClock + UKG Dimensions; no hourly-monitoring competitor. CloudApper/UKG are not in Tavilo's competitor vendor list, so no extra record added. Not remote/BPO: no contact research.",
   second_source_url="https://ukg.cloudapper.ai/?p=88901",
   workforce_signals="Hourly forecourt/convenience/restaurant staff; iPad time clocks with face recognition (CloudApper + UKG Dimensions)"),
 ("Arada", "Time Tracker"): P(
   "Only TheirStack; Arada (Sharjah property developer). No source names a time-tracker product.",
   8, TT + "Searched '\"Arada\" Sharjah developer \"time tracker\"' and 'Arada careers job \"time tracker\" OR \"time tracking\" Aljada': nothing. Not remote/BPO: no contact research."),
 ("Ashirvad by aliaxis", "Time Tracker"): P(
   "Only TheirStack; Ashirvad Pipes (Aliaxis, India). No source names a time-tracker product.",
   8, TT + "Searched '\"Ashirvad\" pipes \"time tracker\" OR \"timetracker\"' and the company with time tracking: nothing. Not remote/BPO: no contact research."),
 ("BPTP Ltd.", "Time Tracker"): P(
   "Only TheirStack; BPTP (Gurgaon real-estate developer). No source names a time-tracker product.",
   8, TT + "Searched '\"BPTP\" \"time tracker\" OR \"timetracker\"' and 'BPTP Ltd Gurgaon job description tracker ...': only NRI-sales job ads and generic real-estate time-tracking vendor pages. Not remote/BPO: no contact research.",
   second_source_url="https://ambitionbox.com/jobs/bptp-limited-jobs"),
 ("BYK Additives", "Time Tracker"): P(
   "Only TheirStack; BYK (ALTANA chemicals, Wesel, Germany). German ads use 'Zeiterfassung' generically; no source names a time-tracker product.",
   8, TT + "Searched '\"BYK\" Additives job \"time tracker\" OR \"Zeiterfassung\"' (Glassdoor BYK job list, generic Zeiterfassung vendors) and the company + time tracker: nothing. Not remote/BPO: no contact research."),
 ("BwLogics", "Time Tracker"): P(
   "Only TheirStack; BwLogics (Lahore web-dev agency, founded 2016) offers offshore staffing on hourly contracts, so time tracking is plausible, but no source names a tool.",
   15, TT + "Searched '\"BwLogics\" Pakistan', 'bwlogics.com \"time tracker\" OR hubstaff OR \"time tracking\"', and BwLogics CEO/contact: no tool named, no decision maker found. bwlogics.com/contact returned a bot-check page; TechBehemoths profile 403. TechBehemoths snippet: team 10-49 (site claims 50 engineers).",
   second_source_url="https://techbehemoths.com/company/bwlogics",
   workforce_signals="Offshore staffing / team augmentation; remote developers on hourly, monthly or fixed-price contracts",
   pitch_angle="Offshore dev-staffing agency billing clients hourly: pitch time + activity proof for client billing."),
})

FINDINGS.update({
 ("DRAC MARKETING", "Time Tracker"): P(
   "Only TheirStack; could not identify an 8-person 'DRAC Marketing' in Mexico; no time-tracker evidence.",
   8, TT + "Searched '\"DRAC Marketing\" México': only D&B directory pages, no matching company. Under 25 staff: no contact research."),
 ("Euler Motors", "Time Tracker"): P(
   "Only TheirStack; Euler Motors (Delhi EV maker). No source names a time-tracker product.",
   8, TT + "Searched '\"Euler Motors\" \"time tracker\" OR \"time tracking\"' and 'Euler Motors careers HR attendance software employees': nothing. Not remote/BPO: no contact research."),
 ("Fooditive Group", "Time Tracker"): P(
   "Only TheirStack; 5-person Dutch food-ingredient startup. No time-tracker evidence.",
   8, TT + "Searched '\"Fooditive\" \"time tracker\" OR \"time tracking\"' and the company: nothing. Under 25 staff: no contact research."),
 ("Healthstin", "Time Tracker"): P(
   "Only TheirStack; Healthstin is an Australian NDIS allied-health provider (exercise physiology, mobile services). No time-tracker evidence.",
   10, TT + "Searched '\"Healthstin\" Australia' (NDIS Commission, Indeed AU, disability-provider listings) and the company + time tracker: no tool named. Listed at 4 staff: no contact research.",
   second_source_url="https://www.ndiscommission.gov.au/provider-registration/healthstin"),
 ("Jackson Hewitt - 2861", "Time Tracker"): D(
   "False match: Jackson Hewitt franchise job ads (CareerPlug) list manager duties such as 'monitor time tracker during all shifts' and approve timecards, i.e. the franchise's own timekeeping, not a 'Time Tracker' product. Franchise 2861 is an individual franchisee with no domain.",
   TT + "Searched '\"Jackson Hewitt\" \"time tracker\" franchise employees clock' and '\"Jackson Hewitt\" \"monitoring time tracker\"': snippets of CareerPlug franchise ads with the generic duty line. Fetched one CareerPlug ad (3495): no tool named. No contact research.",
   second_source_url="https://jackson-hewitt-2215.careerplug.com/jobs",
   evidence_quote="monitor time tracker during all shifts"),
 ("LatestBuy", "Time Tracker"): P(
   "Only TheirStack; LatestBuy (small Australian online retailer, seen only on cashback sites). No time-tracker evidence.",
   8, TT + "Searched '\"LatestBuy\" Australia': only cashback listings. Under 25 staff: no contact research."),
 ("Mark Anthony Group", "Time Tracker"): P(
   "Only TheirStack; Mark Anthony Group (Vancouver beverages, White Claw). No source names a time-tracker product.",
   8, TT + "Searched '\"Mark Anthony Group\" \"time tracker\" OR \"time tracking\"' and 'Mark Anthony Brands job posting tracker ... timesheet': nothing. Not remote/BPO: no contact research."),
 ("Marley Spoon", "Time Tracker"): P(
   "No 'Time Tracker' product found. UKG customer story says Marley Spoon warehouse staff clock in on UKG InTouch clocks with UKG Ready, so the TheirStack hit is most likely generic wording.",
   8, TT + "Searched '\"Marley Spoon\" \"time tracker\" OR \"time tracking\" warehouse': UKG Australia customer story + Food Magazine article (Marley Spoon uses UKG Ready / InTouch time clocks). UKG is not in Tavilo's competitor vendor list, so no extra record added. Not remote/BPO: no contact research.",
   second_source_url="https://www.ukg.com.au/customers/marley-spoon",
   third_source_url="https://www.foodmag.com.au/cooking-rapidly-expanding-business-accompaniment-ukg/",
   workforce_signals="Hourly warehouse/fulfilment staff; UKG InTouch time clocks"),
 ("Mashreq", "Time Tracker"): P(
   "Only TheirStack; Mashreq (UAE bank, ~9k staff). No source names a time-tracker product.",
   8, TT + "Searched '\"Mashreq\" \"time tracker\" job' and 'Mashreq Bank job description \"time tracker\" OR \"time-tracker\" Dubai': nothing. Over 2,500 staff: no contact research."),
})

FINDINGS.update({
 ("Intellias", "Time Tracker"): P(
   "Only TheirStack; Intellias (Ukraine-founded software outsourcing, ~3k engineers). No source names a 'Time Tracker' product; IT outsourcers typically log hours in Jira/internal tools, and 'time tracker' is generic.",
   10, TT + "Searched '\"Intellias\" \"time tracker\" OR \"time tracking\" employees tool' and 'Intellias job \"time tracker\" OR \"time-tracker\" developer project': only IntelliJ/time-tracking vendor content. Over 2,500 staff: no contact research.",
   workforce_signals="Software outsourcing / distributed engineering teams (Ukraine, Poland, other nearshore hubs)"),
 ("Nyrstar", "Time Tracker"): P(
   "Only TheirStack; Nyrstar (zinc/lead smelting, Trafigura-owned). No source names a time-tracker product.",
   8, TT + "Searched '\"Nyrstar\" \"time tracker\"' and 'Nyrstar Port Pirie OR Hobart job ad timesheet tracker ...': only Hobart production/payroll job ads (2026) with no tool named. Over 2,500 staff: no contact research.",
   second_source_url="https://jobs.nyrstar.com/job/Hobart-Payroll-Officer/1369810457/"),
 ("OHLA Group", "Time Tracker"): P(
   "Only TheirStack; OHLA (Spanish construction group). No source names a time-tracker product.",
   8, TT + "Searched '\"OHLA\" OR \"OHL\" construction \"time tracker\" job' and 'OHLA USA careers \"Time Tracker\" OR \"timekeeping\" software field': only OHLA USA project-engineer/scheduler ads and generic field-timekeeping vendors. Over 2,500 staff: no contact research."),
 ("RATP Dev Mobility Cairo", "Time Tracker"): P(
   "Only TheirStack; RATP Dev Mobility Cairo operates Cairo Metro Line 3 and the LRT (3,000+ staff). No time-tracker product found; its 'Mobility Cairo' passenger app shows next-train times, a possible source of a generic match.",
   8, TT + "Searched '\"Mobility Cairo\" RATP Dev \"time tracker\" OR \"time tracking\"' and 'Mobility Cairo app \"train tracker\" OR \"real-time\" ...': company pages and the passenger app only. Not remote/BPO: no contact research.",
   second_source_url="https://mobilitycairo.com/en/about-us/our-company"),
 ("Sentrium", "Time Tracker"): P(
   "Only TheirStack; could not identify a 1-person 'Sentrium' import/export business in Australia.",
   5, TT + "Searched '\"Sentrium\" Australia wholesale import export': no matching company. No contact research."),
 ("Tecnoempleo", "Time Tracker"): D(
   "Tecnoempleo is a Spanish IT job board, not an end user; TheirStack most likely credited it with tools named in third-party job ads it hosts. No source shows Tecnoempleo itself using a time-tracker product.",
   TT + "Searched '\"Tecnoempleo\" \"time tracker\" OR \"timetracker\"': nothing linking the job board to a time-tracker tool. No contact research."),
})
