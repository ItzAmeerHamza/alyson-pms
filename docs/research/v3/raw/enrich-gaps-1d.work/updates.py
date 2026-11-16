# per input index: contacts = [name, title, linkedin, source_url]
U = {}

U[0] = dict(
    contacts=[
        ["Dr. Dwayne Gunter", "CEO", "https://www.linkedin.com/in/dwayne-gunter-4971812/", "https://theorg.com/org/ovation-healthcare/org-chart/dwayne-gunter"],
        ["Scott Gressett", "President", "https://www.linkedin.com/in/scott-e-gressett-b489825b/", ""],
    ],
    public_email="info@ovationhc.com",
    company_phone="+1 615-371-7979",
    contact_source_url="https://ovationhc.com/",
    notes="Added public email info@ovationhc.com from ovationhc.com homepage contact section (also media@ovationhc.com in search results); phone 615-371-7979 and address 1573 Mallory Lane, Suite 200, Brentwood, TN confirmed on own site. Gunter still in role: 2026 CompMed partnership release on ovationhc.com quotes him as CEO. Gressett not re-checked.",
)

U[1] = dict(
    company_domain="readinessit.com",
    contacts=[
        ["Adérito Ferreira", "CEO, Readiness IT and CEO of parent group CONKORD", "", "https://www.investporto.pt/en/news/conkord-announces-80-job-openings-driven-by-growing-demand-for-ai-solutions/"],
    ],
    company_linkedin="https://www.linkedin.com/company/readinessit",
    notes="Readiness IT merged with Red.IT, Ritain.io and Latitudde into the CONKORD group (Porto, 550+ staff). readinessit.com now 301-redirects to conkord.com, and the LinkedIn page is titled 'Readiness IT - a CONKORD company'. Still operating, so not DO_NOT_TARGET. Aderito Ferreira still in role: 2026 InvestPorto/Radio Covilha articles name him CEO of CONKORD. No matching personal LinkedIn found (one 'Adérito Ferreira - A.F.F.' profile does not match, so not used). LeadIQ lists 'COO Iberia: R. G.' (initials only), so no second contact named. conkord.com did not render its contact details, so phone and email are still blank. One aggregator gave phone 808 214 214, but it looks like it belongs to another org, so it was not used.",
)

U[2] = dict(
    contacts=[
        ["Sara Padidar", "Co-Founder & Partner", "", "https://www.crunchbase.com/person/sara-padidar-7fef"],
        ["Hannah McClenaghan", "Operations Manager (case-study champion)", "", ""],
    ],
    contact_source_url="https://www.talkshopmedia.com/contact",
    notes="Contact page confirms US 1.833.739.2200 and CA 1.855.738.2220, with offices in Toronto, Vancouver, LA and New York. It shows no public email. The Sara Padidar LinkedIn results are other people (University of Pretoria/Eswatini), so LinkedIn is left blank. Padidar is still shown as co-founder/partner on Crunchbase; no 2026 change found.",
)

U[3] = dict(
    contacts=[
        ["Bruce Talley", "CEO & Co-founder", "https://www.linkedin.com/in/brucetalley/", "https://www.nakivo.com/company/about-nakivo/"],
        ["Sergei Serdyuk", "VP of Product Management & Co-founder", "", "https://www.nakivo.com/company/about-nakivo/"],
    ],
    company_linkedin="https://www.linkedin.com/company/nakivo",
    notes="Found Bruce Talley's LinkedIn: a search result titled 'Bruce Talley - Nakivo' at linkedin.com/in/brucetalley/ (Henderson, NV; profile says he co-founded NAKIVO in 2012 and is CEO). A different 'Bruce Talley - Ukraine Capital' profile was ignored. Company LinkedIn is linkedin.com/company/nakivo (Sparks, NV; 51-200 staff). Talley still in role per that profile and Crunchbase. Serdyuk not re-checked.",
)

