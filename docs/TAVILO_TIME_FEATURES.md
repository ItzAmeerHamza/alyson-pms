# Tavilo Time — feature catalog

**Tavilo Time** is the employee time-tracking product. People clock in with the desktop app (window title Tavilo Time). Admins, managers, and employees review the same work in the web portal, Alyson Pulse, at `app.alyson.ai` under `/dashboard/alyson-pulse/`.

The desktop clock is the live timer. Pulse is the report of record after the app syncs. The company work day uses the workspace timezone (default America/Los_Angeles).

## Who sees what

| Role | Desktop app | Web portal |
|------|-------------|------------|
| Employee | Full tracking menu | You (My Dashboard, My Reports, My Screenshots) plus FAQ and Download Agent |
| Team lead | Same app | Team Management for their own roster, then You and help |
| Manager | Same app | Team Management and Project Management, then You and help. No team hour reports and no hour changes |
| Admin | Same app | Manage, Reports, Workspace Settings, You, and help |
| Access grant | Same app | You, then Assigned: Team time, People, Activity, Team screenshots |
| Super-admin | Same app | Companies and AWS Costs, plus You and help. After they pick a company, the full admin menu for that company |

A company admin never sees another company’s roster or reports.

---

## Desktop app

macOS 11+ (Apple Silicon and Intel) and Windows 10/11. The same password works in the app and on the web. Credentials stay in the OS keychain. The app does not use the microphone, camera, or system audio. Screenshots are still images, not video.

### Sign-in and account

- Company (defaults to Revcloud), email, password with show/hide, and Sign In
- Forgot password emails a reset code
- An invited user with a temporary password is asked to set a permanent one
- A signed-in user who still knows the current password changes it from the sidebar
- Permission panel: Screen capture status, Accessibility / input status, Refresh status, Request access, and shortcuts into system settings

### Window and navigation

- Sidebar brand: Tavilo Time, subtitle “Time tracking”, and the installed version
- Light and dark theme
- Page title changes with the selected page

**Always visible**

- Time Tracker
- Tavilo Coach
- Dashboard — opens the Pulse web portal in the browser
- Screenshots
- FAQ
- Report an issue
- App Updates

**Sidebar footer**

- Privacy shortcuts when the OS needs them: Screen Recording, Accessibility, Automation
- Light / Dark
- Copy Logs
- Change Password
- Logout

### Time Tracker

Home screen. Header shows avatar, “Welcome back, {name}”, and email.

**Timer**

- Project dropdown. Start stays disabled until a project is chosen
- Big clock of tracked time today
- Status line
- Effective and Non-effective under the clock
- Start and Stop

Start checks permissions, closes any other open session on this computer, and begins a session. Stop ends it at now. Closing the window does not stop the timer. Sleep or closing the laptop lid does. Screen lock alone does not.

**This Month at a Glance**

- Previous month, month name, next month, Refresh
- Total Tracked, Non-effective, Effective, Avg Effective / Day
- Daily Activity bars of effective hours
- Weekly Breakdown, Sunday–Saturday
- Top Projects
- Recent Sessions

**Recent Screenshots**

- Previous day, date, next day, Refresh
- Thumbnail grid for that company work day

### Tavilo Coach

Personal coach for the signed-in user only. It cannot see other employees. Opening the page loads a month-to-date summary.

- Day navigation and Refresh
- Today chips: Hours worked, Effective, Non-effective, Idle, Low activity, Screenshots
- Pace cards for this week and this month (7 hours times completed weekdays; week expectation against 35 hours)
- Chat with a 500-character box and Send
- Suggested prompts: Summarize my day, Effective breakdown, Screenshot analysis, Suggestions, Reduce non-effective, Month so far, Week pacing
- Collapsed hours briefing: Recorded time, Effective / non-effective, Screenshot vision, Coaching tips

Numbers come from Pulse after sync, not from the live tray clock.

### Screenshots (your own)

- Date for the company work day, previous and next
- Activity Level: All, High (70%+), Medium (10–70%), Low (0–10%)
- Show count: 20, 50, 100, or 200
- Gallery. A shot opens full-screen with capture details

### FAQ

- How do I change my password?
- How does the app track my time?
- How do screenshots work?
- How often are screenshots taken?
- Does the app record audio or the microphone? (No.)
- What permissions does the app need?
- How do I grant permissions?
- What is AI analysis?
- What is Tavilo Coach?
- macOS blocked Tavilo Time — how to choose Open Anyway
- How do I report a problem?

### Report an issue

- Category: time tracking, screenshots, sign-in, permissions, app update, or something else
- Description, up to 4,000 characters
- Optional recent diagnostic logs. Screenshots are not attached
- Send report. Company admins see it in Pulse under Issue Reports, and get an email when mail is configured
- The tray menu opens the same page

