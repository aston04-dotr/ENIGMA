"use client";

import type { ReactNode } from "react";
import { useViewMode } from "@/context/view-mode-context";
import { ViewModeSwitcher } from "@/components/ViewModeSwitcher";

type Props = {
  children: ReactNode;
  withBottomPadding?: boolean;
  className?: string;
};

const MODE_CLASS: Record<"mobile" | "tablet" | "desktop", string> = {
  mobile: "view-mode-mobile",
  tablet: "view-mode-tablet",
  desktop: "view-mode-desktop",
};

function join(...parts: Array<string | undefined | false>) {
  return parts.filter(Boolean).join(" ");
}

export function ViewModeLayout({ children, withBottomPadding = false, className }: Props) {
  const { mode } = useViewMode();

  return (
    <div className={join("view-mode-root", MODE_CLASS[mode])} data-view-mode={mode}>
      <div
        className={join(
          "view-mode-frame scroll-smooth min-h-[100dvh] bg-main",
          withBottomPadding && "pb-[calc(64px+env(safe-area-inset-bottom))]",
          className,
        )}
      >
        {children}
      </div>
      <ViewModeSwitcher />
    </div>
  );
}

export default ViewModeLayout;
