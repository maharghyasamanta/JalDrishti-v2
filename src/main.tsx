import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { SelectionProvider } from './context/SelectionContext';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <HashRouter>
      <SelectionProvider>
        <App />
      </SelectionProvider>
    </HashRouter>
  </React.StrictMode>,
);
