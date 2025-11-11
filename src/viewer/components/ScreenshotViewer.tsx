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
      <div className="bg-white rounded-2xl flex items-center justify-center min-h-[500px] shadow-sm border border-gray-100">
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
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
      <div className="p-6">
        <img
          src={screenshot}
          alt={`Step ${stepNumber} screenshot`}
          className="w-full rounded-lg"
          style={{
            imageRendering: 'crisp-edges',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
          }}
        />
      </div>
    </div>
  );
}

