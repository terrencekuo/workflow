// RecordingStateManager: Manages recording state and persistence
import { STORAGE_KEYS } from '@/shared/constants';
import type { RecordingState } from '@/shared/types';
import { BadgeManager } from '@/background/utils/BadgeManager';

export class RecordingStateManager {
  private isRecording = false;
  private currentSessionId: string | null = null;
  private currentTabId: number | null = null;
  private stepCount = 0;

  constructor() {
    this.restoreState();
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

        console.log('[RecordingStateManager] State restored:', state);
      }
    } catch (error) {
      console.error('[RecordingStateManager] Error restoring state:', error);
    }
  }

  /**
   * Save recording state to storage
   */
  async saveState(): Promise<void> {
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
      console.error('[RecordingStateManager] Error saving state:', error);
    }
  }

  /**
   * Start recording with the given session and tab
   */
  async startRecording(sessionId: string, tabId: number): Promise<void> {
    this.isRecording = true;
    this.currentSessionId = sessionId;
    this.currentTabId = tabId;
    this.stepCount = 0;

    await BadgeManager.setRecording(true);
    await this.saveState();

    console.log('[RecordingStateManager] Recording started:', { sessionId, tabId });
  }

  /**
   * Stop recording
   */
  async stopRecording(): Promise<void> {
    this.isRecording = false;
    this.currentSessionId = null;
    this.currentTabId = null;
    this.stepCount = 0;

    await BadgeManager.setRecording(false);
    await this.saveState();

    console.log('[RecordingStateManager] Recording stopped');
  }

  /**
   * Update the current tab ID
   */
  async updateCurrentTab(tabId: number): Promise<void> {
    this.currentTabId = tabId;
    await this.saveState();
  }

  /**
   * Increment step count
   */
  async incrementStepCount(): Promise<void> {
    this.stepCount++;
    await this.saveState();
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
   * Check if currently recording
   */
  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  /**
   * Get current session ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Get current tab ID
   */
  getCurrentTabId(): number | null {
    return this.currentTabId;
  }

  /**
   * Get current step count
   */
  getStepCount(): number {
    return this.stepCount;
  }
}
