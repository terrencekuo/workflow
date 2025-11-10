// Visual capture service for screenshot capture
import { TIMING } from '@/shared/constants';

/**
 * VisualCaptureService - Intelligent screenshot capture
 * Handles viewport screenshots with zoom normalization and rate limiting
 */
export class VisualCaptureService {
  private lastCaptureTime = 0;
  private readonly MIN_CAPTURE_INTERVAL = 500; // 500ms = 2 captures per second max

  /**
   * Capture screenshot of active tab with rate limiting
   * Handles zoom levels to ensure full viewport is captured
   *
   * Chrome enforces MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND (~2/sec)
   * We rate limit to avoid quota errors
   */
  async captureTabScreenshot(tabId: number, immediate: boolean = false): Promise<string | null> {
    // Rate limiting: ensure we don't exceed Chrome's quota
    const now = Date.now();
    const timeSinceLastCapture = now - this.lastCaptureTime;

    if (timeSinceLastCapture < this.MIN_CAPTURE_INTERVAL) {
      const waitTime = this.MIN_CAPTURE_INTERVAL - timeSinceLastCapture;
      console.log(`[VisualCapture] ⏱️ Rate limiting: waiting ${waitTime}ms before capture`);
      await this.sleep(waitTime);
    }

    this.lastCaptureTime = Date.now();
    let originalZoom: number | null = null;

    try {
      // Get tab info to check if screenshot is possible
      const tab = await chrome.tabs.get(tabId);

      // For immediate captures (navigation events), skip tab activation check
      // to capture as fast as possible before page unloads
      if (!immediate && !tab.active) {
        console.warn('[VisualCapture] Tab is not active, switching to it first');
        await chrome.tabs.update(tabId, { active: true });
        await this.sleep(100); // Brief wait for tab switch
      }

      // Get current zoom level
      originalZoom = await chrome.tabs.getZoom(tabId);

      // For immediate captures, skip zoom normalization to be faster
      if (!immediate) {
        console.log('[VisualCapture] Current zoom level:', originalZoom);

        // If zoom is not 100%, temporarily reset it
        if (originalZoom !== 1.0) {
          console.log('[VisualCapture] Resetting zoom to 100% for capture');
          await chrome.tabs.setZoom(tabId, 1.0);

          // Wait a moment for the page to reflow at new zoom level
          await this.sleep(TIMING.ZOOM_REFLOW_WAIT);
        }
      }

      // Capture visible tab area
      const dataUrl = await chrome.tabs.captureVisibleTab({
        format: 'png',
      });

      console.log(`[VisualCapture] Screenshot captured ${immediate ? 'immediately' : 'successfully'}`);
      return dataUrl;
    } catch (error) {
      // Provide more specific error messages
      if (error instanceof Error) {
        if (error.message.includes('Cannot access') || error.message.includes('activeTab')) {
          console.error('[VisualCapture] Cannot capture screenshot - restricted page or insufficient permissions');
        } else if (error.message.includes('No active web contents')) {
          console.error('[VisualCapture] Cannot capture screenshot - no active web contents');
        } else {
          console.error('[VisualCapture] Failed to capture tab screenshot:', error.message);
        }
      } else {
        console.error('[VisualCapture] Failed to capture tab screenshot:', error);
      }
      return null;
    } finally {
      // For non-immediate captures, restore original zoom level
      if (!immediate && originalZoom !== null && originalZoom !== 1.0) {
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
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
