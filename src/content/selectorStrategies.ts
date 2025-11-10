/**
 * Selector Strategies - Different approaches to generate CSS selectors for elements
 * Each strategy provides a different way to uniquely identify an element
 */

/**
 * Strategy 1: ID selector (highest priority)
 */
export function getIdSelector(element: Element): string | null {
  if (!element.id) return null;

  // Validate ID is unique and doesn't change dynamically
  if (isDynamicId(element.id)) return null;

  return `#${CSS.escape(element.id)}`;
}

/**
 * Strategy 2: data-* attribute selector
 */
export function getDataAttributeSelector(element: Element): string | null {
  const dataAttrs = Array.from(element.attributes)
    .filter(attr => attr.name.startsWith('data-'))
    .filter(attr => !isDynamicValue(attr.value));

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
export function getAriaSelector(element: Element): string | null {
  // Prefer aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel && !isDynamicValue(ariaLabel)) {
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
export function getNameSelector(element: Element): string | null {
  if (!(element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement)) {
    return null;
  }

  const name = element.name;
  if (!name || isDynamicValue(name)) return null;

  return `${element.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
}

/**
 * Strategy 5: Class-based selector
 */
export function getClassSelector(element: Element): string | null {
  if (!element.className || typeof element.className !== 'string') return null;

  const classes = Array.from(element.classList)
    .filter(cls => !isDynamicClass(cls))
    .filter(cls => !isUtilityClass(cls))
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
export function getTextSelector(element: Element): string | null {
  const text = getDirectText(element);
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
export function getCssPathSelector(element: Element): string | null {
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
    if (current.id && !isDynamicId(current.id)) {
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
export function getXPathSelector(element: Element): string | null {
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

    if (current.id && !isDynamicId(current.id)) {
      path[0] = `//*[@id="${current.id}"]`;
      break;
    }

    current = current.parentElement;
  }

  return 'xpath://' + path.join('/');
}

/**
 * Helper: Get only direct text content (not from children)
 */
function getDirectText(element: Element): string {
  let text = '';
  element.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
    }
  });
  return text.trim();
}

/**
 * Helper: Check if ID appears to be dynamically generated
 */
function isDynamicId(id: string): boolean {
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
 * Helper: Check if value appears to be dynamic
 */
function isDynamicValue(value: string): boolean {
  return isDynamicId(value);
}

/**
 * Helper: Check if class name is dynamic (generated)
 */
function isDynamicClass(className: string): boolean {
  const dynamicPatterns = [
    /^[a-z]-[a-f0-9]{6,}$/i, // CSS modules hash
    /^css-[a-z0-9]+$/i, // Emotion/styled-components
    /^[A-Z][a-z]+-[a-z]+-[0-9]+$/, // MUI classes
  ];

  return dynamicPatterns.some(pattern => pattern.test(className));
}

/**
 * Helper: Check if class is a utility class (Tailwind, etc.)
 */
function isUtilityClass(className: string): boolean {
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

