// IndexedDB wrapper for storing sessions and steps
import { DB_NAME, DB_VERSION, STORE_SESSIONS, STORE_STEPS } from '@/shared/constants';
import type { Session, RecordedStep, SessionMetadata } from '@/shared/types';

export class DB {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the IndexedDB database
   */
  async init(): Promise<void> {
    if (this.db) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error(`Failed to open database: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[DB] Database initialized successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create sessions store
        if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
          const sessionsStore = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
          sessionsStore.createIndex('createdAt', 'createdAt', { unique: false });
          sessionsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          console.log('[DB] Created sessions store');
        }

        // Create steps store
        if (!db.objectStoreNames.contains(STORE_STEPS)) {
          const stepsStore = db.createObjectStore(STORE_STEPS, { keyPath: 'id' });
          stepsStore.createIndex('sessionId', 'sessionId', { unique: false });
          stepsStore.createIndex('timestamp', 'timestamp', { unique: false });
          console.log('[DB] Created steps store');
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Ensure database is initialized
   */
  private async ensureInit(): Promise<IDBDatabase> {
    await this.init();
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  /**
   * Create a new session
   */
  async createSession(metadata: SessionMetadata): Promise<string> {
    const db = await this.ensureInit();
    const sessionId = crypto.randomUUID();
    const now = Date.now();

    const session: Session = {
      id: sessionId,
      metadata,
      steps: [],
      createdAt: now,
      updatedAt: now,
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_SESSIONS], 'readwrite');
      const store = transaction.objectStore(STORE_SESSIONS);
      const request = store.add(session);

      request.onsuccess = () => {
        console.log('[DB] Created session:', sessionId);
        resolve(sessionId);
      };

      request.onerror = () => {
        reject(new Error(`Failed to create session: ${request.error?.message}`));
      };
    });
  }

  /**
   * Add a step to a session
   */
  async addStep(sessionId: string, step: RecordedStep): Promise<void> {
    const db = await this.ensureInit();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_SESSIONS, STORE_STEPS], 'readwrite');

      // Add step to steps store
      const stepsStore = transaction.objectStore(STORE_STEPS);
      stepsStore.add(step);

      // Update session's updatedAt timestamp
      const sessionsStore = transaction.objectStore(STORE_SESSIONS);
      const getRequest = sessionsStore.get(sessionId);

      getRequest.onsuccess = () => {
        const session = getRequest.result as Session;
        if (session) {
          session.updatedAt = Date.now();
          session.steps.push(step);
          sessionsStore.put(session);
        }
      };

      transaction.oncomplete = () => {
        console.log('[DB] Added step to session:', sessionId);
        resolve();
      };

      transaction.onerror = () => {
        reject(new Error(`Failed to add step: ${transaction.error?.message}`));
      };
    });
  }

  /**
   * Get a session by ID
   */
  async getSession(sessionId: string): Promise<Session | null> {
    const db = await this.ensureInit();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_SESSIONS], 'readonly');
      const store = transaction.objectStore(STORE_SESSIONS);
      const request = store.get(sessionId);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        reject(new Error(`Failed to get session: ${request.error?.message}`));
      };
    });
  }

  /**
   * Get the total count of sessions
   */
  async getSessionCount(): Promise<number> {
    const db = await this.ensureInit();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_SESSIONS], 'readonly');
      const store = transaction.objectStore(STORE_SESSIONS);
      const request = store.count();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(new Error(`Failed to count sessions: ${request.error?.message}`));
      };
    });
  }

  /**
   * Get session IDs sorted by updatedAt (for chunked loading)
   */
  async getSessionIds(): Promise<string[]> {
    const db = await this.ensureInit();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_SESSIONS], 'readonly');
      const store = transaction.objectStore(STORE_SESSIONS);
      const index = store.index('updatedAt');
      const request = index.openCursor(null, 'prev'); // 'prev' for descending order

      const ids: string[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          ids.push(cursor.primaryKey as string);
          cursor.continue();
        } else {
          resolve(ids);
        }
      };

      request.onerror = () => {
        reject(new Error(`Failed to get session IDs: ${request.error?.message}`));
      };
    });
  }

  /**
   * Get a batch of sessions by IDs (lightweight, without step details)
   * This is optimized for chunked loading to avoid message size limits
   */
  async getSessionsBatch(sessionIds: string[]): Promise<Session[]> {
    const db = await this.ensureInit();

    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_SESSIONS], 'readonly');
      const store = transaction.objectStore(STORE_SESSIONS);
      const sessions: Session[] = [];
      let completed = 0;

      if (sessionIds.length === 0) {
        resolve([]);
        return;
      }

      sessionIds.forEach((id) => {
        const request = store.get(id);

        request.onsuccess = () => {
          const session = request.result as Session | undefined;
          if (session) {
            // Extract thumbnail from first step if available
            const firstStepThumbnail = session.steps[0]?.visual?.thumbnail || session.steps[0]?.visual?.viewport;

            // Create lightweight session
            const lightSession: Session = {
              ...session,
              steps: [], // Remove step details to avoid message size limits
              stepCount: session.steps.length,
              thumbnail: firstStepThumbnail,
            };

            sessions.push(lightSession);
          }

          completed++;
          if (completed === sessionIds.length) {
            console.log(`[DB] Loaded batch of ${sessions.length} sessions`);
            resolve(sessions);
          }
        };

        request.onerror = () => {
          completed++;
          console.error(`[DB] Failed to load session ${id}:`, request.error);
          if (completed === sessionIds.length) {
            resolve(sessions); // Return partial results
          }
        };
      });
    });
  }

  /**
   * Get all sessions (metadata only, without step details)
   * DEPRECATED: Use chunked loading with getSessionIds + getSessionsBatch instead
   */
  async getAllSessions(): Promise<Session[]> {
    console.warn('[DB] getAllSessions is deprecated. Use chunked loading instead.');
    const db = await this.ensureInit();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_SESSIONS], 'readonly');
      const store = transaction.objectStore(STORE_SESSIONS);
      const request = store.getAll();

      request.onsuccess = () => {
        const sessions = request.result as Session[];

        console.log(`[DB] Retrieved ${sessions.length} sessions from IndexedDB`);

        // Sort by updatedAt descending
        sessions.sort((a, b) => b.updatedAt - a.updatedAt);

        // Return sessions with steps array replaced by just the count
        const lightSessions = sessions.map(session => {
          // Extract thumbnail from first step if available
          const firstStepThumbnail = session.steps[0]?.visual?.thumbnail || session.steps[0]?.visual?.viewport;

          return {
            ...session,
            steps: [], // Remove step details to avoid message size limits
            stepCount: session.steps.length, // Add step count for display
            thumbnail: firstStepThumbnail, // Add first step thumbnail for preview
          };
        });

        resolve(lightSessions as Session[]);
      };

      request.onerror = () => {
        reject(new Error(`Failed to get sessions: ${request.error?.message}`));
      };
    });
  }

  /**
   * Update a step
   */
  async updateStep(sessionId: string, stepId: string, updates: Partial<RecordedStep>): Promise<void> {
    const db = await this.ensureInit();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_SESSIONS, STORE_STEPS], 'readwrite');
      const stepsStore = transaction.objectStore(STORE_STEPS);

      const getRequest = stepsStore.get(stepId);

      getRequest.onsuccess = () => {
        const step = getRequest.result as RecordedStep;
        if (step) {
          const updatedStep = { ...step, ...updates };
          stepsStore.put(updatedStep);

          // Update session
          const sessionsStore = transaction.objectStore(STORE_SESSIONS);
          const sessionRequest = sessionsStore.get(sessionId);

          sessionRequest.onsuccess = () => {
            const session = sessionRequest.result as Session;
            if (session) {
              const stepIndex = session.steps.findIndex(s => s.id === stepId);
              if (stepIndex !== -1) {
                session.steps[stepIndex] = updatedStep;
                session.updatedAt = Date.now();
                sessionsStore.put(session);
              }
            }
          };
        }
      };

      transaction.oncomplete = () => {
        console.log('[DB] Updated step:', stepId);
        resolve();
      };

      transaction.onerror = () => {
        reject(new Error(`Failed to update step: ${transaction.error?.message}`));
      };
    });
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const db = await this.ensureInit();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_SESSIONS, STORE_STEPS], 'readwrite');

      // Delete all steps for this session
      const stepsStore = transaction.objectStore(STORE_STEPS);
      const stepsIndex = stepsStore.index('sessionId');
      const stepsRequest = stepsIndex.openCursor(IDBKeyRange.only(sessionId));

      stepsRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      // Delete session
      const sessionsStore = transaction.objectStore(STORE_SESSIONS);
      sessionsStore.delete(sessionId);

      transaction.oncomplete = () => {
        console.log('[DB] Deleted session:', sessionId);
        resolve();
      };

      transaction.onerror = () => {
        reject(new Error(`Failed to delete session: ${transaction.error?.message}`));
      };
    });
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
      console.log('[DB] Database connection closed');
    }
  }
}

// Singleton instance
export const db = new DB();
