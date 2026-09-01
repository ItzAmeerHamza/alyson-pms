# Desktop release one-pager

Unsigned / self-signed GitHub channel. Full gates: `.cursor/rules/desktop-release.mdc`.

## Never change

| Setting | Value |
|---------|--------|
| Notarize | `false` |
| Identity | `Alyson PM Code Signing` |
| appId | `com.alyson.work-time-agent` |
| Windows NSIS | `oneClick: true` |
| Mac update | In-place **ZIP** (not DMG) |
| Feed | GitHub `revcloud/alyson-pms` |

A new cert or `appId` forces every Mac user to re-grant Screen Recording and Accessibility.

## Secrets

Copy the **existing** `MAC_CSC_LINK` + `MAC_CSC_KEY_PASSWORD` onto `revcloud/alyson-pms`. Do not run `desktop-agent/scripts/generate-stable-codesign-cert.sh` unless you intend a permissions reset.

CI refuses a different cert root (`513051c01cadd77c6abafa1a9e141de08c1851c0`).

Also set Cognito + `VITE_API_BASE_URL` / `BACKEND_API_URL` / `INTERNAL_API_KEY` so the packaged app hits **prod** (not localhost).

## Ship

```bash
# version in desktop-agent/package.json
git push origin main
gh workflow run release.yml -f version=vX.Y.Z --repo revcloud/alyson-pms
```

Assets (dots, not spaces/hyphens):

- `latest-mac.yml` → ZIP urls `Alyson.PM-{ver}-arm64-mac.zip` / `Alyson.PM-{ver}-mac.zip`
- `latest.yml` → `Alyson.PM.Setup.{ver}.exe`
- DMGs for manual download only

## First hop after the GitHub org change

Installed apps that still have `ItzAmeerHamza/alyson-pms` baked in will **not** see `revcloud` releases.

1. Publish that version on **ItzAmeerHamza/alyson-pms** (old feed) with updater URLs pointing at `revcloud`.
2. After users auto-update, publish only to `revcloud/alyson-pms`.

Same cert on both publishes. Pulse API / backend deploy is **not** required for a desktop-only release.

## After publish

- `gh release view vX.Y.Z --repo revcloud/alyson-pms`
- Palisade Download page (`GITHUB_REPO = revcloud/alyson-pms`) picks up `latest` after frontend deploy
- Smoke: one Mac in-app update (permissions stay), one Windows silent update
