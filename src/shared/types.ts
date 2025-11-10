// Core type definitions for the Chrome Workflow Recorder

export type StepType =
  | 'click'
  | 'input'
  | 'change'
  | 'submit'
  | 'scroll'
  | 'navigation'
  | 'pageLoad'
  | 'hover'
  | 'keypress'
  | 'focus'
  | 'blur';

export interface Viewport {
  width: number;
  height: number;
}

export interface ElementContext {
  tagName: string;
  attributes: Record<string, string>;
  textContent: string;
  boundingBox: DOMRect;
  computedStyles: Partial<CSSStyleDeclaration>;
  elementHash: string;
  parentContext?: ParentContext;
}

export interface ParentContext {
  tagName: string;
  attributes: Record<string, string>;
  textContent: string;
}

export interface VisualCapture {
  viewport?: string;
  annotated?: string;
  thumbnail?: string;
}

export interface PageReadinessState {
  isReady: boolean;
  reason: string;
  duration: number;
  checks: {
    domStable: boolean;
    resourcesLoaded: boolean;
    noSkeletons: boolean;
  };
}

export interface StepMetadata {
  description?: string;
  waitTime?: number;
  [key: string]: any; // Allow any additional metadata
}

export interface RecordedStep {
  id: string;
  sessionId: string;
  timestamp: number;
  type: StepType;
  selector: string;
  value?: string | boolean | null;
  url?: string;
  viewport?: Viewport;
  alternativeSelectors?: string[];
  elementContext?: ElementContext;
  visual?: VisualCapture;
  metadata?: StepMetadata;
}

/**
 * Step data before it's assigned an ID and session ID
 * Used when creating new steps in event handlers
 */
export type StepData = Omit<RecordedStep, 'id' | 'sessionId'>;

export interface SessionMetadata {
  title: string;
  description?: string;
  startUrl: string;
  createdAt: number;
  tags?: string[];
}

export interface Session {
  id: string;
  metadata: SessionMetadata;
  steps: RecordedStep[];
  createdAt: number;
  updatedAt: number;
}

export interface MessagePayload {
  command: string;
  data?: any;
  tabId?: number;
}

export interface MessageResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export type MessageHandler = (data: any, sender: chrome.runtime.MessageSender) => Promise<MessageResponse> | MessageResponse;

// Selector strategies
export interface SelectorStrategy {
  primary: string;
  fallbacks: string[];
  confidence: number;
}

// Recording state
export type RecordingStatus = 'idle' | 'recording';

export interface RecordingState {
  status: RecordingStatus;
  sessionId: string | null;
  currentTabId: number | null;
  stepCount: number;
}
