# Alyson Time Doctor

What the desktop app and the Pulse web portal show.

Employees clock in with the desktop app (**Alyson PM**, window title **Tavilo Time**). Admins, managers, and employees review the same work in **Alyson Pulse** at `app.alyson.ai`, under `/dashboard/alyson-pulse/`.

The company work day uses the workspace timezone (default America/Los_Angeles). Pulse is the report of record after the desktop app syncs. The desktop clock is the live timer.

---

# Desktop app

macOS 11+ (Apple Silicon and Intel) and Windows 10/11. The same password works here and on the web portal. Credentials stay in the OS keychain.

## Window

- Sidebar brand: Tavilo Time, subtitle “Time tracking”, and the installed version
- Light and dark theme
- Page title in the main area changes with the selected page

**Tracking menu (always visible)**

| Item | What it opens |
|------|----------------|
| Time Tracker | Timer, month glance, recent screenshots |
| Tavilo Coach | Personal hours briefing and chat |
| Dashboard | The Pulse web portal in the browser (`https://app.alyson.ai`) |
| Screenshots | Your captures for one work day |
| FAQ | In-app help |
| App Updates | Check, download, and install |

**Sidebar footer**

- Privacy shortcuts, when the OS needs them: Screen Recording, Accessibility, Automation
- Light / Dark
- Copy Logs (diagnostic text for IT)
- Change Password
- Logout

A Monitoring section and a Developer Tools section exist in the app but start hidden. Employees do not see them. They are listed at the end of this desktop section.

## Sign-in

- Company (defaults to Revcloud)
- Email
- Password, with show/hide
- Sign In
- Forgot password? — emails a reset code
- Permission panel before or beside sign-in: Screen capture status, Accessibility / input status, Refresh status, Request access, and shortcuts into system settings
- An invited user with a temporary password is asked to set a permanent one
- A signed-in user who still knows the current password changes it from the sidebar

## Time Tracker

This is the home screen.

**Header.** Avatar, “Welcome back, {name}”, email.

**Timer**

- Project dropdown. Start stays disabled until a project is chosen. The label then reads “Ready to track: {project}”
- Big clock: tracked time today (`00:00:00`)
- Status line (for example “Select a project to start tracking”)
- Two figures under the clock: Effective and Non-effective
- Start and Stop

Start checks permissions, closes any other open session on this computer, and begins a session. Stop ends it at now. Closing the window does not stop the timer. Sleep or closing the laptop lid does. Screen lock alone does not.

**This Month at a Glance**

- Previous month, month name, next month (next is disabled on the current month), Refresh
- Empty state when nothing was tracked
- Four numbers: Total Tracked, Non-effective, Effective, Avg Effective / Day
- Daily Activity: one bar per day of effective hours. Hover shows effective versus tracked
- Weekly Breakdown: Sunday–Saturday, including days that spill into the neighboring month
- Top Projects
- Recent Sessions

**Recent Screenshots**

- Previous day, date, next day, Refresh
- “Your latest captured screenshots · Company work day”
- Empty state: “No screenshots captured yet today”
- Thumbnail grid for that work day

## Tavilo Coach

Personal coach for the signed-in user only. It cannot see other employees. Opening the page loads a month-to-date summary as the first chat message.

**Header.** “Tavilo Coach”, “Work coach · your recorded time”, previous day, the day label, next day, Refresh.

**Today chips.** Hours worked, Effective, Non-effective, Idle, Low activity, Screenshots.

**Pace cards.** This week (effective of expected) and This month (effective of expected). Week expectation is 7 hours times completed weekdays, against 35 hours. Month expectation is 7 hours times weekdays.

**Chat.** Suggested prompts, then a message box (500 characters) and Send.

Suggested prompts:

- Summarize my day
- Effective breakdown
- Screenshot analysis
- Suggestions
- Reduce non-effective
- Month so far
- Week pacing

**Hours briefing** (collapsed until opened): Recorded time, Effective / non-effective, Screenshot vision, Coaching tips.

