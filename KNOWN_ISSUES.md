# Known issues

Current limits. Fixed items stay in [CHANGELOG.md](CHANGELOG.md) and [desktop-agent/CHANGELOG.md](desktop-agent/CHANGELOG.md).

## Product

- **Linux is not supported.** The desktop targets macOS 11+ and Windows 10/11. Linux paths are stubs.
- **Mac builds are not notarized.** They are signed with Alyson PM Code Signing. Gatekeeper will not treat them as Developer ID apps. Turning notarization on breaks the in-place updater and the way Screen Recording and Accessibility persist.
- **The desktop clock is not payroll.** Pulse computes tracked and effective hours. The number in the app is a local estimate.
- **Screen lock does not stop the timer.** Lid close and sleep do. A locked machine can still look active until idle rules cut time.
- **Two machines can both track the same person.** Pulse merges overlapping intervals for the day. The overlap is still a bad session until one side stops.
- **Screenshots older than 90 days are deleted** from RDS and S3. Time, app, and URL logs are not deleted on that schedule.

## Email and leave

- **Leave intake is the Cintara Google Workspace.** The nightly scan reads `people-ops@cintara.ai` and impersonates `hamza@cintara.ai`. It is not a mailbox each customer can point at their own HR alias.
- **A scanned email adjusts time only when the person already exists.** The sender address has to match a trackable user in that workspace (`tenant.user` plus `time_doctor.user_extensions`). An unknown company email is not created as an employee and does not get a leave credit.
- **Manager mail is three hardcoded Cintara addresses.** `hamza@cintara.ai`, `mohita@cintara.ai`, and `alysonclient@cintara.ai` are the internal managers this system was built for. They are not looked up per company.
  - Low-hours mail always CCs `alysonclient@cintara.ai` and `mohita@cintara.ai`. The employee's real manager is added only when "notify manager" is on (`pulse.service.ts`).
  - The pacing digest goes to all three unless the request passes a different list. The fallback is `PACING_DIGEST_TO`, which defaults to those same addresses (`pacing.service.ts`).
  - Each employee already has `manager_id` and `manager_email` on the workspace. That link is not what picks the default recipients.

  **What to change so each company has its own managers.** Keep the three addresses out of the code. For a send, load the managers of that `workspace_id`: users in the workspace whose role is manager or admin, plus the `manager_email` already stored on the employee. Low-hours CC becomes that employee's manager. The pacing digest goes to the workspace's managers and admins. A workspace may store extra recipients in `workspace_settings` if a company wants a shared ops inbox. Do not fall back to a Cintara address when that list is empty. Send the mail to nobody and show that the company has no manager yet.

  `EMAIL_SENDERS` is a different list. It controls which addresses may appear as the From address (`support@tavilo.ai`, `hamza@cintara.ai`, `mohita@cintara.ai`). A new company's managers do not need to be on it if mail still comes from `support@tavilo.ai`. The leave-scan impersonation of `hamza@cintara.ai` is also separate: that is the Google account that reads people-ops, not a manager recipient.

## Tavilo.ai, reports, and sign-in

Reports for Tavilo.ai are on hold. Hours, screenshots, and leave stay in the Palisade Cognito pool and the shared RDS database. Moving that data onto Tavilo.ai before sign-in is settled would show one company's rows to the wrong account.

Two ways to unblock it:

1. **Replace the auth layer with Tavilo SSO.** Tavilo owns login. This repo stops treating the Palisade Cognito pool as the user directory, and workspace membership has to be created from the Tavilo account.
2. **Keep the Palisade Cognito pool and add the Tavilo Google app.** Put the Tavilo Google client id and secret on the existing user pool so "Sign in with Google" on Tavilo.ai still issues a Cognito token this API already accepts. The user directory stays the Palisade pool.

Until one of those is in place, Pulse reports should not be served as Tavilo customer reports.

## Billing and onboarding

- **Autumn and Stripe are connected on the API, not on Tavilo signup.** `BillingService` creates an Autumn customer per workspace and opens a Stripe checkout URL. With no Autumn key, every feature is turned on and seat limits are ignored.
- **A person who signs up on Tavilo.ai does not get a workspace, a desktop login, and a paid seat from that signup.** Those steps are still separate: Cognito user, `tenant.user`, workspace extension, and Autumn attach.

