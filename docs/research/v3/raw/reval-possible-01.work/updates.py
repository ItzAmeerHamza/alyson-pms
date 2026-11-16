UPD = {}
EXTRA = []
D = "2026-10-07"
UPD[("Jumper Media","Time Doctor")] = dict(
 status="POSSIBLE", confidence_score=28, status_reason="Only TheirStack lists Jumper Media under Time Doctor; no job ad, review or company page names the tool.",
 contacts=[{"name":"Colton Bollinger","title":"Chief Executive Officer & Founder","linkedin":"https://www.linkedin.com/in/coltonbollinger/","source_url":"https://jumpermedia.co/about"},
           {"name":"Kenny Baldwin","title":"Chief Operations Officer","linkedin":"","source_url":"https://jumpermedia.co/about"}],
 contact_source_url="https://jumpermedia.co/about",
 pitch_angle="Offshore Manila social-media team serving local businesses; pitch screenshot/activity proof for offshore staff at lower per-seat cost.",
 prepend_notes="Reval 2026-10-07: searched '\"Jumper Media\" \"Time Doctor\"' and Jumper Media VA/careers + time-tracking queries: nothing names Time Doctor. About page (live) now lists Kenny Baldwin as COO (not VP Sales) plus CTO Tomas Dovidavicius; no phone/email on about page. Phone kept from input, not re-seen. Personal LinkedIn kept from input (previously verified), not re-seen this run.")
UPD[("TRI7 Solutions, Inc.","Teramind")] = dict(
 status="POSSIBLE", confidence_score=30, status_reason="TheirStack only; site live (Philippine BPO) with no Teramind mention; searches found none.",
 contacts=[], contact_source_url="https://tri7solutions.com/",
 pitch_angle="Makati BPO serving offshore clients; agent activity/attendance tracking with client-facing reports.",
 prepend_notes="Reval 2026-10-07: searched '\"TRI7 Solutions\" Teramind' and TRI7 hiring/monitoring queries; site fetched (live, still a BPO; phone +63 02 506 3852 confirmed; no leadership listed). CEO Ivan Lee Kan Yan (D&B) not re-confirmed this run, so removed from contacts.")
UPD[("The Call Center Doctors","WebWork Time Tracker")] = dict(
 status="POSSIBLE", confidence_score=30, status_reason="TheirStack only; site live, no WebWork mention; job searches found none.",
 contacts=[], company_phone="+1 877-766-3765", public_email="", contact_source_url="https://ccdocs.com/",
 pitch_angle="Remote outbound call-center operator (~1,000 reps managed); agent time/activity tracking and payroll-ready hours.",
 prepend_notes="Reval 2026-10-07: searched '\"Call Center Doctors\" WebWork' and ccdocs remote agent job + WebWork; site live (phone and Houston address 12828 Willow Centre Dr confirmed; email obfuscated so info@ not re-confirmed and removed). Founder Jason Shouldice not re-confirmed by search this run (search returned unrelated Shouldice Hospital), so removed from contacts.")
UPD[("Avanto","ProHance")] = dict(
 status="POSSIBLE", confidence_score=28, status_reason="TheirStack only; ProHance searches return the MRI contrast drug and Siemens 'Avanto' MRI scanner (name-collision trap on both words); no source ties Avanto (goavanto.com) to ProHance software.",
 employee_count="260+ employees across 3 offices (homepage, 2026); 200+ (about page)", employee_count_source_url="https://www.goavanto.com/",
 contacts=[{"name":"Matthew Danyliw","title":"President","linkedin":"https://www.linkedin.com/in/matthew-danyliw-6a8b24b/","source_url":"https://www.goavanto.com/about"},
           {"name":"Dinellys Gutierrez","title":"Human Resources Director","linkedin":"","source_url":"https://www.goavanto.com/about"},
           {"name":"Danny Bermudez","title":"Director of Operations and Process Improvements","linkedin":"","source_url":"https://www.goavanto.com/about"}],
 company_phone="", public_email="", contact_source_url="https://www.goavanto.com/about",
 pitch_angle="Offshore order-entry/AP processing teams in New Delhi and Bogota (260+ staff); throughput-style back office suits activity + productivity tracking.",
 prepend_notes="Reval 2026-10-07: searched 'Avanto goavanto ProHance' (only MRI drug/scanner hits) and Avanto New Delhi productivity-tracking jobs; homepage and about page fetched (no ProHance). Phone (860) 519-7163 and info@GoAvanto.com from input not shown on homepage/about this run (contact page 404), so removed. President LinkedIn kept from input (seen earlier), not re-seen.")
UPD[("EDGE Tutor International","Time Doctor")] = dict(
 status="POSSIBLE", confidence_score=28, status_reason="TheirStack only; site and job posts reviewed have no Time Doctor mention.",
 employee_count="1,000+ Philippines-based teachers (WISE bio); TheirStack 501", employee_count_source_url="https://wise-qatar.org/biography/henry-motte/",
 contacts=[{"name":"Henry Motte de la Motte (Motte-Munoz)","title":"Founder & CEO","linkedin":"https://www.linkedin.com/in/henrymottemunoz/","source_url":"https://wise-qatar.org/biography/henry-motte/"}],
 contact_source_url="https://edgetutor.co/",
 pitch_angle="1,000+ remote Filipino tutors paid hourly; lesson-support staff 'monitor teacher activity during shifts' - shift attendance/activity tracking fit.",
 prepend_notes="Reval 2026-10-07: searched '\"EDGE Tutor\" \"Time Doctor\"' and EDGE Tutor tracking-software requirements; Kalibrr Lesson Support posting (2024-04-18) says 'Monitor teacher activity during shifts' but names no tool; homepage live, no tool mention, contact form only. CEO confirmed by WISE bio / Edtech Insiders podcast; LinkedIn kept from input.")
UPD[("OS Solutions","Hubstaff")] = dict(
 status="POSSIBLE", confidence_score=30, status_reason="Hubstaff case study is about Hubstaff Tasks (project management, Kanban/sprints) only; it does not mention Hubstaff time tracking, and it is undated/old. Site live with no Hubstaff mention.",
 evidence_quote="There were just too many threads and miscommunications within our rapidly-growing company.",
 contacts=[{"name":"Mendel Kras (Krasnjanski)","title":"COO (per Hubstaff case study; site names 'Mendel' as team lead)","linkedin":"https://www.linkedin.com/in/mendelkras/","source_url":"https://hubstaff.com/tasks/customers/os-solutions"}],
 company_phone="718-218-3216", public_email="info@ososs.net", contact_source_url="https://ossolutions.com/",
 pitch_angle="150+ remote outsourced staff (data entry, bookkeeping, design) across US/Canada/India; they already use a Hubstaff product, so pitch time tracking + proof-of-work for clients.",
 prepend_notes="Reval 2026-10-07: case study re-fetched (Tasks only, no time-tracking mention, no date); searched OS Solutions + Hubstaff time tracking; ossolutions.com live (Montreal, Brooklyn, Miami), phone and email confirmed on homepage.")
