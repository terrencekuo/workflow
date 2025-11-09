import type { ElementContext, ParentContext, SelectorStrategy } from '@/shared/types';

/**
 * DOMAnalyzer - Intelligent element identification and context extraction
 * Generates robust, resilient selectors with multiple fallback strategies
 */
export class DOMAnalyzer {
  /**
   * Generate a comprehensive selector strategy for an element
   */
  generateSelectorStrategy(element: Element): SelectorStrategy {
    const selectors: string[] = [];

    // Strategy 1: ID selector (highest priority)
    const idSelector = this.getIdSelector(element);
    if (idSelector) {
      selectors.push(idSelector);
    }

    // Strategy 2: data-* attributes
    const dataAttrSelector = this.getDataAttributeSelector(element);
    if (dataAttrSelector) {
      selectors.push(dataAttrSelector);
    }

    // Strategy 3: ARIA attributes
    const ariaSelector = this.getAriaSelector(element);
    if (ariaSelector) {
      selectors.push(ariaSelector);
    }

    // Strategy 4: Name attribute (for form elements)
    const nameSelector = this.getNameSelector(element);
    if (nameSelector) {
      selectors.push(nameSelector);
    }

    // Strategy 5: Class-based selector
    const classSelector = this.getClassSelector(element);
    if (classSelector) {
      selectors.push(classSelector);
    }

    // Strategy 6: Text content selector
    const textSelector = this.getTextSelector(element);
    if (textSelector) {
      selectors.push(textSelector);
    }

    // Strategy 7: Position-based selector (CSS path)
    const cssPathSelector = this.getCssPathSelector(element);
    if (cssPathSelector) {
      selectors.push(cssPathSelector);
    }

    // Strategy 8: XPath (fallback)
    const xpathSelector = this.getXPathSelector(element);
    if (xpathSelector) {
      selectors.push(xpathSelector);
    }

    // Calculate confidence score
    const confidence = this.calculateConfidence(selectors, element);

    return {
      primary: selectors[0] || this.getCssPathSelector(element) || 'body',
      fallbacks: selectors.slice(1),
      confidence,
    };
  }

