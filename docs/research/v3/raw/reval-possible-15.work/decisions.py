REP = ("Only evidence is an old (pre-2020) Replicon case study; no newer source links the company to Replicon. "
       "Searched '\"<company>\" Replicon' and checked the company site. ")
D = {}

D[("Pharmaceutical Strategies Group (PSG)", "Harvest")] = dict(
    employee_count="201-500", employee_count_source_url="https://himalayas.app/companies/pharmaceutical-strategies-group-llc/jobs/director-of-business-operations-and-performance",
    hq_country="United States",
    evidence_summary="Himalayas posting (dated 2026-08-03) for Director of Business Operations and Performance lists 'Experience with Salesforce, Power BI, Harvest, Smartsheet, financial planning systems...' as a preferred qualification. Harvest here is the time-tracking software (listed with other business tools).",
    evidence_quote="Experience with Salesforce, Power BI, Harvest, Smartsheet, financial planning systems, and business intelligence platforms",
    source_publication_date="2026-08-03",
    status="POSSIBLE", confidence_score=45,
    status_reason="Recent job ad names Harvest among preferred tools (plausibly their stack), but 'experience with' wording is not proof of current use; no second source.",
    workforce_signals="Pharmacy benefit consultants (billable professional services); remote-friendly postings.",
    contacts=[{"name": "Michael Lonergan", "title": "President", "linkedin": "", "source_url": "https://www.psgconsults.com/press-release/pharmaceutical-strategies-group-announces-health-plan-practice-leadership-promotions-and-business-transformation-expansion/"},
              {"name": "Rebekah Gregg", "title": "Chief Operating Officer (per PSG press release search snippet)", "linkedin": "", "source_url": "https://www.psgconsults.com/press-release/psg-announces-strategic-leadership-enhancements/"}],
    contact_source_url="https://www.psgconsults.com/press-release/pharmaceutical-strategies-group-announces-health-plan-practice-leadership-promotions-and-business-transformation-expansion/",
    pitch_angle="Billable consulting firm (EPIC-owned) that likely tracks consultant time in Harvest; pitch automatic time capture + utilisation reporting for remote consultants.",
    notes="Searched '\"Pharmaceutical Strategies Group\" Harvest time tracking' (no hits beyond the job ad). HQ 14881 Quorum Dr, Suite 850, Dallas TX (press release, 2026-04-01). Public email on site is obfuscated; not recorded. COO name from search snippet only.",
)

D[("Artifex Mundi", "Replicon")] = dict(
    status="POSSIBLE", confidence_score=20,
    status_reason="Company alive (artifexmundi.com 200), but Replicon evidence is a pre-2020 archived case study only.",
    notes=REP + "'\"Artifex Mundi\" Replicon' returned nothing relevant. Game studio, not a remote/BPO target; no new contact research.",
)
D[("Product Creation Studio", "Replicon")] = dict(
    second_source_url="https://www.replicon.com/wp-assets/uploads/2016/06/CaseStudy_Product_Creation_Studio.pdf",
    source_publication_date="2016",
    status="POSSIBLE", confidence_score=20,
    status_reason="Company alive (productcreationstudio.com 200). Replicon Web TimeSheet/TimeBill case study PDF dated ~2016; no newer evidence.",
    notes=REP + "Case study says staff bill hourly and used Replicon Web TimeSheet / TimeBill. Seattle product design firm, not remote/BPO; no new contact research.",
)
D[("1-800-GOT-JUNK?", "Replicon")] = dict(
    status="POSSIBLE", confidence_score=15,
    status_reason="Company alive, but only a pre-2020 Replicon TimeOff case study; TimeOff (leave mgmt) is not activity tracking. No newer evidence.",
    notes=REP + "'\"1-800-GOT-JUNK\" Replicon' returned nothing relevant. Large franchise with field crews, not a desk-monitoring fit.",
)
D[("abas USA (abas ERP)", "Replicon")] = dict(
    second_source_url="https://www.replicon.com/wp-content/uploads/2016/06/casestudy-abas-erp.pdf",
    source_publication_date="2016",
    status="POSSIBLE", confidence_score=15,
    status_reason="abas (now Forterro group) still operates (abas-erp.com 200) but evidence is a ~2016 Replicon PSA case study; abas is itself an ERP software vendor.",
    notes=REP + "Case study: abas USA consulting team moved from in-house timesheets to Replicon PSA. No current evidence.",
)
D[("Axis Teknologies", "Replicon")] = dict(
    employee_count="~93", employee_count_source_url="https://www.datanyze.com/companies/axis-teknologies/353939592",
    hq_country="US", status="POSSIBLE", confidence_score=10,
    status_reason="Pre-2020 Replicon case study only; axisteknologies.com did not respond (connection failed), company may be inactive.",
    notes=REP + "Search snippets describe a Sandy Springs GA wireless engineering services firm (~93 staff per Datanyze); website unreachable 2026-10-07, so not enriched.",
)

