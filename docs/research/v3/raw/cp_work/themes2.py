# ---- more vendors (exec'd from themes.py) ----
TP_AT = "https://www.trustpilot.com/review/activtrak.com?stars=1&stars=2"
TP_AT2 = "https://www.trustpilot.com/review/activtrak.com?page=2&stars=1&stars=2"
th("ActivTrak", "Auto-renewal traps, surprise annual charges, hard cancellation (TrustScore 1.5 / 153)",
   E(TP_AT, "2026-07-30", "Retail business says ActivTrak charged its business card a large renewal without notice; refund refused without 30-day written notice; no phone support."),
   E(TP_AT, "2026-03-09", "Locks customers into auto-renewal and charges another full year."),
   E(TP_AT, "2026-01-31", "Cancellation requires a 30-day approval period; support unresponsive."),
   E(TP_AT, "2025-09-04", "Auto-billed for 5 years on an account an employee created, though the system was not used."),
   E(TP_AT, "2025-06-10", "Reviewer reports an unexpected charge of about GBP 6,700."),
   E(TP_AT, "2025-01-10", "Cancellation form rejects non-US phone numbers; email cancellation refused."),
   E("https://www.capterra.com/p/135366/ActivTrak/reviews/", "2026-03-09", "CFO (publishing) 1-star: auto-renewal lock-in, canned support replies; switching away."))
th("ActivTrak", "Pricing: 5-seat minimum, annual-only billing, paid add-ons",
   E(TP_AT, "2023-03-03", "$10/user advertised but $50 minimum with annual billing; refund refused."),
   E("https://www.trustradius.com/products/activtrak/pricing", "2026", "Annual-only billing with 5-user minimum; advanced reporting and integrations cost extra."),
   E("https://www.capterra.com/p/135366/ActivTrak/reviews/", "2023-10-10", "BI director: slow/unreliable, repetitive URL classification, expensive add-ons, poor service; left despite contract."))
th("ActivTrak", "Agent reliability / data loss",
   E(TP_AT, "2025-05-27", "Data lost through an account mix-up; charges continued."),
   E(TP_AT2, "2022-01-31", "Product failed to sync; cancellation refused mid-contract after 5 months of non-use."),
   E(TP_AT2, "2018-03-23", "Agents stopped working, no screenshot reports, server failure lost tracking."))
th("ActivTrak", "Employee surveillance backlash",
   E(TP_AT, "2025-04-04", "Reviewer criticizes employers using surveillance software as micromanagement."))

TP_IN = "https://www.trustpilot.com/review/insightful.io?stars=1&stars=2"
th("Insightful", "Billing: phantom/auto-created users and overcharges (TrustScore 4.1 / 68)",
   E(TP_IN, "2025-07-30", "Active Directory sync randomly created users with no disable option; charged for unused seats."),
   E(TP_IN, "2025-04-28", "Confusing user management led to a wrongful $691 charge; refund refused citing terms."),
   E(TP_IN, "2024-10-31", "Consistently overcharges; mysterious new users appear on account."),
   E(TP_IN, "2026-04-14", "Called pricing a 'total rip-off'."),
   E(TP_IN, "2024-05-21", "Billing continued after cancellation."))
th("Insightful", "Support / onboarding gaps",
   E(TP_IN, "2026-02-05", "Trial lacked phone support for proper evaluation."),
   E(TP_IN, "2025-12-23", "Customer service described as nonexistent; AI assistant unhelpful."),
   E(TP_IN, "2025-11-30", "Automated replies claim issues resolved when they are not."),
   E("https://www.capterra.com/p/142813/Workpuls/reviews/", "2022-08-31", "Owner: support phone line disconnects without help."))
th("Insightful", "Accuracy and missing features",
   E(TP_IN, "2025-07-25", "Shift tracking inflated hours; no break feature; refund refused."),
   E(TP_IN, "2026-02-27", "Publisher: video recording has no AI analysis, manual review impractical; pricier than rivals."),
   E("https://www.capterra.com/p/142813/Workpuls/reviews/", "2026-03-02", "Time-zone management hard for multi-timezone teams."),
   E("https://www.capterra.com/p/142813/Workpuls/reviews/", "2026-05-11", "Logistics ops manager: high price, unintuitive navigation; cheaper tools do the same."))
th("Insightful", "Privacy concerns from monitored staff",
   E("https://www.capterra.com/p/142813/Workpuls/reviews/", "2026-06-02", "QC reviewer uneasy about periodic screenshots and computer-access permissions."))

