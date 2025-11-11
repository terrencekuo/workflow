import type { Session } from '@/shared/types';
import SessionListItem from './SessionListItem';

interface SessionsListProps {
  sessions: Session[];
  onView: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  loading?: boolean;
}

export default function SessionsList({ sessions, onView, onDelete, loading }: SessionsListProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 animate-pulse"
          >
            <div className="flex items-center gap-4">
              <div className="w-32 h-20 bg-gray-200 rounded-lg" />
              <div className="flex-1 space-y-3">
                <div className="h-5 bg-gray-200 rounded w-1/3" />
                <div className="h-4 bg-gray-200 rounded w-2/3" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
              <div className="flex gap-2">
                <div className="w-16 h-9 bg-gray-200 rounded-lg" />
                <div className="w-16 h-9 bg-gray-200 rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
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
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No sessions found</h3>
        <p className="text-gray-600 mb-1">No sessions match your search criteria</p>
        <p className="text-sm text-gray-500">Try adjusting your search or create a new recording</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sessions.map((session) => (
        <SessionListItem
          key={session.id}
          session={session}
          onView={onView}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
