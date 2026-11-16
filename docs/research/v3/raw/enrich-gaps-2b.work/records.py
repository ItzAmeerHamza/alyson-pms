#!/usr/bin/env python3
"""Builds v3/raw/enrich-gaps-2b.json from records below. Run: python3 records.py"""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'enrich-gaps-2b.json')
INP = os.path.join(HERE, '..', '..', 'batches', 'enrich-gaps-2b.json')


def C(name, title, src, li=''):
    return {"name": name, "title": title, "linkedin": li, "source_url": src}


def R(name, domain, vendor, emp='', hq='', contacts=(), cli='', phone='', email='', csrc='', notes='', status='', reason=''):
    r = {"company_name": name, "company_domain": domain, "vendor": vendor, "evidence_type": "Contact enrichment",
         "status": status, "confidence_score": 0, "employee_count": emp, "hq_country": hq,
         "contacts": list(contacts), "company_linkedin": cli, "company_phone": phone, "public_email": email,
         "contact_source_url": csrc, "notes": notes}
    if status:
        r["status_reason"] = reason
    return r


REC = []

REC.append(R("ShowMe Therapy Services", "", "My Hours", "40+", "US",
    [C("Courtney Siebert", "Chief Operations Officer", "https://myhours.com/case-study-showme-therapy-services")],
    notes="COO Courtney Siebert is quoted in the My Hours case study (new decision maker). The case study links no company website; showmetherapy.com is a parked 'lander' redirect, not the company. Without search, could not find domain, LinkedIn, phone or email. No second contact found."))

REC.append(R("BRSA - branding and sales", "brsa.com.br", "My Hours", "63", "Brazil",
    [C("José Augusto Moura", "CEO", "https://brsa.com.br/sobre-nos/", "https://br.linkedin.com/in/jose-augusto-moura"),
     C("Samara Monteiro", "Diretora de Comunicação e Pessoas (Communications & People Director)", "https://brsa.com.br/sobre-nos/", "https://br.linkedin.com/in/samaramonteiro-brsa"),
     C("Alex Compri", "Diretor de Marketing e Growth", "https://brsa.com.br/sobre-nos/", "https://br.linkedin.com/in/alexcompri")],
    cli="https://www.linkedin.com/company/brsa-branding-and-sales/", phone="+55 11 5501-4011", email="atendimento@brsa.com.br",
    csrc="https://brsa.com.br/",
    notes="Leadership block 'Quem está à frente da brsa' on /sobre-nos/ with LinkedIn links on each person (URLs copied verbatim). Phone and email from homepage schema.org contactPoint; WhatsApp link also on site (11 98181-0140). Founded 2009. Evidence for My Hours is a TheirStack signal only (unchanged)."))

REC.append(R("Core Analytics Lab & Radiology", "corelabandxray.com", "Timeero", "300", "US",
    [C("Shruty Parti", "CEO and founder", "https://timeero.com/testimonial-stories/core-analytics"),
     C("Julia Guillen", "General Manager", "https://www.corelabandxray.com/")],
    phone="(562) 455-5014", email="Dispatch@corelabandxray.com", csrc="https://www.corelabandxray.com/",
    notes="Domain corelabandxray.com taken from the Timeero case study 'Website' field. Shruty Parti named CEO and founder on the Timeero page (Feb 2024 visit); not on the company site, so 'still in role' not independently confirmed. Second contact Julia Guillen, General Manager, listed on homepage contact block (address 14735 Califa St, Van Nuys, CA). Phone is the dispatch line; fax (888) 337-7441. No company or personal LinkedIn linked from the site."))

REC.append(R("Palicon Group", "palicongroup.com", "Timeero", "100", "US",
    [C("Bryanna Sanchez", "Office Manager (Timeero champion)", "https://timeero.com/testimonial-stories/palicon-group")],
    phone="1-855-725-4266 (1-855-PALICON)", email="admin@palicongroup.com", csrc="https://palicongroup.com/privacy-policy",
    notes="Site (about/contact) names no leaders; About says 'founded by police chiefs'. OpenCorporates (https://opencorporates.com/companies/us_ca/4647270): PALICON GROUP, CA stock corp, active, 3400 Central Ave Ste 325 Riverside CA; registered agent David Green (not confirmed as an officer; officer list behind login). No CEO/founder found without search. Office Manager Bryanna Sanchez from the Timeero quote added as working contact. No company LinkedIn linked from site. Phone from site header/tel link; email from privacy policy."))

