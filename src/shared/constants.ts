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
  PAUSE_RECORDING: 'pause_recording',
  RESUME_RECORDING: 'resume_recording',

  // Step commands
  RECORD_STEP: 'record_step',
  GET_STEPS: 'get_steps',
  UPDATE_STEP: 'update_step',
  DELETE_STEP: 'delete_step',

  // Session commands
  CREATE_SESSION: 'create_session',
  GET_SESSION: 'get_session',
  GET_ALL_SESSIONS: 'get_all_sessions',
  DELETE_SESSION: 'delete_session',
  UPDATE_SESSION: 'update_session',

  // State commands
  GET_RECORDING_STATE: 'get_recording_state',
  CONTENT_SCRIPT_READY: 'content_script_ready',

  // Health check
  PING: 'ping',
  PONG: 'pong',
} as const;

// Event types
export const EVENT_TYPES = {
  CLICK: 'click',
  INPUT: 'input',
  SCROLL: 'scroll',
  NAVIGATION: 'navigation',
  PAGE_LOAD: 'pageLoad',
} as const;

// Timing configurations (in milliseconds)
export const TIMING = {
  EVENT_QUEUE_BATCH: 100,
  SCROLL_THROTTLE: 200,
  HEARTBEAT_INTERVAL: 5000,
  CONTENT_SCRIPT_TIMEOUT: 5000,
  RETRY_DELAY: 1000,
  MAX_RETRIES: 3,
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
