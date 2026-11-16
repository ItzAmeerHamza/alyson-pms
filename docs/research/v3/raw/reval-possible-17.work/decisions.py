TS = 'TheirStack-only listing; '
D = {}

D[0] = dict(status='POSSIBLE', confidence_score=10,
    status_reason='TheirStack-only; YeahPromos is a Shanghai affiliate/influencer marketing platform (14 staff); "homebase" is a known generic-word collision; nothing on its site or in search ties it to Homebase software.',
    industry='Affiliate / influencer marketing platform', hq_country='China',
    notes='Fetched yeahpromos.com (live, Shanghai ICP registration, affiliate platform). Searched "YeahPromos" Homebase: only Homebase company/retailer pages. Under 25 staff, no contact research. Likely false match.')

D[1] = dict(status='POSSIBLE', confidence_score=15,
    status_reason='TheirStack-only; site (grandc.co.uk, live, Guildford trade-marketing agency) and searches show no Paymo mention.',
    hq_country='United Kingdom', industry='Trade / shopper marketing agency',
    notes='Fetched grandc.co.uk (live; Grand Central Creative LLP, Tempus Court, Guildford; 0208 546 0150, hello@grandc.co.uk). Searched "Grand Central Creative" Paymo and job-board variants: nothing. Agency profile fits Paymo, but unconfirmed. 18 staff, no contact research per rules (phone/email recorded only in notes).')

D[2] = dict(status='POSSIBLE', confidence_score=15,
    status_reason='TheirStack-only; bluebee.co.uk (live Salisbury digital agency) and searches show no Paymo mention.',
    hq_country='United Kingdom', industry='Digital marketing / web design agency',
    notes='Fetched bluebee.co.uk (live; Unit 9 Centre One, Lysander Way, Salisbury SP4 6BU; 01722 775 500; hello@bluebee.co.uk). Searched "blue bee" Paymo: only TheirStack and BuiltWith agency pages. 19 staff, no contact research.')

D[3] = dict(status='POSSIBLE', confidence_score=15,
    status_reason='TheirStack-only; winwinweb.ma (live Casablanca growth-marketing agency) and searches show no Time Doctor mention.',
    hq_country='Morocco', industry='Digital marketing agency',
    notes='Fetched winwinweb.ma (live; WinWinWeb SARL, 39 Av. Lalla Lyacout, Casablanca; +212 638 114 780; founder first name Yassine only). Searched "Win Win Web" Time Doctor (FR/EN): nothing. 8 staff, no contact research.')

D[4] = dict(status='POSSIBLE', confidence_score=15,
    status_reason='TheirStack-only; no job post, filing or review ties Raymond James to Veriato. Searches return only investments in similarly named tickers (Veralto, VeriSign).',
    notes='Searched "Raymond James" Veriato and job posts mentioning Veriato/Spector 360: nothing. Over 5,000 employees; no outreach research.')

D[5] = dict(status='POSSIBLE', confidence_score=15,
    status_reason='TheirStack-only; no job post or other source ties TIAA to Veriato.',
    notes='Searched TIAA Veriato and job posts naming Veriato/Spector 360: nothing. Over 5,000 employees; no outreach research.')

D[6] = dict(status='POSSIBLE', confidence_score=30,
    status_reason='Only evidence is an old (~2018-2020) Hubstaff Tasks customer story about a 9-person team; no recent evidence. yac.com still up but shows an old "Home OLD" page and a "new Yac coming soon" waitlist, no news since the 2021 $7.5M raise.',
    source_publication_date='2020', employee_count='~9 (2020 story)',
    notes='Fetched yac.com (live, legacy async-voice product page + waitlist). Searched for shutdown/pivot news and 2026 activity: none found either way. Input contact Hunter McKinley (CEO) could not be confirmed as still in role, so not carried into contacts. Under 25 staff, low priority.')

D[7] = dict(status='POSSIBLE', confidence_score=30,
    status_reason='Time Doctor case study originally from 2016, re-published on resources.timedoctor.com in 2023; no current evidence the consultancy still uses it or still operates as a team business. Rob Bertholf now presents as an individual social-media/content strategist (San Diego).',
    source_publication_date='2023-12', second_source_url='https://timedoctor.com/case-study-bertholfconsulting',
    notes='Searched "Rob Bertholf" Time Doctor (only the case study pages) and Bertholf Consulting 2025 (nothing current). No domain in input; none confirmed. 1-25 staff, no contact research. Input contact Rob Bertholf (Founder) not re-confirmed, not carried into contacts.')