def rep(score, reason, notes, **kw):
    d = dict(status="POSSIBLE", confidence_score=score, status_reason=reason, notes=REP + notes)
    d.update(kw); return d

D[("Centre for European Policy Studies (CEPS)", "Replicon")] = rep(20,
    "Think tank alive (ceps.eu returns 403 to bots but is active). Replicon timesheet case study (PDF uploaded 2016) only; no newer evidence.",
    "Case study quotes the then Head of Finance & Administration on allocating research hours to EU-funded projects. Researchers' time is grant-reported, not monitored; low fit.",
    second_source_url="https://de.replicon.com/wp-assets/uploads/2016/06/CEPS_Casestudy_Updated.pdf", source_publication_date="2016")
D[("Contoural", "Replicon")] = rep(15,
    "Company alive (contoural.com 200). Only a pre-2020 Replicon case study; search for 'Contoural Replicon' returns nothing else.",
    "Case study PDF: https://de.replicon.com/wp-assets/uploads/2016/06/CaseStudy_Contoural.pdf. Small information-governance consultancy; not remote/BPO.",
    second_source_url="https://de.replicon.com/wp-assets/uploads/2016/06/CaseStudy_Contoural.pdf", source_publication_date="2016")
D[("CornerStar", "Replicon")] = rep(20,
    "cornerstar.com responds (bot-challenge page). Replicon TimeBill/WebExpense success story PDF dated 2019-08; no newer evidence.",
    "Portland OR BI consultancy (since 1998) that moved from spreadsheets to Replicon TimeBill + WebExpense. Small; not enriched.",
    second_source_url="https://de.replicon.com/wp-assets/uploads/2019/08/Cornerstar_Success_Story.pdf", source_publication_date="2019-08")
D[("Corporater", "Replicon")] = rep(15,
    "Company alive (corporater.com 200). Replicon case study PDF from ~2016 only. Corporater is itself a GRC/performance software vendor.",
    "Case study: moved from Excel to Replicon to track consultants' time across countries. No current evidence.",
    second_source_url="https://www.replicon.com/wp-assets/uploads/2016/06/casestudy_corporater.pdf", source_publication_date="2016")
D[("Enservio", "Replicon")] = rep(15,
    "Company site alive (enservio.com 200). Replicon TimeBill/WebExpense case study from the ~2012 era only.",
    "Case study PDF: https://de.replicon.com/wp-assets/uploads/2016/06/CaseStudy_Enservio.pdf (mentions 2012 awards). No current evidence.",
    second_source_url="https://de.replicon.com/wp-assets/uploads/2016/06/CaseStudy_Enservio.pdf", source_publication_date="2012")
D[("Enterprise Unified Solutions (eUS)", "Replicon")] = rep(10,
    "Old Replicon TimeAttend case study only; eus.com now shows a bare GoDaddy-built 'EUS' page and it is unclear it is the same firm.",
    "Search found only the Replicon case study (manager quoted). Domain identity unconfirmed; input public_email kept but unverified.")
D[("Fisher Vista", "Replicon")] = dict(
    status="DO_NOT_TARGET", confidence_score=5,
    industry="HR marketing software & services (HRmarketer.com) — not energy consulting",
    status_reason="Company appears defunct: fishervista.com now hosts an unrelated news-content site. Only evidence was an old Replicon TimeBill case study.",
    second_source_url="https://www.replicon.com/wp-assets/uploads/2016/06/CaseStudy_fishervista.pdf", source_publication_date="2016",
    notes="Case study describes Fisher Vista LLC as an HR-marketing firm (HRmarketer.com, SocialEars HR), so the input industry 'Energy consulting' was wrong. fishervista.com checked 2026-10-07: news/blog content, no company presence.")
