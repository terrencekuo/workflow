/**
 * PageLoadDetector - Intelligent page readiness detection
 * Waits for DOM stability, resource loading, and skeleton elements to disappear
 */

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

export class PageLoadDetector {
  private maxTimeout: number;
  private domStabilityWait: number;
  private mutationTimeout: number | null = null;
  private lastMutationTime: number = 0;

  constructor(maxTimeout = 3000, domStabilityWait = 300) {
    this.maxTimeout = maxTimeout;
    this.domStabilityWait = domStabilityWait;
  }

  /**
   * Wait for page to be ready with smart detection
   * Returns when all checks pass or max timeout is reached
   */
  async waitForPageReady(): Promise<PageReadinessState> {
    const startTime = Date.now();
    const timeoutPromise = this.createTimeout();

    try {
      // Run all checks in parallel with timeout
      const result = await Promise.race([
        this.performAllChecks(startTime),
        timeoutPromise,
      ]);

      return {
        ...result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      console.error('[PageLoadDetector] Error during detection:', error);
      return {
        isReady: false,
        reason: 'Detection error: ' + (error instanceof Error ? error.message : 'Unknown'),
        duration: Date.now() - startTime,
        checks: {
          domStable: false,
          resourcesLoaded: false,
          noSkeletons: false,
        },
      };
    }
  }

  /**
   * Perform all readiness checks
   */
  private async performAllChecks(startTime: number): Promise<PageReadinessState> {
    const checks = {
      domStable: false,
      resourcesLoaded: false,
      noSkeletons: false,
    };

    // Wait for DOM to be stable
    await this.waitForDOMStability();
    checks.domStable = true;

    // Check if we're out of time
    if (Date.now() - startTime >= this.maxTimeout) {
      return {
        isReady: false,
        reason: 'Timeout after DOM stability',
        duration: Date.now() - startTime,
        checks,
      };
    }

    // Wait for resources to load
    await this.waitForResources();
    checks.resourcesLoaded = true;

    // Check if we're out of time
    if (Date.now() - startTime >= this.maxTimeout) {
      return {
        isReady: true, // DOM + resources is good enough
        reason: 'Resources loaded (timeout before skeleton check)',
        duration: Date.now() - startTime,
        checks,
      };
    }

    // Wait for skeleton elements to disappear
    await this.waitForSkeletonDisappear();
    checks.noSkeletons = true;

    return {
      isReady: true,
      reason: 'All checks passed',
      duration: Date.now() - startTime,
      checks,
    };
  }

  /**
   * Create timeout promise
   */
  private createTimeout(): Promise<PageReadinessState> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          isReady: true, // Still capture even on timeout
          reason: 'Max timeout reached',
          duration: this.maxTimeout,
          checks: {
            domStable: false,
            resourcesLoaded: false,
            noSkeletons: false,
          },
        });
      }, this.maxTimeout);
    });
  }

  /**
   * Wait for DOM to stabilize (no mutations for specified time)
   */
  private waitForDOMStability(): Promise<void> {
    return new Promise((resolve) => {
      let mutationCount = 0;
      this.lastMutationTime = Date.now();

      const observer = new MutationObserver(() => {
        mutationCount++;
        this.lastMutationTime = Date.now();

        // Clear existing timeout
        if (this.mutationTimeout) {
          clearTimeout(this.mutationTimeout);
        }

        // Set new timeout
        this.mutationTimeout = window.setTimeout(() => {
          observer.disconnect();
          console.log(
            `[PageLoadDetector] DOM stable after ${mutationCount} mutations`
          );
          resolve();
        }, this.domStabilityWait);
      });

      // Observe the entire document
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });

      // If no mutations occur immediately, consider it stable
      setTimeout(() => {
        if (Date.now() - this.lastMutationTime >= this.domStabilityWait) {
          observer.disconnect();
          if (this.mutationTimeout) {
            clearTimeout(this.mutationTimeout);
          }
          console.log('[PageLoadDetector] DOM already stable');
          resolve();
        }
      }, this.domStabilityWait);
    });
  }

  /**
   * Wait for critical resources to load (images, iframes, videos)
   */
  private async waitForResources(): Promise<void> {
    const resources: HTMLElement[] = [
      ...Array.from(document.querySelectorAll('img')),
      ...Array.from(document.querySelectorAll('iframe')),
      ...Array.from(document.querySelectorAll('video')),
    ];

    if (resources.length === 0) {
      console.log('[PageLoadDetector] No resources to wait for');
      return;
    }

    const promises: Promise<void>[] = [];

    for (const resource of resources) {
      // Skip if already loaded
      if (resource instanceof HTMLImageElement) {
        if (resource.complete && resource.naturalHeight > 0) {
          continue;
        }
      } else if (resource instanceof HTMLIFrameElement) {
        // Check if iframe is loaded
        try {
          if (resource.contentDocument?.readyState === 'complete') {
            continue;
          }
        } catch (e) {
          // Cross-origin iframe, skip
          continue;
        }
      } else if (resource instanceof HTMLVideoElement) {
        if (resource.readyState >= 2) {
          // HAVE_CURRENT_DATA or better
          continue;
        }
      }

      // Wait for resource to load
      promises.push(
        new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            resolve(); // Don't block forever on a single resource
          }, 2000);

          const onLoad = () => {
            clearTimeout(timeout);
            resolve();
          };

          resource.addEventListener('load', onLoad, { once: true });
          resource.addEventListener('error', onLoad, { once: true }); // Resolve on error too
        })
      );
    }

    await Promise.all(promises);
    console.log(`[PageLoadDetector] ${resources.length} resources loaded`);
  }

  /**
   * Wait for skeleton/loading elements to disappear
   */
  private async waitForSkeletonDisappear(): Promise<void> {
    const maxWait = 1500; // Max 1.5s for skeleton check
    const checkInterval = 100; // Check every 100ms
    const startTime = Date.now();

    return new Promise((resolve) => {
      const checkSkeletons = () => {
        const hasSkeletons = this.hasSkeletonElements();

        if (!hasSkeletons) {
          console.log('[PageLoadDetector] No skeleton elements found');
          resolve();
          return;
        }

        // Check if we've exceeded max wait time
        if (Date.now() - startTime >= maxWait) {
          console.log('[PageLoadDetector] Skeleton elements still present, continuing anyway');
          resolve();
          return;
        }

        // Check again after interval
        setTimeout(checkSkeletons, checkInterval);
      };

      checkSkeletons();
    });
  }

  /**
   * Check if page has visible skeleton/loading elements
   */
  private hasSkeletonElements(): boolean {
    // Common skeleton/loading class patterns
    const skeletonPatterns = [
      'skeleton',
      'loading',
      'shimmer',
      'placeholder-glow',
      'placeholder-wave',
      'content-loader',
      'skeleton-loader',
      'loading-skeleton',
      'pulse',
      'animate-pulse',
    ];

    // Common spinner/loader patterns
    const spinnerPatterns = [
      'spinner',
      'loader',
      'loading-spinner',
      'spin',
      'rotating',
    ];

    // Check for elements with skeleton classes
    for (const pattern of [...skeletonPatterns, ...spinnerPatterns]) {
      const elements = document.querySelectorAll(
        `[class*="${pattern}" i], [data-loading*="${pattern}" i]`
      );

      for (const element of Array.from(elements)) {
        if (this.isElementVisible(element as HTMLElement)) {
          console.log(`[PageLoadDetector] Found visible skeleton element: ${pattern}`);
          return true;
        }
      }
    }

    // Check for aria-busy elements
    const busyElements = document.querySelectorAll('[aria-busy="true"]');
    for (const element of Array.from(busyElements)) {
      if (this.isElementVisible(element as HTMLElement)) {
        console.log('[PageLoadDetector] Found aria-busy element');
        return true;
      }
    }

    // Check for loading attributes
    const loadingElements = document.querySelectorAll('[data-loading="true"]');
    for (const element of Array.from(loadingElements)) {
      if (this.isElementVisible(element as HTMLElement)) {
        console.log('[PageLoadDetector] Found data-loading element');
        return true;
      }
    }

    return false;
  }

  /**
   * Check if an element is visible in the viewport
   */
  private isElementVisible(element: HTMLElement): boolean {
    // Check if element is in DOM
    if (!document.body.contains(element)) {
      return false;
    }

    // Check display and visibility styles
    const style = window.getComputedStyle(element);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0'
    ) {
      return false;
    }

    // Check if element has dimensions
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return false;
    }

    // Element is visible
    return true;
  }

  /**
   * Cleanup any pending timeouts
   */
  cleanup(): void {
    if (this.mutationTimeout) {
      clearTimeout(this.mutationTimeout);
      this.mutationTimeout = null;
    }
  }
}

/**
 * Standalone function that can be injected into a page context
 * This is used by the background script via chrome.scripting.executeScript
 */
export async function detectPageReadiness(): Promise<PageReadinessState> {
  const detector = new PageLoadDetector(3000, 300);
  try {
    const result = await detector.waitForPageReady();
    detector.cleanup();
    return result;
  } catch (error) {
    detector.cleanup();
    throw error;
  }
}

