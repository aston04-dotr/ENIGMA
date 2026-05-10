"use client";

/**
 * Раньше блокировал первый кадр Landing/ENIGMA. Сейчас всегда показываем shell —
 * гостевые и защищённые экраны сами решают вход/CTA без полноэкранного бренда.
 */
export function ShellGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
