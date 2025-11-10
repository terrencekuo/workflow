import type { SelectorStrategy } from '@/shared/types';
import * as SelectorStrategies from '@/content/selectorStrategies';
import { ElementContextExtractor } from '@/content/elementContextExtractor';

/**
 * DOMAnalyzer - Intelligent element identification and context extraction
 *
 * Public API:
 * - analyzeElement: Main entry point - returns selector + context
 */
export class DOMAnalyzer {
  private contextExtractor: ElementContextExtractor;

  constructor() {
    this.contextExtractor = new ElementContextExtractor();
  }
  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Main API: Analyze an element and return both selector strategies and context
   * This is the recommended method to use for complete element analysis
   */
  analyzeElement(element: Element) {
    const strategy = this.generateSelectorStrategy(element);
    const elementContext = this.contextExtractor.extract(element);

    return {
      selector: strategy.primary,
      alternativeSelectors: strategy.fallbacks,
      elementContext,
    };
  }

  /**
   * Generate a comprehensive selector strategy for an element
   */
  private generateSelectorStrategy(element: Element): SelectorStrategy {
    const selectors: string[] = [];

    // Strategy 1: ID selector (highest priority)
    const idSelector = SelectorStrategies.getIdSelector(element);
    if (idSelector) selectors.push(idSelector);

    // Strategy 2: data-* attributes
    const dataAttrSelector = SelectorStrategies.getDataAttributeSelector(element);
    if (dataAttrSelector) selectors.push(dataAttrSelector);

    // Strategy 3: ARIA attributes
    const ariaSelector = SelectorStrategies.getAriaSelector(element);
    if (ariaSelector) selectors.push(ariaSelector);

    // Strategy 4: Name attribute (for form elements)
    const nameSelector = SelectorStrategies.getNameSelector(element);
    if (nameSelector) selectors.push(nameSelector);

    // Strategy 5: Class-based selector
    const classSelector = SelectorStrategies.getClassSelector(element);
    if (classSelector) selectors.push(classSelector);

    // Strategy 6: Text content selector
    const textSelector = SelectorStrategies.getTextSelector(element);
    if (textSelector) selectors.push(textSelector);

    // Strategy 7: Position-based selector (CSS path)
    const cssPathSelector = SelectorStrategies.getCssPathSelector(element);
    if (cssPathSelector) selectors.push(cssPathSelector);

    // Strategy 8: XPath (fallback)
    const xpathSelector = SelectorStrategies.getXPathSelector(element);
    if (xpathSelector) selectors.push(xpathSelector);

    // Calculate confidence score
    const confidence = this.calculateConfidence(selectors, element);

    return {
      primary: selectors[0] || SelectorStrategies.getCssPathSelector(element) || 'body',
      fallbacks: selectors.slice(1),
      confidence,
    };
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

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

}
