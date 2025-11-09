// MessageBroker: Handles cross-context communication
import type { MessageHandler, MessagePayload, MessageResponse } from '@/shared/types';

export class MessageBroker {
  private listeners: Map<string, Set<MessageHandler>> = new Map();
  private ports: Map<number, chrome.runtime.Port> = new Map();

  constructor() {
    this.setupMessageListener();
    this.setupPortListener();
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
   * Set up port connection listener for persistent connections
   */
  private setupPortListener(): void {
    chrome.runtime.onConnect.addListener((port) => {
      console.log('[MessageBroker] Port connected:', port.name);

      // Store port reference (if it's from a tab)
      if (port.sender?.tab?.id) {
        this.ports.set(port.sender.tab.id, port);
      }

      port.onDisconnect.addListener(() => {
        console.log('[MessageBroker] Port disconnected:', port.name);
        if (port.sender?.tab?.id) {
          this.ports.delete(port.sender.tab.id);
        }
      });

      port.onMessage.addListener(async (message: MessagePayload) => {
        const response = await this.handleMessage(message, port.sender);
        port.postMessage(response);
      });
    });
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
   * Send a message to a specific tab
   */
  async emit(command: string, data?: any, tabId?: number): Promise<MessageResponse> {
    const message: MessagePayload = { command, data };

    if (tabId !== undefined) {
      try {
        const response = await chrome.tabs.sendMessage(tabId, message);
        return response;
      } catch (error) {
        console.error('[MessageBroker] Error sending message to tab:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to send message',
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

  /**
   * Send a message via port connection (if available)
   */
  async sendViaPort(tabId: number, command: string, data?: any): Promise<void> {
    const port = this.ports.get(tabId);
    if (port) {
      const message: MessagePayload = { command, data };
      port.postMessage(message);
    } else {
      console.warn('[MessageBroker] No port connection for tab:', tabId);
    }
  }

  /**
   * Check if a tab has an active port connection
   */
  hasPortConnection(tabId: number): boolean {
    return this.ports.has(tabId);
  }
}
