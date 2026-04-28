# TimeFlow Desktop Agent E2E Test Suite

## Overview

This comprehensive E2E test suite validates the entire TimeFlow Desktop Agent functionality using Playwright and Supabase. The tests cover all user interfaces, database operations, offline sync behavior, and security policies.

## Test Coverage

### 🖥️ **Screen Coverage**
1. **Dashboard** - Overview, quick actions, live counters
2. **Time Tracker** - Project start/stop, idle auto-pause
3. **Today's History** - Daily overview, timeline, activity logs
4. **Screenshots Gallery** - Filters, modal views, storage verification
5. **App Detection** - Real-time app/window tracking
6. **URL Detection** - Browser activity tracking
7. **Activity Monitor** - Between-screenshot insights

### 🗄️ **Database Testing**
- ✅ Session management (time_logs)
- ✅ Activity tracking (activities, app_logs, url_logs)
- ✅ Screenshot storage and metadata
- ✅ Idle detection and logging
- ✅ Offline queue and sync behavior
- ✅ RLS security and cross-tenant isolation

### 🔄 **Offline/Online Sync**
- ✅ Offline data queuing
- ✅ Online sync with conflict-safe upserts
- ✅ Idempotency verification
- ✅ Original timestamp preservation

### 🔒 **Security Testing**
- ✅ Row Level Security (RLS) enforcement
- ✅ Cross-tenant data isolation
- ✅ Authentication verification
- ✅ Storage access controls

## Prerequisites

### Environment Setup
```bash
# Install Node.js 18+
# Install dependencies
cd tests
npm install
npm run install:browsers

# Set up environment variables
cp ../.env.example .env
# Edit .env with test Supabase credentials:
# TEST_SUPABASE_URL=your-test-project-url
# TEST_SUPABASE_ANON_KEY=your-test-anon-key
# TEST_SUPABASE_SERVICE_KEY=your-test-service-key
```

### Desktop Agent Setup
The desktop agent must be configured with TEST_MODE support:

```javascript
// In desktop-agent/src/main.js or similar
if (process.env.TEST_MODE === '1') {
  // Register test IPC handlers
  ipcMain.handle('test:getState', () => ({ /* current state */ }));
  ipcMain.handle('test:forceIdle', (event, ms) => { /* force idle for ms */ });
  ipcMain.handle('test:snapNow', () => { /* trigger screenshot */ });
  ipcMain.handle('test:focusApp', (event, { name, title }) => { /* simulate app focus */ });
  ipcMain.handle('test:focusUrl', (event, url) => { /* simulate URL focus */ });
  ipcMain.handle('test:offline', () => { /* simulate offline mode */ });
  ipcMain.handle('test:online', () => { /* simulate online mode */ });
  ipcMain.handle('test:clearQueues', () => { /* clear offline queues */ });
  ipcMain.handle('test:setProject', (event, projectId) => { /* set current project */ });
}
```

### Supabase Test Environment
Create a separate Supabase project for testing or use separate schemas:

1. **Test Database**: Use separate project or schema with `test_` prefix
2. **Test Storage**: Use `screenshots-test` bucket or path prefix `test/{test_run_id}/`
3. **RLS Policies**: Ensure policies work with test users

## Running Tests

### Basic Test Execution
```bash
# Run all tests (headless)
npm test

# Run with browser UI
npm run test:headed

# Run specific test file
npx playwright test desktop-agent.spec.ts

# Run tests with debug mode
npm run test:debug

# Run tests interactively
npm run test:ui
```

### Test Filtering
```bash
# Run only UI tests
npx playwright test --grep "@ui"

# Run only database tests
npx playwright test --grep "@db"

# Run only critical tests
npx playwright test --grep "@critical"

# Run security tests
npx playwright test --grep "@security"
```

### Parallel Execution
```bash
# Run tests in parallel (default: 1 worker for stability)
npx playwright test --workers=2

# Run specific tests in parallel
npx playwright test --grep "@ui" --workers=3
```

## Test Data Management

### Automatic Cleanup
- **Global Setup**: Creates test org, user, and projects
- **Global Teardown**: Cleans all test data by `test_run_id`
- **Per-test Isolation**: Each test run gets unique identifiers

### Manual Cleanup
```bash
# Clean up test data manually if needed
npx playwright test --grep "cleanup"
```

## Test Reports

### HTML Report
```bash
# Generate and view HTML report
npm run test:report
```

### JSON Report
Test results are saved to `test-results/results.json`

