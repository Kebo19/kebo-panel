"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  PlusCircle, Loader2, FileDown, RefreshCw, Calendar, ChevronDown,
  ChevronUp, Check, X, Trash2, AlertTriangle, TrendingDown, TrendingUp,
  Clock, CheckCircle2, AlertCircle, Search, BarChart3, Wallet
} from "lucide-react";

// ─── TYPES ────────────────────────────────────────────────────────────────────

// platform_tahsilatlar tablosu:
// id, platform, satis_tarihi, satis_tutari, beklenen_odeme_tarihi,
// gerceklesen_odeme_tarihi, gerceklesen_tutar, kesinti_tutari,
// durum ('bekliyor'|'kismen'|'tamamlandi'), aciklama, ekleyen, created_at

interface GunlukTahsilat {
  tarih: string;
  tutar: number;
  kesinti: number;
  aciklama?: string;
}

interface PlatformTahsilat {
  id: string;
  platform: string;
  satis_tarihi: string;
  satis_tutari: number;
  beklenen_odeme_tarihi: string;
  gerceklesen_odeme_tarihi?: string;
  gerceklesen_tutar?: number;
  kesinti_tutari?: number;
  durum: "bekliyor" | "kismen" | "tamamlandi";
  aciklama?: string;
  ekleyen_kullanici: string;
  created_at: string;
  gunluk_tahsilatlar?: GunlukTahsilat[]; // JSONB kolonu
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const PLATFORMLAR = [
  { isim: "Yemeksepeti", renk: "#FF6B35", gecikmeGun: 14 },
  { isim: "Getir",       renk: "#8B5CF6", gecikmeGun: 7  },
  { isim: "Trendyol",    renk: "#F97316", gecikmeGun: 14 },
  { isim: "Migros",      renk: "#10B981", gecikmeGun: 15 },
  { isim: "Alo Paket",   renk: "#3B82F6", gecikmeGun: 2  },
];

const PLATFORM_MAP = Object.fromEntries(PLATFORMLAR.map(p => [p.isim, p]));

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
const bugunStr = () => new Date().toISOString().split("T")[0];
const gunFarki = (t: string) => {
  const fark = Math.ceil((new Date(t).getTime() - new Date().getTime()) / 86400000);
  return fark;
};

// ─── DURUM BADGE ──────────────────────────────────────────────────────────────

function DurumBadge({ durum, beklenenTarih }: { durum: string; beklenenTarih: string }) {
  const gecti = beklenenTarih && new Date(beklenenTarih) < new Date() && durum === "bekliyor";
  if (gecti) return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg bg-red-500/15 text-red-400">
      <AlertCircle size={10} /> Gecikmiş
    </span>
  );
  if (durum === "tamamlandi") return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-400">
      <CheckCircle2 size={10} /> Tahsil Edildi
    </span>
  );
  if (durum === "kismen") return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-400">
      <Clock size={10} /> Kısmi
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg bg-blue-500/15 text-blue-400">
      <Clock size={10} /> Bekliyor
    </span>
  );
}

// ─── PLATFORM BADGE ───────────────────────────────────────────────────────────

function PlatformBadge({ platform }: { platform: string }) {
  const p = PLATFORM_MAP[platform];
  const renk = p?.renk || "#6B7280";
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg"
      style={{ backgroundColor: renk + "18", color: renk }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: renk }} />
      {platform}
    </span>
  );
}

// ─── CSV EXPORT ───────────────────────────────────────────────────────────────