REC.append(R("Power for Change", "powerforchangellc.com", "Timeero", "", "US",
    [C("Steve Shefchik", "Owner / Clinical Director (founded 2010)", "https://www.powerforchangellc.com/Steve-Shefchik.html"),
     C("David Pickering", "IT Director", "https://timeero.com/testimonial-stories/power-for-change")],
    phone="920-770-4088", email="steve@powerforchangellc.com", csrc="https://www.powerforchangellc.com/",
    notes="Domain from Timeero case study. Owner Steve Shefchik (LPC, NCC; Clinical Director--Owner) is on his own bio page, so he becomes decision maker; existing contact David Pickering (IT Director, Timeero quote) kept as second; not listed on the company site so still-in-role unconfirmed. Main office 123 N. Oakland Ave, Green Bay WI; Milwaukee office 414-541-5100. Email is the hiring/contact address shown on the homepage (Cloudflare-obfuscated, decoded). No LinkedIn links on site."))

REC.append(R("Clear Motivations", "clearmotivationsnpo.org", "Timeero", "", "US",
    [C("Norberto Colin", "CEO (Form 990 FY Jun 2025); 'Director' on site", "https://projects.propublica.org/nonprofits/organizations/462729124"),
     C("Valerie Colin", "Co-director (Form 990 FY Jun 2025)", "https://projects.propublica.org/nonprofits/organizations/462729124")],
    phone="(714) 386-1292", email="cmoffice@clearmotivationsnpo.org", csrc="https://www.clearmotivationsnpo.org/contact-us",
    notes="Meet the Team page lists 'Valerie & Norberto - Directors' (first names only; also HR Manager 'Bianca'). Surnames and titles from IRS Form 990 via ProPublica (EIN 46-2729124; FY Jun 2025: Norberto Colin CEO, Valerie Colin Co-director; CFO Christopher Johnson, unpaid board). Revenue ~$4.9M FY2025. Timeero quote is from an unnamed HR Assistant. Address 3478 E Orangethorpe Ave, Anaheim CA. No LinkedIn linked from site."))

REC.append(R("Atterholt Construction & Interiors (ACI)", "acinow.com", "Timeero", "", "US",
    [C("Joe Atterholt", "Founder and President", "https://acinow.com/about-aci/"),
     C("Don O'Connell", "Vice President", "https://acinow.com/about-aci/"),
     C("Mike Westler", "(Timeero case study contact)", "https://timeero.com/testimonial-stories/aci")],
    phone="714-996-3200", email="Claims@ACINOW.COM", csrc="https://acinow.com/about-aci/",
    notes="Domain acinow.com from Timeero case study (Placentia, CA). About page: Joe Atterholt founder & President; Don O'Connell VP (23+ years). Existing contact Mike Westler kept (from case study; not on company site). Second number on site 714-996-9300. Email is the claims address on the site. No LinkedIn links on site."))

REC.append(R("Grant Thornton Malta", "grantthornton.com.mt", "Timely", "57 (people directory)", "Malta",
    [C("George Vella", "Managing Partner | Head of Advisory", "https://www.grantthornton.com.mt/meet-our-people/"),
     C("Wayne Pisani", "Partner | Head of Regulatory and Technology", "https://www.grantthornton.com.mt/meet-our-people/")],
    cli="https://www.linkedin.com/company/grant-thornton-malta", phone="+356 2093 1000", email="marketing@mt.gt.com",
    csrc="https://www.grantthornton.com.mt/privacy/",
    notes="Meet our people lists 57 people; Managing Partner George Vella. Wayne Pisani (Head of Regulatory and Technology) picked as second/IT-side contact. Phone and emails from privacy page (also gdpr@mt.gt.com, advance@mt.gt.com). Company LinkedIn linked from site. Timely case study page names no individual."))

REC.append(R("Akumin", "akumin.com", "We360.ai", "", "US",
    [C("Henry Howe", "Chief Executive Officer (since Apr 2025)", "https://akumin.com/leadership/"),
     C("Adam McIntosh, MD", "President, Mobile & Oncology", "https://akumin.com/leadership/"),
     C("Ash Goulatia", "Chief Operating Officer", "https://akumin.com/leadership/")],
    cli="https://www.linkedin.com/company/akumin", phone="1-844-730-0050", csrc="https://akumin.com/contact-us/",
    notes="Still-in-role confirmed on leadership page for Henry Howe and Adam McIntosh; added COO Ash Goulatia. Phone is customer service line on contact page (fax 1-855-855-0050). No public email on site (contact form only)."))

