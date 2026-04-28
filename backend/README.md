# Time Flow Backend

A lightweight NestJS service for employee tracking with activity analysis, unusual pattern detection, and smart notifications.

## Features

- **REST + GraphQL APIs** for screenshots, apps, URLs, time tracking
- **Background Jobs** for activity analysis and unusual pattern detection
- **Smart Notifications** via Slack and email
- **Image Processing** with optional blur for privacy
- **Role-based Access Control** (admin, manager, user)
- **Real-time Subscriptions** for screenshot events

## Tech Stack

- Node.js 20 + TypeScript
- NestJS 10 (Fastify)
- Supabase (Database + Storage)
- BullMQ (Redis) for background jobs
- Sharp for image processing
- GraphQL subscriptions
- Slack webhooks + Nodemailer

## Quick Start

### 1. Environment Setup

```bash
cp .env.example .env
```

Configure your `.env` file:

```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# Notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/your/webhook
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=your-email@gmail.com

# Activity Analysis
SCREENSHOT_BLUR_ENABLED=false
LOW_ACTIVITY_THRESHOLD=30
LONG_SESSION_THRESHOLD=18000
ACTIVITY_DROP_THRESHOLD=50
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Development

```bash
# Start in development mode
npm run start:dev

# Run tests
npm run test

# Build for production
npm run build
```

### 4. Docker Deployment

```bash
# Build and start services
docker-compose up -d

# View logs
docker-compose logs -f api

# Stop services
docker-compose down
```

## API Endpoints

### Authentication
All endpoints require Bearer token authentication except where noted.

### Time Tracking
```bash
# Start time tracking
POST /api/time/start
{
  "project_id": "uuid",
  "task_id": "uuid", // optional
  "description": "Working on feature X"
}

# Stop time tracking
POST /api/time/stop
{
  "time_log_id": "uuid", // optional, finds active if not provided
  "description": "Completed feature X"
}

# Get time logs
GET /api/time-logs?start_date=2024-01-01&end_date=2024-01-31&user_id=uuid
```

### Activity Logging
```bash
# Batch insert app logs
POST /api/apps
[
  {
    "app_name": "Visual Studio Code",
    "window_title": "main.ts",
    "started_at": "2024-01-01T10:00:00Z",
    "ended_at": "2024-01-01T10:05:00Z",
    "category": "core"
  }
]

# Batch insert URL logs
POST /api/urls
[
  {
    "site_url": "https://github.com",
    "started_at": "2024-01-01T10:00:00Z",
    "ended_at": "2024-01-01T10:05:00Z",
    "category": "core"
  }
]
```

### Screenshots
```bash
# Upload batch of screenshots (max 10)
POST /api/screenshots/batch
Content-Type: multipart/form-data
screenshots: [file1.jpg, file2.jpg, ...]

# Get screenshots
GET /api/screenshots?start_date=2024-01-01&limit=50

# Get timeline for specific date
GET /api/screenshots/timeline?date=2024-01-01

# Get activity summary
GET /api/screenshots/activity-summary?start_date=2024-01-01&end_date=2024-01-31
```

### Insights & Analytics
```bash
# Detect unusual activity (admin/manager only)
GET /api/insights/unusual-activity?user_id=uuid

# Get unusual activity history
GET /api/insights/unusual-activity/history?start_date=2024-01-01

# Get productivity insights
GET /api/insights/productivity?start_date=2024-01-01&end_date=2024-01-31
```

### Dashboard
```bash
# Get dashboard data
GET /api/dashboard
# Returns: hours_today, hours_this_week, weekly_activity_percent, recent_screenshots, low_activity_users
```

### Notifications
```bash
# Get notifications
GET /api/notifications?unread_only=true

# Mark as read
POST /api/notifications/:id/read
```

## GraphQL Subscriptions

Real-time subscriptions powered by Redis for screenshot events:

```graphql
subscription {
  screenshotCaptured(userId: "optional-user-id") {
    id
    image_url
    captured_at
    activity_percent
    userId
  }
}
```

**Features:**
- Redis-based pub/sub for scalable real-time updates
- Optional user filtering (subscribe to specific user's screenshots)
- Automatic event publishing when screenshots are uploaded
- WebSocket transport with fallback support

## Background Jobs

### Activity Analyzer (Every 5 minutes)
- Calculates `activity_percent` and `focus_percent` for screenshots
- Analyzes app/URL logs in 4-minute windows around screenshot time
- Classifies activity as `core`, `non_core`, or `unproductive`

### Unusual Detector (Every 10 minutes)
- **Low Activity**: <30% activity for 30+ minutes
- **Long Session**: >5 hours continuous work
- **Activity Drop**: >50 point drop in activity over 2 hours

### Notification Pusher (Every minute)
- Delivers pending notifications via Slack and email
- Updates delivery status in database

## Electron Client Integration

### cURL Examples for Desktop Agent

```bash
# Start time tracking
curl -X POST http://localhost:3000/api/time/start \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"project_id":"uuid","description":"Starting work"}'

# Upload screenshots
curl -X POST http://localhost:3000/api/screenshots/batch \
  -H "Authorization: Bearer $TOKEN" \
  -F "screenshots=@screenshot1.jpg" \
  -F "screenshots=@screenshot2.jpg"

# Send app logs
curl -X POST http://localhost:3000/api/apps \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"app_name":"Chrome","started_at":"2024-01-01T10:00:00Z","ended_at":"2024-01-01T10:05:00Z"}]'
```

## Testing

```bash
# Run unit tests
npm run test

# Run with coverage
npm run test:cov

# Run e2e tests
npm run test:e2e
```

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Electron      │    │   NestJS API    │    │   Supabase      │
│   Desktop       │───▶│   (Fastify)     │───▶│   Database      │
│   Agent         │    │                 │    │   + Storage     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   Redis         │
                       │   (BullMQ)      │
                       └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   Background    │
                       │   Workers       │
                       └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   Slack/Email   │
                       │   Notifications │
                       └─────────────────┘
```

## License

MIT 