// RecorderController: Manages recording state and coordinates recording across tabs
import { db } from '@/shared/db';
import { COMMANDS, STORAGE_KEYS, EVENT_TYPES } from '@/shared/constants';
import type {
  RecordingState,
  RecordedStep,
  SessionMetadata,
  MessageResponse,
} from '@/shared/types';
import { MessageBroker } from '@/background/MessageBroker';
import { VisualCaptureService } from '@/background/VisualCaptureService';
import { BadgeManager } from '@/background/utils/BadgeManager';

export class RecorderController {
  private isRecording = false;
  private currentSessionId: string | null = null;
  private currentTabId: number | null = null;
  private messageBroker: MessageBroker;
  private visualCaptureService: VisualCaptureService;
  private stepCount = 0;

  constructor(messageBroker: MessageBroker, visualCaptureService: VisualCaptureService) {
    this.messageBroker = messageBroker;
    this.visualCaptureService = visualCaptureService;
    this.setupMessageHandlers();
    this.setupTabListeners();
    this.restoreState();
  }

  /**
   * Check if a URL is valid for content script injection and screenshot capture
   * Chrome doesn't allow extensions to interact with certain pages
   */
  private isValidUrl(url: string | undefined): boolean {
    if (!url) return false;

    // List of restricted URL schemes/patterns
    const restrictedPatterns = [
      /^chrome:\/\//i,
      /^chrome-extension:\/\//i,
      /^about:/i,
      /^edge:\/\//i,
      /^brave:\/\//i,
      /^opera:\/\//i,
      /^vivaldi:\/\//i,
      /^data:/i,
      /^file:\/\//i,
      /^view-source:/i,
      /chrome\.google\.com\/webstore/i,
    ];

    return !restrictedPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Set up message handlers
   */
  private setupMessageHandlers(): void {
    this.messageBroker.on(COMMANDS.START_RECORDING, this.handleStartRecording.bind(this));
    this.messageBroker.on(COMMANDS.STOP_RECORDING, this.handleStopRecording.bind(this));
    this.messageBroker.on(COMMANDS.RECORD_STEP, this.handleRecordStep.bind(this));
    this.messageBroker.on(COMMANDS.CAPTURE_SCREENSHOT, this.handleCaptureScreenshot.bind(this));
    this.messageBroker.on(COMMANDS.GET_RECORDING_STATE, this.handleGetState.bind(this));
    this.messageBroker.on(COMMANDS.CONTENT_SCRIPT_READY, this.handleContentScriptReady.bind(this));
  }

  /**
   * Set up tab listeners to track tab changes and closures
   */
  private setupTabListeners(): void {
    // Track when active tab changes
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      if (this.isRecording) {
        await this.handleTabChange(activeInfo.tabId);
      }
    });

    // Track when tabs are updated (URL changes)
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      // Log all status changes for debugging
      if (this.isRecording && tabId === this.currentTabId) {
        console.log('[RecorderController] Tab status change:', changeInfo.status, 'URL:', tab.url);
      }

