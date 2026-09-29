"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useYetki } from "@/lib/useYetki";
import { gunEkle } from "@/lib/tarih";
import { TABLO_ADLARI, tabloAdi, islemAdi, islemOzeti, hassasMaskele, zamanMetni } from "@/lib/islemGecmisi";
import { cn } from "@/lib/utils";

const SAYFA_BOYU = 50;

interface Satir {
  id: number;
  tablo: string;
  kayit_id: string | null;
  islem: string;
  kullanici: string | null;
  zaman: string;
  eski: Record<string, unknown> | null;
  yeni: Record<string, unknown> | null;
}

const ISLEM_RENK: Record<string, string> = {
  ekleme: "bg-green-50 text-green-700 border-green-200",
  guncelleme: "bg-blue-50 text-blue-700 border-blue-200",
  silme: "bg-red-50 text-red-700 border-red-200",
};

export default function IslemGecmisiPage() {
  const yetki = useYetki();
  const [tablo, setTablo] = useState("");
  const [kullanici, setKullanici] = useState("");
  const [bas, setBas] = useState("");
  const [bit, setBit] = useState("");
  const [sayfa, setSayfa] = useState(0);
  const [satirlar, setSatirlar] = useState<Satir[]>([]);
  const [toplam, setToplam] = useState(0);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState("");
  const [acikId, setAcikId] = useState<number | null>(null);

  const yukle = useCallback(async () => {
    setYukleniyor(true); setHata("");
    const supabase = createClient();
    let q = supabase.from("islem_gecmisi")
      .select("id, tablo, kayit_id, islem, kullanici, zaman, eski, yeni", { count: "exact" })
      .order("zaman", { ascending: false })
      .order("id", { ascending: false })
      .range(sayfa * SAYFA_BOYU, sayfa * SAYFA_BOYU + SAYFA_BOYU - 1);
    if (tablo) q = q.eq("tablo", tablo);
    if (kullanici.trim()) q = q.ilike("kullanici", `%${kullanici.trim()}%`);
    if (bas) q = q.gte("zaman", `${bas}T00:00:00+03:00`);
    if (bit) q = q.lt("zaman", `${gunEkle(bit, 1)}T00:00:00+03:00`);
    const { data, error, count } = await q;
    if (error) setHata(error.message);
    setSatirlar((data as Satir[]) || []);
    setToplam(count || 0);
    setYukleniyor(false);
  }, [tablo, kullanici, bas, bit, sayfa]);

  useEffect(() => {
    if (!yetki.tamYetkili) return;
    const t = setTimeout(yukle, 250);
    return () => clearTimeout(t);
  }, [yukle, yetki.tamYetkili]);

  // Filtre değişince ilk sayfaya dön.
  const filtre = (ayarla: (v: string) => void) => (v: string) => { ayarla(v); setSayfa(0); };

  if (yetki.yukleniyor) return <main className="p-5 text-sm text-gray-500">Yükleniyor...</main>;
  if (!yetki.tamYetkili) return <main className="p-5 text-sm text-gray-500">Bu sayfa sadece Tam Yetkili kullanıcılara açıktır.</main>;

  const sayfaSayisi = Math.max(1, Math.ceil(toplam / SAYFA_BOYU));
  const girdi = "rounded-xl border border-[#e2e5eb] bg-[#ffffff] px-3 py-2 text-[13px] outline-none focus:border-blue-400";

  return (
    <main className="min-h-screen bg-[#f4f5f7] text-[#1a1f2e] p-4 sm:p-5">
      <div className="pt-5 mb-5 flex items-center gap-3">
        <Link href="/ayarlar" className="p-2 rounded-xl border border-[#e2e5eb] bg-[#ffffff] text-gray-500 hover:text-[#1a1f2e]">
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-2xl font-black">İşlem geçmişi</h1>
          <p className="text-[13px] text-gray-500">Kayıtlarda yapılan ekleme, güncelleme ve silmeler</p>
        </div>
      </div>

      <div className="bg-[#ffffff] border border-[#e2e5eb] rounded-2xl p-4 mb-4 grid grid-cols-2 lg:grid-cols-5 gap-3 items-end">
        <label className="flex flex-col gap-1 text-[12px] text-gray-500 col-span-2 lg:col-span-1">
          Tablo
          <select value={tablo} onChange={e => filtre(setTablo)(e.target.value)} className={girdi}>
            <option value="">Tümü</option>
            {Object.entries(TABLO_ADLARI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-gray-500 col-span-2 lg:col-span-1">
          Kullanıcı
          <input value={kullanici} onChange={e => filtre(setKullanici)(e.target.value)} placeholder="ör. murat" className={girdi} />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-gray-500">
          Başlangıç
          <input type="date" value={bas} onChange={e => filtre(setBas)(e.target.value)} className={girdi} />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-gray-500">
          Bitiş
          <input type="date" value={bit} onChange={e => filtre(setBit)(e.target.value)} className={girdi} />
        </label>
        <div className="flex gap-2 col-span-2 lg:col-span-1">
          <button onClick={() => { setTablo(""); setKullanici(""); setBas(""); setBit(""); setSayfa(0); }}
            className="flex-1 rounded-xl border border-[#e2e5eb] px-3 py-2 text-[13px] text-gray-600 hover:bg-black/[0.03]">Temizle</button>
          <button onClick={yukle} title="Yenile"
            className="rounded-xl border border-[#e2e5eb] px-3 py-2 text-gray-600 hover:bg-black/[0.03]"><RefreshCw size={15} /></button>
        </div>
      </div>

      {hata && <p className="text-[13px] text-red-600 mb-3">{hata}</p>}

      <div className="bg-[#ffffff] border border-[#e2e5eb] rounded-2xl overflow-hidden">
        <div className="hidden md:grid grid-cols-[140px_110px_150px_100px_1fr] gap-3 px-4 py-2.5 border-b border-[#e2e5eb] text-[11px] font-bold uppercase tracking-wider text-gray-400">
          <span>Zaman</span><span>Kullanıcı</span><span>Tablo</span><span>İşlem</span><span>Özet</span>
        </div>
        {yukleniyor && !satirlar.length ? (
          <p className="p-5 text-[13px] text-gray-500">Yükleniyor...</p>
        ) : !satirlar.length ? (
          <p className="p-5 text-[13px] text-gray-500">Kayıt bulunamadı.</p>
        ) : satirlar.map(s => (
          <div key={s.id} className="border-b border-[#e2e5eb] last:border-b-0">
            <button onClick={() => setAcikId(acikId === s.id ? null : s.id)}
              className={cn("w-full text-left px-4 py-3 grid grid-cols-2 md:grid-cols-[140px_110px_150px_100px_1fr] gap-x-3 gap-y-1 text-[13px] hover:bg-black/[0.02]",
                acikId === s.id && "bg-blue-50/40")}>
              <span className="text-gray-600 tabular-nums">{zamanMetni(s.zaman)}</span>
              <span className="font-medium truncate text-right md:text-left">{s.kullanici || "—"}</span>
              <span className="truncate">{tabloAdi(s.tablo)}</span>
              <span className="text-right md:text-left">
                <span className={cn("inline-block px-2 py-0.5 rounded-md border text-[11px] font-semibold", ISLEM_RENK[s.islem] || "bg-gray-50 text-gray-600 border-gray-200")}>
                  {islemAdi(s.islem)}
                </span>
              </span>
              <span className="col-span-2 md:col-span-1 text-gray-600 break-words">{islemOzeti(s.islem, s.eski, s.yeni)}</span>
            </button>
            {acikId === s.id && (
              <div className="px-4 pb-4 grid md:grid-cols-2 gap-3">
                {(["eski", "yeni"] as const).map(k => (
                  <div key={k}>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">{k === "eski" ? "Eski" : "Yeni"}</p>
                    <pre className="text-[11px] bg-[#f4f5f7] border border-[#e2e5eb] rounded-xl p-3 overflow-auto max-h-80 whitespace-pre-wrap break-all">
                      {s[k] ? JSON.stringify(hassasMaskele(s[k]), null, 2) : "—"}
                    </pre>
                  </div>
                ))}
                {s.kayit_id && <p className="text-[11px] text-gray-400 md:col-span-2">Kayıt no: {s.kayit_id}</p>}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-4 text-[13px] text-gray-600">
        <span>{toplam} kayıt</span>
        <div className="flex items-center gap-2">
          <button disabled={sayfa === 0} onClick={() => setSayfa(sayfa - 1)}
            className="p-2 rounded-xl border border-[#e2e5eb] bg-[#ffffff] disabled:opacity-40"><ChevronLeft size={15} /></button>
          <span className="tabular-nums">{sayfa + 1} / {sayfaSayisi}</span>
          <button disabled={sayfa + 1 >= sayfaSayisi} onClick={() => setSayfa(sayfa + 1)}
            className="p-2 rounded-xl border border-[#e2e5eb] bg-[#ffffff] disabled:opacity-40"><ChevronRight size={15} /></button>
        </div>
      </div>
    </main>
  );
}
