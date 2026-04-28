import { test, expect } from '@playwright/test';

test.describe('Admin Pages Verification', () => {
    // Base URL is assumed to be localhost:8080 from npm run dev
    const BASE_URL = 'http://localhost:8080';

    const loginIfNeeded = async (page: any) => {
        const currentUrl = await page.url();
        if (!currentUrl.includes('/login')) {
            return;
        }

        const email = process.env.TEST_USER_EMAIL;
        const password = process.env.TEST_USER_PASSWORD;
        const company = process.env.TEST_USER_COMPANY || 'ebdaadt';

        if (!email || !password) {
            test.skip(true, 'At login page. Set TEST_USER_EMAIL and TEST_USER_PASSWORD to run these tests.');
            return;
        }

        await page.getByLabel(/company/i).fill(company);
        await page.getByLabel(/email/i).fill(email);
        await page.getByLabel(/password/i).fill(password);
        await page.getByRole('button', { name: /sign in/i }).click();
        await page.waitForURL(/\/(dashboard|admin|reports|users|projects|screenshots|settings|calendar)/, { timeout: 15000 });
    };

    test.beforeEach(async ({ page }) => {
        // Go to root, should redirect to dashboard because of mocked auth
        await page.goto(BASE_URL);
        // Wait for redirection or load
        await page.waitForLoadState('networkidle');
        await loginIfNeeded(page);
    });

    test('Dashboard should load and have navigation links', async ({ page }) => {
        await page.goto(`${BASE_URL}/dashboard`);
        await expect(page).toHaveURL(/.*dashboard/);

        // Check for sidebar navigation
        await expect(page.getByRole('navigation')).toBeVisible();

        // Verify widgets are present (based on previous manual check)
        await expect(page.locator('text=Total Users')).toBeVisible();
        await expect(page.locator('text=Active Users')).toBeVisible();
    });

    test('Admin Dashboard buttons should navigate correctly', async ({ page }) => {
        await page.goto(`${BASE_URL}/admin`);

        // Click "Access Email Reports"
        await page.click('text=Access Email Reports');
        await expect(page).toHaveURL(/.*admin\/email-reports/);

        // Go back
        await page.goto(`${BASE_URL}/admin`);

        // Click "Access Screenshot Monitoring"
        await page.click('text=Access Screenshot Monitoring');
        await expect(page).toHaveURL(/.*admin\/screenshots/);

        // Go back
        await page.goto(`${BASE_URL}/admin`);

        // Click "Access Idle Time Logs"
        await page.click('text=Access Idle Time Logs');
        await expect(page).toHaveURL(/.*admin\/idle-logs/);
    });

    test('Email Reports page interactions', async ({ page }) => {
        await page.goto(`${BASE_URL}/admin/email-reports`);

        // Check for "Test Email Setup" button
        const testButton = page.locator('button:has-text("Test Email Setup")');
        await expect(testButton).toBeVisible();

        // Click it (it might trigger a toast)
        await testButton.click();
        // We expect it not to crash. Toast might appear.
        await expect(page.locator('text=Testing...')).toBeVisible();
    });

    test('Warning Management interactions', async ({ page }) => {
        await page.goto(`${BASE_URL}/admin/warning-management`);

        // Click "Create Warning"
        await page.click('button:has-text("Create Warning")');

        // Dialog should open
        await expect(page.getByRole('dialog')).toBeVisible();
        await expect(page.locator('text=Create New Warning Message')).toBeVisible();

        // Close dialog
        await page.click('button:has-text("Cancel")');
        await expect(page.getByRole('dialog')).toBeHidden();
    });

    test('Reports page interactions', async ({ page }) => {
        await page.goto(`${BASE_URL}/reports`);

        // Check for report cards/links
        await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
        await expect(page.locator('text=Report Configuration')).toBeVisible();

        // Click on a report type
        await page.click('text=Export CSV');
        await expect(page.locator('text=Report Configuration')).toBeVisible();
    });

    test('Users page interactions', async ({ page }) => {
        await page.goto(`${BASE_URL}/users`);

        // Check for "Add User" or similar button if it exists, or just the table
        // Based on code, there might be a user list
        await expect(page.locator('h1:has-text("User Management")')).toBeVisible();
    });

    test('Bulk Report Generator loads and report shows varying Activity % and Productivity', async ({ page }) => {
        const base = process.env.PLAYWRIGHT_BASE_URL || BASE_URL;

        await page.goto(base);
        await page.waitForLoadState('networkidle');
        await loginIfNeeded(page);

        await page.goto(`${base}/reports/bulk-report-generator`);
        await page.waitForLoadState('networkidle');

        await expect(page.getByRole('button', { name: /Generate Bulk Report/i }).or(page.getByRole('heading', { name: /Report Data Preview/i }))).toBeVisible({ timeout: 10000 });

        // Select at least one employee (checkboxes are in a grid, not a table)
        const employeeCheckbox = page.getByRole('checkbox').first();
        if (await employeeCheckbox.isVisible()) {
            await employeeCheckbox.check();
        }

        const generateBtn = page.getByRole('button', { name: /Generate Bulk Report/i });
        await expect(generateBtn).toBeVisible();
        await generateBtn.click();

        // Wait for Report Data Preview table to appear (table is in the same Card as the heading)
        await expect(page.getByRole('heading', { name: 'Report Data Preview' })).toBeVisible({ timeout: 20000 });
        const table = page.getByRole('heading', { name: 'Report Data Preview' }).locator('..').locator('..').locator('..').locator('table');
        await expect(table).toBeVisible({ timeout: 10000 });

        const rows = table.locator('tbody tr');
        await expect(rows.first()).toBeVisible({ timeout: 10000 });
        const rowCount = await rows.count();
        if (rowCount === 0) {
            test.skip(true, 'No report rows (no data for selected employees/date range)');
        }

        const activityValues: string[] = [];
        const productivityValues: string[] = [];
        for (let i = 0; i < Math.min(rowCount, 20); i++) {
            const cells = rows.nth(i).locator('td');
            const activityCell = cells.nth(3);
            const productivityCell = cells.nth(4);
            const a = await activityCell.textContent();
            const p = await productivityCell.textContent();
            if (a) activityValues.push(a.trim());
            if (p) productivityValues.push(p.trim());
        }

        const uniqueActivity = [...new Set(activityValues)];
        const uniqueProductivity = [...new Set(productivityValues)];

        if (activityValues.length >= 2) {
            expect(uniqueActivity.length, 'Activity % should vary across rows (not all the same)').toBeGreaterThan(1);
        }
        if (productivityValues.length >= 2) {
            expect(uniqueProductivity.length, 'Productivity should vary across rows (not all the same)').toBeGreaterThan(1);
        }
    });
});