  /**
   * Extract comprehensive context about an element
   */
  extractElementContext(element: Element): ElementContext {
    const rect = element.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(element);

    return {
      tagName: element.tagName.toLowerCase(),
      attributes: this.getElementAttributes(element),
      textContent: this.getElementText(element),
      boundingBox: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
      } as DOMRect,
      computedStyles: this.getRelevantStyles(computedStyle),
      elementHash: this.generateElementHash(element),
      parentContext: this.extractParentContext(element),
    };
  }

  /**
   * Validate that a selector uniquely identifies an element
   */
  validateSelector(selector: string, expectedElement: Element): boolean {
    try {
      if (selector.startsWith('xpath:')) {
        const xpath = selector.substring(6);
        const result = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        return result.singleNodeValue === expectedElement;
      } else {
        const found = document.querySelector(selector);
        return found === expectedElement;
      }
    } catch {
      return false;
    }
  }

  /**
   * Find best selector from a list of candidates
   */
  findBestSelector(selectors: string[], element: Element): string | null {
    for (const selector of selectors) {
      if (this.validateSelector(selector, element)) {
        // Check if selector is unique
        try {
          const matches = selector.startsWith('xpath:')
            ? this.evaluateXPath(selector.substring(6))
            : document.querySelectorAll(selector);

          if (matches.length === 1) {
            return selector;
          }
        } catch {
          continue;
        }
      }
    }
    return null;
  }

  /**
   * Strategy 1: ID selector
   */
  private getIdSelector(element: Element): string | null {
    if (!element.id) return null;

    // Validate ID is unique and doesn't change dynamically
    if (this.isDynamicId(element.id)) return null;

    return `#${CSS.escape(element.id)}`;
  }

  /**
   * Strategy 2: data-* attribute selector
   */
  private getDataAttributeSelector(element: Element): string | null {
    const dataAttrs = Array.from(element.attributes)
      .filter(attr => attr.name.startsWith('data-'))
      .filter(attr => !this.isDynamicValue(attr.value));

    if (dataAttrs.length === 0) return null;

    // Prefer data-testid, data-test, data-cy (common test IDs)
    const testIdAttr = dataAttrs.find(attr =>
      ['data-testid', 'data-test', 'data-cy', 'data-automation'].includes(attr.name)
    );

    if (testIdAttr) {
      return `[${testIdAttr.name}="${CSS.escape(testIdAttr.value)}"]`;
    }

    // Use first stable data attribute
    const stableAttr = dataAttrs[0];
    return `[${stableAttr.name}="${CSS.escape(stableAttr.value)}"]`;
  }

  /**
   * Strategy 3: ARIA attribute selector
   */
  private getAriaSelector(element: Element): string | null {
    // Prefer aria-label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel && !this.isDynamicValue(ariaLabel)) {
      return `${element.tagName.toLowerCase()}[aria-label="${CSS.escape(ariaLabel)}"]`;
    }

    // Try role + aria-labelledby
    const role = element.getAttribute('role');
    const labelledBy = element.getAttribute('aria-labelledby');
    if (role && labelledBy) {
      return `[role="${role}"][aria-labelledby="${labelledBy}"]`;
    }

    return null;
  }

  /**
   * Strategy 4: Name attribute selector (forms)
   */
  private getNameSelector(element: Element): string | null {
    if (!(element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement ||
          element instanceof HTMLTextAreaElement)) {
      return null;
    }

    const name = element.name;
    if (!name || this.isDynamicValue(name)) return null;

    return `${element.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
  }

  /**
   * Strategy 5: Class-based selector
   */
  private getClassSelector(element: Element): string | null {
    if (!element.className || typeof element.className !== 'string') return null;

    const classes = Array.from(element.classList)
      .filter(cls => !this.isDynamicClass(cls))
      .filter(cls => !this.isUtilityClass(cls))
      .slice(0, 3); // Use up to 3 classes

    if (classes.length === 0) return null;

    const classSelector = element.tagName.toLowerCase() + '.' + classes.join('.');

    // Verify it's somewhat unique (not too many matches)
    try {
      const matches = document.querySelectorAll(classSelector);
      if (matches.length > 10) return null; // Too broad
    } catch {
      return null;
    }

    return classSelector;
  }

  /**
   * Strategy 6: Text content selector
   */
  private getTextSelector(element: Element): string | null {
    const text = this.getDirectText(element);
    if (!text || text.length > 50) return null;

    // Only use for buttons, links, labels
    const textElements = ['button', 'a', 'label', 'span'];
    if (!textElements.includes(element.tagName.toLowerCase())) return null;

    // Escape text for use in selector
    const escapedText = text.replace(/'/g, "\\'");
    return `${element.tagName.toLowerCase()}:has-text("${escapedText}")`;
  }

  /**
   * Strategy 7: CSS path selector
   */
  private getCssPathSelector(element: Element): string | null {
    const path: string[] = [];
    let current: Element | null = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      // Add nth-child if needed for uniqueness
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          e => e.tagName === current!.tagName
        );

        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }

      path.unshift(selector);

      // Stop if we found a unique ID
      if (current.id && !this.isDynamicId(current.id)) {
        path[0] = `#${CSS.escape(current.id)}`;
        break;
      }

      current = current.parentElement;
    }

    return path.join(' > ');
  }

  /**
   * Strategy 8: XPath selector
   */
  private getXPathSelector(element: Element): string | null {
    const path: string[] = [];
    let current: Element | null = element;

    while (current && current !== document.body) {
      let index = 1;
      let sibling = current.previousElementSibling;

      while (sibling) {
        if (sibling.tagName === current.tagName) {
          index++;
        }
        sibling = sibling.previousElementSibling;
      }

      const tagName = current.tagName.toLowerCase();
      path.unshift(`${tagName}[${index}]`);

      if (current.id && !this.isDynamicId(current.id)) {
        path[0] = `//*[@id="${current.id}"]`;
        break;
      }

      current = current.parentElement;
    }

    return 'xpath://' + path.join('/');
  }

  /**
   * Calculate confidence score for selector quality
   */
  private calculateConfidence(selectors: string[], _element: Element): number {
    let score = 0;

    // ID selector: +40 points
    if (selectors.some(s => s.startsWith('#'))) score += 40;

    // Data attribute: +30 points
    if (selectors.some(s => s.includes('[data-'))) score += 30;

    // ARIA: +25 points
    if (selectors.some(s => s.includes('[aria-'))) score += 25;

    // Name attribute: +20 points
    if (selectors.some(s => s.includes('[name='))) score += 20;

    // Multiple strategies available: +10 points
    if (selectors.length >= 3) score += 10;

    // Validate primary selector uniqueness
    try {
      const matches = document.querySelectorAll(selectors[0]);
      if (matches.length === 1) score += 20;
      else if (matches.length <= 5) score += 10;
    } catch {
      score -= 10;
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Get all relevant attributes from an element
   */
  private getElementAttributes(element: Element): Record<string, string> {
    const attrs: Record<string, string> = {};

    Array.from(element.attributes).forEach(attr => {
      attrs[attr.name] = attr.value;
    });

    return attrs;
  }

  /**
   * Get visible text content
   */
  private getElementText(element: Element): string {
    const text = element.textContent?.trim() || '';
    return text.length > 100 ? text.substring(0, 97) + '...' : text;
  }

  /**
   * Get only direct text content (not from children)
   */
  private getDirectText(element: Element): string {
    let text = '';
    element.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      }
    });
    return text.trim();
  }

  /**
   * Get relevant computed styles
   */
  private getRelevantStyles(style: CSSStyleDeclaration): Partial<CSSStyleDeclaration> {
    return {
      display: style.display,
      visibility: style.visibility,
      position: style.position,
      zIndex: style.zIndex,
      opacity: style.opacity,
    };
  }

  /**
   * Generate a hash of element characteristics
   */
  private generateElementHash(element: Element): string {
    const parts = [
      element.tagName,
      element.className,
      element.id,
      this.getDirectText(element).substring(0, 20),
    ];

    return btoa(parts.join('|')).substring(0, 16);
  }

  /**
   * Extract parent element context
   */
  private extractParentContext(element: Element): ParentContext | undefined {
    const parent = element.parentElement;
    if (!parent || parent === document.body) return undefined;

    return {
      tagName: parent.tagName.toLowerCase(),
      attributes: this.getElementAttributes(parent),
      textContent: this.getElementText(parent),
    };
  }

  /**
   * Check if ID appears to be dynamically generated
   */
  private isDynamicId(id: string): boolean {
    // Check for common patterns of dynamic IDs
    const dynamicPatterns = [
      /^[a-f0-9]{8,}$/i, // Long hex strings
      /^[0-9]{8,}$/, // Long numbers
      /^_[0-9]+$/, // Underscore + number
      /:r[0-9a-z]+:/, // React IDs
      /^mui-[0-9]+$/, // Material UI
      /^radix-[0-9]+$/, // Radix UI
    ];

    return dynamicPatterns.some(pattern => pattern.test(id));
  }

  /**
   * Check if value appears to be dynamic
   */
  private isDynamicValue(value: string): boolean {
    return this.isDynamicId(value);
  }

  /**
   * Check if class name is dynamic (generated)
   */
  private isDynamicClass(className: string): boolean {
    const dynamicPatterns = [
      /^[a-z]-[a-f0-9]{6,}$/i, // CSS modules hash
      /^css-[a-z0-9]+$/i, // Emotion/styled-components
      /^[A-Z][a-z]+-[a-z]+-[0-9]+$/, // MUI classes
    ];

    return dynamicPatterns.some(pattern => pattern.test(className));
  }

  /**
   * Check if class is a utility class (Tailwind, etc.)
   */
  private isUtilityClass(className: string): boolean {
    const utilityPatterns = [
      /^[mp][trblxy]?-/, // margin/padding utilities
      /^text-/, // text utilities
      /^bg-/, // background utilities
      /^flex/, // flex utilities
      /^grid/, // grid utilities
      /^w-/, // width utilities
      /^h-/, // height utilities
      /^hover:/, // state modifiers
      /^focus:/, // state modifiers
      /^active:/, // state modifiers
    ];

    return utilityPatterns.some(pattern => pattern.test(className));
  }

  /**
   * Evaluate XPath expression
   */
  private evaluateXPath(xpath: string): Element[] {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );

    const elements: Element[] = [];
    for (let i = 0; i < result.snapshotLength; i++) {
      const node = result.snapshotItem(i);
      if (node instanceof Element) {
        elements.push(node);
      }
    }

    return elements;
  }
}