REC.append(R("Leadzen.ai", "leadzen.ai", "Flowace", "", "India",
    [C("Karna Raheja", "Chief Executive Officer", "https://leadzen.ai/about-us/"),
     C("Sonakshi Pratap", "Co-Founder", "https://leadzen.ai/about-us/"),
     C("Sapnika Rao", "Head of Operations", "https://leadzen.ai/about-us/")],
    cli="https://www.linkedin.com/company/leadzen-ai", email="support@leadzen.ai", csrc="https://leadzen.ai/contact-us/",
    notes="About page confirms Karna Raheja (CEO) and Sonakshi Pratap (Co-Founder) still listed; also Karan Gupta (Co-Founder), Raveen Bheemsingh (CTO), Sapnika Rao (Head of Operations). No phone on site. No personal LinkedIn URLs on site."))

OJ = "https://www.onlinejobs.ph/jobseekers/job/"
REC.append(R("TurFresh", "turfresh.com", "Hubstaff", "", "US",
    [C("John Pla", "Owner", "https://turfresh.com/about/meet-the-team/"),
     C("Glenn Yamasaki", "General Manager", "https://turfresh.com/about/meet-the-team/")],
    phone="(855) 444-8873", email="info@turfresh.com", csrc="https://turfresh.com/",
    notes="Domain turfresh.com matches the job post (artificial turf cleaning, teams in CA/TX/NV/AZ/GA/FL + Philippines). Meet the Team page: John Pla (Owner), Glenn Yamasaki (GM); also Cruz Tonix (Operations Coordinator). Text line (714) 709-2551. Email Cloudflare-obfuscated on site (decoded). No LinkedIn links on site."))

REC.append(R("Upgraded Us", "upgradedus.com", "Clockify", "5 (per job post)", "US", [],
    cli="https://www.linkedin.com/company/upgraded-us/", email="help@upgradedus.com",
    csrc="https://upgradedus.com/policies/privacy-policy",
    notes="upgradedus.com matches the job post (design-focused e-commerce, 'Mind, Body, and Connection'; brands Insplore, Prompta, Resplendawn, Zinsk). About/Contact pages name no founder or staff; company LinkedIn linked in footer. Email from privacy policy. No phone on site. Decision maker would need search."))

REC.append(R("Long Heating & Cooling", "longheatingcooling.com", "Clockify", "", "US",
    [C("Ben Ladd", "General Manager", "https://www.longheatingcooling.com/our-staff")],
    cli="https://linkedin.com/company/long-heating-and-cooling-mo", phone="(417) 374-3055",
    email="customerservice@longheatingcooling.com", csrc="https://www.longheatingcooling.com/",
    notes="Long Heating & Cooling, LLC, Ozark, Missouri (matches 'HVAC company based in Missouri'; not the Menominee MI company at longheatingandcooling.com). Our Staff page lists Ben Ladd (GM) and Patti Palmer (Service Coordinator); no owner named. Other numbers on site: (417) 374-3135, (417) 581-8138, (417) 744-6723. Email Cloudflare-obfuscated (decoded)."))

REC.append(R("Showboat Hotel", "", "Jibble", "~50 rooms", "US", [],
    notes="Job post: seasonal waterfront hotel, Finger Lakes NY, ~50 accommodations, uses Cloudbeds. No website in the post. showboathotel.com is a parked lander; other guessed domains did not resolve; OpenCorporates NY name search did not show a clear match. Nothing found without search."))

REC.append(R("HDG Resource Team LLC", "hdgresource.team", "Clockify", "", "US",
    [C("Patrice Gibbons", "Real Estate Specialist (quoted as company voice on About page)", "https://www.hdgresource.team/aboutus", "https://www.linkedin.com/in/patrice-gibbons-44526016b/")],
    email="help@hdgresource.team", csrc="https://www.hdgresource.team/",
    notes="hdgresourceteam.com redirects to hdgresource.team (South Florida distressed-homeowner real estate; matches post). Patrice Gibbons is the only person named; her LinkedIn is linked from the site. OpenCorporates (https://opencorporates.com/companies/us_fl/L23000208256): HDG RESOURCE TEAM LLC, FL, active, Port St Lucie; registered agent Anissa P Gibbons (officers behind login; possibly the same person, not confirmed). No phone or company LinkedIn on site."))

