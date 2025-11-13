// StepRecorder: Manages recording steps and coordinating visual captures
import { db } from '@/shared/db';
import { EVENT_TYPES } from '@/shared/constants';
import type { RecordedStep, MessageResponse } from '@/shared/types';
import { VisualCaptureService } from '@/background/VisualCaptureService';
import { RecordingStateManager } from '@/background/RecordingStateManager';
import { ContinuousSnapshotManager } from '@/background/ContinuousSnapshotManager';

export class StepRecorder {
  private visualCaptureService: VisualCaptureService;
  private stateManager: RecordingStateManager;
  private continuousSnapshotManager: ContinuousSnapshotManager;

  constructor(
    visualCaptureService: VisualCaptureService,
    stateManager: RecordingStateManager,
    continuousSnapshotManager: ContinuousSnapshotManager
  ) {
    this.visualCaptureService = visualCaptureService;
    this.stateManager = stateManager;
    this.continuousSnapshotManager = continuousSnapshotManager;
  }

  /**
   * Record a step from content script
   * Captures screenshot based on event type - immediate for navigation, smart detection for others
   */
  async recordStep(step: RecordedStep): Promise<MessageResponse> {
    try {
      const sessionId = this.stateManager.getCurrentSessionId();
      const currentTabId = this.stateManager.getCurrentTabId();

      console.log('[StepRecorder] 🔵 recordStep called with:', {
        stepType: step.type,
        selector: step.selector,
        isRecording: this.stateManager.isCurrentlyRecording(),
        sessionId: sessionId,
        currentTabId: currentTabId
      });

      if (!this.stateManager.isCurrentlyRecording() || !sessionId) {
        console.log('[StepRecorder] ⚠️ Not recording or no session');
        return { success: false, error: 'Not currently recording' };
      }

      // Stop continuous capture and retrieve windowed snapshots if active
      const windowedSnapshots = this.continuousSnapshotManager.stopAndGetSnapshots();

      // Store windowed snapshots before the current step
      if (windowedSnapshots.firstWindow.length > 0 || windowedSnapshots.lastWindow.length > 0) {
        console.log('[StepRecorder] 📦 Storing windowed snapshots from continuous capture');
        await this.storeWindowedSnapshots(sessionId, windowedSnapshots);
      }

      // Ensure step has session ID
      step.sessionId = sessionId;

      // SIMPLIFIED: Capture screenshot for major events
      const shouldCapture = this.shouldCaptureVisual(step.type);
      console.log('[StepRecorder] shouldCaptureVisual(' + step.type + ') =', shouldCapture);

      if (shouldCapture && currentTabId) {
        try {
          console.log('[StepRecorder] 📷 Capturing screenshot for step type:', step.type);

          // SIMPLE: Always capture immediately, no smart detection
          const screenshot = await this.visualCaptureService.captureTabScreenshot(
            currentTabId,
            true // immediate mode
          );

          if (screenshot) {
            step.visual = {
              viewport: screenshot,
              thumbnail: screenshot,
            };

            if (!step.metadata) {
              step.metadata = {};
            }
            step.metadata.captureType = 'immediate';

            console.log('[StepRecorder] ✅ Screenshot captured');
          } else {
            console.warn('[StepRecorder] ⚠️ No screenshot returned');
          }
        } catch (error) {
          console.warn('[StepRecorder] ❌ Screenshot failed:', error);
        }
      }

      // Save step to database
      await db.addStep(sessionId, step);

      await this.stateManager.incrementStepCount();

      console.log('[StepRecorder] Recorded step:', step.type, step.selector);

      return { success: true, data: { stepId: step.id } };
    } catch (error) {
      console.error('[StepRecorder] Error recording step:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to record step',
      };
    }
  }

