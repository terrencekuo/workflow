/**
 * BadgeManager - Utility for managing the Chrome extension badge
 * Handles badge text, color, and tooltip updates
 */

export class BadgeManager {
  /**
   * Update badge to show recording status
   */
  static async setRecording(isRecording: boolean): Promise<void> {
    try {
      if (isRecording) {
        await chrome.action.setBadgeText({ text: 'REC' });
        await chrome.action.setBadgeBackgroundColor({ color: '#dc2626' }); // Red
        await chrome.action.setTitle({ title: 'Recording in progress - Click to stop' });
      } else {
        await chrome.action.setBadgeText({ text: '' });
        await chrome.action.setTitle({ title: 'Workflow Recorder - Click to start' });
      }
    } catch (error) {
      console.error('[BadgeManager] Error updating badge:', error);
    }
  }

  /**
   * Clear badge (same as setRecording(false))
   */
  static async clear(): Promise<void> {
    await this.setRecording(false);
  }

  /**
   * Set custom badge text and color
   */
  static async setCustom(text: string, color: string, title?: string): Promise<void> {
    try {
      await chrome.action.setBadgeText({ text });
      await chrome.action.setBadgeBackgroundColor({ color });
      if (title) {
        await chrome.action.setTitle({ title });
      }
    } catch (error) {
      console.error('[BadgeManager] Error setting custom badge:', error);
    }
  }
}

