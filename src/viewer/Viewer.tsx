import { useState } from 'react';
import SessionDetail from '@/viewer/SessionDetail';
import SessionsContainer from '@/viewer/components/SessionsContainer';

export default function Viewer() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Show detail view if a session is selected
  if (selectedSessionId) {
    return (
      <SessionDetail
        sessionId={selectedSessionId}
        onBack={() => setSelectedSessionId(null)}
      />
    );
  }

  return <SessionsContainer onSessionSelect={setSelectedSessionId} />;
}
