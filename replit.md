# Clash Royale Manager - Replit Setup

## Project Overview

This is a modern Progressive Web App (PWA) for managing Clash Royale clans. The application features a Vue 3 + TypeScript frontend with a Material Design interface, powered by Vite for development and building.

**Key Features:**
- 🏆 Clan leaderboard tracking
- 🔭 Recruiter/headhunter for finding new members
- 📊 War log history and analytics
- 📱 Progressive Web App with offline support
- 🎨 Modern Material Design UI with Tailwind CSS

## Architecture

### Frontend
- **Framework:** Vue 3 with TypeScript
- **Build Tool:** Vite 7.x
- **Styling:** Tailwind CSS 4.x
- **Routing:** Vue Router with hash-based navigation
- **PWA:** vite-plugin-pwa with Workbox

### Backend
- **Service:** Google Apps Script (GAS)
- **Purpose:** Acts as a data bridge between the frontend and Clash Royale API
- **Deployment:** Manual deployment required (see backend/GAS_Setup.md)
- **API:** RESTful endpoints exposed via GAS Web App

## Project Structure

```
.
├── backend/           # Google Apps Script source files (manual deployment)
│   ├── GAS_Setup.md  # Backend deployment instructions
│   └── *.gs.js       # GAS source files
├── frontend/          # Vue 3 PWA application
│   ├── src/
│   │   ├── api/      # GAS client API
│   │   ├── components/
│   │   ├── views/
│   │   └── router/
│   ├── public/       # Static assets (icons, images)
│   └── package.json
└── replit.md         # This file
```

## Running the Application

The application is configured to run automatically on Replit. The Vite dev server starts on port 5000 and serves the frontend.

**Development Server:**
- Host: 0.0.0.0
- Port: 5000
- Hot Module Replacement (HMR) enabled

## Configuration

### Environment Variables

The application requires a Google Apps Script Web App URL to function. To configure:

1. Copy `frontend/.env.example` to `frontend/.env`
2. Deploy the backend following instructions in `backend/GAS_Setup.md`
3. Add your GAS Web App URL to `frontend/.env`:
   ```
   VITE_GAS_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
   ```

### Backend Setup

The backend is a Google Apps Script that must be deployed separately. See `backend/GAS_Setup.md` for detailed instructions on:
- Creating a new GAS project
- Pasting the source code
- Configuring Clash Royale API credentials
- Deploying as a Web App

## Development

### Commands

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Key Files

- `frontend/vite.config.ts` - Vite configuration (port, host, PWA settings)
- `frontend/src/api/gasClient.ts` - Backend API client
- `frontend/src/router/index.ts` - Route definitions
- `frontend/.env.example` - Environment variable template

## Deployment

The application is configured for deployment on Replit with static hosting. The build process:
1. Compiles TypeScript to JavaScript
2. Bundles assets with Vite
3. Generates PWA manifest and service worker
4. Outputs to `frontend/dist/`

## Recent Changes

**December 8, 2024 - UI Enhancements:**
- Created DataFreshnessPill component showing time-ago display with click-to-refresh
- Integrated status pill into Leaderboard, Recruiter, and War Log views via ConsoleHeader #status slot
- Added forceRefresh() and getLastUpdateTimestamp() API methods for manual refresh flows
- Removed Share button from MemberCard and RecruitCard extended panels (UI cleanup)
- Created appSettings store with reactive state and localStorage persistence for module management
- Overhauled Settings view with Material Design 3 styling (Modules, API Config, About sections)
- Implemented War Log module toggle with conditional navigation and router guards

**December 8, 2024 - Initial Setup:**
- Initial setup for Replit environment
- Configured Vite to bind to 0.0.0.0:5000
- Updated base path from GitHub Pages (`/Clash_Manager-Clan_Tracker/`) to root (`/`)
- Added Replit-specific files to .gitignore
- Configured workflow for automatic dev server startup

## User Preferences

- Material Design 3 CSS variables preferred (--sys-color-*, --shape-corner-*, --sys-motion-spring)
- SWR caching pattern for API calls with forceRefresh capability
- Modular feature system allowing users to enable/disable features like War Log

## Notes

- The application uses hash-based routing (`createWebHashHistory`) for GitHub Pages compatibility
- PWA features include offline support, caching, and installability
- Backend deployment is manual and required before the app is functional
- The app expects a GAS backend URL in the environment variables
