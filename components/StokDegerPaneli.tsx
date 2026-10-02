"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Boxes, ChevronDown, RefreshCw, AlertTriangle, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useYetki } from "@/lib/useYetki";
import { stokDegerGorebilirMi, stokDegerOzeti, type StokDegerSatiri } from "@/lib/stokDeger";

const fmt2 = (v: number) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const fmtM = (v: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(v);
const fmtF = (v: number) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(v);
const tarihYaz = (t: string | null) => (t ? `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}` : "—");
const saatYaz = (t: string | null) => {
  if (!t) return "—";
  const d = new Date(t);
  return d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const KAT_RENK = ["#34d399", "#f0a94b", "#60a5fa", "#c084fc", "#f472b6", "#facc15", "#22d3ee", "#fb7185", "#a3e635"];

/** Depodaki malın TL değeri. Sadece STOK_DEGER_GORENLER görür; diğerlerine hiçbir şey çizilmez. */
export default function StokDegerPaneli() {
  const { userId, yukleniyor: yetkiYukleniyor } = useYetki();
  const gorebilir = stokDegerGorebilirMi(userId);
  const [satirlar, setSatirlar] = useState<StokDegerSatiri[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [acik, setAcik] = useState(false);
  const [kategori, setKategori] = useState<string>("Tümü");
  const [arama, setArama] = useState("");

  const cek = useCallback(async () => {
    setYenileniyor(true);
    const { data, error } = await createClient().rpc("stok_deger_raporu");
    if (error) setHata(error.code === "42501" ? "Bu raporu görme yetkiniz yok." : "Stok değeri yüklenemedi. Sayfayı yenileyin.");
    else { setHata(null); setSatirlar((data ?? []) as StokDegerSatiri[]); }
    setYenileniyor(false);
  }, []);

  // Sayım girildikçe güncel kalsın: sekmeye dönünce ve dakikada bir yeniden çek.
  useEffect(() => {
    if (!gorebilir) return;
    cek();
    const odak = () => { if (document.visibilityState === "visible") cek(); };
    document.addEventListener("visibilitychange", odak);
    const zamanlayici = setInterval(odak, 60_000);
    return () => { document.removeEventListener("visibilitychange", odak); clearInterval(zamanlayici); };
  }, [gorebilir, cek]);

  const ozet = useMemo(() => (satirlar ? stokDegerOzeti(satirlar) : null), [satirlar]);

  const gorunen = useMemo(() => {
    if (!ozet) return [];
    const q = arama.trim().toLocaleLowerCase("tr");
    return ozet.kalemler
      .filter(k => k.miktar > 0 || k.birimFiyat === null)
      .filter(k => kategori === "Tümü" || k.kategori === kategori)
      .filter(k => !q || k.ad.toLocaleLowerCase("tr").includes(q) || (k.kaynak ?? "").toLocaleLowerCase("tr").includes(q))
      .sort((a, b) => b.tutar - a.tutar);
  }, [ozet, kategori, arama]);

  // Değeri olan kategoriler + sadece fiyatsız ürünü olan kategoriler
  const kategoriSecenekleri = useMemo(() => {
    if (!ozet) return ["Tümü"];
    const degerli = ozet.kategoriler.map(k => k.ad);
    const fiyatsiz = [...new Set(ozet.fiyatsiz.map(k => k.kategori))].filter(c => !degerli.includes(c));
    return ["Tümü", ...degerli, ...fiyatsiz];
  }, [ozet]);

  if (yetkiYukleniyor || !gorebilir) return null;

  const enBuyuk = ozet?.kategoriler[0]?.tutar || 1;

  return (
    <section className="kebo-kart p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="kebo-simge w-9 h-9 !rounded-[10px]" style={{ color: "#34d399" }}><Boxes className="h-4 w-4" /></div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-bold">Stok Değeri</h2>
          <p className="text-[11px] text-gray-500">
            Stok sayımı × Mikro faturalarındaki son birim fiyat · fiyatlar {saatYaz(ozet?.sonFiyatGuncelleme ?? null)} güncellendi
          </p>
        </div>
        <div className="flex items-center gap-4 text-right">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">KDV hariç</p>
            <p className="text-lg font-bold text-emerald-400 tabular-nums">{ozet ? `₺${fmt2(ozet.toplam)}` : "—"}</p>
          </div>
          <div className="hidden sm:block">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">KDV dahil</p>
            <p className="text-sm font-bold tabular-nums">{ozet ? `₺${fmt2(ozet.toplamKdvli)}` : "—"}</p>
          </div>
          <button onClick={cek} title="Yenile" aria-label="Stok değerini yenile"
            className="p-2 text-gray-600 hover:text-yazi border border-cizgi rounded-xl transition-colors">
            <RefreshCw size={13} className={yenileniyor ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {hata && <p className="text-[12px] text-red-300">{hata}</p>}

      {ozet && (
        <>
          {/* Kategori dağılımı */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
            {ozet.kategoriler.map((k, i) => {
              const renk = KAT_RENK[i % KAT_RENK.length];
              return (
                <button key={k.ad} onClick={() => { setKategori(k.ad); setAcik(true); }}
                  className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-left">
                  <span className="text-[12px] text-gray-700 group-hover:text-yazi truncate">
                    {k.ad} <span className="text-gray-500">· {k.adet}</span>
                  </span>
                  <span className="text-[12px] font-semibold tabular-nums">₺{fmt2(k.tutar)}</span>
                  <span className="col-span-2 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <motion.span className="block h-full rounded-full" style={{ backgroundColor: renk }}
                      initial={{ width: 0 }} animate={{ width: `${(k.tutar / enBuyuk) * 100}%` }} transition={{ delay: 0.1 + i * 0.04, duration: 0.6 }} />
                  </span>
                </button>
              );
            })}
          </div>

          {(ozet.fiyatsiz.length > 0 || ozet.uyarili > 0) && (
            <p className="mt-3 flex items-start gap-2 text-[11px] text-gray-500">
              <AlertTriangle size={12} className="shrink-0 mt-0.5 text-amber-400" />
              <span>
                {ozet.fiyatsiz.length > 0 && <>Fiyatı bulunamayan {ozet.fiyatsiz.length} ürün toplama girmedi ({ozet.fiyatsiz.map(k => k.ad).join(", ")}). </>}
                {ozet.uyarili > 0 && <>{ozet.uyarili} ürünün fiyatı tahmine dayanıyor (listede sarı not).</>}
              </span>
            </p>
          )}

          <button onClick={() => setAcik(a => !a)}
            className="mt-4 w-full flex items-center justify-center gap-2 text-[12px] font-semibold text-gray-500 hover:text-yazi border border-cizgi hover:border-cizgi-guclu rounded-xl py-2 transition-colors">
            {acik ? "Ürün listesini gizle" : `Ürün listesini göster (${ozet.kalemler.filter(k => k.miktar > 0).length})`}
            <ChevronDown size={14} className={`transition-transform ${acik ? "rotate-180" : ""}`} />
          </button>

          {acik && (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {kategoriSecenekleri.map(c => (
                  <button key={c} onClick={() => setKategori(c)} aria-pressed={kategori === c}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${kategori === c ? "kebo-btn-altin text-[#1a1408] border-transparent" : "border-cizgi text-gray-500 hover:text-yazi"}`}>
                    {c}
                  </button>
                ))}
                <label className="ml-auto flex items-center gap-1.5 bg-alan border border-cizgi rounded-xl px-2.5 h-8 min-w-0">
                  <Search size={12} className="text-gray-600" />
                  <input id="stok-deger-ara" value={arama} onChange={e => setArama(e.target.value)} placeholder="Ürün ara"
                    className="bg-transparent text-[12px] outline-none w-32 placeholder:text-gray-600" />
                </label>
              </div>
              <div className="overflow-x-auto rounded-xl border border-cizgi">
                <table className="w-full text-xs min-w-[720px]">
                  <thead>
                    <tr className="text-[10px] text-gray-500 uppercase tracking-wider border-b border-cizgi">
                      <th className="text-left font-semibold px-3 py-2">Ürün</th>
                      <th className="text-right font-semibold px-3 py-2">Stok</th>
                      <th className="text-right font-semibold px-3 py-2">Birim fiyat</th>
                      <th className="text-right font-semibold px-3 py-2">KDV</th>
                      <th className="text-left font-semibold px-3 py-2">Son fatura</th>
                      <th className="text-right font-semibold px-3 py-2">Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gorunen.map(k => (
                      <tr key={k.id} className="border-b border-cizgi/60 last:border-0 align-top">
                        <td className="px-3 py-2">
                          <Link href={`/stok/${k.id}`} className="font-semibold hover:text-altin">{k.ad}</Link>
                          {k.kaynak && <span className="block text-[10px] text-gray-500">{k.kaynak}{k.tedarikci ? ` · ${k.tedarikci}` : ""}</span>}
                          {k.not && <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">{k.not}</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmtM(k.miktar)} {k.birim}</td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{k.birimFiyat === null ? <span className="text-red-300">fiyat yok</span> : `₺${fmtF(k.birimFiyat)}`}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-500">{k.birimFiyat === null ? "—" : `%${fmtM(k.kdv)}`}</td>
                        <td className="px-3 py-2 tabular-nums text-gray-500 whitespace-nowrap">{tarihYaz(k.faturaTarihi)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold whitespace-nowrap">{k.birimFiyat === null ? "—" : `₺${fmt2(k.tutar)}`}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-cizgi">
                      <td colSpan={5} className="px-3 py-2 text-[11px] text-gray-500">Gösterilen toplam ({gorunen.length} ürün)</td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-400">₺{fmt2(gorunen.reduce((t, k) => t + k.tutar, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
