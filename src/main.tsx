import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import "./styles/global.css";
import { App } from "./app/App";
import { LoadingSplash } from "./components/LoadingSplash";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element was not found.");
}

const initialTheme = (() => {
  const stored = window.localStorage.getItem("essa.theme");

  if (stored === "light" || stored === "dark") {
    return stored;
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
})();

document.documentElement.dataset.theme = initialTheme;

createRoot(rootElement).render(
  <StrictMode>
    <LoadingSplash />
    <App />
  </StrictMode>,
);
