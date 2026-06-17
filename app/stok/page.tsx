"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import {
  Package, PlusCircle, Search, Filter, AlertTriangle, TrendingDown,
  TrendingUp, Truck, ClipboardCheck, Loader2, X, Save, Edit3, Trash2,
  RefreshCw, Layers, BarChart3, Calendar, ChevronDown, ChevronUp,
  CheckCircle2, Eye, ArrowUpRight, ArrowDownRight, Zap, Bell,
  Box, Activity, Plus, Minus, FileSpreadsheet
} from "lucide-react";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface Urun {
  id: string;
  urun_adi: string;
  kategori: string | null;
  birim: string;
  min_stok: number;
  mevcut_stok: number;
  son_fiyat: number | null;
  durum: string;
  notlar: string | null;
  updated_at: string;
}

interface Hareket {
  id: string;
  urun_id: string;
  tarih: string;
  tip: "sayim" | "giris" | "cikis" | "duzeltme";
  miktar: number;
  kaynak: string | null;
  aciklama: string | null;
  kullanici: string | null;
  created_at: string;
}

interface Kategori {
  id: string;
  ad: string;
  renk: string;
  sira: number;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const fmt = (v: number, decimals = 1): string =>
  new Intl.NumberFormat("tr-TR", { maximumFractionDigits: decimals, minimumFractionDigits: 0 }).format(v);
const fmtTarih = (t: string) => { if(!t) return ""; const [y,m,d]=t.split("-"); return `${d}.${m}.${y}`; };
const bugun = () => new Date().toISOString().split("T")[0];

const BIRIMLER = ["kg", "gr", "lt", "ml", "adet", "koli", "paket", "düzine", "torba", "kova", "şişe"];

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function StokPage() {
  const supabase = createClient();

  // ── Auth & Data ──
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [urunler, setUrunler] = useState<Urun[]>([]);
  const [hareketler, setHareketler] = useState<Hareket[]>([]);
  const [kategoriler, setKategoriler] = useState<Kategori[]>([]);

  // ── Filters ──
  const [arama, setArama] = useState("");
  const [filtreKategori, setFiltreKategori] = useState("");
  const [sadeceKritik, setSadeceKritik] = useState(false);

  // ── Modals ──
  const [yeniUrunAcik, setYeniUrunAcik] = useState(false);
  const [duzenleUrun, setDuzenleUrun] = useState<Urun | null>(null);
  const [sayimUrun, setSayimUrun] = useState<Urun | null>(null);
  const [malGirisUrun, setMalGirisUrun] = useState<Urun | null>(null);
  const [topluSayimAcik, setTopluSayimAcik] = useState(false);
  const [topluMalGirisAcik, setTopluMalGirisAcik] = useState(false);

  // ── New Urun Form ──
  const [yUrunAdi, setYUrunAdi] = useState("");
  const [yKategori, setYKategori] = useState("");
  const [yBirim, setYBirim] = useState("kg");
  const [yMinStok, setYMinStok] = useState("");
  const [yIlkStok, setYIlkStok] = useState("");
  const [yNotlar, setYNotlar] = useState("");
  const [saving, setSaving] = useState(false);

  // ── Sayım Form ──
  const [sayimMiktar, setSayimMiktar] = useState("");
  const [sayimTarih, setSayimTarih] = useState(bugun());
  const [sayimNot, setSayimNot] = useState("");

  // ── Mal Giriş Form ──
  const [girisMiktar, setGirisMiktar] = useState("");
  const [girisTarih, setGirisTarih] = useState(bugun());
  const [girisFiyat, setGirisFiyat] = useState("");
  const [girisNot, setGirisNot] = useState("");

  // ── Toplu sayım/giriş ──
  const [topluVeriler, setTopluVeriler] = useState<Record<string, string>>({});
  const [topluTarih, setTopluTarih] = useState(bugun());

  // ── Data fetch ──
  const veriCek = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const mail = user?.email || "";
    setUserEmail(mail);
    setIsAdmin(mail === "murat@kebo.com" || mail === "bulent@kebo.com");

    const [urunRes, kategoriRes, hareketRes] = await Promise.all([
      supabase.from("stok_urunler").select("*").eq("durum", "aktif").order("urun_adi"),
      supabase.from("stok_kategoriler").select("*").order("sira"),
      supabase.from("stok_hareketler").select("*").order("tarih", { ascending: false }).limit(500),
    ]);

    if (urunRes.data) setUrunler(urunRes.data as Urun[]);
    if (kategoriRes.data) setKategoriler(kategoriRes.data as Kategori[]);
    if (hareketRes.data) setHareketler(hareketRes.data as Hareket[]);
    setLoading(false);
  }, []);

  useEffect(() => { veriCek(); }, [veriCek]);

  // ── Günlük ortalama hesabı (son 7 gün için) ──
  const gunlukOrtalama = useCallback((urunId: string): number => {
    const uHareket = hareketler.filter(h => h.urun_id === urunId && h.tip === "sayim")
      .sort((a, b) => a.tarih.localeCompare(b.tarih));
    if (uHareket.length < 2) return 0;
    const son = uHareket[uHareket.length - 1];
    const onceki = uHareket[uHareket.length - 2];
    const aradaGelen = hareketler
      .filter(h => h.urun_id === urunId && h.tip === "giris"
        && h.tarih > onceki.tarih && h.tarih <= son.tarih)
      .reduce((s, h) => s + h.miktar, 0);
    const gunSayisi = Math.max(
      (new Date(son.tarih).getTime() - new Date(onceki.tarih).getTime()) / (1000 * 60 * 60 * 24),
      1
    );
    const kullanim = (onceki.miktar + aradaGelen) - son.miktar;
    return kullanim > 0 ? kullanim / gunSayisi : 0;
  }, [hareketler]);

  // ── Tahmini bitiş günü ──
  const tahminiBitisGunu = useCallback((urun: Urun): number | null => {
    const ort = gunlukOrtalama(urun.id);
    if (ort <= 0 || urun.mevcut_stok <= 0) return null;
    return Math.floor(urun.mevcut_stok / ort);
  }, [gunlukOrtalama]);

  // ── Filtrelenmiş ürün listesi ──
  const filtreliUrunler = useMemo(() => {
    return urunler.filter(u => {
      if (arama && !u.urun_adi.toLowerCase().includes(arama.toLowerCase())) return false;
      if (filtreKategori && u.kategori !== filtreKategori) return false;
      if (sadeceKritik && u.mevcut_stok > u.min_stok) return false;
      return true;
    });
  }, [urunler, arama, filtreKategori, sadeceKritik]);

  // ── İstatistikler ──
  const stats = useMemo(() => {
    const kritik = urunler.filter(u => u.mevcut_stok <= u.min_stok && u.min_stok > 0).length;
    const tukenmis = urunler.filter(u => u.mevcut_stok <= 0).length;
    const toplam = urunler.length;
    return { kritik, tukenmis, toplam };
  }, [urunler]);

  // ── Form Helpers ──
  const yeniUrunReset = () => {
    setYUrunAdi(""); setYKategori(""); setYBirim("kg");
    setYMinStok(""); setYIlkStok(""); setYNotlar("");
    setYeniUrunAcik(false); setDuzenleUrun(null);
  };

  // ── Yeni Ürün Kaydet ──
  const yeniUrunKaydet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!yUrunAdi.trim()) { alert("Ürün adı zorunlu"); return; }
    setSaving(true);
    try {
      const ekleyen = userEmail.split("@")[0] || "Bilinmiyor";
      const minStokNum = parseFloat(yMinStok) || 0;
      const ilkStokNum = parseFloat(yIlkStok) || 0;

      if (duzenleUrun) {
        const { error } = await supabase.from("stok_urunler").update({
          urun_adi: yUrunAdi.trim(),
          kategori: yKategori || null,
          birim: yBirim,
          min_stok: minStokNum,
          notlar: yNotlar.trim() || null,
        }).eq("id", duzenleUrun.id);
        if (error) { alert("Hata: " + error.message); return; }
      } else {
        const { data: yeni, error } = await supabase.from("stok_urunler").insert([{
          urun_adi: yUrunAdi.trim(),
          kategori: yKategori || null,
          birim: yBirim,
          min_stok: minStokNum,
          notlar: yNotlar.trim() || null,
        }]).select().single();
        if (error || !yeni) { alert("Hata: " + (error?.message || "Bilinmeyen")); return; }
        // İlk stok varsa sayım kaydı ekle
        if (ilkStokNum > 0) {
          await supabase.from("stok_hareketler").insert([{
            urun_id: yeni.id, tarih: bugun(), tip: "sayim",
            miktar: ilkStokNum, kaynak: "manuel", kullanici: ekleyen,
            aciklama: "İlk açılış sayımı",
          }]);
        }
      }
      yeniUrunReset();
      veriCek();
    } catch (err: any) { alert("Hata: " + err.message); }
    finally { setSaving(false); }
  };

  // ── Ürün Sil ──
  const urunSil = async (urun: Urun) => {
    if (!isAdmin) { alert("Silme yetkisi yok"); return; }
    if (!confirm(`"${urun.urun_adi}" silinsin mi? Tüm hareketler de silinir.`)) return;
    const { error } = await supabase.from("stok_urunler").delete().eq("id", urun.id);
    if (error) { alert("Hata: " + error.message); return; }
    veriCek();
  };

  // ── Sayım Kaydet ──
  const sayimKaydet = async () => {
    if (!sayimUrun) return;
    const miktar = parseFloat(sayimMiktar);
    if (isNaN(miktar) || miktar < 0) { alert("Geçerli bir miktar girin"); return; }
    setSaving(true);
    try {
      const ekleyen = userEmail.split("@")[0] || "Bilinmiyor";
      const { error } = await supabase.from("stok_hareketler").insert([{
        urun_id: sayimUrun.id, tarih: sayimTarih, tip: "sayim",
        miktar, kaynak: "manuel", kullanici: ekleyen,
        aciklama: sayimNot.trim() || `${sayimUrun.urun_adi} sayımı`,
      }]);
      if (error) { alert("Hata: " + error.message); return; }
      setSayimUrun(null); setSayimMiktar(""); setSayimNot(""); setSayimTarih(bugun());
      veriCek();
    } finally { setSaving(false); }
  };

  // ── Mal Girişi Kaydet ──
  const malGirisKaydet = async () => {
    if (!malGirisUrun) return;
    const miktar = parseFloat(girisMiktar);
    if (isNaN(miktar) || miktar <= 0) { alert("Geçerli bir miktar girin"); return; }
    setSaving(true);
    try {
      const ekleyen = userEmail.split("@")[0] || "Bilinmiyor";
      const fiyat = parseFloat(girisFiyat);
      const { error } = await supabase.from("stok_hareketler").insert([{
        urun_id: malGirisUrun.id, tarih: girisTarih, tip: "giris",
        miktar, kaynak: "manuel", kullanici: ekleyen,
        aciklama: girisNot.trim() || `${malGirisUrun.urun_adi} mal girişi`,
      }]);
      if (error) { alert("Hata: " + error.message); return; }
      // Son fiyatı güncelle
      if (!isNaN(fiyat) && fiyat > 0) {
        await supabase.from("stok_urunler").update({ son_fiyat: fiyat }).eq("id", malGirisUrun.id);
      }
      setMalGirisUrun(null); setGirisMiktar(""); setGirisFiyat(""); setGirisNot(""); setGirisTarih(bugun());
      veriCek();
    } finally { setSaving(false); }
  };

  // ── Toplu Sayım Kaydet ──
  const topluSayimKaydet = async () => {
    const ekleyen = userEmail.split("@")[0] || "Bilinmiyor";
    const kayitlar = Object.entries(topluVeriler)
      .filter(([_, v]) => v.trim() !== "" && !isNaN(parseFloat(v)))
      .map(([id, v]) => ({
        urun_id: id, tarih: topluTarih, tip: "sayim" as const,
        miktar: parseFloat(v), kaynak: "manuel", kullanici: ekleyen,
        aciklama: "Toplu sayım",
      }));
    if (kayitlar.length === 0) { alert("En az bir ürüne miktar girin"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("stok_hareketler").insert(kayitlar);
      if (error) { alert("Hata: " + error.message); return; }
      setTopluSayimAcik(false); setTopluVeriler({}); setTopluTarih(bugun());
      veriCek();
    } finally { setSaving(false); }
  };

  // ── Toplu Mal Girişi Kaydet ──
  const topluMalGirisKaydet = async () => {
    const ekleyen = userEmail.split("@")[0] || "Bilinmiyor";
    const kayitlar = Object.entries(topluVeriler)
      .filter(([_, v]) => v.trim() !== "" && !isNaN(parseFloat(v)) && parseFloat(v) > 0)
      .map(([id, v]) => ({
        urun_id: id, tarih: topluTarih, tip: "giris" as const,
        miktar: parseFloat(v), kaynak: "manuel", kullanici: ekleyen,
        aciklama: "Toplu mal girişi",
      }));
    if (kayitlar.length === 0) { alert("En az bir ürüne miktar girin"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("stok_hareketler").insert(kayitlar);
      if (error) { alert("Hata: " + error.message); return; }
      setTopluMalGirisAcik(false); setTopluVeriler({}); setTopluTarih(bugun());
      veriCek();
    } finally { setSaving(false); }
  };

  // ── Düzenleme açıldığında formu doldur ──
  useEffect(() => {
    if (duzenleUrun) {
      setYUrunAdi(duzenleUrun.urun_adi);
      setYKategori(duzenleUrun.kategori || "");
      setYBirim(duzenleUrun.birim);
      setYMinStok(duzenleUrun.min_stok.toString());
      setYIlkStok("");
      setYNotlar(duzenleUrun.notlar || "");
      setYeniUrunAcik(true);
    }
  }, [duzenleUrun]);

  // ── LOADING ──
  if (loading) return (
    <div className="h-screen bg-[#060810] flex flex-col items-center justify-center gap-3">
      <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"/>
      <span className="text-[10px] text-gray-600 uppercase tracking-[0.3em]">Stok Yükleniyor</span>
    </div>
  );

  // ── RENDER ──
  return (
    <div className="min-h-screen bg-[#060810] text-white font-sans antialiased">

      {/* HEADER */}
      <div className="sticky top-0 z-40 border-b border-[#0f1624] bg-[#060810]/95 backdrop-blur-xl">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-900/40">
              <Package className="h-4 w-4 text-white"/>
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-white leading-none">Stok Yönetimi</h1>
              <p className="text-[10px] text-gray-600 leading-none mt-0.5">{stats.toplam} ürün · {stats.kritik} kritik</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setTopluMalGirisAcik(true)}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-amber-400 border border-[#1a2236] hover:border-amber-500/30 px-3 py-2 rounded-xl transition-colors">
              <Truck size={13}/> Mal Geldi
            </button>
            <button onClick={() => setTopluSayimAcik(true)}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-blue-400 border border-[#1a2236] hover:border-blue-500/30 px-3 py-2 rounded-xl transition-colors">
              <ClipboardCheck size={13}/> Toplu Sayım
            </button>
            <button onClick={veriCek}
              className="p-2 text-gray-600 hover:text-white border border-[#1a2236] hover:border-[#2a3550] rounded-xl transition-colors">
              <RefreshCw size={14}/>
            </button>
            <button onClick={() => { setDuzenleUrun(null); setYeniUrunAcik(true); }}
              className="flex items-center gap-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-xl transition-colors shadow-lg shadow-emerald-900/30">
              <PlusCircle size={14}/> Yeni Ürün
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* KPI KARTLARI */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Toplam Ürün", value: stats.toplam, icon: Box, color: "blue" },
            { label: "Kritik Seviye", value: stats.kritik, icon: AlertTriangle, color: "amber" },
            { label: "Tükenmiş", value: stats.tukenmis, icon: TrendingDown, color: "red" },
            { label: "Kategori", value: kategoriler.length, icon: Layers, color: "purple" },
          ].map(card => (
            <div key={card.label} className={`bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-4`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold">{card.label}</span>
                <div className={`w-7 h-7 rounded-xl bg-${card.color}-500/10 flex items-center justify-center`}>
                  <card.icon size={13} className={`text-${card.color}-400`}/>
                </div>
              </div>
              <p className={`text-2xl font-black text-${card.color}-400`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* KRİTİK UYARI */}
        {stats.kritik > 0 && (
          <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-[#1a1408] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 shrink-0">
                <Bell className="h-4 w-4 text-amber-400 animate-pulse"/>
              </div>
              <div>
                <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">
                  {stats.kritik} Ürün Kritik Seviyede
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">Minimum stok seviyesinin altına düşen ürünleri kontrol edin</p>
              </div>
            </div>
            <button onClick={() => setSadeceKritik(true)}
              className="text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-4 py-2 rounded-xl transition-colors">
              Kritikleri Göster
            </button>
          </div>
        )}

        {/* FİLTRELER */}
        <div className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] p-4 flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600"/>
            <input type="text" placeholder="Ürün ara..." value={arama}
              onChange={e => setArama(e.target.value)}
              className="w-full bg-[#080b14] border border-[#1a2236] focus:border-blue-500/40 text-white text-sm h-9 pl-9 pr-3 rounded-xl outline-none transition-all placeholder:text-gray-700"/>
          </div>
          <select value={filtreKategori} onChange={e => setFiltreKategori(e.target.value)}
            className="bg-[#080b14] border border-[#1a2236] text-white text-xs px-3 h-9 rounded-xl outline-none focus:border-blue-500/40">
            <option value="">Tüm Kategoriler</option>
            {kategoriler.map(k => <option key={k.id} value={k.ad}>{k.ad}</option>)}
          </select>
          <button onClick={() => setSadeceKritik(!sadeceKritik)}
            className={`text-xs font-semibold px-4 py-2 rounded-xl border transition-colors flex items-center gap-1.5 ${
              sadeceKritik ? "bg-amber-500/15 border-amber-500/40 text-amber-400" : "bg-[#080b14] border-[#1a2236] text-gray-500 hover:border-amber-500/20"
            }`}>
            <AlertTriangle size={12}/> Sadece Kritik
          </button>
        </div>

        {/* ÜRÜN LİSTESİ */}
        <div className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1a2236] bg-[#080b14]">
                  {["Ürün", "Kategori", "Mevcut Stok", "Min. Stok", "Günlük Kull.", "Tahmini Bitiş", "Son Güncelleme", ""].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0f1624]">
                {filtreliUrunler.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-600 text-xs uppercase tracking-widest">
                    {urunler.length === 0 ? "Henüz ürün eklenmemiş" : "Filtreye uyan ürün yok"}
                  </td></tr>
                ) : filtreliUrunler.map(urun => {
                  const ort = gunlukOrtalama(urun.id);
                  const kalanGun = tahminiBitisGunu(urun);
                  const kritik = urun.mevcut_stok <= urun.min_stok && urun.min_stok > 0;
                  const tukenmis = urun.mevcut_stok <= 0;
                  const kategoriObj = kategoriler.find(k => k.ad === urun.kategori);
                  return (
                    <tr key={urun.id} className={`hover:bg-white/[0.02] transition-colors group ${tukenmis ? "bg-red-950/10" : kritik ? "bg-amber-950/10" : ""}`}>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          {tukenmis ? <TrendingDown size={12} className="text-red-400 shrink-0"/> :
                           kritik ? <AlertTriangle size={12} className="text-amber-400 shrink-0"/> :
                           <Box size={12} className="text-emerald-400 shrink-0"/>}
                          <Link href={`/stok/${urun.id}`} className="font-semibold text-gray-200 hover:text-blue-400 transition-colors">
                            {urun.urun_adi}
                          </Link>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {kategoriObj ? (
                          <span className="text-[10px] font-semibold px-2 py-1 rounded-full" style={{
                            backgroundColor: kategoriObj.renk + "20",
                            color: kategoriObj.renk,
                          }}>{kategoriObj.ad}</span>
                        ) : <span className="text-gray-700">—</span>}
                      </td>
                      <td className={`px-4 py-3.5 font-black ${tukenmis ? "text-red-400" : kritik ? "text-amber-400" : "text-white"}`}>
                        {fmt(urun.mevcut_stok)} <span className="text-[10px] text-gray-600 font-normal">{urun.birim}</span>
                      </td>
                      <td className="px-4 py-3.5 text-gray-500">
                        {urun.min_stok > 0 ? `${fmt(urun.min_stok)} ${urun.birim}` : "—"}
                      </td>
                      <td className="px-4 py-3.5 text-purple-400 font-semibold">
                        {ort > 0 ? `${fmt(ort, 2)} ${urun.birim}` : "—"}
                      </td>
                      <td className="px-4 py-3.5">
                        {kalanGun !== null ? (
                          <span className={`font-semibold ${kalanGun <= 3 ? "text-red-400" : kalanGun <= 7 ? "text-amber-400" : "text-emerald-400"}`}>
                            ~{kalanGun} gün
                          </span>
                        ) : <span className="text-gray-700">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 text-[10px]">
                        {new Date(urun.updated_at).toLocaleDateString("tr-TR")}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setSayimUrun(urun)}
                            title="Sayım yap"
                            className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors">
                            <ClipboardCheck size={12}/>
                          </button>
                          <button onClick={() => setMalGirisUrun(urun)}
                            title="Mal girişi"
                            className="p-1.5 text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors">
                            <Truck size={12}/>
                          </button>
                          <button onClick={() => setDuzenleUrun(urun)}
                            title="Düzenle"
                            className="p-1.5 text-gray-400 hover:bg-white/5 rounded-lg transition-colors">
                            <Edit3 size={12}/>
                          </button>
                          {isAdmin && (
                            <button onClick={() => urunSil(urun)}
                              title="Sil"
                              className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                              <Trash2 size={12}/>
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

      </div>

      {/* ─── YENİ ÜRÜN MODAL ─── */}
      {yeniUrunAcik && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-5 py-4 border-b border-[#1a2236] flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">{duzenleUrun ? "Ürün Düzenle" : "Yeni Ürün"}</h3>
              <button onClick={yeniUrunReset} className="p-1 text-gray-600 hover:text-white"><X size={16}/></button>
            </div>
            <form onSubmit={yeniUrunKaydet} className="p-5 space-y-3">
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Ürün Adı *</label>
                <input type="text" value={yUrunAdi} onChange={e => setYUrunAdi(e.target.value)} required
                  className="w-full bg-[#080b14] border border-[#1a2236] focus:border-blue-500/40 text-white text-sm h-9 px-3 rounded-xl outline-none"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Kategori</label>
                  <select value={yKategori} onChange={e => setYKategori(e.target.value)}
                    className="w-full bg-[#080b14] border border-[#1a2236] focus:border-blue-500/40 text-white text-sm h-9 px-3 rounded-xl outline-none">
                    <option value="">Seçiniz</option>
                    {kategoriler.map(k => <option key={k.id} value={k.ad}>{k.ad}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Birim</label>
                  <select value={yBirim} onChange={e => setYBirim(e.target.value)}
                    className="w-full bg-[#080b14] border border-[#1a2236] focus:border-blue-500/40 text-white text-sm h-9 px-3 rounded-xl outline-none">
                    {BIRIMLER.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Min. Stok</label>
                  <input type="number" step="0.01" value={yMinStok} onChange={e => setYMinStok(e.target.value)} placeholder="0"
                    className="w-full bg-[#080b14] border border-[#1a2236] focus:border-blue-500/40 text-white text-sm h-9 px-3 rounded-xl outline-none"/>
                </div>
                {!duzenleUrun && (
                  <div>
                    <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Başlangıç Stoğu</label>
                    <input type="number" step="0.01" value={yIlkStok} onChange={e => setYIlkStok(e.target.value)} placeholder="0"
                      className="w-full bg-[#080b14] border border-[#1a2236] focus:border-blue-500/40 text-white text-sm h-9 px-3 rounded-xl outline-none"/>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Notlar</label>
                <textarea value={yNotlar} onChange={e => setYNotlar(e.target.value)} rows={2}
                  className="w-full bg-[#080b14] border border-[#1a2236] focus:border-blue-500/40 text-white text-xs px-3 py-2 rounded-xl outline-none resize-none"/>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={yeniUrunReset}
                  className="text-xs font-semibold text-gray-500 hover:text-white border border-[#1a2236] px-4 py-2 rounded-xl">
                  İptal
                </button>
                <button type="submit" disabled={saving}
                  className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 px-6 py-2 rounded-xl flex items-center gap-2">
                  {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>}
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── SAYIM MODAL ─── */}
      {sayimUrun && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0f1a] border border-blue-500/20 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="px-5 py-4 border-b border-[#1a2236] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardCheck size={16} className="text-blue-400"/>
                <h3 className="text-sm font-bold text-white">Sayım Gir</h3>
              </div>
              <button onClick={() => setSayimUrun(null)} className="p-1 text-gray-600 hover:text-white"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-blue-400 uppercase tracking-widest font-semibold">{sayimUrun.urun_adi}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">Sistemdeki mevcut: <strong className="text-white">{fmt(sayimUrun.mevcut_stok)} {sayimUrun.birim}</strong></p>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Sayım Tarihi</label>
                <input type="date" value={sayimTarih} onChange={e => setSayimTarih(e.target.value)}
                  className="w-full bg-[#080b14] border border-[#1a2236] focus:border-blue-500/40 text-white text-sm h-9 px-3 rounded-xl outline-none"/>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Şu Anda Stokta Olan ({sayimUrun.birim})</label>
                <input type="number" step="0.01" value={sayimMiktar} onChange={e => setSayimMiktar(e.target.value)} placeholder="0" autoFocus
                  className="w-full bg-[#080b14] border border-[#1a2236] focus:border-blue-500/40 text-white text-lg font-bold h-12 px-3 rounded-xl outline-none"/>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Not (opsiyonel)</label>
                <input type="text" value={sayimNot} onChange={e => setSayimNot(e.target.value)}
                  className="w-full bg-[#080b14] border border-[#1a2236] focus:border-blue-500/40 text-white text-xs h-8 px-3 rounded-xl outline-none"/>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setSayimUrun(null)}
                  className="text-xs font-semibold text-gray-500 hover:text-white border border-[#1a2236] px-4 py-2 rounded-xl">İptal</button>
                <button onClick={sayimKaydet} disabled={saving || !sayimMiktar}
                  className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 px-6 py-2 rounded-xl flex items-center gap-2">
                  {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>}
                  Sayımı Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MAL GİRİŞ MODAL ─── */}
      {malGirisUrun && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0f1a] border border-amber-500/20 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="px-5 py-4 border-b border-[#1a2236] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck size={16} className="text-amber-400"/>
                <h3 className="text-sm font-bold text-white">Mal Girişi</h3>
              </div>
              <button onClick={() => setMalGirisUrun(null)} className="p-1 text-gray-600 hover:text-white"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2.5">
                <p className="text-[10px] text-amber-400 uppercase tracking-widest font-semibold">{malGirisUrun.urun_adi}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">Mevcut: <strong className="text-white">{fmt(malGirisUrun.mevcut_stok)} {malGirisUrun.birim}</strong></p>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Geliş Tarihi</label>
                <input type="date" value={girisTarih} onChange={e => setGirisTarih(e.target.value)}
                  className="w-full bg-[#080b14] border border-[#1a2236] focus:border-amber-500/40 text-white text-sm h-9 px-3 rounded-xl outline-none"/>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Gelen Miktar ({malGirisUrun.birim})</label>
                <input type="number" step="0.01" value={girisMiktar} onChange={e => setGirisMiktar(e.target.value)} placeholder="0" autoFocus
                  className="w-full bg-[#080b14] border border-[#1a2236] focus:border-amber-500/40 text-white text-lg font-bold h-12 px-3 rounded-xl outline-none"/>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Birim Fiyat (opsiyonel)</label>
                <input type="number" step="0.01" value={girisFiyat} onChange={e => setGirisFiyat(e.target.value)} placeholder="₺"
                  className="w-full bg-[#080b14] border border-[#1a2236] focus:border-amber-500/40 text-white text-sm h-9 px-3 rounded-xl outline-none"/>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Not</label>
                <input type="text" value={girisNot} onChange={e => setGirisNot(e.target.value)} placeholder="Tedarikçi, irsaliye no..."
                  className="w-full bg-[#080b14] border border-[#1a2236] focus:border-amber-500/40 text-white text-xs h-8 px-3 rounded-xl outline-none"/>
              </div>
              {girisMiktar && !isNaN(parseFloat(girisMiktar)) && (
                <div className="bg-[#080b14] border border-emerald-500/15 rounded-xl px-3 py-2 text-xs">
                  Yeni stok: <strong className="text-emerald-400">{fmt(malGirisUrun.mevcut_stok + parseFloat(girisMiktar))} {malGirisUrun.birim}</strong>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setMalGirisUrun(null)}
                  className="text-xs font-semibold text-gray-500 hover:text-white border border-[#1a2236] px-4 py-2 rounded-xl">İptal</button>
                <button onClick={malGirisKaydet} disabled={saving || !girisMiktar}
                  className="text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-40 px-6 py-2 rounded-xl flex items-center gap-2">
                  {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>}
                  Mal Girişini Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TOPLU SAYIM MODAL ─── */}
      {topluSayimAcik && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0f1a] border border-blue-500/20 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-[#1a2236] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardCheck size={16} className="text-blue-400"/>
                <h3 className="text-sm font-bold text-white">Toplu Sayım</h3>
                <span className="text-[10px] text-gray-600">Tüm ürünler için tek seferde sayım girin</span>
              </div>
              <button onClick={() => { setTopluSayimAcik(false); setTopluVeriler({}); }} className="p-1 text-gray-600 hover:text-white"><X size={16}/></button>
            </div>
            <div className="p-5 border-b border-[#1a2236]">
              <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Sayım Tarihi</label>
              <input type="date" value={topluTarih} onChange={e => setTopluTarih(e.target.value)}
                className="bg-[#080b14] border border-[#1a2236] focus:border-blue-500/40 text-white text-sm h-9 px-3 rounded-xl outline-none"/>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-2">
              {urunler.map(urun => (
                <div key={urun.id} className="flex items-center gap-3 bg-[#080b14] border border-[#1a2236] rounded-xl px-3 py-2">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-white">{urun.urun_adi}</p>
                    <p className="text-[10px] text-gray-600">Mevcut: {fmt(urun.mevcut_stok)} {urun.birim}</p>
                  </div>
                  <div className="relative w-32">
                    <input type="number" step="0.01"
                      value={topluVeriler[urun.id] || ""}
                      onChange={e => setTopluVeriler({ ...topluVeriler, [urun.id]: e.target.value })}
                      placeholder={`0 ${urun.birim}`}
                      className="w-full bg-[#0c0f1a] border border-[#1a2236] focus:border-blue-500/40 text-white text-sm font-bold h-8 px-2 rounded-lg outline-none text-right"/>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-[#1a2236] flex justify-end gap-2">
              <button onClick={() => { setTopluSayimAcik(false); setTopluVeriler({}); }}
                className="text-xs font-semibold text-gray-500 hover:text-white border border-[#1a2236] px-4 py-2 rounded-xl">İptal</button>
              <button onClick={topluSayimKaydet} disabled={saving}
                className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 px-6 py-2 rounded-xl flex items-center gap-2">
                {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>}
                Tümünü Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── TOPLU MAL GİRİŞ MODAL ─── */}
      {topluMalGirisAcik && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0f1a] border border-amber-500/20 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-[#1a2236] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck size={16} className="text-amber-400"/>
                <h3 className="text-sm font-bold text-white">Toplu Mal Girişi</h3>
                <span className="text-[10px] text-gray-600">Gelen malları işaretleyin</span>
              </div>
              <button onClick={() => { setTopluMalGirisAcik(false); setTopluVeriler({}); }} className="p-1 text-gray-600 hover:text-white"><X size={16}/></button>
            </div>
            <div className="p-5 border-b border-[#1a2236]">
              <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Mal Geliş Tarihi</label>
              <input type="date" value={topluTarih} onChange={e => setTopluTarih(e.target.value)}
                className="bg-[#080b14] border border-[#1a2236] focus:border-amber-500/40 text-white text-sm h-9 px-3 rounded-xl outline-none"/>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-2">
              {urunler.map(urun => (
                <div key={urun.id} className="flex items-center gap-3 bg-[#080b14] border border-[#1a2236] rounded-xl px-3 py-2">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-white">{urun.urun_adi}</p>
                    <p className="text-[10px] text-gray-600">Mevcut: {fmt(urun.mevcut_stok)} {urun.birim}</p>
                  </div>
                  <div className="relative w-32">
                    <input type="number" step="0.01"
                      value={topluVeriler[urun.id] || ""}
                      onChange={e => setTopluVeriler({ ...topluVeriler, [urun.id]: e.target.value })}
                      placeholder={`+ ${urun.birim}`}
                      className="w-full bg-[#0c0f1a] border border-[#1a2236] focus:border-amber-500/40 text-white text-sm font-bold h-8 px-2 rounded-lg outline-none text-right"/>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-[#1a2236] flex justify-end gap-2">
              <button onClick={() => { setTopluMalGirisAcik(false); setTopluVeriler({}); }}
                className="text-xs font-semibold text-gray-500 hover:text-white border border-[#1a2236] px-4 py-2 rounded-xl">İptal</button>
              <button onClick={topluMalGirisKaydet} disabled={saving}
                className="text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-40 px-6 py-2 rounded-xl flex items-center gap-2">
                {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>}
                Mal Girişlerini Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