### App Updates

- Installed version and Check for updates
- Download progress, Download update, Install and restart, Download installer
- Sidebar badge when an update is waiting
- Installing restarts the app. A running timer is stopped and saved first
- A required newer release can block the app until it is updated
- macOS replaces the app in place so Screen Recording and Accessibility survive. Windows installs silently

### Tracking behavior (runs while the timer is on)

- **Tray.** Live clock, start, and stop. On macOS the tray is a one-second clock while tracking
- **Idle log.** After about 60 seconds with no keyboard or mouse, idle is recorded. That log does not change the clock by itself
- **Idle prompt.** After 10 minutes with no input, for about 60 seconds:
  - I’m working, or any input: keep tracking, no time removed
  - On break: stop now, no time removed
  - No answer after the prompt was shown: stop and remove exactly 10 minutes
  - If the prompt cannot be shown: no stop and no cut
- **Screenshots.** Random captures inside a window from workspace settings (default 2 shots in 10 minutes). Each shot stores an activity percent from clicks, keystrokes, and mouse movement
- **Apps.** Foreground app and window title
- **Websites.** Browser URL capture on Mac and Windows
- **Offline.** If the network is down, time, screenshots, apps, URLs, and idle stay on the computer and upload when the connection returns. Time records are not discarded
- **Sleep / lid close.** Stops tracking and closes the session
- **Crash / relaunch.** Recovers the open session from a local checkpoint and the server

### Built, but hidden from employees

A Monitoring section and a Developer Tools section exist in the app and start hidden. They are not in the employee sidebar.

- Today’s Activity History — active time, idle, screenshot count, apps, clicks, keystrokes, mouse movements, URLs, a midnight-to-midnight timeline, today’s gallery, and an event log
- App History — apps today, active time, switches, productivity percent, search, category filter, top apps
- URL Browsing History — search, browser, time of day, today / 7 days / 30 days, URL list and totals
- Screenshot Activity Monitor — live clicks, keystrokes, and mouse moves, countdown to the next shot, activity since the last shot
- Feature Status — live proof that clicks, moves, keystrokes, screenshots, and app tracking are running
- Developer Console — platform, memory, diagnostic log export, console filtered by info, warning, or error

An unused in-app dashboard shell and an empty “My Reports” placeholder also exist. Neither is in the sidebar. The Dashboard menu item opens the web portal.

---

## Web portal — Manage

### Dashboard

Org snapshot for a day, week, or month, with previous, next, and a jump back to the current period.

- Online now
- Day, week, or month tracked
- Daily average
- Team activity
- Team hours chart (effective versus idle / low activity)
- Top 5 people
- Project time mix
- Table: employee, hours, live status (tracking now or not)
- CSV export

### Team Management

Team leads see this as **My Team**.

- **Teams.** Lead, role, status, country, department, team size. A lead’s people can be moved to another lead
- **All employees.** Name, role, country, status (Active, Invited, Inactive), hours this week. Search, CSV, edit, assign projects, remove
- **Invited — never signed in.** Resend invite sends a new temporary password and email
- **Inactive employees.** When they were removed, and Activate
- **Add user.** Name, email, role (employee, team leader, manager, admin), manager, department, country, start date
- **Edit employee.** Same fields as the invite
- **Set country.** Bulk-set country for people who do not have one. Public holidays credit by country
- **Remove.** Soft-pause. If they manage other people, those people are reassigned first

### Project Management

Projects the desktop timer can attach a session to.

- List, create, rename, delete
- Assign people, or remove them from a project

### Access Grants

Admins give a non-admin visibility to named employees.

- Search
- Grant access: who receives it, and which employees they may see
- Edit or revoke
- That person then sees Team time, People, Activity, and Team screenshots for those employees only

### Daily Check-in

“Did people start?” for yesterday and the selected day. Auto-refreshes every minute when the selected day is today. Search, previous day, next day, Today.

Cards: Not logged yesterday, Not logged the selected day, Needs follow-up, Under the daily hours goal, Logged on the selected day, Team size.

Tables list the people in each bucket, with hours and whether a timer is running with no completed hours yet. CSV export.

### Leave

People Ops inbox plus a holiday calendar. Approved leave and holidays credit into Pacing and Email Reporting at 7 hours per weekday. Half-days credit 0.5 day.

