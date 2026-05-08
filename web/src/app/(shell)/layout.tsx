import { BottomNav } from "@/components/BottomNav";
import { ShellGate } from "@/components/ShellGate";
import { SiteLegalFooter } from "@/components/SiteLegalFooter";

/**
 * Realtime/chat/presence авторизацию не поднимает здесь: гейты и hard reset → `/login`
 * в AuthProvider (`getSession`/singleton) и в ChatUnreadProvider (`isAuthCircuitOpen`).
 */

export default function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ShellGate>
      <div className="min-h-[100svh] bg-main">
        <div className="pb-[calc(104px+env(safe-area-inset-bottom))]">
          {children}
        </div>
        <SiteLegalFooter />
        <BottomNav />
      </div>
    </ShellGate>
  );
}