D[8] = dict(status='POSSIBLE', confidence_score=10,
    status_reason='TheirStack-only and no corroboration; "ProHance" searches return only the gadolinium MRI contrast drug (known collision). Ameriprise has large India ops where ProHance software is common, so not ruled out, but nothing confirms it.',
    notes='Searched "Ameriprise" ProHance: only SEC filings and ProHance drug pages. Treated as likely keyword false match (MRI contrast agent / healthcare benefits text).')

D[9] = dict(status='POSSIBLE', confidence_score=30,
    status_reason='Veriato case study (PDF (c)2016) naming DANCEL using Veriato 360 on 15 workstations; stale, no recent evidence. Company is alive (dancel.com, litigation support, Mississippi) with new CEO Shane O\'Keefe; Celeste O\'Keefe now listed as Legacy Founder.',
    source_publication_date='2016', hq_country='United States',
    company_phone='228-396-1205', contact_source_url='https://dancel.com',
    contacts=[{"name": "Shane O'Keefe", "title": "CEO", "linkedin": "", "source_url": "https://dancel.com"}],
    public_email='shane.okeefe@dancel.com',
    pitch_angle='Long-time Veriato user (since ~2016) for policy enforcement; pitch a lighter, modern activity monitoring + time tracking tool for a small litigation-support team.',
    notes='Fetched dancel.com (live). Searched DANCEL / Celeste O\'Keefe 2025: no new Veriato evidence. Small team (~5-15), outside the 25+ band; site contact info recorded because it was on the fetched homepage. Input contact Celeste O\'Keefe replaced: site now lists her as Legacy Founder, Shane O\'Keefe as CEO.')

D[10] = dict(status='POSSIBLE', confidence_score=10,
    status_reason='TheirStack-only; "sapience" is a generic word and no job post or source links Lexmark (now part of Xerox, 2025) to Sapience Analytics.',
    notes='Searched Lexmark Sapience and Lexmark job posts naming Sapience: nothing. Over 5,000 employees; no outreach research.')

D[11] = dict(status='POSSIBLE', confidence_score=10,
    status_reason='TheirStack-only; "sapience" generic word; no source links the company (Hartford Steam Boiler / Munich Re group in Canada) to Sapience Analytics. Input HQ "Germany" reflects the Munich Re parent.',
    notes='Searched company name with Sapience / time tracking / employee monitoring: nothing. No domain in input. Large group; no outreach research.')

D[12] = dict(status='POSSIBLE', confidence_score=15,
    status_reason='TheirStack-only; no Hubstaff mention found on site, job boards or search. Small Mohali security consultancy.',
    company_linkedin='https://in.linkedin.com/company/kryszna-cybersecurity', company_phone='+91 172 291 3470', public_email='info@kryszna.in',
    contact_source_url='https://kryszna.in',
    notes='kryszna.in returned HTTP 403 to fetch; searches "Kryszna" Hubstaff, site:kryszna.in Hubstaff/careers, and company name: nothing beyond TheirStack. Company phone/email/LinkedIn carried from the earlier pass (could not re-fetch site). Input contact Gagandeep Singh (CEO) could not be re-confirmed this pass, so not carried into contacts. Real headcount ~10-13 (LinkedIn band 51-200 unverified).')

D[13] = dict(status='POSSIBLE', confidence_score=10,
    status_reason='TheirStack-only; no CoStar job posting, review or doc names Teramind. CoStar has call-center style sales/research teams, but nothing confirms Teramind.',
    notes='Searched "CoStar" Teramind and CoStar jobs naming Teramind/employee monitoring: only generic CoStar postings. Over 5,000 employees; no outreach research.')

D[14] = dict(status='POSSIBLE', confidence_score=25,
    status_reason='Only evidence is a Hubstaff customer story (archived 2020, since removed from hubstaff.com) about GPS/geofenced job-site clock-ins. Removal and age make current use unconfirmed. Company alive (Chicago GC, 320 W Ohio St, 11-50 staff, President Javier Enciso).',
    source_publication_date='2020', hq_country='United States',
    second_source_url='https://www.buildzoom.com/contractor/enc-construction-development',
    contacts=[{"name": "Javier Enciso", "title": "President", "linkedin": "", "source_url": "https://theorg.com/org/enc-construction-development"}],
    workforce_signals='Field construction crews, GPS job-site clock-ins (from 2020 story).',
    pitch_angle='Field-crew time tracking; weak fit for desktop monitoring.',
    notes='Searched ENC Construction / Javier Enciso: company active (BuildZoom licence data, theorg.com, Choose Chicago listing); no current Hubstaff mention. Javier Enciso confirmed as President via search-result snippets (theorg.com). No domain in input; field-service use, low priority.')

