import type { Theme } from "../app/useTheme";

type ThemeToggleProps = {
  theme: Theme;
  onToggle: () => void;
};

export const ThemeToggle = ({ theme, onToggle }: ThemeToggleProps) => (
  <button
    aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
    className="icon-button"
    type="button"
    onClick={onToggle}
  >
    {theme === "dark" ? (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="12" r="4" />
        <path
          strokeLinecap="round"
          d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4"
        />
      </svg>
    ) : (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"
        />
      </svg>
    )}
  </button>
);