- Scan period: 7 days, 30 days, 90 days, 6 months, 12 months, 24 months
- Scan, Refresh, Add holiday, Record personal leave
- **All emails.** Status: pending, approved, rejected, unmatched, duplicate, not leave, extraction failed. Assign an unmatched email, approve, or reject
- **Leave emails.** The same inbox filtered to leave requests. A cancellation voids the matching leave when it can be matched
- **Holidays.** Public holidays by country. Add or void. A holiday already credited for that country and those dates is not added twice
- Recruitment, meeting, payroll, and FYI mail is marked not leave

### Pacing

Whether each person is on pace for the week or the month. Weekly and monthly views. Older weekly and monthly URLs open this same page.

Columns: name, logged hours, leave credit, worked (logged plus leave), target, average per day, projected, delta versus target, weekdays left, progress, status.

Statuses: target met, on track, behind, at risk, critical.

- Weekly target is 35 hours. Monthly target is weekdays times 7 hours
- Filter by status
- CSV export
- Select rows and send a pacing email to the configured HR addresses, with a CSV attached. Employees do not receive it

This digest is separate from Email Reporting.

---

## Web portal — Reports

Admins see all of these. An access grant sees Team Time, Employee Detail, Activity, and Screenshots for assigned people only.

### Team Time Report

Employee-by-day grid for a day, week, or month.

- Employees in the roster, team total hours, count of weekdays under the daily goal (default 7 hours), employees to review
- Team hours chart and top employees
- Grid: each cell is tracked time, drawn as effective versus idle or low activity. Short days are marked
- CSV export
- Admins open a cell and add or remove time for that person on that work day. The adjustment stays on the record. The day cannot go below zero

### Employee Detail

Labeled **People** for someone with an access grant. One employee, one period.

- Tracked, non-effective, effective, and weekdays under the daily goal
- Project time chart
- Daily breakdown, with the same add/remove time control
- Sessions: date, start, end, hours, project
- Apps: application, window title, started, duration
- Websites: site, page, URL, browser, captured, duration
- Idle: start, end, duration, notes
- Screenshots for that person, with the AI notes on each image

### Activity Report

Week by week. Three tabs. The AI insights URL opens this report.

**Input counts**

- Employees, team screenshots, team mouse clicks, team total inputs
- Per person: screenshots, mouse clicks, keystrokes, cursor movements, total inputs, average activity percent, manager
- Sort any column. CSV export

**Engagement scores**

- How engagement is measured (inputs per minute)
- Employees tracked, team average, needs attention, high performers
- Per person: score, high / moderate / low, trend, days tracked, daily breakdown
- CSV export

**AI insights**

- Screenshots analyzed, pending analysis, distraction flags, analysis failed
- Per person: analyzed count, top activity type, latest insight, productive count, distraction count
- Latest insight: what was on screen, a coaching tip, and tags for activity type, productive / neutral / distraction, and on task / mixed / off task / idle
- CSV export

### Screenshots

Admins see every employee. An access grant sees **Team screenshots** for assigned people. **My Screenshots** is the same gallery for yourself.

- Person picker (hidden on My Screenshots)
- Day, week, or month
- Filter: all, low productivity, distractions only, idle / low activity
- Sort: newest, least productive, lowest activity
- Export CSV
- Each card: who, checkbox, thumbnail, time, activity percent, tags, and the AI panel
- Tags: Distraction, Low activity (activity at or under 30 percent), Duplicate. A video meeting is not tagged as distraction or low activity
- AI panel: activity type, category, on-task status, confidence, distraction score, “In this frame”, and a coaching tip. Otherwise “AI analysis in progress…”
- Delete one image, or select the page and delete several. Delete removes the image and subtracts that interval from tracked hours. It cannot be undone
- CSV columns: employee, captured at, activity percent, category, AI status, activity type, description, feedback, image URL (up to 5,000 rows)
- Images are private and load with short-lived links. Captures older than 90 days are removed by a daily job

### Email Reporting

Admins notify people who are under hours. Nothing sends on a timer. An admin selects people and clicks send.

**Monthly pacing.** Month, and “as of” week (week 1 needs 35 hours month-to-date, week 2 needs 70, and so on). People under that cumulative target, with hours, target, pace percent, shortfall, and effective time. Select all or pick individuals. CSV.

**Weekly pacing.** Month, week (Monday–Friday only), and a week target from 1 to 40 hours (default 40). Hours, effective, and non-effective. Select all and CSV.

**Daily check.** One work day (defaults to today) and a daily target from 1 to 8 hours (default 8). Select all and CSV.

**Send bar**

- Send from an address on the allowed sender list
- CC managers, on by default
- The employee is the recipient. Ops is always copied. The manager is copied only when that switch is on
- Subjects: Daily Hours Update, Weekly Hours Update, or Weekly Hours Pacing Update. Manager copy uses Team hours, Team weekly hours, or Team hours pacing
- The mail includes a day-by-day table: total tracked, non-effective, effective, the daily target, and behind or on track
- The note says approved leave is already included, payroll uses effective hours, and low activity during meetings is not counted

