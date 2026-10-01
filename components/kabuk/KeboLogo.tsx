import Image from "next/image";
import { cn } from "@/lib/utils";

/** KEBO logosu (altın) + "PANEL" yazısı. Her yerde aynı. */
export default function KeboLogo({ boyut = "orta", panelYazisi = true, className }: {
  boyut?: "kucuk" | "orta" | "buyuk";
  panelYazisi?: boolean;
  className?: string;
}) {
  const g = boyut === "kucuk" ? 76 : boyut === "buyuk" ? 128 : 92;
  return (
    <div className={cn("flex items-center gap-3 select-none", className)}>
      <Image src="/kebo-logo-altin.png" alt="KEBO" width={g} height={Math.round(g * 534 / 800)} priority
        className="drop-shadow-[0_4px_18px_rgba(217,184,102,0.25)]" />
      {panelYazisi && (
        <>
          <span className="h-6 w-px bg-altin/30" />
          <span className={cn("font-semibold tracking-[0.45em] text-altin", boyut === "buyuk" ? "text-[13px]" : "text-[11px]")}>PANEL</span>
        </>
      )}
    </div>
  );
}
