import { useState } from 'react';
import type { RecordedStep } from '@/shared/types';

interface StepDetailsPanelProps {
  step: RecordedStep;
  stepNumber: number;
}

export default function StepDetailsPanel({ step, stepNumber }: StepDetailsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

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

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-5 flex items-center justify-between hover:bg-gray-50 transition-all duration-200 rounded-2xl"
      >
        <div className="flex items-center gap-4">
          <span className="text-2xl">{getStepIcon(step.type)}</span>
          <div className="text-left">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-gray-900 text-base">Step {stepNumber}</span>
              <span
                className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${getStepColor(
                  step.type
                )}`}
              >
                {step.type}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1.5">{formatTime(step.timestamp)}</p>
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${
            isExpanded ? 'transform rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-6 pb-6 space-y-5 border-t border-gray-100">
          {/* Selector */}
          <div className="pt-5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2.5">Selector</h3>
            <div className="bg-gray-50 rounded-xl p-4 font-mono text-sm text-gray-800 break-all">
              {step.selector}
            </div>
          </div>

          {/* Alternative Selectors */}
          {step.alternativeSelectors && step.alternativeSelectors.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2.5">
                Alternative Selectors ({step.alternativeSelectors.length})
              </h3>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {step.alternativeSelectors.slice(0, 3).map((selector, idx) => (
                  <div
                    key={idx}
                    className="bg-gray-50 rounded-xl p-3 font-mono text-xs text-gray-700 break-all"
                  >
                    {selector}
                  </div>
                ))}
                {step.alternativeSelectors.length > 3 && (
                  <p className="text-xs text-gray-500 text-center mt-2">
                    +{step.alternativeSelectors.length - 3} more
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Value */}
          {step.value !== null && step.value !== undefined && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2.5">Value</h3>
              <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-800">
                {typeof step.value === 'boolean'
                  ? step.value
                    ? 'true'
                    : 'false'
                  : step.value}
              </div>
            </div>
          )}

          {/* URL */}
          {step.url && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2.5">URL</h3>
              <div className="bg-gray-50 rounded-xl p-4 text-sm text-blue-600 break-all">
                {step.url}
              </div>
            </div>
          )}

          {/* Element Context */}
          {step.elementContext && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2.5">Element Context</h3>
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <div>
                  <span className="font-medium text-gray-600">Tag:</span>{' '}
                  <code className="text-purple-600">&lt;{step.elementContext.tagName}&gt;</code>
                </div>
                {step.elementContext.textContent && (
                  <div>
                    <span className="font-medium text-gray-600">Text:</span>{' '}
                    <span className="text-gray-800">"{step.elementContext.textContent}"</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Metadata */}
          {step.metadata && Object.keys(step.metadata).length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2.5">Metadata</h3>
              <div className="bg-gray-50 rounded-xl p-4 space-y-1 text-xs font-mono max-h-48 overflow-y-auto">
                {Object.entries(step.metadata).map(([key, value]) => (
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
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2.5">Timestamp</h3>
            <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-800">
              {formatDate(step.timestamp)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

