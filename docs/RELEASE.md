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
| Feed (1.0.239+) | GitHub `revcloud/alyson-td-releases` (public) |
| Hop feed (1.0.238) | Public `revcloud/alyson-pms` (releases only, no source) |
| Source | Private `revcloud/alyson-pms-src` |

A new cert or `appId` forces every Mac user to re-grant Screen Recording and Accessibility.

## Secrets

Copy the **existing** `MAC_CSC_LINK` + `MAC_CSC_KEY_PASSWORD` onto `ItzAmeerHamza/alyson-pms` (CI). Do not run `desktop-agent/scripts/generate-stable-codesign-cert.sh` unless you intend a permissions reset.

CI refuses a different cert root (`513051c01cadd77c6abafa1a9e141de08c1851c0`).

Also set Cognito + `VITE_API_BASE_URL` / `BACKEND_API_URL` / `INTERNAL_API_KEY` so the packaged app hits **prod** (not localhost).

## Ship

```bash
# origin must be revcloud/alyson-pms-src (private source). Never push source to public alyson-pms.
git remote set-url origin https://github.com/revcloud/alyson-pms-src.git
# version in desktop-agent/package.json
git push origin main
git push hamza main   # CI secrets (MAC_CSC_*) live here today
gh workflow run release.yml -f version=vX.Y.Z --repo ItzAmeerHamza/alyson-pms
# After CI: copy the 7 assets to revcloud/alyson-td-releases
# Also copy onto public revcloud/alyson-pms until 1.0.238 clients are gone
```

Assets (dots, not spaces/hyphens):

- `latest-mac.yml` → ZIP urls `Alyson.PM-{ver}-arm64-mac.zip` / `Alyson.PM-{ver}-mac.zip`
- `latest.yml` → `Alyson.PM.Setup.{ver}.exe`
- DMGs for manual download only

## First hop after the GitHub org change

- **1.0.237** looks at public `ItzAmeerHamza/alyson-pms`.
- **1.0.238** looks at `revcloud/alyson-pms`. That name is now a **public releases-only** repo so 238 can auto-update. Source was renamed to `revcloud/alyson-pms-src`.
- **1.0.239+** looks at public `revcloud/alyson-td-releases`.

Until 238 is gone, publish each desktop release to **all three** public feeds. Pulse API / backend deploy is **not** required for a desktop-only release.

## After publish

- `gh release view vX.Y.Z --repo revcloud/alyson-td-releases`
- `gh release view vX.Y.Z --repo revcloud/alyson-pms` (238 hop)
- Palisade Download page (`GITHUB_REPO = revcloud/alyson-td-releases`)
- Smoke: 1.0.238 **Check for updates** finds the new version; Mac in-app update keeps permissions
