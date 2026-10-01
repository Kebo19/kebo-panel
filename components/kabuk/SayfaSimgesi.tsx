"use client";

import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Circle } from "lucide-react";
import { sayfaBul, type MenuOgesi } from "@/lib/menu";
import { cn } from "@/lib/utils";

/**
 * Sayfanın menüdeki simgesi, menüdeki rengiyle. Bütün sayfa başlıklarında ve
 * anasayfa kısayollarında aynı kutu kullanılır.
 */
export default function SayfaSimgesi({ sayfa, boyut = "orta", className }: {
  /** Verilmezse bulunulan adresten bulunur */
  sayfa?: MenuOgesi;
  boyut?: "kucuk" | "orta" | "buyuk";
  className?: string;
}) {
  const pathname = usePathname();
  const s = sayfa ?? sayfaBul(pathname);
  const Simge = s?.icon ?? Circle;
  const kutu = boyut === "kucuk" ? "w-8 h-8 rounded-[10px]" : boyut === "buyuk" ? "w-12 h-12 rounded-2xl" : "w-9 h-9 rounded-xl";
  const simge = boyut === "kucuk" ? "h-4 w-4" : boyut === "buyuk" ? "h-5 w-5" : "h-[18px] w-[18px]";
  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 22 }}
      className={cn("kebo-simge shrink-0", kutu, className)}
      style={{ color: s?.renk ?? "#d9b866" }}>
      <Simge className={simge} strokeWidth={2} />
    </motion.div>
  );
}
