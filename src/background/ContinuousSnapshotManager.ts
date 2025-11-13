// ContinuousSnapshotManager - Manages continuous screenshot capture after page loads
import { CONTINUOUS_CAPTURE } from '@/shared/constants';
import type { CapturedSnapshot, ContinuousSnapshotWindow } from '@/shared/types';
import type { VisualCaptureService } from './VisualCaptureService';

/**
 * ContinuousSnapshotManager
 *
 * Handles continuous screenshot capture in a time window after page loads.
 * Implements a sliding window buffer that keeps:
 * - First 2 seconds of screenshots (capture initial page rendering)
 * - Last 2 seconds of screenshots (capture final stable state)
 * - Discards everything in between to save memory
 *
 * Usage:
 * 1. After page load: startContinuousCapture(tabId, sessionId)
 * 2. On user action: stopAndGetSnapshots() returns windowed screenshots
 * 3. On recording stop: cleanup() stops all captures
 */
export class ContinuousSnapshotManager {
  private visualCaptureService: VisualCaptureService;

  // Capture state
  private isCapturing = false;
  private captureIntervalId: number | null = null;

  // Buffer management
  private captureBuffer: CapturedSnapshot[] = [];
  private captureStartTime = 0;

  // Current capture context
  private currentTabId: number | null = null;
  private currentSessionId: string | null = null;

  constructor(visualCaptureService: VisualCaptureService) {
    this.visualCaptureService = visualCaptureService;
  }

  /**
   * Start continuous screenshot capture after a page load
   * Captures screenshots at CAPTURE_INTERVAL (500ms) and maintains sliding window
   *
   * @param tabId - Tab to capture screenshots from
   * @param sessionId - Current recording session ID
   */
  async startContinuousCapture(tabId: number, sessionId: string): Promise<void> {
    console.log('[ContinuousSnapshot] 🎬 Starting continuous capture', { tabId, sessionId });

    // Stop any existing capture first
    if (this.isCapturing) {
      console.warn('[ContinuousSnapshot] ⚠️ Already capturing, stopping previous capture');
      this.stopContinuousCapture();
    }

    // Initialize capture state
    this.isCapturing = true;
    this.currentTabId = tabId;
    this.currentSessionId = sessionId;
    this.captureStartTime = Date.now();
    this.captureBuffer = [];

    // Start capture interval (use self instead of window in service worker context)
    this.captureIntervalId = self.setInterval(() => {
      this.captureSnapshot();
    }, CONTINUOUS_CAPTURE.CAPTURE_INTERVAL);

    // Capture first screenshot immediately
    await this.captureSnapshot();
  }

  /**
   * Stop continuous capture and return windowed snapshots
   * Returns first 2s + last 2s of screenshots
   *
   * @returns Windowed snapshots ready for storage
   */
  stopAndGetSnapshots(): ContinuousSnapshotWindow {
    console.log('[ContinuousSnapshot] 🛑 Stopping and retrieving snapshots');

    if (!this.isCapturing) {
      console.log('[ContinuousSnapshot] Not currently capturing, returning empty window');
      return { firstWindow: [], lastWindow: [] };
    }

    // Get windowed snapshots before cleanup
    const windowedSnapshots = this.getWindowedSnapshots();

    // Stop and cleanup
    this.stopContinuousCapture();

    console.log('[ContinuousSnapshot] ✅ Retrieved snapshots:', {
      firstWindow: windowedSnapshots.firstWindow.length,
      lastWindow: windowedSnapshots.lastWindow.length,
      total: windowedSnapshots.firstWindow.length + windowedSnapshots.lastWindow.length
    });

    return windowedSnapshots;
  }

  /**
   * Stop continuous capture without returning snapshots
   * Used for cleanup when recording stops
   */
  stopContinuousCapture(): void {
    if (!this.isCapturing) {
      return;
    }

    console.log('[ContinuousSnapshot] 🧹 Cleaning up continuous capture');

    // Clear interval
    if (this.captureIntervalId !== null) {
      clearInterval(this.captureIntervalId);
      this.captureIntervalId = null;
    }

    // Reset state
    this.isCapturing = false;
    this.currentTabId = null;
    this.currentSessionId = null;
    this.captureStartTime = 0;
    this.captureBuffer = [];
  }

  /**
   * Check if currently capturing
   */
  isCurrentlyCapturing(): boolean {
    return this.isCapturing;
  }

  /**
   * Get current session ID being captured
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Internal: Capture a single screenshot and add to buffer
   */
  private async captureSnapshot(): Promise<void> {
    if (!this.isCapturing || this.currentTabId === null) {
      return;
    }

    try {
      const dataUrl = await this.visualCaptureService.captureTabScreenshot(
        this.currentTabId,
        true // immediate capture, no zoom normalization
      );

      if (dataUrl) {
        const now = Date.now();
        const relativeTime = now - this.captureStartTime;

        const snapshot: CapturedSnapshot = {
          timestamp: now,
          dataUrl,
          relativeTime
        };

        this.captureBuffer.push(snapshot);

        // Cleanup buffer to maintain sliding window
        this.cleanupBuffer();

        console.log('[ContinuousSnapshot] 📸 Captured snapshot', {
          relativeTime: `${relativeTime}ms`,
          bufferSize: this.captureBuffer.length
        });
      }
    } catch (error) {
      console.error('[ContinuousSnapshot] ❌ Failed to capture snapshot:', error);
    }
  }

  /**
   * Internal: Cleanup buffer to keep only first 2s + last 2s
   * Implements sliding window logic
   */
  private cleanupBuffer(): void {
    if (this.captureBuffer.length === 0) {
      return;
    }

    const now = Date.now();
    const elapsedTime = now - this.captureStartTime;

    // Keep all snapshots until we have more than first window duration
    if (elapsedTime <= CONTINUOUS_CAPTURE.FIRST_WINDOW_DURATION) {
      return; // Still in first window, keep everything
    }

    // After first window, implement sliding window
    // Keep: first 2s + last 2s, discard middle
    const firstWindowEnd = CONTINUOUS_CAPTURE.FIRST_WINDOW_DURATION;
    const lastWindowStart = elapsedTime - CONTINUOUS_CAPTURE.LAST_WINDOW_DURATION;

    this.captureBuffer = this.captureBuffer.filter(snapshot => {
      const isInFirstWindow = snapshot.relativeTime <= firstWindowEnd;
      const isInLastWindow = snapshot.relativeTime >= lastWindowStart;
      return isInFirstWindow || isInLastWindow;
    });
  }

  /**
   * Internal: Get windowed snapshots (first 2s + last 2s)
   * Returns organized windows for storage
   */
  private getWindowedSnapshots(): ContinuousSnapshotWindow {
    const firstWindowEnd = CONTINUOUS_CAPTURE.FIRST_WINDOW_DURATION;
    const elapsedTime = Date.now() - this.captureStartTime;
    const lastWindowStart = Math.max(
      firstWindowEnd,
      elapsedTime - CONTINUOUS_CAPTURE.LAST_WINDOW_DURATION
    );

    const firstWindow = this.captureBuffer.filter(
      snapshot => snapshot.relativeTime <= firstWindowEnd
    );

    const lastWindow = this.captureBuffer.filter(
      snapshot => snapshot.relativeTime >= lastWindowStart &&
                  snapshot.relativeTime > firstWindowEnd
    );

    return { firstWindow, lastWindow };
  }

  /**
   * Cleanup all resources
   * Called when recording stops or extension unloads
   */
  cleanup(): void {
    console.log('[ContinuousSnapshot] 🗑️ Full cleanup initiated');
    this.stopContinuousCapture();
  }
}