### Screenshots
Failed tests automatically capture screenshots to `test-results/screenshots/`

## Test Structure

### Key Files
```
tests/
├── playwright.config.ts      # Playwright configuration
├── global.setup.ts          # Test data seeding
├── global.teardown.ts       # Test cleanup
├── desktop-agent.spec.ts    # Main test suite
├── utils/
│   ├── electron.ts          # Electron launcher & hooks
│   └── supabase.ts          # Database utilities
└── README.md               # This file
```

### Test Helpers

#### Electron Utilities
```typescript
const electronApp = new ElectronTestApp(testRunId);
const { hooks } = await electronApp.launch();

// Simulate test scenarios
await hooks.forceIdle(60000);     // 60s idle
await hooks.snapNow();            // Trigger screenshot
await hooks.focusApp('VS Code', 'main.js');
await hooks.offline();            // Go offline
```

#### Database Utilities
```typescript
const supabase = createTestSupabaseClient(testRunId);

// Verify data
const sessions = await supabase.getTimeLogs(userId);
const screenshots = await supabase.getScreenshots(userId);

// Seed test data
await supabase.insertTestSession(userId, projectId);
await supabase.insertTestScreenshot(userId, sessionId);
```

## Debugging Tests

### Debug Mode
```bash
# Run in debug mode with browser inspector
npm run test:debug

# Debug specific test
npx playwright test desktop-agent.spec.ts:100 --debug
```

### Console Logs
Test output includes:
- 🧪 Test setup/teardown logs
- 📋 Test run ID for data tracking
- ✅ Success confirmations
- ❌ Detailed error messages
- 🗄️ Database operation results

### Screenshots on Failure
Failed tests automatically capture:
- Full page screenshots
- Element-specific screenshots
- Video recordings (when enabled)

## Performance Considerations

### Test Timing
- **Global Setup**: ~10-15 seconds (user creation, seeding)
- **Per Test**: ~5-30 seconds depending on complexity
- **Total Suite**: ~3-4 minutes for full run
- **Cleanup**: ~5-10 seconds

### Resource Usage
- **Database**: Isolated by `test_run_id` 
- **Storage**: Uses test bucket/prefix
- **Memory**: Electron app per test run
- **Network**: Minimized with offline simulation

## CI/CD Integration

### GitHub Actions Example
```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          cd tests
          npm install
          npm run install:browsers
      
      - name: Run E2E tests
        run: |
          cd tests
          npm test
        env:
          TEST_SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
          TEST_SUPABASE_ANON_KEY: ${{ secrets.TEST_SUPABASE_ANON_KEY }}
          TEST_SUPABASE_SERVICE_KEY: ${{ secrets.TEST_SUPABASE_SERVICE_KEY }}
      
      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: tests/test-results/
```

## Known Limitations

1. **macOS Permissions**: Tests may require manual permission grants
2. **Timing Dependencies**: Some tests rely on realistic timing intervals
3. **Platform Differences**: App detection varies by OS
4. **Network Simulation**: Limited offline/online simulation capabilities

## Troubleshooting

### Common Issues

#### Test Timeouts
```bash
# Increase timeout for slow operations
npx playwright test --timeout=120000
```

#### Permission Errors
```bash
# Ensure proper Supabase credentials
echo $TEST_SUPABASE_URL
echo $TEST_SUPABASE_ANON_KEY
```

#### Electron Launch Issues
```bash
# Verify desktop agent path
ls -la ../desktop-agent/src/main.js

# Check for TEST_MODE support
grep -r "TEST_MODE" ../desktop-agent/
```

#### Database Connection
```bash
# Test Supabase connection
curl -H "apikey: $TEST_SUPABASE_ANON_KEY" \
     "$TEST_SUPABASE_URL/rest/v1/"
```

## Contributing

### Adding New Tests
1. Follow existing test structure
2. Use appropriate tags (@ui, @db, @critical, @security)
3. Include both positive and negative test cases
4. Verify database side effects
5. Clean up test data

### Best Practices
- ✅ Use deterministic test data
- ✅ Assert both UI and database state
- ✅ Include error scenarios
- ✅ Use meaningful test descriptions
- ✅ Tag tests appropriately
- ✅ Keep tests isolated and independent

## Support

For issues with the test suite:
1. Check console logs and screenshots
2. Verify environment variables
3. Ensure desktop agent has TEST_MODE support
4. Check Supabase permissions and RLS policies
5. Review test data isolation
