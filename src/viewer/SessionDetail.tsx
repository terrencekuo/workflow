import { useState, useEffect } from 'react';
import { COMMANDS } from '@/shared/constants';
import type { Session, RecordedStep, MessageResponse } from '@/shared/types';

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
  const [selectedStep, setSelectedStep] = useState<RecordedStep | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSession();
  }, [sessionId]);

  const loadSession = async () => {
    setLoading(true);
    setError(null);

    const response = await sendMessage(COMMANDS.GET_SESSION, { sessionId });

    if (response.success && response.data) {
      setSession(response.data);
      if (response.data.steps.length > 0) {
        setSelectedStep(response.data.steps[0]);
      }
    } else {
      setError(response.error || 'Failed to load session');
    }

    setLoading(false);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getStepIcon = (type: string) => {
    switch (type) {
      case 'click':
        return '🖱️';
      case 'input':
        return '⌨️';
      case 'change':
        return '🔄';
      case 'submit':
        return '📤';
      case 'scroll':
        return '↕️';
      case 'navigation':
        return '🧭';
      case 'keypress':
        return '🔤';
      default:
        return '📍';
    }
  };

  const getStepColor = (type: string) => {
    switch (type) {
      case 'click':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'input':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'submit':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'navigation':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={onBack}
            className="mb-4 px-4 py-2 text-blue-600 hover:text-blue-800 font-medium"
          >
            ← Back to Sessions
          </button>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{session.metadata.title}</h1>
          {session.metadata.description && (
            <p className="text-gray-600 mb-4">{session.metadata.description}</p>
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
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Step Timeline */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Step Timeline</h2>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {session.steps.map((step, index) => (
                <div
                  key={step.id}
                  onClick={() => setSelectedStep(step)}
                  className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    selectedStep?.id === step.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{getStepIcon(step.type)}</span>
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded border ${getStepColor(
                            step.type
                          )}`}
                        >
                          {step.type}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 truncate">{step.selector}</p>
                      <p className="text-xs text-gray-400 mt-1">{formatTime(step.timestamp)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Step Details */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Step Details</h2>
            {selectedStep ? (
              <div className="space-y-4">
                {/* Visual Preview */}
                {selectedStep.visual?.thumbnail && (
                  <div className="mb-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Screenshot</h3>
                    <img
                      src={selectedStep.visual.thumbnail}
                      alt="Step screenshot"
                      className="w-full rounded-lg border border-gray-200"
                    />
                  </div>
                )}

                {/* Step Info */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Type</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{getStepIcon(selectedStep.type)}</span>
                    <span
                      className={`px-3 py-1 text-sm font-medium rounded border ${getStepColor(
                        selectedStep.type
                      )}`}
                    >
                      {selectedStep.type}
                    </span>
                  </div>
                </div>

                {/* Selector */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Selector</h3>
                  <div className="bg-gray-50 rounded p-3 font-mono text-sm text-gray-800 break-all">
                    {selectedStep.selector}
                  </div>
                </div>

                {/* Alternative Selectors */}
                {selectedStep.alternativeSelectors &&
                  selectedStep.alternativeSelectors.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-2">
                        Alternative Selectors ({selectedStep.alternativeSelectors.length})
                      </h3>
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {selectedStep.alternativeSelectors.map((selector, idx) => (
                          <div
                            key={idx}
                            className="bg-gray-50 rounded p-2 font-mono text-xs text-gray-700 break-all"
                          >
                            {selector}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Value */}
                {selectedStep.value !== null && selectedStep.value !== undefined && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Value</h3>
                    <div className="bg-gray-50 rounded p-3 text-sm text-gray-800">
                      {typeof selectedStep.value === 'boolean'
                        ? selectedStep.value
                          ? 'true'
                          : 'false'
                        : selectedStep.value}
                    </div>
                  </div>
                )}

                {/* URL */}
                {selectedStep.url && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">URL</h3>
                    <div className="bg-gray-50 rounded p-3 text-sm text-blue-600 break-all">
                      {selectedStep.url}
                    </div>
                  </div>
                )}

                {/* Element Context */}
                {selectedStep.elementContext && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Element Context</h3>
                    <div className="bg-gray-50 rounded p-3 space-y-2 text-sm">
                      <div>
                        <span className="font-medium">Tag:</span>{' '}
                        <code className="text-purple-600">&lt;{selectedStep.elementContext.tagName}&gt;</code>
                      </div>
                      {selectedStep.elementContext.textContent && (
                        <div>
                          <span className="font-medium">Text:</span>{' '}
                          <span className="text-gray-700">
                            "{selectedStep.elementContext.textContent}"
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Metadata */}
                {selectedStep.metadata && Object.keys(selectedStep.metadata).length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Metadata</h3>
                    <div className="bg-gray-50 rounded p-3 space-y-1 text-xs font-mono max-h-48 overflow-y-auto">
                      {Object.entries(selectedStep.metadata).map(([key, value]) => (
                        <div key={key} className="text-gray-700">
                          <span className="text-blue-600">{key}:</span>{' '}
                          {typeof value === 'object'
                            ? JSON.stringify(value, null, 2)
                            : String(value)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Timestamp */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Timestamp</h3>
                  <div className="bg-gray-50 rounded p-3 text-sm text-gray-800">
                    {formatDate(selectedStep.timestamp)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                Select a step to view details
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
