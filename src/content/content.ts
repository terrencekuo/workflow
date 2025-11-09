// Content Script: Runs in web pages to capture user interactions
import { COMMANDS } from '@/shared/constants';
import type { MessagePayload, MessageResponse } from '@/shared/types';
import { Recorder } from '@/content/Recorder';

console.log('[Content] Content script loaded');

// Initialize recorder with configuration
const recorder = new Recorder({
  captureHovers: false, // Disable hover capture by default for performance
  hoverDebounceMs: 500,
  scrollDebounceMs: 300,
  batchIntervalMs: 100,
});

/**
 * Send message to background script
 */
async function sendMessage(command: string, data?: any): Promise<MessageResponse> {
  try {
    const message: MessagePayload = { command, data };
    const response = await chrome.runtime.sendMessage(message);
    return response;
  } catch (error) {
    console.error('[Content] Error sending message:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send message',
    };
  }
}

/**
 * Handle messages from background script
 */
chrome.runtime.onMessage.addListener((message: MessagePayload, _sender, sendResponse) => {
  const { command, data } = message;

  console.log('[Content] Received message:', command, data);

  switch (command) {
    case COMMANDS.START_RECORDING:
      recorder.start(data.sessionId);
      console.log('[Content] Started recording for session:', data.sessionId);
      sendResponse({ success: true });
      break;

    case COMMANDS.STOP_RECORDING:
      recorder.stop();
      console.log('[Content] Stopped recording');
      sendResponse({ success: true });
      break;

    case COMMANDS.PING:
      sendResponse({ success: true, data: 'pong' });
      break;

    default:
      sendResponse({ success: false, error: 'Unknown command' });
  }

  return true;
});

/**
 * Notify background that content script is ready
 */
sendMessage(COMMANDS.CONTENT_SCRIPT_READY);

console.log('[Content] Content script initialized');