UPD[("RemoteStar","Time Doctor")] = dict(
 status="POSSIBLE", confidence_score=25, status_reason="TheirStack only; site live, no Time Doctor mention; searches found nothing.",
 contacts=[{"name":"Naresh (Harwani)","title":"CTO per homepage ('CTO Naresh'); earlier list said Co-founder & CEO","linkedin":"","source_url":"https://www.remotestar.io/"}],
 company_phone="+44 208 163 4236", public_email="hello@remotestar.io", contact_source_url="https://www.remotestar.io/",
 pitch_angle="Places remote contractors on all-inclusive daily rates with EOR; hours/proof-of-work tracking for placed contractors.",
 prepend_notes="Reval 2026-10-07: searched '\"RemoteStar\" \"Time Doctor\"' and '\"Naresh Harwani\" RemoteStar' (no relevant hits); homepage fetched 2026-10-07 (live; phone, email, 42-44 Bishopsgate address confirmed; shows 'CTO Naresh'). Personal LinkedIn from input not re-seen, so dropped from the contact; role still unclear.")
UPD[("Amazon Growth Lab (The Growth Lab)","Time Doctor")] = dict(
 status="POSSIBLE", confidence_score=25, status_reason="TheirStack only; homepage live with no Time Doctor mention; searches found nothing.",
 contacts=[{"name":"Yonah Nimmer","title":"Founder & CEO, The Growth Lab","linkedin":"https://www.linkedin.com/in/yonah-nimmer-611275285/","source_url":"https://www.accessnewswire.com/newsroom/en/business-and-professional-services/amazon-growth-lab-recognized-as-one-of-the-best-amazon-agencies-1078010"},
           {"name":"Athen Reddy","title":"Chief Customer Officer (press contact)","linkedin":"","source_url":"https://www.accessnewswire.com/newsroom/en/business-and-professional-services/amazon-growth-lab-recognized-as-one-of-the-best-amazon-agencies-1078010"}],
 company_phone="+1 (647) 892-5383", public_email="martin@amazongrowthlab.com", contact_source_url="https://amazongrowthlab.com/",
 pitch_angle="Fully remote Amazon/TikTok/Walmart agency with part-time contractors; billable-hour tracking per client brand.",
 prepend_notes="Reval 2026-10-07: searched AGL/Growth Lab/Yonah Nimmer + Time Doctor (nothing); homepage live (phone, martin@ email, Culver City address confirmed); 2025-09-26 press release confirms Nimmer (CEO) and Reddy (CCO). Press email obfuscated on release page, so athen@ dropped. Nimmer LinkedIn kept from input (verified earlier), not re-seen.")
UPD[("Persona (Persona Talent)","Hubstaff")] = dict(
 status="POSSIBLE", confidence_score=30, status_reason="Only evidence is an earlier-seen Jobstore PH posting (now 403, cannot be re-read) and the role is placed with a client, so Hubstaff may be the client's tool. No Persona page mentions Hubstaff.",
 contacts=[{"name":"Jason Hreha","title":"Co-Founder & CEO","linkedin":"","source_url":"https://www.crunchbase.com/person/jason-hreha"}],
 contact_source_url="https://www.personatalent.com/about/",
 pitch_angle="Places remote staff from 98 countries full-time with clients and handles payroll; a white-label time/activity tracker for placed staff and client reporting.",
 prepend_notes="Reval 2026-10-07: Jobstore posting re-tried (403). Searched '\"Persona Talent\" Hubstaff' (only Hubstaff Talent job board, unrelated) and personatalent.com time tracking/Hubstaff (nothing). CEO confirmed via Crunchbase snippet.")
UPD[("CustomerTop","Time Doctor")] = dict(
 status="POSSIBLE", confidence_score=30, status_reason="TheirStack only; homepage live with no Time Doctor mention; Spanish/English searches found no job ad or review naming it.",
 contacts=[{"name":"Álvaro Ruiz","title":"CEO & Co-Founder","linkedin":"","source_url":"https://prospeo.io/p/alvaro-ruiz-email-and-phone"}],
 company_phone="+34 911 336 928 (ES); +57 601 508 6269 (CO); +56 228 409 059 (CL); +52 559 414 7535 (MX)", contact_source_url="https://www.customertop.com/",
 pitch_angle="100% remote B2B appointment-setting teleoperators across Spain and LatAm since 2004; Spain's mandatory working-hours register makes a remote time tracker a compliance need.",
 prepend_notes="Reval 2026-10-07: searched '\"CustomerTop\" \"Time Doctor\"' and Spanish teletrabajo/control horario queries (nothing). Homepage live: ES phone +34 911 336 928 and Alcobendas address confirmed; LatAm phones kept from input (about page re-confirmed 2026-10-05 per prior run). CEO role confirmed by a search snippet (prospeo profile summary); exact LinkedIn URL not tied, left blank.")
UPD[("Cargomatic","ActivTrak")] = dict(
 status="POSSIBLE", confidence_score=25, status_reason="TheirStack only; Greenhouse/BuiltIn operations postings found mention no ActivTrak.",
 contacts=[],
 prepend_notes="Reval 2026-10-07: searched '\"Cargomatic\" ActivTrak' and Cargomatic jobs + ActivTrak/employee monitoring (Greenhouse ops coordinator/planner roles, no tool). Mostly on-site logistics ops, so no contact research this tier; prior contact Richard Gerstein (Chairman & CEO) not re-confirmed and moved to notes.")
