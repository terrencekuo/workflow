import { useEffect } from 'react';

interface NavigationControlsProps {
  currentStep: number;
  totalSteps: number;
  onPrevious: () => void;
  onNext: () => void;
  canGoPrevious: boolean;
  canGoNext: boolean;
}

export default function NavigationControls({
  currentStep,
  totalSteps,
  onPrevious,
  onNext,
  canGoPrevious,
  canGoNext,
}: NavigationControlsProps) {
  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && canGoPrevious) {
        e.preventDefault();
        onPrevious();
      } else if (e.key === 'ArrowRight' && canGoNext) {
        e.preventDefault();
        onNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canGoPrevious, canGoNext, onPrevious, onNext]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      <div className="flex items-center justify-between gap-6">
        {/* Previous Button */}
        <button
          onClick={onPrevious}
          disabled={!canGoPrevious}
          className={`flex items-center gap-2 px-8 py-3 rounded-full font-medium transition-all duration-200 ${
            canGoPrevious
              ? 'bg-gray-900 hover:bg-gray-800 text-white active:scale-95'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          <span>Previous</span>
        </button>

        {/* Progress Indicator */}
        <div className="flex-1 flex flex-col items-center gap-3">
          {/* Progress Bar */}
          <div className="w-full max-w-lg bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-gray-900 h-full transition-all duration-500 ease-out rounded-full"
              style={{ width: `${(currentStep / totalSteps) * 100}%` }}
            />
          </div>

          {/* Keyboard Hint */}
          <div className="text-xs text-gray-400 font-medium">
            Use ← → arrow keys to navigate
          </div>
        </div>

        {/* Next Button */}
        <button
          onClick={onNext}
          disabled={!canGoNext}
          className={`flex items-center gap-2 px-8 py-3 rounded-full font-medium transition-all duration-200 ${
            canGoNext
              ? 'bg-gray-900 hover:bg-gray-800 text-white active:scale-95'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          <span>Next</span>
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      {/* Step Dots (for visual progress) */}
      {totalSteps <= 20 && (
        <div className="flex justify-center gap-1.5 mt-6">
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map((stepNum) => (
            <div
              key={stepNum}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                stepNum === currentStep
                  ? 'bg-gray-900 w-8'
                  : stepNum < currentStep
                  ? 'bg-gray-400 w-1.5'
                  : 'bg-gray-200 w-1.5'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

