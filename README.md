# Workflow Recorder - Chrome Extension

A powerful Chrome extension for recording and replaying user workflows. Built as a Guideflow alternative with React 19, TypeScript, and Vite.

## Features

### ✅ Step 1: Extension Foundation & Communication Infrastructure (COMPLETED)

- **Chrome Extension Manifest V3** - Modern extension architecture
- **React 19 + TypeScript** - Type-safe UI development
- **Vite Build System** - Fast development with HMR
- **Tailwind CSS** - Rapid UI styling
- **Message Broker** - Cross-context communication between background, content scripts, and UI
- **Recorder Controller** - Centralized recording state management
- **IndexedDB Storage** - Persistent session and step storage

### 🚧 Coming Soon

- **Step 2**: Event Capture System
- **Step 3**: Element Identification & Context
- **Step 4**: Visual Documentation System
- **Step 5**: Interactive Viewer & Editor
- **Step 6**: Intelligent Replay with Drift Detection

## Project Structure

```
workflow/
├── src/
│   ├── background/          # Background service worker
│   │   ├── service-worker.ts
│   │   ├── RecorderController.ts
│   │   └── MessageBroker.ts
│   ├── content/             # Content scripts (injected into web pages)
│   │   └── content.ts
│   ├── popup/               # Extension popup UI
│   │   ├── Popup.tsx
│   │   ├── popup.tsx
│   │   ├── popup.html
│   │   └── popup.css
│   ├── viewer/              # Session viewer UI
│   │   ├── Viewer.tsx
│   │   ├── index.tsx
│   │   ├── viewer.html
│   │   └── viewer.css
│   └── shared/              # Shared utilities and types
│       ├── types.ts
│       ├── constants.ts
│       └── db.ts            # IndexedDB wrapper
├── public/
│   ├── manifest.json        # Extension manifest
│   └── icons/               # Extension icons
├── dist/                    # Build output
└── vite.config.ts          # Vite configuration
```

## Development

### Prerequisites

- Node.js 18+
- npm

### Install Dependencies

```bash
npm install
```

### Build the Extension

```bash
npm run build
```

This will:
1. Compile TypeScript
2. Bundle with Vite
3. Output to `dist/` directory

### Development Mode

```bash
npm run dev
```

This will watch for changes and rebuild automatically.

## Loading the Extension in Chrome

**⚠️ IMPORTANT: You must load the `dist` folder, NOT the root project folder or `public` folder!**

1. **Build the extension:**
   ```bash
   npm run build
   ```

2. **Open Chrome and navigate to:**
   ```
   chrome://extensions/
   ```

3. **Enable Developer Mode:**
   - Toggle the "Developer mode" switch in the top right corner

4. **Load the extension:**
   - Click "Load unpacked"
   - Navigate to: **`~/Documents/workflow/dist`**
   - Select the `dist` folder (this is crucial!)

5. **The extension is now loaded!**
   - You should see "Workflow Recorder" in your extensions list
   - Click the extension icon in the toolbar to open the popup
   - Start recording workflows

### Troubleshooting

**If you see "Manifest file is missing or unreadable":**
- Make sure you selected the `dist` folder, not the root project folder
- The correct path should end with `/workflow/dist`
- Run `npm run build` first to generate the dist folder

**If you see "Could not load javascript 'content/content.js'":**
- The build didn't complete successfully
- Delete the `dist` folder and run `npm run build` again
- Make sure there are no TypeScript errors

## Usage

### Recording a Workflow

1. Click the extension icon to open the popup
2. Enter a session title (e.g., "User Registration Flow")
3. Click "Start Recording"
4. Perform actions on the web page
5. Click "Stop Recording" when done

### Viewing Sessions

1. Click the extension icon
2. Click "View Sessions"
3. See all recorded sessions with step counts and timestamps
4. Delete sessions as needed

## Architecture

### Communication Flow

```
┌─────────────┐         ┌──────────────────┐         ┌────────────────┐
│   Popup UI  │◄───────►│  Background      │◄───────►│  Content       │
│  (React)    │ Messages│  Service Worker  │ Messages│  Script        │
└─────────────┘         └──────────────────┘         └────────────────┘
                               │
                               ▼
                        ┌─────────────┐
                        │  IndexedDB  │
                        └─────────────┘
```

### Key Components

- **MessageBroker**: Handles all cross-context messaging
- **RecorderController**: Manages recording state and coordinates between tabs
- **DB**: IndexedDB wrapper for persistent storage
- **Content Script**: Injected into web pages (will capture events in Step 2)

## Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool with HMR
- **Tailwind CSS** - Utility-first CSS
- **IndexedDB** - Client-side storage
- **Chrome Extensions API** - Manifest V3

## Development Progress

- [x] Step 1: Extension Foundation & Communication Infrastructure
- [ ] Step 2: Event Capture System
- [ ] Step 3: Element Identification
- [ ] Step 4: Visual Documentation
- [ ] Step 5: Viewer & Editor
- [ ] Step 6: Intelligent Replay

## License

ISC
