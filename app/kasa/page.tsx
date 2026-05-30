"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowUpRight, ArrowDownLeft, PlusCircle, Building2, Coins,
  Loader2, ArrowRightLeft, Trash2, FileDown, RefreshCw, Calendar,
  BarChart3, AlertTriangle, Info, Wallet, X, Check, Search
} from "lucide-react";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface GunlukRapor {
  id: string;
  tarih: string;
  kasa_nakit: number;
  kasa_pos: number;
  kasa_edenred: number;
  os_yemeksepeti: number; os_getir: number; os_trendyol: number; os_migros: number;
  ko_yemeksepeti: number; ko_getir: number; ko_trendyol: number; ko_migros: number; ko_alo_paket: number;
  gunluk_gider: number;
  gider_aciklama?: string;
  iade_tutar: number;
  toplam_ciro: number;
  ekleyen_kullanici: string;
}

interface ManuelIslem {
  id: string;
  created_at: string;
  tip: "gelir" | "gider" | "transfer";
  hesap: string;
  hedef_hesap?: string;
  kategori: string;
  tutar: number;
  aciklama: string;
  islem_tarihi: string;
  ekleyen_kullanici: string;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const HESAPLAR = ["Nakit", "TEB", "VakıfBank", "Enpara"];
const HESAP_LABEL: Record<string, string> = {
  Nakit: "Nakit Kasa", TEB: "TEB", VakıfBank: "VakıfBank", Enpara: "Enpara",
};
const HESAP_COLOR: Record<string, string> = {
  Nakit: "#3B82F6", TEB: "#10B981", VakıfBank: "#F59E0B", Enpara: "#8B5CF6",
};

const MANUEL_GIDER_KATEGORILERI = [
  "Personel Maaş / Avans", "Kira", "Faturalar", "Banka Komisyonu",
  "Yakıt / Ulaşım", "Bakım / Onarım", "Pazarlama", "Diğer Gider",
];
const MANUEL_GELIR_KATEGORILERI = [
  "Ortak Sermaye", "Kredi", "Diğer Gelir",
];

const AYLAR = [
  { v: "01", l: "Ocak" }, { v: "02", l: "Şubat" }, { v: "03", l: "Mart" },
  { v: "04", l: "Nisan" }, { v: "05", l: "Mayıs" }, { v: "06", l: "Haziran" },
  { v: "07", l: "Temmuz" }, { v: "08", l: "Ağustos" }, { v: "09", l: "Eylül" },
  { v: "10", l: "Ekim" }, { v: "11", l: "Kasım" }, { v: "12", l: "Aralık" },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const fmtTarih = (t: string) => {
  if (!t) return "—";
  const [y, m, d] = t.split("-");
  return `${d}.${m}.${y}`;
};

// ─── SPARKLINE FINANS GRAFİĞİ ───
function Sparkline({ values, color = "#3B82F6" }: { values: number[]; color?: string }) {
  if (values.filter(v => v > 0).length < 2) return null;
  const max = Math.max(...values, 1);
  const w = 72, h = 24;
  const pts = values.map((v, i) =>
    `${(i / (values.length - 1)) * w},${h - (v / max) * (h - 3)}`
  ).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color}
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
    </svg>
  );
}

