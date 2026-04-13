export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-main px-8 text-center">
      <p className="text-lg font-semibold text-fg">Нет сети</p>
      <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">Проверьте подключение и откройте Enigma снова.</p>
    </main>
  );
}
