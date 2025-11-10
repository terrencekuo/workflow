// Visual capture service for screenshot capture
import { TIMING } from '@/shared/constants';

/**
 * VisualCaptureService - Intelligent screenshot capture
 * Handles viewport screenshots with zoom normalization
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
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
