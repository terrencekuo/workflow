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
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (this.isRecording && tabId === this.currentTabId && changeInfo.status === 'complete') {
        console.log('[RecorderController] Tab updated:', tabId, changeInfo);
        await this.ensureContentScriptLoaded(tabId);

        // Capture the final loaded state after navigation
        await this.capturePageLoadStep(tabId, tab.url || '');
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
   * Captures ONE screenshot after the event with smart detection
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

      // Capture screenshot for major events AFTER the event with smart detection
      if (this.shouldCaptureVisual(step.type) && this.currentTabId) {
        try {
          // Use smart detection to wait for page readiness
          const readinessState = await this.waitForPageReadiness(this.currentTabId);

          console.log(
            `[RecorderController] Page ready for screenshot: ${readinessState.reason} (${readinessState.duration}ms)`,
            readinessState.checks
          );

          // Capture ONE screenshot
          const screenshot = await this.visualCaptureService.captureTabScreenshot(
            this.currentTabId
          );

          if (screenshot) {
            step.visual = {
              viewport: screenshot,
              thumbnail: screenshot, // No thumbnail generation for now
            };

            // Store readiness info in metadata for debugging
            if (!step.metadata) {
              step.metadata = {};
            }
            step.metadata.pageReadiness = readinessState;

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
   * Wait for page to be ready using smart detection
   * Injects PageLoadDetector into the content page and waits for result
   */
  private async waitForPageReadiness(tabId: number): Promise<any> {
    try {
      // Inject and execute the detection script
      const result = await chrome.scripting.executeScript({
        target: { tabId },
        func: async () => {
          // Inline PageLoadDetector for injection
          interface PageReadinessState {
            isReady: boolean;
            reason: string;
            duration: number;
            checks: {
              domStable: boolean;
              resourcesLoaded: boolean;
              noSkeletons: boolean;
            };
          }

          class PageLoadDetector {
            private maxTimeout: number;
            private domStabilityWait: number;
            private mutationTimeout: number | null = null;
            private lastMutationTime: number = 0;

            constructor(maxTimeout = 3000, domStabilityWait = 300) {
              this.maxTimeout = maxTimeout;
              this.domStabilityWait = domStabilityWait;
            }

            async waitForPageReady(): Promise<PageReadinessState> {
              const startTime = Date.now();
              const timeoutPromise = this.createTimeout();

              try {
                const result = await Promise.race([
                  this.performAllChecks(startTime),
                  timeoutPromise,
                ]);
                return { ...result, duration: Date.now() - startTime };
              } catch (error) {
                return {
                  isReady: false,
                  reason: 'Detection error: ' + (error instanceof Error ? error.message : 'Unknown'),
                  duration: Date.now() - startTime,
                  checks: { domStable: false, resourcesLoaded: false, noSkeletons: false },
                };
              }
            }

            private async performAllChecks(startTime: number): Promise<PageReadinessState> {
              const checks = { domStable: false, resourcesLoaded: false, noSkeletons: false };

              await this.waitForDOMStability();
              checks.domStable = true;

              if (Date.now() - startTime >= this.maxTimeout) {
                return { isReady: false, reason: 'Timeout after DOM stability', duration: Date.now() - startTime, checks };
              }

              await this.waitForResources();
              checks.resourcesLoaded = true;

              if (Date.now() - startTime >= this.maxTimeout) {
                return { isReady: true, reason: 'Resources loaded (timeout before skeleton check)', duration: Date.now() - startTime, checks };
              }

              await this.waitForSkeletonDisappear();
              checks.noSkeletons = true;

              return { isReady: true, reason: 'All checks passed', duration: Date.now() - startTime, checks };
            }

            private createTimeout(): Promise<PageReadinessState> {
              return new Promise((resolve) => {
                setTimeout(() => {
                  resolve({
                    isReady: true,
                    reason: 'Max timeout reached',
                    duration: this.maxTimeout,
                    checks: { domStable: false, resourcesLoaded: false, noSkeletons: false },
                  });
                }, this.maxTimeout);
              });
            }

            private waitForDOMStability(): Promise<void> {
              return new Promise((resolve) => {
                let mutationCount = 0;
                this.lastMutationTime = Date.now();

                const observer = new MutationObserver(() => {
                  mutationCount++;
                  this.lastMutationTime = Date.now();

                  if (this.mutationTimeout) clearTimeout(this.mutationTimeout);

                  this.mutationTimeout = window.setTimeout(() => {
                    observer.disconnect();
                    resolve();
                  }, this.domStabilityWait);
                });

                observer.observe(document.body || document.documentElement, {
                  childList: true,
                  subtree: true,
                  attributes: true,
                  characterData: true,
                });

                setTimeout(() => {
                  if (Date.now() - this.lastMutationTime >= this.domStabilityWait) {
                    observer.disconnect();
                    if (this.mutationTimeout) clearTimeout(this.mutationTimeout);
                    resolve();
                  }
                }, this.domStabilityWait);
              });
            }

            private async waitForResources(): Promise<void> {
              const resources: HTMLElement[] = [
                ...Array.from(document.querySelectorAll('img')),
                ...Array.from(document.querySelectorAll('iframe')),
                ...Array.from(document.querySelectorAll('video')),
              ];

              if (resources.length === 0) return;

              const promises: Promise<void>[] = [];

              for (const resource of resources) {
                if (resource instanceof HTMLImageElement) {
                  if (resource.complete && resource.naturalHeight > 0) continue;
                } else if (resource instanceof HTMLIFrameElement) {
                  try {
                    if (resource.contentDocument?.readyState === 'complete') continue;
                  } catch (e) {
                    continue;
                  }
                } else if (resource instanceof HTMLVideoElement) {
                  if (resource.readyState >= 2) continue;
                }

                promises.push(
                  new Promise<void>((resolve) => {
                    const timeout = setTimeout(() => resolve(), 2000);
                    const onLoad = () => {
                      clearTimeout(timeout);
                      resolve();
                    };
                    resource.addEventListener('load', onLoad, { once: true });
                    resource.addEventListener('error', onLoad, { once: true });
                  })
                );
              }

              await Promise.all(promises);
            }

            private async waitForSkeletonDisappear(): Promise<void> {
              const maxWait = 1500;
              const checkInterval = 100;
              const startTime = Date.now();

              return new Promise((resolve) => {
                const checkSkeletons = () => {
                  const hasSkeletons = this.hasSkeletonElements();

                  if (!hasSkeletons || Date.now() - startTime >= maxWait) {
                    resolve();
                    return;
                  }

                  setTimeout(checkSkeletons, checkInterval);
                };

                checkSkeletons();
              });
            }

            private hasSkeletonElements(): boolean {
              const patterns = [
                'skeleton', 'loading', 'shimmer', 'placeholder-glow', 'placeholder-wave',
                'content-loader', 'skeleton-loader', 'loading-skeleton', 'pulse', 'animate-pulse',
                'spinner', 'loader', 'loading-spinner', 'spin', 'rotating',
              ];

              for (const pattern of patterns) {
                const elements = document.querySelectorAll(`[class*="${pattern}" i], [data-loading*="${pattern}" i]`);
                for (const element of Array.from(elements)) {
                  if (this.isElementVisible(element as HTMLElement)) return true;
                }
              }

              const busyElements = document.querySelectorAll('[aria-busy="true"]');
              for (const element of Array.from(busyElements)) {
                if (this.isElementVisible(element as HTMLElement)) return true;
              }

              const loadingElements = document.querySelectorAll('[data-loading="true"]');
              for (const element of Array.from(loadingElements)) {
                if (this.isElementVisible(element as HTMLElement)) return true;
              }

              return false;
            }

            private isElementVisible(element: HTMLElement): boolean {
              if (!document.body.contains(element)) return false;

              const style = window.getComputedStyle(element);
              if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                return false;
              }

              const rect = element.getBoundingClientRect();
              if (rect.width === 0 || rect.height === 0) return false;

              return true;
            }

            cleanup(): void {
              if (this.mutationTimeout) {
                clearTimeout(this.mutationTimeout);
                this.mutationTimeout = null;
              }
            }
          }

          // Execute detection
          const detector = new PageLoadDetector(3000, 300);
          try {
            const result = await detector.waitForPageReady();
            detector.cleanup();
            return result;
          } catch (error) {
            detector.cleanup();
            throw error;
          }
        },
      });

      if (result && result[0] && result[0].result) {
        return result[0].result;
      }

      // Fallback if detection fails
      return {
        isReady: true,
        reason: 'Detection script failed, using fallback',
        duration: 0,
        checks: { domStable: false, resourcesLoaded: false, noSkeletons: false },
      };
    } catch (error) {
      console.error('[RecorderController] Error during page readiness detection:', error);
      // Fallback to small delay if detection fails
      await new Promise((resolve) => setTimeout(resolve, 500));
      return {
        isReady: true,
        reason: 'Detection error, used fallback delay',
        duration: 500,
        checks: { domStable: false, resourcesLoaded: false, noSkeletons: false },
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
      EVENT_TYPES.PAGE_LOAD,
    ];
    return visualEvents.includes(stepType as any);
  }

  /**
   * Capture a pageLoad step when navigation completes
   * This ensures we get the final state of the loaded page
   */
  private async capturePageLoadStep(tabId: number, url: string): Promise<void> {
    if (!this.isRecording || !this.currentSessionId) {
      return;
    }

    try {
      console.log('[RecorderController] Capturing page load for:', url);

      // Wait for page to be ready with smart detection
      const readinessState = await this.waitForPageReadiness(tabId);

      console.log(
        `[RecorderController] Page load ready: ${readinessState.reason} (${readinessState.duration}ms)`,
        readinessState.checks
      );

      // Capture screenshot of the loaded page
      const screenshot = await this.visualCaptureService.captureTabScreenshot(tabId);

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
          pageReadiness: readinessState,
        },
      };

      if (screenshot) {
        step.visual = {
          viewport: screenshot,
          thumbnail: screenshot,
        };
      }

      // Save to database
      await db.addStep(this.currentSessionId, step);
      this.stepCount++;
      await this.saveState();

      console.log('[RecorderController] Page load step recorded:', url);
    } catch (error) {
      console.error('[RecorderController] Error capturing page load step:', error);
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
}