**Send history.** Employee, type (pace, weekly, or daily), period, hours, target, status, sent time. CSV export.

### Issue Reports

Problems employees sent from the desktop app.

- Refresh
- Table: when, from (name and email), category, summary
- Expand a row for the full message, app version, platform, OS summary, and diagnostic logs when the employee included them
- Categories: time tracking, screenshots, sign-in or password, permissions, app update, something else

---

## Web portal — Settings

### Companies

Super-admins only.

- List of Pulse companies, and switch into one
- Add company: create a new one, or enable Pulse on a workspace that already exists in Palisade
- After a company is selected, the rest of the admin menu is that company’s data

### Workspace Settings

Admins, for their own company.

- Company name
- Company timezone. Reports and “today” use this zone
- Hours threshold (default 7). Daily goal on reports and the low-hours flags
- High activity percent (default 60)
- Low activity percent (default 10, and reports do not use a cutoff above 10)
- Screenshots per window (1–8, default 2)
- Window length in minutes (5–120, default 10)

### AWS Costs

Super-admins only. Alyson PM infrastructure spend, split across people by hours worked. Not a customer invoice.

- Period total, cost per user, cost per hour
- Resource count and the resource breakdown
- If the current month is not published yet, the latest available month is shown

---

## Web portal — You

Every signed-in user. Same hour math as the team reports, limited to yourself.

### My Dashboard

Day, week, or month.

- Tracked, non-effective, effective
- How many days in the period were under the daily goal
- Hours chart for the period
- Hours by project
- Top apps and top websites
- On the current day, an hourly chart of today

### My Reports

Your version of Employee Detail.

- Tracked, non-effective, effective, days under the goal
- Daily breakdown
- Sessions, apps, websites, and idle
- CSV export

### My Screenshots

The screenshot gallery, scoped to you. You can review captures and AI notes. You cannot delete other people’s images from here.

---

## Web portal — Help

### FAQ

- How does the app track my time?
- How do screenshots work?
- What permissions does the Mac agent need?
- What permissions does the Windows agent need?
- Permissions look granted but tracking still fails
- Does the app record audio? (No.)

### Download Agent

Current version, then three downloads from GitHub Releases:

- macOS Apple Silicon (macOS 11+)
- macOS Intel
- Windows 10+

---

## Screenshot AI

Each capture can be analyzed after upload. The worker reads the text on the image, then writes a result from that text plus the app and window title. The picture is not sent to the model. Failed shots retry up to three times.

| What you see | Meaning |
|--------------|---------|
| In this frame | What the person was doing |
| Coaching tip | A short note. Distraction is mentioned only when the frame shows it |
| Activity type | Development, communication, email, document, design, research, social, gaming, shopping, media, advertising, networking, music, or general |
| Category | Productive, neutral, or distraction |
| Frame status | On task, mixed, off task, or idle |
| Scores | Confidence and distraction, each 0–100 |
| Status | Pending, queued, processing, completed, failed, or skipped |

Google Meet, Zoom, Teams, Webex, and Skype frames are treated as on-task work. That result shows on Activity Report → AI insights, every screenshot card, Employee Detail, the screenshot CSV, and Tavilo Coach.

---

## How hours are calculated

1. Sessions that overlap the company work day are clipped to that day and overlaps are merged
2. An authorized 10-minute idle cut and any deleted screenshot interval are subtracted
3. Admin add/remove adjustments are applied. The result cannot go below zero. That is **tracked**
4. **Idle** is the idle log for the day
5. **Low activity** is time covered by screenshots under the low-activity cutoff, excluding video meetings
6. **Non-effective** is idle plus low activity, and it cannot exceed tracked
7. **Effective** is tracked minus non-effective

The Effective / Non-effective pair on the desktop timer is a local estimate. It does not apply the meeting rule. Portal numbers are the ones used in reviews, emails, and pacing.

---

## Mail the product can send

| Mail | Who sends it | Who receives it |
|------|----------------|-----------------|
| Invite and resend invite | Team Management | The new user |
| Account activated | After the user sets a password | That user |
| Password reset | Desktop sign-in or Change Password | That user |
| Daily, weekly, or monthly hours update | Email Reporting, manual send | The employee. Ops is always copied. The manager is copied if the switch is on |
| Pacing digest | Pacing page, manual send | HR addresses only, with a CSV |
| Issue report notice | When an employee sends a report | Company admins, when mail is configured |

No hours email goes out on a schedule. Leave is an inbox the admin scans, not an outbound report.