      // Handle both 'loading' and 'complete' states to ensure we don't miss page loads
      if (this.isRecording && tabId === this.currentTabId) {
        // When page starts loading, log it
        if (changeInfo.status === 'loading') {
          console.log('[RecorderController] 🔄 Page loading started:', tab.url);
        }

        // When page finishes loading, capture the final state
        if (changeInfo.status === 'complete') {
          console.log('[RecorderController] ✅ Tab navigation complete:', tabId, 'URL:', tab.url);

          // Check if this is a valid URL for extension interaction
          if (!this.isValidUrl(tab.url)) {
            console.warn('[RecorderController] Skipping restricted URL:', tab.url);
            return;
          }

          // Ensure content script is loaded for event recording
          console.log('[RecorderController] Ensuring content script is loaded...');
          await this.ensureContentScriptLoaded(tabId);

          // Capture the final loaded state after navigation
          console.log('[RecorderController] Calling capturePageLoadStep...');
          try {
            await this.capturePageLoadStepSimplified(tabId, tab.url || '');
            console.log('[RecorderController] ✅ Page load handling complete');
          } catch (error) {
            console.error('[RecorderController] ❌ Error in capturePageLoadStep:', error);
          }
        }
      }
    });

    // Clean up when tabs are closed
    chrome.tabs.onRemoved.addListener((tabId) => {
      if (tabId === this.currentTabId && this.isRecording) {
        console.warn('[RecorderController] Recording tab closed, stopping recording');
        this.stopRecording();
      }
    });

    console.log('[RecorderController] Tab listeners initialized');
  }

  /**
   * Restore recording state from storage
   */
  private async restoreState(): Promise<void> {
    try {
      const result = await chrome.storage.session.get(STORAGE_KEYS.RECORDING_STATE);
      if (result[STORAGE_KEYS.RECORDING_STATE]) {
        const state = result[STORAGE_KEYS.RECORDING_STATE] as RecordingState;
        this.isRecording = state.status === 'recording';
        this.currentSessionId = state.sessionId;
        this.currentTabId = state.currentTabId;
        this.stepCount = state.stepCount;

        // Restore badge state
        await BadgeManager.setRecording(this.isRecording);

        console.log('[RecorderController] State restored:', state);
      }
    } catch (error) {
      console.error('[RecorderController] Error restoring state:', error);
    }
  }

  /**
   * Save recording state to storage
   */
  private async saveState(): Promise<void> {
    const state: RecordingState = {
      status: this.isRecording ? 'recording' : 'idle',
      sessionId: this.currentSessionId,
      currentTabId: this.currentTabId,
      stepCount: this.stepCount,
    };

    try {
      await chrome.storage.session.set({
        [STORAGE_KEYS.RECORDING_STATE]: state,
      });
    } catch (error) {
      console.error('[RecorderController] Error saving state:', error);
    }
  }

  /**
   * Handle start recording command
   */
  private async handleStartRecording(
    data: { metadata: SessionMetadata }
  ): Promise<MessageResponse> {
    try {
      // Get the active tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];

      if (!activeTab || !activeTab.id) {
        return { success: false, error: 'No active tab found' };
      }

      await this.startRecording(activeTab.id, data.metadata);

      return {
        success: true,
        data: {
          sessionId: this.currentSessionId,
          tabId: this.currentTabId,
        },
      };
    } catch (error) {
      console.error('[RecorderController] Error starting recording:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start recording',
      };
    }
  }

  /**
   * Handle stop recording command
   */
  private async handleStopRecording(): Promise<MessageResponse> {
    try {
      await this.stopRecording();
      return { success: true };
    } catch (error) {
      console.error('[RecorderController] Error stopping recording:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to stop recording',
      };
    }
  }

  /**
   * Handle record step command from content script
   * Captures screenshot based on event type - immediate for navigation, smart detection for others
   */
  private async handleRecordStep(
    step: RecordedStep
  ): Promise<MessageResponse> {
    try {
      if (!this.isRecording || !this.currentSessionId) {
        return { success: false, error: 'Not currently recording' };
      }

      // Ensure step has session ID
      step.sessionId = this.currentSessionId;

      // SIMPLIFIED: Capture screenshot for major events
      if (this.shouldCaptureVisual(step.type) && this.currentTabId) {
        try {
          console.log('[RecorderController] 📷 Capturing screenshot for step type:', step.type);

          // SIMPLE: Always capture immediately, no smart detection
          const screenshot = await this.visualCaptureService.captureTabScreenshot(
            this.currentTabId,
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

            console.log('[RecorderController] ✅ Screenshot captured');
          } else {
            console.warn('[RecorderController] ⚠️ No screenshot returned');
          }
        } catch (error) {
          console.warn('[RecorderController] ❌ Screenshot failed:', error);
        }
      }

      // Save step to database
      await db.addStep(this.currentSessionId, step);

      this.stepCount++;
      await this.saveState();

      console.log('[RecorderController] Recorded step:', step.type, step.selector);

      return { success: true, data: { stepId: step.id } };
    } catch (error) {
      console.error('[RecorderController] Error recording step:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to record step',
      };
    }
  }


  /**
   * Handle manual screenshot capture command (SIMPLIFIED)
   */
  private async handleCaptureScreenshot(): Promise<MessageResponse> {
    try {
      if (!this.isRecording || !this.currentSessionId || !this.currentTabId) {
        return { success: false, error: 'Not currently recording' };
      }

      console.log('[RecorderController] Manual screenshot capture requested');

      // Get current tab info
      const tab = await chrome.tabs.get(this.currentTabId);

      // Simple: Just capture immediately
      const screenshot = await this.visualCaptureService.captureTabScreenshot(this.currentTabId);

      if (screenshot) {
        // Create a manual capture step
        const manualStep: RecordedStep = {
          id: crypto.randomUUID(),
          sessionId: this.currentSessionId,
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
        await db.addStep(this.currentSessionId, manualStep);
        this.stepCount++;
        await this.saveState();

        console.log('[RecorderController] Manual screenshot captured successfully');
        return { success: true, data: { stepId: manualStep.id } };
      }

      return { success: false, error: 'Failed to capture screenshot' };
    } catch (error) {
      console.error('[RecorderController] Error capturing manual screenshot:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to capture screenshot',
      };
    }
  }

  /**
   * Handle get recording state command
   */
  private handleGetState(): MessageResponse {
    return {
      success: true,
      data: {
        status: this.isRecording ? 'recording' : 'idle',
        sessionId: this.currentSessionId,
        currentTabId: this.currentTabId,
        stepCount: this.stepCount,
      } as RecordingState,
    };
  }

  /**
   * Handle content script ready notification
   */
  private handleContentScriptReady(
    _data: any,
    sender: chrome.runtime.MessageSender
  ): MessageResponse {
    const tabId = sender.tab?.id;
    if (tabId) {
      console.log('[RecorderController] Content script ready in tab:', tabId);

      // If we're recording and this is the current tab, start recording in the content script
      if (this.isRecording && tabId === this.currentTabId) {
        this.messageBroker.emit(COMMANDS.START_RECORDING, { sessionId: this.currentSessionId }, tabId);
      }
    }
    return { success: true };
  }

  /**
   * Start recording
   */
  async startRecording(tabId: number, metadata: SessionMetadata): Promise<void> {
    if (this.isRecording) {
      throw new Error('Recording already in progress');
    }

    console.log('[RecorderController] Starting recording for tab:', tabId);

    // Get tab info and validate URL
    const tab = await chrome.tabs.get(tabId);
    if (!this.isValidUrl(tab.url)) {
      throw new Error(`Cannot record on restricted pages. Please navigate to a regular website.\nCurrent URL: ${tab.url}`);
    }

    // Initialize database
    await db.init();

    // Create new session
    const sessionId = await db.createSession(metadata);

    this.currentSessionId = sessionId;
    this.currentTabId = tabId;
    this.isRecording = true;
    this.stepCount = 0;

    // Update badge to show recording status
    await BadgeManager.setRecording(true);

    // IMPORTANT: Capture initial screenshot BEFORE loading content script
    // This ensures we capture the page in its pristine state
    console.log('[RecorderController] Capturing initial page state...');
    await this.captureInitialScreenshot(tabId);

    // Now ensure content script is loaded
    await this.ensureContentScriptLoaded(tabId);

    // Send start recording message to content script
    await this.messageBroker.emit(COMMANDS.START_RECORDING, { sessionId }, tabId);

    // Save state
    await this.saveState();

    console.log('[RecorderController] Recording started successfully:', sessionId);
  }

  /**
   * Stop recording
   */
  async stopRecording(): Promise<void> {
    if (!this.isRecording) {
      return;
    }

    // Send stop recording message to content script
    if (this.currentTabId) {
      await this.messageBroker.emit(COMMANDS.STOP_RECORDING, {}, this.currentTabId);
    }

    this.isRecording = false;
    this.currentSessionId = null;
    this.currentTabId = null;
    this.stepCount = 0;

    // Update badge to show idle status
    await BadgeManager.setRecording(false);

    // Save state
    await this.saveState();

    console.log('[RecorderController] Recording stopped');
  }

  /**
   * Handle tab change during recording
   */
  async handleTabChange(tabId: number): Promise<void> {
    if (!this.isRecording) {
      return;
    }

    console.log('[RecorderController] Tab changed to:', tabId);

    // Stop recording in old tab
    if (this.currentTabId && this.currentTabId !== tabId) {
      await this.messageBroker.emit(COMMANDS.STOP_RECORDING, {}, this.currentTabId);
    }

    // Update current tab
    this.currentTabId = tabId;

    // Ensure content script is loaded in new tab
    await this.ensureContentScriptLoaded(tabId);

    // Start recording in new tab
    await this.messageBroker.emit(
      COMMANDS.START_RECORDING,
      { sessionId: this.currentSessionId },
      tabId
    );

    await this.saveState();
  }

  /**
   * Ensure content script is loaded in a tab
   * Uses polling to verify content script is actually responsive
   */
  async ensureContentScriptLoaded(tabId: number): Promise<void> {
    try {
      // Get tab info to check URL
      const tab = await chrome.tabs.get(tabId);

      if (!this.isValidUrl(tab.url)) {
        console.warn('[RecorderController] Cannot inject content script into restricted URL:', tab.url);
        return;
      }

      // Try to ping the content script
      const response = await this.messageBroker.emit(COMMANDS.PING, {}, tabId);

      if (response.success) {
        console.log('[RecorderController] Content script already loaded in tab:', tabId);
        return;
      }
    } catch (error) {
      console.log('[RecorderController] Content script not loaded, injecting...');
    }

    // Content script not loaded, inject it
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content/content.js'],
      });

      console.log('[RecorderController] Content script injected into tab:', tabId);

      // Wait for content script to initialize with polling
      const maxWait = 3000; // 3 seconds max
      const pollInterval = 200; // Check every 200ms
      const startTime = Date.now();

      while (Date.now() - startTime < maxWait) {
        try {
          const pingResponse = await this.messageBroker.emit(COMMANDS.PING, {}, tabId);
          if (pingResponse.success) {
            console.log(`[RecorderController] Content script ready after ${Date.now() - startTime}ms`);
            return;
          }
        } catch (error) {
          // Ignore, will retry
        }
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }

      console.warn('[RecorderController] Content script may not be fully initialized after timeout');
    } catch (error) {
      console.error('[RecorderController] Error injecting content script:', error);
      throw error;
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
    return visualEvents.includes(stepType as any);
  }


  /**
   * SIMPLIFIED: Capture a pageLoad step when navigation completes
   * NO smart detection, NO complex timing - just capture what's there
   */
  private async capturePageLoadStepSimplified(tabId: number, url: string): Promise<void> {
    console.log('[RecorderController] 🔵 SIMPLIFIED capturePageLoadStep START');
    console.log('[RecorderController] TabId:', tabId, 'URL:', url);
    console.log('[RecorderController] Recording state:', {
      isRecording: this.isRecording,
      sessionId: this.currentSessionId,
      currentTabId: this.currentTabId,
      stepCount: this.stepCount
    });

    if (!this.isRecording || !this.currentSessionId) {
      console.warn('[RecorderController] ⚠️ Not recording, skipping');
      return;
    }

    if (tabId !== this.currentTabId) {
      console.warn('[RecorderController] ⚠️ Wrong tab, skipping');
      return;
    }

    if (!this.isValidUrl(url)) {
      console.warn('[RecorderController] ⚠️ Invalid URL, skipping');
      return;
    }

    try {
      console.log('[RecorderController] 📷 Capturing screenshot NOW (no waiting)...');

      // SIMPLE: Just capture screenshot immediately
      const screenshot = await this.visualCaptureService.captureTabScreenshot(tabId);

      console.log('[RecorderController] Screenshot result:', screenshot ? `${screenshot.length} chars` : 'NULL');

      // Create page load step
      const step: RecordedStep = {
        id: crypto.randomUUID(),
        sessionId: this.currentSessionId,
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

      console.log('[RecorderController] 💾 Saving to database...');
      await db.addStep(this.currentSessionId, step);
      this.stepCount++;
      await this.saveState();

      console.log('[RecorderController] ✅ DONE! Step count:', this.stepCount);
    } catch (error) {
      console.error('[RecorderController] ❌ ERROR:', error);
    }
  }

  /**
   * Get current recording state
   */
  getState(): RecordingState {
    return {
      status: this.isRecording ? 'recording' : 'idle',
      sessionId: this.currentSessionId,
      currentTabId: this.currentTabId,
      stepCount: this.stepCount,
    };
  }

  /**
   * Capture initial screenshot when recording starts
   * This captures the page BEFORE any content script modifications
   * Note: Content script is not loaded yet, so we use a simple delay instead of smart detection
   */
  private async captureInitialScreenshot(tabId: number): Promise<void> {
    const startTime = Date.now();

    try {
      console.log('[RecorderController] 📸 Capturing initial page state...');

      // Get current tab info
      const tab = await chrome.tabs.get(tabId);

      if (!tab.url) {
        throw new Error('Tab URL is not available');
      }

      console.log('[RecorderController] Tab URL:', tab.url);

      // Simple wait for initial screenshot (content script not loaded yet)
      // Use a brief delay to ensure page has rendered
      const waitTime = 50; // Brief wait for page stability
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      console.log(`[RecorderController] ✓ Waited ${waitTime}ms for initial page stability`);

      // Capture screenshot
      const screenshot = await this.visualCaptureService.captureTabScreenshot(tabId);

      if (!screenshot) {
        throw new Error('Failed to capture screenshot - no data returned');
      }

      if (!this.currentSessionId) {
        throw new Error('No active session ID');
      }

      // Create an initial step to show the starting point
      const initialStep: RecordedStep = {
        id: crypto.randomUUID(),
        sessionId: this.currentSessionId,
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
      await db.addStep(this.currentSessionId, initialStep);
      this.stepCount++;

      const totalTime = Date.now() - startTime;
      console.log(`[RecorderController] ✓ Initial screenshot captured successfully (${totalTime}ms total)`);
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(`[RecorderController] ✗ Error capturing initial screenshot (${totalTime}ms):`, error);
      // Don't fail recording if initial screenshot fails - this is non-critical
      // Recording will continue without the initial screenshot
    }
  }

}
