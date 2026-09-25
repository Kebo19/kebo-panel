"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { bugun, gunEkle, fmtTarih } from "@/lib/tarih";
import { useYetki } from "@/lib/useYetki";
import {
  kullanimAnalizi, stokDurumu, cikisOzeti, donemKullanimi, miktarOku, nedenEtiketi, varsayilanVakit,
  CIKIS_NEDENLERI, GUN_ADLARI, type CikisNedeni, type SayimVakti,
} from "@/lib/stok";
import VakitSecici from "@/components/VakitSecici";
import Link from "next/link";
import {
  ArrowLeft, ClipboardCheck, Truck, PackageMinus, TrendingDown,
  Edit3, Loader2, Save, X, Trash2, Activity, BarChart3, AlertTriangle,
} from "lucide-react";

interface Urun {
  id: string; urun_adi: string; kategori: string | null;
  birim: string; min_stok: number; mevcut_stok: number;
  son_fiyat: number | null; sayim_periyodu: string; notlar: string | null; updated_at: string;
}
interface Hareket {
  id: string; urun_id: string; tarih: string;
  tip: "sayim" | "giris" | "cikis" | "duzeltme";
  miktar: number; neden?: string | null; birim_fiyat?: number | null; kaynak: string | null;
  aciklama: string | null; kullanici: string | null;
  created_at: string;
}

const fmt = (v: number, d = 1) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: d }).format(v || 0);

// Tailwind dinamik sınıf üretmediği için renk sınıfları açıkça yazılı.
const TIP_KONFIG = {
  sayim:    { label: "Sayım",    rozet: "bg-blue-500/10 text-blue-600",     yazi: "text-blue-600",   icon: ClipboardCheck },
  giris:    { label: "Giriş",    rozet: "bg-amber-500/10 text-amber-600",   yazi: "text-amber-600",  icon: Truck },
  cikis:    { label: "Çıkış",    rozet: "bg-red-500/10 text-red-600",       yazi: "text-red-600",    icon: TrendingDown },
  duzeltme: { label: "Düzeltme", rozet: "bg-purple-500/10 text-purple-600", yazi: "text-purple-600", icon: Edit3 },
};

const inputCls = "w-full bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] text-sm h-9 px-3 rounded-xl outline-none";