U[4] = dict(
    contacts=[
        ["Annie Newton", "Owner / CEO", "https://www.linkedin.com/in/annienewton", ""],
    ],
    contact_source_url="https://profitworksusa.com/contact",
    notes="profitworksusa.com and its /contact page show only a form, with no phone or email. A data broker (success.ai) lists a phone and email for Annie, but they were not used (broker data). RocketReach lists Cindy Parrino (Controller) and Anna Darato (Senior Accountant). Neither is a decision-maker role, so no second contact was added. Annie Newton still owner per the 'Annie Newton - ProfitWorks' LinkedIn result. Small firm (Kennewick, WA) serving painting companies with offshore staff.",
)

U[5] = dict(
    contacts=[
        ["Tom Gartland", "Chairman & CEO", "https://www.linkedin.com/in/tom-gartland-982597372/", "https://www.montway.com/executive-team/tom-gartland"],
        ["Alberto Anguiano", "Chief Financial Officer", "", "https://www.prnewswire.com/news-releases/montway-auto-transports-leadership-team-embodies-the-future-of-auto-transport-302483241.html"],
        ["Eftim Eftimov", "Chief Information Officer", "", "https://www.prnewswire.com/news-releases/montway-auto-transports-leadership-team-embodies-the-future-of-auto-transport-302483241.html"],
    ],
    company_linkedin="https://www.linkedin.com/company/montway-auto-transport",
    company_phone="(888) 666-8929; local (224) 220-0221",
    public_email="privacy@montway.com",
    contact_source_url="https://www.montway.com/contact-us/",
    notes="Added company LinkedIn (14.5k followers); there is also a separate Montway Bulgaria page at bg.linkedin.com/company/montwaybulgaria. Corrected Alberto Anguiano's title from COO to CFO (2025 PR Newswire release). Added CIO Eftim Eftimov, the IT head. privacy@montway.com is from Montway's own privacy policy. info@montway.com appears only on third-party listings and was not verified on the site. Gartland still Chairman & CEO per montway.com executive page.",
)

U[6] = dict(
    contacts=[
        ["Ammar Nasir", "CEO / Founder", "", "https://devbunch.com/about-us/"],
        ["Haroon Aejaz", "COO", "", ""],
        ["Sohaib Nasir", "CTO / Co-Founder", "", "https://theorg.com/org/devbunch"],
    ],
    company_phone="+92 309 4010099",
    public_email="info@devbunch.com; hr@devbunch.com; careers@devbunch.com",
    contact_source_url="https://devbunch.com/contact-us/",
    notes="Added phone +92 309 4010099 and emails info@/hr@/careers@devbunch.com from the contact page. Offices: Johar Town, Lahore (HQ), 69 North Road, Durham, UK, and Sadiqabad. Added Sohaib Nasir as CTO/Co-Founder (named in search results and on theorg). No LinkedIn found for Ammar Nasir: every 'Ammar Nasir' profile in the results is someone else. An 'Ammar Malik - DevBunch' profile exists, but it is not confirmed to be the same person, so it was not used.",
)

U[7] = dict(
    contacts=[
        ["Dr. Tom Biernacki, DPM", "Founder", "https://www.linkedin.com/in/tom-biernacki/", "https://www.michiganfootdoctors.com/about/"],
        ["Gray Fabia", "Virtual team coordinator (per job post)", "", ""],
    ],
    company_phone="(810) 206-1402",
    contact_source_url="https://www.michiganfootdoctors.com/contact-us",
    notes="Contact page confirms (810) 206-1402 and two offices: 4330 E Grand River Ave, Howell, MI and 43494 Woodward Ave #208, Bloomfield Twp. The site shows no email and no social or LinkedIn links. No company LinkedIn page was found; search only returned Dr. Biernacki's profile ('Tom Biernacki - Balance Foot and Ankle'), which confirms he is still in role. Other podiatrists on staff: Dr. Carl Jay and Dr. Daria Gutkin (clinicians, not decision makers).",
)