UPD[("Socialbear","Hubstaff")] = dict(
 status="POSSIBLE", confidence_score=30, status_reason="TheirStack only; about page and job searches show no Hubstaff mention.",
 employee_count="250+ human agents (about page)", employee_count_source_url="https://socialbear.com/about",
 contacts=[{"name":"Kristy Cameron","title":"Head of Client Services","linkedin":"https://www.linkedin.com/in/kristy-cameron-6b0b2031/","source_url":"https://socialbear.com/about"},
           {"name":"David McManus","title":"Group Account Director","linkedin":"https://www.linkedin.com/in/david-mcmanus-214153107/","source_url":"https://socialbear.com/about"}],
 company_phone="+44 203 984 9410; +1 646 440 0601", public_email="", contact_source_url="https://socialbear.com/about",
 pitch_angle="24/7 outsourced social-media moderation with 250+ agents run from Cape Town; shift adherence and activity tracking for distributed moderators.",
 prepend_notes="Reval 2026-10-07: searched '\"Socialbear\" Hubstaff' (only SocialBee comparisons) and Socialbear moderator jobs + time tracking (nothing). About page fetched: leaders and LinkedIn URLs linked there, phones confirmed. CEO Erik Neumann (Crunchbase/ZoomInfo snippet) not on site and not re-confirmed, so not listed.")
UPD[("SunCrypto","Hubstaff")] = dict(
 status="POSSIBLE", confidence_score=20, status_reason="TheirStack only; no job ad or review names Hubstaff; mostly office-based Jaipur team.",
 contacts=[],
 prepend_notes="Reval 2026-10-07: searched 'SunCrypto Hubstaff' and Suncrypto Jaipur jobs + time tracker/Hubstaff/monitoring (nothing). Office-based crypto exchange, so no contact research this tier; prior CEO Umesh Kumar Prajapati (LinkedIn https://in.linkedin.com/in/umesh-kumar-prajapati), phone +91 86048 60498, help@suncrypto.in kept in company fields/notes only (phone/email were confirmed on homepage by the prior run).")
UPD[("Bounce Curl","DeskTime")] = dict(
 status="POSSIBLE", confidence_score=20, status_reason="TheirStack only; no job ad, review or page names DeskTime.",
 contacts=[],
 prepend_notes="Reval 2026-10-07: searched '\"Bounce Curl\" DeskTime' and Bounce Curl careers + time tracking (nothing). Small DTC brand (26), no remote/BPO signal, so no contact research this tier; prior founder Merian Odesho not re-confirmed.")
UPD[("Delonix Marketing Corporation (Delonix Teams)","DeskTime")] = dict(
 status="POSSIBLE", confidence_score=30, status_reason="Only evidence is a 2017-era DeskTime case study now removed (desktime.com/case-studies/delonix returns 404 on 2026-10-07); no newer source. Company is alive (delonixteams.com live).",
 evidence_quote="DeskTime helps us automate the entire attendance system and allocate bonuses to the most punctual and efficient employees.",
 source_publication_date="2017", contacts=[], company_phone="", contact_source_url="https://delonixteams.com/",
 pitch_angle="Office-based offshore staffing in Cebu and Dumaguete (~500 staff historically) that used time tracking for attendance bonuses and client attendance reports; DeskTime story pulled, a possible switch window.",
 prepend_notes="Reval 2026-10-07: searched 'Delonix Teams DeskTime attendance Cebu' (search snippets still quote the case study) and '\"Jeremy Morgan\" Delonix' (only plant pages). Case study URL now 404. delonixteams.com live but rebuilt with placeholder contact fields ('CONTACT_ADDRESS'), no leadership or phone shown; the site stresses staff work in managed offices on company equipment. Jeremy Morgan (Founder & CEO per case study) not re-confirmed, so removed from contacts; phone +63 32 263 0730 from input not re-seen, removed. PhilJobNet lists Delonix Marketing Corporation as an employer.")
UPD[("2nd Office","Time Doctor")] = dict(
 status="DO_NOT_TARGET", confidence_score=10, status_reason="Company no longer exists independently: Intelegencia agreed to acquire 2nd Office LLC on 2018-10-19 and 2ndoffice.ph now redirects to a spam/survey page (checked 2026-10-07).",
 second_source_url="https://www.cbinsights.com/company/2nd-office", contacts=[],
 prepend_notes="Reval 2026-10-07: search confirms the Oct 2018 Intelegencia acquisition (230+ staff, 65 clients merged into a 550-person group). 2ndoffice.ph returns 302 to survey-smiles.com. The successor Intelegencia (BPO, US/India/PH/Ireland) could be researched separately, but there is no evidence it still uses Time Doctor.")
UPD[("Skyrocket (Skyrocket SEO)","Hubstaff")] = dict(
 status="DO_NOT_TARGET", confidence_score=10, status_reason="Company appears gone: its domain skyrocketseo.co.uk no longer resolves in DNS (2026-10-07), the only evidence is a 2019 Hubstaff blog post, and the founder sold the agency in 2018.",
 source_publication_date="2019-05-02", contacts=[],
 prepend_notes="Reval 2026-10-07: Hubstaff blog story still live (Skyrocket moved ~50 hourly contractors from Upwork to Hubstaff payroll, saving up to 30%). Searches for Skyrocket SEO find only directory text naming www.skyrocketseo.co.uk; dig returns no A/NS records and fetch fails ENOTFOUND. No current entity found.")
UPD[("Inter Smart (Inter Smart Solution Pvt Ltd)","Hubstaff")] = dict(
 status="POSSIBLE", confidence_score=25, status_reason="TheirStack only; searches for Hubstaff with Inter Smart (jobs, reviews) found nothing; mostly office-based agency.",
 contacts=[],
 prepend_notes="Reval 2026-10-07: searched '\"Inter Smart\" Kochi Hubstaff' and Inter Smart employee reviews + Hubstaff/tracker (nothing); Indeed company page 403. Office-based agency, so no contact research this tier; prior CEO Jithin Wails (https://www.linkedin.com/in/jithin-wails/) not re-confirmed this run.")
UPD[("IMBD Agency Ltd","Time Doctor")] = dict(
 status="POSSIBLE", confidence_score=25, status_reason="TheirStack only; about page and job/agency searches show no Time Doctor mention.",
 employee_count="26 team members (company about page); 105 (TheirStack); 50-249 (Clutch)", employee_count_source_url="https://imbdagency.com/about-us/",
 contacts=[{"name":"Shamim Ahmed","title":"MD & CEO","linkedin":"","source_url":"https://imbdagency.com/about-us/"},
           {"name":"Phil Nobay","title":"Creative Director","linkedin":"","source_url":"https://imbdagency.com/about-us/"}],
 company_phone="+8801797-242610; +8801958-030282; +8801958-030254", public_email="", contact_source_url="https://imbdagency.com/about-us/",
 pitch_angle="Dhaka digital agency serving foreign clients at hourly rates; billable-hour proof for international clients.",
 prepend_notes="Reval 2026-10-07: searched '\"IMBD Agency\" \"Time Doctor\"' and IMBD Dhaka jobs + tracking software (nothing). About page fetched: CEO, phones and Banani DOHS address confirmed; team size given as 26.")