Numbers come from Pulse after sync, not from the live tray clock and not from the HR pacing email.

## Screenshots

Your own captures.

- Date for the company work day, with previous and next
- Activity Level: All, High (70%+), Medium (10–70%), Low (0–10%)
- Show count: 20, 50, 100, or 200
- Refresh
- Gallery. Clicking a shot opens a full-screen preview with Back to screenshots and the capture details

## FAQ

- How do I change my password?
- How does the app track my time?
- How do screenshots work?
- How often are screenshots taken?
- Does the app record audio or the microphone? (No.)
- What permissions does the app need?
- How do I grant permissions?
- What is AI analysis?
- What is Tavilo Coach?
- macOS blocked Tavilo Time (not from an identified developer) — how to choose Open Anyway

## App Updates

- Installed version
- Check for updates
- Status, download progress, Download update, Install and restart, Download installer
- A badge on the sidebar item when an update is waiting
- Installing restarts the app. A running timer is stopped and saved first
- A required newer release can block the app until it is updated
- macOS replaces the app in place so Screen Recording and Accessibility survive. Windows installs silently

## Menu bar, idle prompt, and permissions

**Tray.** Live clock, start, and stop. On macOS the tray is the smooth one-second clock while tracking.

**Idle prompt**, after 10 minutes with no keyboard or mouse, for about 60 seconds:

- I’m working, or any input: keep tracking, no time removed
- On break: stop now, no time removed
- No answer after the prompt was shown: stop and remove exactly 10 minutes
- If the prompt cannot be shown: no stop and no cut

Idle is also logged after about 60 seconds of no input. That log does not change the clock by itself.

**Permissions.** macOS needs Screen Recording and Accessibility. Windows may ask for screen capture. The app does not use the microphone, camera, or system audio. Screenshots are still images, not a video recording.

**Offline.** If the network is down, time, screenshots, apps, URLs, and idle stay on the computer and upload when the connection returns. Time records are not discarded.

## Hidden screens

These load in the app but the Monitoring and Developer Tools menus are hidden when the app starts. They are not part of the employee sidebar.

| Screen | What it would show |
|--------|--------------------|
| Today’s Activity History | Active time, idle time, screenshot count, apps used, clicks, keystrokes, mouse movements, URLs visited, a midnight-to-midnight timeline, today’s screenshot gallery, and a time / type / details / status log |
| App History | Apps today, active time, switches, productivity percent, search, category filter (development, productivity, communication, browser, entertainment, system, other), top apps, and the history list |
| URL Browsing History | Search, browser, time of day, today / 7 days / 30 days, a URL list, and totals for URLs, domains, browsers, and time spent |
| Screenshot Activity Monitor | Live clicks, keystrokes, and mouse moves per minute, countdown to the next screenshot, activity since the last shot, and the recent capture list |
| Feature Status | Live proof that clicks, moves, keystrokes, screenshots, and app tracking are running |
| Developer Console | Platform, memory, export of diagnostic logs, and a console viewer filtered by info, warning, or error |

There is also an unused in-app dashboard shell (today’s effective time, current session, this week, this month) and an empty “My Reports” placeholder. Neither is in the sidebar. The Dashboard menu item opens the web portal instead.

---

# Web portal (Alyson Pulse)

Left navigation depends on role.

| Role | What they see |
|------|----------------|
| Employee | You (My Dashboard, My Reports, My Screenshots) plus FAQ and Download Agent |
| Team lead | Team Management for their own roster, then the same You and help pages |
| Manager | Team Management and Project Management, then You and help. No team hour reports and no hour changes |
| Admin | Manage, Reports, Settings (workspace only), You, and help |
| Access grant | You, then Assigned: Team time, People, Activity, Team screenshots. No Manage pages |
| Super-admin | Companies and AWS Costs, plus You and help. After they pick a company, the full admin menu for that company |

A company admin never sees another company’s roster or reports.

