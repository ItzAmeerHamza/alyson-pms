import json
OUT = "/Users/revcloudmac/Desktop/alyson-time-doctor/.claude/worktrees/tavilo-research-v3/docs/research/v3/raw/complaint-themes-primary.json"
TP_TD = "https://www.trustpilot.com/review/timedoctor.com?stars=1&stars=2"
TP_TD2 = "https://www.trustpilot.com/review/timedoctor.com?page=2&stars=1&stars=2"
TP_HS = "https://www.trustpilot.com/review/hubstaff.com?stars=1&stars=2"
TP_HS2 = "https://www.trustpilot.com/review/hubstaff.com?page=2&stars=1&stars=2"
TP_HS3 = "https://www.trustpilot.com/review/hubstaff.com?page=3&stars=1&stars=2"
TP_HS4 = "https://www.trustpilot.com/review/hubstaff.com?page=4&stars=1&stars=2"
def E(url, date, p):
    return {"url": url, "date": date, "paraphrase": p}
T = {}
def th(vendor, theme, *ex):
    T.setdefault(vendor, {}).setdefault(theme, []).extend(ex)

# Time Doctor (Trustpilot TrustScore ~1.2-1.5 / 235 reviews, Oct 2026)
th("Time Doctor", "Billing after cancellation / refund refusals / hard-to-cancel",
   E(TP_TD, "2026-09-07", "Could not close account after 2 weeks and 6+ emails to support."),
   E(TP_TD, "2026-08-27", "Cancellation process described as intentionally broken; product buggy and confusing."),
   E(TP_TD, "2025-12-16", "Repeated cancellation requests ignored, charges continued; user deletion broken."),
   E(TP_TD, "2025-07-18", "Trial cancellation ignored, then charged and refund refused; tickets unanswered."),
   E(TP_TD, "2025-04-02", "Charged after cancelling; refund denied; had to cancel card."),
   E(TP_TD2, "2024-03-20", "Unexpected second charge without notice or consent."))
th("Time Doctor", "Unauthorized plan changes, seat overcharges and price increases",
   E(TP_TD, "2025-11-18", "Upgraded from monthly single user to annual 4-user plan without consent."),
   E(TP_TD, "2025-05-16", "Fee increased without written notice; refund refused."),
   E(TP_TD, "2025-07-27", "High per-user cost for low-quality software; billing persisted after termination."),
   E(TP_TD, "2024-03-27", "Quoted about $100, charged about $300 - called bait-and-switch."),
   E(TP_TD2, "2023-11-25", "Billed for 5 premium users when buying 4 basic."),
   E(TP_TD2, "2022-01-24", "Hard to remove users; reviewer felt policy encourages paying for unused seats."))
th("Time Doctor", "Account security / billing data exposure",
   E(TP_TD, "2026-02-19", "Unknown person gained access to account with invoices and financial data."),
   E(TP_TD, "2025-03-12", "Stranger accessed billing/invoice data; support refused accountability."))
th("Time Doctor", "Bugs, crashes and lost tracking",
   E(TP_TD, "2026-06-17", "Screenshot viewer stuck on perpetual loading."),
   E(TP_TD, "2024-12-04", "App crashes silently mid-work; issue unresolved for months."),
   E(TP_TD, "2025-04-18", "User permission settings would not save; support acknowledged bug with no fix."),
   E(TP_TD2, "2022-01-05", "Time Doctor 2 had fewer features than TD1 and broken integrations."),
   E(TP_TD2, "2019-09-23", "Jira integration breaks frequently, forcing manual time logging."))
th("Time Doctor", "Invasive surveillance / privacy",
   E(TP_TD, "2025-08-05", "Auto-tracking ran despite being disabled and captured private conversations."),
   E(TP_TD, "2024-10-07", "Extreme surveillance with screenshots and webcam photos."),
   E(TP_TD2, "2023-10-20", "Invasive monitoring hurt productivity and morale."))