UPD[("CVA Group (GROUP CVA)","Hubstaff")] = dict(
 status="POSSIBLE", confidence_score=25, status_reason="TheirStack only; French job/site searches find no Hubstaff mention; consultants are placed on client sites, so remote tracking need is unclear.",
 contacts=[],
 prepend_notes="Reval 2026-10-07: searched '\"CVA\" Bayonne Hubstaff' (Pole Avenia directory: 1 chemin du Busquet, Bayonne; workforce 350, turnover ~26M EUR) and group-cva.com offre emploi + Hubstaff/suivi du temps (nothing). Not a remote/BPO team, so no contact research this tier; prior President Pierre Vinour (Pappers registry) not re-confirmed.")
UPD[("eigital - Redefining Digital","Time Doctor")] = dict(
 status="POSSIBLE", confidence_score=25, status_reason="TheirStack only; site live, no Time Doctor mention; searches found none.",
 contacts=[], company_phone="+65 3129 2928", public_email="hello@eigital.com", contact_source_url="https://eigital.com/",
 pitch_angle="Distributed dev agency (Singapore/India/US) offering 24/7 development; billable-hour proof for clients.",
 prepend_notes="Reval 2026-10-07: searched 'eigital \"Time Doctor\"' and eigital founder/CEO (no leadership found; Dealroom lists it). Homepage live (2016-2025), phone and hello@ email confirmed. No decision maker found.")
UPD[("Ares Projects","Hubstaff")] = dict(
 status="POSSIBLE", confidence_score=25, status_reason="TheirStack only; homepage live with no Hubstaff mention; searches found nothing.",
 employee_count="40+ team members (homepage); ~59 (TheirStack)", employee_count_source_url="https://aresprojects.com/",
 contacts=[{"name":"Lukasz Chmielnicki","title":"Co-Founder","linkedin":"https://www.linkedin.com/in/lukasz-chmielnicki-1777b01b1/","source_url":"https://aresprojects.com/"},
           {"name":"Charlie Vicente","title":"Co-Founder","linkedin":"","source_url":"https://aresprojects.com/"}],
 company_phone="", public_email="peopleandculture@aresprojects.com (careers)", contact_source_url="https://aresprojects.com/",
 pitch_angle="Founder-led remote Amazon agency (40+ staff, 80+ brands, 17 countries); per-brand billable time and remote team visibility.",
 prepend_notes="Reval 2026-10-07: searched '\"Ares Projects\" Hubstaff' and Ares Projects careers + time tracking (nothing). Homepage fetched: two co-founders and careers email confirmed; no phone shown, so the earlier +44 phone is removed. Lukasz LinkedIn kept from input (seen in search earlier), not re-seen.")
UPD[("MM Coaching Limited (Marriage Reset)","Hubstaff")] = dict(
 status="POSSIBLE", confidence_score=30, status_reason="TheirStack only; searches for Marriage Reset + Hubstaff and Workable jobs + time tracking found nothing.",
 contacts=[{"name":"Josh Hudson","title":"Lead coach / public face (formal title not stated)","linkedin":"","source_url":"https://marriagereset.com/"}],
 company_phone="", public_email="support@marriagereset.com", contact_source_url="https://marriagereset.com/",
 pitch_angle="Fully remote hourly contractors (coaches at $50/hr) and fast growth; hourly contractor time tracking and payroll.",
 prepend_notes="Reval 2026-10-07: searched '\"Marriage Reset\" Hubstaff' (only an unrelated Christian 'Marriage Reset' course) and marriagereset.com Workable + time tracking/Hubstaff (nothing). Site live: entity Pinnacle Coaching LLC, 1309 Coffeen Ave STE 1200 Sheridan WY; support@ email confirmed; no phone.")
UPD[("Edunation (Edunation Finland)","Time Doctor")] = dict(
 status="POSSIBLE", confidence_score=30, status_reason="TheirStack only; searches and job ads (fully remote Account Executive in the Philippines) do not name Time Doctor.",
 contacts=[{"name":"Tuomas Kauppinen","title":"Co-founder & Director","linkedin":"","source_url":"https://elmmagazine.eu/finland-aspires-to-lead-the-adult-education-export-market/"}],
 contact_source_url="https://www.goabroad.com/providers/edunation",
 pitch_angle="Finnish education agency with fully remote sales and admissions staff in the Philippines, Vietnam, Myanmar and Sri Lanka; remote attendance/activity tracking.",
 prepend_notes="Reval 2026-10-07: searched 'Edunation \"Time Doctor\"' and edunation.co careers work-from-home (a fully remote Philippines Account Executive role, no tool named). About page fetch returned nothing (bot protection). Co-founder confirmed by ELM Magazine article (older).")
UPD[("Van Law Firm Injury & Accident Attorneys","Hubstaff")] = dict(
 status="POSSIBLE", confidence_score=30, status_reason="TheirStack only; no source names Hubstaff at Van Law. A law-firm podcast episode titled 'VA Queen Sandy Van' shows the owner relies heavily on virtual assistants, which fits a tracker, but the episode page could not be read (403).",
 contacts=[{"name":"Sandy Van","title":"Owner / Founder & Managing Partner","linkedin":"","source_url":"https://vanlawfirm.com/"}],
 company_phone="+1 725-900-9000 (Las Vegas); (360) 200-0000 (WA); (626) 899-1000 (Monterey Park CA)", public_email="", contact_source_url="https://vanlawfirm.com/",
 workforce_signals="Hybrid; owner known as 'VA Queen' (heavy use of virtual assistants, per Law Firm Blueprint podcast S2:E9 title); TheirStack hit on Chile page suggests LATAM hiring.",
 pitch_angle="PI firm (3 offices) with many offshore virtual assistants; VA time + activity verification at lower per-seat cost.",
 prepend_notes="Reval 2026-10-07: searched '\"Van Law Firm\" Hubstaff' (found the Blue Shark Digital 'Law Firm Blueprint' episode 'S2:E9: VA Queen Sandy Van', page 403) and Sandy Van VAs + tracking tools (nothing specific). Homepage fetched: three offices and phones confirmed.")
