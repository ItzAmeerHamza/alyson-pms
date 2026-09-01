# Operations

Privacy, devices, and which environment you are talking to.

---

## Privacy and retention

| Topic | Behavior |
|-------|----------|
| Audio / mic / camera | **Not recorded.** FAQ and agent do not capture sound. |
| Screenshots | Private S3. API returns short-lived presigned URLs (and optional thumb CDN). Not public objects. |
| Who can see captures | Self; org admin (all); access-grant targets only. Managers do **not** get org-wide screenshots. |
| Delete screenshot | Admin (or policy on that route) removes the object metadata and **deducts** that interval from the session. |
| Screenshot TTL | Daily task `cleanup-screenshots` purges RDS + S3 older than **90 days**. |
| Time / app / URL logs | Stay in RDS (no 90-day job). Treat as employment records; don’t dump them into tickets. |
| Credentials | Cognito tokens in the agent; secrets in keytar. `INTERNAL_API_KEY` is a shared write secret — rotate only if you can ship a new agent build. |
| Download page | Public GitHub release assets (installers), not screenshot data. |

Do not paste screenshot images or full `DATABASE_URL`s into chat/PRs.

---

## Multi-device, lock, and sleep

- Each install has a **device_id**. Starting on laptop B should `close_active_sessions` for that device’s previous open row; laptop A can still have its own session if it was left running (then sleep/stop rules apply).
- **Screen lock** does not stop tracking. Idle still counts; screenshots may pause depending on OS.
- **Lid close / sleep / hibernate** stops tracking and closes the session (Mac and Windows), **including during a meeting**. Hours stop at last proof-of-life — sleep is not billed.
- **Two timers at once** on two machines for the same user: Pulse **merges overlapping** intervals for the day so you do not double-pay the overlap. Still a bad habit; ask them to stop one.
- Meeting windows: Pulse will not treat Meet/Zoom/Teams/Webex tiles as low-activity. Sleep still ends the session.

---

## Staging vs production

| | QA / stage | Production |
|--|------------|------------|
| SAM stack | `alyson-time-doctor-api-dev` (or staging name) | `alyson-time-doctor-api-prod` |
| API | Stage API Gateway | Prod API Gateway |
| RDS | Stage `revclouddb` / stage proxy | Prod proxy |
| S3 | Stage prefix/bucket | Prod bucket |
| Cognito | Shared Palisade pool (confirm with team) | Same pool or prod app client — **confirm** |
| `INTERNAL_API_KEY` | Stage secret | Prod secret — never reuse |
| Desktop build | Only if you intentionally ship a QA agent | `release.yml` embeds **prod** URLs |
| Palisade | `REACT_APP_ALYSON_PULSE_API_BASE_URL` = stage API | Prod API |
| GitHub Releases | Do not publish QA bits as `latest` on `revcloud/alyson-pms` | Only prod-signed builds |

**Local:** Nest `:3000` + agent + Palisade Pulse URL all `localhost:3000` is fine; DB is usually still shared RDS. Do not run `001_pulse_additive.sql` against Palisade.

Cross-wiring (prod key on stage API, or QA agent updating from prod `latest`) causes 401s or employees on the wrong data.

---

## Related

- [ENV.md](./ENV.md) — variable pairing table
- [RELEASE.md](./RELEASE.md) — what may ship to `latest`
- [RUNBOOK.md](./RUNBOOK.md) — when something looks wrong