Sections below use the names in the left nav.

## Manage

### Dashboard

Org snapshot. Day, week, or month, with previous, next, and a jump back to the current period.

- Online now
- Day, week, or month tracked
- Daily average
- Team activity
- Team hours chart (effective versus idle / low activity)
- Top 5 people for the period
- Project time mix
- Table: employee, hours, live status (tracking now or not). CSV export

### Team Management

Team leads see this as **My Team**.

**Teams.** Lead, role, status, country, department, team size. A lead’s people can be moved to another lead.

**All employees.** Name, role, country, status (Active, Invited, Inactive), hours this week. Search and CSV. Row actions: edit, assign projects, remove.

**Invited — never signed in.** Same roster fields, plus Resend invite (new temporary password and email).

**Inactive employees.** Name, role, country, when they were removed, status, and Activate.

**Add user.** Name, email, role (employee, team leader, manager, admin), manager, department, country, start date.

**Edit employee.** Same fields as the invite.

**Set country.** Bulk-set country for people who do not have one. Public holidays credit by country.

**Remove.** Soft-pause. If they manage other people, those people are reassigned first.

### Project Management

Projects the desktop timer can attach a session to.

- List of projects
- New project and rename
- Delete
- Assign people, or remove them from a project

### Access Grants

Admins give a non-admin visibility to named employees.

- Search
- Grant access: who receives it, and which employees they may see
- Edit or revoke
- That person then sees Team time, People, Activity, and Team screenshots for those employees only

### Daily Check-in

“Did people start?” for yesterday and the selected day. Auto-refreshes every minute when the selected day is today. Search, previous day, next day, Today.

Cards:

- Not logged yesterday
- Not logged the selected day
- Needs follow-up (missed either day)
- Under the daily hours goal
- Logged on the selected day
- Team size

Tables list the people in each bucket, with hours and whether a timer is running with no completed hours yet. CSV export. A running timer with no finished session is called out so a person who just clocked in is not treated as absent.

### Leave

People Ops inbox plus a holiday calendar. Credits flow into Pacing and Email Reporting at 7 hours per weekday.

**Toolbar.** Scan period (7 days, 30 days, 90 days, 6 months, 12 months, 24 months; default 30 days), Scan, Refresh, Add holiday, Record personal leave.

**All emails.** Everything the scan pulled, with status: pending, approved, rejected, unmatched, duplicate, not leave, extraction failed. Assign an unmatched email to a person, approve, or reject.

**Leave emails.** The same inbox filtered to leave requests. Half-days credit 0.5 day. A cancellation voids the matching leave when it can be matched.

**Holidays.** Public holidays by country. Add or void. A holiday already credited for that country and those dates is not added twice.

Approved leave and holidays are what Pacing and the hours emails count. Recruitment, meeting, payroll, and FYI mail is marked not leave.

### Pacing

Whether each person is on pace for the week or the month. Weekly and monthly views.

Columns: name, logged hours, leave credit, worked (logged plus leave), target, average per day, projected, delta versus target, weekdays left, progress, status.

Statuses: target met, on track, behind, at risk, critical.

- Weekly target is 35 hours. Monthly target is weekdays times 7 hours
- Filter by status
- CSV export
- Select rows and send a pacing email. It goes to the configured HR addresses with a CSV attached. Employees do not receive it

This digest is separate from Email Reporting.

## Reports

Admins see all of these. An access grant sees Team Time, Employee Detail, Activity, and Screenshots for assigned people only. These pages do not send mail by themselves.

### Team Time Report

Employee-by-day grid for a day, week, or month.

- Employees in the roster
- Team total hours
- Count of weekdays under the daily goal (default 7 hours)
- Employees to review
- Team hours chart and top employees
- Grid: each cell is tracked time, drawn as effective (green) versus idle or low activity (red). Short days are marked
- CSV export
- Admins open a cell and add or remove time for that person on that work day. The adjustment is kept on the record. The day cannot go below zero