D[("Fulham FC", "Replicon")] = rep(25,
    "Club obviously alive. Replicon TimeAttend customer since Jan 2017 (case study PDF 2018-02); used for payroll of stadium/casual staff, no newer evidence.",
    "Use is time & attendance for hourly matchday/hospitality staff, not desk activity tracking — weak fit for Tavilo.",
    second_source_url="https://www.replicon.com/wp-content/uploads/2018/02/FulhamFC_Casestudy.pdf", source_publication_date="2018-02")
D[("GeoDigital", "Replicon")] = rep(15,
    "geodigital.com is live (3D data/spatial intelligence software). Replicon TimeAttend/TimeCost case study is pre-2020 only.",
    "Company domain set to geodigital.com (verify same entity; ownership changed after 2017).")
D[("Health Data Specialists", "Replicon")] = rep(20,
    "Company alive (hdsconsulting.com 200). Replicon billing/expense/time-off case study pre-2020 only.",
    "Case study: consultants travel to client hospitals Mon-Thu and work from home Friday; Replicon integrated with QuickBooks. Healthcare IT consultancy; not enriched further.")
D[("Hyson Products", "Replicon")] = rep(10,
    "Old Replicon TimeAttend case study (~100 shop-floor employees). hysonproducts.com now redirects to hysonsolutions.com; Hyson is a Barnes Group unit.",
    "Manufacturing hourly workforce (punch-clock use) — not a Tavilo fit.",
    second_source_url="https://de.replicon.com/wp-assets/uploads/2016/06/casestudy_hysonproduct.pdf", source_publication_date="2016")
D[("Institute for Applied Behavior Analysis (IABA)", "Replicon")] = rep(20,
    "Organisation alive (iaba.com 200). Replicon TimeAttend/TimeBill case study (~600 field employees) pre-2020 only.",
    "Field-based behaviour therapists entering time remotely; time & attendance use, not desktop monitoring.",
    second_source_url="https://de.replicon.com/wp-assets/uploads/2016/06/CaseStudy_IABA.pdf", source_publication_date="2016", employee_count="~600 (per old case study)")

D[("James Hay Partnership", "Replicon")] = rep(10,
    "Old Replicon project-time/time-off case study only. James Hay is now part of Nucleus (jameshay.co.uk redirects to nucleusfinancial.com); systems likely consolidated.",
    "Case study quoted the then Head of Development on logging project time. Brand absorbed into Nucleus Financial; no current evidence.",
    second_source_url="https://de.replicon.com/wp-assets/uploads/2016/06/casestudy_james_hay_partnership.pdf", source_publication_date="2016")
D[("Logic Healthcare", "Replicon")] = rep(10,
    "Replicon case study PDF uploaded 2020-04 (Denver healthcare IT consultancy, travelling consultants). logichealthcare.com does not resolve and no current company web presence found.",
    "Searched 'Logic Healthcare Replicon' and 'Logic Healthcare Denver hospital IT consulting'; no live company site found. Possibly defunct/renamed — not enriched.",
    second_source_url="https://www.replicon.com/wp-assets/uploads/2020/04/casestudy-logic-healthcare.pdf", source_publication_date="2020-04")
D[("McNeal Professional Services", "Replicon")] = rep(15,
    "Old Replicon case study only. McNeal Professional Services (Kennesaw GA telecom staffing/engineering, 250+ staff per search snippet) — website mcnealps.com did not resolve in check.",
    "Searched '\"McNeal Professional Services\" telecom' (CB Insights/prospeo snippets only). Field-engineering staffing, not desk-based.",
    employee_count="250+ (search snippet)", employee_count_source_url="https://prospeo.io/c/mcneal-professional-services")
D[("Michelle Durpetti Events", "Replicon")] = rep(15,
    "Company alive (durpettievents.com). Replicon Web TimeSheet case study from ~2010 only.",
    "Small Chicago event planner; no current evidence. Company domain is durpettievents.com (input left blank).")
D[("Obopay", "Replicon")] = rep(10,
    "Replicon Web TimeSheet case study from 2008-era only. obopay.com live (mobile money platform, now India-focused).",
    "No current evidence. Not enriched.")
D[("Optimization Group", "Replicon")] = rep(10,
    "Replicon Web TimeSheet case study (user since 2007) only; optimizationgroup.com did not respond in check — company may be inactive.",
    "Ann Arbor MI marketing analytics firm per case study. Not enriched.")