D[15] = dict(status='POSSIBLE', confidence_score=10,
    status_reason='TheirStack-only; tech-stack sites show HubSpot, likely HubSpot/Hubstaff confusion. No Hubstaff evidence found.',
    company_linkedin='https://uk.linkedin.com/company/marketingmavens', company_phone='0141 363 0014',
    notes='Searched "Marketing Mavens" Glasgow Hubstaff and domain + Hubstaff: nothing. Under 10 staff; no further contact research.')

D[16] = dict(status='POSSIBLE', confidence_score=10,
    status_reason='TheirStack-only; SlyFox is a HubSpot Certified Partner, so likely HubSpot/Hubstaff confusion. No Hubstaff evidence found.',
    company_linkedin='https://ca.linkedin.com/company/slyfox-digital-media-marketing', company_phone='(519) 601-6696', public_email='info@sly-fox.ca',
    notes='Searched "SlyFox" Hubstaff/time tracking and domain + Hubstaff: nothing. Under 10 staff.')

D[17] = dict(status='POSSIBLE', confidence_score=10,
    status_reason='TheirStack-only; Carrum Downs MSP (not the US Extreme Networks Inc.). No Hubstaff evidence; it sells web-activity tracking via Sophos firewalls to clients, which may explain the tech hit.',
    company_phone='(03) 9785 7162',
    notes='Searched "Extreme Networks" Carrum Downs Hubstaff and domain + staff monitoring/time tracking: only Extreme Networks Inc. results. ~15 staff.')

D[18] = dict(status='POSSIBLE', confidence_score=10,
    status_reason='TheirStack-only; Gencell (Colombian genetics lab with Brazil unit) has no ActivTrak mention anywhere found.',
    company_linkedin='https://br.linkedin.com/company/gencell-brasil',
    notes='Searched "Gencell" Brasil ActivTrak and Gencell Brasil genetics lab: only CB Insights (Gencell Pharma, Colombia). Tiny Brazil team.')

D[19] = dict(status='POSSIBLE', confidence_score=10,
    status_reason='TheirStack-only; no Hubstaff mention on careers page or in searches.',
    company_linkedin='https://pl.linkedin.com/company/webtom-pl', company_phone='+48 602 152 550', public_email='kontakt@webtom.pl',
    notes='Searched "Webtom" Pila Hubstaff and webtom.pl praca Hubstaff/time tracking: nothing. Under 10 staff.')

D[20] = dict(status='POSSIBLE', confidence_score=10,
    status_reason='TheirStack-only (Uruguay DeskTime page); no Odevo or subsidiary source names DeskTime.',
    notes='Searched "Odevo" DeskTime and Odevo time tracking subsidiary: nothing. Over 5,000 employees (property-management roll-up); no outreach research.')

D[21] = dict(status='POSSIBLE', confidence_score=10,
    status_reason='TheirStack-only; identity unresolved (several Indian firms named Pixel Media), no domain, no Time Doctor evidence.',
    notes='Searched "Pixel Media" India "Time Doctor": nothing specific. Cannot target without identity.')

D[22] = dict(status='POSSIBLE', confidence_score=20,
    status_reason='Undated, old FeaturedCustomers Time Doctor testimonial from a 6-person agency; company not findable online today (no domain), so likely defunct or renamed.',
    notes='Searched "InkMustache" agency / Adriano Teles: no trace of the agency. Testimonial says they chose Time Doctor after trying Paymo, Chrometa, TaskCoach. Tiny; no contact research.')

D[23] = dict(status='DO_NOT_TARGET', confidence_score=5,
    status_reason='Likely keyword false match: Navy searches only surface medical-officer ("doctor") recruitment, nothing about Time Doctor software. Also a government defence force, not a realistic SaaS target.',
    notes='Searched "Royal Australian Navy" "Time Doctor" software: only Time Doctor review pages. Earlier pass found only Navy doctor recruitment content.')

D[24] = dict(status='DO_NOT_TARGET', confidence_score=5,
    status_reason='Likely keyword false match: "Work Examiner" hit on state job titles (boards/examiners); no SC agency is shown using Work Examiner software. State government.',
    notes='Searched South Carolina state agency "Work Examiner" software: only Work Examiner product reviews and unrelated SLED monitoring guidance.')