REC.append(R("Natalie Suto Photography", "nataliesutophotography.com", "Clockify", "", "US",
    [C("Natalie Suto", "Owner / photographer", "https://www.nataliesutophotography.com/")],
    phone="(561) 292-1255", email="natalie@nataliesutophotography.com", csrc="https://www.nataliesutophotography.com/",
    notes="Equestrian photography (Tryon Intl Equestrian Center, NC; Traverse City). Owner confirmed by site branding. Second email on site nataliesutophotography@gmail.com. Sole-owner business: no second contact or company LinkedIn found."))

REC.append(R("Prolific Lux Motors LLC", "", "Clockify", "", "US", [],
    notes="Job post: flatbed/step-deck carrier based in Atlanta, GA. No website in post; prolificluxmotors.com and variants do not resolve; OpenCorporates GA name search returned nothing. FMCSA/SAFER lookup not attempted (needs DOT number). Nothing found without search."))

REC.append(R("TicketDynamics", "", "Jibble", "15 (per Feb 2025 job post)", "US", [],
    notes="Job post (Feb 2025): US data-analytics startup in secondary ticketing, 3 US staff + 12 PH contractors. ticketdynamics.com is a parked lander; other variants do not resolve. Nothing found without search."))

CT = "https://www.clicktime.com/case-studies/"
REC.append(R("PTS Group (now affinis AG)", "affinis.de", "Timely", "", "Germany",
    [C("Christopher Schwarz", "Director of Organization & IT (per Timely case study)", "https://www.timely.com/case-studies/pts-group/"),
     C("Heiko Harms", "CEO / Vorstandsvorsitzender, affinis AG", "https://www.affinis.de/ueber-uns/vorstand/", "https://www.linkedin.com/in/heiko-harms-30b6177b/"),
     C("Lars Schneider", "Deputy CEO & CSO, co-founder, affinis AG", "https://www.affinis.de/ueber-uns/vorstand/", "https://www.linkedin.com/in/lars-schneider-cxm/")],
    cli="https://www.linkedin.com/company/affinis-ag/", phone="+49 421 43810 000", email="info@affinis.de",
    csrc="https://www.affinis.de/impressum/",
    notes="Christopher Schwarz is NOT named on affinis.de (Vorstand, Team or Impressum pages); still-in-role unconfirmed after the PTS->affinis rebrand. Added the affinis AG board (Heiko Harms, Lars Schneider) with LinkedIn URLs linked from the Vorstand page. Impressum: affinis AG, Cuxhavener Str. 10a, 28217 Bremen; Aufsichtsrat chair Hans Wörmcke; subsidiaries affinis data & ai GmbH (Köln) and affinis solutions GmbH (Bremen)."))

REC.append(R("Airborne Mobile", "airbornemobile.com", "ClickTime", "", "", [C("Anne Belanger", "Director of Business Intelligence (per case study)", CT + "airborne-mobile")],
    status="DO_NOT_TARGET", reason="airbornemobile.com is listed for sale on HugeDomains; company appears defunct.",
    notes="Case study contact Anne Belanger (Director of BI). Domain now a HugeDomains sale page; no live company site found. Old ClickTime case study."))

REC.append(R("AmaTerra Environmental", "", "ClickTime", "", "US", [C("Nancy Quincy", "Office Manager (per case study)", CT + "amaterra-environmental-tracks-time-and-expenses-faster")],
    notes="Case study names Office Manager Nancy Quincy; no website link. amaterra.com is an unrelated winery (Amaterra Wines, Oregon); amaterra.net is a parked lander; other guesses did not resolve. Decision maker, phone, email need search."))

REC.append(R("Analgesic Solutions", "analgesicsolutions.com", "ClickTime", "", "US", [C("Cyvia Star", "Business Operations Manager (per case study)", CT + "analgesic-solutions-improves-project-visibility-with-clicktime-and-smartsheet")],
    status="DO_NOT_TARGET", reason="Acquired by WCG Clinical; analgesicsolutions.com redirects to wcgclinical.com/analgesic-solutions/ ('Analgesic Solutions is part of WCG'). No longer a standalone company.",
    notes="Any outreach would go to WCG Clinical, a separate, much larger organization."))

