"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";

const SIDEBAR_YOK = ["/login", "/register", "/reset-password"];

export default function LayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const sidebarGoster = !SIDEBAR_YOK.includes(pathname);

  if (!sidebarGoster) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-x-hidden pt-14 pb-20 lg:pt-0 lg:pb-0">
        {children}
      </main>
    </div>
  );
}
