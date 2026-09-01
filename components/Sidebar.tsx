"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard, Wallet, ClipboardList, Users, Settings, LogOut,
  Utensils, BarChart3, TrendingUp, Menu, X, Building2, FileText, ChevronDown,
  Package
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [drawerAcik, setDrawerAcik] = useState(false);
  const [kasaAcik, setKasaAcik] = useState(false);

  useEffect(() => {
    const yetkiKontrol = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email === "murat@kebo.com" || user?.email === "bulent@kebo.com") {
        setIsAdmin(true);
      }
      setLoading(false);
    };
    yetkiKontrol();
  }, []);

  useEffect(() => { setDrawerAcik(false); }, [pathname]);

  useEffect(() => {
    if (pathname.startsWith("/kasa") || pathname.startsWith("/cariler") || pathname.startsWith("/faturalar")) {
      setKasaAcik(true);
    }
  }, [pathname]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const menuItems = [
    ...(isAdmin ? [{ name: "Anasayfa", icon: LayoutDashboard, href: "/" }] : []),
    { name: "Kasa Raporu", icon: ClipboardList, href: "/raporlar" },
    ...(isAdmin ? [{ name: "Rapor Analizi", icon: BarChart3, href: "/rapor-analiz" }] : []),
    { name: "Stok", icon: Package, href: "/stok" },
    { name: "Personel", icon: Users, href: "/personel" },
    { name: "Ayarlar", icon: Settings, href: "/ayarlar" },
  ];

  const kasaAltMenuler = [
    { name: "Kasa", icon: Wallet, href: "/kasa" },
    { name: "Platform", icon: TrendingUp, href: "/platform-takip" },
    { name: "Cariler", icon: Building2, href: "/cariler" },
    { name: "Faturalar", icon: FileText, href: "/faturalar" },
  ];

  const bottomNavItems = [
    ...(isAdmin ? [{ name: "Anasayfa", icon: LayoutDashboard, href: "/" }] : []),
    { name: "Kasa Raporu", icon: ClipboardList, href: "/raporlar" },
    { name: "Stok", icon: Package, href: "/stok" },
    { name: "Personel", icon: Users, href: "/personel" },
    { name: "Ayarlar", icon: Settings, href: "/ayarlar" },
  ].slice(0, 5);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

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
          {isAdmin && (
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
        </nav>

        <div className="p-3 border-t border-[#e2e5eb]">
          <p className="px-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold border-b border-[#e2e5eb] pb-3 mb-2">
            {isAdmin ? "Yönetici" : "Şube Müdürü"}
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
                {isAdmin ? "Yönetici" : "Şube Müdürü"}
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
              {isAdmin && (
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
              isActive(item.href) ? "text-blue-600" : "text-gray-600"
            )}>
            <item.icon className="h-5 w-5" />
            <span className="text-[9px] font-bold uppercase tracking-wider">{item.name}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
