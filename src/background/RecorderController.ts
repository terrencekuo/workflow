// RecorderController: Manages recording state and coordinates recording across tabs
import { db } from '@/shared/db';
import { COMMANDS, STORAGE_KEYS, EVENT_TYPES } from '@/shared/constants';
import type {
  TabRecordingState,
  RecordingState,
  RecordedStep,
  SessionMetadata,
  MessageResponse,
} from '@/shared/types';
import { MessageBroker } from '@/background/MessageBroker';
import { VisualCaptureService } from '@/background/VisualCaptureService';

export class RecorderController {
  private isRecording = false;
  private currentSessionId: string | null = null;
  private currentTabId: number | null = null;
  private tabStates: Map<number, TabRecordingState> = new Map();
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
   * Set up message handlers
   */
  private setupMessageHandlers(): void {
    this.messageBroker.on(COMMANDS.START_RECORDING, this.handleStartRecording.bind(this));
    this.messageBroker.on(COMMANDS.STOP_RECORDING, this.handleStopRecording.bind(this));
    this.messageBroker.on(COMMANDS.RECORD_STEP, this.handleRecordStep.bind(this));
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
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
      if (this.isRecording && tabId === this.currentTabId && changeInfo.status === 'complete') {
        console.log('[RecorderController] Tab updated:', tabId, changeInfo);
        await this.ensureContentScriptLoaded(tabId);
      }
    });

    // Clean up when tabs are closed
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.tabStates.delete(tabId);
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
   * Captures ONE screenshot after the event with appropriate delay
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

      // Capture screenshot for major events AFTER the event with delay
      if (this.shouldCaptureVisual(step.type) && this.currentTabId) {
        try {
          // Wait for page changes to settle based on event type
          const delay = this.getScreenshotDelay(step.type);
          if (delay > 0) {
            await this.sleep(delay);
          }

          // Capture ONE screenshot
          const screenshot = await this.visualCaptureService.captureTabScreenshot(
            this.currentTabId
          );

          if (screenshot) {
            step.visual = {
              viewport: screenshot,
              thumbnail: screenshot, // No thumbnail generation for now
            };
            console.log('[RecorderController] Captured screenshot for step:', step.type);
          }
        } catch (error) {
          // Don't fail the step if screenshot fails
          console.warn('[RecorderController] Failed to capture screenshot:', error);
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
   * Get appropriate delay before taking screenshot based on event type
   */
  private getScreenshotDelay(stepType: string): number {
    // Navigation events need more time to load
    if (stepType === EVENT_TYPES.NAVIGATION) {
      return 1500; // 1.5 seconds for page loads
    }
    // Form submissions that might trigger navigation
    if (stepType === EVENT_TYPES.SUBMIT) {
      return 1000; // 1 second for form submissions
    }
    // Click events that might trigger dynamic content
    if (stepType === EVENT_TYPES.CLICK) {
      return 500; // 0.5 seconds for clicks
    }
    // Default - no delay for other events
    return 0;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

    // Initialize database
    await db.init();

    // Create new session
    const sessionId = await db.createSession(metadata);

    this.currentSessionId = sessionId;
    this.currentTabId = tabId;
    this.isRecording = true;
    this.stepCount = 0;

    // Ensure content script is loaded
    await this.ensureContentScriptLoaded(tabId);

    // Send start recording message to content script
    await this.messageBroker.emit(COMMANDS.START_RECORDING, { sessionId }, tabId);

    // Save state
    await this.saveState();

    console.log('[RecorderController] Recording started:', sessionId);
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
   */
  async ensureContentScriptLoaded(tabId: number): Promise<void> {
    try {
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

      // Wait a bit for the content script to initialize
      await new Promise(resolve => setTimeout(resolve, 500));
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
    ];
    return visualEvents.includes(stepType as any);
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
}
