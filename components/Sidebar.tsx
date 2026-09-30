"use client";

import { useState, useEffect } from "react";
import { useYetki, yetkiOnbelleginiTemizle } from "@/lib/useYetki";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard, Wallet, ClipboardList, Users, Settings, LogOut,
  Utensils, BarChart3, Menu, X, Building2, FileText, ChevronDown,
  Package, TrendingUp, ChefHat, CalendarCheck, Sparkles, ShieldCheck
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { YetkiAnahtari } from "@/lib/yetki";

interface MenuOgesi { name: string; icon: LucideIcon; href: string; izin?: YetkiAnahtari | "tam_yetkili" }

const MENU: { ust: MenuOgesi[]; finans: MenuOgesi[]; alt: MenuOgesi[]; mobil: MenuOgesi[] } = {
  ust: [
    { name: "Anasayfa", icon: LayoutDashboard, href: "/", izin: "anasayfa" },
    { name: "Kasa Raporu", icon: ClipboardList, href: "/raporlar", izin: "rapor_gir" },
    { name: "Rapor Analizi", icon: BarChart3, href: "/rapor-analiz", izin: "rapor_analiz" },
    { name: "Kâr / Zarar", icon: TrendingUp, href: "/kar-zarar", izin: "kar_zarar" },
    { name: "Stok", icon: Package, href: "/stok", izin: "stok" },
    { name: "Reçete & Maliyet", icon: ChefHat, href: "/stok/recete", izin: "recete" },
    { name: "Personel", icon: Users, href: "/personel", izin: "personel" },
    { name: "Puantaj", icon: CalendarCheck, href: "/puantaj", izin: "puantaj" },
  ],
  // "Kasa & Finans" grubu; hiçbiri görünmüyorsa grup gizlenir.
  finans: [
    { name: "Kasa", icon: Wallet, href: "/kasa", izin: "kasa" },
    { name: "Cariler", icon: Building2, href: "/cariler", izin: "cari" },
    { name: "Faturalar", icon: FileText, href: "/faturalar", izin: "cari" },
  ],
  alt: [
    { name: "Ayarlar", icon: Settings, href: "/ayarlar" },
    { name: "Yenilikler", icon: Sparkles, href: "/yenilikler" },
  ],
  mobil: [
    { name: "Anasayfa", icon: LayoutDashboard, href: "/", izin: "anasayfa" },
    { name: "Kasa Raporu", icon: ClipboardList, href: "/raporlar", izin: "rapor_gir" },
    { name: "Stok", icon: Package, href: "/stok", izin: "stok" },
    { name: "Personel", icon: Users, href: "/personel", izin: "personel" },
    { name: "Puantaj", icon: CalendarCheck, href: "/puantaj", izin: "puantaj" },
    { name: "Kasa", icon: Wallet, href: "/kasa", izin: "kasa" },
    { name: "Cariler", icon: Building2, href: "/cariler", izin: "cari" },
    { name: "Kâr / Zarar", icon: TrendingUp, href: "/kar-zarar", izin: "kar_zarar" },
    { name: "Rapor Analizi", icon: BarChart3, href: "/rapor-analiz", izin: "rapor_analiz" },
  ],
};

