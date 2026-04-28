const { chromium } = require('playwright');

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080';
const COMPANY = process.env.TEST_USER_COMPANY || 'ebdaadt';
const EMAIL = process.env.TEST_USER_EMAIL;
const PASSWORD = process.env.TEST_USER_PASSWORD;

const ROUTES = [
  { path: '/dashboard', expected: ['/dashboard'] },
  { path: '/reports', expected: ['/reports'] },
  { path: '/reports/time-reports', expected: ['/reports/time-reports'] },
  { path: '/reports/all-employee', expected: ['/reports/all-employee'] },
  { path: '/reports/individual-employee', expected: ['/reports/individual-employee'] },
  { path: '/reports/apps-urls-idle', expected: ['/reports/apps-urls-idle'] },
  { path: '/reports/bulk-report-generator', expected: ['/reports/bulk-report-generator'] },
  { path: '/app-activity', expected: ['/app-activity'] },
  { path: '/url-activity', expected: ['/admin/url-activity'] },
  { path: '/admin/url-activity', expected: ['/admin/url-activity'] },
  { path: '/users', expected: ['/users'] },
  { path: '/projects', expected: ['/projects'] },
  { path: '/screenshots', expected: ['/screenshots'] },
  { path: '/admin/screenshots', expected: ['/admin/screenshots', '/screenshots'] },
  { path: '/activity-monitor', expected: ['/activity-monitor'] },
  { path: '/todays-history', expected: ['/todays-history'] },
  { path: '/settings', expected: ['/settings'] },
  { path: '/calendar', expected: ['/calendar'] },
  { path: '/time-logs', expected: ['/time-logs'] },
  { path: '/employee-settings', expected: ['/employee-settings'] },
  { path: '/finance', expected: ['/finance'] },
  { path: '/suspicious-activity', expected: ['/suspicious-activity'] },
  { path: '/ai-insights', expected: ['/ai-insights'] },
  { path: '/activity-issues', expected: ['/activity-issues'] },
  { path: '/test/live-tracking', expected: ['/test/live-tracking'] },
  { path: '/admin', expected: ['/admin'] },
  { path: '/admin/email-reports', expected: ['/admin/email-reports'] },
  { path: '/admin/idle-logs', expected: ['/admin/idle-logs'] },
  { path: '/admin/vision-monitoring', expected: ['/admin/vision-monitoring'] },
  { path: '/admin/warning-management', expected: ['/admin/warning-management'] }
];

const isExpected = (url, expected) => expected.some((value) => url.includes(value));

const isIgnorableResponse = (response) => {
  const url = response.url();
  if (url.includes('favicon.ico')) return true;
  if (url.startsWith('data:')) return true;
  return false;
};

const run = async () => {
  if (!EMAIL || !PASSWORD) {
    throw new Error('Missing TEST_USER_EMAIL or TEST_USER_PASSWORD');
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();

  const results = [];
  const warnRoutes = new Set();

  page.on('response', (response) => {
    const status = response.status();
    if (status < 400) return;
    if (isIgnorableResponse(response)) return;
    const currentRoute = results[results.length - 1];
    if (currentRoute) {
      currentRoute.responseErrors.push({
        status,
        url: response.url()
      });
    }
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  if (page.url().includes('/login')) {
    await page.getByLabel(/company/i).fill(COMPANY);
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/(dashboard|admin|reports|users|projects|screenshots|settings|calendar)/, { timeout: 15000 });
  }

  for (const route of ROUTES) {
    const entry = {
      path: route.path,
      expected: route.expected,
      finalUrl: '',
      status: 'PASS',
      responseErrors: []
    };
    results.push(entry);

    await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle' });
    entry.finalUrl = page.url();

    if (entry.finalUrl.includes('/login')) {
      entry.status = 'FAIL';
    } else if (!isExpected(entry.finalUrl, route.expected)) {
      entry.status = 'FAIL';
    } else if (entry.responseErrors.length > 0) {
      entry.status = 'WARN';
      warnRoutes.add(route.path);
    }
  }

  await browser.close();

  const summary = results.reduce(
    (acc, r) => {
      acc[r.status] += 1;
      return acc;
    },
    { PASS: 0, WARN: 0, FAIL: 0 }
  );

  console.log('Admin route smoke test summary');
  console.log(JSON.stringify(summary));
  results.forEach((r) => {
    console.log(`${r.status} ${r.path} -> ${r.finalUrl}`);
    if (r.responseErrors.length > 0) {
      const unique = new Map();
      r.responseErrors.forEach((err) => {
        unique.set(`${err.status} ${err.url}`, err);
      });
      Array.from(unique.values()).forEach((err) => {
        console.log(`  - ${err.status} ${err.url}`);
      });
    }
  });
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
