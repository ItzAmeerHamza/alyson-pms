D = {}
RC = "Re-checked 2026-10-07. "
TS = "TheirStack-only; no corroboration found."

def P(name, vendor, conf, reason, notes, **kw):
    d = dict(status="POSSIBLE", confidence_score=conf, status_reason=reason, notes=RC + notes)
    d.update(kw)
    D[(name, vendor)] = d

def X(name, vendor, reason, notes, **kw):
    d = dict(status="DO_NOT_TARGET", confidence_score=0, status_reason=reason, notes=RC + notes)
    d.update(kw)
    D[(name, vendor)] = d

SYM = ("ClickTime hit very likely a false match: large enterprises route e-mail links through Symantec/Broadcom "
       "'Click-time URL Protection' (clicktime.symantec.com), which shows up in public documents and is read as the ClickTime timesheet product.")

# 1-5
P("Premium Invention Inc.", "Hubstaff", 10, TS + " Micro e-commerce company (~2 staff).",
  "Searches: \"Premium Invention\" Hubstaff; premiuminvention.com Hubstaff remote jobs. Site live (200). Nothing found. Under 10 employees; no outreach research.",
  company_phone="(800) 348-6387", contact_source_url="")
P("Professional Drone Solutions LLC", "DeskTime", 10, TS + " ~5-person drone services firm; DeskTime implausible.",
  "Searches: \"Professional Drone Solutions\" DeskTime; prodrones.com DeskTime. Site live. Nothing found. Under 10 employees; input contact (Andrew Kobza, CEO/Founder) not re-verified, so dropped per rules.")
X("Edwin Lim Medical Aesthetic Clinic", "Time Doctor",
  "Keyword false match: 'Time Doctor' collides with a doctor-run clinic; no sign of the Time Doctor software. In-person aesthetic clinic, under 10 staff.",
  "Searches: \"Edwin Lim\" clinic \"Time Doctor\"; edwinlimclinic.sg timedoctor. Only generic Time Doctor pages returned.")
P("Huntingdon Properties Ltd", "Time Doctor", 5, TS + " Companies House shows Huntingdon Properties Limited (04225454), Nottingham, a letting/own-real-estate company; tiny, identity thin.",
  "Searches: \"Huntingdon Properties Ltd\" \"Time Doctor\"; \"Huntingdon Properties\" Ltd UK. A TrustRadius Time Doctor review by an unnamed property-management firm surfaced but does not name this company. Micro; no outreach research.",
  second_source_url="https://find-and-update.company-information.service.gov.uk/company/04225454")
P("Mehra Life Sciences Private Limited", "Time Doctor", 5, TS + " Micro Delhi trading company; could not even confirm a website.",
  "Searches: \"Mehra Life Sciences\" \"Time Doctor\"; \"Mehra Life Sciences Private Limited\" Delhi. Nothing found. Micro; input contact not re-verified, dropped.")
# 6-10
P("Access Communications Group", "Buddy Punch", 15, TS + " Several companies share this name (El Paso TX LLC, Northampton UK Ltd); cannot tell which TheirStack meant.",
  "Searches: \"Access Communications Group\" \"Buddy Punch\"; \"Access Communications Group\" telecommunications company. No Buddy Punch evidence. ~7 employees; no outreach research.")
P("PowerPacked Swimming", "Buddy Punch", 15, TS + " 3-person swim school; plausible SMB fit for Buddy Punch but no proof.",
  "Searches: \"PowerPacked Swimming\" \"Buddy Punch\"; PowerPacked Swimming instructor jobs. Site live. Nothing found. Micro; no outreach research.")
X("Amphia Ziekenhuis", "ClickTime",
  "False match: a public Amphia document contains clicktime.symantec.com links (Symantec Click-time URL Protection e-mail link rewriting), not the ClickTime timesheet software.",
  "Searches: Amphia ziekenhuis ClickTime (search surfaced the Symantec clicktime links in an amphia.nl download); \"clicktime.symantec.com\" amphia.nl. Dutch hospital, 3.5k staff.",
  second_source_url="https://amphia.nl/download/2387")