UPD[("Ad Snipper","Time Doctor")] = dict(
 status="POSSIBLE", confidence_score=25, status_reason="TheirStack only; about page and searches show no Time Doctor mention.",
 contacts=[{"name":"Muhammad Ammar","title":"Founder & CEO","linkedin":"https://www.linkedin.com/in/ammarpervez/","source_url":"https://adsnipper.com/about-us/"},
           {"name":"Muhammad Hassaan","title":"Director & Co-Founder","linkedin":"https://www.linkedin.com/in/hassaanpervaiz/","source_url":"https://adsnipper.com/about-us/"},
           {"name":"Muhammad Shaheer","title":"Director & Co-Founder","linkedin":"https://www.linkedin.com/in/mshaheerwaseem/","source_url":"https://adsnipper.com/about-us/"}],
 company_phone="", public_email="contact@adsnipper.com", contact_source_url="https://adsnipper.com/about-us/",
 workforce_signals="White-label talent partner with Pakistan-based specialists serving 250+ US/global clients.",
 pitch_angle="White-label offshore team in Karachi serving US agencies; client-facing proof-of-work reports per specialist.",
 prepend_notes="Reval 2026-10-07: searched '\"Ad Snipper\" \"Time Doctor\"' (nothing). About page fetched: three leaders with LinkedIn URLs linked on the page; contact@ email and Farmington MO address confirmed; no phone shown, so the earlier phone is removed.")
UPD[("DynamoLogic Solutions","Time Doctor")] = dict(
 status="POSSIBLE", confidence_score=25, status_reason="TheirStack only; site and job searches show no Time Doctor mention.",
 employee_count="90+ employees (company homepage); 99 (TheirStack)", employee_count_source_url="https://dynamologic.com/",
 contacts=[], company_phone="+971 56 675 4976 (Dubai)", public_email="info@dynamologic.com", contact_source_url="https://dynamologic.com/",
 pitch_angle="Islamabad software house (since 2007, 90+ staff, Dubai sales office) delivering for foreign clients; billable-hour proof.",
 prepend_notes="Reval 2026-10-07: searched '\"DynamoLogic\" \"Time Doctor\"' and DynamoLogic Islamabad jobs + tracking tools (nothing). Homepage fetched: phone, email, Dubai Meydan address; no leaders listed. Leadership search found none; prior co-founder Ibraheem Khan not re-confirmed, so removed.")
UPD[("Eyes On Solution","Hubstaff")] = dict(
 status="POSSIBLE", confidence_score=25, status_reason="TheirStack only; homepage live with no Hubstaff mention; searches found nothing.",
 contacts=[], company_phone="+971 52 273 5116", public_email="admin@eyesonsolution.com", contact_source_url="https://eyesonsolution.com/",
 pitch_angle="Dubai-fronted SEO/outreach agency with a Lahore delivery team; billable hours and remote team visibility.",
 prepend_notes="Reval 2026-10-07: searched '\"Eyes On Solution\" Hubstaff' (nothing). Homepage fetched: phone, admin@ email and Dubai address (Al Wasl Building, Sheikh Zayed Rd) confirmed; no leaders named, so no decision maker.")
UPD[("Payment Pilot","Screenshot Monitor")] = dict(
 status="POSSIBLE", confidence_score=20, status_reason="TheirStack only (Norway page); site live, no ScreenshotMonitor mention; searches found nothing.",
 contacts=[],
 prepend_notes="Reval 2026-10-07: searched '\"Payment Pilot\" ScreenshotMonitor/Screenshot Monitor' and Payment Pilot Charlotte remote sales + screenshot tracking (nothing). Homepage live (phone 704-464-0395, 133 Scaleybark Rd Charlotte). No clear remote/BPO workforce, so no contact research this tier.")
UPD[("Neurons Lab","Hubstaff")] = dict(
 status="POSSIBLE", confidence_score=20, status_reason="TheirStack only; searches for Neurons Lab with Hubstaff or contractor time tracking found nothing.",
 employee_count="50+ AI engineers, architects and analysts across Europe (about page)", employee_count_source_url="https://neurons-lab.com/about",
 contacts=[{"name":"Igor Sydorenko","title":"CEO & Co-Founder","linkedin":"https://www.linkedin.com/in/igor-sydorenko/","source_url":"https://neurons-lab.com/about"},
           {"name":"Weronika Czerny-Nowakowska","title":"Chief Operations Officer & Partner","linkedin":"https://www.linkedin.com/in/weronika-cn/","source_url":"https://neurons-lab.com/about"},
           {"name":"Lika Somoye","title":"Chief People Officer & Partner","linkedin":"https://www.linkedin.com/in/angelikasomoye/","source_url":"https://neurons-lab.com/about"}],
 company_phone="+44 20 3769 4201", public_email="info@neurons-lab.com", contact_source_url="https://neurons-lab.com/about",
 pitch_angle="Distributed AI consultancy (engineers across Europe) billing financial-services clients; project time and billable-hour reporting.",
 prepend_notes="Reval 2026-10-07: searched '\"Neurons Lab\" Hubstaff' and Neurons Lab careers + time tracking (nothing). About page fetched: leaders and LinkedIn URLs linked on the page; added COO Weronika Czerny-Nowakowska; phone and email confirmed.")
UPD[("Zachary Piper Solutions","Teramind")] = dict(
 status="POSSIBLE", confidence_score=15, status_reason="TheirStack only; most likely a skill keyword from insider-threat/UAM analyst postings for federal clients (UAM tools on client networks), not internal workforce monitoring. No direct mention found.",
 contacts=[],
 prepend_notes="Reval 2026-10-07: searched '\"Zachary Piper\" Teramind' and ZPS insider threat analyst + UAM/Teramind/ObserveIT (generic cleared UAM-analyst postings listing Splunk, DTEX, Purview, ObserveIT; none tie Teramind to ZPS internal use). Cleared on-site staff, so no contact research this tier; prior contact Justin Jordan not re-confirmed. Consider DO_NOT_TARGET if a human confirms the keyword source.")
