// MessageBroker: Handles cross-context communication
import type { MessageHandler, MessagePayload, MessageResponse } from '@/shared/types';

export class MessageBroker {
  private listeners: Map<string, Set<MessageHandler>> = new Map();

  constructor() {
    this.setupMessageListener();
  }

  /**
   * Set up runtime message listener
   */
  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener((message: MessagePayload, sender, sendResponse) => {
      this.handleMessage(message, sender)
        .then(sendResponse)
        .catch(error => {
          console.error('[MessageBroker] Error handling message:', error);
          sendResponse({
            success: false,
            error: error.message || 'Unknown error',
          });
        });

      // Return true to indicate we'll respond asynchronously
      return true;
    });

    console.log('[MessageBroker] Message listener initialized');
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(
    message: MessagePayload,
    sender: chrome.runtime.MessageSender | undefined
  ): Promise<MessageResponse> {
    const { command, data } = message;

    const handlers = this.listeners.get(command);
    if (!handlers || handlers.size === 0) {
      console.warn('[MessageBroker] No handlers for command:', command);
      return {
        success: false,
        error: `No handler registered for command: ${command}`,
      };
    }

    // Execute all handlers (typically there should be only one per command)
    const results = await Promise.all(
      Array.from(handlers).map(handler => handler(data, sender!))
    );

    // Return the first successful result or the last result
    return results.find(r => r.success) || results[results.length - 1];
  }

  /**
   * Register a message handler for a specific command
   */
  on(command: string, handler: MessageHandler): void {
    if (!this.listeners.has(command)) {
      this.listeners.set(command, new Set());
    }

    this.listeners.get(command)!.add(handler);
    console.log('[MessageBroker] Registered handler for command:', command);
  }

  /**
   * Unregister a message handler
   */
  off(command: string, handler: MessageHandler): void {
    const handlers = this.listeners.get(command);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.listeners.delete(command);
      }
      console.log('[MessageBroker] Unregistered handler for command:', command);
    }
  }

  /**
   * Send a message to a specific tab with timeout protection
   */
  async emit(command: string, data?: any, tabId?: number): Promise<MessageResponse> {
    const message: MessagePayload = { command, data };
    const timeout = 2000; // 2 second timeout

    if (tabId !== undefined) {
      try {
        // Wrap in a race with timeout to prevent hanging
        const response = await Promise.race([
          chrome.tabs.sendMessage(tabId, message),
          new Promise<MessageResponse>((_, reject) =>
            setTimeout(() => reject(new Error('Message timeout')), timeout)
          )
        ]);
        return response;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to send message';

        // Don't log expected errors during page lifecycle
        if (errorMessage.includes('Receiving end does not exist') ||
            errorMessage.includes('Could not establish connection') ||
            errorMessage.includes('message channel closed') ||
            errorMessage.includes('Message timeout')) {
          // These are expected during navigation/initialization
          return {
            success: false,
            error: errorMessage,
          };
        }

        // Log unexpected errors
        console.error('[MessageBroker] Unexpected error sending message to tab:', error);
        return {
          success: false,
          error: errorMessage,
        };
      }
    } else {
      // Send to runtime (background to popup or vice versa)
      try {
        const response = await chrome.runtime.sendMessage(message);
        return response;
      } catch (error) {
        console.error('[MessageBroker] Error sending runtime message:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to send message',
        };
      }
    }
  }

  /**
   * Broadcast a message to all tabs
   */
  async broadcast(command: string, data?: any): Promise<void> {
    const message: MessagePayload = { command, data };

    try {
      const tabs = await chrome.tabs.query({});
      await Promise.all(
        tabs.map(tab => {
          if (tab.id) {
            return chrome.tabs.sendMessage(tab.id, message).catch(error => {
              // Ignore errors for tabs without content scripts
              console.debug('[MessageBroker] Could not send to tab:', tab.id, error.message);
            });
          }
        })
      );
      console.log('[MessageBroker] Broadcast message sent:', command);
    } catch (error) {
      console.error('[MessageBroker] Error broadcasting message:', error);
    }
  }
}