P("Daheim bleiben AG", "ClickTime", 15, TS + " Swiss Spitex (home care) firm in Wangs SG, 100+ staff per its own description. Note a separate Swiss vendor 'ClickTime AG' (Einsiedeln) sells Zeiterfassung, so if real the hit may refer to that product rather than US ClickTime.",
  "Searches: \"Daheim bleiben AG\" ClickTime; \"Daheim bleiben\" AG Spitex Zeiterfassung; ClickTime AG Einsiedeln Spitex. No tool evidence. In-person home-care field staff, not a remote/BPO team; no outreach research. Public phone seen: +41 81 515 15 30 (comparis.ch listing).",
  employee_count="100+ (comparis.ch)", employee_count_source_url="https://en.comparis.ch/gesundheit/spitex/detail/daheim-bleiben-ag/1010000576000")
P("LEWIS Communications Sarl", "ClickTime", 15, TS + " This is the Paris office of TEAM LEWIS (global PR/marketing agency, ~650 staff, Paris office 35+). Agencies do use timesheets, but no ClickTime evidence found.",
  "Searches: \"LEWIS Communications\" ClickTime timesheet; \"TEAM LEWIS\" ClickTime time tracking; \"LEWIS Communications\" Paris Sarl. Parent site teamlewis.com. Agency, but no evidence; contact research skipped (POSSIBLE, ~35 staff in Paris entity, not remote/offshore).",
  second_source_url="https://www.teamlewis.com/contact/paris/")
# 11-16 ClickTime enterprises
P("McCarthy Tétrault", "ClickTime", 10, TS + " Large Canadian law firm; law firms record billable time in legal practice-management/billing suites, so a ClickTime timesheet deployment is unlikely. " + SYM,
  "Searches: McCarthy Tétrault ClickTime; \"clicktime.symantec.com\" mccarthy.ca. Nothing found. Not a remote/BPO team; no outreach research.")
P("Med-Metrix", "ClickTime", 20, TS + " Healthcare RCM outsourcing firm with US/India/Philippines staff; ClickTime use unconfirmed.",
  "Searches: Med-Metrix ClickTime timesheet; \"Med-Metrix\" \"ClickTime\" job OR careers. No ClickTime evidence. Strong Tavilo profile anyway: offshore RCM/BPO workforce (India + Philippines; Med-Metrix International (India) Pvt Ltd registered 2023). Headcount sources vary (TheirStack 1.9k; Revelio 2,387 Sep 2025; company says 3,500-4,000+). Phone (201) 782-0200 came from a third-party company-listing search snippet, not the company site (contact page shows only address 9 Entin Road, Parsippany NJ 07054 and a form). Company LinkedIn URL not seen verbatim; left blank.",
  employee_count="2,387 (Revelio Labs, Sep 2025); company states 3,500+", employee_count_source_url="https://www.reveliolabs.com/companies/med-metrix/employees",
  workforce_signals="Offshore RCM/BPO: teams in US, India and Philippines (Pasig job postings).",
  contacts=[{"name": "Joseph H. Davi", "title": "Founder & Chief Executive Officer", "linkedin": "", "source_url": "https://med-metrix.com/leadership"},
            {"name": "Danielle Pannullo", "title": "Chief Operating Officer & EVP", "linkedin": "", "source_url": "https://med-metrix.com/leadership"}],
  company_phone="(201) 782-0200", contact_source_url="https://med-metrix.com/contact-us/",
  pitch_angle="Offshore RCM teams in India/Philippines billing US health systems: Tavilo gives activity/screenshot proof of work and utilization across sites.")
P("National Heart Centre Singapore", "ClickTime", 5, TS + " Public hospital (SingHealth cluster); ClickTime timesheet use implausible. " + SYM,
  "Searches: \"National Heart Centre\" Singapore ClickTime; \"clicktime.symantec.com\" nhcs. Nothing found. Public hospital, not a remote/BPO team; no outreach research.")
