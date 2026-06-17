"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import {
  Package, ArrowLeft, ClipboardCheck, Truck, Calendar, TrendingDown,
  TrendingUp, BarChart3, Activity, Loader2, Edit3, Save, X,
  AlertTriangle, CheckCircle2, Clock, Trash2, RefreshCw
} from "lucide-react";

interface Urun {
  id: string; urun_adi: string; kategori: string | null;
  birim: string; min_stok: number; mevcut_stok: number;
  son_fiyat: number | null; notlar: string | null; updated_at: string;
}
interface Hareket {
  id: string; urun_id: string; tarih: string;
  tip: "sayim" | "giris" | "cikis" | "duzeltme";
  miktar: number; kaynak: string | null;
  aciklama: string | null; kullanici: string | null;
  created_at: string;
}

const fmt = (v: number, d = 2) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: d }).format(v);
const fmtTarih = (t: string) => { if(!t) return ""; const [y,m,d]=t.split("-"); return `${d}.${m}.${y}`; };
const bugun = () => new Date().toISOString().split("T")[0];

const TIP_KONFIG = {
  sayim:    { label: "Sayım",    color: "blue",    icon: ClipboardCheck },
  giris:    { label: "Giriş",    color: "amber",   icon: Truck },
  cikis:    { label: "Çıkış",    color: "red",     icon: TrendingDown },
  duzeltme: { label: "Düzeltme", color: "purple",  icon: Edit3 },
};

