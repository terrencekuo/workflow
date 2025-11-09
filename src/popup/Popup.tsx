import { useState, useEffect } from 'react';
import { COMMANDS } from '../shared/constants';
import type { RecordingState, SessionMetadata, MessageResponse } from '../shared/types';

async function sendMessage(command: string, data?: any): Promise<MessageResponse> {
  try {
    const response = await chrome.runtime.sendMessage({ command, data });
    return response;
  } catch (error) {
    console.error('[Popup] Error sending message:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send message',
    };
  }
}

export default function Popup() {
  const [recordingState, setRecordingState] = useState<RecordingState>({
    status: 'idle',
    sessionId: null,
    currentTabId: null,
    stepCount: 0,
  });
  const [sessionTitle, setSessionTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRecordingState();
  }, []);

  const loadRecordingState = async () => {
    const response = await sendMessage(COMMANDS.GET_RECORDING_STATE);
    if (response.success && response.data) {
      setRecordingState(response.data);
    }
  };

  const handleStartRecording = async () => {
    if (!sessionTitle.trim()) {
      setError('Please enter a session title');
      return;
    }

    setError(null);

    const metadata: SessionMetadata = {
      title: sessionTitle,
      startUrl: window.location.href,
      createdAt: Date.now(),
    };

    const response = await sendMessage(COMMANDS.START_RECORDING, { metadata });

    if (response.success) {
      await loadRecordingState();
      setSessionTitle('');
    } else {
      setError(response.error || 'Failed to start recording');
    }
  };

  const handleStopRecording = async () => {
    const response = await sendMessage(COMMANDS.STOP_RECORDING);

    if (response.success) {
      await loadRecordingState();
    } else {
      setError(response.error || 'Failed to stop recording');
    }
  };

  const openViewer = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('viewer/viewer.html') });
  };

  const isRecording = recordingState.status === 'recording';

  return (
    <div className="w-80 p-4 bg-gray-50">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">Workflow Recorder</h1>
        <p className="text-sm text-gray-600">Capture and replay user workflows</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {isRecording ? (
        <div className="space-y-4">
          <div className="p-4 bg-green-100 border border-green-400 rounded">
            <div className="flex items-center justify-between mb-2">
              <span className="text-green-800 font-semibold">Recording</span>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse mr-2"></div>
                <span className="text-sm text-green-700">Live</span>
              </div>
            </div>
            <div className="text-sm text-green-700">
              <p>Steps captured: {recordingState.stepCount}</p>
              <p className="text-xs mt-1 text-green-600">
                Session ID: {recordingState.sessionId?.slice(0, 8)}...
              </p>
            </div>
          </div>

          <button
            onClick={handleStopRecording}
            className="w-full py-2 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded transition-colors"
          >
            Stop Recording
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor="session-title" className="block text-sm font-medium text-gray-700 mb-1">
              Session Title
            </label>
            <input
              id="session-title"
              type="text"
              value={sessionTitle}
              onChange={(e) => setSessionTitle(e.target.value)}
              placeholder="e.g., User Registration Flow"
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            onClick={handleStartRecording}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded transition-colors"
          >
            Start Recording
          </button>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-300">
        <button
          onClick={openViewer}
          className="w-full py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded transition-colors"
        >
          View Sessions
        </button>
      </div>

      <div className="mt-4 text-xs text-gray-500 text-center">
        <p>Chrome Workflow Recorder v1.0.0</p>
      </div>
    </div>
  );
}
