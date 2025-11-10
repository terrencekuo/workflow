import { EVENT_TYPES } from '@/shared/constants';
import type { StepData } from '@/shared/types';
import type { DOMAnalyzer } from '@/content/DOMAnalyzer';

/**
 * Event handler context passed to all handlers
 */
export interface EventHandlerContext {
  domAnalyzer: DOMAnalyzer;
  recordStep: (stepData: StepData) => void;
}

/**
 * Helper: Check if element should be captured
 */
function shouldCaptureElement(element: Element): boolean {
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
 * Helper: Get visible text content from an element
 */
function getElementText(element: HTMLElement): string {
  const text = element.textContent?.trim() || '';
  return text.length > 50 ? text.substring(0, 47) + '...' : text;
}

/**
 * Handle click events
 */
export function handleClick(event: Event, context: EventHandlerContext): void {
  const mouseEvent = event as MouseEvent;
  const target = mouseEvent.target as HTMLElement;

  if (!shouldCaptureElement(target)) {
    return;
  }

  const strategy = context.domAnalyzer.generateSelectorStrategy(target);
  const elementContext = context.domAnalyzer.extractElementContext(target);

  const metadata = {
    text: getElementText(target),
    href: target instanceof HTMLAnchorElement ? target.href : undefined,
    coordinates: {
      x: mouseEvent.clientX,
      y: mouseEvent.clientY,
      pageX: mouseEvent.pageX,
      pageY: mouseEvent.pageY,
    },
  };

  const step: StepData = {
    type: EVENT_TYPES.CLICK,
    selector: strategy.primary,
    alternativeSelectors: strategy.fallbacks,
    elementContext,
    value: null,
    url: window.location.href,
    timestamp: Date.now(),
    metadata,
  };

  context.recordStep(step);
}

/**
 * Handle change events (select, checkbox, radio)
 */
export function handleChange(event: Event, context: EventHandlerContext): void {
  const target = event.target as HTMLInputElement | HTMLSelectElement;

  if (!shouldCaptureElement(target)) {
    return;
  }

  let value: string | boolean = '';
  const metadata: Record<string, any> = {
    tagName: target.tagName.toLowerCase(),
  };

  // Determine value and metadata based on input type
  if (target instanceof HTMLInputElement) {
    if (target.type === 'checkbox') {
      value = target.checked;
      metadata.inputType = 'checkbox';
    } else if (target.type === 'radio') {
      value = target.value;
      metadata.inputType = 'radio';
    } else {
      // Skip other input types - not captured
      return;
    }
  } else if (target instanceof HTMLSelectElement) {
    value = target.value;
    metadata.selectedIndex = target.selectedIndex;
  }

  const strategy = context.domAnalyzer.generateSelectorStrategy(target);

  const step: StepData = {
    type: EVENT_TYPES.CHANGE,
    selector: strategy.primary,
    value,
    timestamp: Date.now(),
    metadata,
  };

  context.recordStep(step);
}

/**
 * Handle form submission
 */
export function handleSubmit(event: Event, context: EventHandlerContext): void {
  const target = event.target as HTMLFormElement;

  const strategy = context.domAnalyzer.generateSelectorStrategy(target);

  const metadata = {
    tagName: 'form',
    action: target.action,
    method: target.method,
  };

  const step: StepData = {
    type: EVENT_TYPES.SUBMIT,
    selector: strategy.primary,
    value: null,
    timestamp: Date.now(),
    metadata,
  };

  context.recordStep(step);
}

/**
 * Handle navigation events
 */
export function handleNavigation(context: EventHandlerContext): void {
  const metadata = {
    url: window.location.href,
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
  };

  const step: StepData = {
    type: EVENT_TYPES.NAVIGATION,
    selector: 'window',
    value: window.location.href,
    timestamp: Date.now(),
    metadata,
  };

  context.recordStep(step);
}