REC.append(R("Build It Green", "builditgreen.org", "ClickTime", "", "US",
    [C("Jeremy Madsen", "Executive Director (Form 990 FY Dec 2024)", "https://projects.propublica.org/nonprofits/organizations/200939449"),
     C("Cerena Harrison", "Director of Program Implementation (Form 990 FY 2024)", "https://projects.propublica.org/nonprofits/organizations/200939449"),
     C("Kimara Smith", "Staff Accountant and HR Specialist (per case study)", CT + "build-it-green-ensures-compliance-and-reduces-costs-with-clicktime")],
    notes="builditgreen.org is behind a Cloudflare challenge (403 to curl and WebFetch), so phone/email/LinkedIn could not be read. Leaders from IRS Form 990 via ProPublica (EIN 20-0939449, Oakland CA): ED Jeremy Madsen; board president Karen Kho. Case study champion Kimara Smith kept."))

REC.append(R("Bold Concepts", "boldconcepts.com", "ClickTime", "", "US",
    [C("Kevin Wimsatt", "Chief Executive Officer", "https://www.boldconcepts.com/about"),
     C("Robert McCool", "Chief Operations Officer", "https://www.boldconcepts.com/about"),
     C("Robert Kennedy", "CFO & CIO (per case study)", CT + "construction-compliance-timesheet-bold")],
    cli="https://www.linkedin.com/company/boldconceptsinc/", email="hr@boldconcepts.com", csrc="https://www.boldconcepts.com/contact-us",
    notes="Robert Kennedy (existing contact) is NOT on the current leadership page; still-in-role unconfirmed, so CEO Kevin Wimsatt is now decision maker and COO Robert McCool second. Federal construction-support contractor. Only email on site is hr@; no phone found on site."))

REC.append(R("Kenzan Media", "", "ClickTime", "", "US", [C("Eric Spiegel", "CFO (per case study)", CT + "kenzan-media")],
    notes="Case study names CFO Eric Spiegel; no website link. kenzanmedia.com and kenzan.com do not resolve. Could not establish current status without search."))

REC.append(R("Local Motion", "localmotion.org", "ClickTime", "", "US",
    [C("Christina Erickson", "Executive Director (Form 990 FY Dec 2024)", "https://projects.propublica.org/nonprofits/organizations/30361422"),
     C("Nic Anderson", "Board President (Form 990 FY 2024)", "https://projects.propublica.org/nonprofits/organizations/30361422")],
    notes="localmotion.org is behind a Cloudflare challenge (403), so phone/email/LinkedIn could not be read. Leaders from IRS Form 990 via ProPublica (Local Motion Inc, Burlington VT, EIN 03-0361422). Case study quotes a Van Driesche (Deputy Director / Director of Advocacy & Education); first name not captured; not verified as current."))

REC.append(R("Mountain G. Enterprises (MGE)", "", "ClickTime", "237 field staff tracked (per case study)", "US",
    [C("Shannon Campbell", "Administrator (per case study)", CT + "mountain-g-enterprises-eliminates-administrative-time-with-clicktime")],
    notes="California civil construction / environmental services. Case study names Administrator Shannon Campbell; no website link. Guessed domains (mgeinc.com/.net, mge-inc.com, mountaing.com) do not resolve or are unrelated. Decision maker, phone, email need search."))

REC.append(R("Spectrum Talent Management", "stmpl.co.in", "Flowace", "", "India",
    [C("Vidur Gupta", "Co-Founder & Director", "https://www.stmpl.co.in/team/", "https://in.linkedin.com/in/vidurguptastm"),
     C("Atanu Banerjee", "CEO", "https://www.stmpl.co.in/team/", "https://in.linkedin.com/in/atanu-banerjee-35956754"),
     C("Nimisha Gupta", "GM - Human Resources", "https://www.stmpl.co.in/team/", "https://www.linkedin.com/in/nimisha-gupta-6ba66012/")],
    cli="https://www.linkedin.com/company/spectrumtalentmanagement", phone="+91-7065-060-428", email="info@stmpl.co.in",
    csrc="https://www.stmpl.co.in/",
    notes="Team page confirms Vidur Gupta (Co-Founder & Director) and lists Sidharth Agarwal (Co-Founder & Director, https://in.linkedin.com/in/sidharth-agarwal-571551a) and CEO Atanu Banerjee; LinkedIn URLs are linked from the team page. Also helpdesk@stmpl.co.in. Page footer names entity 'Spectrum Talent Management Limited | www.spectrumtalent.co.in'."))

REC.append(R("xAI (now SpaceXAI, part of SpaceX)", "x.ai", "Hubstaff", "thousands incl. AI tutors", "US",
    [C("Elon Musk", "CEO / founder", ""), C("Michael Nicolls", "President, xAI (from Apr 2026; ex-VP Starlink)", "")],
    cli="https://www.linkedin.com/company/xai", csrc="https://www.linkedin.com/company/xai",
    notes="Existing contacts carried over (source URLs were blank in input; not re-verified). x.ai blocks curl and WebFetch with Cloudflare (403), so no phone/email could be read from the company site. Personal LinkedIn not found without search."))