TP_DT = "https://www.trustpilot.com/review/desktime.com?stars=1&stars=2"
th("DeskTime", "Price increases on renewal (TrustScore 4.5 / 44)",
   E(TP_DT, "2025-09-19", "Unauthorized annual renewal with a 67% price increase; refund refused."),
   E("https://www.capterra.com/p/168660/DeskTime/reviews/", "", "Pricey for teams larger than ~10 members."))
th("DeskTime", "Slow support",
   E(TP_DT, "2023-11-29", "Support replies take 5.5 hours; 5-day wait for a call."))
th("DeskTime", "Reliability, Linux gaps, classification and tamper issues",
   E("https://www.capterra.com/p/168660/DeskTime/reviews/", "", "Auto-start on Windows boot unreliable; app slow; reports slow to download."),
   E("https://www.capterra.com/p/168660/DeskTime/reviews/", "", "Weak Linux support; mis-tags apps as unproductive; no offline access."),
   E("https://www.capterra.com/p/168660/DeskTime/reviews/", "", "Users can stop or uninstall the app without a password; screenshot privacy concerns."),
   E(TP_DT, "2019-11-27", "Employee calls it a 'time sucker' that captures everything."))

th("Time Champ", "Limited public negative reviews; privacy of random screenshots",
   E("https://www.trustpilot.com/review/timechamp.io", "2026-10", "No Trustpilot reviews; Capterra almost all 5-star (possible review solicitation)."),
   E("https://www.techjockey.com/detail/timechamp", "", "User feedback notes random screenshots can expose personal information on screen."),
   E("https://www.we360.ai/alternative/timechamp/", "", "Competitor claims employees feel micromanaged because every app, site and idle minute is tracked."))

TP_WW = "https://www.trustpilot.com/review/webwork-tracker.com?stars=1&stars=2"
th("WebWork", "Screenshots/tracking failures and gaming (TrustScore 4.6 / 102)",
   E(TP_WW, "2025-10-05", "Tool failed to take screenshots."),
   E(TP_WW, "2025-09-18", "Screenshot capture fails; developers could game the system."),
   E(TP_WW, "2024-08-07", "Software broke after an update; support could not fix."),
   E("https://www.capterra.com/p/151338/WebWork-Time-Tracker/", "", "Break/pause buttons unreliable, auto-stops in meetings; limited offline tracking; buggy mobile app."))
th("WebWork", "Billing and support",
   E(TP_WW, "2025-09-25", "Monthly invoices hard to verify; trust questioned."),
   E(TP_WW, "2025-09-16", "Reviewer calls them scammers after a charge."),
   E(TP_WW, "2023-08-11", "Almost no response from support."),
   E("https://www.capterra.com/p/151338/WebWork-Time-Tracker/", "", "No live chat support."))
th("WebWork", "Employee morale",
   E(TP_WW, "2026-02-11", "Constant pressure to look productive undermines real motivation."),
   E(TP_WW, "2025-11-28", "Tool hurts productivity and signals insecure management."))

TP_WE = "https://www.trustpilot.com/review/we360.ai"
th("We360.ai", "Product reliability and support",
   E(TP_WE, "2026-07-28", "Tester called it the worst software they had tried, 'total scam'."),
   E(TP_WE, "2023-10-05", "Persistent malfunctions with 2-3 week fixes, unresponsive management, refund unresolved after 2 years."),
   E("https://www.capterra.com/p/211680/We360-ai/reviews/", "", "Support could not understand issues; an employee could not log in to attendance for 3+ months."),
   E("https://www.g2.com/products/we360-ai/reviews", "", "Data latency - wait until end of day; new features under-documented."))
th("We360.ai", "Missing features",
   E("https://www.capterra.com/p/211680/We360-ai/reviews/", "", "No iOS app; limited graphs."),
   E("https://www.workstatus.io/reviews/we360.ai", "", "Not project-specific, no task-level workload, no billing integration (competitor review)."))

TP_TM = "https://www.trustpilot.com/review/teramind.co?stars=1&stars=2"
th("Teramind", "Support unresponsive, product breaks (TrustScore 2.7 / 7)",
   E(TP_TM, "2026-08-10", "Unresponsive support; silent installer issues during trial."),
   E(TP_TM, "2026-07-31", "No human tech support; cannot add new employees."),
   E(TP_TM, "2026-03-30", "Slows computers; poor support; billing continued unresolved."),
   E(TP_TM, "2026-03-19", "Stops working; ~$1,000 cost; inadequate support."),
   E(TP_TM, "2025-07-19", "Recordings stopped working after paying; support unresponsive."),
   E("https://www.capterra.com/p/172645/Teramind/reviews/", "", "Support ticket open a month with no fix."))
