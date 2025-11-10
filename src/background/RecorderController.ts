// RecorderController: Orchestrates recording functionality using specialized modules
import { db } from '@/shared/db';
import { COMMANDS } from '@/shared/constants';
import type {
  SessionMetadata,
  MessageResponse,
  RecordedStep,
} from '@/shared/types';
import { MessageBroker } from '@/background/MessageBroker';
import { VisualCaptureService } from '@/background/VisualCaptureService';
import { RecordingStateManager } from '@/background/RecordingStateManager';
import { StepRecorder } from '@/background/StepRecorder';
import { TabController } from '@/background/TabController';

export class RecorderController {
  private messageBroker: MessageBroker;
  private stateManager: RecordingStateManager;
  private stepRecorder: StepRecorder;
  private tabController: TabController;

  constructor(messageBroker: MessageBroker, visualCaptureService: VisualCaptureService) {
    this.messageBroker = messageBroker;

    // Initialize specialized modules
    this.stateManager = new RecordingStateManager();
    this.stepRecorder = new StepRecorder(visualCaptureService, this.stateManager);
    this.tabController = new TabController(messageBroker, this.stateManager, this.stepRecorder);

    // Set callback for tab controller to stop recording when tab closes
    this.tabController.setRecordingStopCallback(() => this.stopRecording());

    this.setupMessageHandlers();
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
          sessionId: this.stateManager.getCurrentSessionId(),
          tabId: this.stateManager.getCurrentTabId(),
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
   */
  private async handleRecordStep(
    step: RecordedStep
  ): Promise<MessageResponse> {
    return await this.stepRecorder.recordStep(step);
  }

  /**
   * Handle manual screenshot capture command
   */
  private async handleCaptureScreenshot(): Promise<MessageResponse> {
    return await this.stepRecorder.captureManualScreenshot();
  }

  /**
   * Handle get recording state command
   */
  private handleGetState(): MessageResponse {
    return {
      success: true,
      data: this.stateManager.getState(),
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
      const currentTabId = this.stateManager.getCurrentTabId();
      if (this.stateManager.isCurrentlyRecording() && tabId === currentTabId) {
        const sessionId = this.stateManager.getCurrentSessionId();
        this.messageBroker.emit(COMMANDS.START_RECORDING, { sessionId }, tabId);
      }
    }
    return { success: true };
  }

  /**
   * Start recording
   */
  async startRecording(tabId: number, metadata: SessionMetadata): Promise<void> {
    if (this.stateManager.isCurrentlyRecording()) {
      throw new Error('Recording already in progress');
    }

    console.log('[RecorderController] Starting recording for tab:', tabId);

    // Validate tab URL
    await this.tabController.validateTabForRecording(tabId);

    // Initialize database
    await db.init();

    // Create new session
    const sessionId = await db.createSession(metadata);

    // Update state
    await this.stateManager.startRecording(sessionId, tabId);

    // IMPORTANT: Capture initial screenshot BEFORE loading content script
    // This ensures we capture the page in its pristine state
    console.log('[RecorderController] Capturing initial page state...');
    await this.stepRecorder.captureInitialScreenshot(tabId, sessionId);

    // Now start recording in the tab (loads content script and starts event tracking)
    await this.tabController.startRecordingInTab(tabId);

    console.log('[RecorderController] Recording started successfully:', sessionId);
  }

  /**
   * Stop recording
   */
  async stopRecording(): Promise<void> {
    if (!this.stateManager.isCurrentlyRecording()) {
      return;
    }

    // Stop recording in current tab
    await this.tabController.stopRecordingInCurrentTab();

    // Update state
    await this.stateManager.stopRecording();

    console.log('[RecorderController] Recording stopped');
  }

  /**
   * Get current recording state
   */
  getState() {
    return this.stateManager.getState();
  }
}