P("North Yorkshire Council", "ClickTime", 5, TS + " UK local authority; uses public-sector HR/payroll systems. " + SYM,
  "Searches: \"North Yorkshire Council\" ClickTime; \"clicktime.symantec.com\" northyorks. Nothing found. 4.6k staff, public sector; no outreach research.")
P("OCHIN, Inc.", "ClickTime", 15, TS + " Nonprofit health-IT network with a largely virtual workforce of 1,000+; ClickTime use unconfirmed.",
  "Searches: OCHIN ClickTime timesheet; site:ochin.org ClickTime OR \"time tracking\". No ClickTime evidence (ochin.org returned 403 to direct fetch). Remote workforce confirmed by OCHIN CEO bio ('diverse virtual workforce of more than 1,000'). Phone and PO Box from ochin.org page snippet.",
  employee_count="1,000+ (OCHIN)", employee_count_source_url="https://ochin.org/team-bios/abby-sears/",
  workforce_signals="Remote/virtual workforce of 1,000+ technologists and clinicians.",
  contacts=[{"name": "Abby Sears", "title": "President & CEO", "linkedin": "", "source_url": "https://ochin.org/team-bios/abby-sears/"}],
  company_phone="(503) 943-2500", contact_source_url="https://ochin.org/?p=91",
  pitch_angle="Fully virtual 1,000+ health-IT workforce: Tavilo for remote time and project tracking for grant/cost reporting.")
P("Worldpay", "ClickTime", 5, TS + " ~9k+ staff payments company; enterprise timesheets would sit in Workday/SAP-type systems. " + SYM,
  "Searches: \"Worldpay\" ClickTime timesheet; \"clicktime.symantec.com\" worldpay. Nothing found. Over 5,000 employees; no outreach research.")
# 17-18 ClockShark
P("Gaviotas Painting, LLC", "ClockShark", 15, TS + " 7-person painting contractor; ClockShark (construction time clock) is a plausible fit but unproven.",
  "Searches: \"Gaviotas Painting\" ClockShark; Gaviotas Painting LLC. Could not find a website. Micro field crew; no outreach research.")
P("Rochester Restoration", "ClockShark", 15, TS + " 9-person restoration contractor; plausible ClockShark fit but unproven. Name is generic (several 'Rochester' restoration firms).",
  "Searches: \"Rochester Restoration\" ClockShark; Rochester Restoration ClockShark time tracking. Only clock-restoration news returned. Micro field crew; no outreach research.")
# 19-27 Connecteam
P("AP (Thailand) Public Company Limited", "Connecteam", 10, TS + " Large Thai listed property developer; Connecteam use unconfirmed.",
  "Searches: \"AP Thailand\" Connecteam; apthai.com Connecteam employee app. Nothing found. Not a remote/BPO team; no outreach research.")
