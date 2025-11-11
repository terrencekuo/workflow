import { useState, useEffect, useMemo } from 'react';
import { COMMANDS } from '@/shared/constants';
import type { Session, MessageResponse } from '@/shared/types';
import SessionsNavbar from './SessionsNavbar';
import SessionsGrid from './SessionsGrid';
import SessionsList from './SessionsList';

interface SessionsContainerProps {
  onSessionSelect: (sessionId: string) => void;
}

async function sendMessage(command: string, data?: any): Promise<MessageResponse> {
  try {
    const response = await chrome.runtime.sendMessage({ command, data });
    return response;
  } catch (error) {
    console.error('[SessionsContainer] Error sending message:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send message',
    };
  }
}

// Helper function to get saved view mode from localStorage
function getSavedViewMode(): 'grid' | 'list' {
  try {
    const saved = localStorage.getItem('workflow-view-mode');
    return saved === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

// Helper function to save view mode to localStorage
function saveViewMode(mode: 'grid' | 'list') {
  try {
    localStorage.setItem('workflow-view-mode', mode);
  } catch (error) {
    console.error('[SessionsContainer] Failed to save view mode:', error);
  }
}

export default function SessionsContainer({ onSessionSelect }: SessionsContainerProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(getSavedViewMode());

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setLoading(true);
    setError(null);

    console.log('[SessionsContainer] Loading sessions...');
    const response = await sendMessage(COMMANDS.GET_ALL_SESSIONS);
    console.log('[SessionsContainer] Response:', response);

    if (response.success && response.data) {
      console.log('[SessionsContainer] Loaded', response.data.length, 'sessions');
      setSessions(response.data);
    } else {
      console.error('[SessionsContainer] Error loading sessions:', response.error);
      setError(response.error || 'Failed to load sessions');
    }

    setLoading(false);
  };

  const handleDelete = async (sessionId: string) => {
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

  const handleViewModeChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    saveViewMode(mode);
  };

  // Filter sessions based on search query
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) {
      return sessions;
    }

    const query = searchQuery.toLowerCase().trim();

    return sessions.filter((session) => {
      // Search by title
      if (session.metadata.title.toLowerCase().includes(query)) {
        return true;
      }

      // Search by description
      if (session.metadata.description?.toLowerCase().includes(query)) {
        return true;
      }

      // Search by tags
      if (session.metadata.tags?.some((tag) => tag.toLowerCase().includes(query))) {
        return true;
      }

      // Search by date (formatted)
      const dateStr = new Date(session.createdAt).toLocaleDateString().toLowerCase();
      if (dateStr.includes(query)) {
        return true;
      }

      // Search by date parts (month name, day, year)
      const date = new Date(session.createdAt);
      const monthName = date.toLocaleDateString('en-US', { month: 'long' }).toLowerCase();
      const monthShort = date.toLocaleDateString('en-US', { month: 'short' }).toLowerCase();
      const day = date.getDate().toString();
      const year = date.getFullYear().toString();

      if (monthName.includes(query) || monthShort.includes(query) || day.includes(query) || year.includes(query)) {
        return true;
      }

      return false;
    });
  }, [sessions, searchQuery]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-[1800px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Recorded Sessions</h1>
          <p className="text-gray-600">View and manage your workflow recordings</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-xl">
            {error}
          </div>
        )}

        {/* Navbar with Search and View Toggle */}
        <SessionsNavbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          totalSessions={filteredSessions.length}
        />

        {/* Content Area - Grid or List View */}
        {loading ? (
          viewMode === 'grid' ? (
            <SessionsGrid sessions={[]} onView={onSessionSelect} onDelete={handleDelete} loading />
          ) : (
            <SessionsList sessions={[]} onView={onSessionSelect} onDelete={handleDelete} loading />
          )
        ) : sessions.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No sessions recorded yet</h3>
            <p className="text-gray-600">Start recording from the extension popup</p>
          </div>
        ) : viewMode === 'grid' ? (
          <SessionsGrid sessions={filteredSessions} onView={onSessionSelect} onDelete={handleDelete} />
        ) : (
          <SessionsList sessions={filteredSessions} onView={onSessionSelect} onDelete={handleDelete} />
        )}
      </div>
    </div>
  );
}
