# Desktop Agent

This folder contains a lightweight Electron application that captures screenshots and tracks idle time in the background.

## Setup

### 1. Install Dependencies

From the `desktop-agent` directory:

```bash
npm install
```

### 2. Configure Environment (IMPORTANT)

Before building or running the agent, you need to set up your environment variables:

```bash
# Run the setup script to create .env file
chmod +x setup-local-env.sh
./setup-local-env.sh
```

This creates a local `.env` file with the necessary Supabase credentials. The file is automatically ignored by git for security.

### 3. Run the Agent

```bash
npm run start
```

## Configuration

### Environment Variables (Secure)

Credentials are loaded from a local `.env` file that is **never committed to git**:

- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Your Supabase anonymous/public API key
- `SUPABASE_SERVICE_ROLE_KEY` - (Optional) Service role key for admin operations

### Application Settings

Edit `config.json` for other application settings like:
- `user_id` - Default user for tracking
- `project_id` - Default project (optional)
- Screenshot intervals, idle thresholds, etc.

## Environment Variables

### Logging Control
- `TIMEFLOW_LOG_LEVEL` or `LOG_LEVEL`: Set logging level (debug, info, warn, error). Default: info in production, debug in development
- `DEBUG_APP`: Enable verbose app detection logging (1 = enabled)
- `DEBUG_INPUT`: Enable verbose input event logging (1 = enabled) 
- `DEBUG_SCREENSHOT`: Enable verbose screenshot logging (1 = enabled)
- `DEBUG_URL`: Enable verbose URL capture logging (1 = enabled)
- `DEBUG_STATUS`: Enable verbose status logging (1 = enabled)

### Performance Tuning
- `URL_SYNC_BATCH_MAX`: Maximum URL logs per batch (default: 100)
- `URL_SYNC_FLUSH_MS`: URL sync flush interval (default: 1000ms)
- `URL_SYNC_OFFLINE_FLUSH_MS`: Offline URL sync flush interval (default: 2000ms)
- `URL_SYNC_STATEMENT_TIMEOUT_MS`: Database statement timeout (default: 2000ms)
- `APP_DETECT_SCHEDULE_JITTER_MS`: App detection jitter (default: 200ms)
- `APP_DETECT_TRANSIENT_FLUSH_MS`: Transient app flush interval (default: 60000ms)

## Security Notes

- ✅ Credentials are stored in local `.env` files (gitignored)
- ✅ No hardcoded credentials in the codebase
- ✅ File permissions set to 600 (owner only)
- ❌ Never commit `.env` files to version control

## Building

The build process automatically sets up the environment if needed:

```bash
# From project root
./build-test-dmg.sh
```

## Testing

Additional Windows validation scripts:

- `node test-windows-url-validation.js`
