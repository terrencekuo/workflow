// Constants for the Chrome Workflow Recorder

// Database configuration
export const DB_NAME = 'workflow_recorder_db';
export const DB_VERSION = 1;
export const STORE_SESSIONS = 'sessions';
export const STORE_STEPS = 'steps';

// Message commands
export const COMMANDS = {
  // Recording commands
  START_RECORDING: 'start_recording',
  STOP_RECORDING: 'stop_recording',

  // Step commands
  RECORD_STEP: 'record_step',
  CAPTURE_SCREENSHOT: 'capture_screenshot',
  UPDATE_STEP: 'update_step',

  // Session commands
  GET_SESSION: 'get_session',
  GET_ALL_SESSIONS: 'get_all_sessions',
  DELETE_SESSION: 'delete_session',

  // State commands
  GET_RECORDING_STATE: 'get_recording_state',
  CONTENT_SCRIPT_READY: 'content_script_ready',

  // Page detection
  DETECT_PAGE_READINESS: 'detect_page_readiness',

  // Health check
  PING: 'ping',
  PONG: 'pong',
} as const;

// Event types
export const EVENT_TYPES = {
  CLICK: 'click',
  INPUT: 'input',
  CHANGE: 'change',
  SUBMIT: 'submit',
  SCROLL: 'scroll',
  NAVIGATION: 'navigation',
  PAGE_LOAD: 'pageLoad',
  HOVER: 'hover',
  KEYPRESS: 'keypress',
  FOCUS: 'focus',
  BLUR: 'blur',
} as const;

// Timing configurations (in milliseconds)
export const TIMING = {
  // Event recording
  EVENT_QUEUE_BATCH: 100,
  SCROLL_THROTTLE: 200,
  HEARTBEAT_INTERVAL: 5000,
  CONTENT_SCRIPT_TIMEOUT: 5000,
  RETRY_DELAY: 1000,
  MAX_RETRIES: 3,

  // Page readiness detection
  PAGE_LOAD_MAX_TIMEOUT: 10000,        // Max time to wait for page to be ready (10s)
  DOM_STABILITY_WAIT: 800,             // Time of no DOM changes to consider stable (0.8s)
  SKELETON_MAX_WAIT: 5000,             // Max time to wait for skeleton loaders to disappear (5s)
  SKELETON_CHECK_INTERVAL: 100,        // Interval to check for skeleton elements (100ms)
  RESOURCE_LOAD_TIMEOUT: 5000,         // Timeout for individual resources (5s)

  // Screenshot capture
  ZOOM_REFLOW_WAIT: 300,               // Wait time after zoom change for page reflow
  HIGHLIGHT_RENDER_WAIT: 150,          // Wait time for highlight overlay to render
  SCROLL_COMPLETE_WAIT: 300,           // Wait time for scroll animation to complete

  // Content script initialization
  CONTENT_SCRIPT_INIT_WAIT: 500,       // Wait time after injecting content script
  PAGE_READINESS_FALLBACK_DELAY: 500,  // Fallback delay if page detection fails
} as const;

// Storage keys
export const STORAGE_KEYS = {
  RECORDING_STATE: 'recording_state',
  CURRENT_SESSION: 'current_session',
  USER_PREFERENCES: 'user_preferences',
} as const;

// Extension configuration
export const CONFIG = {
  MAX_STEPS_PER_SESSION: 1000,
  MAX_SESSIONS: 100,
  SCREENSHOT_QUALITY: 0.8,
  THUMBNAIL_WIDTH: 200,
  THUMBNAIL_HEIGHT: 150,
} as const;
