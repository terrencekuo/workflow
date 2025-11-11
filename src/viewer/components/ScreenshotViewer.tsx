import type { VisualCapture } from '@/shared/types';

interface ScreenshotViewerProps {
  visual: VisualCapture | undefined;
  stepNumber: number;
}

export default function ScreenshotViewer({ visual, stepNumber }: ScreenshotViewerProps) {
  // Get the screenshot (prioritize viewport, then thumbnail)
  const screenshot = visual?.viewport || visual?.thumbnail;

  if (!screenshot) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center px-8">
          <div className="text-6xl mb-6 opacity-40">📷</div>
          <p className="text-gray-900 font-medium text-lg mb-2">No screenshot available</p>
          <p className="text-sm text-gray-500 leading-relaxed max-w-md">
            Screenshots are captured for click, submit, and navigation events
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center">
      <img
        src={screenshot}
        alt={`Step ${stepNumber} screenshot`}
        className="max-w-full max-h-full object-contain"
        style={{
          imageRendering: 'crisp-edges'
        }}
      />
    </div>
  );
}

