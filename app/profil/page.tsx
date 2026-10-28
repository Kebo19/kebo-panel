"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { rolEtiketi, rolCoz } from "@/lib/yetki";
import { KeyRound, Loader2, Eye, EyeOff, AlertTriangle, CheckCircle2 } from "lucide-react";

interface Profil { full_name: string | null; role: string | null; email: string | null; sifre_degismeli: boolean }

export default function ProfilPage() {
  const [profil, setProfil] = useState<Profil | null>(null);
  const [eski, setEski] = useState("");
  const [yeni, setYeni] = useState("");
  const [yeniTekrar, setYeniTekrar] = useState("");
  const [goster, setGoster] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [mesaj, setMesaj] = useState<{ tur: "ok" | "hata"; metin: string } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles")
        .select("full_name, role, email, sifre_degismeli").eq("id", user.id).maybeSingle();
      setProfil({
        full_name: (data?.full_name as string | null) ?? null,
        role: (data?.role as string | null) ?? null,
        email: (data?.email as string | null) ?? user.email ?? null,
        sifre_degismeli: !!data?.sifre_degismeli,
      });
    })();
  }, []);

  const degistir = async (e: React.FormEvent) => {
    e.preventDefault();
    setMesaj(null);
    if (yeni.length < 8) { setMesaj({ tur: "hata", metin: "Yeni şifre en az 8 karakter olmalı." }); return; }
    if (yeni !== yeniTekrar) { setMesaj({ tur: "hata", metin: "Yeni şifreler birbiriyle aynı değil." }); return; }
    setKaydediliyor(true);
    const { error } = await createClient().rpc("sifremi_degistir", { p_eski: eski, p_yeni: yeni });
    setKaydediliyor(false);
    if (error) { setMesaj({ tur: "hata", metin: error.message }); return; }
    setEski(""); setYeni(""); setYeniTekrar("");
    setProfil(p => p ? { ...p, sifre_degismeli: false } : p);
    setMesaj({ tur: "ok", metin: "Şifreniz değiştirildi. Bir sonraki girişte yeni şifrenizi kullanın." });
  };

  const girdi = "w-full bg-alan border border-cizgi-guclu text-[13px] h-10 px-3 rounded-lg outline-none focus:border-altin/50";

  return (
    <main className="min-h-screen bg-zemin text-yazi p-5">
      <h1 className="text-3xl font-bold pt-5">Profil</h1>
      <div className="max-w-lg space-y-4 mt-6">
        <div className="bg-kart border border-cizgi rounded-2xl p-5">
          <p className="text-gray-400 text-sm">Kullanıcı</p>
          <h2 className="text-2xl font-bold mt-2">{profil ? (profil.full_name || profil.email) : "Yükleniyor..."}</h2>
          {profil && <p className="text-gray-500 mt-2 text-sm">{profil.email} · {rolEtiketi(rolCoz(profil.role))}</p>}
        </div>

        <form id="sifre" onSubmit={degistir} className="bg-kart border border-cizgi rounded-2xl p-5 space-y-3 scroll-mt-20">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2"><KeyRound size={14} className="text-blue-400" /> Şifremi değiştir</p>
          {profil?.sifre_degismeli && (
            <p className="text-[12px] text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              Yöneticinin verdiği geçici şifreyle giriş yaptınız. Lütfen kendinize yeni bir şifre belirleyin.
            </p>
          )}
          <label className="block space-y-1">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Mevcut şifre</span>
            <input className={girdi} type={goster ? "text" : "password"} autoComplete="current-password" value={eski} onChange={e => setEski(e.target.value)} required />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Yeni şifre (en az 8 karakter)</span>
            <input className={girdi} type={goster ? "text" : "password"} autoComplete="new-password" value={yeni} onChange={e => setYeni(e.target.value)} required />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Yeni şifre (tekrar)</span>
            <input className={girdi} type={goster ? "text" : "password"} autoComplete="new-password" value={yeniTekrar} onChange={e => setYeniTekrar(e.target.value)} required />
          </label>
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => setGoster(!goster)} className="text-[12px] text-gray-500 hover:text-yazi flex items-center gap-1.5">
              {goster ? <EyeOff size={13} /> : <Eye size={13} />} {goster ? "Şifreleri gizle" : "Şifreleri göster"}
            </button>
            <button type="submit" disabled={kaydediliyor || !eski || !yeni || !yeniTekrar}
              className="text-[13px] font-bold px-5 py-2 rounded-xl kebo-btn-altin text-[#1a1408] hover:brightness-110 disabled:opacity-40 flex items-center gap-2">
              {kaydediliyor ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} Şifreyi değiştir
            </button>
          </div>
          {mesaj && (
            <p className={`text-[12px] rounded-lg px-3 py-2 border flex items-start gap-2 ${mesaj.tur === "ok" ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/25" : "text-red-300 bg-red-500/10 border-red-500/25"}`}>
              {mesaj.tur === "ok" ? <CheckCircle2 size={14} className="shrink-0 mt-0.5" /> : <AlertTriangle size={14} className="shrink-0 mt-0.5" />}{mesaj.metin}
            </p>
          )}
          <p className="text-[11px] text-gray-500">Şifrenizi unutursanız Murat veya Bülent size Ayarlar &gt; Kullanıcılar ve yetkiler bölümünden yeni bir geçici şifre verebilir.</p>
        </form>
      </div>
    </main>
  );
}