export default function StokDetayPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const urunId = params?.id as string;
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<any>(null);

  const [loading, setLoading] = useState(true);
  const [urun, setUrun] = useState<Urun | null>(null);
  const [hareketler, setHareketler] = useState<Hareket[]>([]);
  const [userEmail, setUserEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  // Dönem analizi
  const [donemBaslangic, setDonemBaslangic] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [donemBitis, setDonemBitis] = useState(bugun());

  // Sayım & Giriş modalları
  const [sayimAcik, setSayimAcik] = useState(false);
  const [girisAcik, setGirisAcik] = useState(false);
  const [sayimMiktar, setSayimMiktar] = useState("");
  const [sayimTarih, setSayimTarih] = useState(bugun());
  const [girisMiktar, setGirisMiktar] = useState("");
  const [girisTarih, setGirisTarih] = useState(bugun());
  const [saving, setSaving] = useState(false);

  const veriCek = async () => {
    if (!urunId) return;
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setUserEmail(user?.email || "");
    setIsAdmin(user?.email === "murat@kebo.com" || user?.email === "bulent@kebo.com");

    const [uRes, hRes] = await Promise.all([
      supabase.from("stok_urunler").select("*").eq("id", urunId).single(),
      supabase.from("stok_hareketler").select("*").eq("urun_id", urunId).order("tarih", { ascending: false }).limit(200),
    ]);
    if (uRes.data) setUrun(uRes.data as Urun);
    if (hRes.data) setHareketler(hRes.data as Hareket[]);
    setLoading(false);
  };

  useEffect(() => { veriCek(); }, [urunId]);

  // ── Dönem kullanım hesabı ──
  const donemAnaliz = useMemo(() => {
    if (!urun) return null;
    const sayimlar = hareketler.filter(h => h.tip === "sayim").sort((a, b) => a.tarih.localeCompare(b.tarih));

    const baslangicSayim = sayimlar.filter(s => s.tarih <= donemBaslangic).slice(-1)[0];
    const bitisSayim = sayimlar.filter(s => s.tarih <= donemBitis).slice(-1)[0];

    if (!baslangicSayim || !bitisSayim || baslangicSayim.tarih === bitisSayim.tarih) {
      return { kullanim: 0, gunSayisi: 0, gunlukOrt: 0, baslangicStok: 0, bitisStok: 0, aradaGelen: 0 };
    }

    const aradaGelen = hareketler
      .filter(h => h.tip === "giris" && h.tarih > baslangicSayim.tarih && h.tarih <= bitisSayim.tarih)
      .reduce((s, h) => s + h.miktar, 0);

    const gunSayisi = Math.max(
      Math.round((new Date(bitisSayim.tarih).getTime() - new Date(baslangicSayim.tarih).getTime()) / (1000 * 60 * 60 * 24)),
      1
    );

    const kullanim = Math.max((baslangicSayim.miktar + aradaGelen) - bitisSayim.miktar, 0);
    const gunlukOrt = kullanim / gunSayisi;

    return {
      kullanim, gunSayisi, gunlukOrt,
      baslangicStok: baslangicSayim.miktar,
      bitisStok: bitisSayim.miktar,
      aradaGelen,
    };
  }, [urun, hareketler, donemBaslangic, donemBitis]);

  // ── Günlük stok grafiği için veri ──
  const grafikData = useMemo(() => {
    if (!urun || hareketler.length === 0) return [];
    const sirali = [...hareketler].sort((a, b) => a.tarih.localeCompare(b.tarih));
    // Tarih bazlı stok seviyesi oluştur
    const tarihMap = new Map<string, number>();
    let stok = 0;
    sirali.forEach(h => {
      if (h.tip === "sayim") stok = h.miktar;
      else if (h.tip === "giris") stok += h.miktar;
      else if (h.tip === "cikis") stok -= h.miktar;
      else if (h.tip === "duzeltme") stok = h.miktar;
      tarihMap.set(h.tarih, stok);
    });
    return Array.from(tarihMap.entries()).map(([tarih, miktar]) => ({ tarih, miktar }));
  }, [urun, hareketler]);

  // ── Chart.js ──
  useEffect(() => {
    if (grafikData.length === 0 || !chartRef.current) return;
    if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; }

    const load = async () => {
      // @ts-ignore
      if (!window.Chart) {
        await new Promise<void>(resolve => {
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";
          s.onload = () => resolve(); document.head.appendChild(s);
        });
      }
      if (!chartRef.current) return;

      const labels = grafikData.map(d => fmtTarih(d.tarih).substring(0, 5));
      const data = grafikData.map(d => d.miktar);
      const minStok = urun?.min_stok || 0;

      // @ts-ignore
      chartInstance.current = new window.Chart(chartRef.current, {
        type: "line",
        data: {
          labels,
          datasets: [{
            label: "Stok Seviyesi",
            data,
            borderColor: "#10B981",
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: "#10B981",
            pointBorderColor: "#0c0f1a",
            pointBorderWidth: 2,
          }, ...(minStok > 0 ? [{
            label: "Min. Stok",
            data: Array(labels.length).fill(minStok),
            borderColor: "#F59E0B",
            borderWidth: 1,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false,
          }] : [])]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "#0f1623",
              borderColor: "#1e2a3a",
              borderWidth: 1,
              titleColor: "#94a3b8",
              bodyColor: "#e2e8f0",
              callbacks: {
                label: (ctx: any) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)} ${urun?.birim || ""}`,
              }
            }
          },
          scales: {
            x: { ticks: { color: "#4b5563", font: { size: 10 } }, grid: { color: "rgba(255,255,255,0.03)" } },
            y: { ticks: { color: "#4b5563", font: { size: 10 } }, grid: { color: "rgba(255,255,255,0.04)" }, beginAtZero: true }
          }
        }
      });
    };
    load();
    return () => { if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; } };
  }, [grafikData, urun?.birim, urun?.min_stok]);

  // ── Sayım Kaydet ──
  const sayimKaydet = async () => {
    if (!urun) return;
    const m = parseFloat(sayimMiktar);
    if (isNaN(m) || m < 0) { alert("Geçerli miktar"); return; }
    setSaving(true);
    const ekleyen = userEmail.split("@")[0] || "Bilinmiyor";
    const { error } = await supabase.from("stok_hareketler").insert([{
      urun_id: urun.id, tarih: sayimTarih, tip: "sayim",
      miktar: m, kaynak: "manuel", kullanici: ekleyen,
      aciklama: `${urun.urun_adi} sayımı`,
    }]);
    if (error) { alert("Hata: " + error.message); setSaving(false); return; }
    setSayimAcik(false); setSayimMiktar(""); setSayimTarih(bugun()); setSaving(false);
    veriCek();
  };

  // ── Mal Girişi Kaydet ──
  const girisKaydet = async () => {
    if (!urun) return;
    const m = parseFloat(girisMiktar);
    if (isNaN(m) || m <= 0) { alert("Geçerli miktar"); return; }
    setSaving(true);
    const ekleyen = userEmail.split("@")[0] || "Bilinmiyor";
    const { error } = await supabase.from("stok_hareketler").insert([{
      urun_id: urun.id, tarih: girisTarih, tip: "giris",
      miktar: m, kaynak: "manuel", kullanici: ekleyen,
      aciklama: `${urun.urun_adi} mal girişi`,
    }]);
    if (error) { alert("Hata: " + error.message); setSaving(false); return; }
    setGirisAcik(false); setGirisMiktar(""); setGirisTarih(bugun()); setSaving(false);
    veriCek();
  };

  // ── Hareket Sil ──
  const hareketSil = async (h: Hareket) => {
    if (!isAdmin) { alert("Silme yetkisi yok"); return; }
    if (!confirm("Bu hareketi silmek istiyor musunuz? Stok otomatik güncellenecek.")) return;
    const { error } = await supabase.from("stok_hareketler").delete().eq("id", h.id);
    if (error) { alert("Hata: " + error.message); return; }
    veriCek();
  };

  if (loading) return (
    <div className="h-screen bg-[#060810] flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"/>
    </div>
  );

  if (!urun) return (
    <div className="min-h-screen bg-[#060810] text-white flex flex-col items-center justify-center gap-4">
      <p className="text-gray-500">Ürün bulunamadı</p>
      <Link href="/stok" className="text-blue-400 text-xs">← Stok Listesine Dön</Link>
    </div>
  );

  const kritik = urun.mevcut_stok <= urun.min_stok && urun.min_stok > 0;
  const tukenmis = urun.mevcut_stok <= 0;
  const tahminiBitis = donemAnaliz && donemAnaliz.gunlukOrt > 0
    ? Math.floor(urun.mevcut_stok / donemAnaliz.gunlukOrt)
    : null;

  return (
    <div className="min-h-screen bg-[#060810] text-white font-sans antialiased">

      {/* HEADER */}
      <div className="sticky top-0 z-40 border-b border-[#0f1624] bg-[#060810]/95 backdrop-blur-xl">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/stok" className="p-2 text-gray-500 hover:text-white border border-[#1a2236] hover:border-[#2a3550] rounded-xl transition-colors">
              <ArrowLeft size={14}/>
            </Link>
            <div>
              <h1 className="text-sm font-black tracking-tight text-white leading-none">{urun.urun_adi}</h1>
              <p className="text-[10px] text-gray-600 leading-none mt-0.5">
                {urun.kategori || "Kategorisiz"} · {urun.birim}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setGirisAcik(true)}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-amber-400 border border-[#1a2236] hover:border-amber-500/30 px-3 py-2 rounded-xl transition-colors">
              <Truck size={13}/> Mal Geldi
            </button>
            <button onClick={() => setSayimAcik(true)}
              className="flex items-center gap-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl transition-colors shadow-lg shadow-blue-900/30">
              <ClipboardCheck size={14}/> Sayım Gir
            </button>
            <button onClick={veriCek} className="p-2 text-gray-600 hover:text-white border border-[#1a2236] rounded-xl">
              <RefreshCw size={14}/>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* KPI ÖZET */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className={`bg-[#0c0f1a] border rounded-2xl p-4 ${tukenmis ? "border-red-500/30" : kritik ? "border-amber-500/30" : "border-emerald-500/20"}`}>
            <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mb-2">Mevcut Stok</p>
            <p className={`text-2xl font-black ${tukenmis ? "text-red-400" : kritik ? "text-amber-400" : "text-emerald-400"}`}>
              {fmt(urun.mevcut_stok, 1)} <span className="text-sm text-gray-500">{urun.birim}</span>
            </p>
            {urun.min_stok > 0 && (
              <p className="text-[10px] text-gray-600 mt-1">Min: {fmt(urun.min_stok, 1)} {urun.birim}</p>
            )}
          </div>
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-4">
            <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mb-2">Günlük Ort. Kullanım</p>
            <p className="text-2xl font-black text-purple-400">
              {donemAnaliz ? fmt(donemAnaliz.gunlukOrt, 2) : "—"} <span className="text-sm text-gray-500">{urun.birim}/gün</span>
            </p>
            <p className="text-[10px] text-gray-600 mt-1">Seçili dönem ortalaması</p>
          </div>
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-4">
            <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mb-2">Tahmini Bitiş</p>
            <p className={`text-2xl font-black ${
              tahminiBitis === null ? "text-gray-500" :
              tahminiBitis <= 3 ? "text-red-400" :
              tahminiBitis <= 7 ? "text-amber-400" : "text-blue-400"
            }`}>
              {tahminiBitis !== null ? `${tahminiBitis}` : "—"} <span className="text-sm text-gray-500">gün</span>
            </p>
            <p className="text-[10px] text-gray-600 mt-1">
              {tahminiBitis !== null
                ? `~${new Date(Date.now() + tahminiBitis * 86400000).toLocaleDateString("tr-TR")}`
                : "Veri yetersiz"}
            </p>
          </div>
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-4">
            <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mb-2">Son Alış Fiyatı</p>
            <p className="text-2xl font-black text-amber-400">
              {urun.son_fiyat ? `₺${fmt(urun.son_fiyat, 2)}` : "—"}
            </p>
            <p className="text-[10px] text-gray-600 mt-1">per {urun.birim}</p>
          </div>
        </div>

        {/* DÖNEM ANALİZİ */}
        <div className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#1a2236] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <Activity className="h-3.5 w-3.5 text-purple-400"/>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-200">Dönem Analizi</h3>
                <p className="text-[10px] text-gray-600">İki tarih arasındaki kullanım hesabı</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="date" value={donemBaslangic} onChange={e => setDonemBaslangic(e.target.value)}
                className="bg-[#080b14] border border-[#1a2236] text-white text-xs h-8 px-2 rounded-lg outline-none focus:border-blue-500/40"/>
              <span className="text-gray-600 text-xs">→</span>
              <input type="date" value={donemBitis} onChange={e => setDonemBitis(e.target.value)}
                className="bg-[#080b14] border border-[#1a2236] text-white text-xs h-8 px-2 rounded-lg outline-none focus:border-blue-500/40"/>
            </div>
          </div>
          {donemAnaliz && donemAnaliz.gunSayisi > 0 ? (
            <div className="p-5 grid grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="bg-[#080b14] rounded-xl p-3 border border-[#1a2236]">
                <p className="text-[9px] text-gray-600 uppercase tracking-widest">Başlangıç Stoğu</p>
                <p className="text-sm font-black text-blue-400 mt-1">{fmt(donemAnaliz.baslangicStok, 1)} {urun.birim}</p>
              </div>
              <div className="bg-[#080b14] rounded-xl p-3 border border-[#1a2236]">
                <p className="text-[9px] text-gray-600 uppercase tracking-widest">Arada Gelen Mal</p>
                <p className="text-sm font-black text-amber-400 mt-1">+ {fmt(donemAnaliz.aradaGelen, 1)} {urun.birim}</p>
              </div>
              <div className="bg-[#080b14] rounded-xl p-3 border border-[#1a2236]">
                <p className="text-[9px] text-gray-600 uppercase tracking-widest">Bitiş Stoğu</p>
                <p className="text-sm font-black text-emerald-400 mt-1">{fmt(donemAnaliz.bitisStok, 1)} {urun.birim}</p>
              </div>
              <div className="bg-[#080b14] rounded-xl p-3 border border-red-500/20">
                <p className="text-[9px] text-red-600 uppercase tracking-widest font-bold">Toplam Kullanım</p>
                <p className="text-sm font-black text-red-400 mt-1">- {fmt(donemAnaliz.kullanim, 1)} {urun.birim}</p>
              </div>
              <div className="bg-[#080b14] rounded-xl p-3 border border-purple-500/20">
                <p className="text-[9px] text-purple-600 uppercase tracking-widest font-bold">Günlük Ortalama</p>
                <p className="text-sm font-black text-purple-400 mt-1">{fmt(donemAnaliz.gunlukOrt, 2)} {urun.birim}/gün</p>
                <p className="text-[9px] text-gray-700 mt-0.5">{donemAnaliz.gunSayisi} gün</p>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-gray-600">
              Bu dönemde sayım verisi yetersiz. En az iki sayım gerekli.
            </div>
          )}
        </div>

        {/* GRAFİK */}
        {grafikData.length > 0 && (
          <div className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <BarChart3 className="h-3.5 w-3.5 text-emerald-400"/>
              </div>
              <h3 className="text-sm font-semibold text-gray-200">Stok Seviyesi Trendi</h3>
            </div>
            <div className="relative" style={{ height: "240px" }}>
              <canvas ref={chartRef}/>
            </div>
          </div>
        )}

        {/* HAREKETLER */}
        <div className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#1a2236]">
            <h3 className="text-sm font-semibold text-gray-200">Tüm Hareketler ({hareketler.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1a2236] bg-[#080b14]">
                  {["Tarih", "Tip", "Miktar", "Açıklama", "Kullanıcı", ""].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0f1624]">
                {hareketler.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-600">Henüz hareket yok</td></tr>
                ) : hareketler.map(h => {
                  const konfig = TIP_KONFIG[h.tip];
                  const Icon = konfig.icon;
                  return (
                    <tr key={h.id} className="hover:bg-white/[0.02] group">
                      <td className="px-4 py-3 text-gray-300 font-semibold">{fmtTarih(h.tarih)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full bg-${konfig.color}-500/10 text-${konfig.color}-400`}>
                          <Icon size={9}/> {konfig.label}
                        </span>
                      </td>
                      <td className={`px-4 py-3 font-black text-${konfig.color}-400`}>
                        {h.tip === "giris" ? "+" : h.tip === "cikis" ? "-" : ""}{fmt(h.miktar, 1)} {urun.birim}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{h.aciklama || "—"}</td>
                      <td className="px-4 py-3 text-gray-600 text-[10px]">{h.kullanici || "—"}</td>
                      <td className="px-4 py-3">
                        {isAdmin && (
                          <button onClick={() => hareketSil(h)}
                            className="p-1 text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 size={11}/>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* SAYIM MODAL */}
      {sayimAcik && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0f1a] border border-blue-500/20 rounded-2xl w-full max-w-sm">
            <div className="px-5 py-4 border-b border-[#1a2236] flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ClipboardCheck size={14} className="text-blue-400"/> Sayım Gir
              </h3>
              <button onClick={() => setSayimAcik(false)} className="text-gray-600"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl px-3 py-2 text-xs">
                Sistem stoğu: <strong className="text-white">{fmt(urun.mevcut_stok, 1)} {urun.birim}</strong>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Sayım Tarihi</label>
                <input type="date" value={sayimTarih} onChange={e => setSayimTarih(e.target.value)}
                  className="w-full bg-[#080b14] border border-[#1a2236] focus:border-blue-500/40 text-white text-sm h-9 px-3 rounded-xl outline-none"/>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Şu Anda Stokta Olan ({urun.birim})</label>
                <input type="number" step="0.01" value={sayimMiktar} onChange={e => setSayimMiktar(e.target.value)} autoFocus
                  className="w-full bg-[#080b14] border border-[#1a2236] focus:border-blue-500/40 text-white text-lg font-bold h-12 px-3 rounded-xl outline-none"/>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setSayimAcik(false)} className="text-xs font-semibold text-gray-500 border border-[#1a2236] px-4 py-2 rounded-xl">İptal</button>
                <button onClick={sayimKaydet} disabled={saving || !sayimMiktar}
                  className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 px-6 py-2 rounded-xl flex items-center gap-2">
                  {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MAL GİRİŞ MODAL */}
      {girisAcik && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0f1a] border border-amber-500/20 rounded-2xl w-full max-w-sm">
            <div className="px-5 py-4 border-b border-[#1a2236] flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Truck size={14} className="text-amber-400"/> Mal Girişi
              </h3>
              <button onClick={() => setGirisAcik(false)} className="text-gray-600"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Geliş Tarihi</label>
                <input type="date" value={girisTarih} onChange={e => setGirisTarih(e.target.value)}
                  className="w-full bg-[#080b14] border border-[#1a2236] focus:border-amber-500/40 text-white text-sm h-9 px-3 rounded-xl outline-none"/>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Gelen Miktar ({urun.birim})</label>
                <input type="number" step="0.01" value={girisMiktar} onChange={e => setGirisMiktar(e.target.value)} autoFocus
                  className="w-full bg-[#080b14] border border-[#1a2236] focus:border-amber-500/40 text-white text-lg font-bold h-12 px-3 rounded-xl outline-none"/>
              </div>
              {girisMiktar && !isNaN(parseFloat(girisMiktar)) && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-3 py-2 text-xs">
                  Yeni stok: <strong className="text-emerald-400">{fmt(urun.mevcut_stok + parseFloat(girisMiktar), 1)} {urun.birim}</strong>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setGirisAcik(false)} className="text-xs font-semibold text-gray-500 border border-[#1a2236] px-4 py-2 rounded-xl">İptal</button>
                <button onClick={girisKaydet} disabled={saving || !girisMiktar}
                  className="text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-40 px-6 py-2 rounded-xl flex items-center gap-2">
                  {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