th("Teramind", "Expensive",
   E("https://www.capterra.com/p/172645/Teramind/reviews/", "", "'$25 per user per month was a little painful' (small company manager); 'Price! Expensive!'."))
th("Teramind", "Covert surveillance backlash / legal risk",
   E("https://kotaku.com/mindseye-build-a-rocket-boy-union-teramind-surveillance-software-iwgb-2000689327", "2026-04-21", "Game studio staff union says Teramind was installed without knowledge (keystrokes, screen, microphone); removed after grievance, legal action filed."))

th("Controlio", "Steep learning curve, PC-only, weak time tracking",
   E("https://www.g2.com/products/controlio/reviews?qs=pros-and-cons", "", "Steep learning curve for non-technical users; PC only, no mobile; low live-stream quality."),
   E("https://www.employee-monitoring.net/blog/best-controlio-alternatives", "", "Lacks built-in time tracking, attendance and project billing (competitor article)."),
   E("https://www.trustpilot.com/review/controlio.net", "2026-10", "No Trustpilot reviews; G2 rating 4.9 suggests solicited reviews."))

TP_MT = "https://www.trustpilot.com/review/monitask.com?stars=1&stars=2"
th("Monitask", "Cancellation / billing and support",
   E(TP_MT, "2025-04-10", "Hard to cancel; free trial may auto-convert to paid; support unresponsive."),
   E(TP_MT, "2025-05-31", "Inadequate service, disrespectful staff."))
th("Monitask", "Data-safety concern and missing features",
   E("https://www.capterra.com/p/163622/Monitask/reviews/", "", "Concern about data safety due to Russian origin; unexpected Russian text in app."),
   E("https://www.capterra.com/p/163622/Monitask/reviews/", "", "Only ~2 weeks of log history; no shifts/payroll; no client access or non-billable hours; task selection glitches."))

th("ProHance", "Micro-monitoring backlash at enterprise BPO/IT",
   E("https://www.businesstoday.in/technology/news/story/cognizant-says-its-employee-laptop-tracking-tool-isnt-for-performance-evaluation-502676-2025-11-19", "2025-11-19", "Reports that ProHance marks staff idle after 5 minutes and away after 15 at a large IT firm; company forced to clarify."))
th("ProHance", "Complex dashboards, gameable, learning curve",
   E("https://www.g2.com/products/prohance/reviews", "", "Too many reports/dashboards; users can game time-away; steep learning curve."))

th("Prodoscore", "Usability and score accuracy",
   E("https://www.g2.com/products/prodoscore/reviews", "", "UI not intuitive; logic hard to follow, prohibitive to adoption; admin/manager UX needs overhaul."),
   E("https://www.capterra.com/p/159439/Prodoscore/", "", "Sometimes gives no points even while working; hard to explain to staff why a monitoring tool was introduced."))

th("Kickidler", "Performance, setup and platform limits",
   E("https://www.capterra.com/p/172028/Employee-Monitoring-Software-and-Time-Tracking-Solution/reviews/", "", "Confusing setup needing a standalone server; interface overwhelming and slow with large data."),
   E("https://www.capterra.com/p/172028/Employee-Monitoring-Software-and-Time-Tracking-Solution/reviews/", "", "Recording playback slow, freezes or goes black; screenshot export freezes."),
   E("https://www.capterra.com/p/172028/Employee-Monitoring-Software-and-Time-Tracking-Solution/reviews/", "", "Limited macOS/Linux support; pricing steep for small teams."))

TP_VE = "https://www.trustpilot.com/review/veriato.com"
th("Veriato", "Deployment failures, crashes and refund refusals (Trustpilot 100% 1-star / 6)",
   E(TP_VE, "2024-07-16", "Onboarding promised but vendor unresponsive after payment; training only for extra fee."),
   E(TP_VE, "2021-04-06", "Paid $1,800 for a product installers could not deploy."),
   E(TP_VE, "2020-08-26", "System crashes across ~100 employee computers after install; refund refused."),
   E("https://www.capterra.com/p/161116/Veriato/", "", "Resource-heavy, tedious deployment, antivirus conflicts, large disk usage."))

th("TimeCamp", "Plan downgrades and sales spam",
   E("https://www.trustpilot.com/review/timecamp.com", "2025-12-08", "Daily unsolicited sales calls after registration, continuing after account deletion."),
   E("https://www.trustpilot.com/review/timecamp.com", "2021-02-27", "Reporting features silently removed from the free plan."))

th("Apploye", "Tracking accuracy (churn case)",
   E("https://hubstaff.com/customers/simple-biz", "", "700-person agency left Apploye over inaccurate totals, inconsistent recorded hours and tracker stopping unexpectedly."),
   E("https://www.capterra.com/p/239423/Apploye/reviews", "", "Limited offline, few report customizations, crowded dashboard, weaker mobile app."))

