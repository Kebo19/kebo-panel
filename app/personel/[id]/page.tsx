"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft, Phone, CreditCard, Landmark, Users, CalendarDays,
  FileText, Wallet, Save, Loader2, AlertTriangle, CheckCircle2,
  User, Shield, Trash2, RotateCcw, Plus, X, TrendingUp, TrendingDown, Minus
} from "lucide-react";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface Personel {
  id: string; isim: string; telefon?: string; tc_kimlik?: string; iban?: string;
  departman?: string; maas?: number; ise_giris_tarihi?: string; isten_cikis_tarihi?: string;
  durum: "aktif" | "ayrildi"; notlar?: string; ekleyen_kullanici?: string; created_at?: string;
}

interface Avans { id: string; personel_isim: string; tutar: number; tarih: string; odeme_yontemi: string; kasa_kaynagi: string; aciklama: string; created_at: string; }
interface Prim { id: string; personel_isim: string; tutar: number; tarih: string; aciklama: string; odendi: boolean; odeme_tarihi?: string; created_at: string; }
interface Kesinti { id: string; personel_isim: string; tutar: number; tarih: string; aciklama: string; created_at: string; }

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const DEPARTMANLAR = ["Mutfak", "Banko", "Kurye", "Temizlik", "Yönetim", "Diğer"];
const KASALAR = ["Nakit Kasa", "POS", "Banka Havalesi", "Diğer"];
const fmt = (v: number) => new Intl.NumberFormat("tr-TR").format(v);
const fmtTarih = (t?: string) => { if (!t) return "—"; const [y, m, d] = t.split("-"); return `${d}.${m}.${y}`; };
const inputCls = "w-full bg-[#080b14] border border-[#1a2236] hover:border-[#243050] focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/15 text-white text-sm h-10 px-3 rounded-xl outline-none transition-all placeholder:text-gray-700 disabled:opacity-40";

// ─── FIELD CARD ───────────────────────────────────────────────────────────────

function FieldCard({ icon, label, color = "text-gray-400", children }: { icon: React.ReactNode; label: string; color?: string; children: React.ReactNode; }) {
  return (
    <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-4">
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`${color} opacity-80`}>{icon}</div>
        <label className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold">{label}</label>
      </div>
      {children}
    </div>
  );
}

// ─── MODAL ────────────────────────────────────────────────────────────────────

