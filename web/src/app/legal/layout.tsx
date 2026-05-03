/**
 * Юридические страницы: светлая вёрстка под требования платёжных систем,
 * без использования тёмной темы приложения.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="legal-doc-root min-h-screen bg-white text-neutral-900 antialiased">{children}</div>
  );
}
