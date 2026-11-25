# Security

Rules for Tavilo Time and the Alyson Pulse API in [revcloud/alyson-pms-src](https://github.com/revcloud/alyson-pms-src).

## Auth

- Pulse and other browser clients send a Cognito ID token. Nest checks it. A failed login returns a generic invalid-credentials response.
- The desktop app writes with `x-api-key` (`INTERNAL_API_KEY`) on `POST /sync/desktop-action`. That key is a shared write secret. Rotating it requires a new desktop build.
- `GET /health` is the only unauthenticated route.
- API Gateway does not attach a JWT authorizer. Nest guards do.
- CORS uses `ALLOWED_ORIGINS`. Do not set `origin: true` or `origin: '*'`.

## Secrets

- Do not commit `.env`, `infra/sam/deploy.env`, private keys, or Cognito client secrets. Those paths are gitignored.
- Production secrets stay in the Lambda environment and the SAM deploy parameters.
- Do not log access keys, database passwords, or raw tokens.
- Do not return `error.message` or `error.stack` to clients. Log the detail on the server and return a generic message.
- Issue reports redact bearer tokens and JWTs before they are stored or emailed.

## API

- Every controller uses `ApiKeyGuard` or `RolesGuard`, except health.
- Request bodies go through `ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true`.
- Helmet is on. Swagger stays off when `NODE_ENV` is `production`.
- Org admins can read team reports and screenshots. Managers can invite people and assign projects. Employees see their own rows unless an access grant says otherwise.

## Data

- Screenshots are private objects in `s3://alyson-pm`. The API returns short-lived presigned URLs. Thumbnail URLs are signed for CloudFront.
- Deleting a screenshot removes the object and deducts that interval from the session.
- A daily job deletes screenshot rows and S3 objects older than 90 days. Time, app, and URL logs stay in RDS.
- The desktop app does not store credentials in `localStorage`. Tokens go in the OS keychain.
- New Electron windows use `nodeIntegration: false` and `contextIsolation: true`. IPC handlers must validate renderer input.

## Desktop release

- Mac builds are signed with the existing **Alyson PM Code Signing** identity and are not notarized.
- `appId` stays `com.alyson.work-time-agent`. A new certificate or app id makes every Mac user grant Screen Recording and Accessibility again.
- Installers are published to [revcloud/alyson-td-releases](https://github.com/revcloud/alyson-td-releases). Do not put source or secrets in that repo.

## People-ops mail

Leave scan uses a Google service account with domain-wide delegation and `gmail.readonly`. The private key lives in deploy configuration, not in git. The scan impersonates `hamza@cintara.ai` and reads `people-ops@cintara.ai`.
