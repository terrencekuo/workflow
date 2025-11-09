import React from 'react';
import ReactDOM from 'react-dom/client';
import Viewer from './Viewer';
import './viewer.css';

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <Viewer />
    </React.StrictMode>
  );
}