export default function StokDetayPage() {
  const params = useParams();
  const supabase = useMemo(() => createClient(), []);
  const urunId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [urun, setUrun] = useState<Urun | null>(null);
  const [hareketler, setHareketler] = useState<Hareket[]>([]);
  const yetki = useYetki();
  const ekleyen = yetki.kullaniciAdi || "Bilinmiyor";
  const isAdmin = yetki.tamYetkili;

  const [donemBaslangic, setDonemBaslangic] = useState(() => gunEkle(bugun(), -30));
  const [donemBitis, setDonemBitis] = useState(() => gunEkle(bugun(), -1));

  const [modal, setModal] = useState<null | "sayim" | "giris" | "cikis">(null);
  const [miktar, setMiktar] = useState("");
  const [fiyat, setFiyat] = useState("");
  const [tarih, setTarih] = useState(bugun());
  const [neden, setNeden] = useState<CikisNedeni>("skt");
  const [vakit, setVakit] = useState<SayimVakti>("sabah");
  const [not, setNot] = useState("");
  const [saving, setSaving] = useState(false);

  const veriCek = useCallback(async () => {
    if (!urunId) return;
    setLoading(true);
    const [uRes, hRes] = await Promise.all([
      supabase.from("stok_urunler").select("*").eq("id", urunId).single(),
      supabase.from("stok_hareketler").select("*").eq("urun_id", urunId).order("tarih", { ascending: false }).order("created_at", { ascending: false }).limit(2000),
    ]);
    if (uRes.data) setUrun(uRes.data as Urun);
    if (hRes.data) setHareketler(hRes.data as Hareket[]);
    setLoading(false);
  }, [supabase, urunId]);

  useEffect(() => { veriCek(); }, [veriCek]);

  // Liste sayfasıyla aynı hesaplar (lib/stok.ts)
  const analiz = useMemo(() => kullanimAnalizi(hareketler, urunId), [hareketler, urunId]);
  const durum = useMemo(() => stokDurumu(hareketler, urunId), [hareketler, urunId]);
  const donem = useMemo(() => {
    const k = donemKullanimi(analiz, donemBaslangic, donemBitis);
    const c = cikisOzeti(hareketler, urunId, donemBaslangic, donemBitis, urun?.son_fiyat);
    const gelen = hareketler.filter(h => h.tip === "giris" && h.tarih >= donemBaslangic && h.tarih <= donemBitis)
      .reduce((s, h) => s + Number(h.miktar), 0);
    return { ...k, ortalama: k.gun ? k.toplam / k.gun : 0, cikis: c, gelen };
  }, [analiz, hareketler, urunId, urun?.son_fiyat, donemBaslangic, donemBitis]);

  const kullanimGrafik = useMemo(() => analiz.gunler
    .filter(g => g.tarih >= donemBaslangic && g.tarih <= donemBitis)
    .map(g => ({ gun: fmtTarih(g.tarih).slice(0, 5), kullanim: Math.round(g.kullanim * 100) / 100, tahmini: g.tahmini })),
  [analiz, donemBaslangic, donemBitis]);

  const sayimGrafik = useMemo(() => {
    const m = new Map<string, number>();
    [...hareketler].filter(h => h.tip === "sayim" && h.tarih >= donemBaslangic && h.tarih <= donemBitis)
      .sort((a, b) => a.tarih.localeCompare(b.tarih) || a.created_at.localeCompare(b.created_at))
      .forEach(h => m.set(h.tarih, Number(h.miktar)));
    return Array.from(m.entries()).map(([t, v]) => ({ gun: fmtTarih(t).slice(0, 5), miktar: v }));
  }, [hareketler, donemBaslangic, donemBitis]);

  const modalAc = (tip: "sayim" | "giris" | "cikis") => {
    setModal(tip); setMiktar(""); setFiyat(urun?.son_fiyat ? String(urun.son_fiyat).replace(".", ",") : "");
    setTarih(bugun()); setNeden("skt"); setNot(""); setVakit(varsayilanVakit());
  };

  const kaydet = async () => {
    if (!urun || !modal) return;
    const m = miktarOku(miktar);
    if (isNaN(m) || m < 0 || (modal !== "sayim" && m === 0)) { alert("Geçerli bir miktar girin"); return; }
    if (tarih > bugun()) { alert("İleri tarihli hareket girilemez."); return; }
    if (modal === "cikis" && m > durum.tahminiMevcut * 1.5 + 0.001
      && !confirm(`Çıkış (${fmt(m)} ${urun.birim}) tahmini stoktan (${fmt(durum.tahminiMevcut)}) fazla. Yine de kaydedilsin mi?`)) return;
    setSaving(true);
    const f = miktarOku(fiyat);
    const kayit: Record<string, unknown> = {
      urun_id: urun.id, tarih, tip: modal, miktar: m, kaynak: "manuel", kullanici: ekleyen,
      aciklama: not.trim() || (modal === "sayim" ? "Sayım" : modal === "giris" ? "Mal girişi" : nedenEtiketi(neden)),
    };
    if (modal === "giris" && !isNaN(f) && f > 0) kayit.birim_fiyat = f;
    if (modal === "cikis") { kayit.neden = neden; kayit.birim_fiyat = urun.son_fiyat; }
    if (modal === "sayim") kayit.vakit = vakit;
    const { error } = await supabase.from("stok_hareketler").insert([kayit]);
    if (!error && modal === "giris" && !isNaN(f) && f > 0) {
      await supabase.from("stok_urunler").update({ son_fiyat: f }).eq("id", urun.id);
    }
    setSaving(false);
    if (error) { alert("Hata: " + error.message); return; }
    setModal(null);
    veriCek();
  };

  const hareketSil = async (h: Hareket) => {
    if (!isAdmin) { alert("Silme yetkisi yok"); return; }
    if (!confirm("Bu hareketi silmek istiyor musunuz? Stok otomatik güncellenecek.")) return;
    const { error } = await supabase.from("stok_hareketler").delete().eq("id", h.id);
    if (error) { alert("Hata: " + error.message); return; }
    veriCek();
  };

  if (loading) return (
    <div className="h-screen bg-[#f4f5f7] flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"/>
    </div>
  );

  if (!urun) return (
    <div className="min-h-screen bg-[#f4f5f7] text-[#1a1f2e] flex flex-col items-center justify-center gap-4">
      <p className="text-gray-500">Ürün bulunamadı</p>
      <Link href="/stok" className="text-blue-600 text-xs">← Stok Listesine Dön</Link>
    </div>
  );

  const kritik = urun.min_stok > 0 && durum.tahminiMevcut <= urun.min_stok;
  const tukenmis = durum.sonSayimTarih !== null && durum.tahminiMevcut <= 0;
  const sonTutarsiz = analiz.tutarsizAraliklar[analiz.tutarsizAraliklar.length - 1];

  return (
    <div className="min-h-screen bg-[#f4f5f7] text-[#1a1f2e] font-sans antialiased">
      {/* HEADER */}
      <div className="sticky top-0 z-40 border-b border-[#e2e5eb] bg-[#f4f5f7]/95 backdrop-blur-xl">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/stok" className="p-2 text-gray-500 hover:text-[#1a1f2e] border border-[#e2e5eb] rounded-xl">
              <ArrowLeft size={14}/>
            </Link>
            <div>
              <h1 className="text-sm font-black tracking-tight text-[#1a1f2e] leading-none">{urun.urun_adi}</h1>
              <p className="text-[10px] text-gray-600 leading-none mt-0.5">
                {urun.kategori || "Kategorisiz"} · {urun.birim} · <span className="text-blue-600">{urun.sayim_periyodu === "haftalik" ? "Haftalık" : urun.sayim_periyodu === "aylik" ? "Aylık" : "Günlük"} sayım</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => modalAc("giris")} className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 border border-amber-500/30 bg-amber-500/5 px-3 py-2 rounded-xl">
              <Truck size={13}/> Mal Geldi
            </button>
            <button onClick={() => modalAc("cikis")} className="flex items-center gap-1.5 text-[11px] font-semibold text-red-700 border border-red-500/30 bg-red-500/5 px-3 py-2 rounded-xl">
              <PackageMinus size={13}/> Çıkış / Fire
            </button>
            <button onClick={() => modalAc("sayim")} className="flex items-center gap-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl shadow-lg shadow-blue-900/30">
              <ClipboardCheck size={14}/> Sayım Gir
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {sonTutarsiz && (
          <div className="rounded-xl border border-purple-500/25 bg-purple-500/5 p-3 text-xs flex items-center gap-2 text-purple-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <p>{fmtTarih(sonTutarsiz.bas)} → {fmtTarih(sonTutarsiz.bit)} arası stok {fmt(sonTutarsiz.fark)} {urun.birim} arttı ama mal girişi yok. Giriş unutulmuş ya da sayım hatalı olabilir; bu aralık ortalamaya katılmadı.</p>
          </div>
        )}

        {/* KPI ÖZET */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className={`bg-[#ffffff] border rounded-2xl p-4 ${tukenmis ? "border-red-500/30" : kritik ? "border-amber-500/30" : "border-emerald-500/20"}`}>
            <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mb-2">Tahmini Stok (şu an)</p>
            <p className={`text-2xl font-black ${tukenmis ? "text-red-600" : kritik ? "text-amber-600" : "text-emerald-600"}`}>
              ~{fmt(durum.tahminiMevcut)} <span className="text-sm text-gray-500">{urun.birim}</span>
            </p>
            <p className="text-[10px] text-gray-600 mt-1">
              {durum.sonSayimTarih
                ? <>Son sayım {fmt(durum.sonSayimMiktar || 0)} {urun.birim} · {fmtTarih(durum.sonSayimTarih)}{durum.sonrakiGiris ? ` · +${fmt(durum.sonrakiGiris)} gelen` : ""}{durum.sonrakiCikis ? ` · −${fmt(durum.sonrakiCikis)} çıkış` : ""}</>
                : "Henüz sayım yok"}
              {urun.min_stok > 0 && <> · Min {fmt(urun.min_stok)}</>}
            </p>
          </div>
          <div className="bg-[#ffffff] border border-[#e2e5eb] rounded-2xl p-4">
            <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mb-2">Günlük Kullanım (son 7 gün)</p>
            <p className="text-2xl font-black text-purple-600">
              {durum.ort7.ortalama > 0 ? fmt(durum.ort7.ortalama, 2) : "—"} <span className="text-sm text-gray-500">{urun.birim}/gün</span>
            </p>
            <p className="text-[10px] text-gray-600 mt-1">{durum.ort7.veriGunu ? `${durum.ort7.veriGunu} günlük veri${durum.ort7.pencere > 7 ? " (son 7 günde veri yok, son 30 gün)" : ""}` : "En az iki sayım gerekli"}</p>
          </div>
          <div className="bg-[#ffffff] border border-[#e2e5eb] rounded-2xl p-4">
            <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mb-2">Stok Ne Kadar Yeter</p>
            <p className="text-2xl font-black text-blue-600">
              {durum.kalanGun !== null ? durum.kalanGun : "—"} <span className="text-sm text-gray-500">gün</span>
            </p>
            <p className="text-[10px] text-gray-600 mt-1">{durum.kalanGun !== null ? `~${fmtTarih(gunEkle(bugun(), durum.kalanGun))} tarihine kadar` : "Veri yetersiz"}</p>
          </div>
          <div className="bg-[#ffffff] border border-[#e2e5eb] rounded-2xl p-4">
            <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mb-2">Son Alış Fiyatı</p>
            <p className="text-2xl font-black text-amber-600">{urun.son_fiyat ? `₺${fmt(urun.son_fiyat, 2)}` : "—"}</p>
            <p className="text-[10px] text-gray-600 mt-1">Birim başına · fire değeri bununla hesaplanır</p>
          </div>
        </div>

        {/* DÖNEM ANALİZİ */}
        <div className="rounded-2xl border border-[#e2e5eb] bg-[#ffffff] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#e2e5eb] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Activity className="h-3.5 w-3.5 text-purple-600"/>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Dönem Analizi</h3>
                <p className="text-[10px] text-gray-600">Kullanım sayımlardan hesaplanır; sayılmayan günler aradaki günlere eşit bölünür</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="date" value={donemBaslangic} onChange={e => setDonemBaslangic(e.target.value)} className="bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] text-xs h-8 px-2 rounded-lg outline-none"/>
              <span className="text-gray-600 text-xs">→</span>
              <input type="date" value={donemBitis} onChange={e => setDonemBitis(e.target.value)} className="bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] text-xs h-8 px-2 rounded-lg outline-none"/>
            </div>
          </div>
          <div className="p-5 grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-[#f7f8fa] rounded-xl p-3 border border-purple-500/20">
              <p className="text-[9px] text-purple-600 uppercase tracking-widest font-bold">Toplam Kullanım</p>
              <p className="text-sm font-black text-purple-600 mt-1">{fmt(donem.toplam)} {urun.birim}</p>
              <p className="text-[9px] text-gray-600 mt-0.5">{donem.gun} gün{donem.tahminiGun ? ` (${donem.tahminiGun}'i tahmini)` : ""}</p>
            </div>
            <div className="bg-[#f7f8fa] rounded-xl p-3 border border-[#e2e5eb]">
              <p className="text-[9px] text-gray-600 uppercase tracking-widest">Günlük Ortalama</p>
              <p className="text-sm font-black text-gray-800 mt-1">{fmt(donem.ortalama, 2)} {urun.birim}/gün</p>
            </div>
            <div className="bg-[#f7f8fa] rounded-xl p-3 border border-[#e2e5eb]">
              <p className="text-[9px] text-gray-600 uppercase tracking-widest">Gelen Mal</p>
              <p className="text-sm font-black text-amber-600 mt-1">+{fmt(donem.gelen)} {urun.birim}</p>
            </div>
            <div className="bg-[#f7f8fa] rounded-xl p-3 border border-red-500/20">
              <p className="text-[9px] text-red-600 uppercase tracking-widest font-bold">Fire (SKT/bozuk/diğer)</p>
              <p className="text-sm font-black text-red-600 mt-1">{fmt(donem.cikis.fire)} {urun.birim}</p>
              <p className="text-[9px] text-gray-600 mt-0.5">
                {donem.cikis.fireTutar ? `~₺${fmt(donem.cikis.fireTutar, 0)}` : ""}
                {donem.toplam > 0 && donem.cikis.fire > 0 ? ` · kullanımın %${fmt(donem.cikis.fire / donem.toplam * 100, 1)}'i` : ""}
              </p>
            </div>
            <div className="bg-[#f7f8fa] rounded-xl p-3 border border-[#e2e5eb]">
              <p className="text-[9px] text-gray-600 uppercase tracking-widest">Tedarikçiye İade</p>
              <p className="text-sm font-black text-gray-800 mt-1">{fmt(donem.cikis.iade)} {urun.birim}</p>
            </div>
          </div>
          {Object.keys(donem.cikis.nedenler).length > 0 && (
            <div className="px-5 pb-4 flex flex-wrap gap-2 text-[11px]">
              {Object.entries(donem.cikis.nedenler).map(([n, m]) => (
                <span key={n} className="bg-red-500/5 border border-red-500/15 text-red-700 px-2 py-1 rounded-lg">{nedenEtiketi(n)}: {fmt(m)} {urun.birim}</span>
              ))}
            </div>
          )}
        </div>

        {/* HAFTANIN GÜNLERİNE GÖRE KULLANIM */}
        <div className="rounded-2xl border border-[#e2e5eb] bg-[#ffffff] p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-800">Haftanın Günlerine Göre Kullanım <span className="text-[10px] text-gray-500 font-normal">(son 4 hafta)</span></h3>
            <span className="text-[11px] text-gray-600">Son 7 gün ort.: <strong className="text-purple-700">{fmt(durum.ort7.ortalama, 1)} {urun.birim}</strong></span>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {[1, 2, 3, 4, 5, 6, 0].map(i => {
              const v = durum.tahmin.haftaGunleri[i];
              const enBuyuk = Math.max(...durum.tahmin.haftaGunleri.map(x => x || 0), 1);
              return (
                <div key={i} className="text-center">
                  <div className="h-16 flex items-end justify-center bg-[#f7f8fa] rounded-lg overflow-hidden">
                    <div className="w-full bg-purple-500/70" style={{ height: `${v ? (v / enBuyuk) * 100 : 0}%` }}/>
                  </div>
                  <p className="text-[10px] text-gray-600 mt-1">{GUN_ADLARI[i].slice(0, 3)}</p>
                  <p className="text-[11px] font-bold text-gray-800">{v !== null ? fmt(v, 1) : "—"}</p>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-500 mt-2">Sipariş önerisi &quot;haftanın günlerine göre&quot; seçiliyse bu değerler, veri olmayan günlerde son 7 günün ortalaması kullanılır.</p>
        </div>

        {/* GRAFİKLER */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-[#e2e5eb] bg-[#ffffff] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-purple-600"/> Günlük Kullanım</h3>
              <div className="flex items-center gap-3 text-[10px] text-gray-600">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-purple-500 inline-block"/>Sayımlı gün</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-purple-300 inline-block"/>Tahmini (sayılmadı)</span>
              </div>
            </div>
            {kullanimGrafik.length === 0 ? (
              <p className="text-xs text-gray-600 py-16 text-center">Bu dönemde en az iki sayım yok.</p>
            ) : (
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={kullanimGrafik}>
                    <CartesianGrid stroke="rgba(0,0,0,0.05)" vertical={false} />
                    <XAxis dataKey="gun" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} width={36} />
                    <Tooltip formatter={(v, _n, p) => [`${fmt(Number(v), 2)} ${urun.birim}${(p?.payload as { tahmini?: boolean })?.tahmini ? " (tahmini)" : ""}`, "Kullanım"]} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    {durum.ort7.ortalama > 0 && <ReferenceLine y={durum.ort7.ortalama} stroke="#7c3aed" strokeDasharray="4 4" label={{ value: "7g ort.", fontSize: 10, fill: "#6d28d9", position: "insideTopRight" }} />}
                    <Bar dataKey="kullanim" radius={[4, 4, 0, 0]}>
                      {kullanimGrafik.map((g, i) => <Cell key={i} fill={g.tahmini ? "#c4b5fd" : "#8b5cf6"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-[#e2e5eb] bg-[#ffffff] p-5">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-4"><BarChart3 className="h-4 w-4 text-emerald-600"/> Sayılan Stok</h3>
            {sayimGrafik.length === 0 ? (
              <p className="text-xs text-gray-600 py-16 text-center">Bu dönemde sayım yok.</p>
            ) : (
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sayimGrafik}>
                    <CartesianGrid stroke="rgba(0,0,0,0.05)" vertical={false} />
                    <XAxis dataKey="gun" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} width={36} />
                    <Tooltip formatter={(v) => [`${fmt(Number(v))} ${urun.birim}`, "Sayım"]} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    {urun.min_stok > 0 && <ReferenceLine y={urun.min_stok} stroke="#F59E0B" strokeDasharray="5 5" label={{ value: "Min", fontSize: 10, fill: "#b45309" }} />}
                    <Area dataKey="miktar" type="monotone" stroke="#10B981" strokeWidth={2} fill="rgba(16,185,129,0.12)" dot={{ r: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* HAREKETLER */}
        <div className="rounded-2xl border border-[#e2e5eb] bg-[#ffffff] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#e2e5eb]">
            <h3 className="text-sm font-semibold text-gray-800">Hareketler ({hareketler.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#e2e5eb] bg-[#f7f8fa]">
                  {["Tarih", "Tür", "Miktar", "Fiyat", "Açıklama", "Kullanıcı", ""].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e5eb]">
                {hareketler.map(h => {
                  const konfig = TIP_KONFIG[h.tip] || TIP_KONFIG.duzeltme;
                  const Icon = konfig.icon;
                  return (
                    <tr key={h.id} className="hover:bg-black/[0.03] group">
                      <td className="px-4 py-3 text-gray-700 font-semibold">{fmtTarih(h.tarih)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full ${konfig.rozet}`}>
                          <Icon size={9}/> {h.tip === "cikis" ? nedenEtiketi(h.neden) : konfig.label}
                        </span>
                      </td>
                      <td className={`px-4 py-3 font-black ${konfig.yazi}`}>
                        {h.tip === "giris" ? "+" : h.tip === "cikis" ? "−" : ""}{fmt(h.miktar)} {urun.birim}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{h.birim_fiyat ? `₺${fmt(h.birim_fiyat, 2)}` : "—"}</td>
                      <td className="px-4 py-3 text-gray-500">{h.aciklama || "—"}</td>
                      <td className="px-4 py-3 text-gray-600 text-[10px]">{h.kullanici || "—"}</td>
                      <td className="px-4 py-3">
                        {isAdmin && (
                          <button onClick={() => hareketSil(h)} title="Sil" className="p-1 text-gray-400 hover:text-red-600">
                            <Trash2 size={12}/>
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

      {/* SAYIM / GİRİŞ / ÇIKIŞ MODAL */}
      {modal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#ffffff] border border-[#e2e5eb] rounded-2xl w-full max-w-sm">
            <div className="px-5 py-4 border-b border-[#e2e5eb] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1a1f2e] flex items-center gap-2">
                {modal === "sayim" ? <><ClipboardCheck size={14} className="text-blue-600"/> Sayım Gir</>
                  : modal === "giris" ? <><Truck size={14} className="text-amber-600"/> Mal Girişi</>
                  : <><PackageMinus size={14} className="text-red-600"/> Stok Çıkışı / Fire</>}
              </h3>
              <button onClick={() => setModal(null)} className="text-gray-600"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3">
              {modal === "sayim" && (
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl px-3 py-2 text-xs">
                  Tahmini olması gereken: <strong className="text-[#1a1f2e]">~{fmt(durum.tahminiMevcut)} {urun.birim}</strong>
                  <p className="text-[10px] text-gray-500 mt-0.5">Akşam sayımı ile ertesi sabahın sayımı aynı an kabul edilir; arada kullanım hesaplanmaz.</p>
                </div>
              )}
              {modal === "sayim" && <VakitSecici value={vakit} onChange={setVakit}/>}
              {modal === "cikis" && (
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Neden</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {CIKIS_NEDENLERI.map(n => (
                      <button key={n.v} type="button" onClick={() => setNeden(n.v)}
                        className={`text-xs font-semibold py-2 rounded-lg border ${neden === n.v ? "bg-red-600 text-white border-red-600" : "bg-[#f7f8fa] border-[#e2e5eb] text-gray-600"}`}>
                        {n.l}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Tarih</label>
                  <input type="date" value={tarih} max={bugun()} onChange={e => setTarih(e.target.value)} className={inputCls}/>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">
                    {modal === "sayim" ? "Stokta olan" : modal === "giris" ? "Gelen miktar" : "Çıkan miktar"} ({urun.birim})
                  </label>
                  <input type="text" inputMode="decimal" value={miktar} onChange={e => setMiktar(e.target.value)} autoFocus className={`${inputCls} font-bold`}/>
                </div>
              </div>
              {modal === "giris" && (
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Birim alış fiyatı (₺, opsiyonel)</label>
                  <input type="text" inputMode="decimal" value={fiyat} onChange={e => setFiyat(e.target.value)} className={inputCls}/>
                </div>
              )}
              <div>
                <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Açıklama</label>
                <input type="text" value={not} onChange={e => setNot(e.target.value)} placeholder="Opsiyonel" className={`${inputCls} text-xs`}/>
              </div>
              {modal === "cikis" && urun.son_fiyat && miktarOku(miktar) > 0 && (
                <p className="text-[11px] text-red-700">Yaklaşık değer: ₺{fmt(miktarOku(miktar) * urun.son_fiyat, 0)}</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setModal(null)} className="text-xs font-semibold text-gray-500 border border-[#e2e5eb] px-4 py-2 rounded-xl">İptal</button>
                <button onClick={kaydet} disabled={saving || !miktar}
                  className={`text-xs font-bold text-white px-6 py-2 rounded-xl flex items-center gap-2 disabled:opacity-40 ${modal === "sayim" ? "bg-blue-600 hover:bg-blue-700" : modal === "giris" ? "bg-amber-600 hover:bg-amber-700" : "bg-red-600 hover:bg-red-700"}`}>
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
