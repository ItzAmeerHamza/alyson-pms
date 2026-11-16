# Tavilo v3 dataset — EDA

- Relationship rows (company + tool): **2,290**
- Unique companies: **2,213**
- Strong evidence (CURRENT + PROBABLE): **625**
- Companies using 2+ tools: 38

### Companies by status (strongest relationship)

| | Companies | % |
|---|---:|---:|
| POSSIBLE | 946 | 43% |
| DO_NOT_TARGET | 623 | 28% |
| CURRENT | 367 | 17% |
| PROBABLE | 258 | 12% |
| FORMER | 19 | 1% |

### Strong-evidence companies by tool

| | Companies | % |
|---|---:|---:|
| Hubstaff | 101 | 16% |
| Time Doctor | 59 | 9% |
| Clockify | 47 | 8% |
| Toggl Track | 33 | 5% |
| ProHance | 33 | 5% |
| Insightful | 32 | 5% |
| ClickTime | 26 | 4% |
| Harvest | 25 | 4% |
| Time Champ | 24 | 4% |
| DeskTime | 21 | 3% |
| Teramind | 19 | 3% |
| Timely | 17 | 3% |
| ActivTrak | 16 | 3% |
| Prodoscore | 16 | 3% |
| Replicon | 16 | 3% |
| Jibble | 14 | 2% |
| CurrentWare | 12 | 2% |
| Paymo | 11 | 2% |
| Apploye | 10 | 2% |
| Flowace | 10 | 2% |

### Strong-evidence companies by category

| | Companies | % |
|---|---:|---:|
| Employee monitoring / activity tracking | 384 | 61% |
| Time tracking | 241 | 39% |

### Strong-evidence companies by HQ country

| | Companies | % |
|---|---:|---:|
| United States | 333 | 53% |
| India | 54 | 9% |
| United Kingdom | 47 | 8% |
| Australia | 26 | 4% |
| Canada | 21 | 3% |
| (blank) | 15 | 2% |
| Netherlands | 10 | 2% |
| Poland | 10 | 2% |
| Philippines | 7 | 1% |
| South Africa | 5 | 1% |
| Switzerland | 5 | 1% |
| Brazil | 5 | 1% |
| Uruguay | 4 | 1% |
| Pakistan | 4 | 1% |
| Spain | 4 | 1% |

### Strong-evidence companies by employee count

| Band | Companies | % |
|---|---:|---:|
| 1–9 | 42 | 7% |
| 10–24 | 75 | 12% |
| 25–99 | 124 | 20% |
| 100–499 | 116 | 19% |
| 500–2,500 | 56 | 9% |
| 2,501–10,000 | 12 | 2% |
| 10,000+ | 7 | 1% |
| unknown | 193 | 31% |

In Tavilo's 25–2,500 sweet spot: **296**

### Strong-evidence companies by industry group

| | Companies | % |
|---|---:|---:|
| BPO / outsourcing / VA / staffing | 202 | 32% |
| Agency (marketing / creative / digital) | 128 | 20% |
| Software / IT services | 111 | 18% |
| Other / unknown | 100 | 16% |
| Healthcare / RCM / billing | 25 | 4% |
| Finance / legal / accounting | 21 | 3% |
| E-commerce / retail | 19 | 3% |
| Construction / field services | 19 | 3% |

### Evidence type (strongest row)

| | Companies | % |
|---|---:|---:|
| Vendor case study | 360 | 58% |
| Current job posting | 141 | 23% |
| Vendor testimonial/logo | 40 | 6% |
| Employee review | 23 | 4% |
| Company's own website/blog | 14 | 2% |
| Older job posting | 12 | 2% |
| Public review by company (G2/Capterra/Trustpilot/app store) | 9 | 1% |
| Company documentation | 8 | 1% |
| Forum/social post (company identified) | 7 | 1% |
| GitHub/technical | 7 | 1% |
| Vendor case study (churn statement) | 2 | 0% |
| Technographic signal — requires validation | 2 | 0% |

### Evidence recency

| | Companies | % |
|---|---:|---:|
| 2025–2026 | 435 | 70% |
| 2023–2024 | 84 | 13% |
| 2019–2022 | 63 | 10% |
| unknown | 40 | 6% |
| before 2019 | 3 | 0% |

### Confidence score

| | Companies | % |
|---|---:|---:|
| 90–100 | 301 | 48% |
| 60–79 | 171 | 27% |
| 80–89 | 92 | 15% |
| <60 | 61 | 10% |

### Tavilo priority score

| | Companies | % |
|---|---:|---:|
| 30–49 | 219 | 35% |
| 50–69 | 174 | 28% |
| <30 | 168 | 27% |
| 70+ | 64 | 10% |

### Outreach coverage (strong-evidence companies)

| Field | Companies | % |
|---|---:|---:|
| Decision maker | 556 | 89% |
| Second contact | 374 | 60% |
| Personal LinkedIn | 252 | 40% |
| Company LinkedIn | 407 | 65% |
| Phone | 386 | 62% |
| Email | 386 | 62% |
| Decision maker + phone or email (ready to contact) | 442 | 71% |
| Nothing at all | 44 | 7% |

### Unhappy signals (all non-DNT companies)

| | Companies | % |
|---|---:|---:|
| complaint | 47 | 59% |
| switched away | 33 | 41% |

### Complaint categories

| | Companies | % |
|---|---:|---:|
| privacy/morale | 31 | 40% |
| price | 14 | 18% |
| missing features | 11 | 14% |
| bugs-accuracy | 9 | 12% |
| usability | 6 | 8% |
| billing | 4 | 5% |
| support | 2 | 3% |

### Economics (estimates; strong-evidence companies with ≤2,500 estimated seats)

- With a cost estimate: 420 (seats = stated seats, else headcount)
- Estimated competitor spend: median ~$7,200/yr per company; total ~$11,231,844/yr
- Tavilo cheaper for 391 of 420; median saving ~$5,703/yr; total ~$8,503,168/yr
- Tavilo not cheaper for 29 (mostly cheap per-seat time trackers such as Clockify/Jibble/Connecteam, or tiny teams)

| Estimated annual saving | Companies |
|---|---:|
| <$1k | 58 |
| $1k–5k | 128 |
| $5k–20k | 111 |
| $20k+ | 94 |

### POSSIBLE queue by tool (needs validation)

| | Companies | % |
|---|---:|---:|
| Homebase | 158 | 17% |
| Replicon | 87 | 9% |
| Hubstaff | 82 | 9% |
| Toggl Track | 76 | 8% |
| Time Tracker | 61 | 6% |
| Time Doctor | 57 | 6% |
| Connecteam | 49 | 5% |
| Teramind | 34 | 4% |
| ClickTime | 32 | 3% |
| Everhour | 31 | 3% |
| Timesheets | 29 | 3% |
| QuickBooks Time | 26 | 3% |
