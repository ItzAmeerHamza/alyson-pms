F = {
9: dict(  # The Coding Network
    contacts=[
        {"name": "Neal Green", "title": "Co-founder & Owner (CEO per existing record)", "linkedin": "", "source_url": "https://codingnetwork.com/about-us-about-tcn/"},
        {"name": "Mark Babst", "title": "Co-founder & Owner", "linkedin": "", "source_url": "https://codingnetwork.com/about-us-about-tcn/"},
        {"name": "Steve Micks", "title": "", "linkedin": "", "source_url": "https://www.currentware.com/customers/the-coding-network/"},
    ],
    company_phone="(888) 565-5117",
    contact_source_url="https://codingnetwork.com/contact-us/",
    notes="About page: 'founders and owners, Mark Babst and Neal Green'. Contact page lists Neal Green and Mark Babst, both at (888) 565-5117, 324 South Palm Drive, Beverly Hills, CA 90212. No public email on site (form only). Steve Micks (existing second contact) not found on the TCN site; kept unverified. No personal LinkedIn links on site."),
10: dict(  # TopFoxx
    hq_country="United States",
    contacts=[
        {"name": "Helen Getts", "title": "Founder (woman-owned company, NYC)", "linkedin": "", "source_url": "https://topfoxx.com/pages/our-story"},
    ],
    company_phone="(646) 540-7419",
    public_email="info@topfoxx.com",
    contact_source_url="https://topfoxx.com/pages/contact-topfoxx",
    notes="Our Story page: 'Topfoxx is a 100% woman-owned company, founded by New York City native, Helen Getts' (since 2015). Input HQ looked like Uruguay (TheirStack /uy listing); site says NYC, so hq_country set to United States. Contact page also lists andy@topfoxx.com (collaborations & press), luis@topfoxx.com (wholesale), hayley@topfoxx.com (customer support) - roles only, names not full. No company LinkedIn linked on site; no second decision maker found."),
13: dict(  # Nabler
    status="DO_NOT_TARGET",
    status_reason="Acquired: nabler.com now only shows 'Nabler is now part of Brainlabs'; the Nabler brand is folded into Brainlabs.",
    contacts=[
        {"name": "Praveen Dalal", "title": "Director of HR (per Timely case study; current employer unverified)", "linkedin": "", "source_url": "https://www.timely.com/case-studies/nabler/"},
    ],
    notes="nabler.com home and /contact-us/ both show a single 'Nabler - Now Brainlabs' notice with no contact details. Brainlabs (large independent digital media agency) could be evaluated as a separate prospect, but the Timely relationship was Nabler's."),
14: dict(  # Viking Yachts
    hq_country="United States",
    employee_count="1700+ (per CurrentWare case study)",
    contacts=[
        {"name": "Patrick Healey", "title": "President and CEO", "linkedin": "", "source_url": "https://www.vikingyachts.com/History.asp"},
    ],
    company_phone="609-296-6000",
    public_email="customerservice@vikingyachts.com",
    contact_source_url="https://www.vikingyachts.com/Contact.asp",
    notes="History page: 'Current President and CEO Patrick Healey'. Contact page: New Gretna, NJ 08224, phone 609-296-6000, customer service email; also sales email gwaldron@vikingyachts.com. CurrentWare case study names no individual. No IT head or company LinkedIn found on site (only Facebook/Instagram)."),
15: dict(  # Boston Centerless
    contacts=[
        {"name": "Steve Tamasi", "title": "Owner & CEO", "linkedin": "", "source_url": "https://www.currentware.com/customers/boston-centerless/"},
    ],
    company_linkedin="https://www.linkedin.com/company/boston-centerless",
    contact_source_url="https://www.bostoncenterless.com/contact",
    notes="bostoncenterless.com blocks curl (403); via WebFetch the home page links linkedin.com/company/boston-centerless. Contact page lists addresses only (11 Presidential Way, Woburn, MA 01801; 6901 South Hanna St., Ft. Wayne, IN 46816), no phone/email (forms only). Steve Tamasi still-in-role not verifiable from site; no second contact found."),
16: dict(  # Shady Maple
    contacts=[
        {"name": "Lin Weaver", "title": "Chief Executive Officer", "linkedin": "", "source_url": "https://www.shady-maple.com/about/founders-executive-team/"},
        {"name": "Phil Weaver", "title": "President", "linkedin": "", "source_url": "https://www.shady-maple.com/about/founders-executive-team/"},
        {"name": "Diane Adamczyk", "title": "Chief Human Resource Officer", "linkedin": "", "source_url": "https://www.shady-maple.com/about/founders-executive-team/"},
    ],
    contact_source_url="https://www.shady-maple.com/contact-us/",
    notes="Founders & Executive Team page: Lin Weaver CEO, Phil Weaver President (existing contact confirmed), Diane Adamczyk CHRO, Steve Althouse CFO. No public email or company LinkedIn on site (contact forms; phone +1 717-354-8222 already on record)."),
17: dict(  # First Choice Health
    company_domain="fchn.com",
    hq_country="United States",
    employee_count="400+ (per CurrentWare case study)",
    contacts=[
        {"name": "Nicholas Scheetz", "title": "IT Service Desk Supervisor & System Administrator", "linkedin": "", "source_url": "https://www.currentware.com/customers/first-choice-health/"},
    ],
    notes="CurrentWare case study: Seattle, WA managed-care services provider, 400+ employees, quote from Nicholas Scheetz (IT). Domain fchn.com is the known First Choice Health Network site but it returns 403 to curl and WebFetch, so no leadership, phone or email could be read; domain not confirmed from a fetched page. No executive decision maker found without search."),
}
