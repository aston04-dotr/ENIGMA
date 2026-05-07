"use client";

import { Suspense, type ComponentType, type ReactNode } from "react";
import {
  IconChat,
  IconHome,
  IconPlus,
  IconSearch,
  IconUser,
} from "@/components/NavIcons";
import { useAuth } from "@/context/auth-context";
import { useChatUnread } from "@/context/chat-unread-context";
import { useTheme } from "@/context/theme-context";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type UiTheme = "light" | "dark";

type RouteTab = {
  key: string;
  href: string;
  label: ReactNode;
  Icon: ComponentType<{ className?: string }>;
  isActive: (pathname: string, intent: string | null) => boolean;
};

const navEntries: RouteTab[] = [
  {
    key: "feed",
    href: "/",
    label: "Лента",
    Icon: IconHome,
    isActive: (p) => p === "/",
  },
  {
    key: "wanted",
    href: "/wanted",
    label: "Поиск",
    Icon: IconSearch,
    isActive: (p) => p === "/wanted",
  },
  {
    key: "create",
    href: "/create",
    label: "Создать",
    Icon: IconPlus,
    isActive: (p) => p === "/create" || p.startsWith("/create/"),
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

function navChrome(theme: UiTheme): { navClass: string; bg: string; badgeRing: string } {
  if (theme === "light") {
    return {
      navClass:
        "bottom-nav-root fixed bottom-0 left-1/2 z-50 flex h-[64px] w-full max-w-lg -translate-x-1/2 items-stretch justify-around border-t border-neutral-100 safe-pb view-mode-nav sm:max-w-none",
      bg: "#FFFFFF",
      badgeRing: "#FFFFFF",
    };
  }
  return {
    navClass:
      "bottom-nav-root fixed bottom-0 left-1/2 z-50 flex h-[64px] w-full max-w-lg -translate-x-1/2 items-stretch justify-around border-t border-transparent safe-pb view-mode-nav sm:max-w-none",
    bg: "#000000",
    badgeRing: "#000000",
  };
}

function tabColors(theme: UiTheme, active: boolean): { icon: string; label: string } {
  if (theme === "light") {
    return active
      ? { icon: "text-[#0eaefe]", label: "text-[#0eaefe]" }
      : {
          icon: "text-[#26b5ff]/88",
          label: "text-neutral-400",
        };
  }
  return active
    ? { icon: "text-[#c8fbff]", label: "text-[#c8fbff]" }
    : { icon: "text-[#72f3ff]/92", label: "text-[#72f3ff]/92" };
}

function BottomNavInner() {
  const { loading, session } = useAuth();
  const { theme } = useTheme();
  const { totalUnread, ready: chatReady } = useChatUnread();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const intent = searchParams.get("intent");

  const chrome = navChrome(theme);

  return (
    <nav
      className={chrome.navClass}
      style={{
        paddingBottom: "max(env(safe-area-inset-bottom), 10px)",
        backgroundColor: chrome.bg,
      }}
      aria-busy={loading}
    >
      {navEntries.map((entry) => {
        const t = entry;
        const isGuest = !session?.user;
        const href =
          isGuest && t.key === "create"
            ? "/login?reason=save_enigma&source=create_tab"
            : isGuest && t.key === "chat"
              ? "/login?reason=save_enigma&source=chat_tab"
            : isGuest && t.key === "profile"
              ? "/login?reason=save_enigma&source=profile_tab"
              : t.href;
        const active = t.isActive(pathname, intent);
        const isChatTab = t.key === "chat";
        const isProfileTab = t.key === "profile";
        const unread = isChatTab && chatReady ? totalUnread : 0;
        const profileUnreadDot = isProfileTab && chatReady && totalUnread > 0;
        const { Icon } = t;
        const c = tabColors(theme, active);

        return (
          <Link
            key={t.key}
            href={href}
            prefetch
            className={`pressable relative flex min-h-[48px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 pt-1 text-[9px] font-medium tracking-wide sm:text-[10px] ${
              active ? "font-semibold" : "font-normal"
            }`}
          >
            <span className={`relative inline-flex ${c.icon}`}>
              <Icon className={`h-6 w-6 shrink-0 ${c.icon}`} />
              {isChatTab && unread > 0 ? (
                <span
                  className="absolute -right-2 -top-1 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[10px] font-bold leading-none text-white"
                  style={{ boxShadow: `0 0 0 2px ${chrome.badgeRing}` }}
                  aria-label={`Непрочитанных сообщений: ${unread}`}
                >
                  {formatUnreadBadge(unread)}
                </span>
              ) : null}
              {profileUnreadDot ? (
                <span
                  className="absolute -right-1 -top-0.5 inline-flex h-[10px] w-[10px] rounded-full bg-[#FF3B30]"
                  style={{ boxShadow: `0 0 0 2px ${chrome.badgeRing}` }}
                  aria-label="Есть непрочитанные сообщения"
                />
              ) : null}
            </span>
            <span className={`leading-tight ${c.label}`}>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function BottomNavFallback() {
  return (
    <nav
      className="bottom-nav-root fixed bottom-0 left-1/2 z-50 flex h-[64px] w-full max-w-lg -translate-x-1/2 items-center justify-around border-t border-transparent safe-pb sm:max-w-none"
      style={{
        paddingBottom: "max(env(safe-area-inset-bottom), 10px)",
        backgroundColor: "#000000",
      }}
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
