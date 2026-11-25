# Roadmap

This is not a dated commitment. It lists follow-ups that are already visible in the repo. Nothing here is scheduled.

## Desktop

- Linux tracking is stubbed. A real Linux build needs the capture, idle, and URL paths that macOS and Windows already have.
- Mac stays non-notarized on purpose. A notarized build is a separate decision because it changes the updater and permission model. See [SECURITY.md](SECURITY.md).
- Open Dependabot updates on `revcloud/alyson-pms-src` are not on `main`. Review them before the next desktop release rather than merging them blind.

## API and data

- New outbound integrations from the API Lambda have to run on a non-VPC function. The API function cannot reach the public internet.
- Screenshot retention is a fixed 90-day delete. A longer or per-workspace retention rule is not implemented.
- Diagnostic logs in `s3://alyson-pm/logs/` have no retention job. Time-log rows in RDS are not purged by the screenshot cleanup.

## Tavilo.ai

- Reports stay off Tavilo.ai until sign-in is settled. Either Tavilo becomes the SSO provider, or the Tavilo Google app is added to the existing Palisade Cognito pool.
- People-ops leave scan has to accept a mailbox per company. It currently reads `people-ops@cintara.ai`.
- Tavilo signup has to create the Cognito user, the workspace, and the Autumn customer, then send that workspace to Stripe. Those steps exist separately today.

## Release

- The next desktop ship should stay on [revcloud/alyson-td-releases](https://github.com/revcloud/alyson-td-releases), keep `appId` `com.alyson.work-time-agent`, and keep the Alyson PM Code Signing identity.
- Source of truth for the app, API, and schema remains [revcloud/alyson-pms-src](https://github.com/revcloud/alyson-pms-src). Pulse UI changes belong in [revcloud/Palisade-web](https://github.com/revcloud/Palisade-web).