D[("BIGGBY COFFEE", "Connecteam")] = dict(
  status="PROBABLE", confidence_score=75, evidence_type="Vendor case study",
  evidence_summary="Connecteam publishes a BIGGBY Coffee case study describing a 300-employee coffee shop company using Connecteam for daily operations, communication, training and onboarding. Connecteam's time-clock break-management page also shows a BIGGBY Coffee logo (asset uploaded 2026-02), and a Connecteam testimonial quotes a Director of Operations at 'Biggby Coffee with 160 employees'. Headcounts (160-300) suggest the customer is a multi-unit BIGGBY franchisee group rather than the corporate franchisor.",
  evidence_quote="Connecteam helps a 300-employee coffee shop company with everyday operations, daily communication, training & onboarding staff",
  source_url="https://connecteam.com/case-studies/biggby-coffee", source_publication_date="",
  second_source_url="https://connecteam.com/employee-time-clock-app/break-management",
  third_source_url="https://theirstack.com/en/technology/connecteam",
  status_reason="Named in a Connecteam vendor case study and logo on a time-clock page (logo file dated 2026-02); case study undated and probably a franchisee group, so PROBABLE not CURRENT.",
  workforce_signals="Hourly deskless baristas across franchise locations (460+ stores, 13 states).",
  contacts=[{"name": "Mike McFall", "title": "Co-Founder & Co-CEO", "linkedin": "", "source_url": "https://1851franchise.com/biggbycoffee/biggby-coffee-names-erin-kaylor-president-2729160"},
            {"name": "Erin Kaylor", "title": "President (from April 2025; previously CFO)", "linkedin": "", "source_url": "https://1851franchise.com/biggbycoffee/biggby-coffee-names-erin-kaylor-president-2729160"},
            {"name": "Bob Fish", "title": "Co-Founder & Co-CEO", "linkedin": "", "source_url": "https://1851franchise.com/biggbycoffee/franchise-influencers-bob-fish-co-ceo-biggby-coffee-2721756"}],
  company_phone="+1 517-482-8145", contact_source_url="https://www.cbinsights.com/company/biggby-coffee",
  pitch_angle="Weak fit for desktop monitoring: Connecteam serves in-store hourly staff. Pitch Tavilo only for corporate/support-centre and franchise-office staff; better to approach the franchisee group named in the case study.",
  notes=RC + "Searches: BIGGBY COFFEE Connecteam; Connecteam case study BIGGBY franchisee; \"Mandy Mann\" Biggby (the Director of Operations named in a Connecteam testimonial snippet could not be confirmed on any BIGGBY page, so not recorded as a contact). HQ 2501 Coolidge Rd Ste 302, East Lansing MI. Phone from a third-party company listing snippet (CB Insights), not BIGGBY's site. Company LinkedIn not seen verbatim; left blank. Case-study page body would not render fully; quote is the page summary.")
P("Blue Sky Education", "Connecteam", 10, TS + " 7-person Indian study-abroad consultancy; Connecteam (deskless app) implausible. Name also collides with UK 'BlueSky Education' appraisal software.",
  "Searches: \"Blue Sky Education\" Connecteam; bluesky-education.com India Blue Sky Education. Nothing found. Micro; no outreach research.")
P("Cater-Clean Solutions Limited", "Connecteam", 15, TS + " UK commercial-kitchen/duct cleaning firm (Companies House 09424738, Harrogate; brand now under ccs.group). Field cleaning crews fit Connecteam but no proof.",
  "Searches: \"Cater-Clean Solutions\" Connecteam; \"Cater-Clean Solutions Limited\" UK. No Connecteam evidence. TheirStack says 1 employee; site says it grew from one person. No outreach research.",
  second_source_url="https://ccs.group/catercleansolutions")
P("Disacare Solution", "Connecteam", 15, TS + " Small NDIS disability-support provider in Blacktown NSW; Connecteam plausible for support workers but unproven.",
  "Searches: \"Disacare\" Connecteam; \"Disacare Solution\" Australia NDIS. No Connecteam evidence. Directory lists 02 8616 9662 / info@disacaresolution.com.au (not recorded as outreach data: micro, not remote/BPO).",
  second_source_url="https://infoqore.com.au/directory/care-and-support/care-and-support-planning/ndis-support-coordination-level-1-support-connection/disacare-solution-pty-ltd")
P("EDSS Sanitation Solutions", "Connecteam", 15, TS + " Canadian food-plant sanitation contractor running night cleaning crews; Connecteam plausible but unproven.",
  "Searches: \"EDSS\" sanitation Connecteam; EDSS Sanitation Solutions job \"Connecteam\" clock in. Workopolis job ads exist but returned 403; snippets did not mention Connecteam. Deskless field crews, not remote/BPO; no outreach research.")
P("ESW Building Services Inc", "Connecteam", 15, TS + " Mississauga commercial/multi-res general contractor (~87 staff per ZoomInfo); Connecteam plausible but unproven.",
  "Searches: \"ESW Building Services\" Connecteam; \"ESW Building Services\" Canada. No Connecteam evidence. Field construction crews, not remote/BPO; no outreach research.",
  employee_count="~87 (ZoomInfo)", employee_count_source_url="https://www.zoominfo.com/c/esw-building-services-inc/475527132")