D[25] = dict(status='POSSIBLE', confidence_score=25,
    status_reason='Only a Workable Payroll & AP Administrator posting listing QuickBooks Time/QuickBooks Payroll experience as nice-to-have; not proof the company uses it. Could not re-find the posting.',
    evidence_type='Older job posting',
    notes='Searched "MGM Mechanical" "QuickBooks Time"/TSheets, MGM Mechanical Payroll AP Administrator Workable, mgmmechanical.ca careers QuickBooks Time: no hit beyond the earlier Workable find. 15 staff, construction field crews; no contact research.')

D[26] = dict(status='DO_NOT_TARGET', confidence_score=10,
    status_reason='Vendor-affiliated: co-founder Razvan Ciocanel has been a senior full-stack developer at Hubstaff for ~12 years (LinkedIn snippet), so Epic Coders is effectively in the Hubstaff orbit. Evidence was also an old Hubstaff Tasks (project management) story, not time tracking. Tiny (2025 revenue ~306k RON).',
    second_source_url='https://ro.linkedin.com/in/chocksy', third_source_url='https://targetare.ro/30746194/epiccoders-srl',
    notes='Searched "Epic Coders" Timisoara (alive, EPICCODERS SRL, CUI 30746194, founded 2012) and Epic Coders Hubstaff Razvan Ciocanel.')

D[27] = dict(status='POSSIBLE', confidence_score=20,
    status_reason='TheirStack-only; searches return Attentive (Mobile) "AI Pro" and ProHance product pages, nothing tying Attentive.ai to ProHance. India production team makes ProHance plausible but unconfirmed.',
    workforce_signals='Offshore production team in India doing measurements/takeoffs (from earlier pass).',
    notes='Searched "Attentive.ai" ProHance and Attentive.ai Noida production team ProHance/time tracking jobs: nothing. Input contact Shiva Dhawan (Co-founder & CEO) not re-confirmed this pass, so not carried into contacts; LinkedIn URL from input omitted for the same reason. Employee count (3.1k) likely confused with Attentive Mobile; real size probably a few hundred.')

D[28] = dict(status='POSSIBLE', confidence_score=15,
    status_reason='TheirStack-only; Urban Harvest STL (St. Louis rooftop-farm nonprofit) job posts on Handshake do not mention Buddy Punch.',
    notes='Searched "Urban Harvest STL" Buddy Punch/timeclock and Urban Harvest STL staff Buddy Punch: only Handshake farm-job postings. 15 staff, field workers; no contact research.')

D[29] = dict(status='POSSIBLE', confidence_score=10,
    status_reason='TheirStack-only; no source ties Changi General Hospital to ClickTime. Public hospital (7k+ staff), poor fit.',
    notes='Searched Singapore hospital "ClickTime" timesheet and combined CGH/TTSH/NUH ClickTime: nothing. Over 5,000 staff; no outreach research.')

D[30] = dict(status='POSSIBLE', confidence_score=10,
    status_reason='TheirStack-only; no source ties National University Hospital (Singapore) to ClickTime.',
    notes='Same searches as CGH: nothing. Over 5,000 staff; no outreach research.')

D[31] = dict(status='POSSIBLE', confidence_score=15,
    status_reason='TheirStack-only; no source ties RLACF to ClickTime (nonprofits do commonly use ClickTime for grant time tracking, so plausible).',
    notes='Searched "Red Lodge Area Community Foundation" ClickTime: only foundation pages (Red Lodge MT, 13 staff). No contact research (under 25).')

D[32] = dict(status='POSSIBLE', confidence_score=10,
    status_reason='TheirStack-only; no Saab job post or doc names ClickTime.',
    notes='Searched "Saab" "ClickTime" and Saab job ClickTime: nothing. Over 5,000 employees; no outreach research.')

D[33] = dict(status='POSSIBLE', confidence_score=10,
    status_reason='TheirStack-only; identity unclear (TheirStack says India, 11 staff, broadcast media; the best-known Socialfly is a NYC social agency with ~27 staff). No ClickTime evidence for either.',
    notes='Searched "Socialfly" ClickTime and Socialfly agency ClickTime timesheets: nothing. No domain in input.')

D[34] = dict(status='POSSIBLE', confidence_score=10,
    status_reason='TheirStack-only; no source ties Tan Tock Seng Hospital to ClickTime.',
    notes='Same searches as CGH: nothing. Over 5,000 staff; no outreach research.')

