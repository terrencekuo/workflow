import { useState } from 'react';
import type { VisualCapture } from '@/shared/types';

interface ScreenshotViewerProps {
  visual: VisualCapture | undefined;
  stepNumber: number;
  totalSteps: number;
}

export default function ScreenshotViewer({ visual, stepNumber, totalSteps }: ScreenshotViewerProps) {
  const [isZoomed, setIsZoomed] = useState(false);

  // Get the screenshot (prioritize viewport, then thumbnail)
  const screenshot = visual?.viewport || visual?.thumbnail;

  if (!screenshot) {
    return (
      <div className="bg-gray-100 rounded-lg flex items-center justify-center h-[500px]">
        <div className="text-center">
          <div className="text-6xl mb-4">📷</div>
          <p className="text-gray-600 font-medium">No screenshot available</p>
          <p className="text-sm text-gray-500 mt-2">
            Screenshots are captured for click, submit, and navigation events
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Screenshot Display */}
      <div className="relative">
        {/* Step Counter */}
        <div className="absolute top-4 right-4 z-10 bg-black bg-opacity-60 text-white px-4 py-2 rounded-lg shadow-lg">
          <span className="text-lg font-semibold">
            {stepNumber} / {totalSteps}
          </span>
        </div>

        {/* Zoom Hint */}
        {!isZoomed && (
          <div className="absolute bottom-4 left-4 z-10 bg-black bg-opacity-60 text-white px-3 py-1 rounded text-sm">
            Click to zoom
          </div>
        )}

        {/* Screenshot Container */}
        <div className="min-h-[500px] max-h-[600px] bg-gray-900 rounded-lg overflow-hidden shadow-lg flex items-center justify-center">
          <img
            src={screenshot}
            alt="Screenshot"
            className={`max-w-full max-h-full object-contain transition-transform duration-200 ${
              isZoomed ? 'cursor-zoom-out scale-150' : 'cursor-zoom-in'
            }`}
            onClick={() => setIsZoomed(!isZoomed)}
            style={{ imageRendering: 'crisp-edges' }}
          />
        </div>
      </div>

      {/* Screenshot Info */}
      <div className="text-center text-sm text-gray-500">
        <p>Screenshot captured after the interaction completed</p>
      </div>
    </div>
  );
}