P("Launchpad Technologies", "Connecteam", 15, TS + " golaunchpad.io is Launchpad Technologies Inc. (Vancouver, Canada; second HQ Santiago, Chile): iPaaS (Paasport) plus nearshore IT staff augmentation, ~40 staff. Connecteam (deskless-worker app) is a poor fit for this business; TheirStack's Singapore/2-employee listing may be a mismatch.",
  "Searches: \"Launchpad Technologies\" golaunchpad.io Singapore; \"Launchpad Technologies\" Connecteam OR Hubstaff OR \"time tracking\"; CEO search. No time-tracking evidence. Remote nearshore staff-augmentation team in LatAm makes it a reasonable Tavilo prospect, so site contacts recorded. HQ country corrected to Canada (input said Singapore).",
  hq_country="Canada", employee_count="~40 (Built In)", employee_count_source_url="https://builtinnyc.com/company/launchpad-technologies-inc",
  workforce_signals="Nearshore IT staff augmentation; remote engineers across North/South America (Santiago, Chile hub).",
  contacts=[{"name": "Bruce Qi", "title": "CEO & Founder", "linkedin": "", "source_url": "https://bcbusiness.ca/business/tech-science/entrepreneur-of-the-year-2024-bruce-qi-launchpad-vancouver/"}],
  company_linkedin="https://www.linkedin.com/company/golaunchpad/", company_phone="+1 800 326 0188", public_email="info@golaunchpad.io",
  contact_source_url="https://golaunchpad.io/",
  pitch_angle="Nearshore staff-augmentation firm billing clients for remote LatAm engineers: Tavilo gives client-facing proof of hours and activity.")
P("MobileOne LLC", "Connecteam", 20, TS + " Large T-Mobile authorized retailer (120-200+ stores). Hourly retail staff fit Connecteam, but no public evidence; careers site does not mention it.",
  "Searches: MobileOne LLC Connecteam; \"MobileOne\" wireless retail Connecteam OR \"time clock\"; \"MobileOne LLC\" authorized retailer; fetched mobileone-llc.careerplug.com (no app mentioned). In-store retail staff, not remote/BPO; no outreach research.",
  second_source_url="https://mobileone-llc.careerplug.com")
P("OIC Cleaning", "Connecteam", 15, TS + " Dublin commercial cleaning contractor (Office and Industrial Cleaners Ltd, est. 1982, 180+ staff). Field cleaners fit Connecteam but no proof.",
  "Searches: \"OIC Cleaning\" Connecteam; \"OIC Cleaning\" Ireland. No Connecteam evidence. Deskless cleaners, not remote/BPO; no outreach research.",
  employee_count="180+ (company description via search)")
D[("i9 Sports", "Connecteam")] = dict(
  status="PROBABLE", confidence_score=75, evidence_type="Vendor case study",
  evidence_summary="Connecteam runs a dedicated i9 Sports landing page saying dozens of i9 Sports Area Developers (franchisees) use Connecteam for staff management and shift reports, with free use for Area Developers with up to 10 employees, and quotes an i9 Sports Program Director. Use is at franchisee level, not confirmed for corporate.",
  evidence_quote="Dozens of i9 Sports Area Developers have partnered with Connecteam for streamlined staff management, improved communication, and increased efficiency",
  source_url="https://lp.connecteam.com/i9sports", source_publication_date="",
  second_source_url="https://theirstack.com/en/technology/connecteam",
  status_reason="Vendor page names i9 Sports franchisees as a Connecteam customer group (undated), so PROBABLE. A Deputy customer story (older, undated) shows one Southern California franchise used Deputy; Deputy is not on the competitor list so no extra row.",
  workforce_signals="Franchise network of part-time coaches/referees and program staff; franchisees are small (often <10 employees).",
  contacts=[{"name": "Ron Shimek", "title": "President (appointed April 2026)", "linkedin": "", "source_url": "https://www.franchise.org/2026/04/i9-sports-taps-new-leadership-to-drive-national-expansion-and-franchise-performance/"},
            {"name": "Jeremy Oliver", "title": "Vice President of Franchise Operations (appointed April 2026)", "linkedin": "", "source_url": "https://www.franchise.org/2026/04/i9-sports-taps-new-leadership-to-drive-national-expansion-and-franchise-performance/"}],
  third_source_url="https://www.deputy.com/customers/i9-sports",
  pitch_angle="Weak fit for desktop monitoring (deskless coaches). Possible angle: franchise-support office and area-developer admin staff; better treated as a low-priority Connecteam reference account.",
  notes=RC + "Searches: \"i9 Sports\" Connecteam; \"i9 Sports\" coach Connecteam app schedule; i9 Sports CEO president 2026. i9sportsfranchise.com returned 403. Company phone/email/LinkedIn not seen on a verifiable page; left blank. Matt Kurowski appears as an earlier President (podcast); superseded by Ron Shimek per April 2026 IFA release.")
