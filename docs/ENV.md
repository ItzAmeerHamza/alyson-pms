# Environment variable catalog

Do not commit filled `.env` files. Examples (`*.example`) are safe.

Same Cognito pool + same `INTERNAL_API_KEY` must be used by API, agent, and Palisade Pulse client for a given environment.

---

## Backend (`backend/.env`)

| Variable | Required | Local | Prod / Lambda | Notes |
|----------|----------|-------|---------------|--------|
| `DATABASE_URL` | one of URL or host set | Shared RDS is typical | Proxy URL | `sslmode=require` |
| `DATABASE_HOST` / `USER` / `PASSWORD` / `NAME` / `PORT` | alt | ✓ | Proxy host | Password from Secrets Manager |
| `DATABASE_SSL` | if not in URL | often `true` | `true` | |
| `COGNITO_USER_POOL_ID` | ✓ | ✓ | ✓ | JWT + invites |
| `COGNITO_CLIENT_ID` | ✓ | ✓ | ✓ | Must match Palisade + agent |
| `COGNITO_REGION` | ✓ | `us-west-2` | same | |
| `INTERNAL_API_KEY` | ✓ | ✓ | ✓ | Desktop sync; long random string |
| `AWS_S3_SCREENSHOTS_BUCKET` | ✓ | ✓ | ✓ | Private bucket |
| `AWS_S3_SCREENSHOTS_PREFIX` | | `alyson-td-screenshots` | same | |
| `AWS_REGION` | ✓ | `us-west-2` | same | |
| `ALLOWED_ORIGINS` | ✓ | include `http://localhost:3000` | Palisade + Alyson hosts | Comma-separated; no `*` |
| `PORT` | | `3000` | unused in Lambda | |
| `NODE_ENV` | | `development` | `production` | Hides Swagger in prod |
| `SERVERLESS_MODE` | | `0` | `1` | Lambda |
| `EMAIL_FROM` | for mail | verified SES | verified | |
| `EMAIL_SENDERS` | | allow-list | same | |
| `SES_EMAIL_FUNCTION_NAME` | Lambda mail | | ✓ | Non-VPC worker |
| `AWS_PROFILE` or keys | invites / SES local | ✓ | IAM role | `AdminCreateUser` |
| `SCREENSHOT_THUMB_CDN_*` | thumbs CDN | optional | often set | |
| `SCREENSHOT_OCR_PROVIDER` | AI worker | `tesseract` / `none` | same | |

Also accepted: `AWS_S3_BUCKET` alias in some code paths — prefer `AWS_S3_SCREENSHOTS_BUCKET`.

---

## Desktop agent (`desktop-agent/.env`)

Embedded into `env-config.js` by `generate-env-config.js`.

| Variable | Required | Notes |
|----------|----------|--------|
| `VITE_AUTH_PROVIDER` | ✓ | `cognito` |
| `VITE_COGNITO_REGION` | ✓ | Same pool as API |
| `VITE_COGNITO_USER_POOL_ID` | ✓ | |
| `VITE_COGNITO_CLIENT_ID` | ✓ | |
| `VITE_API_BASE_URL` | ✓ | Nest origin, no trailing slash. Local: `http://localhost:3000` |
| `BACKEND_API_URL` | ✓ | `{API}/sync/desktop-action` |
| `INTERNAL_API_KEY` | ✓ | **Same** as backend |
| `WORK_TIMEZONE` | | Override; default Pacific via code |

After edits: `cd desktop-agent && node generate-env-config.js`

Release builds fail if Cognito, API URL (not localhost), or the API key are missing.

---

## Palisade web (`src/environments/.local.env`)

Pulse is **not** `REACT_APP_API_BASE_URL` (Palisade EC2). Pulse is:

| Variable | Pulse? | Notes |
|----------|--------|--------|
| `REACT_APP_ALYSON_PULSE_API_BASE_URL` | ✓ | `http://localhost:3000` or API Gateway origin |
| `REACT_APP_COGNITO_*` | ✓ | Same pool as Nest |
| `REACT_APP_API_BASE_URL` | no | Rest of Palisade (stage default `https://api-stage.palisade.ai`) |
| `REACT_APP_APP_ORIGIN` | CORS sibling | Often `http://localhost:3000/` |

If Pulse URL is wrong you get HTML errors or empty dashboards. Nest `ALLOWED_ORIGINS` must include the Vite origin.

---

## SAM / Lambda (`infra/sam/deploy.env`)

See `deploy.env.example`. Typical: `DATABASE_HOST` (proxy), `INTERNAL_API_KEY`, Cognito ids, `S3_BUCKET_NAME`, `ALLOWED_ORIGINS`, VPC subnet/SG, `EMAIL_FROM`, stack name `alyson-time-doctor-api-dev` / `-prod`.

---

## GitHub Actions (`revcloud/alyson-pms`)

| Secret | Used by |
|--------|---------|
| `MAC_CSC_LINK` | Release — existing `.p12` base64. **Do not regenerate.** |
| `MAC_CSC_KEY_PASSWORD` | Release |
| `VITE_COGNITO_*` / `VITE_API_BASE_URL` / `BACKEND_API_URL` / `INTERNAL_API_KEY` | Embed in desktop build |
| `VITE_SUPABASE_*` / `SUPABASE_*` | Legacy generate-env paths; current login is Cognito |
| `VITE_AUTH_PROVIDER` | `cognito` |

---

## Pairing (do not mix)

| Env | API | Agent `VITE_API_BASE_URL` | Palisade Pulse URL | DB |
|-----|-----|---------------------------|--------------------|-----|
| Local | `:3000` | `http://localhost:3000` | `http://localhost:3000` | Shared RDS or none |
| QA / stage | stage API Gateway | that origin | that origin | stage `revclouddb` |
| Prod | prod API Gateway | that origin | that origin | prod proxy |

A QA agent + prod API key (or the reverse) yields 401 or writing into the wrong org.
