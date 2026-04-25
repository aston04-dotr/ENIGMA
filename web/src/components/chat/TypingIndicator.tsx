"use client";

import { memo, useEffect, useState } from "react";

/**
 * Статичная полоска «Печатает…» — memo, чтобы не дёргать ререндер при вводе.
 */
function TypingIndicatorInner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className={`px-2 pt-1.5 text-xs text-gray-400/90 transition-opacity duration-200 ease-out motion-reduce:animate-none motion-safe:animate-pulse ${
        show ? "opacity-100" : "opacity-0"
      }`}
      aria-live="polite"
    >
      Печатает…
    </div>
  );
}

export default memo(TypingIndicatorInner);