REC.append(R("Bonza Clean", "bonzaclean.com.au", "Clockify", "", "Australia", [],
    phone="1800 266 922", email="support@bonzaclean.com.au", csrc="https://www.bonzaclean.com.au/privacy",
    notes="Domain bonzaclean.com.au: Bonza Clean Pty Ltd (ABN 43 684 691 889), Mid North Coast NSW (South West Rocks/Kempsey); formerly Trial Bay Cleaning Services, rebranded 2024. Match to the job post (Australian business with internal 'Bonza Engine' platform) is by name and country only; site does not mention Bonza Engine. No founder named on site; post says the dev works 'directly with the founder'. No LinkedIn linked."))

REC.append(R("Dr. Robin (thyroid education program)", "", "Clockify", "", "Canada", [],
    notes="Job post names only 'Dr. Robin', a Canadian naturopathic doctor running an online thyroid program; no surname or website. Cannot identify the business without search; left blank."))

REC.append(R("Sessions & Kimball LLP", "job-law.com", "CurrentWare", "11-50", "US",
    [C("Don D. Sessions", "Founding and Managing Partner", "https://www.job-law.com/our-attorneys/", "https://www.linkedin.com/in/don-sessions-6083a35/"),
     C("Stephen C. Kimball", "Founding Partner", "https://www.job-law.com/our-attorneys/")],
    cli="https://www.linkedin.com/company/sessions-and-kimball", phone="(949) 380-0900", email="info@job-law.com",
    csrc="https://www.job-law.com/",
    notes="Don D. Sessions confirmed on attorneys page; added co-founder Stephen C. Kimball as second contact (partners Heidi L. De Groot, Larry E. Herrera also listed). Address 23456 Madero Suite 170, Mission Viejo CA; fax (949) 380-8283."))

REC.append(R("Tamice", "tamice.com", "CurrentWare", "20+", "US",
    [C("Han Lee", "Senior Business Development Manager (per case study)", "https://www.currentware.com/customers/tamice/")],
    phone="1-646-684-4848", email="service@tamice.com", csrc="https://tamice.com/ko",
    notes="Domain tamice.com linked from CurrentWare case study (Korean boutique travel agency, NY). HQ 151 W 46th St #1002, New York NY 10036; Korea line 02-336-4480; partners@tamice.com for partnerships. Site names no executives; case study contact Han Lee kept as working contact. No LinkedIn linked."))

REC.append(R("The Virtual Hub", "thevirtualhub.com", "Time Doctor", "", "", [],
    notes="thevirtualhub.com and new.thevirtualhub.com block curl and WebFetch with Cloudflare (403), so no team/contact data could be read. Nothing filled."))

REC.append(R("Olsys", "olsys.global", "Beebole", "", "US",
    [C("Alexey Tsiunchik", "CTO (per Beebole case study)", "https://beebole.com/customer-cases/olsys")],
    cli="https://www.linkedin.com/company/78792391", phone="+1 (847) 766-0337", email="contact@olsys.global",
    csrc="https://olsys.global/",
    notes="olsysltd.com (linked from the Beebole case study) now redirects to olsys.global. About page names no leaders; CTO Alexey Tsiunchik from the case study added (not on site, so still-in-role unconfirmed). Email Cloudflare-obfuscated on site (decoded)."))

REC.append(R("WOW24-7", "wow24-7.io", "Timely", "", "", [C("Roman Kupko", "(per Timely case study)", "https://www.timely.com/case-study-wow24-7-x-timely/")],
    notes="wow24-7.io blocks curl with Cloudflare (403); nothing could be read from the company site. Existing contact Roman Kupko kept, not re-verified."))

REC.append(R("Falk Media", "falkmedia.no", "Timely", "8 (Brønnøysund register)", "Norway",
    [C("Marte Lohne", "Daglig leder (Managing Director)", "https://falkmedia.no/"),
     C("Kristian Thomassen", "Gründer (Founder)", "https://falkmedia.no/")],
    email="kristian@falkmedia.no", csrc="https://falkmedia.no/",
    notes="Homepage team section lists Marte Lohne as Daglig leder (marte@falkmedia.no) and Kristian Thomassen as Gründer (kristian@falkmedia.no), so Kristian is still at the company but no longer MD; Marte is now the decision maker. No generic inbox, phone or LinkedIn links on site. Brønnøysund register (data.brreg.no): FALK MEDIA AS, org.nr 920632335, 8 employees, Kristiansand."))

