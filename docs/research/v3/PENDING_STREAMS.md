# Streams queued until agent slots free up (orchestrator notes)

Launched wave 1 (2026-10-05): reval-outreach-1/2/3, reval-theirstack-core-1/2, reval-theirstack-generic,
reval-master-strong, competitors + discover-theirstack, discover-casestudies-a, discover-casestudies-b.

Still to launch (same prompts as the orchestrator drafted; each starts "read v3/AGENT_SPEC.md"):
1. discover-casestudies-adjacent — Clockify, Toggl, Jibble, Harvest, Everhour, TrackingTime, Replicon, Timesheets.com, Time Analytics, QuickBooks Time, RescueTime, Timeero, Timely, Timeular, My Hours, Paymo, ClickTime, BeeBole; switch stories = FORMER.
2. discover-glassdoor — every vendor, Glassdoor (all country domains), Indeed cmp, Comparably, AmbitionBox, Kununu, JobStreet; employer only; complaints.
3. discover-jobs — vendor x phrases across Greenhouse/Lever/Ashby/Workable/SmartRecruiters/BambooHR/Indeed/LinkedIn/OnlineJobs.ph/JobStreet/Rozee/Naukri.
4. discover-docs-github — handbooks, onboarding, PDFs, notion/gdocs/gitbook; GitHub MDM scripts, installers, SSO; never credentials.
5. discover-complaints-primary — Reddit/X/LinkedIn/HN/Trustpilot/G2 for primary vendors; company only when public; + complaint-themes-primary.json.
6. discover-complaints-adjacent — Harvest 2026 price hike etc.; switchers; + complaint-themes-adjacent.json.

Wave 2 after merge: contact enrichment for any non-DNT company missing decision maker / LinkedIn / phone / email.

## Update (after plan approval)
Resumed all 10 wave-1 agents. Launched: discover-complaints-primary, discover-glassdoor,
discover-complaints-adjacent, discover-jobs. STILL QUEUED (cap): discover-docs-github,
discover-casestudies-adjacent. Prompts must add: no sub-agents, write via Write tool or saved script.
