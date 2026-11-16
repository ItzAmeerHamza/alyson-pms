V = "Paymo"
P = "https://www.paymoapp.com/"
NOTE = "Paymo customer story (paymoapp.com/customers, pages dated 2018-2021 except Opgevallen 2023). Stale; brief record. "
def r(slug, name, ind, country, emp, contact, title, date, years, **k):
    old = date < "2023"
    d = dict(company_name=name, industry=ind, hq_country=country, employee_count=emp, employee_count_source_url=P + slug + "/", estimated_tracked_seats=emp,
             vendor=V, evidence_type="Vendor case study",
             evidence_summary="Paymo customer story: %s (%s, %s employees) uses Paymo for projects and time tracking (%s using Paymo at time of story)." % (name, country, emp, years),
             source_url=P + slug + "/", source_publication_date=date,
             status="PROBABLE" if old else "CURRENT", status_reason="Live but stale (%s) vendor story" % date if old else "2023 vendor story",
             confidence_score=50 if old else 80,
             contacts=[{"name": contact, "title": title, "linkedin": "", "source_url": P + slug + "/"}],
             pitch_angle="Small agency on Paymo — Tavilo Starter ($49/10 seats)" if int(emp) <= 10 else "Tavilo Business plan")
    d.update(k); d["notes"] = NOTE + k.get("notes", ""); return d
RECS = [
 r("kunder", "Kunder", "Software development (SaaS/agency)", "Chile", "50", "Luis Hernan", "COO", "2020-07", "6 years", notes="Also Manuel Ibáñez, CCO. Largest Paymo story; Spanish outreach."),
 r("cromatic-studios", "Cromatic Studios", "Creative agency", "Romania", "14", "Cristian Stoicescu", "Founder (per testimonials page)", "2020-07", "2 years"),
 r("amz-advisers", "AMZ Advisers", "Amazon marketing consultancy", "US", "12", "Mike Begg", "Co-founder", "2020-07", "1 year"),
 r("ameba", "Ameba Creative Studio", "Creative agency", "Uruguay", "11", "Miguel Vallvé", "CEO & Co-founder", "2020-07", "5 years"),
 r("archaius-creative", "Archaius Creative", "Creative agency", "US", "11", "David Aguilar", "CEO", "2020-06", "5 years"),
 r("mammothxr", "MAMMOTH XR", "Extended reality studio", "Canada", "8", "Matt Wright", "Founder & CXO", "2020-06", "5 years"),
 r("born-digital", "Born Digital", "Creative agency", "Belgium", "6", "Maarten Cox", "Co-Founder", "2020-12", "18 months"),
 r("galvez-gil", "Galvez Gil E-Commerce Consulting", "E-commerce consulting (fully remote)", "Spain", "5", "Israel Galvez Gil", "CEO", "2020-08", "6 years", workforce_signals="fully remote"),
 r("mbusiness", "mBusiness", "Digital marketing", "Switzerland", "5", "Mischa (surname not captured)", "Founder", "2021-07", "6 years", workforce_signals="some remote employees"),
 r("opgevallen", "Opgevallen", "Creative agency", "Netherlands", "5", "Hjalmar Bosscher", "Founder", "2023-11", "83 months"),
 r("strongway", "Strongway Webstudio", "Web development", "Brazil", "4", "Leonardo Baptista Lopes", "Founder", "2020-07", "10 years"),
 r("kda", "KDA", "Architecture", "US", "3", "(not captured)", "", "2020-07", "3 years", contacts=[]),
 r("robot-house", "Robot House Creative", "Brand development agency", "US", "3", "Brett Grimes", "Co-creative director/partner", "2020-07", "6 years"),
]