REC.append(R("Yummygum", "yummygum.com", "Timely", "", "Netherlands",
    [C("Vince Schwidder", "Managing Director, co-founder", "https://yummygum.com/about", "https://www.linkedin.com/in/vinceschwidder/"),
     C("Donovan Roubos", "Operations Director, partner", "https://yummygum.com/about", "https://www.linkedin.com/in/donovan-roubos/"),
     C("Leon Ephraïm", "Creative Director, co-founder", "https://yummygum.com/about", "https://www.linkedin.com/in/leon-ephraim/")],
    cli="https://www.linkedin.com/company/yummygum/", phone="+31 6 23152025", email="info@yummygum.com", csrc="https://yummygum.com/contact",
    notes="Vince Schwidder confirmed on About page. Added Operations Director Donovan Roubos as second contact. Personal LinkedIn URLs linked from the About page."))

REC.append(R("Flatworld Solutions", "flatworldsolutions.com", "Insightful", "", "India / US",
    [C("Jacob William", "CEO - USA", "https://www.flatworldsolutions.com/about-fws/"),
     C("David Antony", "COO & President - USA", "https://www.flatworldsolutions.com/about-fws/")],
    cli="https://www.linkedin.com/company/flatworld-solutions", phone="800-514-7456", csrc="https://www.flatworldsolutions.com/",
    notes="About page management team confirms Jacob William (CEO) and lists David Antony (COO & President), Anand Mathews (CMO - India). BPO with delivery centres in India, Philippines, Bolivia, Colombia. Site uses contact forms; no public email found."))

PM = "https://www.paymoapp.com/"
REC.append(R("Cromatic Studios", "cromaticstudios.com", "Paymo", "14 (per Paymo page)", "Romania",
    [C("Daniel Stoicescu", "Founder (2012)", PM + "cromatic-studios/"),
     C("Cristian Stoicescu", "Business Development", PM + "cromatic-studios/")],
    phone="+40 728 978 068", email="hi@cromaticstudios.com", csrc="https://cromaticstudios.com/contact/",
    notes="Domain from Paymo page (Bucharest). Paymo story says Daniel Stoicescu founded the studio in 2012 and his brother Cristian joined a year later; site team list shows first names 'Cristian' and 'Daniel', so both appear current. Email Cloudflare-obfuscated (decoded). No LinkedIn links on site."))

REC.append(R("AMZ Advisers", "amzadvisers.com", "Paymo", "40+ (per site)", "US",
    [C("Mike Begg", "Co-Founder & CEO", "https://www.amzadvisers.com/our-story/"),
     C("Rob Zawadski", "Co-Founder & Senior VP of Operations", "https://www.amzadvisers.com/our-story/"),
     C("Steve Cicalese", "Co-Founder & CRO", "https://www.amzadvisers.com/our-story/")],
    email="info@amzadvisers.com", csrc="https://www.amzadvisers.com/privacy/",
    notes="Mike Begg confirmed as Co-Founder & CEO on Our Story page. Added Rob Zawadski (Sr VP Operations) as second. Stamford CT. No phone or LinkedIn links on site; email from privacy policy."))

REC.append(R("Ameba Creative Studio", "ameba.studio", "Paymo", "", "Uruguay",
    [C("Miguel Vallvé", "CEO & Co-founder (per Paymo page)", PM + "ameba/")],
    notes="Domain ameba.studio from Paymo page (Montevideo). Site is minimal: no team, contact, phone, email or LinkedIn links. Miguel Vallvé not re-confirmed on site."))

REC.append(R("Archaius Creative", "archaiuscreative.com", "Paymo", "", "US",
    [C("David Aguilar", "CEO (per Paymo page)", PM + "archaius-creative/")],
    cli="https://www.linkedin.com/company/archaius-creative/", email="inquiries@archaiuscreative.com", csrc="https://archaiuscreative.com/",
    notes="Domain from Paymo page (Rancho Cucamonga CA; video post-production). Site names no team; David Aguilar not re-confirmed. No phone on site."))