U[8] = dict(
    contacts=[
        ["JP Holecka", "Founder & CEO", "https://www.linkedin.com/in/jpholecka/", "https://www.powershifter.com/about"],
        ["Gina Asuncion Bernier", "Chief of Staff", "", "https://www.powershifter.com/about"],
        ["Ted Morgan", "Partner / Client Delivery", "", "https://www.powershifter.com/about"],
    ],
    company_phone="+1 (604) 227-9952",
    contact_source_url="https://www.powershifter.com/about",
    notes="Second contacts taken from the about page's leadership list: Gina Asuncion Bernier (Chief of Staff) and Ted Morgan (Partner / Client Delivery). The page also lists Cary Newfeldt (Partner / Technology) and Russ Jarman Price (Chairman). Holecka still Founder & CEO per the about page. Eilish Kennedy is shown as MD on Crunchbase/Wiza but is not on the current about page, so she was not used. The site shows no public email (contact form only).",
)

U[9] = dict(
    contacts=[
        ["Gilles Pichette", "President & Owner", "https://www.linkedin.com/in/gilles-pichette-2288095/", ""],
        ["Moemen Hegazy", "CTO", "", ""],
    ],
    public_email="andrew@ecomexperts.io",
    company_phone="+1 438-601-4617",
    contact_source_url="https://www.shopify.com/partners/directory/partner/andrewdurot",
    notes="The site's contact page shows no email; it gives phone +1 438-601-4617 and address 2727 Saint-Patrick St., Montreal. The public email andrew@ecomexperts.io is the contact listed on EcomExperts' Shopify Partner Directory profile, which also gives phone 858 367 9573. The site features Andrew Durot as its public face (it links his X account), but his title was not verified, so he is not listed as a contact. Pichette was not re-verified because the web search budget ran out.",
)

U[10] = dict(
    contacts=[
        ["Sherine Guirguis", "Co-Founder & Lead Strategist", "https://www.linkedin.com/in/sherine-guirguis-0aa8016/", ""],
        ["Felicity Pocklington", "Managing Director", "", ""],
    ],
    contact_source_url="https://gocommonthread.com/contact",
    notes="The contact page has only a form and a Calendly link (calendly.com/olivia-commonthread/intro-ct). It lists no email, phone or address, consistent with a fully remote firm. Company LinkedIn confirmed via the site footer link (linkedin.com/company/gocommonthread/). Phone and email are still blank. Contacts were not re-verified because the web search budget ran out.",
)

U[11] = dict(
    contacts=[
        ["Dr. Ibraheem Samirah, DMD", "Founder / Dentist", "https://www.linkedin.com/in/ibraheem-samirah-582baa35/", ""],
    ],
    company_phone="(571) 446-4064",
    public_email="info@communityfirstdental.com",
    contact_source_url="https://www.communityfirstdental.com/",
    notes="Added info@communityfirstdental.com from the homepage. Address: 46045 Palisade Parkway, Sterling, VA 20165. Social links on the site are Facebook, Instagram and TikTok only, so no company LinkedIn was found. The site names no other staff, so there is no second contact.",
)

U[12] = dict(
    contacts=[
        ["Ross Crawford", "Founder & Managing Director", "https://www.linkedin.com/in/rosscrawford/", ""],
        ["Avani Dev", "Operations Director", "", ""],
    ],
    company_linkedin="https://www.linkedin.com/company/mr-digital-uk",
    company_phone="01273 942 329 (+44 1273 942329)",
    public_email="office@mr-digital.co.uk",
    contact_source_url="https://www.mr-digital.co.uk/contact",
    notes="Added office@mr-digital.co.uk (Cloudflare-obfuscated on the contact page; decoded and also present as a mailto link). Address: 3 Warren Close, Brighton, BN2 6DT. The site footer links to linkedin.com/company/mr-digital-uk, which replaces the earlier 'mr-digital-limited' value; the earlier slug may be an older or alternate page.",
)

