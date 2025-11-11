import type { RecordedStep } from '@/shared/types';

interface ThumbnailSidebarProps {
  steps: RecordedStep[];
  currentStepIndex: number;
  onStepClick: (index: number) => void;
}

export default function ThumbnailSidebar({
  steps,
  currentStepIndex,
  onStepClick
}: ThumbnailSidebarProps) {
  return (
    <div className="w-56 flex-shrink-0">
      <div className="sticky top-6">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-3 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">
            Steps ({steps.length})
          </h3>
          <p className="text-xs text-gray-500 mt-1">Click to jump</p>
        </div>

        {/* Scrollable Thumbnails */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="max-h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar">
            <div className="p-2 space-y-2">
              {steps.map((step, index) => {
                const screenshot = step.visual?.thumbnail || step.visual?.viewport;
                const isActive = index === currentStepIndex;

                return (
                  <button
                    key={step.id}
                    onClick={() => onStepClick(index)}
                    className={`w-full group relative rounded-lg overflow-hidden transition-all duration-200 ${
                      isActive
                        ? 'ring-2 ring-blue-500 ring-offset-2 shadow-md'
                        : 'hover:ring-2 hover:ring-gray-300 hover:ring-offset-1'
                    }`}
                  >
                    {/* Thumbnail or Placeholder */}
                    <div className="aspect-video bg-gray-100 relative">
                      {screenshot ? (
                        <img
                          src={screenshot}
                          alt={`Step ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-2xl opacity-30">📷</span>
                        </div>
                      )}

                      {/* Overlay with step number */}
                      <div
                        className={`absolute inset-0 flex items-end justify-start p-2 transition-opacity ${
                          isActive
                            ? 'bg-gradient-to-t from-blue-900/80 to-transparent'
                            : 'bg-gradient-to-t from-gray-900/60 to-transparent group-hover:from-gray-900/80'
                        }`}
                      >
                        <span className="text-white text-xs font-bold">
                          Step {index + 1}
                        </span>
                      </div>

                      {/* Active indicator */}
                      {isActive && (
                        <div className="absolute top-2 right-2">
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