  /**
   * Capture a manual screenshot
   */
  async captureManualScreenshot(): Promise<MessageResponse> {
    try {
      const sessionId = this.stateManager.getCurrentSessionId();
      const currentTabId = this.stateManager.getCurrentTabId();

      if (!this.stateManager.isCurrentlyRecording() || !sessionId || !currentTabId) {
        return { success: false, error: 'Not currently recording' };
      }

      console.log('[StepRecorder] Manual screenshot capture requested');

      // Get current tab info
      const tab = await chrome.tabs.get(currentTabId);

      // Simple: Just capture immediately
      const screenshot = await this.visualCaptureService.captureTabScreenshot(currentTabId);

      if (screenshot) {
        // Create a manual capture step
        const manualStep: RecordedStep = {
          id: crypto.randomUUID(),
          sessionId: sessionId,
          type: EVENT_TYPES.PAGE_LOAD,
          selector: 'window',
          value: tab.url || '',
          url: tab.url || '',
          timestamp: Date.now(),
          metadata: {
            type: 'manualCapture',
            url: tab.url || '',
            description: 'Manual screenshot capture',
          },
          visual: {
            viewport: screenshot,
            thumbnail: screenshot,
          },
        };

        // Save to database
        await db.addStep(sessionId, manualStep);
        await this.stateManager.incrementStepCount();

        console.log('[StepRecorder] Manual screenshot captured successfully');
        return { success: true, data: { stepId: manualStep.id } };
      }

      return { success: false, error: 'Failed to capture screenshot' };
    } catch (error) {
      console.error('[StepRecorder] Error capturing manual screenshot:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to capture screenshot',
      };
    }
  }

  /**
   * Capture initial screenshot when recording starts
   * This captures the page BEFORE any content script modifications
   */
  async captureInitialScreenshot(tabId: number, sessionId: string): Promise<void> {
    const startTime = Date.now();

    try {
      console.log('[StepRecorder] 📸 Capturing initial page state...');

      // Get current tab info
      const tab = await chrome.tabs.get(tabId);

      if (!tab.url) {
        throw new Error('Tab URL is not available');
      }

      console.log('[StepRecorder] Tab URL:', tab.url);

      // Simple wait for initial screenshot (content script not loaded yet)
      // Use a brief delay to ensure page has rendered
      const waitTime = 50; // Brief wait for page stability
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      console.log(`[StepRecorder] ✓ Waited ${waitTime}ms for initial page stability`);

      // Capture screenshot
      const screenshot = await this.visualCaptureService.captureTabScreenshot(tabId);

      if (!screenshot) {
        throw new Error('Failed to capture screenshot - no data returned');
      }

      // Create an initial step to show the starting point
      const initialStep: RecordedStep = {
        id: crypto.randomUUID(),
        sessionId: sessionId,
        type: EVENT_TYPES.PAGE_LOAD,
        selector: 'window',
        value: tab.url,
        url: tab.url,
        timestamp: Date.now(),
        metadata: {
          type: 'initialState',
          url: tab.url,
          description: 'Initial page state when recording started',
          captureTime: Date.now() - startTime,
          note: 'Captured before content script loaded',
        },
        visual: {
          viewport: screenshot,
          thumbnail: screenshot,
        },
      };

      // Save initial step to database
      await db.addStep(sessionId, initialStep);
      await this.stateManager.incrementStepCount();

      const totalTime = Date.now() - startTime;
      console.log(`[StepRecorder] ✓ Initial screenshot captured successfully (${totalTime}ms total)`);
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(`[StepRecorder] ✗ Error capturing initial screenshot (${totalTime}ms):`, error);
      // Don't fail recording if initial screenshot fails - this is non-critical
      // Recording will continue without the initial screenshot
    }
  }

  /**
   * SIMPLIFIED: Capture a pageLoad step when navigation completes
   * NO smart detection, NO complex timing - just capture what's there
   */
  async capturePageLoadStep(tabId: number, url: string): Promise<void> {
    console.log('[StepRecorder] 🔵 SIMPLIFIED capturePageLoadStep START');
    console.log('[StepRecorder] TabId:', tabId, 'URL:', url);

    const sessionId = this.stateManager.getCurrentSessionId();
    const currentTabId = this.stateManager.getCurrentTabId();

    console.log('[StepRecorder] Recording state:', {
      isRecording: this.stateManager.isCurrentlyRecording(),
      sessionId: sessionId,
      currentTabId: currentTabId,
      stepCount: this.stateManager.getStepCount()
    });

    if (!this.stateManager.isCurrentlyRecording() || !sessionId) {
      console.warn('[StepRecorder] ⚠️ Not recording, skipping');
      return;
    }

    if (tabId !== currentTabId) {
      console.warn('[StepRecorder] ⚠️ Wrong tab, skipping');
      return;
    }

    try {
      console.log('[StepRecorder] 📷 Capturing screenshot NOW (no waiting)...');

      // SIMPLE: Just capture screenshot immediately
      const screenshot = await this.visualCaptureService.captureTabScreenshot(tabId);

      console.log('[StepRecorder] Screenshot result:', screenshot ? `${screenshot.length} chars` : 'NULL');

      // Create page load step
      const step: RecordedStep = {
        id: crypto.randomUUID(),
        sessionId: sessionId,
        type: EVENT_TYPES.PAGE_LOAD,
        selector: 'window',
        value: url,
        url: url,
        timestamp: Date.now(),
        metadata: {
          type: 'pageLoad',
          url: url,
          simplified: true,
        },
      };

      if (screenshot) {
        step.visual = {
          viewport: screenshot,
          thumbnail: screenshot,
        };
      }

      console.log('[StepRecorder] 💾 Saving to database...');
      await db.addStep(sessionId, step);
      await this.stateManager.incrementStepCount();

      console.log('[StepRecorder] ✅ DONE! Step count:', this.stateManager.getStepCount());
    } catch (error) {
      console.error('[StepRecorder] ❌ ERROR:', error);
    }
  }