function exportCSV(kayitlar: PlatformTahsilat[]) {
  const headers = ["Platform","Satış Tarihi","Satış Tutarı","Beklenen Ödeme","Gerçekleşen Tarih","Gerçekleşen Tutar","Kesinti","Fark","Durum","Açıklama"];
  const rows = kayitlar.map(k => {
    const fark = k.satis_tutari - (k.gerceklesen_tutar || 0) - (k.kesinti_tutari || 0);
    return [
      k.platform, fmtTarih(k.satis_tarihi), k.satis_tutari,
      fmtTarih(k.beklenen_odeme_tarihi), fmtTarih(k.gerceklesen_odeme_tarihi || ""),
      k.gerceklesen_tutar || 0, k.kesinti_tutari || 0, fark, k.durum, k.aciklama || ""
    ].join(",");
  });
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `KEBO_Platform_Tahsilat_${bugunStr()}.csv`; a.click();
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function PlatformTahsilatPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [kayitlar, setKayitlar] = useState<PlatformTahsilat[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Form state
  const [formAcik, setFormAcik] = useState(false);
  const [tahsilatFormAcik, setTahsilatFormAcik] = useState<string | null>(null); // kayıt id
  const [formMod, setFormMod] = useState<"yeni" | "duzenle">("yeni");
  const [editKayit, setEditKayit] = useState<PlatformTahsilat | null>(null);

  // Yeni kayıt form
  const [fPlatform, setFPlatform] = useState("Yemeksepeti");
  const [fSatisTarihi, setFSatisTarihi] = useState(bugunStr);
  const [fSatisTutari, setFSatisTutari] = useState("");
  const [fBeklenenTarih, setFBeklenenTarih] = useState("");
  const [fAciklama, setFAciklama] = useState("");

  // Tahsilat form — gün bazlı satır listesi
  const [tSatirlar, setTSatirlar] = useState<{id:number; tarih:string; tutar:string; kesinti:string; aciklama:string}[]>(
    [{ id: Date.now(), tarih: bugunStr(), tutar: "", kesinti: "", aciklama: "" }]
  );
  const [tDurum, setTDurum] = useState<"kismen" | "tamamlandi">("tamamlandi");

  // Filtreler
  const [secilenAy, setSecilenAy] = useState(() => String(new Date().getMonth() + 1).padStart(2, "0"));
  const [secilenYil, setSecilenYil] = useState(() => String(new Date().getFullYear()));
  const [platformFiltre, setPlatformFiltre] = useState("hepsi");
  const [durumFiltre, setDurumFiltre] = useState("hepsi");
  const [aramaMetni, setAramaMetni] = useState("");
  const [ozet, setOzet] = useState(true);

  // ── Veri çek ──
  const veriCek = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setIsAdmin(user?.email === "murat@kebo.com" || user?.email === "bulent@kebo.com");
    const { data } = await supabase.from("platform_tahsilatlar").select("*").order("satis_tarihi", { ascending: false });
    if (data) setKayitlar(data as PlatformTahsilat[]);
    setLoading(false);
  }, []);

  useEffect(() => { veriCek(); }, [veriCek]);

  // Platform seçilince varsayılan ödeme tarihini doldur
  const handlePlatformSec = (p: string) => {
    setFPlatform(p);
    if (fSatisTarihi) {
      const gecikme = PLATFORM_MAP[p]?.gecikmeGun || 7;
      const dt = new Date(fSatisTarihi);
      dt.setDate(dt.getDate() + gecikme);
      setFBeklenenTarih(dt.toISOString().split("T")[0]);
    }
  };

  const handleSatisTarihiSec = (t: string) => {
    setFSatisTarihi(t);
    if (t && fPlatform) {
      const gecikme = PLATFORM_MAP[fPlatform]?.gecikmeGun || 7;
      const dt = new Date(t); dt.setDate(dt.getDate() + gecikme);
      setFBeklenenTarih(dt.toISOString().split("T")[0]);
    }
  };

  // ── Yeni satış kaydı ekle ──
  const handleYeniKayit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tutar = parseFloat(fSatisTutari.replace(/\./g, "").replace(",", "."));
    if (!tutar || tutar <= 0) { alert("Geçerli bir satış tutarı girin!"); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const ekleyen = user?.email?.split("@")[0] || "Bilinmiyor";
      const { error } = await supabase.from("platform_tahsilatlar").insert([{
        platform: fPlatform,
        satis_tarihi: fSatisTarihi,
        satis_tutari: tutar,
        beklenen_odeme_tarihi: fBeklenenTarih,
        durum: "bekliyor",
        aciklama: fAciklama,
        ekleyen_kullanici: ekleyen,
      }]);
      if (error) { alert("Hata: " + error.message); return; }
      setFormAcik(false);
      setFPlatform("Yemeksepeti"); setFSatisTarihi(bugunStr()); setFSatisTutari(""); setFBeklenenTarih(""); setFAciklama("");
      veriCek();
    } finally { setSaving(false); }
  };

  // ── Tahsilat satırı ekle / sil / değiştir (gün bazlı) ──
  const tSatirEkle = () => setTSatirlar(prev => [...prev, { id: Date.now(), tarih: bugunStr(), tutar: "", kesinti: "", aciklama: "" }]);
  const tSatirSil = (id: number) => setTSatirlar(prev => prev.filter(s => s.id !== id));
  const tSatirDegistir = (id: number, field: string, val: string) =>
    setTSatirlar(prev => prev.map(s => s.id === id ? { ...s, [field]: val } : s));

  // ── Tahsilat işle ──
  const handleTahsilatEkle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tahsilatFormAcik) return;
    const kayit = kayitlar.find(k => k.id === tahsilatFormAcik);
    if (!kayit) return;

    // Dolu satırları al
    const dolSatirlar = tSatirlar.filter(s => s.tutar && parseFloat(s.tutar.replace(/\./g,"").replace(",",".")) > 0);
    if (dolSatirlar.length === 0) { alert("En az bir tahsilat satırı girin!"); return; }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const ekleyen = user?.email?.split("@")[0] || "Bilinmiyor";
      const hesap = kayit.platform === "Alo Paket" ? "Nakit" : "TEB";

      // Mevcut gunluk_tahsilatlar'ı al ve yenileri ekle
      const mevcutGunluk: GunlukTahsilat[] = kayit.gunluk_tahsilatlar || [];
      const yeniGunluk: GunlukTahsilat[] = dolSatirlar.map(s => ({
        tarih: s.tarih,
        tutar: parseFloat(s.tutar.replace(/\./g,"").replace(",",".")),
        kesinti: parseFloat(s.kesinti.replace(/\./g,"").replace(",",".") || "0") || 0,
        aciklama: s.aciklama || "",
      }));
      const tumGunluk = [...mevcutGunluk, ...yeniGunluk];

      // Toplam hesapla
      const toplamYatan = tumGunluk.reduce((s, g) => s + g.tutar, 0);
      const toplamKesinti = tumGunluk.reduce((s, g) => s + g.kesinti, 0);
      // Son tahsilat tarihi
      const sonTarih = tumGunluk.sort((a, b) => b.tarih.localeCompare(a.tarih))[0]?.tarih;

      const { error } = await supabase.from("platform_tahsilatlar").update({
        gunluk_tahsilatlar: tumGunluk,
        gerceklesen_tutar: toplamYatan,
        kesinti_tutari: toplamKesinti,
        gerceklesen_odeme_tarihi: sonTarih,
        durum: tDurum,
      }).eq("id", tahsilatFormAcik);
      if (error) { alert("Hata: " + error.message); return; }

      // Her yeni tahsilat satırını kasaya ayrı ayrı ekle
      const kasaKayitlari = yeniGunluk.map(g => ({
        tip: "gelir",
        hesap,
        kategori: kayit.platform,
        tutar: g.tutar,
        aciklama: `Platform tahsilatı — ${kayit.platform} (Satış: ${fmtTarih(kayit.satis_tarihi)})${g.aciklama ? " / " + g.aciklama : ""}`,
        ekleyen_kullanici: ekleyen,
        created_at: new Date(g.tarih + "T12:00:00").toISOString(),
      }));
      await supabase.from("kasa_hareketleri").insert(kasaKayitlari);

      setTahsilatFormAcik(null);
      setTSatirlar([{ id: Date.now(), tarih: bugunStr(), tutar: "", kesinti: "", aciklama: "" }]);
      setTDurum("tamamlandi");
      veriCek();
    } finally { setSaving(false); }
  };

  // ── Sil ──
  const handleSil = async () => {
    if (!deleteTarget) return;
    await supabase.from("platform_tahsilatlar").delete().eq("id", deleteTarget);
    setDeleteTarget(null); veriCek();
  };

  // ── Filtrelenmiş kayıtlar ──
  const filtreliKayitlar = useMemo(() => {
    return kayitlar.filter(k => {
      const d = new Date(k.satis_tarihi);
      const ayM = String(d.getMonth() + 1).padStart(2, "0");
      const yilM = String(d.getFullYear());
      if (ayM !== secilenAy || yilM !== secilenYil) return false;
      if (platformFiltre !== "hepsi" && k.platform !== platformFiltre) return false;
      if (durumFiltre !== "hepsi") {
        const gecti = new Date(k.beklenen_odeme_tarihi) < new Date() && k.durum === "bekliyor";
        if (durumFiltre === "gecmis" && !gecti) return false;
        if (durumFiltre !== "gecmis" && k.durum !== durumFiltre) return false;
      }
      if (aramaMetni) {
        const q = aramaMetni.toLowerCase();
        if (!k.platform.toLowerCase().includes(q) && !k.aciklama?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [kayitlar, secilenAy, secilenYil, platformFiltre, durumFiltre, aramaMetni]);

  // ── Özet istatistikler ──
  const istatistik = useMemo(() => {
    let toplamSatis = 0, toplamYatan = 0, toplamKesinti = 0, bekleyenAdet = 0, gecmisAdet = 0;
    filtreliKayitlar.forEach(k => {
      toplamSatis += k.satis_tutari;
      toplamYatan += k.gerceklesen_tutar || 0;
      toplamKesinti += k.kesinti_tutari || 0;
      if (k.durum !== "tamamlandi") {
        bekleyenAdet++;
        if (new Date(k.beklened_odeme_tarihi) < new Date()) gecmisAdet++;
      }
    });
    const bekleyenTutar = filtreliKayitlar.filter(k => k.durum !== "tamamlandi").reduce((s, k) => s + k.satis_tutari, 0);
    const gecikmisTutar = filtreliKayitlar.filter(k => k.durum === "bekliyor" && new Date(k.beklenen_odeme_tarihi) < new Date()).reduce((s, k) => s + k.satis_tutari, 0);
    return { toplamSatis, toplamYatan, toplamKesinti, bekleyenAdet, bekleyenTutar, gecikmisTutar };
  }, [filtreliKayitlar]);

  // Platform bazlı özet
  const platformOzet = useMemo(() => {
    const map: Record<string, { satis: number; yatan: number; kesinti: number; adet: number; bekleyen: number }> = {};
    filtreliKayitlar.forEach(k => {
      if (!map[k.platform]) map[k.platform] = { satis: 0, yatan: 0, kesinti: 0, adet: 0, bekleyen: 0 };
      map[k.platform].satis += k.satis_tutari;
      map[k.platform].yatan += k.gerceklesen_tutar || 0;
      map[k.platform].kesinti += k.kesinti_tutari || 0;
      map[k.platform].adet++;
      if (k.durum !== "tamamlandi") map[k.platform].bekleyen += k.satis_tutari;
    });
    return Object.entries(map).sort((a, b) => b[1].satis - a[1].satis);
  }, [filtreliKayitlar]);

  if (loading) return (
    <div className="h-screen bg-[#060810] flex flex-col items-center justify-center gap-3">
      <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      <span className="text-[10px] text-gray-600 uppercase tracking-[0.3em]">Yükleniyor</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#060810] text-white font-sans antialiased">

      {/* ── HEADER ── */}
      <div className="sticky top-0 z-40 border-b border-[#0f1624] bg-[#060810]/95 backdrop-blur-xl">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-purple-600 flex items-center justify-center shadow-lg shadow-purple-900/40">
              <Wallet className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-white leading-none">Platform Tahsilat Takibi</h1>
              <p className="text-[10px] text-gray-600 leading-none mt-0.5">Online platform ödemeleri ve kesinti analizi</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => exportCSV(filtreliKayitlar)}
              className="hidden sm:flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-emerald-400 border border-[#1a2236] hover:border-emerald-500/30 px-3 py-2 rounded-xl transition-colors">
              <FileDown size={13} /> CSV
            </button>
            <button onClick={veriCek}
              className="p-2 text-gray-600 hover:text-white border border-[#1a2236] hover:border-[#2a3550] rounded-xl transition-colors">
              <RefreshCw size={14} />
            </button>
            <button onClick={() => setFormAcik(true)}
              className="flex items-center gap-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-xl transition-colors shadow-lg shadow-purple-900/30">
              <PlusCircle size={14} /> Satış Kaydı Ekle
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-5 space-y-5">

        {/* ── KRİTİK UYARILAR ── */}
        {istatistik.gecikmisTutar > 0 && (
          <div className="rounded-2xl border border-red-500/20 bg-[#130a0a] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 shrink-0">
                <AlertTriangle className="h-4 w-4 text-red-400 animate-pulse" />
              </div>
              <div>
                <p className="text-xs font-bold text-red-400 uppercase tracking-widest">Gecikmiş Tahsilat</p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Vadesi geçmiş toplam: <strong className="text-red-300">₺{fmt(istatistik.gecikmisTutar)}</strong> — ilgili platformlarla iletişime geçin
                </p>
              </div>
            </div>
            <button onClick={() => setDurumFiltre("gecmis")}
              className="shrink-0 text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded-xl transition-colors">
              Gecikmiş Göster
            </button>
          </div>
        )}

        {/* ── ÖZETLERİ PLATFORM BAZINDA ── */}
        <div className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] overflow-hidden">
          <button onClick={() => setOzet(!ozet)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <BarChart3 className="h-3.5 w-3.5 text-purple-400" />
              </div>
              <span className="text-sm font-semibold text-gray-200">Dönem Özeti</span>
              {/* Dönem filtresi inline */}
              <div onClick={e => e.stopPropagation()} className="flex items-center gap-1.5 bg-[#080b14] border border-[#1a2236] px-3 py-1 rounded-xl">
                <Calendar size={11} className="text-gray-600" />
                <select value={secilenAy} onChange={e => setSecilenAy(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-gray-300 outline-none cursor-pointer">
                  {AYLAR.map(m => <option key={m.v} value={m.v} className="bg-[#0c0f1a]">{m.l}</option>)}
                </select>
                <span className="text-gray-700">/</span>
                <select value={secilenYil} onChange={e => setSecilenYil(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-gray-300 outline-none cursor-pointer">
                  {["2024","2025","2026","2027"].map(y => <option key={y} value={y} className="bg-[#0c0f1a]">{y}</option>)}
                </select>
              </div>
            </div>
            {ozet ? <ChevronUp className="h-4 w-4 text-gray-600" /> : <ChevronDown className="h-4 w-4 text-gray-600" />}
          </button>

          {ozet && (
            <div className="border-t border-[#1a2236] p-5 space-y-5">
              {/* KPI kartları */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: "Toplam Satış", value: `₺${fmt(istatistik.toplamSatis)}`, color: "text-blue-400", bg: "bg-blue-500/5 border-blue-500/10" },
                  { label: "Tahsil Edilen", value: `₺${fmt(istatistik.toplamYatan)}`, color: "text-emerald-400", bg: "bg-emerald-500/5 border-emerald-500/10" },
                  { label: "Bekleyen", value: `₺${fmt(istatistik.bekleyenTutar)}`, color: "text-amber-400", bg: "bg-amber-500/5 border-amber-500/10" },
                  { label: "Toplam Kesinti", value: `₺${fmt(istatistik.toplamKesinti)}`, color: "text-red-400", bg: "bg-red-500/5 border-red-500/10" },
                ].map(c => (
                  <div key={c.label} className={`rounded-xl border ${c.bg} px-4 py-3`}>
                    <p className="text-[10px] text-gray-600 uppercase tracking-widest">{c.label}</p>
                    <p className={`text-base font-black mt-0.5 ${c.color}`}>{c.value}</p>
                  </div>
                ))}
              </div>

              {/* Platform bazlı tablo */}
              {platformOzet.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-[#1a2236]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[#080b14] border-b border-[#1a2236]">
                        {["Platform", "Toplam Satış", "Tahsil Edilen", "Kesinti", "Fark / Kayıp", "Bekleyen", "Durum"].map((h, i) => (
                          <th key={i} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-gray-600">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#0f1624]">
                      {platformOzet.map(([platform, d]) => {
                        const fark = d.satis - d.yatan - d.kesinti;
                        const pct = d.satis > 0 ? Math.round((d.yatan / d.satis) * 100) : 0;
                        const renk = PLATFORM_MAP[platform]?.renk || "#6B7280";
                        return (
                          <tr key={platform} className="hover:bg-white/[0.02]">
                            <td className="px-4 py-3"><PlatformBadge platform={platform} /></td>
                            <td className="px-4 py-3 text-gray-300 font-semibold">₺{fmt(d.satis)}</td>
                            <td className="px-4 py-3 text-emerald-400 font-bold">₺{fmt(d.yatan)}</td>
                            <td className="px-4 py-3 text-red-400">₺{fmt(d.kesinti)}</td>
                            <td className="px-4 py-3">
                              <span className={`font-bold ${fark > 0 ? "text-amber-400" : "text-gray-600"}`}>
                                {fark > 0 ? `-₺${fmt(fark)}` : "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-amber-400 font-semibold">
                              {d.bekleyen > 0 ? `₺${fmt(d.bekleyen)}` : <span className="text-gray-600">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-[#1a2236] rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: renk }} />
                                </div>
                                <span className="text-[10px] text-gray-500 w-8">{pct}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── DETAY LİSTESİ ── */}
        <div className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] overflow-hidden shadow-xl">
          {/* Filtreler */}
          <div className="px-5 py-4 border-b border-[#1a2236] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-gray-200">Satış & Tahsilat Detayları</h3>
              <div className="flex sm:hidden gap-1">
                <button onClick={() => exportCSV(filtreliKayitlar)} className="text-[10px] text-gray-600 hover:text-emerald-400 border border-[#1a2236] px-2.5 py-1.5 rounded-lg transition-colors">CSV</button>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                <input value={aramaMetni} onChange={e => setAramaMetni(e.target.value)}
                  placeholder="Platform veya not ara..."
                  className="w-full bg-[#080b14] border border-[#1a2236] text-white text-xs h-8 pl-8 pr-3 rounded-xl outline-none focus:border-purple-500/40 placeholder:text-gray-700" />
              </div>
              <select value={platformFiltre} onChange={e => setPlatformFiltre(e.target.value)}
                className="bg-[#080b14] border border-[#1a2236] text-gray-300 text-xs h-8 px-3 rounded-xl outline-none cursor-pointer">
                <option value="hepsi">Tüm Platformlar</option>
                {PLATFORMLAR.map(p => <option key={p.isim} value={p.isim} className="bg-[#0c0f1a]">{p.isim}</option>)}
              </select>
              <select value={durumFiltre} onChange={e => setDurumFiltre(e.target.value)}
                className="bg-[#080b14] border border-[#1a2236] text-gray-300 text-xs h-8 px-3 rounded-xl outline-none cursor-pointer">
                <option value="hepsi">Tüm Durumlar</option>
                <option value="bekliyor" className="bg-[#0c0f1a]">Bekliyor</option>
                <option value="kismen" className="bg-[#0c0f1a]">Kısmi Tahsil</option>
                <option value="tamamlandi" className="bg-[#0c0f1a]">Tamamlandı</option>
                <option value="gecmis" className="bg-[#0c0f1a]">Gecikmiş</option>
              </select>
            </div>
          </div>

          {/* Tablo */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#080b14] border-b border-[#1a2236]">
                  {["Platform", "Satış Tarihi", "Satış Tutarı", "Beklenen Ödeme", "Gerçekleşen", "Yatan Tutar", "Kesinti", "Net Fark", "Durum", ""].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0f1624]">
                {filtreliKayitlar.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-600 text-xs uppercase tracking-widest">Bu dönemde kayıt bulunmuyor</td></tr>
                ) : filtreliKayitlar.map(k => {
                  const fark = k.satis_tutari - (k.gerceklesen_tutar || 0) - (k.kesinti_tutari || 0);
                  const gecti = new Date(k.beklenen_odeme_tarihi) < new Date() && k.durum === "bekliyor";
                  const vadeyeKalanGun = gunFarki(k.beklenen_odeme_tarihi);
                  return (
                    <tr key={k.id} className="hover:bg-white/[0.015] transition-colors group">
                      <td className="px-4 py-3"><PlatformBadge platform={k.platform} /></td>
                      <td className="px-4 py-3 text-gray-400">{fmtTarih(k.satis_tarihi)}</td>
                      <td className="px-4 py-3 text-white font-bold">₺{fmt(k.satis_tutari)}</td>
                      <td className="px-4 py-3">
                        <span className={`${gecti ? "text-red-400" : "text-gray-400"}`}>
                          {fmtTarih(k.beklenen_odeme_tarihi)}
                        </span>
                        {k.durum === "bekliyor" && (
                          <span className={`block text-[10px] mt-0.5 ${gecti ? "text-red-500" : vadeyeKalanGun <= 3 ? "text-amber-500" : "text-gray-600"}`}>
                            {gecti ? `${Math.abs(vadeyeKalanGun)} gün geçti` : vadeyeKalanGun === 0 ? "Bugün!" : `${vadeyeKalanGun} gün kaldı`}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{fmtTarih(k.gerceklesen_odeme_tarihi || "")}</td>
                      <td className="px-4 py-3 text-emerald-400 font-bold">
                        {k.gerceklesen_tutar ? `₺${fmt(k.gerceklesen_tutar)}` : <span className="text-gray-700">—</span>}
                      </td>
                      <td className="px-4 py-3 text-red-400">
                        {k.kesinti_tutari ? `-₺${fmt(k.kesinti_tutari)}` : <span className="text-gray-700">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {k.durum === "tamamlandi" ? (
                          <span className={`font-bold text-xs ${fark > 1 ? "text-red-400" : "text-emerald-400"}`}>
                            {fark > 1 ? `-₺${fmt(fark)}` : "✓ Tam"}
                          </span>
                        ) : <span className="text-gray-700">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <DurumBadge durum={k.durum} beklenenTarih={k.beklenen_odeme_tarihi} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {k.durum !== "tamamlandi" && (
                            <button onClick={() => { setTahsilatFormAcik(k.id); setTGerceklesenTarih(bugunStr()); setTGerceklesenTutar(String(k.satis_tutari)); setTKesinti(""); }}
                              className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap">
                              Tahsilat İşle
                            </button>
                          )}
                          {isAdmin && (
                            <button onClick={() => setDeleteTarget(k.id)}
                              className="p-1.5 text-gray-700 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Platform ödeme süreleri bilgi kartı */}
        <div className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Platform Varsayılan Ödeme Süreleri</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {PLATFORMLAR.map(p => (
              <div key={p.isim} className="rounded-xl border border-[#1a2236] bg-[#080b14] px-3 py-2 text-center">
                <div className="w-2 h-2 rounded-full mx-auto mb-1.5" style={{ backgroundColor: p.renk }} />
                <p className="text-[11px] font-semibold text-gray-300">{p.isim}</p>
                <p className="text-xs font-black mt-0.5" style={{ color: p.renk }}>{p.gecikmeGun} gün</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-between py-1">
          <p className="text-[10px] text-gray-700">KEBO ERP · Platform Tahsilat Takibi</p>
        </div>
      </div>

      {/* ── YENİ SATIŞ KAYDI FORMU ── */}
      {formAcik && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1a2236] flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <PlusCircle className="h-4 w-4 text-purple-400" /> Yeni Satış Kaydı
              </h3>
              <button onClick={() => setFormAcik(false)} className="p-1.5 text-gray-600 hover:text-white border border-[#1a2236] rounded-xl transition-colors"><X size={14} /></button>
            </div>
            <form onSubmit={handleYeniKayit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase tracking-widest font-medium mb-2">Platform</label>
                  <select value={fPlatform} onChange={e => handlePlatformSec(e.target.value)}
                    className="w-full bg-[#080b14] border border-[#1a2236] text-white text-xs h-9 rounded-xl px-3 outline-none focus:border-purple-500/50">
                    {PLATFORMLAR.map(p => <option key={p.isim} value={p.isim} className="bg-[#0c0f1a]">{p.isim}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase tracking-widest font-medium mb-2">Satış Tarihi</label>
                  <input type="date" value={fSatisTarihi} onChange={e => handleSatisTarihiSec(e.target.value)}
                    className="w-full bg-[#080b14] border border-[#1a2236] text-white text-xs h-9 rounded-xl px-3 outline-none focus:border-purple-500/50" required />
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-widest font-medium mb-2">Satış Tutarı (Brüt)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-sm font-bold">₺</span>
                  <input type="text" placeholder="0,00" value={fSatisTutari}
                    onChange={e => setFSatisTutari(e.target.value)}
                    className="w-full bg-[#080b14] border border-[#1a2236] text-white text-base font-black h-11 pl-8 pr-3 rounded-xl outline-none focus:border-purple-500/50" required />
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-widest font-medium mb-2">
                  Beklenen Ödeme Tarihi
                  <span className="normal-case text-gray-700 ml-1">({PLATFORM_MAP[fPlatform]?.gecikmeGun} gün otomatik)</span>
                </label>
                <input type="date" value={fBeklenenTarih} onChange={e => setFBeklenenTarih(e.target.value)}
                  className="w-full bg-[#080b14] border border-[#1a2236] text-white text-xs h-9 rounded-xl px-3 outline-none focus:border-purple-500/50" required />
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-widest font-medium mb-2">Not (Opsiyonel)</label>
                <input type="text" placeholder="Referans no, açıklama..." value={fAciklama}
                  onChange={e => setFAciklama(e.target.value)}
                  className="w-full bg-[#080b14] border border-[#1a2236] text-white text-sm h-9 px-3 rounded-xl outline-none focus:border-purple-500/50 placeholder:text-gray-700" />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setFormAcik(false)}
                  className="flex-1 text-xs font-semibold text-gray-500 hover:text-white border border-[#1a2236] py-2.5 rounded-xl transition-colors">İptal</button>
                <button type="submit" disabled={saving}
                  className="flex-1 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-40 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors">
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── TAHSİLAT İŞLE FORMU — GÜN BAZLI ── */}
      {tahsilatFormAcik && (() => {
        const ak = kayitlar.find(k => k.id === tahsilatFormAcik);
        if (!ak) return null;
        const mevcutToplam = (ak.gunluk_tahsilatlar || []).reduce((s, g) => s + g.tutar, 0);
        const mevcutKesinti = (ak.gunluk_tahsilatlar || []).reduce((s, g) => s + g.kesinti, 0);
        const yeniToplam = tSatirlar.filter(s => s.tutar).reduce((s, x) => s + (parseFloat(x.tutar.replace(/\./g,"").replace(",",".")) || 0), 0);
        const yeniKesinti = tSatirlar.filter(s => s.kesinti).reduce((s, x) => s + (parseFloat(x.kesinti.replace(/\./g,"").replace(",",".")) || 0), 0);
        const genelToplam = mevcutToplam + yeniToplam;
        const genelKesinti = mevcutKesinti + yeniKesinti;
        const kalan = ak.satis_tutari - genelToplam - genelKesinti;
        return (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="px-5 py-4 border-b border-[#1a2236] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <PlatformBadge platform={ak.platform} /> Tahsilat Girişi
                  </h3>
                  <p className="text-[10px] text-gray-600 mt-1">
                    Satış: {fmtTarih(ak.satis_tarihi)} · Brüt: <strong className="text-white">₺{fmt(ak.satis_tutari)}</strong>
                    {mevcutToplam > 0 && <> · Daha önce yatan: <strong className="text-emerald-400">₺{fmt(mevcutToplam)}</strong></>}
                  </p>
                </div>
                <button onClick={() => setTahsilatFormAcik(null)} className="p-1.5 text-gray-600 hover:text-white border border-[#1a2236] rounded-xl transition-colors"><X size={14} /></button>
              </div>

              <form onSubmit={handleTahsilatEkle} className="p-5 space-y-4">

                {/* Mevcut tahsilat geçmişi */}
                {ak.gunluk_tahsilatlar && ak.gunluk_tahsilatlar.length > 0 && (
                  <div className="rounded-xl border border-[#1a2236] bg-[#080b14] overflow-hidden">
                    <div className="px-3 py-2 border-b border-[#1a2236]">
                      <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Önceki Tahsilatlar</p>
                    </div>
                    <div className="divide-y divide-[#0f1624]">
                      {ak.gunluk_tahsilatlar.map((g, i) => (
                        <div key={i} className="grid grid-cols-3 gap-2 px-3 py-2 text-xs">
                          <span className="text-gray-500">{fmtTarih(g.tarih)}</span>
                          <span className="text-emerald-400 font-bold">₺{fmt(g.tutar)}</span>
                          <span className="text-red-400/70">{g.kesinti > 0 ? `-₺${fmt(g.kesinti)}` : "—"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Yeni tahsilat satırları */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] text-gray-600 uppercase tracking-widest font-medium">Yeni Tahsilat Satırları</label>
                    <button type="button" onClick={tSatirEkle}
                      className="text-[10px] text-gray-600 hover:text-emerald-400 border border-[#1a2236] hover:border-emerald-500/30 px-2 py-1 rounded-lg transition-colors flex items-center gap-1">
                      + Gün Ekle
                    </button>
                  </div>
                  <div className="space-y-2">
                    {/* Başlık */}
                    <div className="grid grid-cols-12 gap-1.5 px-1">
                      <span className="col-span-3 text-[9px] text-gray-700 uppercase tracking-wider">Tarih</span>
                      <span className="col-span-3 text-[9px] text-gray-700 uppercase tracking-wider">Yatan ₺</span>
                      <span className="col-span-3 text-[9px] text-gray-700 uppercase tracking-wider">Kesinti ₺</span>
                      <span className="col-span-3 text-[9px] text-gray-700 uppercase tracking-wider">Not</span>
                    </div>
                    {tSatirlar.map((s, idx) => (
                      <div key={s.id} className="grid grid-cols-12 gap-1.5 items-center bg-[#080b14] border border-[#1a2236] rounded-xl p-2">
                        {/* Tarih */}
                        <div className="col-span-3">
                          <input type="date" value={s.tarih}
                            onChange={e => tSatirDegistir(s.id, "tarih", e.target.value)}
                            className="w-full bg-[#0c0f1a] border border-[#1a2236] text-white text-[11px] h-7 rounded-lg px-1.5 outline-none focus:border-emerald-500/40"/>
                        </div>
                        {/* Yatan tutar */}
                        <div className="col-span-3 relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-600 text-[10px]">₺</span>
                          <input type="text" placeholder="0" value={s.tutar}
                            onChange={e => tSatirDegistir(s.id, "tutar", e.target.value)}
                            className="w-full bg-[#0c0f1a] border border-[#1a2236] text-white text-xs font-bold h-7 pl-5 pr-1 rounded-lg outline-none focus:border-emerald-500/40"/>
                        </div>
                        {/* Kesinti */}
                        <div className="col-span-3 relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-600 text-[10px]">₺</span>
                          <input type="text" placeholder="0" value={s.kesinti}
                            onChange={e => tSatirDegistir(s.id, "kesinti", e.target.value)}
                            className="w-full bg-[#0c0f1a] border border-[#1a2236] text-white text-xs h-7 pl-5 pr-1 rounded-lg outline-none focus:border-red-500/30"/>
                        </div>
                        {/* Not + sil */}
                        <div className="col-span-3 flex gap-1">
                          <input type="text" placeholder="Not..." value={s.aciklama}
                            onChange={e => tSatirDegistir(s.id, "aciklama", e.target.value)}
                            className="flex-1 bg-[#0c0f1a] border border-[#1a2236] text-white text-[10px] h-7 px-2 rounded-lg outline-none focus:border-blue-500/30 placeholder:text-gray-700 min-w-0"/>
                          {tSatirlar.length > 1 && (
                            <button type="button" onClick={() => tSatirSil(s.id)}
                              className="text-gray-700 hover:text-red-400 p-1 rounded shrink-0">
                              <Trash2 size={11}/>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Özet */}
                <div className="rounded-xl border border-[#1a2236] bg-[#080b14] p-3 grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-[9px] text-gray-600 uppercase tracking-widest">Toplam Yatan</p>
                    <p className="text-sm font-black text-emerald-400 mt-0.5">₺{fmt(genelToplam)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-gray-600 uppercase tracking-widest">Toplam Kesinti</p>
                    <p className="text-sm font-black text-red-400 mt-0.5">₺{fmt(genelKesinti)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-gray-600 uppercase tracking-widest">Kalan</p>
                    <p className={`text-sm font-black mt-0.5 ${kalan > 0 ? "text-amber-400" : "text-gray-600"}`}>
                      {kalan > 0 ? `₺${fmt(kalan)}` : "✓ Tam"}
                    </p>
                  </div>
                </div>

                {/* Durum */}
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase tracking-widest font-medium mb-2">Durum</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["tamamlandi", "kismen"] as const).map(t => (
                      <button key={t} type="button" onClick={() => setTDurum(t)}
                        className={`text-xs font-bold py-2.5 rounded-xl border transition-colors ${tDurum === t
                          ? t === "tamamlandi" ? "bg-emerald-600 border-emerald-500 text-white" : "bg-amber-600 border-amber-500 text-white"
                          : "bg-[#080b14] border-[#1a2236] text-gray-500 hover:text-gray-300"}`}>
                        {t === "tamamlandi" ? "✓ Tamamlandı" : "⏳ Kısmi (Devam Edecek)"}
                      </button>
                    ))}
                  </div>
                </div>

                {tDurum === "tamamlandi" && (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5 text-[11px] text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 size={12} className="shrink-0" />
                    Yatılan tutarlar otomatik olarak kasa hesabına eklenecek.
                  </div>
                )}

                <div className="flex gap-2">
                  <button type="button" onClick={() => setTahsilatFormAcik(null)}
                    className="flex-1 text-xs font-semibold text-gray-500 hover:text-white border border-[#1a2236] py-2.5 rounded-xl transition-colors">İptal</button>
                  <button type="submit" disabled={saving}
                    className="flex-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors">
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Kaydet
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* ── SİLME ONAY ── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-[#0c0f1a] border border-red-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Kaydı Sil</p>
                <p className="text-[11px] text-gray-500">Bu işlem geri alınamaz</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 text-xs font-semibold text-gray-400 border border-[#1a2236] hover:text-white py-2.5 rounded-xl transition-colors">İptal</button>
              <button onClick={handleSil} className="flex-1 text-xs font-bold text-white bg-red-600 hover:bg-red-700 py-2.5 rounded-xl transition-colors">Sil</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
