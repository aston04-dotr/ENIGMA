import { BottomNav } from "@/components/BottomNav";
import { ShellGate } from "@/components/ShellGate";

export default function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ShellGate>
      <div className="pb-[calc(64px+env(safe-area-inset-bottom))]">
        {children}
      </div>
      <BottomNav />
    </ShellGate>
  );
}
