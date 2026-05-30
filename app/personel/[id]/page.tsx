"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft, Phone, CreditCard, Landmark, Users, CalendarDays,
  FileText, Wallet, Save, Loader2, AlertTriangle, CheckCircle2,
  User, Shield, Trash2, RotateCcw
} from "lucide-react";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface Personel {
  id: string;
  isim: string;
  telefon?: string;
  tc_kimlik?: string;
  iban?: string;
  departman?: string;
  maas?: number;
  ise_giris_tarihi?: string;
  isten_cikis_tarihi?: string;
  durum: "aktif" | "ayrildi";
  notlar?: string;
  ekleyen_kullanici?: string;
  created_at?: string;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const DEPARTMANLAR = ["Mutfak", "Banko", "Kurye", "Temizlik", "Yönetim", "Diğer"];

const fmt = (v: number) =>
  new Intl.NumberFormat("tr-TR").format(v);

const fmtTarih = (t?: string) => {
  if (!t) return "—";
  const [y, m, d] = t.split("-");
  return `${d}.${m}.${y}`;
};

// ─── FIELD CARD ───────────────────────────────────────────────────────────────

function FieldCard({
  icon, label, color = "text-gray-400", children,
}: {
  icon: React.ReactNode;
  label: string;
  color?: string;
  children: React.ReactNode;
}) {
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

// ─── INPUT STİLİ ──────────────────────────────────────────────────────────────

const inputCls = "w-full bg-[#080b14] border border-[#1a2236] hover:border-[#243050] focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/15 text-white text-sm h-10 px-3 rounded-xl outline-none transition-all placeholder:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed";

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

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

  // ── Veri çek ──
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setIsAdmin(user?.email === "murat@kebo.com" || user?.email === "bulent@kebo.com");

      const { data, error } = await supabase
        .from("personeller")
        .select("*")
        .eq("id", params.id)
        .single();

      if (error || !data) {
        showToast("hata", "Personel bulunamadı.");
        setLoading(false);
        return;
      }
      setPersonel(data as Personel);
      setOrijinal(data as Personel);
      setLoading(false);
    };
    init();
  }, [params.id]);

  // ── Toast ──
  const showToast = (tip: "basari" | "hata", mesaj: string) => {
    setToast({ tip, mesaj });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Değişiklik var mı ──
  const degisiklikVarMi = JSON.stringify(personel) !== JSON.stringify(orijinal);

  // ── Kaydet ──
  const handleKaydet = async () => {
    if (!personel) return;

    // İşten çıkış tarihi girilmişse onay iste
    if (personel.isten_cikis_tarihi && personel.durum === "aktif") {
      setCikisOnayAcik(true);
      return;
    }
    await kaydet(personel);
  };

  const kaydet = async (veri: Personel) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("personeller")
        .update({
          isim: veri.isim,
          telefon: veri.telefon,
          tc_kimlik: veri.tc_kimlik,
          iban: veri.iban,
          departman: veri.departman,
          maas: veri.maas,
          ise_giris_tarihi: veri.ise_giris_tarihi,
          isten_cikis_tarihi: veri.isten_cikis_tarihi || null,
          durum: veri.durum,
          notlar: veri.notlar,
        })
        .eq("id", veri.id);

      if (error) { showToast("hata", "Kayıt hatası: " + error.message); return; }
      setOrijinal(veri);
      showToast("basari", "Değişiklikler kaydedildi.");
    } finally {
      setSaving(false);
    }
  };

  // ── İşten çıkışı onayla ──
  const cikisiOnayla = async () => {
    if (!personel) return;
    const guncellenen = { ...personel, durum: "ayrildi" as const };
    setPersonel(guncellenen);
    setCikisOnayAcik(false);
    await kaydet(guncellenen);
    router.push("/personeller?tab=ayrildi");
  };

  // ── Sil ──
  const handleSil = async () => {
    if (!personel) return;
    const { error } = await supabase.from("personeller").delete().eq("id", personel.id);
    if (error) { showToast("hata", "Silme hatası: " + error.message); return; }
    router.push("/personeller");
  };

  // ── Tekrar aktifleştir ──
  const handleAktiflesir = async () => {
    if (!personel) return;
    const guncellenen = { ...personel, durum: "aktif" as const, isten_cikis_tarihi: "" };
    setPersonel(guncellenen);
    await kaydet(guncellenen);
  };

  if (loading) return (
    <div className="min-h-screen bg-[#060810] flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );

  if (!personel) return (
    <div className="min-h-screen bg-[#060810] flex items-center justify-center text-gray-500 text-sm">
      Personel bulunamadı.
    </div>
  );

  const calismaSuresi = personel.ise_giris_tarihi
    ? Math.floor((new Date().getTime() - new Date(personel.ise_giris_tarihi).getTime()) / (1000 * 60 * 60 * 24 * 30))
    : null;

  return (
    <div className="min-h-screen bg-[#060810] text-white font-sans antialiased pb-10">

      {/* ── TOAST ── */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[80] flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-2xl text-sm font-semibold transition-all animate-in slide-in-from-top duration-300 ${
          toast.tip === "basari"
            ? "bg-emerald-950 border-emerald-500/30 text-emerald-400"
            : "bg-red-950 border-red-500/30 text-red-400"
        }`}>
          {toast.tip === "basari"
            ? <CheckCircle2 size={16} />
            : <AlertTriangle size={16} />}
          {toast.mesaj}
        </div>
      )}

      {/* ── HEADER ── */}
      <div className="sticky top-0 z-40 border-b border-[#0f1624] bg-[#060810]/95 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/personeller"
              className="p-2 text-gray-600 hover:text-white border border-[#1a2236] hover:border-[#2a3550] rounded-xl transition-colors">
              <ArrowLeft size={15} />
            </Link>
            <div>
              <p className="text-[10px] text-gray-600 uppercase tracking-widest">Personel Detayı</p>
              <h1 className="text-sm font-bold text-white leading-none mt-0.5">{personel.isim}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Durum badge */}
            <span className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border ${
              personel.durum === "aktif"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : "bg-red-500/10 border-red-500/20 text-red-400"
            }`}>
              {personel.durum === "aktif" ? "● Aktif" : "● Ayrıldı"}
            </span>
            {/* Kaydet */}
            <button onClick={handleKaydet} disabled={saving || !degisiklikVarMi}
              className="flex items-center gap-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 rounded-xl transition-colors shadow-lg shadow-blue-900/20">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Kaydet
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 space-y-5">

        {/* ── KİŞİ KARTI ── */}
        <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
              <User className="h-7 w-7 text-blue-400" />
            </div>
            <div>
              <input
                value={personel.isim}
                onChange={e => setPersonel({ ...personel, isim: e.target.value })}
                className="bg-transparent text-xl font-black text-white outline-none border-b border-transparent hover:border-[#1a2236] focus:border-blue-500/50 transition-colors pb-0.5 w-full max-w-xs"
                placeholder="Personel Adı"
              />
              <p className="text-[11px] text-gray-600 mt-1 flex items-center gap-3">
                {personel.departman && <span>{personel.departman}</span>}
                {calismaSuresi !== null && <span>· {calismaSuresi} aydır çalışıyor</span>}
                {personel.maas && <span className="text-emerald-500">· ₺{fmt(personel.maas)}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {personel.durum === "ayrildi" && isAdmin && (
              <button onClick={handleAktiflesir}
                className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-xl hover:bg-emerald-500/15 transition-colors">
                <RotateCcw size={12} /> Tekrar Aktifleştir
              </button>
            )}
            {isAdmin && (
              <button onClick={() => setSilmeOnayAcik(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-xl hover:bg-red-500/15 transition-colors">
                <Trash2 size={12} /> Sil
              </button>
            )}
          </div>
        </div>

        {/* ── ANA BİLGİLER GRID ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

          <FieldCard icon={<Phone size={15} />} label="Telefon" color="text-orange-400">
            <input type="tel" value={personel.telefon || ""} placeholder="05__ ___ __ __"
              onChange={e => setPersonel({ ...personel, telefon: e.target.value })}
              className={inputCls} />
          </FieldCard>

          <FieldCard icon={<CreditCard size={15} />} label="TC Kimlik No" color="text-blue-400">
            <input type="text" value={personel.tc_kimlik || ""} placeholder="11 haneli TC no"
              maxLength={11}
              onChange={e => setPersonel({ ...personel, tc_kimlik: e.target.value.replace(/\D/g, "") })}
              className={inputCls} />
          </FieldCard>

          <FieldCard icon={<Landmark size={15} />} label="IBAN" color="text-emerald-400">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-bold">TR</span>
              <input type="text" value={personel.iban || ""} placeholder="__ ____ ____ ____ ____ __ "
                onChange={e => setPersonel({ ...personel, iban: e.target.value })}
                className={`${inputCls} pl-9`} />
            </div>
          </FieldCard>

          <FieldCard icon={<Users size={15} />} label="Departman" color="text-purple-400">
            <select value={personel.departman || ""}
              onChange={e => setPersonel({ ...personel, departman: e.target.value })}
              className={inputCls}>
              <option value="">Seçiniz...</option>
              {DEPARTMANLAR.map(d => <option key={d} value={d} className="bg-[#0c0f1a]">{d}</option>)}
            </select>
          </FieldCard>

          <FieldCard icon={<Wallet size={15} />} label="Aylık Maaş" color="text-amber-400">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-xs">₺</span>
              <input type="number" value={personel.maas || ""} placeholder="0"
                onChange={e => setPersonel({ ...personel, maas: parseFloat(e.target.value) || 0 })}
                className={`${inputCls} pl-7`} />
            </div>
          </FieldCard>

          <FieldCard icon={<CalendarDays size={15} />} label="İşe Giriş Tarihi" color="text-pink-400">
            <input type="date" value={personel.ise_giris_tarihi || ""}
              onChange={e => setPersonel({ ...personel, ise_giris_tarihi: e.target.value })}
              className={inputCls} />
          </FieldCard>

        </div>

        {/* ── NOTLAR ── */}
        <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-4">
          <div className="flex items-center gap-2.5 mb-3">
            <FileText size={15} className="text-gray-500" />
            <label className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Notlar</label>
          </div>
          <textarea value={personel.notlar || ""}
            onChange={e => setPersonel({ ...personel, notlar: e.target.value })}
            placeholder="Personel hakkında özel notlar..."
            rows={3}
            className="w-full bg-[#080b14] border border-[#1a2236] hover:border-[#243050] focus:border-blue-500/50 text-white text-sm px-3 py-2.5 rounded-xl outline-none transition-all resize-none placeholder:text-gray-700" />
        </div>

        {/* ── İŞTEN ÇIKIŞ ── */}
        <div className={`rounded-2xl border p-4 ${personel.durum === "ayrildi" ? "border-red-500/20 bg-red-950/10" : "border-[#1a2236] bg-[#0c0f1a]"}`}>
          <div className="flex items-center gap-2.5 mb-3">
            <CalendarDays size={15} className="text-red-400" />
            <label className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold">İşten Çıkış Tarihi</label>
            {personel.durum === "ayrildi" && (
              <span className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full ml-auto">İşten Ayrıldı</span>
            )}
          </div>
          <input type="date" value={personel.isten_cikis_tarihi || ""}
            onChange={e => setPersonel({ ...personel, isten_cikis_tarihi: e.target.value })}
            className={inputCls} />
          {personel.isten_cikis_tarihi && (
            <p className="text-[11px] text-red-400/70 mt-2 flex items-center gap-1.5">
              <AlertTriangle size={11} />
              Çıkış tarihi: <strong>{fmtTarih(personel.isten_cikis_tarihi)}</strong>
              {personel.durum === "aktif" && " — Kaydedince personel 'Ayrılanlar' listesine taşınır."}
            </p>
          )}
        </div>

        {/* Değişiklik uyarısı */}
        {degisiklikVarMi && (
          <div className="flex items-center justify-between gap-3 bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-amber-400">
              <AlertTriangle size={13} />
              Kaydedilmemiş değişiklikler var.
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPersonel(orijinal!)}
                className="text-xs text-gray-500 hover:text-white border border-[#1a2236] px-3 py-1.5 rounded-lg transition-colors">
                Geri Al
              </button>
              <button onClick={handleKaydet} disabled={saving}
                className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-40">
                {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                Kaydet
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── ÇIKIŞ ONAY MODALİ ── */}
      {cikisOnayAcik && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0f1a] border border-red-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">İşten Çıkış Onayı</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{personel.isim} — {fmtTarih(personel.isten_cikis_tarihi)}</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-5 leading-relaxed">
              Bu personel <strong className="text-white">Ayrılan Personeller</strong> listesine taşınacak ve durumu güncellenecek. Onaylıyor musunuz?
            </p>
            <div className="flex gap-2">
              <button onClick={() => setCikisOnayAcik(false)}
                className="flex-1 text-xs font-semibold text-gray-500 hover:text-white border border-[#1a2236] py-2.5 rounded-xl transition-colors">İptal</button>
              <button onClick={cikisiOnayla}
                className="flex-1 text-xs font-bold text-white bg-red-600 hover:bg-red-700 py-2.5 rounded-xl transition-colors">
                Evet, Çıkışı Onayla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SİLME ONAY MODALİ ── */}
      {silmeOnayAcik && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0f1a] border border-red-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Personeli Sil</p>
                <p className="text-[11px] text-gray-500 mt-0.5">Bu işlem geri alınamaz</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-5">
              <strong className="text-white">{personel.isim}</strong> adlı personelin tüm kayıtları silinecek.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setSilmeOnayAcik(false)}
                className="flex-1 text-xs font-semibold text-gray-500 hover:text-white border border-[#1a2236] py-2.5 rounded-xl transition-colors">İptal</button>
              <button onClick={handleSil}
                className="flex-1 text-xs font-bold text-white bg-red-600 hover:bg-red-700 py-2.5 rounded-xl transition-colors">
                Evet, Sil
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
