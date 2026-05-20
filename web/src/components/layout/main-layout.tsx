import { Sidebar } from "./sidebar";
import { cn } from "@/lib/utils";

interface MainLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function MainLayout({ children, className }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-background flex" data-testid="main-layout">
      <Sidebar />
      <div className="flex-1 ml-72">
        <main className={cn("w-full min-h-screen bg-background", className)}>
          {children}
        </main>
      </div>
    </div>
  );
}

// Also export as default for compatibility
export default MainLayout;
