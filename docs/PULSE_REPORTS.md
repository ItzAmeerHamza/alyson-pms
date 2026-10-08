# Pulse reports

Alyson Pulse is the web app where time tracking is reviewed after the desktop agent syncs. This catalog lists every report in Pulse, using the names you see in the left nav.

Hours use the company work calendar (default Pacific). **Tracked** is time on the clock. **Effective** is tracked time minus idle and low keyboard/mouse activity. **Non-effective** is that idle and low-activity time.

Most team reports let you pick a day, week, or month and export a CSV.

Nothing is emailed on a schedule. An admin must open the page and click send. Invite mail from Team Management is not a report.

### Email vs platform

| Report | Where you see it | Emailed? |
|--------|------------------|----------|
| Team Time Report | Pulse only | No |
| Employee Detail | Pulse only | No |
| Activity Report | Pulse only | No |
| Screenshots | Pulse only | No |
| Dashboard | Pulse only | No |
| Daily Check-in | Pulse only | No |
| Email Reporting | Pulse, and can send mail | **Yes** — to the employee (ops always CC’d; manager optional) |
| Pacing | Pulse, and can send mail | **Yes** — HR digest only, not to employees |
| My Dashboard | Pulse only | No |
| My Reports | Pulse only | No |
| My Screenshots | Pulse only | No |
| AWS Costs | Pulse only | No |

**Email Reporting** sends a hours update for people under target: daily, weekly (Mon–Fri), or month-to-date pace. The employee is To; `alysonclient@cintara.ai` and `mohita@cintara.ai` are always CC’d; the manager is CC’d if you turn that on. Send history stays on the page.

**Pacing** emails a weekly or monthly digest of the people you selected to `hamza@cintara.ai`, `mohita@cintara.ai`, and `alysonclient@cintara.ai`, with a CSV attached. Employees do not receive this digest.

---

## Team reports

Open to company admins. People with an **access grant** can open these four for the employees assigned to them. Delegated viewers see them labeled **Team time**, **People**, **Activity**, and **Team screenshots**.

### Team Time Report

**Delivery:** Pulse only — not emailed.

Shows every employee’s hours in a day-by-day grid for the period you pick. Each cell is tracked time, stacked so you can see effective work (green) versus idle or low keyboard/mouse activity (red). Totals, charts, and a project mix sit above the grid so you can spot who is under the daily goal and who needs a closer look. Admins can add or remove hours for one person on one work day; those adjustments stay on the record.

### Employee Detail

**Delivery:** Pulse only — not emailed.

A full picture of one person for one period. You get daily hours (tracked, effective, and non-effective), then drill into sessions, apps, websites, idle stretches, screenshots, and how time split across projects. Use this when Team Time flags someone and you need to see what they were actually doing. Admins can adjust that person’s hours here the same way as on Team Time.

### Activity Report

**Delivery:** Pulse only — not emailed.

Measures how engaged the team was during the selected week, not just how many hours they logged. **Input counts** totals screenshots, clicks, keystrokes, and mouse movement. **Engagement scores** ranks people as high, moderate, or low based on inputs per minute. **AI insights** summarizes screenshot analysis (what was on screen, activity type, distraction flags) when that pipeline has run.

### Screenshots

**Delivery:** Pulse only — not emailed.

A gallery of screen captures for the team over the selected period. Filter by person, low productivity, distractions, or idle, and sort by newest, least productive, or lowest activity. Open a full image plus its AI notes. Admins can delete a capture; that also removes that capture’s interval from the person’s tracked hours.

---

## Daily operations

Open to company admins. These sit under **Manage**, but they are reports you run every day or week.

### Dashboard

**Delivery:** Pulse only — not emailed.

A snapshot of the whole team for a day, week, or month. It shows who is clocked in right now, total tracked hours, daily average, and overall team activity. Charts cover hours over time, the top five people, and how time split across projects, plus a per-employee table you can export.

### Daily Check-in

**Delivery:** Pulse only — not emailed.

Answers “did people start work?” for yesterday and today. It flags who has not logged at all, who is under the daily hours goal, and who is already tracking (including a timer that is running with no completed hours yet). Refresh happens on a short interval so standup or morning follow-up stays current.

### Email Reporting

**Delivery:** Visible in Pulse, and an admin can email selected people.

Lists people who are under hours so you can notify them. **Monthly pacing** compares month-to-date hours to a rising target (35 / 70 / 105…). **Weekly pacing** looks at that Monday–Friday week only (default under 40 hours). **Daily check** is a single work day. Mail goes to the employee, with ops always CC’d and the manager CC’d if you turn that on. Pick a sender, send, then review **Send history**. All days use the company work timezone.

### Pacing

**Delivery:** Visible in Pulse, and an admin can email an HR digest (not to employees).

Shows whether each person is on track for the week or month, not only for a single day. Statuses are target met, on track, behind, at risk, and critical. Weekly uses a 35-hour week target; monthly uses weekdays × 7 hours. Approved leave and public holidays are credited. Filter by status, export CSV, or email selected rows to the HR addresses (`hamza@`, `mohita@`, `alysonclient@`) with a CSV attached.

---

## Personal reports

Every signed-in Pulse user can open these under **You**. They show only your own data, using the same hour formulas as the team reports.

### My Dashboard

**Delivery:** Pulse only — not emailed.

Your own hours snapshot for a day, week, or month: tracked, effective, and non-effective, plus how many weekdays you were under the daily goal. For today you also get an hourly chart, your top apps and websites, and how time split across projects.

### My Reports

**Delivery:** Pulse only — not emailed.

Your detailed history for the period — the personal version of Employee Detail. It includes a daily hours grid, totals, and logs of sessions, apps, websites, and idle time. Use this to check your own week before a review, or to export a CSV of what you worked.

### My Screenshots

**Delivery:** Pulse only — not emailed.

Your screen captures for the selected period, with the same gallery and AI notes as the team Screenshots report, scoped to you. You can review what was captured on your machine. You cannot delete other people’s captures from this page.

---

## Platform report

### AWS Costs

**Delivery:** Pulse only — not emailed.

Super-admins only. Shows Alyson PM tagged AWS spend for the period, allocated across people by hours worked (period total, cost per user, cost per hour, and resource breakdown). This is internal infrastructure cost, not a customer invoice. If Cost Explorer has not published the current period yet, it shows the latest available month.

---

## Who sees which reports

| Role | Team reports | Daily operations | Personal reports | AWS Costs |
|------|:------------:|:----------------:|:----------------:|:---------:|
| Admin | All | All | Yes | No |
| Access grant (assigned people) | Those four team reports | No | Yes | No |
| Manager / team lead | No | No | Yes | No |
| Employee | No | No | Yes | No |
| Super-admin | After picking a company | After picking a company | Yes | Yes |

Managers invite people and assign projects. They do not open team hour reports. To give a non-admin those reports, an admin uses **Access Grants**.

---

## Related screens (not reports)

These help reports stay accurate, but they are tools rather than reports:

- **Leave** — approve time off and holidays; credited hours show up in Pacing and Email Reporting
- **Team Management** — roster, invites, roles, country (for holiday credit)
- **Project Management** — projects that appear on hours charts
- **Workspace Settings** — timezone, daily hours goal, activity cutoffs, screenshot cadence
- **Access Grants** — who else may open team reports
- **Companies** — super-admins onboard and switch companies