  /**
   * Determine if a step type should have visual capture
   */
  private shouldCaptureVisual(stepType: string): boolean {
    // Capture screenshots for interactive events
    const visualEvents = [
      EVENT_TYPES.CLICK,
      EVENT_TYPES.SUBMIT,
      EVENT_TYPES.NAVIGATION,
      EVENT_TYPES.PAGE_LOAD,
    ];
    const result = visualEvents.includes(stepType as any);
    console.log('[StepRecorder] shouldCaptureVisual check:', {
      stepType,
      visualEvents,
      result
    });
    return result;
  }

  /**
   * Store windowed snapshots from continuous capture as separate steps
   */
  async storeWindowedSnapshots(
    sessionId: string,
    windowedSnapshots: import('@/shared/types').ContinuousSnapshotWindow
  ): Promise<void> {
    const allSnapshots = [
      ...windowedSnapshots.firstWindow,
      ...windowedSnapshots.lastWindow
    ];

    console.log('[StepRecorder] Storing', allSnapshots.length, 'continuous snapshots');

    for (const snapshot of allSnapshots) {
      const step: RecordedStep = {
        id: crypto.randomUUID(),
        sessionId: sessionId,
        type: 'continuous_snapshot',
        selector: 'window',
        timestamp: snapshot.timestamp,
        metadata: {
          type: 'continuousSnapshot',
          relativeTime: snapshot.relativeTime,
          description: `Continuous snapshot at ${snapshot.relativeTime}ms after page load`,
        },
        visual: {
          viewport: snapshot.dataUrl,
          thumbnail: snapshot.dataUrl,
        },
      };

      await db.addStep(sessionId, step);
      await this.stateManager.incrementStepCount();
    }

    console.log('[StepRecorder] ✅ Stored all continuous snapshots');
  }

  /**
   * Capture final screenshot when stopping recording
   */
  async captureFinalScreenshot(tabId: number, sessionId: string): Promise<void> {
    try {
      console.log('[StepRecorder] 📸 Capturing final screenshot...');

      // Get current tab info
      const tab = await chrome.tabs.get(tabId);

      // Capture screenshot
      const screenshot = await this.visualCaptureService.captureTabScreenshot(tabId);

      if (screenshot) {
        // Create a final step
        const finalStep: RecordedStep = {
          id: crypto.randomUUID(),
          sessionId: sessionId,
          type: EVENT_TYPES.PAGE_LOAD,
          selector: 'window',
          value: tab.url || '',
          url: tab.url || '',
          timestamp: Date.now(),
          metadata: {
            type: 'finalScreenshot',
            url: tab.url || '',
            description: 'Final screenshot when recording stopped',
          },
          visual: {
            viewport: screenshot,
            thumbnail: screenshot,
          },
        };

        // Save to database
        await db.addStep(sessionId, finalStep);
        await this.stateManager.incrementStepCount();

        console.log('[StepRecorder] ✅ Final screenshot captured successfully');
      } else {
        console.warn('[StepRecorder] ⚠️ No final screenshot captured');
      }
    } catch (error) {
      console.error('[StepRecorder] ❌ Error capturing final screenshot:', error);
      // Don't fail the stop recording if final screenshot fails
    }
  }
}
