// Visual capture service for screenshot capture
import type { VisualCapture } from '@/shared/types';
import { TIMING } from '@/shared/constants';

/**
 * VisualCaptureService - Intelligent screenshot capture and compression
 * Handles viewport screenshots, element highlighting, and thumbnail generation
 */
export class VisualCaptureService {
  /**
   * Capture screenshot of active tab
   * Handles zoom levels to ensure full viewport is captured
   */
  async captureTabScreenshot(tabId: number): Promise<string | null> {
    let originalZoom: number | null = null;

    try {
      // Get current zoom level
      originalZoom = await chrome.tabs.getZoom(tabId);

      console.log('[VisualCapture] Current zoom level:', originalZoom);

      // If zoom is not 100%, temporarily reset it
      if (originalZoom !== 1.0) {
        console.log('[VisualCapture] Resetting zoom to 100% for capture');
        await chrome.tabs.setZoom(tabId, 1.0);

        // Wait a moment for the page to reflow at new zoom level
        await this.sleep(TIMING.ZOOM_REFLOW_WAIT);
      }

      // Capture visible tab area at 100% zoom
      const dataUrl = await chrome.tabs.captureVisibleTab({
        format: 'png',
      });

      return dataUrl;
    } catch (error) {
      console.error('[VisualCapture] Failed to capture tab screenshot:', error);
      return null;
    } finally {
      // Always restore original zoom level
      if (originalZoom !== null && originalZoom !== 1.0) {
        try {
          await chrome.tabs.setZoom(tabId, originalZoom);
          console.log('[VisualCapture] Restored original zoom level:', originalZoom);
        } catch (restoreError) {
          console.error('[VisualCapture] Failed to restore zoom:', restoreError);
        }
      }
    }
  }