U[13] = dict(
    contacts=[
        ["Imer Vigil", "CEO", "https://www.linkedin.com/in/imer-vigil-bb4370157/", ""],
    ],
    company_phone="+1-888-369-0649; +1 (213) 212-8098",
    contact_source_url="https://happytourstravel.com/",
    notes="Homepage confirms ventasonline@happytourstravel.com, +1 (888) 369-0649 and +1 (213) 212-8098, offices in Los Angeles, Bakersfield and Washington DC, and the company LinkedIn happy-tours-travel-agency. The site names no leaders (travel advisors only), so no second contact was found. The web search budget ran out before a LinkedIn people search could be run.",
)

U[14] = dict(
    contacts=[],
    contact_source_url="",
    notes="wynncrestinsurance.com returns only a title shell ('Wynncrest Insurance Agency - Health Insurance Quotes'); the content is JS-rendered and the /about and /contact-us pages show nothing. No decision maker, LinkedIn or email found. Phones 314-794-7774 and 314-312-2123 carried over from input, not re-verified. The web search budget ran out before agent/owner searches could run. Needs a manual lookup, e.g. the Missouri DOI producer lookup or a Missouri SOS business search.",
)

U[15] = dict(
    contacts=[],
    company_phone="(480) 561-4651",
    public_email="info@dolcecalma.com",
    contact_source_url="https://dolcecalma.com/policies/contact-information",
    notes="The Shopify contact-information page gives legal entity Innovate Tech LLC, 6352 South 154th Street, Gilbert AZ 85298, plus phone (480) 561-4651 and info@dolcecalma.com. OpenCorporates has an active Arizona 'INNOVATE TECH, LLC' (L18446462) with registered agent Adil Khan at a Tempe address. That entity is not confirmed to be the same company because the address differs, so no decision maker was recorded. The about page has no founder names. Next step: check AZ Corporation Commission eCorp for L18446462 members.",
)

U[16] = dict(
    contacts=[
        ["Chelsey Kelly", "Chief Operating Officer", "", ""],
    ],
    contact_source_url="",
    notes="thenabogroup.com is a Wix site, and its Our Team and Contact pages did not render team content via fetch or curl. The menu shows sub-brands HOAM Inc., Management Solutions Northwest and Seaside Management, suggesting a roll-up of HOA management firms. No LinkedIn or email found. Phone (866) 365-6226 carried over from input. The web search budget ran out before LinkedIn people searches could run.",
)

U[17] = dict(
    contacts=[
        ["Dominique", "Founder", "", ""],
    ],
    public_email="contact@thetravelingchucks.com",
    contact_source_url="https://thetravelingchucks.com/",
    notes="Homepage confirms contact@thetravelingchucks.com and address 1910 Madison Ave #2357, Memphis, TN 38104 (The Traveling Chucks LLC). Social links are Facebook, Instagram, TikTok and Pinterest only, with no LinkedIn. No phone is shown. The founder's surname was not found on the site.",
)

U[18] = dict(
    contacts=[
        ["Ryan Eales", "Founder / principal (site refers to 'Ryan and his team'; formal title not stated)", "https://www.linkedin.com/in/ryan-eales/", "https://theamazonwhisperer.com/"],
    ],
    contact_source_url="https://theamazonwhisperer.com/",
    notes="Gained a decision maker: the homepage links the personal LinkedIn linkedin.com/in/ryan-eales/ and a client testimonial says 'working with Ryan and his team'. Ryan Eales is therefore the principal, though the site gives no formal title. The site is an Amazon agency for food & beverage brands. It shows no phone, email (CTA goes to /profit-roadmap) or company LinkedIn.",
)

U[19] = dict(
    contacts=[
        ["Angel L. Reyes III", "Founder / President", "https://www.linkedin.com/in/angel-l-reyes-iii-b97b997/", ""],
        ["James Carlson", "Chief Operating Officer", "", ""],
    ],
    company_linkedin="https://www.linkedin.com/company/reyeslaw/",
    company_phone="469-289-1910 (24/7)",
    public_email="help@reyeslaw.com",
    contact_source_url="https://www.reyeslaw.com/privacy-policy/",
    notes="Company LinkedIn linkedin.com/company/reyeslaw/ is linked from the site footer. help@reyeslaw.com is from the firm's privacy policy. Main line 469-289-1910 is confirmed on the contact page. There are offices across Texas (see /office-locations/), with several local tel numbers on the homepage. A gmail address that appeared on the contact page was ignored. Contacts were not re-verified because the web search budget ran out.",
)

