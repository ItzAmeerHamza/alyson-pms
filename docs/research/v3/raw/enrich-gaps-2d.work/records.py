import json, os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'enrich-gaps-2d.json')


def rec(name, domain, vendor, emp, country, contacts, li='', phone='', email='', csrc='', notes='', status='', reason=''):
    r = {"company_name": name, "company_domain": domain, "vendor": vendor,
         "evidence_type": "Contact enrichment", "status": status, "confidence_score": 0,
         "employee_count": emp, "hq_country": country,
         "contacts": [dict(zip(["name", "title", "linkedin", "source_url"], c)) for c in contacts],
         "company_linkedin": li, "company_phone": phone, "public_email": email,
         "contact_source_url": csrc, "notes": notes}
    if status:
        r["status_reason"] = reason
    return r


R = [
    rec("Nylon Technology", "nylontechnology.com", "ClickTime", "", "US",
        [("Jim Curran", "Partner & Co-founder (oversees business operations)", "", "https://nylontechnology.com/about"),
         ("Steve Grushcow", "Partner & Co-founder (systems, growth strategy)", "", "https://nylontechnology.com/about"),
         ("Jed Freeman", "Operations & Security Director", "", "https://nylontechnology.com/about")],
        phone="+1 212-691-1134", csrc="https://nylontechnology.com/contact",
        notes="Domain confirmed: nylontechnology.com (founded 1997, custom software dev, matches case study). "
              "Case-study contact Simon Horwith (CTO) is NOT on the current team page - treated as departed; replaced with co-founders. "
              "Contact page: 'Please call Jim Curran at 212-691-1134'; says team is fully remote, US-based (a good Tavilo angle). "
              "No public email (contact form only), no company LinkedIn link and no personal LinkedIn URLs on site. "
              "Team page lists ~10 people. ClickTime case study is old (ColdFusion-era)."),
    rec("OIM Consulting", "oimconsulting.com", "ClickTime", "", "South Africa",
        [("Arjen de Bruin", "Chief Executive Officer", "", "https://oimconsulting.com/about-us/"),
         ("Ben Nel", "Managing Director", "", "https://oimconsulting.com/about-us/"),
         ("Yogesh Ramjattan", "Head: Operations", "", "https://oimconsulting.com/about-us/")],
        li="https://www.linkedin.com/company/oimconsulting/", phone="+27 21 913 8814",
        email="info@oimconsulting.com", csrc="https://oimconsulting.com/contact/",
        notes="Domain oimconsulting.com - management/supervisory-development consultancy focused on mining & manufacturing, consistent with the "
              "case study (consultants, sister companies, Xero + BambooHR; ClickTime tags it Engineering and Manufacturing). HQ corrected from US to "
              "South Africa: OIM Consulting (Pty) Ltd, reg. 1985/005524/07, Welgemoed, Cape Town; also OIM Consulting Australia "
              "(+61 493 732 867, Maroochydore QLD). Case-study contact Carmelle Venter (Accountant) not on leadership page; not recorded (not a decision maker). "
              "Leadership also lists Marli van der Merwe (Head: Support Services, talent mgmt). No personal LinkedIn URLs on site. "
              "Australia email on site is a named person's address, so only the generic info@ is recorded."),
    rec("Rebuilding Together Saratoga County", "rtsaratoga.org", "ClickTime", "", "US",
        [("Michelle Larkin", "Executive Director (co-founder)", "", "https://rtsaratoga.org/about-us/"),
         ("Mary Lawrence", "Director of Operations", "", "https://rtsaratoga.org/about-us/")],
        phone="+1 518-587-3315", email="info@rtsaratoga.org", csrc="https://rtsaratoga.org/contact-us/",
        notes="Domain rtsaratoga.org (rebuildingtogethersaratoga.org serves the same site). Saratoga Springs, NY nonprofit. "
              "Mary Lawrence (Grant Administrator in the ClickTime case study) is still on staff, now Director of Operations - still in role, promoted. "
              "Staff page lists ~15 staff plus Alexa Cretti (Operations Manager). Site links Facebook/Instagram/X but no company LinkedIn; "
              "no personal LinkedIn URLs found."),
    rec("Shook Kelley", "shookkelley.com", "ClickTime", "", "US",
        [("Henry Stepp", "Partner / CTO", "", "https://shookkelley.com/our-team"),
         ("Terry Shook", "Founding Partner and Principal", "", "https://shookkelley.com/our-team"),
         ("Kevin E. Kelley", "Founding Partner and Principal (Los Angeles)", "", "https://shookkelley.com/our-team"),
         ("Sabrina Fan", "Managing Principal", "", "https://shookkelley.com/our-team")],
        li="https://www.linkedin.com/company/shook-kelley-inc-", phone="+1 704-377-0661; +1 310-659-9482 (Los Angeles)",
        email="hello@shookkelley.com", csrc="https://shookkelley.com/contact",
        notes="Henry Stepp, the CTO quoted in the ClickTime case study, is still listed as Partner / CTO - still in role; he is the obvious "
              "buyer for timesheet tooling. Offices: Charlotte NC (1545 West Trade St) and Los Angeles. Emails on contact page are Cloudflare-"
              "obfuscated; decoded hello@, charlotte@ and losangeles@shookkelley.com. Company LinkedIn linked from footer. No personal LinkedIn URLs."),
    rec("Children's Advocacy Centers of Texas", "cactx.org", "ClickTime", "", "US",
        [("Joy Hughes Rauls", "Chief Executive Officer", "", "https://cactx.org/who-we-are-page/"),
         ("Justin Joyner", "Chief Operations Officer", "", "https://cactx.org/who-we-are-page/"),
         ("Natasha King", "Chief Financial Officer", "", "https://cactx.org/who-we-are-page/")],
        li="https://www.linkedin.com/company/cactx/", phone="+1 512-258-9920", csrc="https://cactx.org/contact-us/",
        notes="Domain cactx.org (Austin, TX; 1501 W. Anderson Lane). Leadership from Our Leadership page; also Ellen Morrissey (Chief Innovation Officer), "
              "Catherine Bass (CSO/EVP). No general public email for CACTX itself (contact form only; mailto links on the homepage belong to local CACs). "
              "WARNING: the ClickTime source_url now redirects to/serves a Teach For All case study, so the original CACTX case study could not be re-read "
              "this pass - evidence should be re-checked. A Grants Administrator opening is posted (grant-compliance time tracking is the likely use)."),
]

if __name__ == '__main__':
    import sys
    extra = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'records2.py')
    if os.path.exists(extra):
        ns = {'rec': rec}
        exec(open(extra).read(), ns)
        R += ns['R2']
    json.dump(R, open(OUT, 'w'), indent=1, ensure_ascii=False)
    print(len(R), 'records written')
