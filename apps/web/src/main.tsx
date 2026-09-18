import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/space-grotesk';
import '@fontsource/ibm-plex-mono/latin-ext-400.css';
import '@fontsource/ibm-plex-mono/latin-ext-500.css';
import '@fontsource/ibm-plex-mono/latin-ext-600.css';
import './styles.css';
import './components.css';
import { App } from './app';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
