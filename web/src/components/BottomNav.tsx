"use client";

import { IconChat, IconHome, IconPlus, IconUser } from "@/components/NavIcons";
import { useAuth } from "@/context/auth-context";
import { useChatUnread } from "@/context/chat-unread-context";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Лента", Icon: IconHome },
  { href: "/create", label: "Создать", Icon: IconPlus },
  { href: "/chat", label: "Чаты", Icon: IconChat },
  { href: "/profile", label: "Профиль", Icon: IconUser },
] as const;

function formatUnreadBadge(count: number): string {
  if (count > 99) return "99+";
  return String(count);
}

export function BottomNav() {
  const { session, loading, user } = useAuth();
  const { totalUnread } = useChatUnread();
  const pathname = usePathname();

  const authed = Boolean(user);
  const dimmed = loading || !authed;

  return (
    <nav
      className={
        "fixed bottom-0 left-1/2 z-50 flex h-[64px] w-full -translate-x-1/2 items-stretch justify-around border-t border-line bg-elevated/90 backdrop-blur-xl safe-pb view-mode-nav transition-opacity duration-200 " +
        (dimmed ? "opacity-75" : "opacity-100")
      }
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 10px)" }}
      aria-busy={loading}
    >
      {tabs.map((t) => {
        const active =
          t.href === "/chat"
            ? pathname === "/chat" || pathname.startsWith("/chat/")
            : pathname === t.href ||
              (t.href !== "/" && pathname.startsWith(t.href));

        const isChatTab = t.href === "/chat";
        const unread = isChatTab ? totalUnread : 0;
        const { Icon } = t;

        return (
          <Link
            key={t.href}
            href={t.href}
            prefetch
            className={`pressable relative flex min-h-[48px] min-w-[52px] flex-1 flex-col items-center justify-center gap-1 pt-1 text-[10px] font-medium tracking-wide transition-colors duration-ui ${
              active ? "text-accent" : "text-muted"
            }`}
          >
            <span className="relative inline-flex">
              <Icon className="h-6 w-6" />
              {isChatTab && unread > 0 ? (
                <span
                  className="absolute -right-2 -top-1 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[10px] font-bold leading-none text-white shadow-[0_0_0_2px_rgba(14,17,20,0.95)]"
                  aria-label={`Непрочитанных сообщений: ${unread}`}
                >
                  {formatUnreadBadge(unread)}
                </span>
              ) : null}
            </span>
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default BottomNav;