D[("Peoples Trust", "Replicon")] = rep(15,
    "Company alive (peoplestrust.com redirects to peoplesgroup.com). Replicon was used for time-off management per pre-2020 case study; no newer evidence.",
    "Time-off management use is not activity tracking; regulated Canadian financial firm — weak fit.",
    second_source_url="https://de.replicon.com/wp-assets/uploads/2016/06/CaseStudy-PeoplesTrust.pdf", source_publication_date="2016")
D[("QRC Technologies", "Replicon")] = rep(20,
    "Company alive (qrctech.com 200). Replicon Web TimeSheet DCAA-compliance case study (PDF 2019-08) only.",
    "DCAA timekeeping need is real but this is a defence RF hardware firm; monitoring-style tracking unlikely. No current evidence.",
    second_source_url="https://de.replicon.com/wp-assets/uploads/2019/08/qrccasestudy-1.pdf", source_publication_date="2019-08")
D[("Ropes Courses, Inc.", "Replicon")] = rep(15,
    "Company alive (ropescourses.com 200). Old Replicon whitepaper (time & attendance, CloudClock, billing, expenses) only.",
    "Manufacturing/installation crews; not a desk-monitoring fit.",
    second_source_url="https://de.replicon.com/wp-assets/uploads/2016/06/Replicon_RopesCourses_Whitepaper_V1.pdf", source_publication_date="2016")
D[("Simmons Hanly Conroy", "Replicon")] = rep(20,
    "Law firm alive (simmonsfirm.com still titled Simmons Hanly Conroy). Replicon CloudClock case study from 2017 only.",
    "Input note about a rename appears wrong — site title is still Simmons Hanly Conroy (checked 2026-10-07). Law firms typically use legal billing systems; no current Replicon evidence.",
    second_source_url="https://www.replicon.com/wp-content/uploads/2017/04/Replicon-Case-Study-Simmons-Hanly.pdf", source_publication_date="2017-04")
D[("Solutions Atlantic", "Replicon")] = rep(10,
    "Replicon Web TimeSheet case study (Boston, founded 1998) only; solutionsatlantic.com did not respond — company may be inactive/acquired.",
    "Not enriched.")
D[("Southern Cross Computing", "Replicon")] = rep(10,
    "Replicon Web TimeSheet case study (Canberra IT consultancy, adopted 2008) only; no current company website confirmed.",
    "Not enriched; southerncross.com.au belongs to an unrelated travel insurer.")
D[("ThinkQ Inc.", "Replicon")] = rep(15,
    "thinkq.com responds. Old Replicon timesheet case study only (distributed US staff, small SDVOSB government consultancy).",
    "No current evidence; government contractors usually need DCAA-specific timekeeping.")
D[("Xoomworks", "Replicon")] = dict(
    status="DO_NOT_TARGET", confidence_score=5,
    status_reason="Acquired by Accenture (Oct 2021); xoomworks.com no longer resolves. Only evidence was an old Replicon case study.",
    second_source_url="https://pitchbook.com/profiles/company/127561-51",
    notes="Searched 'Xoomworks Replicon acquired' — PitchBook/CB Insights snippets say Accenture acquired Xoomworks on 2021-10-19.")

TS = "Public TheirStack technographic listing only. "
def ts(score, reason, notes, **kw):
    d = dict(status="POSSIBLE", confidence_score=score, status_reason=reason, source_publication_date="", notes=TS + notes)
    d.update(kw); return d
HB = " Homebase (joinhomebase.com) is a US/Canada hourly-scheduling app; detections outside North America are very likely name collisions ('home base')."

D[("EL PATRON", "Homebase")] = ts(10, "Only a TheirStack Homebase listing; company could not be identified online; Homebase is rarely used in Poland.",
    "Searched '\"EL PATRON\" Poland logistics transport company' — no matching company found (only unrelated EL Logistics Group, Patron Centrum Obslugi Transportu)." + HB)
D[("Hound House", "Homebase")] = ts(15, "Only a TheirStack Homebase listing. A 'Hound House' dog social club/daycare/café exists in Toronto (hourly staff, Homebase plausible), but TheirStack labels the company 'Ranching', so identity is unconfirmed.",
    "Searched '\"Hound House\" ranch Canada' and '\"Hound House\" homebase jobs Toronto' — found Toronto canine social club (hospitalitydesign.com, streetsoftoronto.com) but no link to Homebase. Small hourly-staff venue; poor fit for desktop monitoring.")
