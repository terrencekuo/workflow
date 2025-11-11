import type { Session } from '@/shared/types';

interface SessionCardProps {
  session: Session;
  onView: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
}

export default function SessionCard({ session, onView, onDelete }: SessionCardProps) {
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="group bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-all duration-200 hover:-translate-y-1">
      {/* Thumbnail - YouTube-style 16:9 aspect ratio */}
      <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 relative overflow-hidden">
        {session.thumbnail ? (
          <img
            src={session.thumbnail}
            alt={session.metadata.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
        )}

        {/* Overlay with step count */}
        <div className="absolute top-3 right-3">
          <div className="bg-gray-900/80 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
            </svg>
            <span>{session.stepCount ?? session.steps.length} steps</span>
          </div>
        </div>

        {/* Hover overlay with actions */}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900/90 via-gray-900/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end justify-center pb-4 gap-2">
          <button
            onClick={() => onView(session.id)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-lg"
          >
            View Session
          </button>
          <button
            onClick={() => onDelete(session.id)}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors shadow-lg"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-1 group-hover:text-blue-600 transition-colors">
          {session.metadata.title}
        </h3>

        {session.metadata.description && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
            {session.metadata.description}
          </p>
        )}

        <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span>{formatDate(session.createdAt)}</span>
        </div>

        {session.metadata.tags && session.metadata.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {session.metadata.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full font-medium"
              >
                {tag}
              </span>
            ))}
            {session.metadata.tags.length > 3 && (
              <span className="px-2 py-0.5 text-gray-500 text-xs font-medium">
                +{session.metadata.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
