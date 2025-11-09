import { COMMANDS, EVENT_TYPES } from '@/shared/constants';
import type { RecordedStep } from '@/shared/types';

interface RecorderConfig {
  captureHovers: boolean;
  hoverDebounceMs: number;
  scrollDebounceMs: number;
  batchIntervalMs: number;
}

/**
 * Recorder class - Captures user interactions and DOM events
 * Implements intelligent event batching and debouncing
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
  private config: RecorderConfig;
  private hoverTimeout: number | null = null;
  private scrollTimeout: number | null = null;
  private lastScrollPosition = { x: 0, y: 0 };

  constructor(config?: Partial<RecorderConfig>) {
    this.config = {
      captureHovers: config?.captureHovers ?? false,
      hoverDebounceMs: config?.hoverDebounceMs ?? 500,
      scrollDebounceMs: config?.scrollDebounceMs ?? 300,
      batchIntervalMs: config?.batchIntervalMs ?? 100,
    };
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
    // Click events
    this.addListener(document, 'click', this.handleClick.bind(this), true);

    // Input events
    this.addListener(document, 'input', this.handleInput.bind(this), true);
    this.addListener(document, 'change', this.handleChange.bind(this), true);

    // Form submission
    this.addListener(document, 'submit', this.handleSubmit.bind(this), true);

    // Navigation
    this.addListener(window, 'beforeunload', this.handleBeforeUnload.bind(this));
    this.addListener(window, 'popstate', this.handleNavigation.bind(this));

    // Scroll events
    this.addListener(window, 'scroll', this.handleScroll.bind(this), { passive: true });

    // Hover events (optional)
    if (this.config.captureHovers) {
      this.addListener(document, 'mouseover', this.handleHover.bind(this), true);
    }

    // Keyboard events
    this.addListener(document, 'keydown', this.handleKeyDown.bind(this), true);

    // Focus events
    this.addListener(document, 'focus', this.handleFocus.bind(this), true);
    this.addListener(document, 'blur', this.handleBlur.bind(this), true);

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

    if (this.hoverTimeout) {
      window.clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }

    if (this.scrollTimeout) {
      window.clearTimeout(this.scrollTimeout);
      this.scrollTimeout = null;
    }

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
   * Handle click events
   */
  private handleClick(event: Event): void {
    const mouseEvent = event as MouseEvent;
    const target = mouseEvent.target as HTMLElement;

    if (!this.shouldCaptureElement(target)) {
      return;
    }

    this.recordStep({
      type: EVENT_TYPES.CLICK,
      selector: this.generateSelector(target),
      value: null,
      timestamp: Date.now(),
      metadata: {
        tagName: target.tagName.toLowerCase(),
        text: this.getElementText(target),
        href: target instanceof HTMLAnchorElement ? target.href : undefined,
        coordinates: {
          x: mouseEvent.clientX,
          y: mouseEvent.clientY,
          pageX: mouseEvent.pageX,
          pageY: mouseEvent.pageY,
        },
      },
    });
  }

  /**
   * Handle input events
   */
  private handleInput(event: Event): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;

    if (!this.shouldCaptureElement(target)) {
      return;
    }

    // Mask sensitive data
    const value = this.shouldMaskValue(target) ? '***MASKED***' : target.value;

    this.recordStep({
      type: EVENT_TYPES.INPUT,
      selector: this.generateSelector(target),
      value,
      timestamp: Date.now(),
      metadata: {
        tagName: target.tagName.toLowerCase(),
        inputType: target instanceof HTMLInputElement ? target.type : 'textarea',
        name: target.name,
        placeholder: target.placeholder,
      },
    });
  }

  /**
   * Handle change events (select, checkbox, radio)
   */
  private handleChange(event: Event): void {
    const target = event.target as HTMLInputElement | HTMLSelectElement;

    if (!this.shouldCaptureElement(target)) {
      return;
    }

    let value: string | boolean = '';
    let metadata: Record<string, any> = {
      tagName: target.tagName.toLowerCase(),
    };

    if (target instanceof HTMLInputElement) {
      if (target.type === 'checkbox') {
        value = target.checked;
        metadata.inputType = 'checkbox';
      } else if (target.type === 'radio') {
        value = target.value;
        metadata.inputType = 'radio';
      } else {
        value = this.shouldMaskValue(target) ? '***MASKED***' : target.value;
        metadata.inputType = target.type;
      }
    } else if (target instanceof HTMLSelectElement) {
      value = target.value;
      metadata.selectedIndex = target.selectedIndex;
    }

    this.recordStep({
      type: EVENT_TYPES.CHANGE,
      selector: this.generateSelector(target),
      value,
      timestamp: Date.now(),
      metadata,
    });
  }

  /**
   * Handle form submission
   */
  private handleSubmit(event: Event): void {
    const target = event.target as HTMLFormElement;

    this.recordStep({
      type: EVENT_TYPES.SUBMIT,
      selector: this.generateSelector(target),
      value: null,
      timestamp: Date.now(),
      metadata: {
        tagName: 'form',
        action: target.action,
        method: target.method,
      },
    });
  }

  /**
   * Handle scroll events with debouncing
   */
  private handleScroll(): void {
    if (this.scrollTimeout) {
      window.clearTimeout(this.scrollTimeout);
    }

    this.scrollTimeout = window.setTimeout(() => {
      const x = window.scrollX;
      const y = window.scrollY;

      // Only record if scroll position changed significantly
      if (
        Math.abs(x - this.lastScrollPosition.x) > 10 ||
        Math.abs(y - this.lastScrollPosition.y) > 10
      ) {
        this.recordStep({
          type: EVENT_TYPES.SCROLL,
          selector: 'window',
          value: null,
          timestamp: Date.now(),
          metadata: {
            scrollX: x,
            scrollY: y,
            scrollHeight: document.documentElement.scrollHeight,
            scrollWidth: document.documentElement.scrollWidth,
          },
        });

        this.lastScrollPosition = { x, y };
      }
    }, this.config.scrollDebounceMs);
  }

  /**
   * Handle hover events with debouncing
   */
  private handleHover(event: Event): void {
    const target = event.target as HTMLElement;

    if (!this.shouldCaptureElement(target)) {
      return;
    }

    if (this.hoverTimeout) {
      window.clearTimeout(this.hoverTimeout);
    }

    this.hoverTimeout = window.setTimeout(() => {
      this.recordStep({
        type: EVENT_TYPES.HOVER,
        selector: this.generateSelector(target),
        value: null,
        timestamp: Date.now(),
        metadata: {
          tagName: target.tagName.toLowerCase(),
          text: this.getElementText(target),
        },
      });
    }, this.config.hoverDebounceMs);
  }

  /**
   * Handle keydown events
   */
  private handleKeyDown(event: Event): void {
    const keyEvent = event as KeyboardEvent;
    const target = keyEvent.target as HTMLElement;

    // Only capture special keys (Enter, Tab, Escape, etc.)
    const specialKeys = ['Enter', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (!specialKeys.includes(keyEvent.key)) {
      return;
    }

    this.recordStep({
      type: EVENT_TYPES.KEYPRESS,
      selector: this.generateSelector(target),
      value: keyEvent.key,
      timestamp: Date.now(),
      metadata: {
        key: keyEvent.key,
        code: keyEvent.code,
        ctrlKey: keyEvent.ctrlKey,
        shiftKey: keyEvent.shiftKey,
        altKey: keyEvent.altKey,
        metaKey: keyEvent.metaKey,
      },
    });
  }

  /**
   * Handle focus events
   */
  private handleFocus(event: Event): void {
    const target = event.target as HTMLElement;

    if (!this.shouldCaptureElement(target)) {
      return;
    }

    this.recordStep({
      type: EVENT_TYPES.FOCUS,
      selector: this.generateSelector(target),
      value: null,
      timestamp: Date.now(),
      metadata: {
        tagName: target.tagName.toLowerCase(),
      },
    });
  }

  /**
   * Handle blur events
   */
  private handleBlur(event: Event): void {
    const target = event.target as HTMLElement;

    if (!this.shouldCaptureElement(target)) {
      return;
    }

    this.recordStep({
      type: EVENT_TYPES.BLUR,
      selector: this.generateSelector(target),
      value: null,
      timestamp: Date.now(),
      metadata: {
        tagName: target.tagName.toLowerCase(),
      },
    });
  }

  /**
   * Handle navigation events
   */
  private handleNavigation(): void {
    this.recordStep({
      type: EVENT_TYPES.NAVIGATION,
      selector: 'window',
      value: window.location.href,
      timestamp: Date.now(),
      metadata: {
        url: window.location.href,
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
      },
    });
  }

  /**
   * Handle before unload events
   */
  private handleBeforeUnload(): void {
    this.recordStep({
      type: EVENT_TYPES.NAVIGATION,
      selector: 'window',
      value: 'unload',
      timestamp: Date.now(),
      metadata: {
        type: 'unload',
        url: window.location.href,
      },
    });
  }

  /**
   * Record a step and send to background
   */
  private recordStep(stepData: Omit<RecordedStep, 'id' | 'sessionId'>): void {
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

  /**
   * Generate a unique selector for an element
   * This is a simple implementation - will be enhanced in Step 3
   */
  private generateSelector(element: Element): string {
    // If element has an ID, use it
    if (element.id) {
      return `#${element.id}`;
    }

    // Build path using classes and nth-child
    const path: string[] = [];
    let current: Element | null = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      if (current.className) {
        const classes = Array.from(current.classList)
          .filter((c) => !c.startsWith('hover:') && !c.startsWith('focus:'))
          .slice(0, 2)
          .join('.');
        if (classes) {
          selector += `.${classes}`;
        }
      }

      // Add nth-child if needed
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (e) => e.tagName === current!.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-child(${index})`;
        }
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  }

  /**
   * Get visible text content from an element
   */
  private getElementText(element: HTMLElement): string {
    const text = element.textContent?.trim() || '';
    return text.length > 50 ? text.substring(0, 47) + '...' : text;
  }

  /**
   * Check if element should be captured
   */
  private shouldCaptureElement(element: Element): boolean {
    // Skip if element is not in the document
    if (!document.contains(element)) {
      return false;
    }

    // Skip script and style tags
    if (element instanceof HTMLScriptElement || element instanceof HTMLStyleElement) {
      return false;
    }

    return true;
  }

  /**
   * Check if input value should be masked (passwords, credit cards, etc.)
   */
  private shouldMaskValue(element: HTMLInputElement | HTMLTextAreaElement): boolean {
    if (element instanceof HTMLInputElement) {
      // Mask password fields
      if (element.type === 'password') {
        return true;
      }

      // Mask credit card fields (common patterns)
      const name = element.name.toLowerCase();
      const id = element.id.toLowerCase();
      const sensitivePatterns = ['password', 'passwd', 'pwd', 'cc', 'card', 'cvv', 'ssn'];

      return sensitivePatterns.some((pattern) => name.includes(pattern) || id.includes(pattern));
    }

    return false;
  }

  /**
   * Get current recording state
   */
  isActive(): boolean {
    return this.isRecording;
  }

  /**
   * Get current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }
}