  /**
   * Wait for page to be ready before capturing screenshot
   * Convenience method that combines page readiness detection with screenshot capture
   */
  async captureWhenReady(tabId: number): Promise<{ screenshot: string | null; readiness: any }> {
    try {
      // Inject and execute the detection script
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: async () => {
          // Inline PageLoadDetector for injection
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

            constructor(maxTimeout = TIMING.PAGE_LOAD_MAX_TIMEOUT, domStabilityWait = TIMING.DOM_STABILITY_WAIT) {
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
                    const timeout = setTimeout(() => resolve(), TIMING.RESOURCE_LOAD_TIMEOUT);
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
              const maxWait = TIMING.SKELETON_MAX_WAIT;
              const checkInterval = TIMING.SKELETON_CHECK_INTERVAL;
              const startTime = Date.now();

              return new Promise((resolve) => {
                const checkSkeletons = () => {
                  const hasSkeletons = this.hasSkeletonElements();

                  if (!hasSkeletons || Date.now() - startTime >= maxWait) {
                    resolve();
                    return;
                  }

                  setTimeout(checkSkeletons, checkInterval);
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

          // Execute detection
          const detector = new PageLoadDetector(TIMING.PAGE_LOAD_MAX_TIMEOUT, TIMING.DOM_STABILITY_WAIT);
          try {
            const result = await detector.waitForPageReady();
            detector.cleanup();
            return result;
          } catch (error) {
            detector.cleanup();
            throw error;
          }
        },
      });

      const readiness = result && result[0] && result[0].result ? result[0].result : {
        isReady: true,
        reason: 'Detection script failed, using fallback',
        duration: 0,
        checks: { domStable: false, resourcesLoaded: false, noSkeletons: false },
      };

      // Capture screenshot after detection completes
      const screenshot = await this.captureTabScreenshot(tabId);

      return { screenshot, readiness };
    } catch (error) {
      console.error('[VisualCapture] Error in captureWhenReady:', error);
      // Fallback to direct capture
      const screenshot = await this.captureTabScreenshot(tabId);
      return {
        screenshot,
        readiness: {
          isReady: true,
          reason: 'Detection error, captured anyway',
          duration: 0,
          checks: { domStable: false, resourcesLoaded: false, noSkeletons: false },
        },
      };
    }
  }

  /**
   * Capture full visual context for a step
   * Returns viewport screenshot with optional element highlighting
   */
  async captureStepVisual(
    tabId: number,
    selector?: string
  ): Promise<VisualCapture | null> {
    try {
      // Capture viewport screenshot
      const viewport = await this.captureTabScreenshot(tabId);
      if (!viewport) return null;

      // Generate thumbnail
      const thumbnail = await this.generateThumbnail(viewport);

      const visual: VisualCapture = {
        viewport,
        thumbnail,
      };

      // If selector provided, highlight the element
      if (selector) {
        const annotated = await this.captureWithHighlight(tabId, selector);
        if (annotated) {
          visual.annotated = annotated;
        }
      }

      return visual;
    } catch (error) {
      console.error('[VisualCapture] Failed to capture step visual:', error);
      return null;
    }
  }


  /**
   * Capture screenshot with element highlighted
   */
  private async captureWithHighlight(
    tabId: number,
    selector: string
  ): Promise<string | null> {
    try {
      // Inject highlighting script
      await chrome.scripting.executeScript({
        target: { tabId },
        func: this.highlightElement,
        args: [selector],
      });

      // Wait for highlight to render
      await this.sleep(TIMING.HIGHLIGHT_RENDER_WAIT);

      // Capture screenshot
      const screenshot = await this.captureTabScreenshot(tabId);

      // Remove highlight
      await chrome.scripting.executeScript({
        target: { tabId },
        func: this.removeHighlight,
      });

      return screenshot;
    } catch (error) {
      console.error('[VisualCapture] Failed to capture with highlight:', error);
      return null;
    }
  }

  /**
   * Generate thumbnail from full screenshot
   * Note: Service workers don't have Image/Canvas, so we skip thumbnail generation
   * and just use the full screenshot
   */
  private async generateThumbnail(dataUrl: string): Promise<string> {
    // Service workers don't have DOM APIs
    // Return the full screenshot for now
    // TODO: Use offscreen canvas API if needed for smaller thumbnails
    return dataUrl;
  }

  /**
   * Inject function to highlight element in page
   */
  private highlightElement(selector: string): void {
    try {
      // Handle XPath selectors
      let element: Element | null = null;
      if (selector.startsWith('xpath:')) {
        const xpath = selector.substring(6);
        const result = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        element = result.singleNodeValue as Element;
      } else {
        element = document.querySelector(selector);
      }

      if (!element) return;

      // Create highlight overlay
      const highlight = document.createElement('div');
      highlight.id = '__workflow_recorder_highlight__';
      highlight.style.cssText = `
        position: absolute;
        pointer-events: none;
        z-index: 999999;
        border: 3px solid #3b82f6;
        background-color: rgba(59, 130, 246, 0.1);
        box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2);
        border-radius: 4px;
        transition: all 0.2s ease;
      `;

      const rect = element.getBoundingClientRect();
      highlight.style.top = `${rect.top + window.scrollY}px`;
      highlight.style.left = `${rect.left + window.scrollX}px`;
      highlight.style.width = `${rect.width}px`;
      highlight.style.height = `${rect.height}px`;

      document.body.appendChild(highlight);
    } catch (error) {
      console.error('Failed to highlight element:', error);
    }
  }

  /**
   * Inject function to remove highlight from page
   */
  private removeHighlight(): void {
    const highlight = document.getElementById('__workflow_recorder_highlight__');
    if (highlight) {
      highlight.remove();
    }
  }

  /**
   * Capture element-specific screenshot
   */
  async captureElement(tabId: number, selector: string): Promise<string | null> {
    try {
      // First, scroll element into view
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (sel: string) => {
          let element: Element | null = null;
          if (sel.startsWith('xpath:')) {
            const xpath = sel.substring(6);
            const result = document.evaluate(
              xpath,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null
            );
            element = result.singleNodeValue as Element;
          } else {
            element = document.querySelector(sel);
          }

          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        },
        args: [selector],
      });

      // Wait for scroll to complete
      await this.sleep(TIMING.SCROLL_COMPLETE_WAIT);

      // Capture with highlight
      return await this.captureWithHighlight(tabId, selector);
    } catch (error) {
      console.error('[VisualCapture] Failed to capture element:', error);
      return null;
    }
  }

  /**
   * Compress image data URL
   */
  async compressImage(dataUrl: string, quality: number = 0.8): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          ctx.drawImage(img, 0, 0);

          const compressed = canvas.toDataURL('image/jpeg', quality);
          resolve(compressed);
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = dataUrl;
    });
  }

  /**
   * Calculate image size in bytes
   */
  getImageSize(dataUrl: string): number {
    // Remove data URL prefix
    const base64 = dataUrl.split(',')[1];
    if (!base64) return 0;

    // Calculate size (each base64 char is ~0.75 bytes)
    return Math.ceil((base64.length * 3) / 4);
  }

  /**
   * Format image size for display
   */
  formatImageSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Capture full page screenshot (scrolling)
   */
  async captureFullPage(tabId: number): Promise<string | null> {
    try {
      // Get page dimensions
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => ({
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        }),
      });

      if (!result?.result) return null;

      const { height, viewportHeight } = result.result;

      // If page fits in viewport, just capture it
      if (height <= viewportHeight) {
        return await this.captureTabScreenshot(tabId);
      }

      // For full page, we'd need to scroll and stitch screenshots
      // For MVP, just capture viewport
      // TODO: Implement full page capture with scrolling and stitching
      console.warn('[VisualCapture] Full page capture not yet implemented, using viewport');
      return await this.captureTabScreenshot(tabId);
    } catch (error) {
      console.error('[VisualCapture] Failed to capture full page:', error);
      return null;
    }
  }

  /**
   * Validate screenshot data URL
   */
  isValidScreenshot(dataUrl: string): boolean {
    return dataUrl.startsWith('data:image/') && dataUrl.includes('base64');
  }
}