### Employee Detail

Labeled **People** for someone with an access grant. One employee, one period.

- Tracked, non-effective, effective, and weekdays under the daily goal
- Project time chart
- Daily breakdown, with the same add/remove time control admins have on Team Time
- Activity logs:
  - Sessions: date, start, end, hours, project
  - Apps: application, window title, started, duration
  - Websites: site, page, URL, browser, captured, duration
  - Idle: start, end, duration, notes
  - Screenshots for that person, with the AI notes on each image

### Activity Report

Week by week. Three tabs. `/alyson-pulse/ai-insights` opens this report.

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
- The latest insight is what was on screen, a coaching tip, and tags for activity type, productive / neutral / distraction, and on task / mixed / off task / idle
- CSV export
- “No AI insights for this week yet” when analysis has not finished

### Screenshots

Admins see every employee. An access grant sees **Team screenshots** for assigned people only. **My Screenshots** is the same gallery for yourself.

- Person picker (hidden on My Screenshots)
- Day, week, or month
- Filter: all, low productivity, distractions only, idle / low activity
- Sort: newest, least productive, lowest activity
- Export CSV
- Each card: who (omitted on your own page), checkbox, thumbnail, time, activity percent, tags, and the AI panel
- Tags: Distraction, Low activity (activity at or under 30 percent), Duplicate. A video meeting is not tagged as distraction or low activity
- AI panel when analysis is done: activity type, category, on-task status, confidence, distraction score, “In this frame”, and a coaching tip. Otherwise “AI analysis in progress…”
- Delete one image, or select the page and delete several. Delete removes the image and subtracts that interval from tracked hours. It cannot be undone
- CSV columns: employee, captured at, activity percent, category, AI status, activity type, description, feedback, image URL (up to 5,000 rows)
- Images are private. The page loads them with short-lived links. Captures older than 90 days are removed by a daily job

### Email Reporting

Admins notify people who are under hours. Nothing sends on a timer. An admin selects people and clicks send.

Work days use the company timezone. The page subtitle states the three rules: monthly pacing is month-to-date (35, then 70, then 105 hours), weekly pacing is only that Monday–Friday (default under 40), and the daily check is one work day.

**Monthly pacing**

- Month, and “as of” week (week 1 needs 35 hours month-to-date, week 2 needs 70, and so on)
- People under that cumulative target, with hours, target, pace percent, shortfall, and effective time
- Select all, or pick individuals
- CSV

**Weekly pacing**

- Month, week (Monday–Friday only), and a week target from 1 to 40 hours (default 40)
- People under that week’s target, with hours, effective, and non-effective
- Select all and CSV

**Daily check**

- One work day (defaults to today) and a daily target from 1 to 8 hours (default 8)
- People under that target
- Select all and CSV

**Send bar** (first three tabs)

- Send from an address on the allowed sender list
- CC managers, on by default
- Send to the selected people
- The employee is the recipient. Ops is always copied. The manager is copied only when that switch is on

What the email contains:

- Employee subjects: Daily Hours Update, Weekly Hours Update, or Weekly Hours Pacing Update
- Manager copy uses Team hours, Team weekly hours, or Team hours pacing, and names the employee
- A day-by-day table: total tracked, non-effective, effective, the daily target, and behind or on track
- Monthly mail covers the month through that week. Weekly mail is only that Monday–Friday. Daily mail is that one day
- The note says approved leave is already included, payroll uses effective hours, and low activity during meetings is not counted

**Send history.** Employee, type (pace, weekly, or daily), period, hours, target, status, sent time. CSV export.

## Settings

### Companies

Super-admins only.

- List of Pulse companies, and switch into one
- Add company: create a new one, or enable Pulse on a workspace that already exists in Palisade
- After a company is selected, the rest of the admin menu is that company’s data

### Workspace Settings

Admins, for their own company.