P("Grant Thornton", "Replicon", 10, TS + " The TheirStack row is the New Caledonia member firm (ex-KPMG firm that joined Grant Thornton on 1 Oct 2025, ~40 professionals). Grant Thornton is a network of independent member firms each with its own timesheet systems; no Replicon evidence for this firm.",
  "Searches: \"Grant Thornton\" New Caledonia Replicon; \"Grant Thornton\" Replicon timesheet. Nothing found. Audit/advisory office, not remote/BPO; no outreach research.",
  second_source_url="https://www.grantthornton.global/en/press-releases/press-releases-2025/grant-thornton-strengthens-pacific-presence/")
P("Valtech", "Timesheets", 5, TS + " TheirStack 'Timesheets.com' tech (only 4 companies) is almost certainly the generic word 'timesheets' in a Valtech job ad; a 5.8k-person global agency would not run Timesheets.com (an SMB product).",
  "Searches: Valtech \"Timesheets.com\"; \"Valtech\" timesheet tool employees glassdoor. Nothing linking Valtech to Timesheets.com. Over 5,000 employees; no outreach research.")
P("Overman Concrete, Inc.", "busybusy", 20, TS + " Orem, Utah concrete contractor (since 1983, recently acquired by new owners); busybusy is a Utah-built construction time-tracking app, so a plausible fit, but job ads seen in search do not mention it.",
  "Searches: \"Overman Concrete\" busybusy; Overman Concrete Orem job \"busybusy\". Job ads (constructionjobs.com, career.io) would not load (403/empty). No outreach research (TheirStack says 4 employees; field crews).")
P("Reliable Electric", "busybusy", 10, TS + " No domain; many unrelated electrical contractors share the name (Ohio, Idaho, others), so the TheirStack company cannot be identified.",
  "Searches: \"Reliable Electric\" busybusy; Reliable Electric busybusy time tracking. Nothing found. Micro; no outreach research.")
P("Monks", "Harvest Forecast", 15, TS + " Global digital agency (Media.Monks / Monks, ~6.8k staff); agencies commonly use Harvest Forecast for resourcing, but no Monks-specific evidence found.",
  "Searches: Monks \"Harvest Forecast\" OR \"Forecast app\" resourcing; \"Media.Monks\" Harvest time tracking Forecast. Nothing found. Over 5,000 employees; no outreach research.")
P("Traveloka", "Harvest Forecast", 5, TS + " Travel platform; 'forecast'/'harvest' in its job ads most likely means demand/financial forecasting, not the Harvest Forecast product.",
  "Searches: Traveloka \"Harvest\" Forecast resource planning; Traveloka job \"Harvest\" OR \"Forecast\" tool. No mention of the Harvest Forecast product. Over 2,500 employees; no outreach research.")
X("True Leaf Farms", "Harvest Forecast",
  "Name-collision false match: a 2-person Indian farm/food business; 'harvest forecast' here means crop harvest forecasting, not Harvest's Forecast software.",
  "Searches: \"True Leaf Farms\" India; True Leaf Farms Harvest Forecast. Could not identify the company; results show unrelated True Leaf Market seed company.")
