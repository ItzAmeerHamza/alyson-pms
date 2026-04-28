# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Web Admin Development
```bash
npm run dev              # Start development server (port 8080)
npm run build            # Production build
npm run build:dev        # Development build
npm run lint             # Run ESLint
npm run preview          # Preview production build
```

### Desktop Agent Development
```bash
cd desktop-agent
npm start               # Run desktop agent locally
npm run build          # Build all platforms
npm run build:mac      # Build macOS (.dmg)
npm run build:dmg      # Build macOS DMG specifically
npm run prebuild       # Generate env config before build
```

### Backend Development
```bash
cd backend
npm run start:dev      # Start development server with watch
npm run build         # Build for production
npm run test          # Run tests with Vitest
npm run test:watch    # Run tests in watch mode
npm run lint          # Run ESLint
```

### Testing Commands
```bash
# Desktop Agent Testing
cd desktop-agent
npm run app:probe      # Probe app detection functionality
npm run test-screenshot # Test screenshot capture
npm run test-mac       # Test macOS permissions

# Backend Testing  
cd backend
npm run test:e2e      # Run end-to-end tests
npm run test:cov      # Run tests with coverage
```

## Project Architecture

TimeFlow is an employee time tracking and productivity monitoring system with three main components:

### 1. Web Admin (`/src/`)
- **Purpose**: Administrator dashboard accessible via web browser
- **Tech Stack**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Key Features**: Employee management, reports, analytics, screenshot viewer, project tracking
- **Build Output**: Static files deployable to any web server
- **Port**: 8080 (development)

### 2. Desktop Agent (`/desktop-agent/`)
- **Purpose**: Lightweight background monitoring application for employee machines
- **Tech Stack**: Electron + Node.js + Supabase client
- **Key Features**: Screenshot capture, app/URL tracking, idle detection, anti-cheat monitoring
- **Build Output**: Cross-platform installers (.dmg, .exe, .AppImage)
- **Permissions Required**: Screen recording, accessibility (macOS), admin (Windows)

### 3. Backend Service (`/backend/`)
- **Purpose**: NestJS-based API server for AI analysis and advanced processing
- **Tech Stack**: NestJS + TypeScript + Supabase + Bull/Redis queues
- **Key Features**: AI screenshot analysis, email reports, notifications, batch processing
- **Build Output**: Node.js application
- **Port**: 3000 (default)

### Data Flow Architecture
```
Desktop Agents → Supabase Database ← Web Admin
                      ↕
                Backend Service
```

### Key Directories
- `/src/pages/` - Web admin page components
- `/src/components/ui/` - shadcn/ui components
- `/desktop-agent/src/modules/` - Modular desktop agent functionality
- `/desktop-agent/src/platform/` - Platform-specific implementations
- `/backend/src/` - NestJS backend modules
- `/supabase/` - Database migrations and edge functions

## Configuration Management

### Environment Variables
- **Web Admin**: `.env` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- **Desktop Agent**: Uses `env-config.js` generated from environment or `config.json`
- **Backend**: Standard NestJS environment configuration

### Build Configuration
- Web uses Vite with TypeScript compilation via `tsconfig.app.json`
- Desktop agent uses Electron Builder with cross-platform targets
- Backend uses NestJS CLI with standard TypeScript compilation

## Code Signing and Release Process

### Build Requirements (from project rules)
- macOS builds (.dmg) must be code signed with Apple Developer ID Application certificate
- All .dmg builds must be notarized via Apple notarization service
- Windows builds (.exe) must be signed using EV Code Signing Certificate
- Signed builds automatically pushed to GitHub Releases
- Download URLs updated in web and app after each release

### Release Scripts
- `/scripts/` contains automated build and release scripts
- Electron Builder configured for multi-platform builds (Intel/ARM64 macOS, Windows x64, Linux x64)

## Database and State Management

### Primary Database: Supabase PostgreSQL
- **Tables**: time_logs, screenshots, users, projects, app_logs, idle_logs
- **Auth**: Supabase Auth with RLS policies
- **Storage**: Supabase Storage for screenshot files
- **Real-time**: Supabase Realtime subscriptions

### State Management
- Web Admin: React Query (@tanstack/react-query) for server state
- Desktop Agent: Local state with Supabase sync
- Authentication: Supabase Auth across all components

## Security Considerations

### Desktop Agent Security
- Credentials stored using keytar (secure OS keychain)
- Screenshots uploaded with authentication tokens
- Cross-platform input detection with proper permissions
- Anti-cheat detection to prevent manipulation

### Web Admin Security
- Row Level Security (RLS) policies in Supabase
- Role-based access control (admin vs employee)
- Input sanitization components in `/src/components/security/`

## Platform-Specific Notes

### macOS
- Requires Screen Recording permission
- Requires Accessibility permission for input tracking
- Code signing and notarization required for distribution
- Entitlements configured in `entitlements.mac.plist`

### Windows  
- May require administrator permissions
- Registry entries for auto-start functionality
- Code signing required for production distribution

### Linux
- AppImage format for distribution
- Desktop file installation for auto-start
- Permission handling varies by distribution

## AI Analysis System

The backend includes comprehensive AI analysis capabilities:
- Screenshot content analysis
- Suspicious activity detection  
- Employee productivity insights
- Automated email reporting
- Batch processing with job queues

## Development Workflow

1. **Local Development**: Use `npm run dev` for web admin hot reloading
2. **Desktop Agent Testing**: Use probe commands to test functionality without full deployment
3. **Database Changes**: Create migrations in `/supabase/migrations/`
4. **Cross-Platform Testing**: Build and test on target platforms before release
5. **Integration Testing**: Ensure desktop agent ↔ web admin data sync works correctly

## Important Files
- `package.json` (root) - Web admin dependencies and scripts
- `desktop-agent/package.json` - Desktop agent dependencies and Electron Builder config  
- `backend/package.json` - Backend service dependencies
- `supabase/config.toml` - Supabase project configuration
- `vite.config.ts` - Vite build configuration with environment handling