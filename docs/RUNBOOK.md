# Support and debug runbook

What to check before changing hours or minting a new signing cert.

---

## Clock in the app ≠ Pulse hours

1. Confirm both sides use the same **work day** (Pacific unless workspace TZ changed).
2. Wait for sync (offline queue). Time logs live in `~/Library/Application Support/Alyson Work Time/offline-time-logs.json` (Mac) or `%APPDATA%\Alyson Work Time\`.
3. Pulse **tracked** is merged sessions minus cuts/deductions + adjustments. The tray is live wall clock.
4. **Desktop effective ≠ Pulse effective.** Desktop does not exclude meetings. Compare **tracked** first.
5. Sleep / lid close ends the session at last proof-of-life — that time will not keep accruing.

SQL sketch: `time_doctor.time_logs` for `user_id` + day overlap; `idle_logs`; `screenshots.deducted` via session `deducted_seconds`.

---

## Sync 401 / agent “not connected”

- `INTERNAL_API_KEY` on the agent **equals** backend / Lambda.
- `BACKEND_API_URL` ends with `/sync/desktop-action` and matches the API you think you are hitting.
- Regenerated `env-config.js` after `.env` edits (`node generate-env-config.js`).
- Packaged builds have the key baked in — changing `.env` does not fix an installed `.app`.

---

## Screenshots empty

**Agent:** Mac Screen Recording granted to **this** binary (Electron vs “Alyson PM”). After an **ad-hoc** or new-cert build, grants reset.

**Pulse:** `REACT_APP_ALYSON_PULSE_API_BASE_URL` + JWT. Presigned S3 GET — if thumbs 403, CDN/HMAC or bucket policy. Filters (low / idle / other employee) hide tiles.

**Upload:** `screenshot_upload_init` then S3 PUT then `complete`. Failed PUT leaves no row. Check agent offline `screenshots` bucket.

---

## Mac permissions reset after update

Cause: different code-signing identity (new `.p12`, ad-hoc CI, or changed `appId`).

**Do not** run `generate-stable-codesign-cert.sh` to “fix” one user.

Fix for the **channel**: put the **existing** `MAC_CSC_LINK` / `MAC_CSC_KEY_PASSWORD` on `revcloud/alyson-pms` and ship the next ZIP signed with **Alyson PM Code Signing**. Users re-grant once when moving from unsigned → that cert, then it should stick.

---

## Idle never logs / prompt never appears

- Accessibility (Mac) or input hook (Windows) allowed.
- Python/PyObjC on Mac (`requirements/python.txt` / bundled Python).
- Prompt only after **10 minutes** OS idle. If the UI fails to show, the agent **must not** cut 10 minutes.

---

## Offline queue stuck

- API health: `curl -s $API/health`
- Key and URL (401 above).
- Corrupt `offline-time-logs.json` (must stay an **array**). Do not merge it into `offline-queue.json`.
- Time logs retry forever; screenshots/apps may sit if S3/API errors. Restart the agent after fixing env.

---

## Pulse page 403 for a manager

Managers cannot see team reports or adjust time. That is intentional (`canAccessTeamReports` / `canAdjustTime` are admin-only). Use an **access grant** or an admin account. See [PULSE_UI.md](./PULSE_UI.md).

---

## Palisade Pulse is blank / HTML error

- `REACT_APP_ALYSON_PULSE_API_BASE_URL` is Nest (`:3000` or API Gateway), **not** `api-stage.palisade.ai`.
- Nest `ALLOWED_ORIGINS` includes the Vite origin (`http://localhost:3000`).
- Signed in with a Cognito user that exists in `tenant.user` + `user_extensions` for that workspace.

---

## CI red on GitHub

Current CI is backend **build + test** only (no `web/` workspace). If Web Admin / `npm run lint` fails, the workflow is stale — use the `ci.yml` in this repo.

---

## Do not

- Generate a new Mac signing cert for a support ticket.
- Change `appId`.
- Turn notarize on.
- Run `001_pulse_additive.sql` on Palisade RDS.
- Delete `time_logs` rows to “fix” hours — use adjustments or understand cuts first.
- Point a prod agent at QA (or the reverse) with a mixed API key.
