import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Performance: Remove loader once app is ready
const removeLoader = () => {
  const loader = document.querySelector('.app-loader');
  if (loader) {
    loader.remove();
  }
};

// Create root and render
const root = createRoot(document.getElementById("root")!);
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Remove loader after first paint
if (document.readyState === 'complete') {
  removeLoader();
} else {
  window.addEventListener('load', removeLoader, { once: true });
}

// Register service worker for PWA
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .catch(() => {
        // SW registration failed, app still works
      });
  });
}
