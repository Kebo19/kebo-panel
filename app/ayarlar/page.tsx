"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { LogOut, User, Shield } from "lucide-react";

export default function AyarlarPage() {
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState("");

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) setEmail(user.email);
    };
    getUser();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <main className="min-h-screen bg-[#f4f5f7] text-[#1a1f2e] p-5">
      <h1 className="text-2xl font-black pt-5 mb-6">Ayarlar</h1>

      <div className="max-w-lg space-y-4">

        {/* Hesap Bilgisi */}
        <div className="bg-[#ffffff] border border-[#e2e5eb] rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <User size={16} className="text-blue-600" />
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Hesap</p>
          </div>
          <p className="text-sm text-[#1a1f2e] font-semibold">{email}</p>
        </div>

        {/* Çıkış */}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 bg-[#ffffff] border border-red-500/20 hover:border-red-500/40 hover:bg-red-500/5 text-red-600 rounded-2xl p-5 transition-colors text-sm font-semibold"
        >
          <LogOut size={16} />
          Çıkış Yap
        </button>

      </div>
    </main>
  );
}
