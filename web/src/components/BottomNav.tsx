"use client";

import { IconChat, IconHome, IconPlus, IconUser } from "@/components/NavIcons";
import { useAuth } from "@/context/auth-context";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";

const tabs = [
  { href: "/", label: "Лента", Icon: IconHome },
  { href: "/create", label: "Создать", Icon: IconPlus },
  { href: "/chat", label: "Чаты", Icon: IconChat },
  { href: "/profile", label: "Профиль", Icon: IconUser },
] as const;

export function BottomNav() {
  const { session, loading } = useAuth();
  const pathname = usePathname();

  const onTabClick = (e: MouseEvent<HTMLAnchorElement>, href: string) => {
    // Жёсткий переход для стабильности: если клиентская навигация/префетч залипли,
    // профиль всё равно откроется.
    if (href === "/profile") {
      e.preventDefault();
      window.location.assign("/profile");
    }
  };

  if (loading) return null;
  if (!session?.user) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex h-[64px] items-stretch justify-around border-t border-line bg-elevated/90 backdrop-blur-xl safe-pb md:left-1/2 md:max-w-md md:-translate-x-1/2"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 10px)" }}
    >
      {tabs.map((t) => {
        const active =
          t.href === "/chat"
            ? pathname === "/chat" || pathname.startsWith("/chat/")
            : pathname === t.href || (t.href !== "/" && pathname.startsWith(t.href));
        const { Icon } = t;
        return (
          <Link
            key={t.href}
            href={t.href}
            prefetch={false}
            onClick={(e) => onTabClick(e, t.href)}
            className={`pressable flex min-h-[48px] min-w-[52px] flex-1 flex-col items-center justify-center gap-1 pt-1 text-[10px] font-medium tracking-wide transition-colors duration-ui ${
              active ? "text-accent" : "text-muted"
            }`}
          >
            <Icon className="h-6 w-6" />
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