- Company name
- Company timezone. Reports and “today” use this zone
- Hours threshold (default 7). This is the daily goal on reports and the low-hours flags
- High activity percent (default 60)
- Low activity percent (default 10, and reports do not use a cutoff above 10)
- Screenshots per window (1–8, default 2)
- Window length in minutes (5–120, default 10). Example: 3 screenshots at random times inside 20 minutes

### AWS Costs

Super-admins only. Alyson PM infrastructure spend, split across people by hours worked. Not a customer invoice.

- Period total
- Cost per user
- Cost per hour
- Resource count and the resource breakdown
- If the current month is not published yet, the latest available month is shown

## You

Every signed-in user. Same hour math as the team reports, limited to yourself.

### My Dashboard

Day, week, or month.

- Tracked, non-effective, effective
- How many days in the period were under the daily goal
- Color key for the daily chart
- Hours chart for the period
- Hours by project
- Top apps and top websites
- On the current day, an hourly chart of today

### My Reports

Your version of Employee Detail.

- Same four totals: tracked, non-effective, effective, days under the goal
- Daily breakdown
- Sessions, apps, websites, and idle for the period
- CSV export

### My Screenshots

The screenshot gallery above, scoped to you. You can review captures and AI notes. You cannot delete other people’s images from here.

## Help

### FAQ

- How does the app track my time?
- How do screenshots work?
- What permissions does the Mac agent need?
- What permissions does the Windows agent need?
- Permissions look granted but tracking still fails
- Does the app record audio? (No.)

### Download Agent

Current version, then three downloads:

- macOS Apple Silicon (macOS 11+)
- macOS Intel
- Windows 10+

Files come from GitHub Releases.

---

# What the screenshots’ AI writes

Each capture can be analyzed after upload. The worker reads the text on the image, then writes a result from that text plus the app and window title. The picture is not sent to the model. New shots are queued on their own. Older shots are retried in the background. Failed shots retry up to three times. A shot with no usable image is skipped.

| What you see | Meaning |
|--------------|---------|
| In this frame | What the person was doing |
| Coaching tip | A short note. Distraction is mentioned only when the frame shows it |
| Activity type | Development, communication, email, document, design, research, social, gaming, shopping, media, advertising, networking, music, or general |
| Category | Productive, neutral, or distraction |
| Frame status | On task, mixed, off task, or idle |
| Scores | Confidence and distraction, each 0–100 |
| Status | Pending, queued, processing, completed, failed, or skipped |

Google Meet, Zoom, Teams, Webex, and Skype frames are treated as on-task work: productive, distraction score 0.

That result is what you see on Activity Report → AI insights, on every screenshot card, on Employee Detail, in the screenshot CSV, and in Tavilo Coach when you ask what was on screen.

---

# How the hours on screen are calculated

1. Sessions that overlap the company work day are clipped to that day and overlaps are merged
2. An authorized 10-minute idle cut and any deleted screenshot interval are subtracted
3. Admin add/remove adjustments for that person and day are applied. The result cannot go below zero. That is **tracked**
4. **Idle** is the idle log for the day
5. **Low activity** is time covered by screenshots under the low-activity cutoff, excluding video meetings
6. **Non-effective** is idle plus low activity, and it cannot exceed tracked
7. **Effective** is tracked minus non-effective

The Effective / Non-effective pair on the desktop timer is a local estimate. It does not apply the meeting rule. The portal numbers are the ones used in reviews, emails, and pacing.

---

# Mail the product can send

| Mail | Who sends it | Who receives it |
|------|----------------|-----------------|
| Invite and resend invite | Team Management | The new user |
| Password reset | Desktop sign-in or Change Password | That user |
| Daily, weekly, or monthly hours update | Email Reporting, manual send | The employee. Ops is always copied. The manager is copied if the switch is on |
| Pacing digest | Pacing page, manual send | HR addresses only, with a CSV. Not the employees |
| Leave is not an outbound report | Admins scan an existing inbox | — |

No hours email goes out on a schedule.