/** Ayarlar'ın alt sayfaları (menüde Ayarlar'ın altında girintili). */
function ayarAltMenuler(tamYetkili: boolean): MenuOgesi[] {
  return tamYetkili ? [{ name: "Yetkilendirme", icon: ShieldCheck, href: "/ayarlar/yetkiler", izin: "tam_yetkili" }] : [];
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  // Rol ve yetkiler profiles tablosundan okunur. Sayfa erişimi ayrıca sunucu
  // tarafında (proxy.ts) ve veritabanında (RLS) korunur.
  const yetki = useYetki();
  const isAdmin = yetki.tamYetkili;
  const loading = yetki.yukleniyor;
  const [drawerAcik, setDrawerAcik] = useState(false);
  const [kasaAcik, setKasaAcik] = useState(false);

  useEffect(() => { setDrawerAcik(false); }, [pathname]);

  useEffect(() => {
    if (pathname.startsWith("/kasa") || pathname.startsWith("/cariler") || pathname.startsWith("/faturalar")) {
      setKasaAcik(true);
    }
  }, [pathname]);

  const handleSignOut = async () => {
    yetkiOnbelleginiTemizle();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  // TEK menü tanımı: her öğe gereken yetkiyle. `izin` yoksa herkese açık,
  // "tam_yetkili" ise sadece Tam Yetkili görür.
  const gorunur = (m: MenuOgesi) =>
    !m.izin ? true : m.izin === "tam_yetkili" ? isAdmin : yetki.izin(m.izin);

  const menuItems = MENU.ust.filter(gorunur);
  const kasaAltMenuler = MENU.finans.filter(gorunur);
  const altMenuItems = MENU.alt.filter(gorunur);

  // Mobil alt çubuk: ilk 4 izinli öğe + Ayarlar.
  const bottomNavItems = [
    ...MENU.mobil.filter(gorunur).slice(0, 4),
    { name: "Ayarlar", icon: Settings, href: "/ayarlar" },
  ];
  const rolYazisi = isAdmin ? "Yönetici" : "Yetkili kullanıcı";

  const eslesir = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
  // En uzun eşleşen menü adresi aktif sayılır (/stok/recete açıkken "Stok" değil
  // "Reçete & Maliyet" seçili görünsün).
  const aktifHref = [...menuItems, ...kasaAltMenuler, ...altMenuItems, ...bottomNavItems, ...ayarAltMenuler(isAdmin)]
    .map(m => m.href).filter(eslesir).sort((a, b) => b.length - a.length)[0];
  const isActive = (href: string) => href === aktifHref;

  const kasaGrubuAktif = kasaAltMenuler.some(m => isActive(m.href));

  if (loading) return (
    <>
      <div className="hidden lg:block w-64 bg-[#ffffff] border-r border-[#e2e5eb] h-screen sticky top-0 shrink-0" />
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-[#f4f5f7] border-b border-[#e2e5eb] z-50" />
      <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#ffffff] border-t border-[#e2e5eb] z-50" />
    </>
  );

  return (
    <>
      {/* ─── DESKTOP SIDEBAR ─── */}
      <aside className="hidden lg:flex w-64 bg-[#ffffff] border-r border-[#e2e5eb] h-screen sticky top-0 flex-col text-[#1a1f2e] shrink-0">
        <div className="p-5 flex items-center gap-3 border-b border-[#e2e5eb]">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/40">
            <Utensils className="h-5 w-5 text-white" />
          </div>
          <span className="font-black text-base tracking-tight">
            KEBO<span className="text-blue-700">.</span>ERP
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1 mt-2 overflow-y-auto">
          {menuItems.map((item) => (
            <Link key={item.name} href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm group",
                isActive(item.href)
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20"
                  : "text-gray-500 hover:bg-black/[0.04] hover:text-[#1a1f2e]"
              )}>
              <item.icon className={cn("h-4 w-4 shrink-0",
                isActive(item.href) ? "text-white" : "text-gray-600 group-hover:text-blue-600"
              )} />
              <span className="font-medium">{item.name}</span>
            </Link>
          ))}

          {/* ── KASA GRUBU ── */}
          {kasaAltMenuler.length > 0 && (
            <div>
              <button onClick={() => setKasaAcik(!kasaAcik)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all text-sm group",
                  kasaGrubuAktif
                    ? "bg-blue-600/20 text-blue-600"
                    : "text-gray-500 hover:bg-black/[0.04] hover:text-[#1a1f2e]"
                )}>
                <div className="flex items-center gap-3">
                  <Wallet className={cn("h-4 w-4 shrink-0", kasaGrubuAktif ? "text-blue-600" : "text-gray-600 group-hover:text-blue-600")} />
                  <span className="font-medium">Kasa & Finans</span>
                </div>
                <ChevronDown size={13} className={cn("transition-transform duration-200", kasaAcik ? "rotate-180" : "")} />
              </button>

              {kasaAcik && (
                <div className="ml-4 mt-1 space-y-1 border-l border-[#e2e5eb] pl-3">
                  {kasaAltMenuler.map(item => (
                    <Link key={item.name} href={item.href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-sm group",
                        isActive(item.href)
                          ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20"
                          : "text-gray-500 hover:bg-black/[0.04] hover:text-[#1a1f2e]"
                      )}>
                      <item.icon className={cn("h-3.5 w-3.5 shrink-0",
                        isActive(item.href) ? "text-white" : "text-gray-600 group-hover:text-blue-600"
                      )} />
                      <span className="font-medium text-xs">{item.name}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {altMenuItems.map((item) => (
            <Link key={item.name} href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm group",
                isActive(item.href)
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20"
                  : "text-gray-500 hover:bg-black/[0.04] hover:text-[#1a1f2e]"
              )}>
              <item.icon className={cn("h-4 w-4 shrink-0",
                isActive(item.href) ? "text-white" : "text-gray-600 group-hover:text-blue-600"
              )} />
              <span className="font-medium">{item.name}</span>
            </Link>
          ))}
          {ayarAltMenuler(isAdmin).map(item => (
            <Link key={item.name} href={item.href}
              className={cn(
                "ml-4 flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-sm group",
                isActive(item.href)
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20"
                  : "text-gray-500 hover:bg-black/[0.04] hover:text-[#1a1f2e]"
              )}>
              <item.icon className={cn("h-3.5 w-3.5 shrink-0",
                isActive(item.href) ? "text-white" : "text-gray-600 group-hover:text-blue-600"
              )} />
              <span className="font-medium text-xs">{item.name}</span>
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-[#e2e5eb]">
          <p className="px-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold border-b border-[#e2e5eb] pb-3 mb-2">
            {rolYazisi}{yetki.adSoyad ? ` · ${yetki.adSoyad}` : ""}
          </p>
          <button onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 w-full text-gray-500 hover:bg-red-500/10 hover:text-red-600 rounded-xl transition-colors text-sm">
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="font-medium">Çıkış Yap</span>
          </button>
        </div>
      </aside>

      {/* ─── MOBİL TOP BAR ─── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-[#f4f5f7]/96 backdrop-blur-xl border-b border-[#e2e5eb] px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
            <Utensils className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-black text-sm">KEBO<span className="text-blue-700">.</span>ERP</span>
        </div>
        <button onClick={() => setDrawerAcik(true)}
          className="p-2 text-gray-500 hover:text-[#1a1f2e] border border-[#e2e5eb] rounded-xl transition-colors">
          <Menu size={16} />
        </button>
      </div>

      {/* ─── MOBİL DRAWER ─── */}
      {drawerAcik && (
        <>
          <div className="lg:hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
            onClick={() => setDrawerAcik(false)} />
          <div className="lg:hidden fixed top-0 right-0 bottom-0 w-72 bg-[#ffffff] border-l border-[#e2e5eb] z-50 flex flex-col">
            <div className="h-14 px-4 flex items-center justify-between border-b border-[#e2e5eb]">
              <span className="text-xs text-gray-600 uppercase tracking-widest font-semibold">
                {rolYazisi}
              </span>
              <button onClick={() => setDrawerAcik(false)}
                className="p-1.5 text-gray-600 hover:text-[#1a1f2e] border border-[#e2e5eb] rounded-lg transition-colors">
                <X size={14} />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {menuItems.map((item) => (
                <Link key={item.name} href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all text-sm",
                    isActive(item.href) ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-black/[0.04] hover:text-[#1a1f2e]"
                  )}>
                  <item.icon className={cn("h-5 w-5 shrink-0", isActive(item.href) ? "text-white" : "text-gray-600")} />
                  <span className="font-medium">{item.name}</span>
                </Link>
              ))}
              {kasaAltMenuler.length > 0 && (
                <div>
                  <button onClick={() => setKasaAcik(!kasaAcik)}
                    className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-sm text-gray-400 hover:bg-black/[0.04] hover:text-[#1a1f2e] transition-colors">
                    <div className="flex items-center gap-3">
                      <Wallet className="h-5 w-5 shrink-0 text-gray-600" />
                      <span className="font-medium">Kasa & Finans</span>
                    </div>
                    <ChevronDown size={13} className={cn("transition-transform", kasaAcik ? "rotate-180" : "")} />
                  </button>
                  {kasaAcik && (
                    <div className="ml-4 border-l border-[#e2e5eb] pl-3 space-y-1">
                      {kasaAltMenuler.map(item => (
                        <Link key={item.name} href={item.href}
                          className={cn(
                            "flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm",
                            isActive(item.href) ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-black/[0.04] hover:text-[#1a1f2e]"
                          )}>
                          <item.icon className={cn("h-4 w-4 shrink-0", isActive(item.href) ? "text-white" : "text-gray-600")} />
                          <span className="font-medium text-xs">{item.name}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {altMenuItems.map((item) => (
                <Link key={item.name} href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all text-sm",
                    isActive(item.href) ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-black/[0.04] hover:text-[#1a1f2e]"
                  )}>
                  <item.icon className={cn("h-5 w-5 shrink-0", isActive(item.href) ? "text-white" : "text-gray-600")} />
                  <span className="font-medium">{item.name}</span>
                </Link>
              ))}
              {ayarAltMenuler(isAdmin).map(item => (
                <Link key={item.name} href={item.href}
                  className={cn(
                    "ml-4 flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm",
                    isActive(item.href) ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-black/[0.04] hover:text-[#1a1f2e]"
                  )}>
                  <item.icon className={cn("h-4 w-4 shrink-0", isActive(item.href) ? "text-white" : "text-gray-600")} />
                  <span className="font-medium text-xs">{item.name}</span>
                </Link>
              ))}
            </nav>
            <div className="p-3 border-t border-[#e2e5eb]">
              <button onClick={handleSignOut}
                className="flex items-center gap-3 px-4 py-3.5 w-full text-gray-400 hover:bg-red-500/10 hover:text-red-600 rounded-xl transition-colors text-sm">
                <LogOut className="h-5 w-5 shrink-0" />
                <span className="font-medium">Çıkış Yap</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* ─── MOBİL BOTTOM NAV ─── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#ffffff]/96 backdrop-blur-xl border-t border-[#e2e5eb] px-2 h-16 flex items-center justify-around">
        {bottomNavItems.map((item) => (
          <Link key={item.name} href={item.href}
            className={cn(
              "flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all",
              eslesir(item.href) ? "text-blue-600" : "text-gray-600"
            )}>
            <item.icon className="h-5 w-5" />
            <span className="text-[9px] font-bold uppercase tracking-wider">{item.name}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
