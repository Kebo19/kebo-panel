"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { yetkiOnbelleginiTemizle, useYetki } from "@/lib/useYetki";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, User, History, MessageSquareWarning, Sparkles, ChevronRight, ShieldCheck } from "lucide-react";

export default function AyarlarPage() {
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const { tamYetkili, izin } = useYetki();

  const kartlar = [
    ...(tamYetkili ? [
      { href: "/ayarlar/yetkiler", icon: ShieldCheck, baslik: "Yetkilendirme", aciklama: "Kullanıcı ekleme ve kişi bazında erişim yetkileri" },
    ] : []),
    ...(izin("yonetim") ? [
      { href: "/ayarlar/gecmis", icon: History, baslik: "İşlem geçmişi", aciklama: "Kim, neyi, ne zaman ekledi / değiştirdi / sildi" },
      { href: "/ayarlar/bildirimler", icon: MessageSquareWarning, baslik: "Sorun bildirimleri ve hata kayıtları", aciklama: "Kullanıcıların bildirdiği sorunlar ve sistem hataları" },
    ] : []),
    { href: "/yenilikler", icon: Sparkles, baslik: "Yenilikler", aciklama: "Panele eklenen son özellikler" },
  ];

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) setEmail(user.email);
    };
    getUser();
  }, []);

  const handleSignOut = async () => {
    yetkiOnbelleginiTemizle();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <main className="min-h-screen bg-zemin text-yazi p-5">
      <h1 className="text-2xl font-black pt-5 mb-6">Ayarlar</h1>

      <div className="max-w-lg space-y-4">

        {/* Hesap Bilgisi */}
        <div className="bg-kart border border-cizgi rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <User size={16} className="text-blue-400" />
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Hesap</p>
          </div>
          <p className="text-sm text-yazi font-semibold">{email}</p>
        </div>

        {/* Çıkış */}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 bg-kart border border-red-500/20 hover:border-red-500/40 hover:bg-red-500/5 text-red-400 rounded-2xl p-5 transition-colors text-sm font-semibold"
        >
          <LogOut size={16} />
          Çıkış Yap
        </button>

        {kartlar.map(k => (
          <Link key={k.href} href={k.href}
            className="flex items-center gap-4 bg-kart border border-cizgi hover:border-blue-500/25 rounded-2xl p-5 transition-colors">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
              <k.icon size={17} className="text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-yazi">{k.baslik}</p>
              <p className="text-[12px] text-gray-500">{k.aciklama}</p>
            </div>
            <ChevronRight size={16} className="text-gray-400 shrink-0" />
          </Link>
        ))}

      </div>
    </main>
  );
}
