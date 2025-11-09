import { useState, useEffect } from 'react';
import { COMMANDS } from '@/shared/constants';
import type { Session, MessageResponse } from '@/shared/types';

async function sendMessage(command: string, data?: any): Promise<MessageResponse> {
  try {
    const response = await chrome.runtime.sendMessage({ command, data });
    return response;
  } catch (error) {
    console.error('[Viewer] Error sending message:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send message',
    };
  }
}

export default function Viewer() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setLoading(true);
    setError(null);

    const response = await sendMessage(COMMANDS.GET_ALL_SESSIONS);

    if (response.success && response.data) {
      setSessions(response.data);
    } else {
      setError(response.error || 'Failed to load sessions');
    }

    setLoading(false);
  };

  const deleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this session?')) {
      return;
    }

    const response = await sendMessage(COMMANDS.DELETE_SESSION, { sessionId });

    if (response.success) {
      await loadSessions();
    } else {
      setError(response.error || 'Failed to delete session');
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Recorded Sessions</h1>
          <p className="text-gray-600">View and manage your workflow recordings</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Loading sessions...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <p className="text-gray-600 mb-4">No sessions recorded yet</p>
            <p className="text-sm text-gray-500">Start recording from the extension popup</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      {session.metadata.title}
                    </h3>
                    {session.metadata.description && (
                      <p className="text-gray-600 mb-3">{session.metadata.description}</p>
                    )}
                    <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                      <div>
                        <span className="font-medium">Steps:</span> {session.steps.length}
                      </div>
                      <div>
                        <span className="font-medium">Created:</span> {formatDate(session.createdAt)}
                      </div>
                      <div>
                        <span className="font-medium">Updated:</span> {formatDate(session.updatedAt)}
                      </div>
                    </div>
                    {session.metadata.tags && session.metadata.tags.length > 0 && (
                      <div className="mt-3 flex gap-2">
                        {session.metadata.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => deleteSession(session.id)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
