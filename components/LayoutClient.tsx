"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import SorunBildir from "@/components/SorunBildir";
import { hataKaydet } from "@/lib/hataKaydi";

const SIDEBAR_YOK = ["/login", "/register", "/reset-password"];

export default function LayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const sidebarGoster = !SIDEBAR_YOK.includes(pathname);

  useEffect(() => {
    const hataDinle = (e: ErrorEvent) => {
      hataKaydet(e.error ?? e.message, { tur: "error", kaynak: e.filename, satir: e.lineno, sutun: e.colno });
    };
    const reddDinle = (e: PromiseRejectionEvent) => {
      hataKaydet(e.reason ?? "Yakalanmamış promise reddi", { tur: "unhandledrejection" });
    };
    window.addEventListener("error", hataDinle);
    window.addEventListener("unhandledrejection", reddDinle);
    return () => {
      window.removeEventListener("error", hataDinle);
      window.removeEventListener("unhandledrejection", reddDinle);
    };
  }, []);

  if (!sidebarGoster) return <>{children}</>;

  return (
    <div className="flex min-h-screen bg-[#0b0d0f]">
      <Sidebar />
      <main className="relative flex-1 min-w-0 overflow-x-hidden pt-14 pb-20 lg:pt-0 lg:pb-0">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8, filter: "blur(3px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -5, filter: "blur(2px)" }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="min-h-screen"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
      <SorunBildir />
    </div>
  );
}
