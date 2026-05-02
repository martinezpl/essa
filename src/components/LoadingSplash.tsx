import { useEffect, useState } from "react";

const SPLASH_DURATION = 1500;

export const LoadingSplash = () => {
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(false), SPLASH_DURATION);

    return () => window.clearTimeout(timer);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <div aria-hidden className="splash" role="presentation">
      <div className="splash__inner">
        <div className="splash__word">
          <span>e</span>
          <span>s</span>
          <span>s</span>
          <span>a</span>
          <span className="splash__caret" />
        </div>
        <div className="splash__bar" />
      </div>
    </div>
  );
};
