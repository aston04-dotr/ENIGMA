"use client";

import {
  Suspense,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
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

function navChrome(theme: UiTheme): { navClass: string; badgeRing: string } {
  if (theme === "light") {
    return {
      navClass:
        "bottom-nav-root fixed left-1/2 z-50 flex h-[64px] w-full max-w-lg -translate-x-1/2 items-stretch justify-around border-t border-[rgba(29,118,232,0.14)] safe-pb view-mode-nav sm:max-w-none",
      badgeRing: "rgba(255,255,255,0.92)",
    };
  }
  return {
    navClass:
      "bottom-nav-root fixed left-1/2 z-50 flex h-[64px] w-full max-w-lg -translate-x-1/2 items-stretch justify-around border-t border-[rgba(120,200,255,0.14)] safe-pb view-mode-nav sm:max-w-none",
    badgeRing: "rgba(12,12,12,0.9)",
  };
}

function tabColors(theme: UiTheme, active: boolean): { icon: string; label: string } {
  if (theme === "light") {
    return active
      ? { icon: "text-[#1d76e8]", label: "text-[#1d76e8]" }
      : { icon: "text-slate-500/88", label: "text-slate-500/90" };
  }
  return active
    ? { icon: "text-[#82c8ff]", label: "text-[#82c8ff]" }
    : { icon: "text-[#6b9cc9]/92", label: "text-[#6b9cc9]/92" };
}

function isActiveChatRoomPath(pathname: string): boolean {
  return /^\/chat\/[0-9a-f-]{36}$/i.test(pathname);
}

function BottomNavInner() {
  const { loading, session } = useAuth();
  const { theme } = useTheme();
  const { totalUnread, ready: chatReady } = useChatUnread();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const intent = searchParams.get("intent");
  const chatOwnerId = session?.user?.id ?? null;
  const unreadBaselineReadyRef = useRef(false);
  const prevUnreadAfterReadyRef = useRef(0);
  /** Инкремент только при реальном росте счётчика вне комнаты — remount включает одноразовую анимацию. */
  const [chatBadgePulseGen, setChatBadgePulseGen] = useState(0);

  useEffect(() => {
    unreadBaselineReadyRef.current = false;
    prevUnreadAfterReadyRef.current = 0;
    setChatBadgePulseGen(0);
  }, [chatOwnerId]);

  useEffect(() => {
    if (!chatReady) return;
    if (!unreadBaselineReadyRef.current) {
      unreadBaselineReadyRef.current = true;
      prevUnreadAfterReadyRef.current = totalUnread;
      return;
    }
    const prev = prevUnreadAfterReadyRef.current;
    prevUnreadAfterReadyRef.current = totalUnread;

    const inRoom = isActiveChatRoomPath(pathname);
    if (!inRoom && totalUnread > prev && totalUnread > 0) {
      setChatBadgePulseGen((n) => n + 1);
    }
  }, [chatReady, totalUnread, pathname]);

  const chrome = navChrome(theme);

  return (
    <nav
      className={chrome.navClass}
      style={{
        paddingBottom: "max(env(safe-area-inset-bottom), 10px)",
      }}
      aria-busy={loading}
    >
      {navEntries.map((entry) => {
        const t = entry;
        const isGuest = !session?.user;
        const href = (() => {
          if (!isGuest) return t.href;
          const returnEnc = encodeURIComponent(t.href);
          if (t.key === "create") return `/login?returnTo=${returnEnc}&source=guest_nav`;
          if (t.key === "chat") return `/login?returnTo=${returnEnc}&source=guest_nav`;
          if (t.key === "profile") return `/login?returnTo=${returnEnc}&source=guest_nav`;
          return t.href;
        })();
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
                  key={chatBadgePulseGen}
                  className={`absolute -right-2 -top-1 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[10px] font-bold leading-none text-white ${chatBadgePulseGen > 0 ? "animate-chatBadgePulseOnce" : ""}`}
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
      className="bottom-nav-root fixed left-1/2 z-50 flex h-[64px] w-full max-w-lg -translate-x-1/2 items-center justify-around border-t border-transparent safe-pb sm:max-w-none"
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
