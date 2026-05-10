import { BottomNav } from "@/components/BottomNav";
import { ShellGate } from "@/components/ShellGate";

/**
 * Ни Landing/ENIGMA, ни блокирующий auth-shell: контент страницы решат гейт сам.
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