// ─── CSV EXPORT MODÜLÜ ───
function exportCSV(raporlar: GunlukRapor[], manuelIslemler: ManuelIslem[], ay: string, yil: string) {
  const ayL = AYLAR.find(m => m.v === ay)?.l || ay;
  const raporSatirlar = raporlar.map(r => [fmtTarih(r.tarih), "Rapor", "Nakit", "Nakit Ciro", r.kasa_nakit, ""].join(","));
  const manuelSatirlar = manuelIslemler.map(i => [fmtTarih(i.islem_tarihi), i.tip === "transfer" ? "Transfer" : i.tip === "gelir" ? "Gelir" : "Gider", i.hesap, i.kategori, i.tutar, i.aciklama].join(","));
  const csv = ["Tarih,Tip,Hesap,Kategori,Tutar,Açıklama", ...raporSatirlar, ...manuelSatirlar].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `KEBO_Kasa_${ayL}_${yil}.csv`;
  a.click();
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function KasaPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [raporlar, setRaporlar] = useState<GunlukRapor[]>([]);
  const [manuelIslemler, setManuelIslemler] = useState<ManuelIslem[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const [secilenAy, setSecilenAy] = useState(() => String(new Date().getMonth() + 1).padStart(2, "0"));
  const [secilenYil, setSecilenYil] = useState(() => String(new Date().getFullYear()));
  const [aramaMetni, setAramaMetni] = useState("");
  const [tipFiltre, setTipFiltre] = useState<"hepsi" | "gelir" | "gider" | "transfer">("hepsi");
  const [hesapFiltre, setHesapFiltre] = useState("hepsi");

  const [formAcik, setFormAcik] = useState(false);
  const [islemTipi, setIslemTipi] = useState<"gider" | "gelir" | "transfer">("gider");
  const [hesap, setHesap] = useState("Nakit");
  const [hedefHesap, setHedefHesap] = useState("TEB");
  const [kategori, setKategori] = useState(MANUEL_GIDER_KATEGORILERI[0]);
  const [tutar, setTutar] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [islemTarihi, setIslemTarihi] = useState(() => new Date().toISOString().split("T")[0]);

  const veriCek = useCallback(async () => {
    setLoading(true);

    const { data: raporData } = await supabase
      .from("gunluk_raporlar")
      .select("id,tarih,kasa_nakit,kasa_pos,kasa_edenred,os_yemeksepeti,os_getir,os_trendyol,os_migros,ko_yemeksepeti,ko_getir,ko_trendyol,ko_migros,ko_alo_paket,gunluk_gider,gider_aciklama,iade_tutar,toplam_ciro,ekleyen_kullanici")
      .order("tarih", { ascending: false });

    if (raporData) setRaporlar(raporData as GunlukRapor[]);

    const { data: manuelData } = await supabase
      .from("kasa_manuel_islemler")
      .select("*")
      .order("islem_tarihi", { ascending: false });

    if (manuelData) setManuelIslemler(manuelData as ManuelIslem[]);

    setLoading(false);
  }, [supabase]);

  useEffect(() => { veriCek(); }, [veriCek]);

  const filtreliRaporlar = useMemo(() => {
    return raporlar.filter(r => {
      const [y, m] = r.tarih.split("-");
      return m === secilenAy && y === secilenYil;
    });
  }, [raporlar, secilenAy, secilenYil]);

  const filtreliManuel = useMemo(() => {
    return manuelIslemler.filter(i => {
      const [y, m] = i.islem_tarihi.split("-");
      if (m !== secilenAy || y !== secilenYil) return false;
      if (tipFiltre === "gelir" && i.tip !== "gelir") return false;
      if (tipFiltre === "gider" && i.tip !== "gider") return false;
      if (tipFiltre === "transfer" && i.tip !== "transfer") return false;
      if (hesapFiltre !== "hepsi" && i.hesap !== hesapFiltre) return false;
      if (aramaMetni) {
        const q = aramaMetni.toLowerCase();
        if (!i.kategori.toLowerCase().includes(q) && !i.aciklama?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [manuelIslemler, secilenAy, secilenYil, tipFiltre, hesapFiltre, aramaMetni]);

  const bakiyeler = useMemo(() => {
    let nakit = 0;
    raporlar.forEach(r => { nakit += (r.kasa_nakit || 0); });

    let teb = 0, vakif = 0, enpara = 0, manuelNakit = 0;
    let toplamGelir = 0, toplamGider = 0;

    raporlar.forEach(r => {
      const platformCiro = (r.os_yemeksepeti || 0) + (r.os_getir || 0) + (r.os_trendyol || 0) + (r.os_migros || 0)
        + (r.ko_yemeksepeti || 0) + (r.ko_getir || 0) + (r.ko_trendyol || 0) + (r.ko_migros || 0) + (r.ko_alo_paket || 0);
      toplamGelir += (r.kasa_nakit || 0) + platformCiro + (r.kasa_pos || 0) + (r.kasa_edenred || 0);
      toplamGider += (r.gunluk_gider || 0) + (r.iade_tutar || 0);
    });

    manuelIslemler.forEach(i => {
      const m = Number(i.tutar);
      if (i.tip === "gelir") {
        toplamGelir += m;
        if (i.hesap === "TEB") teb += m;
        if (i.hesap === "VakıfBank") vakif += m;
        if (i.hesap === "Enpara") enpara += m;
        if (i.hesap === "Nakit") manuelNakit += m;
      } else if (i.tip === "gider") {
        toplamGider += m;
        if (i.hesap === "TEB") teb -= m;
        if (i.hesap === "VakıfBank") vakif -= m;
        if (i.hesap === "Enpara") enpara -= m;
        if (i.hesap === "Nakit") manuelNakit -= m;
      } else if (i.tip === "transfer") {
        if (i.hesap === "TEB") teb -= m;
        if (i.hesap === "VakıfBank") vakif -= m;
        if (i.hesap === "Enpara") enpara -= m;
        if (i.hesap === "Nakit") manuelNakit -= m;
        if (i.hedef_hesap === "TEB") teb += m;
        if (i.hedef_hesap === "VakıfBank") vakif += m;
        if (i.hedef_hesap === "Enpara") enpara += m;
        if (i.hedef_hesap === "Nakit") manuelNakit += m;
      }
    });

    return {
      Nakit: nakit + manuelNakit,
      TEB: teb,
      VakıfBank: vakif,
      Enpara: enpara,
      toplamGelir,
      toplamGider,
    };
  }, [raporlar, manuelIslemler]);

  const donemOzeti = useMemo(() => {
    let nakitToplam = 0, posToplam = 0, edenredToplam = 0, giderToplam = 0;
    const gunlukNakit: Record<number, number> = {};

    filtreliRaporlar.forEach(r => {
      nakitToplam += r.kasa_nakit || 0;
      posToplam += r.kasa_pos || 0;
      edenredToplam += r.kasa_edenred || 0;
      giderToplam += (r.gunluk_gider || 0) + (r.iade_tutar || 0);
      const gun = parseInt(r.tarih.split("-")[2]);
      gunlukNakit[gun] = (gunlukNakit[gun] || 0) + (r.kasa_nakit || 0);
    });

    const manuelGider = filtreliManuel.filter(i => i.tip === "gider").reduce((s, i) => s + i.tutar, 0);
    const sparkData = Array.from({ length: 30 }, (_, i) => gunlukNakit[i + 1] || 0);

    return { nakitToplam, posToplam, edenredToplam, giderToplam, manuelGider, sparkData };
  }, [filtreliRaporlar, filtreliManuel]);

  const kategoriDagilim = useMemo(() => {
    const map: Record<string, number> = {};
    filtreliRaporlar.forEach(r => {
      if (r.gider_aciklama) {
        r.gider_aciklama.split(" | ").forEach(g => {
          const idx = g.lastIndexOf(": ₺");
          const kat = idx > -1 ? g.substring(0, idx) : g;
          const tutar = idx > -1 ? parseFloat(g.substring(idx + 3).replace(/\./g, "").replace(",", ".")) || 0 : 0;
          if (kat && tutar > 0) map[kat] = (map[kat] || 0) + tutar;
        });
      }
    });
    filtreliManuel.filter(i => i.tip === "gider").forEach(i => { map[i.kategori] = (map[i.kategori] || 0) + i.tutar; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [filtreliRaporlar, filtreliManuel]);

  const handleIslemEkle = async (e: React.FormEvent) => {
    e.preventDefault();
    const tutarNum = parseFloat(tutar.replace(/\./g, "").replace(",", "."));
    if (!tutarNum || tutarNum <= 0) { alert("Geçerli tutar girin!"); return; }
    if (islemTipi === "transfer" && hesap === hedefHesap) { alert("Çıkış ve hedef hesap aynı olamaz!"); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const ekleyen = user?.email?.split("@")[0] || "Bilinmiyor";
      const { error } = await supabase.from("kasa_manuel_islemler").insert([{
        tip: islemTipi,
        hesap,
        hedef_hesap: islemTipi === "transfer" ? hedefHesap : null,
        kategori: islemTipi === "transfer" ? `${hesap} → ${hedefHesap}` : kategori,
        tutar: tutarNum,
        aciklama,
        islem_tarihi: islemTarihi,
        ekleyen_kullanici: ekleyen,
      }]);
      if (error) { alert("Hata: " + error.message); return; }
      setFormAcik(false);
      setTutar(""); setAciklama("");
      veriCek();
    } finally { setSaving(false); }
  };

  const handleManuelSil = async () => {
    if (!deleteTarget) return;
    await supabase.from("kasa_manuel_islemler").delete().eq("id", deleteTarget);
    setDeleteTarget(null); veriCek();
  };

  if (loading) return (
    <div className="h-screen bg-[#060810] flex flex-col items-center justify-center gap-3">
      <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      <span className="text-[10px] text-gray-600 uppercase tracking-[0.3em]">Yükleniyor</span>
    </div>
  );

  const toplam = bakiyeler.Nakit + bakiyeler.TEB + bakiyeler.VakıfBank + bakiyeler.Enpara;
  const ayLabel = AYLAR.find(m => m.v === secilenAy)?.l;

  return (
    <div className="min-h-screen bg-[#060810] text-white font-sans antialiased">

      {/* ── HEADER ── */}
      <div className="sticky top-0 z-40 border-b border-[#0f1624] bg-[#060810]/95 backdrop-blur-xl">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-900/40">
              <Wallet className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-white leading-none">Kasa & Finans</h1>
              <p className="text-[10px] text-gray-600 leading-none mt-0.5">Günlük raporlardan beslenen bakiye yönetimi</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => exportCSV(filtreliRaporlar, filtreliManuel, secilenAy, secilenYil)}
              className="hidden sm:flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-emerald-400 border border-[#1a2236] hover:border-emerald-500/30 px-3 py-2 rounded-xl transition-colors">
              <FileDown size={13} /> CSV
            </button>
            <button onClick={veriCek}
              className="p-2 text-gray-600 hover:text-white border border-[#1a2236] hover:border-[#2a3550] rounded-xl transition-colors">
              <RefreshCw size={14} />
            </button>
            <button onClick={() => setFormAcik(true)}
              className="flex items-center gap-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-xl transition-colors shadow-lg shadow-emerald-900/30">
              <PlusCircle size={14} /> Manuel İşlem
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-5 space-y-5">

        {/* Kaynak bilgisi */}
        <div className="flex items-center gap-2 text-[11px] text-blue-400/70 bg-blue-500/5 border border-blue-500/15 rounded-xl px-4 py-2.5">
          <Info size={13} className="shrink-0" />
          Nakit bakiye ve ciro verileri <strong className="text-blue-400">Günlük Kasa Raporları</strong>'ndan otomatik hesaplanır. Rapor değişince burası da güncellenir.
        </div>

        {/* ── HESAP BAKİYE KARTLARI ── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {HESAPLAR.map(h => {
            const bakiye = bakiyeler[h as keyof typeof bakiyeler] as number;
            const color = HESAP_COLOR[h];
            const sparkVals = h === "Nakit" ? donemOzeti.sparkData : Array(14).fill(0);
            return (
              <div key={h} className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] p-4 hover:border-[#243050] transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color }}>
                    {HESAP_LABEL[h]}
                  </span>
                  <div className="w-5 h-5 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + "20" }}>
                    {h === "Nakit" ? <Coins size={11} style={{ color }} /> : <Building2 size={11} style={{ color }} />}
                  </div>
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <p className="text-lg font-black tracking-tight" style={{ color }}>₺{fmt(bakiye)}</p>
                    <p className="text-[9px] text-gray-600 mt-0.5">{h === "Nakit" ? "raporlardan" : "manuel işlemler"}</p>
                  </div>
                  <Sparkline values={sparkVals.filter(v => v > 0)} color={color} />
                </div>
              </div>
            );
          })}
          {/* Toplam */}
          <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-[#0c0f1a] p-4">
            <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-widest mb-3">Toplam Varlık</p>
            <p className="text-xl font-black text-blue-400 tracking-tight">₺{fmt(toplam)}</p>
            <p className="text-[9px] text-gray-600 mt-0.5">tüm hesaplar</p>
          </div>
        </div>

        {/* ── DÖNEM ANALİZİ ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-2xl border border-[#1a2236] bg-[#0c0f1a] p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-400" />
                <span className="text-sm font-semibold text-gray-200">Dönem Özeti</span>
                <span className="text-[10px] text-gray-600 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                  {filtreliRaporlar.length} rapor
                </span>
              </div>
              <div className="flex items-center gap-1.5 bg-[#080b14] border border-[#1a2236] px-3 py-1.5 rounded-xl">
                <Calendar size={11} className="text-gray-600" />
                <select value={secilenAy} onChange={e => setSecilenAy(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-gray-300 outline-none cursor-pointer">
                  {AYLAR.map(m => <option key={m.v} value={m.v} className="bg-[#0c0f1a]">{m.l}</option>)}
                </select>
                <span className="text-gray-700">/</span>
                <select value={secilenYil} onChange={e => setSecilenYil(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-gray-300 outline-none cursor-pointer">
                  {["2024", "2025", "2026", "2027"].map(y => <option key={y} value={y} className="bg-[#0c0f1a]">{y}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              {[
                { label: "Nakit Ciro", value: donemOzeti.nakitToplam, color: "text-blue-400", bg: "bg-blue-500/5 border-blue-500/10" },
                { label: "POS / Kart", value: donemOzeti.posToplam, color: "text-purple-400", bg: "bg-purple-500/5 border-purple-500/10" },
                { label: "Edenred", value: donemOzeti.edenredToplam, color: "text-amber-400", bg: "bg-amber-500/5 border-amber-500/10" },
                { label: "Gider + İade", value: donemOzeti.giderToplam + donemOzeti.manuelGider, color: "text-red-400", bg: "bg-red-500/5 border-red-500/10" },
              ].map(c => (
                <div key={c.label} className={`rounded-xl border ${c.bg} px-3 py-2.5`}>
                  <p className="text-[9px] text-gray-600 uppercase tracking-widest">{c.label}</p>
                  <p className={`text-sm font-black mt-0.5 ${c.color}`}>₺{fmt(c.value)}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="text-[10px] text-gray-600 mb-2">Günlük nakit ciro — {ayLabel} {secilenYil}</p>
              <div className="flex items-end gap-0.5 h-10">
                {donemOzeti.sparkData.map((v, i) => {
                  const max = Math.max(...donemOzeti.sparkData, 1);
                  return (
                    <div key={i} className="flex-1 rounded-t-sm transition-all"
                      style={{
                        height: `${Math.max((v / max) * 36, v > 0 ? 3 : 0)}px`,
                        backgroundColor: v > 0 ? "#3B82F6" : "#1a2236",
                        opacity: v > 0 ? 0.65 : 0.3,
                      }}
                      title={`${i + 1} ${ayLabel}: ₺${fmt(v)}`} />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Gider Dağılım Grafiği */}
          <div className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] p-5">
            <p className="text-sm font-semibold text-gray-200 mb-4">Gider Dağılımı</p>
            {kategoriDagilim.length === 0 ? (
              <p className="text-xs text-gray-600 text-center py-6">Bu dönemde gider yok</p>
            ) : (
              <div className="space-y-3">
                {kategoriDagilim.map(([kat, toplam]) => {
                  const maxVal = kategoriDagilim[0][1];
                  return (
                    <div key={kat}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[11px] text-gray-400 truncate max-w-[140px]">{kat}</span>
                        <span className="text-[11px] font-bold text-white">₺{fmt(toplam)}</span>
                      </div>
                      <div className="h-1.5 bg-[#1a2236] rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-red-500/60"
                          style={{ width: `${(toplam / maxVal) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── GÜNLÜK RAPOR KASA ÖZETİ TABLOSU ── */}
        <div className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] overflow-hidden shadow-xl">
          <div className="px-5 py-4 border-b border-[#1a2236]">
            <h3 className="text-sm font-semibold text-gray-200">Günlük Rapor Kasa Özeti</h3>
            <p className="text-[10px] text-gray-600 mt-0.5">{ayLabel} {secilenYil} · Rapor kaynaklı veriler</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-[#080b14] border-b border-[#1a2236]">
                  {["Tarih", "Nakit", "POS / Kart", "Edenred", "Gider", "İade", "Net Kasa", "Raporu Giren"].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0f1624]">
                {filtreliRaporlar.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-600 text-xs uppercase tracking-widest">Bu dönemde rapor yok</td></tr>
                ) : filtreliRaporlar.map(r => {
                  const netKasa = (r.kasa_nakit || 0) + (r.kasa_pos || 0) + (r.kasa_edenred || 0) - (r.gunluk_gider || 0) - (r.iade_tutar || 0);
                  return (
                    <tr key={r.id} className="hover:bg-white/[0.015] transition-colors">
                      <td className="px-4 py-3 font-semibold text-gray-300">{fmtTarih(r.tarih)}</td>
                      <td className="px-4 py-3 text-blue-400 font-bold">₺{fmt(r.kasa_nakit || 0)}</td>
                      <td className="px-4 py-3 text-purple-400 font-bold">₺{fmt(r.kasa_pos || 0)}</td>
                      <td className="px-4 py-3 text-amber-400">₺{fmt(r.kasa_edenred || 0)}</td>
                      <td className="px-4 py-3 text-red-400">{(r.gunluk_gider || 0) > 0 ? `-₺${fmt(r.gunluk_gider)}` : "—"}</td>
                      <td className="px-4 py-3 text-orange-400">{(r.iade_tutar || 0) > 0 ? `-₺${fmt(r.iade_tutar)}` : "—"}</td>
                      <td className={`px-4 py-3 font-black ${netKasa >= 0 ? "text-emerald-400" : "text-red-400"}`}>₺{fmt(netKasa)}</td>
                      <td className="px-4 py-3 text-gray-600 text-[10px]">{r.ekleyen_kullanici}</td>
                    </tr>
                  );
                })}
              </tbody>
              {filtreliRaporlar.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-[#1a2236] bg-[#080b14] font-black">
                    <td className="px-4 py-3 text-[10px] text-gray-600 uppercase">Dönem Toplamı</td>
                    <td className="px-4 py-3 text-blue-400">₺{fmt(donemOzeti.nakitToplam)}</td>
                    <td className="px-4 py-3 text-purple-400">₺{fmt(donemOzeti.posToplam)}</td>
                    <td className="px-4 py-3 text-amber-400">₺{fmt(donemOzeti.edenredToplam)}</td>
                    <td className="px-4 py-3 text-red-400">-₺{fmt(donemOzeti.giderToplam)}</td>
                    <td className="px-4 py-3 text-orange-400">-₺{fmt(filtreliRaporlar.reduce((s, r) => s + (r.iade_tutar || 0), 0))}</td>
                    <td className="px-4 py-3 text-emerald-400">₺{fmt(donemOzeti.nakitToplam + donemOzeti.posToplam + donemOzeti.edenredToplam - donemOzeti.giderToplam)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* ── MANUEL İŞLEMLER TABLOSU ── */}
        <div className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] overflow-hidden shadow-xl">
          <div className="px-5 py-4 border-b border-[#1a2236] space-y-3">
            <h3 className="text-sm font-semibold text-gray-200">Manuel İşlemler</h3>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                <input value={aramaMetni} onChange={e => setAramaMetni(e.target.value)} placeholder="Ara..." className="w-full bg-[#080b14] border border-[#1a2236] text-white text-xs h-8 pl-8 pr-3 rounded-xl outline-none" />
              </div>
              <div className="flex gap-1">
                {(["hepsi", "gelir", "gider", "transfer"] as const).map(t => (
                  <button key={t} onClick={() => setTipFiltre(t)} className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-colors ${tipFiltre === t ? "bg-white/10 text-white border-white/15" : "border-[#1a2236] text-gray-600"}`}>{t}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-[#080b14] border-b border-[#1a2236]">
                  {["Tarih", "Tip", "Hesap", "Kategori", "Açıklama", "Tutar", ""].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-[10px] font-semibold uppercase text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0f1624]">
                {filtreliManuel.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-600">Bu dönemde manuel işlem yok</td></tr>
                ) : filtreliManuel.map(i => (
                  <tr key={i.id} className="hover:bg-white/[0.015] transition-colors group">
                    <td className="px-4 py-3 text-gray-400">{fmtTarih(i.islem_tarihi)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-1 rounded-lg ${i.tip === "gelir" ? "bg-emerald-500/10 text-emerald-400" : i.tip === "gider" ? "bg-red-500/10 text-red-400" : "bg-blue-500/10 text-blue-400"}`}>{i.tip}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{i.hesap}{i.tip === "transfer" && i.hedef_hesap ? ` → ${i.hedef_hesap}` : ""}</td>
                    <td className="px-4 py-3 text-gray-500">{i.kategori}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-[160px] truncate">{i.aciklama || "—"}</td>
                    <td className={`px-4 py-3 font-black ${i.tip === "gelir" ? "text-emerald-400" : i.tip === "transfer" ? "text-blue-400" : "text-red-400"}`}>₺{fmt(i.tutar)}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setDeleteTarget(i.id)} className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-700 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"><Trash2 size={12} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* ── MANUEL İŞLEMLER FORMU ── */}
      {formAcik && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-[#1a2236] pb-2">
              <h3 className="text-sm font-bold text-white">Manuel Kasa İşlemi</h3>
              <button onClick={() => setFormAcik(false)} className="text-gray-600 hover:text-white"><X size={14} /></button>
            </div>
            <form onSubmit={handleIslemEkle} className="space-y-4">
              <div>
                <label className="block text-[10px] text-gray-600 uppercase mb-2">İşlem Türü</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["gider", "gelir", "transfer"] as const).map(t => (
                    <button key={t} type="button" onClick={() => { setIslemTipi(t); setKategori(t === "gelir" ? MANUEL_GELIR_KATEGORILERI[0] : MANUEL_GIDER_KATEGORILERI[0]); }}
                      className={`py-2.5 rounded-xl text-xs font-bold border transition-colors ${islemTipi === t ? "bg-blue-600 text-white" : "bg-[#080b14] text-gray-500"}`}>{t}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase mb-2">Tarih</label>
                <input type="date" value={islemTarihi} onChange={e => setIslemTarihi(e.target.value)} className="w-full bg-[#080b14] border border-[#1a2236] text-white text-sm font-bold h-9 rounded-xl px-3 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase mb-2">Hesap</label>
                  <select value={hesap} onChange={e => setHesap(e.target.value)} className="w-full bg-[#080b14] border border-[#1a2236] text-white text-xs h-9 rounded-xl px-3 outline-none">
                    {HESAPLAR.map(h => <option key={h} value={h}>{HESAP_LABEL[h]}</option>)}
                  </select>
                </div>
                {islemTipi === "transfer" ? (
                  <div>
                    <label className="block text-[10px] text-gray-600 uppercase mb-2">Hedef Hesap</label>
                    <select value={hedefHesap} onChange={e => setHedefHesap(e.target.value)} className="w-full bg-[#080b14] border border-[#1a2236] text-white text-xs h-9 rounded-xl px-3 outline-none">
                      {HESAPLAR.map(h => <option key={h} value={h}>{HESAP_LABEL[h]}</option>)}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] text-gray-600 uppercase mb-2">Kategori</label>
                    <select value={kategori} onChange={e => setKategori(e.target.value)} className="w-full bg-[#080b14] border border-[#1a2236] text-white text-xs h-9 rounded-xl px-3 outline-none">
                      {(islemTipi === "gelir" ? MANUEL_GELIR_KATEGORILERI : MANUEL_GIDER_KATEGORILERI).map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase mb-2">Tutar</label>
                <input type="text" placeholder="0,00" value={tutar} onChange={e => setTutar(e.target.value)} className="w-full bg-[#080b14] border border-[#1a2236] text-white text-sm h-9 px-3 rounded-xl outline-none" required />
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase mb-2">Açıklama</label>
                <input type="text" placeholder="Açıklama girin" value={aciklama} onChange={e => setAciklama(e.target.value)} className="w-full bg-[#080b14] border border-[#1a2236] text-white text-sm h-9 px-3 rounded-xl outline-none" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setFormAcik(false)} className="flex-1 text-xs text-gray-500 border border-[#1a2236] py-2 rounded-xl">İptal</button>
                <button type="submit" disabled={saving} className="flex-1 text-xs font-bold bg-emerald-600 text-white py-2 rounded-xl flex items-center justify-center gap-1">
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SİLME ONAY MODALI */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-[#0c0f1a] border border-red-500/30 rounded-2xl p-6 w-full max-w-sm">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <div>
                <p className="text-sm font-bold text-white">İşlemi Sil</p>
                <p className="text-[11px] text-gray-500">Bu işlem geri alınamaz</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 text-xs text-gray-400 border border-[#1a2236] py-2 rounded-xl">İptal</button>
              <button onClick={handleManuelSil} className="flex-1 text-xs font-bold text-white bg-red-600 py-2.5 rounded-xl">Sil</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}