#!/usr/bin/env python3
"""Writes ROOT/v3/raw/complaint-themes-adjacent.json. Anonymous examples are OK here (no identities)."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "complaint-themes-adjacent.json")

def ex(url, date, p):
    return {"url": url, "date": date, "paraphrase": p}

TP_H = "https://au.trustpilot.com/review/www.harvestapp.com"
TP_H2 = "https://www.trustpilot.com/review/getharvest.com?stars=1"
HN_H = "https://news.ycombinator.com/item?id=49374920"
TP_C = "https://www.trustpilot.com/review/clockify.me?stars=1&stars=2"
TP_T = "https://www.trustpilot.com/review/toggl.com?stars=1&stars=2"
TP_J = "https://www.trustpilot.com/review/jibble.io?stars=1&stars=2"

THEMES = [
 {"vendor": "Harvest", "themes": [
   {"theme": "2026 usage-based repricing after Bending Spoons acquisition (5x-17x renewals, 30-day notice)", "examples": [
     ex(TP_H, "2026-09-30", "UK reviewer: monthly bill from $437.50 to $2,335.50 with minimal notice."),
     ex(TP_H, "2026-09-14", "US reviewer: long-time customer moved from ~$6k to ~$30k/yr (5x); moving to OneSuite."),
     ex(TP_H, "2026-08-06", "UK reviewer: 7 users from $69 to $821.50/month (1,091%) with 30 days notice."),
     ex(TP_H, "2026-07-31", "Swedish 15-year customer: $2k -> $22k/yr; charged without warning."),
     ex(TP_H, "2026-07-23", "Canadian 13-year customer: ~$1k -> $13-20k/yr."),
     ex(TP_H, "2026-06-16", "Canadian reviewer: 5x increase, ~$20k extra per year, 30 days notice."),
     ex(TP_H2, "2026-09-30", "US nonprofit: time tracking cost from ~$2k to ~$23k/yr without formal notice."),
     ex("https://www.subscriptioninsider.com/blog/harvest-pricing-change-sends-some-renewals-up-1-500", "2026-08-22", "BBC-cited UK consultancy: $130 -> $2,110/mo; offered $1,309 if prepaid; leaving."),
     ex("https://news.bloomberglaw.com/ip-law/bending-spoons-customers-decry-outrageous-app-price-hikes", "2026-08-13", "Freelance web designer, 13-year customer: $211.20 -> $2,547.60/yr."),
     ex(HN_H, "2026-08", "HN commenters: ~$100/mo account quoted $2,199.50/mo Enterprise; solo plan ~$100/yr -> $20k/yr for same features; several closed accounts."),
   ]},
   {"theme": "Usage fees penalise historical data / number of projects, clients, invoices (opaque, unpublished rates)", "examples": [
     ex("https://ifeeltech.com/blog/harvest-review-time-tracking-invoicing", "2026-02-05", "14-year user flagged for enterprise usage billing because of 200+ projects and 15 years of records; quote ~$19k/yr."),
     ex(TP_H, "2026-08-26", "AU reviewer criticises percentage-based 'Flex' pricing and restrictive export; moved to Zoho."),
     ex(TP_H, "2026-08-14", "UK reviewer: fees would be ~15% of monthly revenue; model too complex."),
     ex("https://onesuite.io/blog/harvest-price-increase/", "2026", "Single-seat account shown $12/mo -> $2,040.22/mo after unlimited-usage layer."),
   ]},
   {"theme": "Discount only appears when cancelling; trust broken / fear of future hikes", "examples": [
     ex("https://ifeeltech.com/blog/leaving-harvest-experience", "2026-02-05", "Offered one-year discount but cancelled anyway because 'the trust was broken'."),
     ex("https://www.linkedin.com/posts/stephanie--clark_harvest-harvestapp-bendingspoons-activity-7436875069668294656-EW2_", "2026-04", "Consultant for a small business: $80 -> $1,900/mo suggested, $1,100 with 50% discount for 6 months; 'would be put out of business'."),
     ex(HN_H, "2026-08", "Commenter: quoted 1,400% increase, dropped to 300% after attempting to cancel."),
   ]},
   {"theme": "Unauthorised / surprise charges and refund refusals", "examples": [
     ex(TP_H2, "2026-02-26", "UK company account: unexpected ~$10k bill; refund denied."),
     ex(TP_H, "2026-06-05", "German reviewer: surprise ~$5k charge on account previously ~$10/month."),
     ex(TP_H2, "2026-06-03", "US reviewer: $168 charged without consent."),
     ex(TP_H2, "2026-02-03", "Trial user denied refund after missing cancellation deadline by days."),
   ]},
   {"theme": "Stripe made mandatory for invoice payments; features gated (PDF export); forced UI redesign", "examples": [
     ex(TP_H2, "2026-04-19", "Belgian company: ditched Harvest because Stripe payments became mandatory for invoices."),
     ex(TP_H2, "2026-05-15", "US reviewer: PDF export removed from free tier; moved to Google Docs."),
     ex(TP_H, "2026-07-14", "Mexico reviewer: forced UI redesign with no opt-out."),
   ]},
   {"theme": "Stagnant product / no PM, no automatic tracking; customers replacing with AI-built in-house tools", "examples": [
     ex("https://www.linkedin.com/posts/joshuagross_this-weekend-i-canceled-the-tool-ive-used-activity-7480309947331670016-d-fZ", "2026-08", "Agency founder rebuilt Harvest in ~8 hours with Claude Code after 624% renewal."),
     ex("https://leaveharvest.com/", "2026-08", "6-seat consultancy rebuilt it in two days with AI agents after $59 -> $704/mo."),
     ex("https://www.optimum7.com/blog/project-time-tracking-harvest-alternative.html", "2026", "Agency replaced $24k/yr Harvest with in-house tracker linked to Jira."),
     ex("https://www.linkedin.com/posts/stephanie--clark_harvest-harvestapp-bendingspoons-activity-7436875069668294656-EW2_", "2026-04", "Commenter: Harvest did almost zero innovation for a decade."),
   ]},
 ]},
 {"vendor": "Clockify", "themes": [
   {"theme": "2026 free-plan cut (5-user cap; billable rates, CSV/Excel export, kiosk, invoicing, report history moved to paid) with little/no notice", "examples": [
     ex(TP_C, "2026-09-01", "UK charity: 5-user limit takes them from free to ~GBP 1,800/yr; 'bait and switch'."),
     ex(TP_C, "2026-07-06", "Six-year user: billable tracking and exports silently paywalled."),
     ex(TP_C, "2026-06-19", "Decimal hours and CSV/Excel exports removed; no email notice."),
     ex(TP_C, "2026-06-16", "Long-time free user: saved reports and years of data vanished without warning."),
     ex(TP_C, "2026-05-18", "Bulgarian user: free plan lost hourly rates, exports, report history."),
     ex("https://www.gettimen.com/articles/clockify-free-plan-changes", "2026", "API throttled to 30 requests/hour on free plan; reports limited to one-month range."),
   ]},
   {"theme": "Refund refusals, seat billing surprises, cancellation fees", "examples": [
     ex(TP_C, "2025-05-13", "Admin seat counted as paid seat without disclosure; refund refused."),
     ex(TP_C, "2025-02-10", "AU reviewer: $1,500 cancellation fee charged a week into renewal."),
     ex(TP_C, "2025-09-10", "Incorrect tax charged; refund refused."),
   ]},
   {"theme": "Bugs / login codes / misleading integrations / missing overtime", "examples": [
     ex(TP_C, "2026-06-16", "Login codes rarely delivered; calendar view bugs."),
     ex(TP_C, "2026-03-12", "Notion 'integration' is only a manual Chrome extension; refund denied."),
     ex(TP_C, "2025-06-04", "Missing overtime tracking."),
     ex(TP_C, "2026-09-25", "Sales team obtained personal phone number from a public forum and called without consent."),
   ]},
 ]},
 {"vendor": "Toggl Track", "themes": [
   {"theme": "Support unreachable; account/data loss", "examples": [
     ex(TP_T, "2026-09-24", "UK user: chat and support systems non-functional."),
     ex(TP_T, "2026-06-10", "US user: no support channel; years of data lost due to bug."),
     ex(TP_T, "2025-10-10", "Account deletion, data loss, login failures; support went silent."),
   ]},
   {"theme": "Billing: workspace deactivated, forced repurchase at higher price, no pro-rata refunds", "examples": [
     ex(TP_T, "2026-09-04", "NL user: workspace deactivated over billing issue; had to repurchase at higher price."),
     ex(TP_T, "2026-06-02", "Paid $324/yr, denied refund for unused months."),
     ex(TP_T, "2024-07-23", "Four unanswered refund emails after annual charge."),
   ]},
   {"theme": "Performance and data-integrity bugs; missing Xero; too basic for growing teams (no approvals/budgets)", "examples": [
     ex(TP_T, "2025-08-01", "UI lag, broken autocomplete, race conditions; feature gaps between apps."),
     ex(TP_T, "2024-07-08", "No Xero integration; buggy; intrusive break timer sound."),
     ex(TP_T, "2024-02-13", "Entries lost when stopping/starting."),
     ex("https://hubstaff.com/pricing", "2026", "Anonymous 40-user marketing team: Toggl too basic - no approvals, caps, profitability."),
   ]},
   {"theme": "Aggressive sales to free users", "examples": [
     ex(TP_T, "2025-08-11", "Sales team harassing free users with disconnection threats."),
   ]},
 ]},
 {"vendor": "Jibble", "themes": [
   {"theme": "App crashes, frozen break timer, logouts after updates", "examples": [
     ex(TP_J, "2026-06-29", "ZA user: crashes, screen flicker, frequent logouts."),
     ex(TP_J, "2026-06-16", "'Crashes a lot' plus constant rating prompts."),
     ex(TP_J, "2026-01-01", "PK agency: stuck on break after update; button unresponsive."),
     ex(TP_J, "2026-02-02", "iOS app malfunctioning."),
   ]},
   {"theme": "GPS/geofence unreliable", "examples": [
     ex(TP_J, "2026-08-06", "Geofence radius too large; location unreliable."),
     ex(TP_J, "2026-04-29", "Location recording unreliable; settings require re-login."),
   ]},
   {"theme": "Leave/time-off data lost or mis-migrated; payroll errors", "examples": [
     ex(TP_J, "2026-01-27", "MY user: leave balances lost after update, 'no fail-safe'."),
     ex(TP_J, "2026-01-26", "Time-off records transferred incorrectly."),
     ex("https://hubstaff.com/pricing", "2026", "Anonymous 15-user law firm: Jibble buggy, created payroll errors needing manual fixes."),
   ]},
   {"theme": "AI-only support; billing after cancellation; staff invites/login fail", "examples": [
     ex(TP_J, "2026-06-07", "School account: only AI replies, issues unresolved."),
     ex(TP_J, "2026-06-30", "IN user: staff can't log in; invites broken."),
     ex(TP_J, "2025-01-21", "Charged after cancellation; refund denied."),
     ex(TP_J, "2025-11-06", "Reviewer says Jibble offered $50 gift card for undisclosed Reddit promotion."),
   ]},
 ]},
 {"vendor": "QuickBooks Time", "themes": [
   {"theme": "25% price rise from 2026-07-01 (Premium $8->$10, Elite +$2 per employee/month) on top of QuickBooks Online rises of 15-25%", "examples": [
     ex("https://www.ontheclock.com/blog/quickbooks-time-price-increase-2026", "2026-07", "Premium and Elite each up $2/employee/month; 25-person team pays ~$600/yr more."),
     ex("https://quickbooks.intuit.com/learn-support/en-us/other-questions/longtime-customer-deeply-disappointed-by-quickbooks-pricing-and/00/1559617", "2026", "Long-time customer: QuickBooks spend grew from $1,106 (2021) to $4,149 (2026); 38% jump in 2026; looking for alternatives."),
   ]},
   {"theme": "Decline since Intuit absorbed TSheets: support (chatbots), sync/integration issues, crashes wiping records", "examples": [
     ex("https://www.workyard.com/compare/quickbooks-time-review", "2026", "Reviewers miss the TSheets era; quality fell after Intuit acquisition."),
     ex("https://timeero.com/reviews/tsheets-quickbooks-time-review-employee-time-tracking-features-drawbacks", "2026", "Dedicated TSheets support team dissolved; users stuck with chatbots."),
     ex("https://www.capterra.com/p/151722/TSheets/reviews/", "2026", "Reviewer left after 4 years: other apps integrate with QuickBooks better than QuickBooks Time does."),
     ex("https://www.workyard.com/compare/quickbooks-time-review", "2026", "Workyard says a solar contractor's QuickBooks time tracking crashed repeatedly and wiped employee records, so admins had to estimate hours."),
   ]},
 ]},
 {"vendor": "Replicon", "themes": [
   {"theme": "Gen 3 migration broke custom reports; reporting confusing; slow at peak hours", "examples": [
     ex("https://www.capterra.com/p/5782/Replicon-TimeBill/reviews/", "2026-02-28", "System sluggish at peak hours; limited dashboard personalisation."),
     ex("https://www.outsail.co/post/replicon-reviews---pricing-pros-cons-and-user-feedback", "2026", "Gen 3 migration added hours of monthly work; hundreds of hours sending data to Replicon."),
     ex("https://www.capterra.com/p/5782/Replicon-TimeBill/reviews/", "2026-06-03", "Users cannot correct their own errors."),
   ]},
   {"theme": "Costly upgrades / licence fees scale fast; offshore support delays; uncertainty after Deltek acquisition (2023)", "examples": [
     ex("https://www.selecthub.com/p/time-tracking-software/replicon/", "2026", "Costly upgrades and higher licence fees with more users; support delays."),
     ex("https://www.capterra.com/p/5782/Replicon-TimeBill/reviews/", "2024-08-26", "Reviewer finds pricing high and features insufficient; considered QuickBooks Time."),
   ]},
 ]},
 {"vendor": "Timely", "themes": [
   {"theme": "Expensive vs competitors; annual upfront payment; paid add-ons (tasks +$5/user)", "examples": [
     ex("https://www.capterra.com/p/131584/Timely/", "2026", "Reviewers call pricing expensive, especially for solo/small teams; no modular pricing."),
     ex("https://pabau.com/blog/timely-pricing/", "2026", "Task management add-on adds $5/user/month."),
   ]},
 ]},
 {"vendor": "Timeular (EARLY)", "themes": [
   {"theme": "Repeated price rises after the 2025 rebrand to EARLY; subscription-only; 'cash grab'", "examples": [
     ex("https://www.capterra.com/p/176609/ZEI-by-Timeular/reviews/", "2026", "Users got emails about higher charges at renewal with no new features they use."),
     ex("https://www.jibble.io/reviews/timeular", "2025", "Reviewers describe frequent price increases as a cash grab; no buy-once option."),
   ]},
 ]},
 {"vendor": "RescueTime", "themes": [
   {"theme": "Free plan cut back to a hidden 'Lite' tier; card required for trial; surprise team-plan charges and refund refusals", "examples": [
     ex("https://www.trustpilot.com/review/rescuetime.com", "2026-07-07", "Individual charged for a teams plan; refund refused; buggy app."),
     ex("https://www.trustpilot.com/review/rescuetime.com", "2026-05-21", "Card details required before trial; data-collection concerns."),
     ex("https://www.trustpilot.com/review/rescuetime.com", "2025-04-07", "Charged for an annual plan without consent; could not reach support."),
   ]},
   {"theme": "Weak mobile apps (sync issues, data loss) and easily bypassed blocking", "examples": [
     ex("https://timingapp.com/blog/rescuetime-alternatives/", "2026", "iOS 2.7 / Android 3.3 ratings; sync issues and data loss reported."),
     ex("https://www.trustpilot.com/review/rescuetime.com", "2023-02-08", "Website blocking bypassed with the back button; browser plugin 3 years old."),
   ]},
 ]},
 {"vendor": "Everhour", "themes": [
   {"theme": "Tied to PM tool (Asana etc.) - can't log non-task time; weekly timesheet friction; weak mobile (iPhone-only, no search); idle detection broken", "examples": [
     ex("https://capterra.com/p/133409/Everhour/reviews", "2024-11", "Short client-email tasks can't be logged until a task exists in Asana."),
     ex("https://capterra.com/p/133409/Everhour/reviews", "2025-01", "Idle detection not working properly."),
     ex("https://capterra.com/p/133409/Everhour/reviews", "2025-11", "Tracking timesheets by week is an annoyance; mobile very limited."),
   ]},
   {"theme": "Trustpilot page closed to new reviews (company's Belarus connection) - a procurement/compliance concern for some buyers", "examples": [
     ex("https://www.trustpilot.com/review/everhour.com", "2026", "Trustpilot notes the page is temporarily closed to new reviews because of the company's connection to Belarus."),
   ]},
 ]},
 {"vendor": "TrackingTime", "themes": [
   {"theme": "Runaway timers, wrong entry restarting, duplicates; task required before logging; thin free plan (3 users, no invoicing)", "examples": [
     ex("https://www.actitime.com/software-collections/trackingtime-review", "2026", "Timer keeps running over weekends if forgotten; Chrome extension shows the wrong state."),
     ex("https://www.softwareadvice.com/project-management/trackingtime-profile/reviews/", "2026", "Wrong time entry sometimes restarts; occasional duplicate entries."),
     ex("https://www.capterra.com/p/136591/TrackingTime/", "2026", "Free plan limited to 3 users with no invoicing; analytics/PDF reports gated."),
   ]},
 ]},
 {"vendor": "Paymo", "themes": [
   {"theme": "Price rises and add-on fees (extra users, Gantt, accounting); bugs after updates / Safari; slow loading; no phone or live chat", "examples": [
     ex("https://www.getapp.com/project-management-planning-software/a/paymo/", "2026", "Users frustrated with add-on fees, price increases and cost of extra users."),
     ex("https://www.softwareadvice.com/project-management/paymo-profile/reviews/", "2026", "Bugs after updates not fixed; new releases don't work well in Safari; slow loading."),
     ex("https://www.cloudwards.net/paymo-review/", "2026", "No phone support or instant live chat."),
   ]},
 ]},
 {"vendor": "My Hours", "themes": [
   {"theme": "No monitoring / limited enterprise controls; no overtime multipliers; breaks as tasks; slow Projects page; Android bugs", "examples": [
     ex("https://www.actitime.com/software-collections/myhours-review", "2026", "Cannot calculate overtime pay multipliers; breaks must be logged as tasks."),
     ex("https://www.actitime.com/software-collections/myhours-review", "2026", "Projects section slow to load; no bulk fix of historical entries."),
     ex("https://everhour.com/blog/myhours-vs-everhour/", "2026", "Minimal workforce monitoring and limited enterprise-level controls."),
   ]},
 ]},
 {"vendor": "Timeero", "themes": [
   {"theme": "GPS battery drain, random logouts, 24/7 location permission pushback; Android crashes and missing trips; gets expensive per user", "examples": [
     ex("https://connecteam.com/reviews/timeero/", "2026", "Frequent crashes, sync problems and missing trips, especially on Android."),
     ex("https://www.workyard.com/compare/timeero-review", "2026", "Random logouts, battery drain and 24/7 location permissions remain friction points."),
     ex("https://www.capterra.com/p/175900/Timeero/", "2026", "Hard to convince new staff it isn't tracking them all the time; no permanent free plan."),
   ]},
 ]},
]

with open(OUT, "w") as f:
    json.dump(THEMES, f, indent=2, ensure_ascii=False)
print("themes:", len(THEMES), "vendors ->", OUT)