U[20] = dict(
    contacts=[
        ["James Parkhouse", "Chief Executive Officer", "", "https://www.dgitravel.com/who-we-are/our-people/"],
        ["Julie Kendrick", "Chief Operating Officer", "", "https://www.dgitravel.com/who-we-are/our-people/"],
        ["Jen Herbert", "Director of Operations - Global", "", "https://www.dgitravel.com/who-we-are/our-people/"],
        ["Joanne Bowden", "Chief Technical Officer", "", "https://www.dgitravel.com/who-we-are/our-people/"],
    ],
    company_phone="+1 703 705 9446; +1 703 721 7394",
    public_email="usasales@dgitravel.com",
    contact_source_url="https://www.dgitravel.com/contact-us",
    notes="Parkhouse (CEO) and Kendrick (COO) are confirmed still in role on the current Our People page. That page also lists Sam Whittle (President), Eddie Shaw (CFO), DeAnne Dale (GM North America), Jen Herbert (Director of Operations - Global) and Joanne Bowden (CTO). Added usasales@dgitravel.com from the site. The site shows US numbers only; no UK number was found on the pages fetched. No personal LinkedIn found because the web search budget ran out.",
)

U[21] = dict(
    contacts=[
        ["Dan Carroll", "CEO", "", ""],
        ["Greg Carreon", "VP, Information Technology (interviewee)", "", ""],
    ],
    company_phone="(860) 767-0110 (regional extensions 250-258; commercial ext 253/227)",
    contact_source_url="https://www.sslighting.com/contact",
    notes="Added main phone (860) 767-0110 from the contact page, which also lists regional extensions. The site shows no public email (contact form only), no social or LinkedIn links, and no leadership. CEO and IT VP were not re-verified because the web search budget ran out. Company LinkedIn still blank.",
)

U[22] = dict(
    contacts=[
        ["Brad Packer", "Founder & CEO", "", ""],
        ["James Erickson", "Director of IT and Data (case-study champion)", "", ""],
    ],
    contact_source_url="",
    notes="vitalitymedical.com blocks automated fetches (Cloudflare 403 'Attention Required'), so nothing could be re-verified. Phones and emails are carried over from the input; the emails came from a contact-page search snippet. Company LinkedIn and personal LinkedIns are still blank because the web search budget ran out.",
)

U[23] = dict(
    contacts=[
        ["Marco Fonto", "Managing Director / Founder", "", ""],
    ],
    company_phone="+27 10 593 0981 (Johannesburg HO); +27 21 914 6985 (Cape Town); +27 31 940 1918 (Durban); WhatsApp +27 10 448 0861",
    public_email="info@stratumbenefits.co.za; yoursupport@stratumbenefits.co.za",
    contact_source_url="https://www.stratumbenefits.co.za/",
    notes="Added info@stratumbenefits.co.za (Cloudflare-obfuscated on the site; decoded) and yoursupport@stratumbenefits.co.za (mailto link), plus branch phones. HQ: Stratum House, 8 Fir Drive, Northcliff, Randburg. Firm is FSP 2111. The input listed both 'Marco Fonto' and 'Marco Fronto' as MD, which is almost certainly one person with a spelling variant, so they were merged into one contact. The correct spelling is unconfirmed: the site names no leaders and search was unavailable.",
)

U[24] = dict(
    contacts=[
        ["James Farmer", "Co-founder & CEO", "", "https://incsub.com/"],
    ],
    contact_source_url="https://incsub.com/contact/",
    notes="incsub.com confirms James Farmer co-founded Incsub in 2007 and gives contact@incsub.com. No phone is shown (fully remote company). No other leaders are listed on the site, and the web search budget ran out before a LinkedIn people search could run.",
)

