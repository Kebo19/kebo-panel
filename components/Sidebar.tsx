"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { 
  LayoutDashboard, Wallet, ClipboardList, Users, Settings, LogOut,
  Utensils, PieChart, TrendingUp
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const yetkiKontrol = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email === 'murat@kebo.com' || user?.email === 'bulent@kebo.com') {
        setIsAdmin(true);
      }
      setLoading(false);
    };
    yetkiKontrol();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  if (loading) return <div className="w-64 bg-[#0f1219] border-r border-gray-800 h-screen sticky top-0"></div>;

  const menuItems = [
    ...(isAdmin ? [{ name: "Anasayfa", icon: LayoutDashboard, href: "/" }] : []),
    { name: "Günlük Kasa Raporu", icon: ClipboardList, href: "/raporlar" },
    ...(isAdmin ? [{ name: "Kasa Yönetimi", icon: Wallet, href: "/kasa" }] : []),
    ...(isAdmin ? [{ name: "Platform Takip", icon: TrendingUp, href: "/platform-takip" }] : []),
    { name: "Personeller", icon: Users, href: "/personel" }, // Doğru tekil yönlendirme
    { name: "Raporlar", icon: PieChart, href: "/rapor-analiz" },
    { name: "Ayarlar", icon: Settings, href: "/ayarlar" },
  ];

  return (
    <div className="w-64 bg-[#0f1219] border-r border-gray-800 h-screen sticky top-0 flex flex-col text-white">
      <div className="p-6 flex items-center gap-3 border-b border-gray-800">
        <div className="bg-blue-600 p-2 rounded-lg">
          <Utensils className="h-6 w-6 text-white" />
        </div>
        <span className="font-bold text-xl tracking-tight">KEBO PANEL</span>
      </div>

      <nav className="flex-1 p-4 space-y-2 mt-4">
        {menuItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group",
                isActive
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              )}
            >
              <item.icon className={cn("h-5 w-5", isActive ? "text-white" : "text-gray-500 group-hover:text-blue-400")} />
              <span className="font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <div className="px-4 pb-4 mb-4 border-b border-gray-800/50 text-xs text-gray-500 font-medium uppercase tracking-wider">
          Yetki: {isAdmin ? 'Yönetici (Patron)' : 'Şube Müdürü'}
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-4 py-3 w-full text-gray-400 hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-colors group"
        >
          <LogOut className="h-5 w-5 text-gray-500 group-hover:text-red-500" />
          <span className="font-medium">Çıkış Yap</span>
        </button>
      </div>
    </div>
  );
}