# Setup on a new machine

Step-by-step for **alyson-time-doctor** (`revcloud/alyson-pms`) on a clean laptop. After this you can run the API and the Alyson PM desktop agent locally.

Palisade web (Pulse UI) is a **different repo**. Skip it if you only need the agent against a deployed API. Full Pulse UI setup is [section 9](#9-palisade-web-pulse-ui).

---

## 1. What you need from the team

Ask for these before you start (do not commit them):

| Item | Used by |
|------|---------|
| GitHub access to `revcloud/alyson-pms` | Clone |
| Cognito user pool id + app client id (us-west-2) | API + desktop login |
| `INTERNAL_API_KEY` (same value API and agent) | Desktop sync |
| RDS URL or host/user/password for `revclouddb` | API |
| S3 screenshot bucket name | API uploads |
| Deployed API base URL (or you will run API locally) | Desktop + Palisade Pulse |
| Palisade-web GitHub access | Pulse UI |
| AWS credentials / profile (optional) | Secrets, SAM, S3 |
| `MAC_CSC_LINK` + password (optional) | Mac **release** signing only — copy existing cert, never generate a new one |

---

## 2. Install machine tools

### Fast path (macOS, recommended)

```bash
# Xcode CLT (needed for node-gyp / Swift helper)
xcode-select --install

git clone https://github.com/revcloud/alyson-pms.git
cd alyson-pms   # or alyson-time-doctor if you keep the local folder name

bash scripts/install-requirements.sh
```

That script:

1. Installs Homebrew packages from [`requirements/Brewfile`](requirements/Brewfile)
2. Runs `npm ci` for `backend`, `desktop-agent`, and `tasks`
3. Installs Python packages from [`requirements/python.txt`](requirements/python.txt)
4. Copies `.env.example` → `.env` where missing

Manual equivalent:

```bash
brew bundle --file requirements/Brewfile
brew link --overwrite --force node@20
npm ci
python3 -m pip install -r requirements/python.txt
```

### Tool list

| Tool | Why | Version |
|------|-----|---------|
| Git | Clone | any recent |
| Node.js + npm | API, agent, tasks | **20+** (`engines.node`) |
| Python 3 | macOS input monitoring (PyObjC) | **3.11+** |
| `psql` | Migrations / inspect RDS | 16+ client is enough |
| GitHub CLI (`gh`) | Private clone, Actions, releases | latest |
| AWS CLI v2 | Secrets Manager, S3, SAM | optional for UI-only API work |
| AWS SAM CLI | Deploy API Lambda | optional |
| Xcode Command Line Tools | Native addons + `macos-input-helper` | macOS |
| Visual Studio Build Tools | `node-gyp` / `uiohook` | Windows only |

### Windows (manual)

1. Install [Node.js 20 LTS](https://nodejs.org/)
2. Install Git and [GitHub CLI](https://cli.github.com/)
3. Install **Visual Studio Build Tools** with the “Desktop development with C++” workload (native Electron modules)
4. Install Python 3.11+ and tick “Add to PATH”
5. Clone the repo, then from the repo root: `npm ci`
6. Copy env files as in step 4

Linux can run the **API** the same way (`npm ci` + `backend/.env`). The desktop agent is not a supported Linux product (stubs only).

---

## 3. Clone and install Node packages

If you skipped the script:

```bash
gh auth login
git clone https://github.com/revcloud/alyson-pms.git
cd alyson-pms
git remote -v   # should be https://github.com/revcloud/alyson-pms.git

node -v         # v20.x or newer
npm ci
```

Workspaces installed: `backend`, `desktop-agent`, `tasks`.

---

## 4. Environment files

Never commit `.env`. Examples are safe to commit.

### API — `backend/.env`

```bash
cp backend/.env.example backend/.env
```

Fill at least:

```env
# Prefer a single URL, or use HOST/USER/PASSWORD/NAME as in the example
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/revclouddb?sslmode=require

COGNITO_USER_POOL_ID=us-west-2_XXXXXXXXX
COGNITO_CLIENT_ID=your_app_client_id
COGNITO_REGION=us-west-2

INTERNAL_API_KEY=same-secret-as-desktop

AWS_S3_SCREENSHOTS_BUCKET=your-bucket
AWS_REGION=us-west-2

ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,https://app.palisade.ai

PORT=3000
NODE_ENV=development
SERVERLESS_MODE=0
```

For local `POST /pulse/users` you also need AWS credentials that can `AdminCreateUser` on that pool (`AWS_PROFILE` or keys).

RDS password often lives in Secrets Manager (`rds/palisade-be-stage/alyson-time-doctor`). Do not put production passwords in git.

### Desktop — `desktop-agent/.env`

```bash
cp desktop-agent/.env.example desktop-agent/.env
```

**Talk to local API:**

```env
VITE_AUTH_PROVIDER=cognito
VITE_COGNITO_REGION=us-west-2
VITE_COGNITO_USER_POOL_ID=us-west-2_XXXXXXXXX
VITE_COGNITO_CLIENT_ID=your_app_client_id
VITE_API_BASE_URL=http://localhost:3000
BACKEND_API_URL=http://localhost:3000/sync/desktop-action
INTERNAL_API_KEY=same-secret-as-backend
```

**Talk to deployed API:** set `VITE_API_BASE_URL` to the API Gateway URL (no trailing slash) and `BACKEND_API_URL` to `{that}/sync/desktop-action`.

After changing desktop env:

```bash
cd desktop-agent
node generate-env-config.js
```

That writes `env-config.js` (gitignored / build artifact). `npm start` / `prebuild` also generate it.

Root `.env.example` is leftover Supabase template — ignore it for current setup.

---

## 5. Database

Production/QA is **shared Palisade RDS**: schemas `time_doctor.*` and `tenant.*`.

Most developers **do not create a new database**. Point `DATABASE_URL` at the shared instance and use a read/write role (`alyson_time_doctor_api`).

```bash
# Smoke-test
psql "$DATABASE_URL" -c 'select current_user, current_database();'
```

Greenfield / legacy standalone schema only (not what Nest writes in prod):

```bash
npm run db:schema
```

Do **not** run `npm run db:migrate` (`001_pulse_additive.sql`) against Palisade RDS. Prod apply order is in [db/prod/README.md](db/prod/README.md).

---

## 6. Run the API

```bash
npm run dev:backend
```

- Health: http://localhost:3000/health  
- Swagger (non-production): http://localhost:3000/api  

```bash
cd backend && npm run test
cd backend && npm run build
```

---

## 7. Run the desktop agent

```bash
npm run dev:desktop
```

Or `cd desktop-agent && npm start`.

On macOS, grant **Screen Recording** and **Accessibility** to Electron / Alyson PM when prompted. Without them, screenshots and idle/input will fail.

Kill leftover instances before a second start:

```bash
pkill -f desktop-agent || true
```

Python / Swift extras (already handled by `postinstall` / `prebuild:mac` when possible):

```bash
cd desktop-agent
npm run setup-python
bash scripts/build-swift-helper.sh
```

---

## 8. Optional: tasks and AWS deploy

```bash
cd tasks && npm install   # already done by root npm ci
export DATABASE_URL='postgresql://…'
npm run close-stale-sessions
```

SAM deploy is **not** required to develop. When you need it: [infra/sam/README.md](infra/sam/README.md) and `infra/sam/deploy.env.example` → `deploy.env` (gitignored).

```bash
# Typical extras
aws configure
sam --version
```

---

## 9. Palisade web (Pulse UI)

Separate repo (often `Palisade-web-from-github` / `revcloud/alyson-web-frontend`). Use **Bun**, not npm.

```bash
cd Palisade-web-from-github   # your clone path
bun install --frozen-lockfile
cp src/environments/dev.env.example src/environments/.local.env
```

Pulse-specific lines in `.local.env` (do not commit):

```env
REACT_APP_COGNITO_REGION=us-west-2
REACT_APP_COGNITO_USER_POOL_ID=us-west-2_XXXXXXXXX
REACT_APP_COGNITO_CLIENT_ID=your_app_client_id
REACT_APP_COGNITO_DOMAIN=your_cognito_domain

# Palisade EC2 (rest of the dashboard) — not Pulse
REACT_APP_API_BASE_URL=https://api-stage.palisade.ai

# Nest Pulse API — local or Gateway
REACT_APP_ALYSON_PULSE_API_BASE_URL=http://localhost:3000
REACT_APP_APP_ORIGIN=http://localhost:3000/
```

```bash
bun run doctor
bun run start:dev          # or: bun run dev local
```

Sign in with a Cognito user that already has Pulse role + workspace. Open `/dashboard/alyson-pulse/employee` (everyone) or `/dashboard/alyson-pulse/dashboard` (admin).

Nest `ALLOWED_ORIGINS` must include `http://localhost:3000`. Same Cognito pool as `backend/.env`.

More: [docs/ENV.md](docs/ENV.md), [docs/PULSE_UI.md](docs/PULSE_UI.md). Frontend conventions: Palisade `AGENTS.md`.

---

## 10. Verify

| Check | Command / URL | Expect |
|-------|----------------|--------|
| Node | `node -v` | v20+ |
| Workspaces | `npm ls -w backend -w desktop-agent --depth=0` | no missing deps |
| API | `curl -s http://localhost:3000/health` | RDS ok |
| Desktop | App window + tray | Login, start timer |
| Sync | Start tracking with API up | Row in `time_doctor.time_logs` |
| Palisade Pulse | `/dashboard/alyson-pulse/employee` | Own hours after sync |

---

## 11. Releases (later)

You do not need this to develop. When shipping:

- Same unsigned / self-signed setup: `notarize: false`, identity `Alyson PM Code Signing`, `appId` `com.alyson.work-time-agent`
- GitHub Releases: `revcloud/alyson-pms`
- Copy existing `MAC_CSC_*` Actions secrets — do not run `generate-stable-codesign-cert.sh` unless you intend to reset every Mac user’s permissions

See [docs/RELEASE.md](docs/RELEASE.md) and `.cursor/rules/desktop-release.mdc`.

---

## Requirements files

| File | Install with |
|------|----------------|
| [`requirements.txt`](requirements.txt) | Index of versions (not pip) |
| [`requirements/Brewfile`](requirements/Brewfile) | `brew bundle --file requirements/Brewfile` |
| [`requirements/python.txt`](requirements/python.txt) | `python3 -m pip install -r requirements/python.txt` |
| `package-lock.json` | `npm ci` |
| [`scripts/install-requirements.sh`](scripts/install-requirements.sh) | All of the above |

---

## Common problems

| Symptom | Fix |
|---------|-----|
| `npm ci` fails on native module | Xcode CLT (Mac) or VS Build Tools (Windows); Node 20 not 18/22 if a binary is pinned |
| `No workspaces found: web` | Old CI; current repo has no `web/` workspace |
| Desktop login works, sync 401 | `INTERNAL_API_KEY` mismatch |
| Desktop cannot reach API | `VITE_API_BASE_URL` / `BACKEND_API_URL`; regenerate `env-config.js` |
| Screenshots empty on Mac | Screen Recording permission for this binary |
| Idle never logs on Mac | Accessibility + Python/PyObjC |
| `psql: command not found` | `brew install postgresql@16` and link, or use a GUI client |
| CORS error from Palisade local | Add that origin to `ALLOWED_ORIGINS` |
| Pulse UI HTML / blank | `REACT_APP_ALYSON_PULSE_API_BASE_URL` is Nest, not Palisade EC2 |

More: [docs/RUNBOOK.md](docs/RUNBOOK.md).