D[("Inficare", "Homebase")] = ts(10, "Only a TheirStack Homebase listing; Belgian home-nursing group (~66 staff, founded 2021, Auvelais/Namur per directory snippet). Homebase is not a typical Belgian tool — likely collision.",
    "Searched 'Inficare Belgium thuisverpleging'. Field nurses, not desk-based; no contact research." + HB)
D[("InstaMove", "Homebase")] = ts(10, "Only a TheirStack Homebase listing; company could not be identified online; Homebase not sold in India — likely collision.",
    "Searched '\"InstaMove\" India packers movers company' — no matching company." + HB)
D[("Knead Pizza Co.", "Homebase")] = ts(10, "Only a TheirStack Homebase listing; no web presence found for an Irish 'Knead Pizza Co.'; Homebase rarely used in Ireland.",
    "Searched '\"Knead Pizza\" Ireland homebase OR rota OR jobs' — nothing relevant. Restaurant hourly staff; not a Tavilo fit." + HB)
D[("The Perfect Body", "Homebase")] = ts(10, "Only a TheirStack Homebase listing; no Belgian restaurant called 'The Perfect Body' found online.",
    "Searched '\"The Perfect Body\" Belgium restaurant' — nothing relevant." + HB)
D[("1FitLife - Content Creators", "Paymo")] = ts(20, "Only a TheirStack Paymo listing. Company is real (1fitlife Ltd, Christchurch, Dorset; fitness content agency incorporated 2018) and an agency is Paymo's target user, but no public evidence of Paymo use.",
    "Searched '\"1FitLife\" content creators' and '1fitlife Paymo project management'. Very small agency; no contact research.",
    second_source_url="https://open.endole.co.uk/insight/brand/225374-1fitlife")
D[("AmerisourceBergen", "Paymo")] = ts(5, "Only a TheirStack Paymo listing attached to recruiting.com domain; AmerisourceBergen (now Cencora) is a 40,000+ employee distributor and no Cencora job mentions Paymo. Almost certainly a false/garbled match.",
    "Searched 'AmerisourceBergen OR Cencora \"Paymo\" job posting' — no mention. Outside target size band; no contact research.")
D[("Tribu", "Paymo")] = ts(10, "Only a TheirStack Paymo listing; Israeli non-profit 'Tribu' could not be identified; no Paymo evidence.",
    "Searched 'Tribu Israel non-profit Paymo' — nothing relevant.")
D[("P2H Arabia", "Time Analytics")] = ts(10, "Only a TheirStack 'Time Analytics' listing. Time Analytics is a real Serbian time-tracking SaaS, but the phrase is generic ('time analytics'); no link found between P2H and the product.",
    "Searched '\"P2H Arabia\" Saudi software' and 'P2H \"Time Analytics\" time tracking'. P2H is a large web-dev agency group; Arabia unit not found online.")
D[("CAPISTRANO", "Time Tracker")] = ts(5, "Only a TheirStack 'Time Tracker' listing; 'time tracker' is a generic phrase and the company could not be identified (no German IT firm 'CAPISTRANO' found).",
    "Searched 'CAPISTRANO IT consulting Germany GmbH' — nothing matching. Note 'Capistrano' is also a Ruby deployment tool, a further source of confusion.")
D[("Amply", "Toggl Track")] = ts(10, "Only a TheirStack Toggl listing (Sweden page); company identity unclear (possibly Amply Technology Sweden AB, Gothenburg, ~6 staff — unconfirmed).",
    "Searched '\"Amply\" Sweden Toggl OR Everhour' and 'Amply AB Stockholm company'. Too small/unclear for outreach.")
D[("Amply", "Everhour")] = ts(10, "Only a TheirStack Everhour listing (Sweden page); company identity unclear (possibly Amply Technology Sweden AB, ~6 staff — unconfirmed).",
    "Same searches as the Toggl row; no Everhour evidence.")
D[("CREATIVE in TiME", "Toggl Track")] = ts(5, "Only a TheirStack Toggl listing (UK page); no company of this name found — search only returned a Warwick University 'creative temporal costings' research project.",
    "Searched '\"CREATIVE in TiME\" UK'. Not identifiable.")
