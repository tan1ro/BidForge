import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import ThemeController from "./components/ThemeController";
import AppErrorBoundary from "./components/AppErrorBoundary";

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <ThemeController />
    </AppErrorBoundary>
  </StrictMode>,
);