# 37-45 Homebase
P("313 Cafe", "Homebase", 5, TS + " Tiny French cafe; Homebase (US/Canada-focused scheduling app) is unlikely in France and the hit is probably the generic phrase 'home base'.",
  "Searches: \"313 Cafe\" France Homebase; 313 Cafe Homebase scheduling. Could not identify the business. Micro; no outreach research.")
P("AIAG", "Homebase", 5, TS + " 4-person UAE investment firm; Homebase (hourly shift scheduling) has no plausible use there; likely generic 'home base' wording.",
  "Searches: \"AIAG\" UAE investment \"Homebase\" OR \"home base\"; AIAG Homebase. Could not identify the firm. Micro; no outreach research.")
X("Antler", "Homebase",
  "Name-collision false match: Antler (global VC, ~2k incl. residency founders) appears alongside 'Homebase' because it invested in Homebase, a Singapore rent-to-own proptech startup; nothing about Homebase scheduling software.",
  "Searches: Antler \"Homebase\" OR \"home base\" residency job; Antler Homebase. Homebase (SG proptech) lists Antler as an investor.",
  second_source_url="https://ycombinator.com/companies/homebase")
X("BSI", "Homebase",
  "Keyword false match: BSI job ads advertise 'home based' / 'homebased' auditor and assessor roles; this is a work arrangement, not the Homebase software.",
  "Searches: BSI group job \"home based\" OR \"homebase\" assessor; BSI Homebase. Many BSI auditor ads say 'homebased contract basis'. ~9.9k staff.")
X("Bean About Town", "Homebase",
  "Company no longer operating: the London coffee-cart business was sold off pitch by pitch to its staff at the end of 2016 and became separate independent businesses.",
  "Searches: \"Bean About Town\" Homebase OR joinhomebase; \"Bean About Town\" coffee UK (Brian's Coffee Spot 2017 update describes the sell-off).",
  second_source_url="https://www.brian-coffee-spot.com/2017/06/07/for-the-good-of-the-people-coffee-bean-about-town-south-bank-update")
P("BrosMed Medical", "Homebase", 5, TS + " Dongguan medical-device maker (~624 staff per Revelio, 91% in China); Homebase (US hourly scheduling) implausible; likely 'home base'/'home-based' wording in an overseas sales job ad.",
  "Searches: BrosMed Medical \"Homebase\" OR \"home base\" OR \"home-based\" job; BrosMed Medical Dongguan employees. brosmed.com did not respond to a direct request. Manufacturing, not remote/BPO; no outreach research.",
  employee_count="~624 (Revelio Labs, Mar 2026)", employee_count_source_url="https://www.reveliolabs.com/companies/brosmed-medical/employees/")
X("Brussels Airlines", "Homebase",
  "Keyword false match: airline cabin-crew job ads refer to the crew 'home base' (Brussels Airport); not the Homebase software.",
  "Searches: \"Brussels Airlines\" \"home base\" cabin crew job; Brussels Airlines Homebase. Results describe cabin-crew home base at Brussels Airport.",
  second_source_url="https://cabincrew24.com/how-to-become-cabin-crew-for-brussels-airlines/")
X("Canonical", "Homebase",
  "Keyword false match: Canonical's job ads are listed as 'Home Based - Americas / EMEA / Asia Pacific' (remote work), not the Homebase software.",
  "Searches: Canonical job \"home based\" OR \"Homebase\"; Canonical Homebase. Remote-first company (could be a Tavilo prospect on other grounds, but no competitor-tool evidence here).")
P("Cellar Door Cafe", "Homebase", 10, TS + " 1-person Australian cafe; name is generic (many winery 'cellar door' cafes), cannot identify which business TheirStack meant.",
  "Searches: \"Cellar Door Cafe\" Australia Homebase rostering; Cellar Door Cafe Homebase. Nothing found. Micro; no outreach research.")