TP_TQ = "https://www.trustpilot.com/review/traqq.com?stars=1&stars=2"
th("Traqq", "Support and data retention (TrustScore 3.3 / 54)",
   E(TP_TQ, "2026-01-09", "Tracking data auto-deleted after one year."),
   E(TP_TQ, "2026-01-06", "Support asks for info already given."),
   E(TP_TQ, "2025-01-09", "Install issue unresolved 3 months after yearly payment."),
   E(TP_TQ, "2024-10-17", "Staff earnings report glitch unsolved after a month."),
   E(TP_TQ, "2023-11-15", "Customer support does not exist."))
th("Traqq", "Missing features",
   E("https://www.capterra.com/p/230726/Traqq/reviews/", "", "Few integrations, no mobile app, no GPS, Mac gaps; screenshots catch non-work activity."))

# Hubstaff extra
th("Hubstaff", "Employee morale / surveillance",
   E("https://www.yahoo.com/news/elon-musks-xai-pressed-employees-092601003.html", "2025-07", "AI lab told tutors to install Hubstaff on personal computers; pushback and a public resignation calling it 'surveillance disguised as productivity'."))
th("Hubstaff", "Tracking inaccuracy and integration bugs",
   E("https://www.webwork-tracker.com/customers/mid-construction", "", "Construction firm left because Hubstaff timers kept running when staff went off duty, inflating hours."))
th("Time Doctor", "Missing features vs competitors (switch reasons on Hubstaff comparison page)",
   E("https://hubstaff.com/blog/remote-workforce-strategy/", "2025-05-27", "BPO cycled through Time Doctor, ActivTrak and DeskTime before Hubstaff."),
   E("https://www.capterra.com/p/129984/Time-Doctor/reviews/", "2026-04-10", "Consultant: billed for Executive Dashboard despite restriction under 20 users; screenshots fail on RDP; keystroke detection misses work."))

# ---- resume batch ----
th("ActivTrak", "Pricing: 5-seat minimum, annual-only billing, paid add-ons",
   E("https://hubstaff.com/hubstaff-vs-activtrak", "", "Marketing team (150 users) left ActivTrak: annual billing made it hard to adjust as team changed; onboarding/offboarding difficult."))
th("Hubstaff", "Price too high at scale (switch to cheaper tools)",
   E("https://apploye.com/customer-stories/grammar-electrical", "", "Electrical firm on Hubstaff 5 years with 44 users (~$396/mo) switched to a tool at half the cost; 'features were fine, but the price became more than what we wanted to be spending'."),
   E("https://apploye.com/hubstaff-alternatives", "", "Fintech CEO: dropped Traqq and Hubstaff before choosing another tool."),
   E("https://apploye.com/hubstaff-alternatives", "", "HR reviewer (marketing/advertising) switched off Hubstaff for a simpler tool at a 20% lower price."),
   E("https://www.webwork-tracker.com/customers/metaviz", "", "Software firm cut tool spend 15-20% by leaving Hubstaff."))
th("Insightful", "Privacy concerns from monitored staff",
   E("https://www.business-humanrights.org/en/latest-news/usa-ai-startup-mercor-sued-over-hiring-practices-and-contractors-data-handling/", "2026-04-22", "AI contractor platform sued after a breach exposed contractor screenshots captured by Insightful on personal devices; claims of monitoring without proper consent."),
   E("https://www.lazywork.xyz/articles/how-to-bypass-insightful-time-tracker-formerly-workpuls-complete-guide", "2026", "Bypass guides for Insightful circulate, showing worker resistance/gaming."))
th("TimeCamp", "Bugs / web app freezing (churn case)",
   E("https://desktime.com/case-studies/on-the-map-marketing", "2019", "50-person agency left TimeCamp after 2 years: overly complicated, many bugs, web version freezing constantly."))
th("Traqq", "Dropped by growing teams",
   E("https://apploye.com/hubstaff-alternatives", "", "Fintech (300-600 staff) dropped Traqq and Hubstaff before settling on another tool."))
th("Kickidler", "Data loss and price increases (Russian review sites)",
   E("https://crmindex.ru/services/kickidler", "2026-02-20", "Customer says Oct-Dec 2025 employee statistics were irreversibly deleted despite continuous payment (30-day non-payment purge policy cited)."),
   E("https://crmindex.ru/services/kickidler", "2024-10-03", "Price rose; vendor refused discount."),
   E("https://www.tbank.ru/reviews/company/kickidler/147584/", "", "Reviews mention poor setup support, crashes when the PC user changes, and 'my employees hate this program'."))
