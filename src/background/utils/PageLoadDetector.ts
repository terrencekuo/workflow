/**
 * PageLoadDetector - Intelligent page readiness detection
 * Waits for DOM stability, resource loading, and skeleton elements to disappear
 * 
 * This utility provides an injectable function for use with chrome.scripting.executeScript
 */

import { TIMING } from '@/shared/constants';

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

/**
 * Creates an injectable function that detects page readiness
 * This function is stringified and injected into the page context
 */
export function createPageReadinessDetector() {
  // This function will be serialized and injected into the page
  return async function detectPageReadiness(): Promise<PageReadinessState> {
    interface PageReadinessState {
      isReady: boolean;
      reason: string;
      duration: number;
      checks: {
        domStable: boolean;
        resourcesLoaded: boolean;
        noSkeletons: boolean;
      };
    }

    class PageLoadDetector {
      private maxTimeout: number;
      private domStabilityWait: number;
      private mutationTimeout: number | null = null;
      private lastMutationTime: number = 0;

      constructor(maxTimeout: number, domStabilityWait: number) {
        this.maxTimeout = maxTimeout;
        this.domStabilityWait = domStabilityWait;
      }

      async waitForPageReady(): Promise<PageReadinessState> {
        const startTime = Date.now();
        const timeoutPromise = this.createTimeout();

        try {
          const result = await Promise.race([
            this.performAllChecks(startTime),
            timeoutPromise,
          ]);
          return { ...result, duration: Date.now() - startTime };
        } catch (error) {
          return {
            isReady: false,
            reason: 'Detection error: ' + (error instanceof Error ? error.message : 'Unknown'),
            duration: Date.now() - startTime,
            checks: { domStable: false, resourcesLoaded: false, noSkeletons: false },
          };
        }
      }

      private async performAllChecks(startTime: number): Promise<PageReadinessState> {
        const checks = { domStable: false, resourcesLoaded: false, noSkeletons: false };

        await this.waitForDOMStability();
        checks.domStable = true;

        if (Date.now() - startTime >= this.maxTimeout) {
          return { isReady: false, reason: 'Timeout after DOM stability', duration: Date.now() - startTime, checks };
        }

        await this.waitForResources();
        checks.resourcesLoaded = true;

        if (Date.now() - startTime >= this.maxTimeout) {
          return { isReady: true, reason: 'Resources loaded (timeout before skeleton check)', duration: Date.now() - startTime, checks };
        }

        await this.waitForSkeletonDisappear();
        checks.noSkeletons = true;

        return { isReady: true, reason: 'All checks passed', duration: Date.now() - startTime, checks };
      }

      private createTimeout(): Promise<PageReadinessState> {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              isReady: true,
              reason: 'Max timeout reached',
              duration: this.maxTimeout,
              checks: { domStable: false, resourcesLoaded: false, noSkeletons: false },
            });
          }, this.maxTimeout);
        });
      }

      private waitForDOMStability(): Promise<void> {
        return new Promise((resolve) => {
          let mutationCount = 0;
          this.lastMutationTime = Date.now();

          const observer = new MutationObserver(() => {
            mutationCount++;
            this.lastMutationTime = Date.now();

            if (this.mutationTimeout) clearTimeout(this.mutationTimeout);

            this.mutationTimeout = window.setTimeout(() => {
              observer.disconnect();
              resolve();
            }, this.domStabilityWait);
          });

          observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
          });

          setTimeout(() => {
            if (Date.now() - this.lastMutationTime >= this.domStabilityWait) {
              observer.disconnect();
              if (this.mutationTimeout) clearTimeout(this.mutationTimeout);
              resolve();
            }
          }, this.domStabilityWait);
        });
      }

      private async waitForResources(): Promise<void> {
        const resources: HTMLElement[] = [
          ...Array.from(document.querySelectorAll('img')),
          ...Array.from(document.querySelectorAll('iframe')),
          ...Array.from(document.querySelectorAll('video')),
        ];

        if (resources.length === 0) return;

        const promises: Promise<void>[] = [];
        const RESOURCE_LOAD_TIMEOUT = 5000;

        for (const resource of resources) {
          if (resource instanceof HTMLImageElement) {
            if (resource.complete && resource.naturalHeight > 0) continue;
          } else if (resource instanceof HTMLIFrameElement) {
            try {
              if (resource.contentDocument?.readyState === 'complete') continue;
            } catch (e) {
              continue;
            }
          } else if (resource instanceof HTMLVideoElement) {
            if (resource.readyState >= 2) continue;
          }

          promises.push(
            new Promise<void>((resolve) => {
              const timeout = setTimeout(() => resolve(), RESOURCE_LOAD_TIMEOUT);
              const onLoad = () => {
                clearTimeout(timeout);
                resolve();
              };
              resource.addEventListener('load', onLoad, { once: true });
              resource.addEventListener('error', onLoad, { once: true });
            })
          );
        }

        await Promise.all(promises);
      }

      private async waitForSkeletonDisappear(): Promise<void> {
        const SKELETON_MAX_WAIT = 5000;
        const SKELETON_CHECK_INTERVAL = 100;
        const startTime = Date.now();

        return new Promise((resolve) => {
          const checkSkeletons = () => {
            const hasSkeletons = this.hasSkeletonElements();

            if (!hasSkeletons || Date.now() - startTime >= SKELETON_MAX_WAIT) {
              resolve();
              return;
            }

            setTimeout(checkSkeletons, SKELETON_CHECK_INTERVAL);
          };

          checkSkeletons();
        });
      }

      private hasSkeletonElements(): boolean {
        const patterns = [
          'skeleton', 'loading', 'shimmer', 'placeholder-glow', 'placeholder-wave',
          'content-loader', 'skeleton-loader', 'loading-skeleton', 'pulse', 'animate-pulse',
          'spinner', 'loader', 'loading-spinner', 'spin', 'rotating',
        ];

        for (const pattern of patterns) {
          const elements = document.querySelectorAll(`[class*="${pattern}" i], [data-loading*="${pattern}" i]`);
          for (const element of Array.from(elements)) {
            if (this.isElementVisible(element as HTMLElement)) return true;
          }
        }

        const busyElements = document.querySelectorAll('[aria-busy="true"]');
        for (const element of Array.from(busyElements)) {
          if (this.isElementVisible(element as HTMLElement)) return true;
        }

        const loadingElements = document.querySelectorAll('[data-loading="true"]');
        for (const element of Array.from(loadingElements)) {
          if (this.isElementVisible(element as HTMLElement)) return true;
        }

        return false;
      }

      private isElementVisible(element: HTMLElement): boolean {
        if (!document.body.contains(element)) return false;

        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return false;
        }

        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;

        return true;
      }

      cleanup(): void {
        if (this.mutationTimeout) {
          clearTimeout(this.mutationTimeout);
          this.mutationTimeout = null;
        }
      }
    }

    // Execute detection with timing constants inlined
    const PAGE_LOAD_MAX_TIMEOUT = 10000;
    const DOM_STABILITY_WAIT = 800;
    
    const detector = new PageLoadDetector(PAGE_LOAD_MAX_TIMEOUT, DOM_STABILITY_WAIT);
    try {
      const result = await detector.waitForPageReady();
      detector.cleanup();
      return result;
    } catch (error) {
      detector.cleanup();
      throw error;
    }
  };
}

/**
 * Wait for page to be ready using smart detection
 * Injects PageLoadDetector into the content page and waits for result
 */
export async function waitForPageReadiness(tabId: number): Promise<PageReadinessState> {
  try {
    // Inject and execute the detection script
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: createPageReadinessDetector(),
    });

    if (result && result[0] && result[0].result) {
      return result[0].result as PageReadinessState;
    }

    // Fallback if detection fails
    return {
      isReady: true,
      reason: 'Detection script failed, using fallback',
      duration: 0,
      checks: { domStable: false, resourcesLoaded: false, noSkeletons: false },
    };
  } catch (error) {
    console.error('[PageLoadDetector] Error during page readiness detection:', error);
    // Fallback to small delay if detection fails
    await new Promise((resolve) => setTimeout(resolve, TIMING.PAGE_READINESS_FALLBACK_DELAY));
    return {
      isReady: true,
      reason: 'Detection error, used fallback delay',
      duration: TIMING.PAGE_READINESS_FALLBACK_DELAY,
      checks: { domStable: false, resourcesLoaded: false, noSkeletons: false },
    };
  }
}

