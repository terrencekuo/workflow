/**
 * Injectable Page Load Detector
 * This is a self-contained function that can be injected into pages
 * to detect when they're ready for screenshots.
 *
 * Must be self-contained (no external imports) to work with chrome.scripting.executeScript
 */

import type { PageReadinessState } from '@/shared/types';

/**
 * Self-contained page readiness detection function
 * This gets stringified and injected into the page context
 */
export async function detectPageReadiness(): Promise<PageReadinessState> {
  // Constants
  const PAGE_LOAD_MAX_TIMEOUT = 10000;
  const DOM_STABILITY_WAIT = 800;
  const SKELETON_MAX_WAIT = 5000;
  const SKELETON_CHECK_INTERVAL = 100;
  const RESOURCE_LOAD_TIMEOUT = 5000;

  const startTime = Date.now();

  // Helper: Check if element is visible
  function isElementVisible(element: HTMLElement): boolean {
    if (!document.body.contains(element)) return false;

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    return true;
  }

  // Helper: Check for skeleton elements
  function hasSkeletonElements(): boolean {
    const patterns = [
      'skeleton', 'loading', 'shimmer', 'placeholder-glow', 'placeholder-wave',
      'content-loader', 'skeleton-loader', 'loading-skeleton', 'pulse', 'animate-pulse',
      'spinner', 'loader', 'loading-spinner', 'spin', 'rotating',
    ];

    for (const pattern of patterns) {
      const elements = document.querySelectorAll(`[class*="${pattern}" i], [data-loading*="${pattern}" i]`);
      for (const element of Array.from(elements)) {
        if (isElementVisible(element as HTMLElement)) return true;
      }
    }

    const busyElements = document.querySelectorAll('[aria-busy="true"]');
    for (const element of Array.from(busyElements)) {
      if (isElementVisible(element as HTMLElement)) return true;
    }

    const loadingElements = document.querySelectorAll('[data-loading="true"]');
    for (const element of Array.from(loadingElements)) {
      if (isElementVisible(element as HTMLElement)) return true;
    }

    return false;
  }

  // Step 1: Wait for DOM stability
  async function waitForDOMStability(): Promise<void> {
    return new Promise((resolve) => {
      let lastMutationTime = Date.now();
      let mutationTimeout: number | null = null;

      const observer = new MutationObserver(() => {
        lastMutationTime = Date.now();

        if (mutationTimeout) clearTimeout(mutationTimeout);

        mutationTimeout = window.setTimeout(() => {
          observer.disconnect();
          resolve();
        }, DOM_STABILITY_WAIT);
      });

      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });

      setTimeout(() => {
        if (Date.now() - lastMutationTime >= DOM_STABILITY_WAIT) {
          observer.disconnect();
          if (mutationTimeout) clearTimeout(mutationTimeout);
          resolve();
        }
      }, DOM_STABILITY_WAIT);
    });
  }

  // Step 2: Wait for resources
  async function waitForResources(): Promise<void> {
    const resources: HTMLElement[] = [
      ...Array.from(document.querySelectorAll('img')),
      ...Array.from(document.querySelectorAll('iframe')),
      ...Array.from(document.querySelectorAll('video')),
    ];

    if (resources.length === 0) return;

    const promises: Promise<void>[] = [];

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

  // Step 3: Wait for skeleton elements to disappear
  async function waitForSkeletonDisappear(): Promise<void> {
    const skeletonStartTime = Date.now();

    return new Promise((resolve) => {
      const checkSkeletons = () => {
        const hasSkeletons = hasSkeletonElements();

        if (!hasSkeletons || Date.now() - skeletonStartTime >= SKELETON_MAX_WAIT) {
          resolve();
          return;
        }

        setTimeout(checkSkeletons, SKELETON_CHECK_INTERVAL);
      };

      checkSkeletons();
    });
  }

  // Perform all checks with timeout
  try {
    const checks = { domStable: false, resourcesLoaded: false, noSkeletons: false };

    // Create timeout promise
    const timeoutPromise = new Promise<PageReadinessState>((resolve) => {
      setTimeout(() => {
        resolve({
          isReady: true,
          reason: 'Max timeout reached',
          duration: PAGE_LOAD_MAX_TIMEOUT,
          checks: { domStable: false, resourcesLoaded: false, noSkeletons: false },
        });
      }, PAGE_LOAD_MAX_TIMEOUT);
    });

    // Create checks promise
    const checksPromise = (async () => {
      await waitForDOMStability();
      checks.domStable = true;

      if (Date.now() - startTime >= PAGE_LOAD_MAX_TIMEOUT) {
        return { isReady: false, reason: 'Timeout after DOM stability', duration: Date.now() - startTime, checks };
      }

      await waitForResources();
      checks.resourcesLoaded = true;

      if (Date.now() - startTime >= PAGE_LOAD_MAX_TIMEOUT) {
        return { isReady: true, reason: 'Resources loaded (timeout before skeleton check)', duration: Date.now() - startTime, checks };
      }

      await waitForSkeletonDisappear();
      checks.noSkeletons = true;

      return { isReady: true, reason: 'All checks passed', duration: Date.now() - startTime, checks };
    })();

    // Race between checks and timeout
    const result = await Promise.race([checksPromise, timeoutPromise]);
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

