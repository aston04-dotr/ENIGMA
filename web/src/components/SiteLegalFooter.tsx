"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Компактная полоска над нижней навигацией (только в shell). */
export function SiteLegalFooter() {
  const pathname = usePathname();
  const isChatRoom = pathname.startsWith("/chat/");
  if (isChatRoom) return null;

  return (
    <footer
      className="fixed bottom-[64px] left-0 right-0 z-40 border-t border-line bg-elevated/95 px-4 py-2 text-center text-[11px] leading-snug text-muted backdrop-blur-md"
      aria-label="Юридическая информация"
    >
      <Link href="/legal/terms" prefetch className="font-medium text-accent hover:text-accent-hover hover:underline">
        Пользовательское соглашение
      </Link>
      <span className="mx-2 text-muted/70" aria-hidden>
        ·
      </span>
      <Link href="/legal/privacy" prefetch className="font-medium text-accent hover:text-accent-hover hover:underline">
        Политика конфиденциальности
      </Link>
    </footer>
  );
}
