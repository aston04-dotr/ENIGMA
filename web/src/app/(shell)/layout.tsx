import { BottomNav } from "@/components/BottomNav";
import { ShellGate } from "@/components/ShellGate";

/**
 * Chat/realtime не поднимают сессию: гейт в ShellGate + AuthProvider + мягкое восстановление
 * после wake (singleton), hard redirect на /login только после подтверждения на desktop.
 */

export default function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ShellGate>
      <div className="min-h-[100svh] bg-main">
        <div className="enigma-shell-pad pb-[calc(80px+env(safe-area-inset-bottom))]">
          {children}
        </div>
        <BottomNav />
      </div>
    </ShellGate>
  );
}
