// Visual capture service for screenshot capture
import type { VisualCapture } from '@/shared/types';

/**
 * VisualCaptureService - Intelligent screenshot capture and compression
 * Handles viewport screenshots, element highlighting, and thumbnail generation
 */
export class VisualCaptureService {
  /**
   * Capture screenshot of active tab
   */
  async captureTabScreenshot(_tabId: number): Promise<string | null> {
    try {
      // Capture visible tab area (uses active tab's window)
      const dataUrl = await chrome.tabs.captureVisibleTab({
        format: 'png',
      });

      return dataUrl;
    } catch (error) {
      console.error('[VisualCapture] Failed to capture tab screenshot:', error);
      return null;
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
      await this.sleep(100);

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
      await this.sleep(300);

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
