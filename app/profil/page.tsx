"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ProfilPage() {
  const [profil, setProfil] = useState<{ full_name: string; role: string } | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const getProfil = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("profiles")
        .select("full_name, role")
        .eq("email", user.email)
        .single();

      setProfil(data);
    };
    getProfil();
  }, []);

  return (
    <main className="min-h-screen bg-[#111111] text-white p-5">
      <h1 className="text-3xl font-bold pt-5">Profil</h1>
      <div className="mt-6 bg-[#1c1c1c] rounded-2xl p-5">
        <p className="text-gray-400">Kullanıcı</p>
        <h2 className="text-2xl font-bold mt-2">
          {profil?.full_name ?? "Yükleniyor..."}
        </h2>
        <p className="text-gray-500 mt-2">
          Yetki: {profil?.role ?? ""}
        </p>
      </div>
    </main>
  );
}