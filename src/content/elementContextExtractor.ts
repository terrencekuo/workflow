import type { ElementContext, ParentContext } from '@/shared/types';

/**
 * ElementContextExtractor - Extracts comprehensive context about DOM elements
 *
 * Captures all relevant information about an element to help with:
 * - Element identification and validation
 * - Replay accuracy
 * - Debugging and troubleshooting
 */
export class ElementContextExtractor {
  /**
   * Extract comprehensive context about an element
   */
  extract(element: Element): ElementContext {
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
   * Get visible text content (truncated if too long)
   */
  private getElementText(element: Element): string {
    const text = element.textContent?.trim() || '';
    return text.length > 100 ? text.substring(0, 97) + '...' : text;
  }

  /**
   * Get relevant computed styles for the element
   * Only captures styles useful for element identification and validation
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
   * Generate a unique hash of element characteristics
   * Used as a fingerprint to help identify the element
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
   * Provides additional context about the element's position in the DOM
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
   * Get only direct text content (not from children)
   * Useful for getting the specific text of an element without its descendants
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
}