UPD[("Boldr","Toggl Track")] = dict(
 company_domain="", status="POSSIBLE", confidence_score=25, status_reason="TheirStack Toggl hit only; no Boldr page, job or review names Toggl. Boldr is a CX BPO, so Toggl may appear as a client's tool in job text rather than Boldr's own.",
 industry="Impact-sourcing BPO / CX outsourcing (B Corp)", hq_country="United States (operations in US, Canada, Mexico, South Africa, Philippines)",
 employee_count="1,500+ team members (about page)", employee_count_source_url="https://www.boldrimpact.com/about",
 contacts=[{"name":"David Sudolsky","title":"Founder & CEO","linkedin":"","source_url":"https://www.boldrimpact.com/about"},
           {"name":"Erin Mayhood","title":"Chief Operating Officer","linkedin":"","source_url":"https://www.boldrimpact.com/about"},
           {"name":"Mari Parker","title":"President","linkedin":"","source_url":"https://www.boldrimpact.com/about"}],
 company_phone="", public_email="", contact_source_url="https://www.boldrimpact.com/about",
 pitch_angle="1,500-person B Corp BPO across 5 countries with dedicated client CX teams; agent time/activity tracking with client-facing reports, positioned as fair/transparent monitoring.",
 prepend_notes="Reval 2026-10-07: company domain is boldrimpact.com (input had none; company_domain kept blank to match input). Searched 'Boldr BPO \"Toggl\"', Boldr Toggl Track jobs, and Boldr Toggl outsourcing partner (nothing). Kalibrr Customer Advocate posting (2020) names no tool. About page lists founder David Sudolsky (CEO per SupportDriven speaker bio), President Mari Parker, COO Erin Mayhood; no phone/email on the page.")
UPD[("Yeb Inteligência de Mercado (Yeb Marketing & Sourcing)","Teramind")] = dict(
 status="POSSIBLE", confidence_score=15, status_reason="TheirStack only; likely keyword false positive ('monitoramento' refers to Yeb's own market-monitoring products); current jobs are on-site in Rio Claro and name no tool.",
 contacts=[],
 prepend_notes="Reval 2026-10-07: searched '\"Yeb\" \"Teramind\"' (nothing) and Yeb vagas monitoramento (BNE postings for on-site researcher and database qualifier in Rio Claro; no tool). Not remote/BPO, so no contact research this tier; prior partner Felix Sanz Yeboles not re-confirmed.")
UPD[("2COMS Consulting","Workstatus")] = dict(
 status="POSSIBLE", confidence_score=45, status_reason="Named Workstatus case study existed Jul-Aug 2025 (Wayback) but the live page is now anonymized ('this recruitment & staffing firm'), so the naming may not have been authorized; no independent confirmation found.",
 second_source_url="https://www.workstatus.io/case-study/how-2coms-solved-their-project-management-problems", source_publication_date="2025-07",
 contacts=[{"name":"Prashant Pachisia","title":"Founder & CEO, 2COMS Group","linkedin":"","source_url":"https://www.2coms.com/prashant-pachisia"}],
 company_phone="080-4876 6688 (employee helpline landline); +91 8101122022 (WhatsApp, service enquiries)", public_email="", contact_source_url="https://www.2coms.com/",
 workforce_signals="Large Indian staffing firm: 1,000+ recruiters in 10+ cities, on-ground and remote teams; places BPO/retail/IT staff and apprentices; anonymized case study cites workforce analytics, client-facing reports, break/overtime tracking and shift scheduling.",
 pitch_angle="1,000+ recruiters plus deployed staff across 10+ cities; break/overtime tracking and client-facing reports already valued (per anonymized Workstatus story); pitch a lower-cost alternative.",
 prepend_notes="Reval 2026-10-07: live Workstatus page fetched (anonymized; features listed: workforce analytics dashboard, client-facing reports, automated break/overtime tracking, smart shift scheduling, role-based access; no quote, no date). Wayback could not be fetched by this agent. Searched '\"2COMS\" Workstatus' (nothing new). CEO name spelling is 'Pachisia' (company page). 2coms.com homepage phones confirmed.")
UPD[("The Office Gurus","Teramind")] = dict(
 status="PROBABLE", confidence_score=60, status_reason="The Office Gurus logo is on Teramind's current homepage 'Trusted by 10,000+ Companies' wall (re-checked 2026-10-07; logo uploaded 2026). A vendor logo alone is not proof, but it is current and fits a nearshore BPO with work-from-home agents.",
 evidence_quote="Trusted by 10,000+ Companies",
 source_publication_date="2026", last_detected_date="2026-10-07",
 employee_count="~1,500-1,800", hq_country="United States (Seminole, FL); centers in El Salvador, Belize, Jamaica, Dominican Republic",
 workforce_signals="Nearshore BPO/call center; agents in centers in El Salvador, Belize, Jamaica, US plus work-from-home agents in each country (WFH internet bonus and equipment); division of Superior Group of Companies (NASDAQ: SGC).",
 contacts=[{"name":"Dominic Leide","title":"President, Contact Centers (The Office Gurus), Superior Group of Companies","linkedin":"https://www.linkedin.com/in/dominic-leide-24058747/","source_url":"https://www.stocktitan.net/sec-filings/SGC/"}],
 company_phone="(727) 803-7114 (press contact line listed for Dominic Leide in company news releases, per search summary)", public_email="", contact_source_url="https://theofficegurus.com/news/local-call-center-sees-continued-growth-seminole/",
 pitch_angle="Nearshore BPO with on-site and WFH agents across 4 countries using heavy DLP/insider-threat software; pitch lighter, cheaper agent time + activity tracking with client reporting.",
 prepend_notes="Reval 2026-10-07: Teramind homepage re-fetched, logo wall includes 'The Office Gurus' (7th of 26). Searched '\"Office Gurus\" Teramind' and Office Gurus jobs + Teramind/monitoring (no job text names Teramind). Leide confirmed as President, Contact Centers in SGC leadership listings and a May 2026 SEC Form 4. VP HR Mitch Korb (hired Jan 2021) not re-confirmed, not listed. Contact page 403. Personal LinkedIn kept from input, not re-seen.")
