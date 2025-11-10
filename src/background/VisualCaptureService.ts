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
      // Get tab info to check if screenshot is possible
      const tab = await chrome.tabs.get(tabId);

      // Check if tab is in a capturable state
      if (!tab.active) {
        console.warn('[VisualCapture] Tab is not active, switching to it first');
        await chrome.tabs.update(tabId, { active: true });
        await this.sleep(100); // Brief wait for tab switch
      }

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

      console.log('[VisualCapture] Screenshot captured successfully');
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