## Selling this to other companies

The current deploy is one company on shared Palisade infrastructure. Another customer hits these gaps:

- **One Google Workspace grant.** Domain-wide delegation is for Cintara. The next company needs their own people-ops mailbox, an admin grant, and a user the scanner can impersonate. Leave and holiday rules in the classifier are written around the India and Pakistan offices.
- **One Cognito pool.** A customer's Google or Microsoft login is not a separate directory. Option 2 above still lands them in the Palisade pool. Option 1 is required if Tavilo must be the only identity provider.
- **One desktop write key.** Every installed app sends `INTERNAL_API_KEY`. A customer build that ships the same key can write time for any user id the API accepts. Per-company keys, or a token bound to the workspace, are not in place.
- **Isolation is a `workspace_id` column.** Companies share one RDS database, one S3 bucket, and one API. A missed filter on a query exposes another company's screenshots and hours.
- **The work day defaults to `America/Los_Angeles`.** Other countries need the workspace timezone on every hour, leave, and pacing calculation. A single env override is not enough for two customers.
- **The Mac app is not notarized, and updates come from one public GitHub repo.** Another company's IT team will block the install, and they would all receive the same Tavilo Time build and release channel.
- **Screenshots are employee monitoring.** Selling this needs a per-customer consent and retention story. The 90-day delete is global, not a setting on the contract.
- **Billing does not turn features off for an unpaid workspace** unless Autumn is configured and the API checks the entitlement. A trial can keep team reports, leave, and screenshot AI with no subscription.
- **A new company can be created only by a Pulse super-admin.** `createWorkspace` adds the workspace, a default project, an admin invite, and an Autumn customer. If Autumn fails, the company is still created and the failure is only a warning. There is no public Tavilo.ai signup that does this.
- **The nightly leave scan does not follow that new company.** `LEAVE_SCHEDULED_WORKSPACE_IDS` is an environment list. A workspace created in Pulse is not added to the people-ops scan.
- **The desktop app is one build for every customer.** The API URL, Cognito pool, and `INTERNAL_API_KEY` are baked in at build time. A new company downloads the same app and talks to the same API as Cintara.
- **Outbound email is an allow-list.** The default senders are `support@tavilo.ai`, `hamza@cintara.ai`, and `mohita@cintara.ai`. A customer's own domain is not a verified SES identity, so invite and low-hours mail cannot come from them.
- **Screenshot AI sends the image to OpenRouter.** The worker base64-encodes the capture and posts it to `openrouter.ai`. A customer security review will block that unless AI is off for their workspace or the contract allows it.
- **Issue reports go to one operator list** (`ISSUE_REPORT_TO`), not to that company's admin. You would see every customer's desktop problems in the same inbox.
- **There is no per-customer identity provider.** Okta, Azure AD, and SAML are not wired. The only choices are the two Cognito options in the section above.
- **All customer data sits in `us-west-2`**, in the same RDS database Palisade uses. There is no EU region, no per-company encryption key, and no export or delete-company tool for when a customer leaves.
- **Mac permission setup does not scale.** Screen Recording and Accessibility are granted by each person on first launch. There is no notarized MDM package a customer's IT team can push.

## Platform

- **The API Lambda has no NAT.** Cognito admin, SES, Gmail leave scan, and OpenRouter run on Lambdas outside the VPC. A new outbound call from the API function will fail until it follows that pattern.
- **Dependabot branches are not merged.** `origin` has open dependency-update branches (axios, electron, sharp, zod, and others). `main` does not include them. Latest shipped desktop version is **1.1.3** (26 Oct 2026). `main` also contains commit `3c41f84` (16 Nov 2026, “added some more changes”), which is not a versioned desktop release.

## Docs that are stale

| File | What is wrong |
|------|----------------|
| `docs/ARCHITECTURE.md` | Research notes through desktop v1.0.224. Use [ARCHITECTURE.md](ARCHITECTURE.md). |
| `system-architecture.md` | Supabase-era design. The live path is Nest, Cognito, RDS, and S3. |
| `backend/README.md` | Still describes the old Supabase and GraphQL stack. |
