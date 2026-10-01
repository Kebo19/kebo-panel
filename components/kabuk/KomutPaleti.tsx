"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Search, CornerDownLeft, ArrowUp, ArrowDown } from "lucide-react";
import { TUM_SAYFALAR, sadelestir, menuGorunurMu, type MenuOgesi } from "@/lib/menu";
import { useYetki } from "@/lib/useYetki";
import SayfaSimgesi from "@/components/kabuk/SayfaSimgesi";
import { cn } from "@/lib/utils";

/** Her yerden aramayı açmak için: window.dispatchEvent(new Event(ARAMA_AC)) */
export const ARAMA_AC = "kebo-arama-ac";
export const aramayiAc = () => window.dispatchEvent(new Event(ARAMA_AC));

/** Ctrl+K / ⌘K ile açılan sayfa arama penceresi. */
export default function KomutPaleti() {
  const router = useRouter();
  const yetki = useYetki();
  const [acik, setAcik] = useState(false);
  const [sorgu, setSorgu] = useState("");
  const [secili, setSecili] = useState(0);
  const girdi = useRef<HTMLInputElement>(null);
  const liste = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLocaleLowerCase("tr") === "k") {
        e.preventDefault();
        setAcik(a => !a);
      } else if (e.key === "Escape") setAcik(false);
    };
    const ac = () => setAcik(true);
    window.addEventListener("keydown", tus);
    window.addEventListener(ARAMA_AC, ac);
    return () => { window.removeEventListener("keydown", tus); window.removeEventListener(ARAMA_AC, ac); };
  }, []);

  useEffect(() => {
    if (acik) { setSorgu(""); setSecili(0); setTimeout(() => girdi.current?.focus(), 30); }
  }, [acik]);

  const gorunur = (m: MenuOgesi) => menuGorunurMu(m, yetki);

  const sonuclar = useMemo(() => {
    const q = sadelestir(sorgu.trim());
    const izinli = TUM_SAYFALAR.filter(gorunur);
    if (!q) return izinli;
    return izinli
      .map(m => {
        const ad = sadelestir(m.name);
        const puan = ad.startsWith(q) ? 3 : ad.includes(q) ? 2 : sadelestir(`${m.aciklama} ${m.anahtar ?? ""}`).includes(q) ? 1 : 0;
        return { m, puan };
      })
      .filter(x => x.puan > 0)
      .sort((a, b) => b.puan - a.puan)
      .map(x => x.m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorgu, yetki.tamYetkili, yetki.yetkiler, yetki.rol]);

  useEffect(() => {
    liste.current?.querySelector<HTMLElement>(`[data-sira="${secili}"]`)?.scrollIntoView({ block: "nearest" });
  }, [secili]);

  const git = (m?: MenuOgesi) => {
    if (!m) return;
    setAcik(false);
    router.push(m.href);
  };

  const girdiTus = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSecili(s => Math.min(s + 1, sonuclar.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSecili(s => Math.max(s - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); git(sonuclar[secili]); }
  };

  return (
    <AnimatePresence>
      {acik && (
        <motion.div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setAcik(false)} />
          <motion.div role="dialog" aria-label="Menüde ara"
            initial={{ opacity: 0, y: -12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }} transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="relative w-full max-w-xl kebo-kart overflow-hidden !rounded-2xl">
            <div className="flex items-center gap-3 px-4 h-14 border-b border-cizgi">
              <Search className="h-[18px] w-[18px] text-altin shrink-0" />
              <input ref={girdi} value={sorgu} onChange={e => { setSorgu(e.target.value); setSecili(0); }} onKeyDown={girdiTus}
                placeholder="Sayfa ara… (kasa, cari, kurye, fatura)"
                className="flex-1 bg-transparent outline-none text-[15px] text-yazi" />
              <kbd className="text-[10px] font-semibold text-gray-500 border border-cizgi rounded-md px-1.5 py-0.5">ESC</kbd>
            </div>
            <div ref={liste} className="max-h-[52vh] overflow-y-auto p-2">
              {sonuclar.length === 0 && (
                <p className="text-center text-sm text-gray-500 py-10">“{sorgu}” için sonuç yok</p>
              )}
              {sonuclar.map((m, i) => (
                <button key={m.href} data-sira={i} onMouseMove={() => setSecili(i)} onClick={() => git(m)}
                  className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors",
                    i === secili ? "bg-alan-2" : "hover:bg-alan")}>
                  <SayfaSimgesi sayfa={m} boyut="kucuk" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-yazi">{m.name}</span>
                    <span className="block text-[11px] text-gray-500 truncate">{m.aciklama}</span>
                  </span>
                  {i === secili && <CornerDownLeft className="h-4 w-4 text-altin" />}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-4 px-4 h-10 border-t border-cizgi text-[11px] text-gray-500">
              <span className="flex items-center gap-1"><ArrowUp size={12} /><ArrowDown size={12} /> seç</span>
              <span className="flex items-center gap-1"><CornerDownLeft size={12} /> aç</span>
              <span className="ml-auto">Ctrl + K</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
