"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import Sidebar from "@/components/Sidebar";
import KomutPaleti from "@/components/kabuk/KomutPaleti";
import SorunBildir from "@/components/SorunBildir";
import { hataKaydet } from "@/lib/hataKaydi";

const SIDEBAR_YOK = ["/login", "/register", "/reset-password"];

export default function LayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const sidebarGoster = !SIDEBAR_YOK.includes(pathname);

  // Beklenmedik hatalar hata_kayitlari tablosuna yazılır (giriş yapılmışsa).
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

  if (!sidebarGoster) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-x-hidden pt-14 pb-20 lg:pt-0 lg:pb-0">
        {/* Sayfa geçişi: yeni sayfa hafifçe yukarı kayarak belirir */}
        <motion.div key={pathname} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}>
          {children}
        </motion.div>
      </main>
      <SorunBildir />
      <KomutPaleti />
    </div>
  );
}
