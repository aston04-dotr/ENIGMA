"use client";

import { Suspense, useEffect, useReducer, type ComponentType, type ReactNode } from "react";
import {
  IconChat,
  IconHome,
  IconPlus,
  IconRotateCw,
  IconSearch,
  IconUser,
} from "@/components/NavIcons";
import { useAuth } from "@/context/auth-context";
import { useChatUnread } from "@/context/chat-unread-context";
import { useTheme } from "@/context/theme-context";
import { trackEvent } from "@/lib/analytics";
import {
  bumpSyncBadgeExtraAfterStaleAway,
  getSyncBadgeStoredExtra,
  runDeepApplicationSync,
  SYNC_BADGE_CHANGED_EVENT,
} from "@/lib/deepSyncReset";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type UiTheme = "light" | "dark";

type RouteTab = {
  kind: "route";
  key: string;
  href: string;
  label: ReactNode;
  Icon: ComponentType<{ className?: string }>;
  isActive: (pathname: string, intent: string | null) => boolean;
};

type SyncTab = { kind: "sync"; key: "sync" };

type NavEntry = RouteTab | SyncTab;

const navEntries: NavEntry[] = [
  {
    kind: "route",
    key: "feed",
    href: "/",
    label: "Лента",
    Icon: IconHome,
    isActive: (p) => p === "/",
  },
  {
    kind: "route",
    key: "wanted",
    href: "/wanted",
    label: "Поиск",
    Icon: IconSearch,
    isActive: (p) => p === "/wanted",
  },
  { kind: "sync", key: "sync" },
  {
    kind: "route",
    key: "create",
    href: "/create",
    label: "Создать",
    Icon: IconPlus,
    isActive: (p) => p === "/create" || p.startsWith("/create/"),
  },
  {
    kind: "route",
    key: "chat",
    href: "/chat",
    label: "Чаты",
    Icon: IconChat,
    isActive: (p) => p === "/chat" || p.startsWith("/chat/"),
  },
  {
    kind: "route",
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

function syncTabAccent(theme: UiTheme): string {
  return theme === "light" ? "text-[#0eaefe]" : "text-[#c8fbff]";
}

function BottomNavInner() {
  const { loading } = useAuth();
  const { theme } = useTheme();
  const { totalUnread } = useChatUnread();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const intent = searchParams.get("intent");
  const [, bumpBadgeRender] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    const onEvt = () => bumpBadgeRender();
    window.addEventListener(SYNC_BADGE_CHANGED_EVENT, onEvt);
    return () => window.removeEventListener(SYNC_BADGE_CHANGED_EVENT, onEvt);
  }, []);

  useEffect(() => {
    let lastHiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        lastHiddenAt = Date.now();
      } else if (lastHiddenAt > 0) {
        bumpSyncBadgeExtraAfterStaleAway(Date.now() - lastHiddenAt);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const chrome = navChrome(theme);

  const syncBadgeTotal = Math.min(99, totalUnread + getSyncBadgeStoredExtra());

  const handleDeepSync = () => {
    trackEvent("deep_sync_click", { path: pathname });
    runDeepApplicationSync();
  };

  const syncAccent = syncTabAccent(theme);

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
        if (entry.kind === "sync") {
          return (
            <button
              key={entry.key}
              type="button"
              onClick={handleDeepSync}
              className="pressable relative hidden min-h-[48px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 pt-1 text-[9px] font-semibold tracking-wide sm:text-[10px] md:flex"
              aria-label="Обновить: очистить кеш и перезагрузить приложение"
            >
              <span className={`relative inline-flex ${syncAccent}`}>
                <IconRotateCw className="h-6 w-6 shrink-0" />
                {syncBadgeTotal > 0 ? (
                  <span
                    className="absolute -right-2 -top-1 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[10px] font-bold leading-none text-white"
                    style={{ boxShadow: `0 0 0 2px ${chrome.badgeRing}` }}
                    aria-label={`К обновлению: ${syncBadgeTotal}`}
                  >
                    {formatUnreadBadge(syncBadgeTotal)}
                  </span>
                ) : null}
              </span>
              <span className={`leading-tight ${syncAccent}`}>Обновить</span>
            </button>
          );
        }

        const t = entry;
        const active = t.isActive(pathname, intent);
        const isChatTab = t.key === "chat";
        const unread = isChatTab ? totalUnread : 0;
        const { Icon } = t;
        const c = tabColors(theme, active);

        return (
          <Link
            key={t.key}
            href={t.href}
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
