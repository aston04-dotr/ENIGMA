/** Нейтральный кадр — без shimmer/логотипа, чтобы не «мигало» между навигацией и приложением */
export default function Loading() {
  return (
    <div
      className="min-h-[100svh] bg-main supports-[height:100dvh]:min-h-[100dvh]"
      aria-hidden
    />
  );
}
