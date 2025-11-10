/**
 * PageLoadDetector - Intelligent page readiness detection
 * Detects when the page is stable and ready for screenshots
 */

import type { PageReadinessState } from '@/shared/types';

/**
 * PageLoadDetector class - Detects page readiness through multiple checks
 */
export class PageLoadDetector {
  private readonly PAGE_LOAD_MAX_TIMEOUT = 10000;
  private readonly DOM_STABILITY_WAIT = 800;
  private mutationTimeout: number | null = null;
  private lastMutationTime: number = 0;

  /**
   * Wait for page to be ready with smart detection
   */
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

  /**
   * Perform all readiness checks in sequence
   */
  private async performAllChecks(startTime: number): Promise<PageReadinessState> {
    const checks = { domStable: false, resourcesLoaded: false, noSkeletons: false };

    await this.waitForDOMStability();
    checks.domStable = true;

    if (Date.now() - startTime >= this.PAGE_LOAD_MAX_TIMEOUT) {
      return { isReady: false, reason: 'Timeout after DOM stability', duration: Date.now() - startTime, checks };
    }

    await this.waitForResources();
    checks.resourcesLoaded = true;

    if (Date.now() - startTime >= this.PAGE_LOAD_MAX_TIMEOUT) {
      return { isReady: true, reason: 'Resources loaded (timeout before skeleton check)', duration: Date.now() - startTime, checks };
    }

    await this.waitForSkeletonDisappear();
    checks.noSkeletons = true;

    return { isReady: true, reason: 'All checks passed', duration: Date.now() - startTime, checks };
  }

  /**
   * Create timeout promise for max wait time
   */
  private createTimeout(): Promise<PageReadinessState> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          isReady: true,
          reason: 'Max timeout reached',
          duration: this.PAGE_LOAD_MAX_TIMEOUT,
          checks: { domStable: false, resourcesLoaded: false, noSkeletons: false },
        });
      }, this.PAGE_LOAD_MAX_TIMEOUT);
    });
  }

  /**
   * Wait for DOM to stabilize (no mutations for specified duration)
   */
  private waitForDOMStability(): Promise<void> {
    return new Promise((resolve) => {
      this.lastMutationTime = Date.now();

      const observer = new MutationObserver(() => {
        this.lastMutationTime = Date.now();

        if (this.mutationTimeout) clearTimeout(this.mutationTimeout);

        this.mutationTimeout = window.setTimeout(() => {
          observer.disconnect();
          resolve();
        }, this.DOM_STABILITY_WAIT);
      });

      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });

      setTimeout(() => {
        if (Date.now() - this.lastMutationTime >= this.DOM_STABILITY_WAIT) {
          observer.disconnect();
          if (this.mutationTimeout) clearTimeout(this.mutationTimeout);
          resolve();
        }
      }, this.DOM_STABILITY_WAIT);
    });
  }

  /**
   * Wait for resources (images, iframes, videos) to load
   */
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

  /**
   * Wait for skeleton/loading elements to disappear
   */
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

  /**
   * Check if skeleton/loading elements are visible on the page
   */
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

  /**
   * Check if an element is visible on the page
   */
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