UPD[("AffirmData","EmpMonitor")] = dict(
 status="POSSIBLE", confidence_score=40, status_reason="Only evidence is the AffirmData logo in EmpMonitor's client graphic (re-checked: logo present, image uploaded 2026-01). The same graphic shows big brands (Wipro, ICICI, Cognizant, Airtel) and EmpMonitor's testimonials include placeholder reviewers, so the claim is low quality.",
 employee_count="1,200+ global staff (homepage); 500-999 (Outsource Accelerator)", employee_count_source_url="https://affirmdata.com/",
 hq_country="United States (offices India, Philippines; also lists Europe, Canada, Australia)",
 workforce_signals="Offshore staffing/BPO for mortgage, lending, real estate, fintech; dedicated offshore teams in India and Philippines.",
 contacts=[], company_linkedin="http://www.linkedin.com/company/affirmdata", contact_source_url="https://www.outsourceaccelerator.com/company/affirmdata/",
 pitch_angle="1,200-staff offshore BPO for US mortgage/fintech clients; client-facing proof-of-work and attendance for dedicated offshore teams.",
 prepend_notes="Reval 2026-10-07: downloaded and viewed the EmpMonitor client graphic; the 'affirmdata' logo is present. Searched 'AffirmData EmpMonitor' (nothing else) and AffirmData leadership. Homepage live; about/contact pages 404; no leadership, phone or email published. Prior founder Anthony Fulginiti could not be confirmed by search, so removed. Company LinkedIn from Outsource Accelerator profile.")
UPD[("Cekindo","Insightful")] = dict(
 status="POSSIBLE", confidence_score=25, status_reason="Insightful case study still live (Cekindo replaced fingerprint attendance with Insightful screenshots/app tracking for 110 WFH staff in 2020), but it is pandemic-era and the Cekindo brand is now InCorp Indonesia, rebranding to Ascentium; no current confirmation.",
 evidence_quote="We were using fingerprint scanners to track employees' attendance. Once the emergency state was pronounced in our country, these became obsolete",
 source_publication_date="2020", contacts=[],
 company_phone="+62 21 5010 1510", public_email="indonesia@incorp.asia", contact_source_url="https://www.cekindo.com/",
 prepend_notes="Reval 2026-10-07: case study re-fetched (live; HRGA Manager Engkin Nursita quoted; features: apps/websites, productivity, screenshots, time & attendance, real-time monitoring). Searched Cekindo/InCorp + Insightful/Workpuls (only the case study). cekindo.com now serves InCorp Indonesia ('an Ascentium Company', rebranding to Ascentium; 1,500+ professionals group-wide; AXA Tower Kuningan, Jakarta). Office-based consultancy now, so no new decision-maker research; the HRGA manager from 2020 is not confirmed and not a business decision maker, so removed from contacts.")
UPD[("Nethority Technologies Pvt. Ltd.","Hubstaff")] = dict(
 status="POSSIBLE", confidence_score=20, status_reason="TheirStack only; no job ad, review or page names Hubstaff; Nashik office roles.",
 contacts=[],
 prepend_notes="Reval 2026-10-07: searched 'Nethority Hubstaff' and Nethority Nashik jobs + Hubstaff/tracker (nothing). nethority.com returns HTTP 406 to scripted requests (site likely alive behind a firewall). Founder Ruturaj Kohok (per Affluense/YourStory snippet) also lists CEO of Netsight.ai since Sep 2024, so his current focus is unclear; not re-listed. Office-based agency, no further contact research.")
BS_CONTACTS=[{"name":"Raisul Kabir","title":"Co-Founder & CEO","linkedin":"https://www.linkedin.com/in/raisul/","source_url":"https://desktime.com/case-studies/brain-station-23"},
             {"name":"Mohammad Mizanur Rahman","title":"Director & CTO","linkedin":"","source_url":"https://futurestartup.com/2025/10/09/a-conversation-with-mohammad-mizanur-rahman-cto-brain-station-23/"},
             {"name":"MJ Ferdous","title":"COO & Director (per 2022 interview)","linkedin":"","source_url":"https://futurestartup.com/2022/06/07/interview-with-mj-ferdous-brain-station-23/"}]
BS_COMMON=dict(employee_count="900+ tech professionals (company homepage, 2026); ~1,000 per Future Startup", employee_count_source_url="https://brainstation-23.com/",
 contacts=BS_CONTACTS, company_phone="+880 9610-902323 (Dhaka); +1 606 773 7443 (US, Springfield VA); +971 4 242 0223 (Dubai)", public_email="",
 contact_source_url="https://brainstation-23.com/contact-us/")
UPD[("Brain Station 23","DeskTime")] = dict(BS_COMMON,
 status="POSSIBLE", confidence_score=40, status_reason="DeskTime case study naming Brain Station 23 and quoting CEO Raisul Kabir is still live, but it dates from c.2020 (300+ staff then) and Apploye now shows Brain Station 23 on its 2026 homepage, so DeskTime may have been replaced.",
 evidence_quote="My philosophy for using DeskTime is that I don't want to use it to monitor people. Instead, I use it to help them to achieve their goals.",
 source_publication_date="2020", second_source_url="https://apploye.com/",
 pitch_angle="900+ engineer offshore dev shop with a CEO who frames tracking as empowerment and uses it to settle client disputes over developer hours; possible switch already underway (DeskTime story vs Apploye logo).",
 prepend_notes="Reval 2026-10-07: DeskTime case study re-fetched (live, no date; Wayback first capture 2020-08-04). Searched '\"Brain Station 23\" DeskTime OR Apploye OR time tracking'. Leadership from Future Startup interviews; contact page phones confirmed; email shown only via form, so the earlier sales@ address is removed. Raisul LinkedIn is linked from the company's own site per prior run.")
UPD[("Brain Station 23","Apploye")] = dict(BS_COMMON,
 status="PROBABLE", confidence_score=55, status_reason="Brain Station 23 logo is shown in Apploye's current homepage 'Trusted by' strip (2nd of 16, re-checked 2026-10-07). Apploye is a Bangladesh-based tracker, which makes a local switch from DeskTime plausible. Logo only, no testimonial.",
 source_publication_date="2026", last_detected_date="2026-10-07",
 pitch_angle="900+ engineer Bangladeshi dev shop billing foreign clients by hours; likely on Apploye now (moved from DeskTime); pitch richer client-facing proof-of-work and AI productivity insights.",
 prepend_notes="Reval 2026-10-07: Apploye homepage re-fetched; 'Brain Station 23' is in the Trusted-by list with logo; no testimonial. No independent mention of Apploye at Brain Station 23 found. Contacts as for the DeskTime row.")