REC.append(R("mBusiness", "mbusiness.ch", "Paymo", "", "Switzerland",
    [C("Mischa Birnstiel", "Geschäftsführer (Managing Director)", "https://www.mbusiness.ch/agentur"),
     C("Margareta Bürge", "Gründerin (Founder)", "https://www.mbusiness.ch/agentur")],
    cli="https://www.linkedin.com/company/mbusiness-gmbh/", phone="+41 44 730 99 15", email="info@mbusiness.ch", csrc="https://www.mbusiness.ch/",
    notes="Surname captured: Mischa Birnstiel (Paymo page: General Manager; /agentur page: Geschäftsführer). Zefix: MBusiness GmbH, CHE-286.723.949, Steinwiesenstrasse 3, 8952 Schlieren (formerly Birnstiel Consulting GmbH). Team page also lists Jürg Birnstiel (Senior Strategy Advisor)."))

REC.append(R("Promofect, LLC", "promofect.com", "Time Doctor", "", "US",
    [C("Eli Stiefel", "(existing contact; not named on company site)", OJ + "full-time-cold-caller-appointment-setter-1698356")],
    cli="https://www.linkedin.com/company/promofect", phone="(201) 633-4848", email="sales@promofect.com", csrc="https://promofect.com/",
    notes="About page tells the company story (founded 2021, NJ/NY custom apparel) but names no people, so Eli Stiefel could not be re-confirmed and no second contact was found. Existing contact kept as-is."))

REC.append(R("LuxoStays", "luxostays.com", "Time Doctor", "", "US",
    [C("Sharon Cao", "Founder & CEO", "https://www.luxostays.com/about-574050441")],
    phone="(415) 707-5595", email="support@luxostays.com", csrc="https://www.luxostays.com/",
    notes="About page confirms Sharon Cao as Founder & CEO (Bay Area short-term rental manager, 43 properties). No other leaders named; no LinkedIn links on site."))

REC.append(R("Ridestore", "ridestore.com", "Timely", "", "Sweden",
    [C("David Voge", "Content Marketing Leader (per Timely case study)", "https://www.timely.com/case-studies/ridestore/")],
    email="crew@ridestore.com", csrc="https://www.ridestore.com/info/privacy-policy",
    notes="Ridestore AB, org.nr 556706-1238, Gothenburg (privacy policy; Northdata). Site lists only first-name customer crew; officers not visible on free registry pages (Northdata/allabolag), so CEO not found without search. Case study contact David Voge kept as working contact, not a decision maker. No phone or LinkedIn links on site."))

REC.append(R("Zobble Solutions", "zobble.com", "Flowace", "", "India",
    [C("Gunjan Gupta", "Founder & Director", "https://zobble.com/Management-Team.html"),
     C("Rhea Gupta", "Co-Founder & Director", "https://zobble.com/Management-Team.html")],
    cli="https://www.linkedin.com/company/zobble-solutions", phone="+91 7045538619", email="sales@zobble.com", csrc="https://zobble.com/Contact_Us.html",
    notes="Management Team page confirms Gunjan Gupta (Founder & Director) and Rhea Gupta (Co-Founder & Director). E-learning / LMS company (GuruLMS/VioletLMS). Also career@zobble.com. No personal LinkedIn links on site."))

REC.append(R("Very Good Ventures", "verygood.ventures", "Timely", "", "US",
    [C("Tom Arra", "Head of Program Management / Principal Program Manager (per Timely story)", "https://www.timely.com/blog/customer-story-very-good-ventures/"),
     C("Billy Fischer", "EVP, Business Development", "https://verygood.ventures/about-us/", "https://www.linkedin.com/in/billyfischer/")],
    cli="https://www.linkedin.com/company/very-good-ventures/", csrc="https://verygood.ventures/about-us/",
    notes="About page lists only the business development team (Billy Fischer EVP BD, with LinkedIn linked); no CEO/founder named, so no decision maker found without search. Timely story quotes Tom Arra (program management). Contact page is a form; no phone or email."))

REC.append(R("Stakked", "", "Timely", "", "", [C("Lizzie Earl", "CEO (per Timely case study)", "https://www.timely.com/case-study-stakked-x-timely/")],
    notes="Timely case study names CEO Lizzie Earl (also Project Leader 'Cecilia A.' and Project Manager 'Laura C.') but links no website. stakked.com and stakked.co.uk are parked landers. Domain, phone, email, LinkedIn need search."))


def dump():
    inp = json.load(open(INP))
    out = [r for r in REC if r]
    json.dump(out, open(OUT, 'w'), indent=1, ensure_ascii=False)
    print('wrote', len(out), 'of', len(inp))


if __name__ == '__main__':
    dump()