th("Time Doctor", "Missing features vs competitors (switch reasons on Hubstaff comparison page)",
   E("https://hubstaff.com/timedoctor-alternative", "", "E-commerce team (15 users) left because Time Doctor lacked PTO/time-off tracking."),
   E("https://hubstaff.com/timedoctor-alternative", "", "Healthcare org (50 users) left because the Time Doctor API was too complex and unreliable."),
   E("https://hubstaff.com/timedoctor-alternative", "", "TalentPop had to convert Time Doctor hours into payroll manually."))

# Hubstaff (Trustpilot TrustScore 2.0 / 492 reviews, Oct 2026)
th("Hubstaff", "Annual-plan lock-in, no refunds, surprise charges",
   E(TP_HS, "2026-09", "Refused refund and disabled account access over a billing dispute."),
   E(TP_HS, "2026-07-30", "Deceptive billing with unexpected charges and broken support promises."),
   E(TP_HS, "2026-06-02", "Billed annually after being promised a monthly switch."),
   E(TP_HS2, "2025-12-15", "Charged a full year and refused refund on cancellation after years of use (business signed review)."),
   E(TP_HS2, "2025-08-06", "Refused to switch yearly to monthly; account locked."),
   E(TP_HS, "2026-03-10", "Charged after cancellation; had to pay just to access account settings."))
th("Hubstaff", "Nickel-and-dime add-ons and seat billing",
   E(TP_HS, "2026-06-10", "Auto-enrolled into paid VIP support without consent."),
   E(TP_HS, "2026-05-08", "Two add-ons activated automatically without authorization."),
   E(TP_HS, "2026-04-06", "Excessive per-feature charges."),
   E(TP_HS2, "2026-01-14", "Undisclosed per-seat billing charged for viewer accounts."),
   E(TP_HS, "2026-01-19", "Add-on costs not transparent; slow support."),
   E(TP_HS3, "2024-06-17", "New features gated behind paid upgrades; features removed from plans."))
th("Hubstaff", "Support: AI chatbot gatekeeping, no onboarding, no phone",
   E(TP_HS2, "2026-01-06", "Business got no onboarding; AI chatbot looped; human only appeared when typing 'cancel'; refused Zoom call."),
   E(TP_HS, "2026-01-29", "Support agent refused to read issue details or screenshots."),
   E(TP_HS2, "2025-06-13", "Advertised live demo did not exist; no phone support."),
   E(TP_HS2, "2025-09-05", "48-hour support lag."))
th("Hubstaff", "Tracking inaccuracy and integration bugs",
   E(TP_HS, "2025-12-14", "Business said a year of wrong timelogs, lost clock-ins and mixed projects forced an extra employee to follow up."),
   E(TP_HS, "2026-09-27", "Failed to record hours despite hours of use."),
   E(TP_HS, "2026-04-29", "GitLab integration unfixed for over two years."),
   E(TP_HS3, "2023-11-06", "ClickUp integration bug unresolved for 2 months."),
   E(TP_HS4, "2023-07-04", "Buggy Jira integration."),
   E("https://www.webwork-tracker.com/customers/metaviz", "", "Software firm left Hubstaff over Windows/Mac sync problems, time-zone errors and constant manual verification, plus cost."))
th("Hubstaff", "Employee morale / surveillance",
   E(TP_HS3, "2024-08-23", "Surveillance tool reportedly causing employee resignations."),
   E(TP_HS4, "2023-07-07", "Invasive monitoring with forced screenshots."),
   E("https://en.wikipedia.org/wiki/Hubstaff", "2020-04", "WSJ and NPR coverage of employee discomfort; NPR reported Hubstaff 'destroyed morale' at one company."))

import os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "themes2.py")).read())
out = []
for v, ths in T.items():
    out.append({"vendor": v, "themes": [{"theme": k, "examples": ex} for k, ex in ths.items()]})
json.dump(out, open(OUT, "w"), indent=1, ensure_ascii=False)
print({v: sum(len(e) for e in t.values()) for v, t in T.items()})