UPD[("La Net Team Software Solutions Pvt Ltd","Hubstaff")] = dict(
 status="POSSIBLE", confidence_score=28, status_reason="TheirStack only; site live with no Hubstaff mention; career/job searches found nothing.",
 contacts=[], company_phone="+91 7229030202", public_email="recruitment@lanetteam.com", contact_source_url="https://lanetteam.com/",
 pitch_angle="200+ engineer offshore dev shop (Surat + Menlo Park) billing foreign clients hourly; client-facing proof-of-work.",
 prepend_notes="Reval 2026-10-07: searched '\"La Net Team\" Hubstaff' and lanetteam careers + Hubstaff/Upwork tracker (nothing). Homepage fetched: 200+ engineers, Surat and Menlo Park addresses, phone and recruitment@ email confirmed; no leaders named. Founder Ajeet Singh not confirmed by search (only other Ajeet Singhs), so removed; hr@ email not re-seen, removed.")
UPD[("LunaJoy Health","Time Doctor")] = dict(
 status="POSSIBLE", confidence_score=28, status_reason="TheirStack only; Care Navigator and YC job postings name no time tracker.",
 hq_country="United States (Atlanta, GA per YC profile; earlier list said St. Petersburg, FL)",
 workforce_signals="Remote Care Navigator call center; hourly remote clinicians ($60-95/hr); offshore-priced engineering/PM/QA roles at $1.5K-2.5K per month on YC jobs board (likely offshore contractors).",
 contacts=[{"name":"Sipra Laddha","title":"Co-founder (Co-CEO per earlier list)","linkedin":"https://www.linkedin.com/in/sipraladdha","source_url":"https://www.ycombinator.com/companies/lunajoy-health"},
           {"name":"Shama Rathi, MD","title":"Co-founder (Co-CEO per earlier list)","linkedin":"https://www.linkedin.com/in/shama-rathi-35878b20b/","source_url":"https://www.ycombinator.com/companies/lunajoy-health"}],
 contact_source_url="https://www.ycombinator.com/companies/lunajoy-health",
 pitch_angle="YC telehealth startup with remote hourly clinicians, a remote care-navigator call team and offshore-rate engineers; hourly contractor time tracking at startup pricing.",
 prepend_notes="Reval 2026-10-07: searched 'LunaJoy \"Time Doctor\"' and LunaJoy care navigator jobs + time tracking (nothing). YC company page fetched: founders with LinkedIn URLs linked there, 12 open roles incl. offshore-priced engineers. Phone/email kept from input (not re-checked).")
UPD[("Clyro","Everhour")] = dict(
 status="POSSIBLE", confidence_score=25, status_reason="TheirStack Everhour hit only; site live, no Everhour mention; searches found nothing.",
 contacts=[{"name":"Sikander (Azam)","title":"CEO","linkedin":"","source_url":"https://clyro.agency/"}],
 company_phone="+92 317 5409548 (WhatsApp link on site)", public_email="", contact_source_url="https://clyro.agency/",
 pitch_angle="Pakistan-based UI/UX agency serving US SaaS clients; billable-hour tracking per client project.",
 prepend_notes="Reval 2026-10-07: searched 'Clyro agency Everhour' (nothing). Homepage fetched: CEO 'Sikander' offers strategy calls (Calendly handle sikanderazam) and a WhatsApp number; no email or address.")
UPD[("Language Trainers","My Hours")] = dict(
 status="POSSIBLE", confidence_score=15, status_reason="TheirStack 'My Hours' hit is probably generic wording (freelance tutors logging 'my hours'); no myhours.com link or mention found.",
 contacts=[],
 prepend_notes="Reval 2026-10-07: searched '\"Language Trainers\" \"My Hours\" OR myhours.com' and Language Trainers tutor jobs + timesheet/time tracking (nothing; only Jobgether tutor postings). Kept POSSIBLE rather than DO_NOT_TARGET because the source text could not be seen. Freelance tutor model, but no contact research at this confidence.")
UPD[("SiteTech Systems","ActivTrak")] = dict(
 status="POSSIBLE", confidence_score=40, status_reason="ActivTrak blog interview (May 2020) is still live: SiteTech used ActivTrak to move 30+ staff remote, track time logs for client billing and detect USB use. No evidence since 2020.",
 evidence_quote="I'm 100% confident that if we decide to embrace remote work on a more permanent basis...that we'll be able to do so first and foremost because ActivTrak.",
 source_publication_date="2020-05",
 contacts=[{"name":"Trevor Greene","title":"Quoted in ActivTrak story (title not stated)","linkedin":"","source_url":"https://www.activtrak.com/blog/activtrak-in-action-sitetech-systems/"}],
 contact_source_url="https://www.activtrak.com/blog/activtrak-in-action-sitetech-systems/",
 pitch_angle="Research/analytics consultancy that tracks time for client billing across remote analysts; 2020 ActivTrak adopter, a candidate for a cheaper tracker with billing reports.",
 prepend_notes="Reval 2026-10-07: blog re-fetched (live; quotes Trevor Greene; uses: remote time logs for billing, productivity, USB detection, timesheet reconciliation). Searched '\"SiteTech\" ActivTrak \"Trevor Greene\"' and SiteTech 2025/2026 (nothing new). sitetechsystems.com is behind a bot check, so alive status not confirmed. President Todd Woodard not confirmed by search, so removed from contacts (LinkedIn https://www.linkedin.com/in/toddgwoodard/ and phone 843-808-9716 remain from input, unverified).")
UPD[("HasTech IT Limited (HasThemes)","DeskTime")] = dict(
 status="POSSIBLE", confidence_score=40, status_reason="DeskTime case study naming HasTech and MD Aslam Hasib is still live (adopted April 2020); no newer evidence of continued use.",
 evidence_quote="It saves money, and at the same time, it increases revenue. So it's beneficial to us in two crucial ways",
 source_publication_date="2020",
 employee_count="45 designers and developers (HasThemes about page)", employee_count_source_url="https://hasthemes.com/about-us/",
 contacts=[{"name":"Aslam Hasib","title":"Managing Director (per DeskTime case study)","linkedin":"https://www.linkedin.com/in/aslamhasib","source_url":"https://desktime.com/case-studies/hastech"}],
 contact_source_url="https://hasthemes.com/about-us/",
 pitch_angle="45-person Bangladeshi theme/dev studio that uses screenshots and activity reports for client billing (DeskTime since 2020); pitch renewal-time switch on price/features.",
 prepend_notes="Reval 2026-10-07: case study re-fetched (live; features: automatic time tracking, Trello project tracking, productivity, screenshots, custom work hours, billing reports; $2K/month saving). Searched HasTech/HasThemes + DeskTime/Aslam Hasib (only the case study). About page: 45 staff, no phone/email/leaders listed. MD LinkedIn kept from input (seen by prior run), not re-seen.")