D[35] = dict(status='PROBABLE', confidence_score=50,
    status_reason='ClickTime publishes a customer story "University of Alberta IT Ensures Effective Operations with ClickTime": the Information Services & Technology (IST) department uses ClickTime for employee time tracking. Undated and older (the quoted director has since moved to MacEwan University), so current use is likely but not confirmed.',
    evidence_type='Vendor case study',
    evidence_summary='ClickTime customer story: UAlberta IST replaced Excel and mixed tools with ClickTime to track employee time and analyse operational/project costs; quote from Cheryl Earle, then Director of Finance & Administration, IST.',
    evidence_quote='ClickTime has given us a new understanding of how employees spend their time',
    source_url='https://www.clicktime.com/?p=21776', source_publication_date='',
    second_source_url='https://www.clicktime.com/solutions/time-tracking-for-universities-and-higher-education',
    third_source_url='https://sites.macewan.ca/macewantoday/?p=1527',
    estimated_tracked_seats='', industry='Higher Education', hq_country='Canada',
    pitch_angle='IT department (IST) timesheets for project/operational costing; Tavilo could add automatic activity-based time capture vs manual ClickTime timesheets. Large public university, slow procurement; CIO role being recruited in 2026.',
    notes='Case-study URL redirects to clicktime.com home on fetch; content confirmed via search snippets (title, quote, department). Quoted contact Cheryl Earle has left (now AVP Financial Services, MacEwan University per MacEwan news), so not recorded as a contact. UAlberta posted a CIO / AVP IST search in 2026 (apps.ualberta.ca/careers/posting/2193), so no current IST leader named. Over 5,000 employees overall; the user group is the IST department only. No phone/email/LinkedIn seen verbatim this pass.')

D[36] = dict(status='POSSIBLE', confidence_score=10,
    status_reason='TheirStack-only; no Wolters Kluwer job post or doc names ClickTime.',
    notes='Searched "Wolters Kluwer" "ClickTime" timesheet and WK jobs ClickTime: nothing. Over 5,000 employees; no outreach research.')

D[37] = dict(status='POSSIBLE', confidence_score=15,
    status_reason='TheirStack-only; Gulf South Roofing LLC (Gulfport MS, est. 2019, GAF contractor) has no public ClockShark mention.',
    notes='Searched "Gulf South Roofing" ClockShark and domain list + ClockShark: only GAF contractor listings. 11 staff, field crews; no contact research.')

D[38] = dict(status='POSSIBLE', confidence_score=10,
    status_reason='TheirStack-only; no ClockShark mention for Harrison Green (architecture/planning, 17 staff). ClockShark is a field-crew tool, odd fit for an architecture firm.',
    notes='Searched "Harrison Green" architecture ClockShark and domain list + ClockShark: nothing. Under 25 staff.')

D[39] = dict(status='POSSIBLE', confidence_score=15,
    status_reason='TheirStack-only; no ClockShark mention for Harbour Hills Construction Management.',
    notes='Searched "Harbour Hills" construction ClockShark and domain list + ClockShark: nothing. 12 staff.')

D[40] = dict(status='POSSIBLE', confidence_score=15,
    status_reason='TheirStack-only; no ClockShark mention for Raven Supply.',
    notes='Searched "Raven Supply" ClockShark and domain list + ClockShark: nothing. 13 staff.')

D[41] = dict(status='POSSIBLE', confidence_score=15,
    status_reason='TheirStack-only; no ClockShark mention for TRU Architectural.',
    notes='Searched "TRU Architectural" ClockShark/time tracking: nothing. No domain in input. 20 staff.')

D[42] = dict(status='POSSIBLE', confidence_score=20,
    status_reason='TheirStack-only; Eco Brite (Hull commercial cleaning, live) site shows no Connecteam mention. Cleaning firms are a core Connecteam segment, so plausible but unconfirmed.',
    notes='Fetched ecobrite.co.uk (live; The Bloc, Springfield Way, Anlaby, Hull HU10 6RJ). Searched "Eco Brite" cleaning Connecteam: nothing. 11 staff, frontline; no contact research.')

D[43] = dict(status='POSSIBLE', confidence_score=10,
    status_reason='TheirStack-only; Fine Diner is a small Dubai British-comfort-food delivery / food-truck business; no Connecteam mention.',
    hq_country='United Arab Emirates',
    notes='Fetched finediner.co (live). Searched "Fine Diner" Dubai Connecteam: nothing. 14 staff.')

D[44] = dict(status='POSSIBLE', confidence_score=20,
    status_reason='TheirStack-only; FlexiHome Care (NDIS provider, Bella Vista NSW) has no public Connecteam mention. Home-care is a core Connecteam segment, so plausible but unconfirmed.',
    notes='Searched "FlexiHome Care" Connecteam and FlexiHome Care NDIS support-worker app/clock-in: only NDIS Commission registration. 17 staff, frontline carers; no contact research.')
