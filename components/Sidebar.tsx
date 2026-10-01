"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Wallet, LogOut, Menu, X, ChevronDown, Search, Settings } from "lucide-react";
import { useYetki, yetkiOnbelleginiTemizle } from "@/lib/useYetki";
import { createClient } from "@/lib/supabase/client";
import { MENU, MOBIL_SIRA, sayfaBul, type MenuOgesi } from "@/lib/menu";
import { cn } from "@/lib/utils";
import KeboLogo from "@/components/kabuk/KeboLogo";
import { aramayiAc } from "@/components/kabuk/KomutPaleti";

function basHarfler(ad: string) {
  const p = ad.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "K") + (p.length > 1 ? p[p.length - 1][0] : "")).toLocaleUpperCase("tr");
}

/** Tek menü satırı. Aktif satırın altın zemini sayfalar arasında kayarak geçer. */
function MenuSatiri({ item, aktif, kucuk, kimlik, onClick }: {
  item: MenuOgesi; aktif: boolean; kucuk?: boolean; kimlik: string; onClick?: () => void;
}) {
  return (
    <Link href={item.href} onClick={onClick}
      className={cn("relative flex items-center gap-3 rounded-xl transition-colors group",
        kucuk ? "px-3 py-2 text-[13px]" : "px-3.5 py-2.5 text-sm",
        aktif ? "text-[#fff6e3]" : "text-gray-600 hover:text-yazi")}>
      {aktif && (
        <motion.span layoutId={kimlik} transition={{ type: "spring", stiffness: 500, damping: 38 }}
          className="absolute inset-0 rounded-xl border border-altin/45 bg-gradient-to-r from-altin/30 via-altin/15 to-altin/5 shadow-[0_0_24px_-6px_rgba(217,184,102,0.55),inset_0_1px_0_rgba(255,255,255,0.12)]">
          <span className="absolute inset-0 rounded-xl kebo-parilti opacity-60" />
        </motion.span>
      )}
      {!aktif && <span className="absolute inset-0 rounded-xl bg-white/0 group-hover:bg-white/[0.04] transition-colors" />}
      <item.icon className={cn("relative shrink-0 transition-all duration-300",
        kucuk ? "h-4 w-4" : "h-[18px] w-[18px]",
        aktif ? "text-altin-acik" : "text-gray-500 group-hover:text-altin group-hover:scale-110")}
        strokeWidth={aktif ? 2.2 : 1.9} />
      <span className={cn("relative", aktif ? "font-semibold" : "font-medium")}>{item.name}</span>
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  // Rol ve yetkiler profiles tablosundan okunur. Sayfa erişimi ayrıca sunucu
  // tarafında (proxy.ts) ve veritabanında (RLS) korunur.
  const yetki = useYetki();
  const isAdmin = yetki.tamYetkili;
  const [drawerAcik, setDrawerAcik] = useState(false);
  const [kasaAcik, setKasaAcik] = useState(false);

  useEffect(() => { setDrawerAcik(false); }, [pathname]);
  useEffect(() => {
    if (pathname.startsWith("/kasa") || pathname.startsWith("/cariler") || pathname.startsWith("/faturalar")) setKasaAcik(true);
  }, [pathname]);

  const handleSignOut = async () => {
    yetkiOnbelleginiTemizle();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const gorunur = (m: MenuOgesi) =>
    !m.izin ? true : m.izin === "tam_yetkili" ? isAdmin : yetki.izin(m.izin);

  const menuItems = MENU.ust.filter(gorunur);
  const kasaAltMenuler = MENU.finans.filter(gorunur);
  const altMenuItems = MENU.alt.filter(gorunur);
  const ayarAlt = MENU.ayarAlt.filter(gorunur);
  const tumMenu = [...menuItems, ...kasaAltMenuler, ...altMenuItems, ...ayarAlt];

  // Mobil alt çubuk: ilk 4 izinli öğe + Ayarlar.
  const bottomNavItems = [
    ...MOBIL_SIRA.map(h => tumMenu.find(m => m.href === h)).filter((m): m is MenuOgesi => !!m).slice(0, 4),
    MENU.alt[0],
  ];
  const rolYazisi = isAdmin ? "Yönetici" : "Yetkili kullanıcı";
  const adSoyad = yetki.adSoyad || "KEBO";

  const aktifHref = sayfaBul(pathname)?.href;
  const isActive = (href: string) => href === aktifHref;
  const kasaGrubuAktif = kasaAltMenuler.some(m => isActive(m.href));

  if (yetki.yukleniyor) return (
    <>
      <div className="hidden lg:block w-[264px] bg-kart/60 border-r border-cizgi h-screen sticky top-0 shrink-0" />
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-zemin border-b border-cizgi z-50" />
      <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-kart border-t border-cizgi z-50" />
    </>
  );

  const menuGovdesi = (mobil: boolean) => {
    const kimlik = mobil ? "menu-aktif-mobil" : "menu-aktif";
    const kapat = mobil ? () => setDrawerAcik(false) : undefined;
    return (
      <>
        {menuItems.map(item => <MenuSatiri key={item.href} item={item} aktif={isActive(item.href)} kimlik={kimlik} onClick={kapat} />)}

        {kasaAltMenuler.length > 0 && (
          <div>
            <button onClick={() => setKasaAcik(!kasaAcik)}
              className={cn("w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-colors text-sm group",
                kasaGrubuAktif ? "text-altin-acik" : "text-gray-600 hover:text-yazi hover:bg-white/[0.04]")}>
              <span className="flex items-center gap-3">
                <Wallet className={cn("h-[18px] w-[18px] shrink-0 transition-all duration-300", kasaGrubuAktif ? "text-altin" : "text-gray-500 group-hover:text-altin group-hover:scale-110")} strokeWidth={1.9} />
                <span className="font-medium">Kasa & Finans</span>
              </span>
              <ChevronDown size={14} className={cn("transition-transform duration-300", kasaAcik ? "rotate-180" : "")} />
            </button>
            <AnimatePresence initial={false}>
              {kasaAcik && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }} className="overflow-hidden">
                  <div className="ml-[22px] mt-1 mb-1 space-y-0.5 border-l border-cizgi pl-3">
                    {kasaAltMenuler.map(item => <MenuSatiri key={item.href} item={item} aktif={isActive(item.href)} kucuk kimlik={kimlik} onClick={kapat} />)}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {altMenuItems.map(item => (
          <div key={item.href}>
            <MenuSatiri item={item} aktif={isActive(item.href)} kimlik={kimlik} onClick={kapat} />
            {/* Ayarlar'ın alt sayfaları hemen altında */}
            {item.href === "/ayarlar" && ayarAlt.length > 0 && (
              <div className="ml-[22px] space-y-0.5 border-l border-cizgi pl-3">
                {ayarAlt.map(a => <MenuSatiri key={a.href} item={a} aktif={isActive(a.href)} kucuk kimlik={kimlik} onClick={kapat} />)}
              </div>
            )}
          </div>
        ))}
      </>
    );
  };

  const kullaniciKarti = (
    <div className="flex items-center gap-3 rounded-2xl border border-cizgi bg-white/[0.02] p-2.5">
      <div className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold text-altin-acik border border-altin/30 bg-gradient-to-br from-altin/25 to-altin/5 shrink-0">
        {basHarfler(adSoyad)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-yazi truncate">{adSoyad}</p>
        <p className="text-[11px] text-gray-500">{rolYazisi}</p>
      </div>
      <Link href="/profil" title="Profil" className="p-2 rounded-lg text-gray-500 hover:text-altin hover:bg-white/[0.05] transition-colors">
        <Settings className="h-4 w-4" />
      </Link>
      <button onClick={handleSignOut} title="Çıkış yap" className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <>
      {/* ─── MASAÜSTÜ KENAR MENÜ ─── */}
      <aside className="hidden lg:flex w-[264px] h-screen sticky top-0 flex-col shrink-0 border-r border-cizgi bg-gradient-to-b from-[#121212] via-[#0f0f10] to-[#0c0c0d] relative overflow-hidden">
        {/* altın ışık */}
        <div className="pointer-events-none absolute -top-24 -left-20 w-72 h-72 rounded-full bg-altin/10 blur-3xl" />
        <div className="relative px-5 pt-6 pb-4">
          <Link href="/" className="block w-fit"><KeboLogo /></Link>
        </div>
        <div className="relative px-3 pb-3">
          <button onClick={aramayiAc}
            className="w-full flex items-center gap-2.5 h-10 px-3 rounded-xl border border-cizgi bg-white/[0.03] text-gray-500 hover:text-gray-700 hover:border-cizgi-guclu transition-colors text-[13px]">
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">Menüde ara…</span>
            <kbd className="text-[10px] font-semibold border border-cizgi rounded-md px-1.5 py-0.5">Ctrl K</kbd>
          </button>
        </div>
        <nav className="relative flex-1 px-3 pb-3 space-y-0.5 overflow-y-auto">
          {menuGovdesi(false)}
        </nav>
        <div className="relative p-3 border-t border-cizgi">{kullaniciKarti}</div>
      </aside>

      {/* ─── MOBİL ÜST ÇUBUK ─── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-zemin/90 backdrop-blur-xl border-b border-cizgi px-4 h-14 flex items-center justify-between">
        <Link href="/"><KeboLogo boyut="kucuk" /></Link>
        <div className="flex items-center gap-1">
          <button onClick={aramayiAc} aria-label="Ara" className="p-2.5 text-gray-700 hover:text-altin transition-colors">
            <Search size={20} />
          </button>
          <button onClick={() => setDrawerAcik(true)} aria-label="Menü" className="p-2.5 text-gray-700 hover:text-altin transition-colors">
            <Menu size={20} />
          </button>
        </div>
      </div>

      {/* ─── MOBİL ÇEKMECE ─── */}
      <AnimatePresence>
        {drawerAcik && (
          <>
            <motion.div className="lg:hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-[60]"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDrawerAcik(false)} />
            <motion.div className="lg:hidden fixed top-0 right-0 bottom-0 w-[290px] bg-[#0f0f10] border-l border-cizgi z-[61] flex flex-col"
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}>
              <div className="h-14 px-4 flex items-center justify-between border-b border-cizgi">
                <KeboLogo boyut="kucuk" />
                <button onClick={() => setDrawerAcik(false)} aria-label="Kapat"
                  className="p-2 text-gray-600 hover:text-yazi border border-cizgi rounded-lg transition-colors">
                  <X size={16} />
                </button>
              </div>
              <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">{menuGovdesi(true)}</nav>
              <div className="p-3 border-t border-cizgi">{kullaniciKarti}</div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ─── MOBİL ALT MENÜ ─── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0f0f10]/95 backdrop-blur-xl border-t border-cizgi h-16 grid"
        style={{ gridTemplateColumns: `repeat(${bottomNavItems.length}, minmax(0, 1fr))`, paddingBottom: "env(safe-area-inset-bottom)" }}>
        {bottomNavItems.map(item => {
          const aktif = isActive(item.href);
          return (
            <Link key={item.href} href={item.href}
              className={cn("relative flex flex-col items-center justify-center gap-1 transition-colors", aktif ? "text-altin" : "text-gray-500")}>
              {aktif && <motion.span layoutId="alt-menu-aktif" className="absolute top-0 h-[3px] w-10 rounded-b-full bg-altin shadow-[0_0_12px_rgba(217,184,102,0.8)]" />}
              <motion.span animate={{ y: aktif ? -1 : 0, scale: aktif ? 1.08 : 1 }} transition={{ type: "spring", stiffness: 500, damping: 30 }}>
                <item.icon className="h-[21px] w-[21px]" strokeWidth={aktif ? 2.1 : 1.8} />
              </motion.span>
              <span className="text-[10px] font-medium tracking-wide">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
