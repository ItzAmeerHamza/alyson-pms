# How to add a Pulse page

Pulse UI lives in **Palisade-web** (`src/components/AlysonPulse`). The API lives in this repo. Do both or the page 403s / 404s.

---

## 1. Decide the role

Align with `pulsePermissions.js` and Nest (`canAccessPulseTeamReports`, `canAdjustPulseTime`, `canManagePulseUsers`).

| Audience | Guard | Nav keys |
|----------|--------|----------|
| Org admin only | `PulseAdminRoute` | `ADMIN_KEYS` |
| Admin + manager | `PulseUserManagementRoute` | include in `MANAGER_KEYS` if they should see the link |
| Admin + manager + team lead | `PulseTeamDirectoryRoute` | `TEAM_LEAD_KEYS` |
| Admin or access grant | `PulseTeamReportRoute` / `PulseOrgAdminRoute` (`allowDelegatedAccess`) | `DELEGATED_KEYS` if grant should see it |
| Everyone signed in | no role guard (still `ProtectedElement`) | `SELF_KEYS` / `EMPLOYEE_KEYS` |

Managers must **not** get team reports or time-adjust. If they 403, the guard is correct.

---

## 2. Backend (this repo)

- New reads/writes under `/pulse/...` or `/data/...` with `AuthGuard` (JWT). Never expose payroll writes on the API-key sync path unless the agent needs them.
- DTO + `ValidationPipe` whitelist.
- Scope by workspace / `user_id`; employees see self unless admin or grant.
- Add a vitest next to the service.
- Document the route in `backend/API.md` and [FEATURES.md](./FEATURES.md).

---

## 3. Frontend (Palisade-web)

Keep these in sync:

1. **API helper** — `src/api/AlysonPulse/index.js` (`pulseGet` / `pulsePost` / …). Normalize the response here, not in five components.
2. **Page** — `src/components/AlysonPulse/pages/<Name>/index.js`. Use `PulsePageShell`, `PulsePageState`, `usePulseQuery`. Ant Design. Loading / empty / error / retry.
3. **Export** — `pages/index.js`.
4. **Route constant** — `APP_ROUTES.PULSE_*` in `src/routes/index.js` (`alyson-pulse/...`).
5. **Route element** — same file, wrap with the guard from step 1.
6. **Nav** — `navItems.js`: new `key` (next unused `42x`), `redirect` matching the path, `section` (`manage` / `assigned` / `me` / `help`). Add the key to `ADMIN_KEYS` / `MANAGER_KEYS` / `SELF_KEYS` / `DELEGATED_KEYS` as needed.
7. **Permissions** — if you add a flag, update `pulsePermissions.js` **and** its test.
8. **Focused test** — API module or permissions. `bun run test` on what you touched.

Do not call Nest with raw `fetch` from a random component; use `pulseClient`.

---

## 4. Check

- Admin: link shows, page loads.
- Manager: link hidden or allowed only if you intended invite/projects; reports stay 403.
- Employee: only “You” + help.
- Delegated user: assigned reports only for grant targets.
- `ALLOWED_ORIGINS` already includes the Palisade origin.

---

## 5. Docs

Add a short subsection to [FEATURES.md](./FEATURES.md) (route, API, who).
