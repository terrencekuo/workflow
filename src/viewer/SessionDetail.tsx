import { useState, useEffect } from 'react';
import { COMMANDS } from '@/shared/constants';
import type { Session, MessageResponse } from '@/shared/types';
import ScreenshotViewer from './components/ScreenshotViewer';
import StepDetailsPanel from './components/StepDetailsPanel';
import NavigationControls from './components/NavigationControls';
import ThumbnailSidebar from './components/ThumbnailSidebar';

interface SessionDetailProps {
  sessionId: string;
  onBack: () => void;
}

async function sendMessage(command: string, data?: any): Promise<MessageResponse> {
  try {
    const response = await chrome.runtime.sendMessage({ command, data });
    return response;
  } catch (error) {
    console.error('[SessionDetail] Error sending message:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send message',
    };
  }
}

export default function SessionDetail({ sessionId, onBack }: SessionDetailProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSession();
  }, [sessionId]);

  const loadSession = async () => {
    setLoading(true);
    setError(null);

    console.log('[SessionDetail] Loading session:', sessionId);
    const response = await sendMessage(COMMANDS.GET_SESSION, { sessionId });
    console.log('[SessionDetail] Response:', response);

    if (response.success && response.data) {
      console.log('[SessionDetail] Session loaded with', response.data.steps.length, 'steps');
      setSession(response.data);
      // Start at the first step
      setCurrentStepIndex(0);
    } else {
      console.error('[SessionDetail] Error loading session:', response.error);
      setError(response.error || 'Failed to load session');
    }

    setLoading(false);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const handlePrevious = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const handleNext = () => {
    if (session && currentStepIndex < session.steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading session...</p>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <button
            onClick={onBack}
            className="mb-4 px-4 py-2 text-blue-600 hover:text-blue-800 font-medium"
          >
            ← Back to Sessions
          </button>
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error || 'Session not found'}
          </div>
        </div>
      </div>
    );
  }

  if (session.steps.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <button
            onClick={onBack}
            className="mb-4 px-4 py-2 text-blue-600 hover:text-blue-800 font-medium"
          >
            ← Back to Sessions
          </button>
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-6xl mb-4">📝</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No Steps Recorded</h2>
            <p className="text-gray-600">This session doesn't have any recorded steps yet.</p>
          </div>
        </div>
      </div>
    );
  }

  const currentStep = session.steps[currentStepIndex];
  const canGoPrevious = currentStepIndex > 0;
  const canGoNext = currentStepIndex < session.steps.length - 1;

  const handleStepClick = (index: number) => {
    setCurrentStepIndex(index);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-[1800px] mx-auto px-6 py-8">
        {/* Back Button */}
        <button
          onClick={onBack}
          className="mb-6 px-4 py-2 text-gray-600 hover:text-gray-900 font-medium flex items-center gap-2 hover:gap-3 transition-all duration-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
          <span>Back to Sessions</span>
        </button>

        {/* Section 1: Session Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-3 tracking-tight">
            {session.metadata.title}
          </h1>
          {session.metadata.description && (
            <p className="text-gray-600 text-base mb-4 leading-relaxed">
              {session.metadata.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900">{session.steps.length}</span>
              <span>steps</span>
            </div>
            <span className="text-gray-300">•</span>
            <span>{formatDate(session.createdAt)}</span>
            {session.metadata.tags && session.metadata.tags.length > 0 && (
              <>
                <span className="text-gray-300">•</span>
                <div className="flex gap-2">
                  {session.metadata.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 bg-gray-100 text-gray-700 text-xs rounded-full font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Section 2: Main Content Area - 3 Column Layout */}
        <div className="flex gap-6">
          {/* Left Column: Thumbnail Sidebar */}
          <ThumbnailSidebar
            steps={session.steps}
            currentStepIndex={currentStepIndex}
            onStepClick={handleStepClick}
          />

          {/* Center Column: Screenshot Viewer + Navigation */}
          <div className="flex-1 space-y-4">
            {/* Screenshot Viewer */}
            <ScreenshotViewer
              visual={currentStep.visual}
              stepNumber={currentStepIndex + 1}
            />

            {/* Navigation Controls */}
            <NavigationControls
              currentStep={currentStepIndex + 1}
              totalSteps={session.steps.length}
              onPrevious={handlePrevious}
              onNext={handleNext}
              canGoPrevious={canGoPrevious}
              canGoNext={canGoNext}
            />
          </div>

          {/* Right Column: Step Details Panel */}
          <div className="w-80 flex-shrink-0">
            <div className="sticky top-6">
              <StepDetailsPanel
                step={currentStep}
                stepNumber={currentStepIndex + 1}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
