// TabController: Manages tab lifecycle, content script injection, and URL validation
import { COMMANDS } from '@/shared/constants';
import { MessageBroker } from '@/background/MessageBroker';
import { RecordingStateManager } from '@/background/RecordingStateManager';
import { StepRecorder } from '@/background/StepRecorder';

export class TabController {
  private messageBroker: MessageBroker;
  private stateManager: RecordingStateManager;
  private stepRecorder: StepRecorder;
  private onRecordingStopCallback?: () => void;

  constructor(
    messageBroker: MessageBroker,
    stateManager: RecordingStateManager,
    stepRecorder: StepRecorder
  ) {
    this.messageBroker = messageBroker;
    this.stateManager = stateManager;
    this.stepRecorder = stepRecorder;
    this.setupTabListeners();
  }

  /**
   * Set callback for when recording should stop due to tab closure
   */
  setRecordingStopCallback(callback: () => void): void {
    this.onRecordingStopCallback = callback;
  }

  /**
   * Check if a URL is valid for content script injection and screenshot capture
   * Chrome doesn't allow extensions to interact with certain pages
   */
  isValidUrl(url: string | undefined): boolean {
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
   * Set up tab listeners to track tab changes and closures
   */
  private setupTabListeners(): void {
    // Track when active tab changes
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      if (this.stateManager.isCurrentlyRecording()) {
        await this.handleTabChange(activeInfo.tabId);
      }
    });

    // Track when tabs are updated (URL changes)
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      const currentTabId = this.stateManager.getCurrentTabId();

      // Log all status changes for debugging
      if (this.stateManager.isCurrentlyRecording() && tabId === currentTabId) {
        console.log('[TabController] Tab status change:', changeInfo.status, 'URL:', tab.url);
      }

      // Handle both 'loading' and 'complete' states to ensure we don't miss page loads
      if (this.stateManager.isCurrentlyRecording() && tabId === currentTabId) {
        // When page starts loading, log it
        if (changeInfo.status === 'loading') {
          console.log('[TabController] 🔄 Page loading started:', tab.url);
        }

        // When page finishes loading, capture the final state
        if (changeInfo.status === 'complete') {
          console.log('[TabController] ✅ Tab navigation complete:', tabId, 'URL:', tab.url);

          // Check if this is a valid URL for extension interaction
          if (!this.isValidUrl(tab.url)) {
            console.warn('[TabController] Skipping restricted URL:', tab.url);
            return;
          }

          // Ensure content script is loaded for event recording
          console.log('[TabController] Ensuring content script is loaded...');
          await this.ensureContentScriptLoaded(tabId);

          // Capture the final loaded state after navigation
          console.log('[TabController] Calling capturePageLoadStep...');
          try {
            await this.stepRecorder.capturePageLoadStep(tabId, tab.url || '');
            console.log('[TabController] ✅ Page load handling complete');
          } catch (error) {
            console.error('[TabController] ❌ Error in capturePageLoadStep:', error);
          }
        }
      }
    });

    // Clean up when tabs are closed
    chrome.tabs.onRemoved.addListener((tabId) => {
      const currentTabId = this.stateManager.getCurrentTabId();
      if (tabId === currentTabId && this.stateManager.isCurrentlyRecording()) {
        console.warn('[TabController] Recording tab closed, stopping recording');
        if (this.onRecordingStopCallback) {
          this.onRecordingStopCallback();
        }
      }
    });

    console.log('[TabController] Tab listeners initialized');
  }

  /**
   * Handle tab change during recording
   */
  async handleTabChange(tabId: number): Promise<void> {
    if (!this.stateManager.isCurrentlyRecording()) {
      return;
    }

    const currentTabId = this.stateManager.getCurrentTabId();
    console.log('[TabController] Tab changed to:', tabId);

    // Stop recording in old tab
    if (currentTabId && currentTabId !== tabId) {
      await this.messageBroker.emit(COMMANDS.STOP_RECORDING, {}, currentTabId);
    }

    // Update current tab
    await this.stateManager.updateCurrentTab(tabId);

    // Ensure content script is loaded in new tab
    await this.ensureContentScriptLoaded(tabId);

    // Start recording in new tab
    const sessionId = this.stateManager.getCurrentSessionId();
    await this.messageBroker.emit(
      COMMANDS.START_RECORDING,
      { sessionId },
      tabId
    );
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
        console.warn('[TabController] Cannot inject content script into restricted URL:', tab.url);
        return;
      }

      // Try to ping the content script
      const response = await this.messageBroker.emit(COMMANDS.PING, {}, tabId);

      if (response.success) {
        console.log('[TabController] Content script already loaded in tab:', tabId);
        return;
      }
    } catch (error) {
      console.log('[TabController] Content script not loaded, injecting...');
    }

    // Content script not loaded, inject it
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content/content.js'],
      });

      console.log('[TabController] Content script injected into tab:', tabId);

      // Wait for content script to initialize with polling
      const maxWait = 3000; // 3 seconds max
      const pollInterval = 200; // Check every 200ms
      const startTime = Date.now();

      while (Date.now() - startTime < maxWait) {
        try {
          const pingResponse = await this.messageBroker.emit(COMMANDS.PING, {}, tabId);
          if (pingResponse.success) {
            console.log(`[TabController] Content script ready after ${Date.now() - startTime}ms`);
            return;
          }
        } catch (error) {
          // Ignore, will retry
        }
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }

      console.warn('[TabController] Content script may not be fully initialized after timeout');
    } catch (error) {
      console.error('[TabController] Error injecting content script:', error);
      throw error;
    }
  }

  /**
   * Start recording in a specific tab
   */
  async startRecordingInTab(tabId: number): Promise<void> {
    const sessionId = this.stateManager.getCurrentSessionId();

    // Ensure content script is loaded
    await this.ensureContentScriptLoaded(tabId);

    // Send start recording message to content script
    await this.messageBroker.emit(COMMANDS.START_RECORDING, { sessionId }, tabId);
  }

  /**
   * Stop recording in current tab
   */
  async stopRecordingInCurrentTab(): Promise<void> {
    const currentTabId = this.stateManager.getCurrentTabId();

    if (currentTabId) {
      await this.messageBroker.emit(COMMANDS.STOP_RECORDING, {}, currentTabId);
    }
  }

  /**
   * Validate tab URL for recording
   */
  async validateTabForRecording(tabId: number): Promise<void> {
    const tab = await chrome.tabs.get(tabId);

    if (!this.isValidUrl(tab.url)) {
      throw new Error(`Cannot record on restricted pages. Please navigate to a regular website.\nCurrent URL: ${tab.url}`);
    }
  }
}