function Modal({ baslik, acik, onKapat, children }: { baslik: string; acik: boolean; onKapat: () => void; children: React.ReactNode; }) {
  if (!acik) return null;
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-black text-white">{baslik}</h3>
          <button onClick={onKapat} className="text-gray-600 hover:text-white transition-colors"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── ANA SAYFA ────────────────────────────────────────────────────────────────

export default function PersonelDetayPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();

  const [personel, setPersonel] = useState<Personel | null>(null);
  const [orijinal, setOrijinal] = useState<Personel | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [toast, setToast] = useState<{ tip: "basari" | "hata"; mesaj: string } | null>(null);
  const [cikisOnayAcik, setCikisOnayAcik] = useState(false);
  const [silmeOnayAcik, setSilmeOnayAcik] = useState(false);
  const [aktifTab, setAktifTab] = useState<"bilgiler" | "avans" | "prim" | "kesinti">("bilgiler");

  // Avans/Prim/Kesinti state
  const [avanslar, setAvanslar] = useState<Avans[]>([]);
  const [primler, setPrimler] = useState<Prim[]>([]);
  const [kesintiler, setKesintiler] = useState<Kesinti[]>([]);

  // Modal state
  const [avansModal, setAvansModal] = useState(false);
  const [primModal, setPrimModal] = useState(false);
  const [kesintiModal, setKesintiModal] = useState(false);

  // Form state
  const [yeniAvans, setYeniAvans] = useState({ tutar: "", tarih: new Date().toISOString().split("T")[0], odeme_yontemi: "Nakit Kasa", kasa_kaynagi: "Nakit Kasa", aciklama: "" });
  const [yeniPrim, setYeniPrim] = useState({ tutar: "", tarih: new Date().toISOString().split("T")[0], aciklama: "" });
  const [yeniKesinti, setYeniKesinti] = useState({ tutar: "", tarih: new Date().toISOString().split("T")[0], aciklama: "" });
  const [formSaving, setFormSaving] = useState(false);

  const showToast = (tip: "basari" | "hata", mesaj: string) => {
    setToast({ tip, mesaj });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Veri çek ──
  const finansalVeriCek = useCallback(async (isim: string) => {
    const [{ data: a }, { data: p }, { data: k }] = await Promise.all([
      supabase.from("avanslar").select("*").eq("personel_isim", isim).order("tarih", { ascending: false }),
      supabase.from("primler").select("*").eq("personel_isim", isim).order("tarih", { ascending: false }),
      supabase.from("kesintiler").select("*").eq("personel_isim", isim).order("tarih", { ascending: false }),
    ]);
    if (a) setAvanslar(a as Avans[]);
    if (p) setPrimler(p as Prim[]);
    if (k) setKesintiler(k as Kesinti[]);
  }, []);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setIsAdmin(user?.email === "murat@kebo.com" || user?.email === "bulent@kebo.com");
      const { data, error } = await supabase.from("personeller").select("*").eq("id", params.id).single();
      if (error || !data) { showToast("hata", "Personel bulunamadı."); setLoading(false); return; }
      setPersonel(data as Personel);
      setOrijinal(data as Personel);
      await finansalVeriCek(data.isim);
      setLoading(false);
    };
    init();
  }, [params.id]);

  const degisiklikVarMi = JSON.stringify(personel) !== JSON.stringify(orijinal);

  // ── Personel kaydet ──
  const handleKaydet = async () => {
    if (!personel) return;
    if (personel.isten_cikis_tarihi && personel.durum === "aktif") { setCikisOnayAcik(true); return; }
    await kaydet(personel);
  };

  const kaydet = async (veri: Personel) => {
    setSaving(true);
    try {
      const { error } = await supabase.from("personeller").update({
        isim: veri.isim, telefon: veri.telefon, tc_kimlik: veri.tc_kimlik, iban: veri.iban,
        departman: veri.departman, maas: veri.maas, ise_giris_tarihi: veri.ise_giris_tarihi,
        isten_cikis_tarihi: veri.isten_cikis_tarihi || null, durum: veri.durum, notlar: veri.notlar,
      }).eq("id", veri.id);
      if (error) { showToast("hata", "Kayıt hatası: " + error.message); return; }
      setOrijinal(veri);
      showToast("basari", "Değişiklikler kaydedildi.");
    } finally { setSaving(false); }
  };

  const cikisiOnayla = async () => {
    if (!personel) return;
    const guncellenen = { ...personel, durum: "ayrildi" as const };
    setPersonel(guncellenen); setCikisOnayAcik(false);
    await kaydet(guncellenen);
    router.push("/personel?tab=ayrildi");
  };

  const handleSil = async () => {
    if (!personel) return;
    const { error } = await supabase.from("personeller").delete().eq("id", personel.id);
    if (error) { showToast("hata", "Silme hatası: " + error.message); return; }
    router.push("/personel");
  };

  const handleAktiflesir = async () => {
    if (!personel) return;
    const guncellenen = { ...personel, durum: "aktif" as const, isten_cikis_tarihi: "" };
    setPersonel(guncellenen);
    await kaydet(guncellenen);
  };

  // ── Avans kaydet ──
  const avansKaydet = async () => {
    if (!personel || !yeniAvans.tutar) return;
    setFormSaving(true);
    const { error } = await supabase.from("avanslar").insert({
      personel_isim: personel.isim,
      tutar: parseFloat(yeniAvans.tutar.replace(/\./g, "").replace(",", ".")),
      tarih: yeniAvans.tarih,
      odeme_yontemi: yeniAvans.odeme_yontemi,
      kasa_kaynagi: yeniAvans.kasa_kaynagi,
      aciklama: yeniAvans.aciklama,
    });
    setFormSaving(false);
    if (error) { showToast("hata", "Kayıt hatası."); return; }
    showToast("basari", "Avans kaydedildi.");
    setAvansModal(false);
    setYeniAvans({ tutar: "", tarih: new Date().toISOString().split("T")[0], odeme_yontemi: "Nakit Kasa", kasa_kaynagi: "Nakit Kasa", aciklama: "" });
    finansalVeriCek(personel.isim);
  };

  // ── Prim kaydet ──
  const primKaydet = async () => {
    if (!personel || !yeniPrim.tutar) return;
    setFormSaving(true);
    const { error } = await supabase.from("primler").insert({
      personel_isim: personel.isim,
      tutar: parseFloat(yeniPrim.tutar.replace(/\./g, "").replace(",", ".")),
      tarih: yeniPrim.tarih,
      aciklama: yeniPrim.aciklama,
      odendi: false,
    });
    setFormSaving(false);
    if (error) { showToast("hata", "Kayıt hatası."); return; }
    showToast("basari", "Prim kaydedildi.");
    setPrimModal(false);
    setYeniPrim({ tutar: "", tarih: new Date().toISOString().split("T")[0], aciklama: "" });
    finansalVeriCek(personel.isim);
  };

  // ── Prim ödendi işaretle ──
  const primOdendi = async (id: string) => {
    await supabase.from("primler").update({ odendi: true, odeme_tarihi: new Date().toISOString().split("T")[0] }).eq("id", id);
    if (personel) finansalVeriCek(personel.isim);
    showToast("basari", "Prim ödendi olarak işaretlendi.");
  };

  // ── Kesinti kaydet ──
  const kesintiKaydet = async () => {
    if (!personel || !yeniKesinti.tutar) return;
    setFormSaving(true);
    const { error } = await supabase.from("kesintiler").insert({
      personel_isim: personel.isim,
      tutar: parseFloat(yeniKesinti.tutar.replace(/\./g, "").replace(",", ".")),
      tarih: yeniKesinti.tarih,
      aciklama: yeniKesinti.aciklama,
    });
    setFormSaving(false);
    if (error) { showToast("hata", "Kayıt hatası."); return; }
    showToast("basari", "Kesinti kaydedildi.");
    setKesintiModal(false);
    setYeniKesinti({ tutar: "", tarih: new Date().toISOString().split("T")[0], aciklama: "" });
    finansalVeriCek(personel.isim);
  };

  // ── Sil işlemleri ──
  const avansKaldir = async (id: string) => {
    if (!confirm("Bu avans kaydını silmek istiyor musunuz?")) return;
    await supabase.from("avanslar").delete().eq("id", id);
    if (personel) finansalVeriCek(personel.isim);
  };
  const primKaldir = async (id: string) => {
    if (!confirm("Bu prim kaydını silmek istiyor musunuz?")) return;
    await supabase.from("primler").delete().eq("id", id);
    if (personel) finansalVeriCek(personel.isim);
  };
  const kesintiKaldir = async (id: string) => {
    if (!confirm("Bu kesinti kaydını silmek istiyor musunuz?")) return;
    await supabase.from("kesintiler").delete().eq("id", id);
    if (personel) finansalVeriCek(personel.isim);
  };

  // ── Özet hesapla ──
  const toplamAvans = avanslar.reduce((s, a) => s + a.tutar, 0);
  const toplamPrim = primler.reduce((s, p) => s + p.tutar, 0);
  const odenmemisPrim = primler.filter(p => !p.odendi).reduce((s, p) => s + p.tutar, 0);
  const toplamKesinti = kesintiler.reduce((s, k) => s + k.tutar, 0);

  if (loading) return <div className="min-h-screen bg-[#060810] flex items-center justify-center"><div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" /></div>;
  if (!personel) return <div className="min-h-screen bg-[#060810] flex items-center justify-center text-gray-500 text-sm">Personel bulunamadı.</div>;

  const calismaSuresi = personel.ise_giris_tarihi
    ? Math.floor((new Date().getTime() - new Date(personel.ise_giris_tarihi).getTime()) / (1000 * 60 * 60 * 24 * 30))
    : null;

  return (
    <div className="min-h-screen bg-[#060810] text-white font-sans antialiased pb-10">

      {/* TOAST */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[80] flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-2xl text-sm font-semibold animate-in slide-in-from-top duration-300 ${toast.tip === "basari" ? "bg-emerald-950 border-emerald-500/30 text-emerald-400" : "bg-red-950 border-red-500/30 text-red-400"}`}>
          {toast.tip === "basari" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {toast.mesaj}
        </div>
      )}

      {/* HEADER */}
      <div className="sticky top-0 z-40 border-b border-[#0f1624] bg-[#060810]/95 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/personel" className="p-2 text-gray-600 hover:text-white border border-[#1a2236] rounded-xl transition-colors">
              <ArrowLeft size={15} />
            </Link>
            <div>
              <p className="text-[10px] text-gray-600 uppercase tracking-widest">Personel Detayı</p>
              <h1 className="text-sm font-bold text-white leading-none mt-0.5">{personel.isim}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border ${personel.durum === "aktif" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
              {personel.durum === "aktif" ? "● Aktif" : "● Ayrıldı"}
            </span>
            {aktifTab === "bilgiler" && (
              <button onClick={handleKaydet} disabled={saving || !degisiklikVarMi}
                className="flex items-center gap-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 px-4 py-2 rounded-xl transition-colors">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Kaydet
              </button>
            )}
          </div>
        </div>

        {/* TABS */}
        <div className="max-w-4xl mx-auto px-4 flex gap-1 pb-2">
          {[
            { key: "bilgiler", label: "Bilgiler" },
            { key: "avans", label: `Avans (${avanslar.length})` },
            { key: "prim", label: `Prim (${primler.length})` },
            { key: "kesinti", label: `Kesinti (${kesintiler.length})` },
          ].map(t => (
            <button key={t.key} onClick={() => setAktifTab(t.key as any)}
              className={`text-xs font-bold px-4 py-2 rounded-xl transition-colors ${aktifTab === t.key ? "bg-blue-600 text-white" : "text-gray-500 hover:text-white"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-5 space-y-5">

        {/* ── KİŞİ KARTI ── */}
        <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
              <span className="text-xl font-black text-blue-400">{personel.isim.split(" ").map(n => n[0]).slice(0, 2).join("")}</span>
            </div>
            <div>
              <p className="text-xl font-black text-white">{personel.isim}</p>
              <p className="text-[11px] text-gray-600 mt-1 flex items-center gap-3 flex-wrap">
                {personel.departman && <span>{personel.departman}</span>}
                {calismaSuresi !== null && <span>· {calismaSuresi} aydır çalışıyor</span>}
                {personel.maas && <span className="text-emerald-500">· ₺{fmt(personel.maas)}</span>}
              </p>
            </div>
          </div>
          {/* Finansal özet */}
          <div className="flex gap-3 flex-wrap">
            <div className="text-center bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2">
              <p className="text-[10px] text-amber-400 uppercase tracking-widest">Avans</p>
              <p className="text-sm font-black text-amber-400">₺{fmt(toplamAvans)}</p>
            </div>
            <div className="text-center bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-3 py-2">
              <p className="text-[10px] text-emerald-400 uppercase tracking-widest">Bekleyen Prim</p>
              <p className="text-sm font-black text-emerald-400">₺{fmt(odenmemisPrim)}</p>
            </div>
            <div className="text-center bg-red-500/5 border border-red-500/20 rounded-xl px-3 py-2">
              <p className="text-[10px] text-red-400 uppercase tracking-widest">Kesinti</p>
              <p className="text-sm font-black text-red-400">₺{fmt(toplamKesinti)}</p>
            </div>
          </div>
        </div>

        {/* ── BİLGİLER TAB ── */}
        {aktifTab === "bilgiler" && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FieldCard icon={<Phone size={15} />} label="Telefon" color="text-orange-400">
                <input type="tel" value={personel.telefon || ""} placeholder="05__ ___ __ __"
                  onChange={e => setPersonel({ ...personel, telefon: e.target.value })} className={inputCls} />
              </FieldCard>
              <FieldCard icon={<CreditCard size={15} />} label="TC Kimlik No" color="text-blue-400">
                <input type="text" value={personel.tc_kimlik || ""} placeholder="11 haneli TC no" maxLength={11}
                  onChange={e => setPersonel({ ...personel, tc_kimlik: e.target.value.replace(/\D/g, "") })} className={inputCls} />
              </FieldCard>
              <FieldCard icon={<Landmark size={15} />} label="IBAN" color="text-emerald-400">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-bold">TR</span>
                  <input type="text" value={personel.iban || ""} placeholder="__ ____ ____ ____ ____ __"
                    onChange={e => setPersonel({ ...personel, iban: e.target.value })} className={`${inputCls} pl-9`} />
                </div>
              </FieldCard>
              <FieldCard icon={<Users size={15} />} label="Departman" color="text-purple-400">
                <select value={personel.departman || ""} onChange={e => setPersonel({ ...personel, departman: e.target.value })} className={inputCls}>
                  <option value="">Seçiniz...</option>
                  {DEPARTMANLAR.map(d => <option key={d} value={d} className="bg-[#0c0f1a]">{d}</option>)}
                </select>
              </FieldCard>
              <FieldCard icon={<Wallet size={15} />} label="Aylık Maaş" color="text-amber-400">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-xs">₺</span>
                  <input type="number" value={personel.maas || ""} placeholder="0"
                    onChange={e => setPersonel({ ...personel, maas: parseFloat(e.target.value) || 0 })} className={`${inputCls} pl-7`} />
                </div>
              </FieldCard>
              <FieldCard icon={<CalendarDays size={15} />} label="İşe Giriş Tarihi" color="text-pink-400">
                <input type="date" value={personel.ise_giris_tarihi || ""}
                  onChange={e => setPersonel({ ...personel, ise_giris_tarihi: e.target.value })} className={inputCls} />
              </FieldCard>
            </div>
            <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-4">
              <div className="flex items-center gap-2.5 mb-3">
                <FileText size={15} className="text-gray-500" />
                <label className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Notlar</label>
              </div>
              <textarea value={personel.notlar || ""} onChange={e => setPersonel({ ...personel, notlar: e.target.value })}
                placeholder="Personel hakkında özel notlar..." rows={3}
                className="w-full bg-[#080b14] border border-[#1a2236] hover:border-[#243050] focus:border-blue-500/50 text-white text-sm px-3 py-2.5 rounded-xl outline-none transition-all resize-none placeholder:text-gray-700" />
            </div>
            <div className={`rounded-2xl border p-4 ${personel.durum === "ayrildi" ? "border-red-500/20 bg-red-950/10" : "border-[#1a2236] bg-[#0c0f1a]"}`}>
              <div className="flex items-center gap-2.5 mb-3">
                <CalendarDays size={15} className="text-red-400" />
                <label className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold">İşten Çıkış Tarihi</label>
              </div>
              <input type="date" value={personel.isten_cikis_tarihi || ""}
                onChange={e => setPersonel({ ...personel, isten_cikis_tarihi: e.target.value })} className={inputCls} />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {personel.durum === "ayrildi" && isAdmin && (
                <button onClick={handleAktiflesir} className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-xl hover:bg-emerald-500/15 transition-colors">
                  <RotateCcw size={12} /> Tekrar Aktifleştir
                </button>
              )}
              {isAdmin && (
                <button onClick={() => setSilmeOnayAcik(true)} className="flex items-center gap-1.5 text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-xl hover:bg-red-500/15 transition-colors">
                  <Trash2 size={12} /> Personeli Sil
                </button>
              )}
            </div>
          </>
        )}

        {/* ── AVANS TAB ── */}
        {aktifTab === "avans" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Toplam avans: <span className="text-amber-400 font-black">₺{fmt(toplamAvans)}</span></p>
              </div>
              <button onClick={() => setAvansModal(true)}
                className="flex items-center gap-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-4 py-2 rounded-xl transition-colors">
                <Plus size={13} /> Avans Ekle
              </button>
            </div>
            {avanslar.length === 0 ? (
              <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl py-12 text-center text-gray-600 text-xs uppercase tracking-widest">Avans kaydı yok</div>
            ) : (
              <div className="space-y-2">
                {avanslar.map(a => (
                  <div key={a.id} className="bg-[#0c0f1a] border border-amber-500/20 rounded-2xl p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                        <TrendingDown size={15} className="text-amber-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white">₺{fmt(a.tutar)}</p>
                        <p className="text-[11px] text-gray-500">{fmtTarih(a.tarih)} · {a.kasa_kaynagi}</p>
                        {a.aciklama && <p className="text-[11px] text-gray-600 truncate">{a.aciklama}</p>}
                      </div>
                    </div>
                    <button onClick={() => avansKaldir(a.id)} className="text-gray-700 hover:text-red-400 transition-colors shrink-0">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── PRİM TAB ── */}
        {aktifTab === "prim" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-xs text-gray-500">Toplam: <span className="text-emerald-400 font-black">₺{fmt(toplamPrim)}</span></p>
                <p className="text-xs text-gray-500">Ödenmemiş: <span className="text-yellow-400 font-black">₺{fmt(odenmemisPrim)}</span></p>
              </div>
              <button onClick={() => setPrimModal(true)}
                className="flex items-center gap-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-xl transition-colors">
                <Plus size={13} /> Prim Ekle
              </button>
            </div>
            {primler.length === 0 ? (
              <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl py-12 text-center text-gray-600 text-xs uppercase tracking-widest">Prim kaydı yok</div>
            ) : (
              <div className="space-y-2">
                {primler.map(p => (
                  <div key={p.id} className={`bg-[#0c0f1a] border rounded-2xl p-4 flex items-center justify-between gap-3 ${p.odendi ? "border-emerald-500/20" : "border-yellow-500/20"}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${p.odendi ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-yellow-500/10 border border-yellow-500/20"}`}>
                        <TrendingUp size={15} className={p.odendi ? "text-emerald-400" : "text-yellow-400"} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white">₺{fmt(p.tutar)}</p>
                        <p className="text-[11px] text-gray-500">{fmtTarih(p.tarih)}{p.odeme_tarihi ? ` · Ödendi: ${fmtTarih(p.odeme_tarihi)}` : ""}</p>
                        {p.aciklama && <p className="text-[11px] text-gray-600 truncate">{p.aciklama}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!p.odendi && (
                        <button onClick={() => primOdendi(p.id)}
                          className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg hover:bg-emerald-500/20 transition-colors">
                          Ödendi
                        </button>
                      )}
                      {p.odendi && <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-1 rounded-lg">✓ Ödendi</span>}
                      <button onClick={() => primKaldir(p.id)} className="text-gray-700 hover:text-red-400 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── KESİNTİ TAB ── */}
        {aktifTab === "kesinti" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">Toplam kesinti: <span className="text-red-400 font-black">₺{fmt(toplamKesinti)}</span></p>
              <button onClick={() => setKesintiModal(true)}
                className="flex items-center gap-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded-xl transition-colors">
                <Plus size={13} /> Kesinti Ekle
              </button>
            </div>
            {kesintiler.length === 0 ? (
              <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl py-12 text-center text-gray-600 text-xs uppercase tracking-widest">Kesinti kaydı yok</div>
            ) : (
              <div className="space-y-2">
                {kesintiler.map(k => (
                  <div key={k.id} className="bg-[#0c0f1a] border border-red-500/20 rounded-2xl p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                        <Minus size={15} className="text-red-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white">₺{fmt(k.tutar)}</p>
                        <p className="text-[11px] text-gray-500">{fmtTarih(k.tarih)}</p>
                        {k.aciklama && <p className="text-[11px] text-gray-600 truncate">{k.aciklama}</p>}
                      </div>
                    </div>
                    <button onClick={() => kesintiKaldir(k.id)} className="text-gray-700 hover:text-red-400 transition-colors shrink-0">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── AVANS MODAL ── */}
      <Modal baslik="Avans Ekle" acik={avansModal} onKapat={() => setAvansModal(false)}>
        <div className="space-y-3">
          <div>
            <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Tutar (₺)</p>
            <input type="number" value={yeniAvans.tutar} onChange={e => setYeniAvans({ ...yeniAvans, tutar: e.target.value })}
              placeholder="0" className={inputCls} />
          </div>
          <div>
            <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Tarih</p>
            <input type="date" value={yeniAvans.tarih} onChange={e => setYeniAvans({ ...yeniAvans, tarih: e.target.value })} className={inputCls} />
          </div>
          <div>
            <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Kasa Kaynağı</p>
            <select value={yeniAvans.kasa_kaynagi} onChange={e => setYeniAvans({ ...yeniAvans, kasa_kaynagi: e.target.value })} className={inputCls}>
              {KASALAR.map(k => <option key={k} value={k} className="bg-[#0c0f1a]">{k}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Açıklama</p>
            <input type="text" value={yeniAvans.aciklama} onChange={e => setYeniAvans({ ...yeniAvans, aciklama: e.target.value })}
              placeholder="Opsiyonel açıklama..." className={inputCls} />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => setAvansModal(false)} className="flex-1 text-xs font-semibold text-gray-500 hover:text-white border border-[#1a2236] py-2.5 rounded-xl transition-colors">İptal</button>
            <button onClick={avansKaydet} disabled={formSaving || !yeniAvans.tutar}
              className="flex-1 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-40 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
              {formSaving ? <Loader2 size={12} className="animate-spin" /> : null} Kaydet
            </button>
          </div>
        </div>
      </Modal>

      {/* ── PRİM MODAL ── */}
      <Modal baslik="Prim Ekle" acik={primModal} onKapat={() => setPrimModal(false)}>
        <div className="space-y-3">
          <div>
            <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Tutar (₺)</p>
            <input type="number" value={yeniPrim.tutar} onChange={e => setYeniPrim({ ...yeniPrim, tutar: e.target.value })}
              placeholder="0" className={inputCls} />
          </div>
          <div>
            <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Tarih</p>
            <input type="date" value={yeniPrim.tarih} onChange={e => setYeniPrim({ ...yeniPrim, tarih: e.target.value })} className={inputCls} />
          </div>
          <div>
            <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Açıklama</p>
            <input type="text" value={yeniPrim.aciklama} onChange={e => setYeniPrim({ ...yeniPrim, aciklama: e.target.value })}
              placeholder="Prim nedeni..." className={inputCls} />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => setPrimModal(false)} className="flex-1 text-xs font-semibold text-gray-500 hover:text-white border border-[#1a2236] py-2.5 rounded-xl transition-colors">İptal</button>
            <button onClick={primKaydet} disabled={formSaving || !yeniPrim.tutar}
              className="flex-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
              {formSaving ? <Loader2 size={12} className="animate-spin" /> : null} Kaydet
            </button>
          </div>
        </div>
      </Modal>

      {/* ── KESİNTİ MODAL ── */}
      <Modal baslik="Kesinti Ekle" acik={kesintiModal} onKapat={() => setKesintiModal(false)}>
        <div className="space-y-3">
          <div>
            <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Tutar (₺)</p>
            <input type="number" value={yeniKesinti.tutar} onChange={e => setYeniKesinti({ ...yeniKesinti, tutar: e.target.value })}
              placeholder="0" className={inputCls} />
          </div>
          <div>
            <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Tarih</p>
            <input type="date" value={yeniKesinti.tarih} onChange={e => setYeniKesinti({ ...yeniKesinti, tarih: e.target.value })} className={inputCls} />
          </div>
          <div>
            <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Açıklama</p>
            <input type="text" value={yeniKesinti.aciklama} onChange={e => setYeniKesinti({ ...yeniKesinti, aciklama: e.target.value })}
              placeholder="Kesinti nedeni..." className={inputCls} />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => setKesintiModal(false)} className="flex-1 text-xs font-semibold text-gray-500 hover:text-white border border-[#1a2236] py-2.5 rounded-xl transition-colors">İptal</button>
            <button onClick={kesintiKaydet} disabled={formSaving || !yeniKesinti.tutar}
              className="flex-1 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
              {formSaving ? <Loader2 size={12} className="animate-spin" /> : null} Kaydet
            </button>
          </div>
        </div>
      </Modal>

      {/* ÇIKIŞ ONAY */}
      {cikisOnayAcik && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0f1a] border border-red-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <p className="text-sm font-bold text-white mb-2">İşten Çıkış Onayı</p>
            <p className="text-xs text-gray-400 mb-5">{personel.isim} ayrılanlar listesine taşınacak. Onaylıyor musunuz?</p>
            <div className="flex gap-2">
              <button onClick={() => setCikisOnayAcik(false)} className="flex-1 text-xs font-semibold text-gray-500 border border-[#1a2236] py-2.5 rounded-xl">İptal</button>
              <button onClick={cikisiOnayla} className="flex-1 text-xs font-bold text-white bg-red-600 hover:bg-red-700 py-2.5 rounded-xl">Onayla</button>
            </div>
          </div>
        </div>
      )}

      {/* SİLME ONAY */}
      {silmeOnayAcik && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0f1a] border border-red-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <p className="text-sm font-bold text-white mb-2">Personeli Sil</p>
            <p className="text-xs text-gray-400 mb-5"><strong className="text-white">{personel.isim}</strong> silinecek. Bu işlem geri alınamaz.</p>
            <div className="flex gap-2">
              <button onClick={() => setSilmeOnayAcik(false)} className="flex-1 text-xs font-semibold text-gray-500 border border-[#1a2236] py-2.5 rounded-xl">İptal</button>
              <button onClick={handleSil} className="flex-1 text-xs font-bold text-white bg-red-600 hover:bg-red-700 py-2.5 rounded-xl">Evet, Sil</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