U[25] = dict(
    contacts=[
        ["Josh Fulton", "Owner (Founder & CEO)", "https://www.linkedin.com/in/josh-fulton-142bb93/", "https://www.e2cc.com/about/"],
        ["Greg Foster", "Director of Operations", "", "https://www.e2cc.com/about/"],
        ["Allison Lessard", "Director of Organizational Development (case-study champion)", "", "https://www.e2cc.com/about/"],
        ["Karolyn Fulton", "Owner", "", "https://www.e2cc.com/about/"],
    ],
    company_linkedin="https://www.linkedin.com/company/e2cc",
    company_phone="602-371-1500; toll-free 877-545-3770",
    public_email="info@e2cc.com",
    contact_source_url="https://e2cc.com/about/terms",
    notes="The phone 602-371-1500 that was an unverified aggregator value is now confirmed on e2cc.com, plus toll-free 877-545-3770. Added info@e2cc.com (also privacy@e2cc.com) from the site terms page, and company LinkedIn from the site footer. The About page lists Josh and Karolyn Fulton as owners; Josh is still in role. Also on the About page: Adam Shapiro (VP Business Development), Greg Foster (Director of Operations) and Jay Johnson (Director of Service Delivery).",
)

U[26] = dict(
    contacts=[
        ["Anish Jajodia", "Founding Partner", "https://www.linkedin.com/in/anish-jajodia-6585b345/", ""],
        ["Monica Thakwani", "HR & Operations Manager", "", ""],
    ],
    contact_source_url="https://boringcommerce.com/contact",
    notes="The contact page shows only the WhatsApp number +91 8978266266, with no email or address; the homepage and privacy page have no email either. The site's reference to 'Anish ji and team' confirms Anish as the principal. Public email is still blank.",
)

U[27] = dict(
    contacts=[
        ["Andy Allaway", "CEO", "https://www.linkedin.com/in/andy-allaway-31b0aa84/", ""],
        ["Justin Cooke", "Co-Founder", "", ""],
    ],
    company_linkedin="https://www.linkedin.com/company/empire-flippers/",
    public_email="sales@empireflippers.com; support@empireflippers.com",
    contact_source_url="https://empireflippers.com/privacy-policy/",
    notes="Company LinkedIn and sales@empireflippers.com are from the homepage, and support@empireflippers.com from the privacy policy. No phone found on the homepage, contact page or privacy policy, so +1-888-658-8388 is kept from the prior list, still not verified. Contacts not re-verified (web search budget ran out). Justin Cooke co-founded the company but may no longer be operational there.",
)

U[28] = dict(
    contacts=[
        ["Russell Day", "CEO & Managing Director", "https://www.linkedin.com/in/russell-day-7b374510a/", ""],
        ["Neil Williams", "Group IT Manager (case-study champion)", "", ""],
    ],
    company_linkedin="https://www.linkedin.com/company/day%27s-motor-group",
    contact_source_url="https://www.days.co.uk/privacy-policy/",
    notes="No public email on days.co.uk: the homepage and privacy policy have none, and the contact page did not render. Branch phones on the site: 01792 222111, 01792 616200, 01792 616000, 01792 224700, 01792 892614, 01437 760860, 01437 768000 and 029 2023 7775. Company LinkedIn is the URL-encoded form of the existing value, as linked from the site footer.",
    company_phone="01792 222111 / 01792 616200 (plus branch numbers in notes)",
)

U[29] = dict(
    contacts=[
        ["Ershadul Hoque", "Founder & CEO", "https://www.linkedin.com/in/ershadul-hoque/", "https://riseuplabs.com/"],
        ["Enamul Hoque Ratul", "Head of Operations", "", ""],
    ],
    company_phone="+880 1759 747 387; +1 (231) 241-2777; +44 7475 103777",
    contact_source_url="https://riseuplabs.com/",
    notes="Gained the CEO's LinkedIn: riseuplabs.com links linkedin.com/in/ershadul-hoque/ directly from its own site. Also added UK number +44 7475 103777 from the site. contact@riseuplabs.com and the company LinkedIn are confirmed on the homepage.",
)
