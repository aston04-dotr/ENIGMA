"use client";

import { Suspense, type ComponentType } from "react";
import { IconChat, IconHome, IconKey, IconPlus, IconUser } from "@/components/NavIcons";
import { useAuth } from "@/context/auth-context";
import { useChatUnread } from "@/context/chat-unread-context";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type TabDef = {
  key: string;
  href: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  isActive: (pathname: string, intent: string | null) => boolean;
};

const tabs: TabDef[] = [
  {
    key: "feed",
    href: "/",
    label: "Лента",
    Icon: IconHome,
    isActive: (p) => p === "/",
  },
  {
    key: "rent",
    href: "/create?intent=rent",
    label: "Снять",
    Icon: IconKey,
    isActive: (p, intent) => p === "/create" && intent === "rent",
  },
  {
    key: "create",
    href: "/create",
    label: "Создать",
    Icon: IconPlus,
    isActive: (p, intent) => p === "/create" && intent !== "rent",
  },
  {
    key: "chat",
    href: "/chat",
    label: "Чаты",
    Icon: IconChat,
    isActive: (p) => p === "/chat" || p.startsWith("/chat/"),
  },
  {
    key: "profile",
    href: "/profile",
    label: "Профиль",
    Icon: IconUser,
    isActive: (p) => p === "/profile" || p.startsWith("/profile/"),
  },
];

function formatUnreadBadge(count: number): string {
  if (count > 99) return "99+";
  return String(count);
}

function BottomNavInner() {
  const { loading, user } = useAuth();
  const { totalUnread } = useChatUnread();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const intent = searchParams.get("intent");

  const authed = Boolean(user);
  const dimmed = loading || !authed;

  return (
    <nav
      className={
        "fixed bottom-0 left-1/2 z-50 flex h-[64px] w-full max-w-lg -translate-x-1/2 items-stretch justify-around border-t border-line bg-elevated/90 backdrop-blur-xl safe-pb view-mode-nav transition-opacity duration-200 sm:max-w-none " +
        (dimmed ? "opacity-75" : "opacity-100")
      }
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 10px)" }}
      aria-busy={loading}
    >
      {tabs.map((t) => {
        const active = t.isActive(pathname, intent);
        const isChatTab = t.key === "chat";
        const unread = isChatTab ? totalUnread : 0;
        const { Icon } = t;

        return (
          <Link
            key={t.key}
            href={t.href}
            prefetch
            className={`pressable relative flex min-h-[48px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 pt-1 text-[9px] font-medium tracking-wide transition-colors duration-ui sm:text-[10px] ${
              active ? "text-accent" : "text-muted"
            }`}
          >
            <span className="relative inline-flex">
              <Icon className="h-6 w-6 shrink-0" />
              {isChatTab && unread > 0 ? (
                <span
                  className="absolute -right-2 -top-1 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[10px] font-bold leading-none text-white shadow-[0_0_0_2px_rgba(14,17,20,0.95)]"
                  aria-label={`Непрочитанных сообщений: ${unread}`}
                >
                  {formatUnreadBadge(unread)}
                </span>
              ) : null}
            </span>
            <span className="leading-tight">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function BottomNavFallback() {
  return (
    <nav
      className="fixed bottom-0 left-1/2 z-50 flex h-[64px] w-full max-w-lg -translate-x-1/2 items-center justify-around border-t border-line bg-elevated/90 backdrop-blur-xl safe-pb sm:max-w-none"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 10px)" }}
      aria-hidden
    />
  );
}

export function BottomNav() {
  return (
    <Suspense fallback={<BottomNavFallback />}>
      <BottomNavInner />
    </Suspense>
  );
}

export default BottomNav;
