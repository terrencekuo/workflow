import { COMMANDS } from '@/shared/constants';
import type { RecordedStep, StepData } from '@/shared/types';
import { DOMAnalyzer } from '@/content/DOMAnalyzer';
import {
  handleClick,
  handleChange,
  handleSubmit,
  handleNavigation,
  type EventHandlerContext,
} from '@/content/eventHandlers';

/**
 * Recorder class - Manages recording lifecycle and event listener registration
 */
export class Recorder {
  private isRecording = false;
  private sessionId: string | null = null;
  private eventListeners: Array<{
    element: EventTarget;
    event: string;
    handler: EventListener;
    options?: boolean | AddEventListenerOptions;
  }> = [];
  private domAnalyzer: DOMAnalyzer;

  constructor() {
    this.domAnalyzer = new DOMAnalyzer();
  }

  /**
   * Start recording user interactions
   */
  start(sessionId: string): void {
    if (this.isRecording) {
      console.warn('[Recorder] Already recording');
      return;
    }

    this.sessionId = sessionId;
    this.isRecording = true;
    this.setupEventListeners();
    console.log('[Recorder] Recording started for session:', sessionId);
  }

  /**
   * Stop recording and clean up event listeners
   */
  stop(): void {
    if (!this.isRecording) {
      console.warn('[Recorder] Not currently recording');
      return;
    }

    this.removeEventListeners();
    this.isRecording = false;
    this.sessionId = null;
    console.log('[Recorder] Recording stopped');
  }

  /**
   * Setup all event listeners for capturing interactions
   */
  private setupEventListeners(): void {
    const context = this.getHandlerContext();

    // Click events
    this.addListener(document, 'click', (e) => handleClick(e, context), true);

    // Change events (select, checkbox, radio)
    this.addListener(document, 'change', (e) => handleChange(e, context), true);

    // Form submission
    this.addListener(document, 'submit', (e) => handleSubmit(e, context), true);

    // Navigation
    this.addListener(window, 'popstate', () => handleNavigation(context));

    console.log('[Recorder] Event listeners setup complete');
  }

  /**
   * Remove all event listeners
   */
  private removeEventListeners(): void {
    this.eventListeners.forEach(({ element, event, handler, options }) => {
      element.removeEventListener(event, handler, options);
    });
    this.eventListeners = [];

    console.log('[Recorder] Event listeners removed');
  }

  /**
   * Helper to add and track event listeners
   */
  private addListener(
    element: EventTarget,
    event: string,
    handler: EventListener,
    options?: boolean | AddEventListenerOptions
  ): void {
    element.addEventListener(event, handler, options);
    this.eventListeners.push({ element, event, handler, options });
  }

  /**
   * Get handler context for event handlers
   */
  private getHandlerContext(): EventHandlerContext {
    return {
      domAnalyzer: this.domAnalyzer,
      recordStep: this.recordStep.bind(this),
    };
  }

  /**
   * Record a step and send to background
   */
  private recordStep(stepData: StepData): void {
    if (!this.isRecording || !this.sessionId) {
      return;
    }

    const step: RecordedStep = {
      ...stepData,
      id: crypto.randomUUID(),
      sessionId: this.sessionId,
    };

    // Send to background script
    chrome.runtime
      .sendMessage({
        command: COMMANDS.RECORD_STEP,
        data: step,
      })
      .catch((error) => {
        console.error('[Recorder] Failed to send step:', error);
      });
  }

}
