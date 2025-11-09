// Background Service Worker: Entry point for the extension's background logic
import { MessageBroker } from '@/background/MessageBroker';
import { RecorderController } from '@/background/RecorderController';
import { VisualCaptureService } from '@/background/VisualCaptureService';
import { db } from '@/shared/db';
import { COMMANDS } from '@/shared/constants';
import type { MessageResponse } from '@/shared/types';

console.log('[Background] Service worker starting...');

// Initialize message broker first
const messageBroker = new MessageBroker();

// Initialize visual capture service
const visualCaptureService = new VisualCaptureService();

// Initialize database
db.init()
  .then(() => console.log('[Background] Database initialized'))
  .catch(error => {
    console.error('[Background] Failed to initialize database:', error);
  });

// Initialize recorder controller
const recorderController = new RecorderController(messageBroker, visualCaptureService);

// Register session management handlers
messageBroker.on(COMMANDS.GET_ALL_SESSIONS, async (): Promise<MessageResponse> => {
  try {
    console.log('[Background] GET_ALL_SESSIONS called');
    const sessions = await db.getAllSessions();
    console.log('[Background] Found sessions:', sessions.length);
    return { success: true, data: sessions };
  } catch (error) {
    console.error('[Background] Error getting sessions:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get sessions',
    };
  }
});

messageBroker.on(COMMANDS.GET_SESSION, async (data: { sessionId: string }): Promise<MessageResponse> => {
  try {
    console.log('[Background] GET_SESSION called for:', data.sessionId);
    const session = await db.getSession(data.sessionId);
    if (!session) {
      console.log('[Background] Session not found:', data.sessionId);
      return { success: false, error: 'Session not found' };
    }
    console.log('[Background] Session found with', session.steps.length, 'steps');
    return { success: true, data: session };
  } catch (error) {
    console.error('[Background] Error getting session:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get session',
    };
  }
});

messageBroker.on(COMMANDS.DELETE_SESSION, async (data: { sessionId: string }): Promise<MessageResponse> => {
  try {
    await db.deleteSession(data.sessionId);
    return { success: true };
  } catch (error) {
    console.error('[Background] Error deleting session:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete session',
    };
  }
});

messageBroker.on(COMMANDS.UPDATE_STEP, async (data: {
  sessionId: string;
  stepId: string;
  updates: any;
}): Promise<MessageResponse> => {
  try {
    await db.updateStep(data.sessionId, data.stepId, data.updates);
    return { success: true };
  } catch (error) {
    console.error('[Background] Error updating step:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update step',
    };
  }
});

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Background] Extension installed:', details.reason);

  if (details.reason === 'install') {
    // First-time installation
    console.log('[Background] First-time installation, initializing...');
  } else if (details.reason === 'update') {
    // Extension updated
    console.log('[Background] Extension updated');
  }
});

// Keep service worker alive
chrome.runtime.onMessage.addListener(() => {
  // This helps prevent the service worker from being terminated
  return true;
});

console.log('[Background] Service worker initialized successfully');

// Export for debugging
(globalThis as any).__recorderController = recorderController;
(globalThis as any).__messageBroker = messageBroker;
(globalThis as any).__db = db;
