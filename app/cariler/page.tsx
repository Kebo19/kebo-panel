"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Plus, Search, Building2, Trash2, X, Loader2, CheckCircle2,
  AlertTriangle, Wallet, ArrowLeft, Phone, Hash,
  Calendar, Check, Square, CheckSquare
} from "lucide-react";

const SABIT_TATILLER = (y: number) => [
  `${y}-01-01`,`${y}-04-23`,`${y}-05-01`,`${y}-05-19`,
  `${y}-07-15`,`${y}-08-30`,`${y}-10-29`,
];
const DINI_TATILLER = [
  "2025-03-30","2025-03-31","2025-04-01",
  "2025-06-06","2025-06-07","2025-06-08","2025-06-09",
  "2026-03-19","2026-03-20","2026-03-21",
  "2026-05-26","2026-05-27","2026-05-28","2026-05-29",
];
function isTatil(t: Date) {
  const g = t.getDay();
  if (g === 0 || g === 6) return true;
  const s = t.toISOString().split("T")[0];
  return SABIT_TATILLER(t.getFullYear()).includes(s) || DINI_TATILLER.includes(s);
}
function ilkIsGunu(t: Date) {
  const d = new Date(t);
  while (isTatil(d)) d.setDate(d.getDate() + 1);
  return d;
}
function buAyinOdemeDonemi() {
  const bugun = new Date();
  const ay = bugun.getMonth();
  const yil = bugun.getFullYear();
  const pad = (n: number) => String(n + 1).padStart(2, "0");
  const donemBas = `${ay === 0 ? yil - 1 : yil}-${pad(ay === 0 ? 11 : ay - 1)}-16`;
  const donemBit = `${yil}-${pad(ay)}-15`;
  const vade = ilkIsGunu(new Date(yil, ay, 25));
  return { donemBas, donemBit, vade };
}
function faturaDurumHesapla(faturaTarihi: string, mevcutDurum: string): string {
  if (mevcutDurum === "odendi") return "odendi";
  const donem = buAyinOdemeDonemi();
  if (faturaTarihi < donem.donemBas) return "gecikti";
  return "bekliyor";
}

interface Cari {
  id: string; cari_kodu: string; unvan: string; vergi_no: string;
  vergi_dairesi: string; telefon: string; adres: string; tip: string; kategori: string;
}
interface Fatura {
  id: string; fatura_no: string; fatura_tarihi: string;
  toplam_tutar: number; durum: string; aciklama: string;
}
interface Odeme {
  id: string; tutar: number; tarih: string; aciklama: string; odeme_yontemi: string;
}

const inputCls = "w-full bg-[#080b14] border border-[#1a2236] hover:border-[#243050] focus:border-blue-500/50 text-white text-sm h-11 px-3 rounded-xl outline-none transition-all placeholder:text-gray-700";
const fmt = (v: number) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(v);
const fmtTarih = (t: string) => { if (!t) return "—"; try { const p = t.split("-"); return `${p[2]}.${p[1]}.${p[0]}`; } catch { return t; } };

export default function CarilerPage() {
  const supabase = createClient();
  const [cariler, setCariler] = useState<Cari[]>([]);
  const [cariTutarMap, setCariTutarMap] = useState<Map<string, { buAy: number; toplam: number }>>(new Map());
  const [yukleniyor, setYukleniyor] = useState(true);
  const [aramaMetni, setAramaMetni] = useState("");
  const [aktifTab, setAktifTab] = useState<"duzenli" | "diger">("duzenli");
  const [seciliCari, setSeciliCari] = useState<Cari | null>(null);
  const [cariFaturalar, setCariFaturalar] = useState<Fatura[]>([]);
  const [cariOdemeler, setCariOdemeler] = useState<Odeme[]>([]);
  const [modalAcik, setModalAcik] = useState(false);
  const [odemeModalAcik, setOdemeModalAcik] = useState(false);
  const [seciliFaturalar, setSeciliFaturalar] = useState<Set<string>>(new Set());
  const [manuelTutar, setManuelTutar] = useState("");
  const [odemeTarih, setOdemeTarih] = useState(new Date().toISOString().split("T")[0]);
  const [odemeYontemi, setOdemeYontemi] = useState("Nakit");
  const [odemeAciklama, setOdemeAciklama] = useState("");
  const [formSaving, setFormSaving] = useState(false);
  const [topluIslemYukleniyor, setTopluIslemYukleniyor] = useState(false);
  const [toast, setToast] = useState<{ tip: "basari" | "hata"; mesaj: string } | null>(null);
  const [form, setForm] = useState({ cari_kodu: "", unvan: "", vergi_no: "", vergi_dairesi: "", telefon: "", adres: "", tip: "tedarikci", kategori: "duzenli" });

  const showToast = (tip: "basari" | "hata", mesaj: string) => {
    setToast({ tip, mesaj });
    setTimeout(() => setToast(null), 3000);
  };

  const donem = useMemo(() => buAyinOdemeDonemi(), []);

  const veriCek = useCallback(async () => {
    setYukleniyor(true);
    const [{ data: c }, { data: f }] = await Promise.all([
      supabase.from("cariler").select("*").order("unvan"),
      supabase.from("faturalar").select("cari_unvan, toplam_tutar, durum, fatura_tarihi"),
    ]);
    if (c) setCariler(c as Cari[]);
    if (f) {
      const map = new Map<string, { buAy: number; toplam: number }>();
      f.forEach(fatura => {
        if (!map.has(fatura.cari_unvan)) map.set(fatura.cari_unvan, { buAy: 0, toplam: 0 });
        const item = map.get(fatura.cari_unvan)!;
        const gercekDurum = faturaDurumHesapla(fatura.fatura_tarihi, fatura.durum);
        if (gercekDurum !== "odendi") {
          item.toplam += fatura.toplam_tutar || 0;
          if (fatura.fatura_tarihi >= donem.donemBas && fatura.fatura_tarihi <= donem.donemBit) {
            item.buAy += fatura.toplam_tutar || 0;
          }
        }
      });
      setCariTutarMap(map);
    }
    setYukleniyor(false);
  }, [donem]);

  useEffect(() => { veriCek(); }, [veriCek]);

  const cariDetayAc = async (cari: Cari) => {
    setSeciliCari(cari);
    setSeciliFaturalar(new Set());
    const [{ data: f }, { data: o }] = await Promise.all([
      supabase.from("faturalar").select("*").eq("cari_unvan", cari.unvan).order("fatura_tarihi", { ascending: false }),
      supabase.from("cari_odemeler").select("*").eq("cari_id", cari.id).order("tarih", { ascending: false }),
    ]);
    setCariFaturalar((f || []) as Fatura[]);
    setCariOdemeler((o || []) as Odeme[]);
  };

  const kaydet = async () => {
    if (!form.unvan) { showToast("hata", "Ünvan zorunlu."); return; }
    setFormSaving(true);
    const { error } = await supabase.from("cariler").insert([form]);
    setFormSaving(false);
    if (error) { showToast("hata", "Kayıt hatası: " + error.message); return; }
    showToast("basari", "Cari kaydedildi.");
    setModalAcik(false);
    setForm({ cari_kodu: "", unvan: "", vergi_no: "", vergi_dairesi: "", telefon: "", adres: "", tip: "tedarikci", kategori: "duzenli" });
    veriCek();
  };

  const odemeAc = () => {
    setSeciliFaturalar(new Set());
    setManuelTutar("");
    setOdemeTarih(new Date().toISOString().split("T")[0]);
    setOdemeYontemi("Nakit");
    setOdemeAciklama("");
    setOdemeModalAcik(true);
  };

  const faturaSec = (id: string) => {
    setSeciliFaturalar(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
    setManuelTutar("");
  };

  const hepsiniSec = () => {
    const hepsi = cariFaturalar.every(f => seciliFaturalar.has(f.id));
    if (hepsi) {
      setSeciliFaturalar(new Set());
    } else {
      setSeciliFaturalar(new Set(cariFaturalar.map(f => f.id)));
    }
  };

  const seciliToplam = useMemo(() =>
    cariFaturalar.filter(f => seciliFaturalar.has(f.id)).reduce((s, f) => s + (f.toplam_tutar || 0), 0),
    [seciliFaturalar, cariFaturalar]
  );

  // Toplu işlemler
  const topluDurumGuncelle = async (durum: string) => {
    if (seciliFaturalar.size === 0) return;
    setTopluIslemYukleniyor(true);
    await supabase.from("faturalar").update({ durum, islendi: durum === "odendi" }).in("id", Array.from(seciliFaturalar));
    showToast("basari", `${seciliFaturalar.size} fatura ${durum === "odendi" ? "ödendi" : durum === "gecikti" ? "gecikti" : "bekliyor"} olarak işaretlendi.`);
    setTopluIslemYukleniyor(false);
    if (seciliCari) cariDetayAc(seciliCari);
    veriCek();
  };

  const topluSil = async () => {
    if (seciliFaturalar.size === 0) return;
    if (!confirm(`${seciliFaturalar.size} fatura silinecek. Onaylıyor musunuz?`)) return;
    setTopluIslemYukleniyor(true);
    await supabase.from("faturalar").delete().in("id", Array.from(seciliFaturalar));
    showToast("basari", `${seciliFaturalar.size} fatura silindi.`);
    setTopluIslemYukleniyor(false);
    if (seciliCari) cariDetayAc(seciliCari);
    veriCek();
  };

  const odemeKaydet = async () => {
    if (!seciliCari) return;
    const tutar = manuelTutar ? parseFloat(manuelTutar) : seciliToplam;
    if (!tutar) { showToast("hata", "Tutar giriniz veya fatura seçiniz."); return; }
    setFormSaving(true);
    const { error } = await supabase.from("cari_odemeler").insert([{
      cari_id: seciliCari.id, cari_unvan: seciliCari.unvan,
      tutar, tarih: odemeTarih, odeme_yontemi: odemeYontemi,
      aciklama: odemeAciklama || `${seciliFaturalar.size > 0 ? seciliFaturalar.size + " fatura için ödeme" : "Manuel ödeme"}`,
    }]);
    if (error) { showToast("hata", "Kayıt hatası: " + error.message); setFormSaving(false); return; }
    if (seciliFaturalar.size > 0) {
      await supabase.from("faturalar").update({ durum: "odendi", islendi: true }).in("id", Array.from(seciliFaturalar));
    }
    setFormSaving(false);
    showToast("basari", "Ödeme kaydedildi.");
    setOdemeModalAcik(false);
    cariDetayAc(seciliCari);
    veriCek();
  };

  const sil = async (id: string) => {
    if (!confirm("Bu cariyi silmek istiyor musunuz?")) return;
    await supabase.from("cariler").delete().eq("id", id);
    if (seciliCari?.id === id) setSeciliCari(null);
    veriCek();
  };

  const filtreliCariler = useMemo(() => cariler.filter(c => {
    const kategoriUygun = c.kategori === aktifTab || (!c.kategori && aktifTab === "diger");
    const aramaUygun = !aramaMetni || c.unvan?.toLowerCase().includes(aramaMetni.toLowerCase()) || c.vergi_no?.includes(aramaMetni);
    return kategoriUygun && aramaUygun;
  }), [cariler, aktifTab, aramaMetni]);

  // Toplam hesaplar
  const toplamFaturaOdenmis = cariFaturalar.filter(f => f.durum === "odendi").reduce((s, f) => s + (f.toplam_tutar || 0), 0);
  const toplamFatura = cariFaturalar.reduce((s, f) => s + (f.toplam_tutar || 0), 0);
  const toplamOdeme = cariOdemeler.reduce((s, o) => s + (o.tutar || 0), 0);
  // Toplam ödeme = yapılan ödemeler + ödendi işaretlenen faturaların tutarı
  const toplamOdemeGercek = toplamOdeme + toplamFaturaOdenmis;
  // Bakiye = ödenmemiş faturaların toplamı
  const toplamBorc = cariFaturalar.filter(f => f.durum !== "odendi").reduce((s, f) => s + (f.toplam_tutar || 0), 0);
  const buAyOdenecek = cariFaturalar.filter(f =>
    f.durum !== "odendi" &&
    f.fatura_tarihi >= donem.donemBas &&
    f.fatura_tarihi <= donem.donemBit
  ).reduce((s, f) => s + (f.toplam_tutar || 0), 0);
  const duzenliSayisi = cariler.filter(c => c.kategori === "duzenli").length;
  const digerSayisi = cariler.filter(c => c.kategori !== "duzenli").length;
  const odenmemisFaturalar = cariFaturalar.filter(f => f.durum !== "odendi");
  const hepsiSecili = cariFaturalar.length > 0 && cariFaturalar.every(f => seciliFaturalar.has(f.id));

  // Birleşik liste — fatura ve ödemeler ayrı sütunda gösterilecek
  const birlesikListe = useMemo(() => [
    ...cariFaturalar.map(f => ({
      tip: "fatura" as const,
      tarih: f.fatura_tarihi,
      veri: { ...f, gercekDurum: faturaDurumHesapla(f.fatura_tarihi, f.durum) },
    })),
    ...cariOdemeler.map(o => ({ tip: "odeme" as const, tarih: o.tarih, veri: o })),
  ].sort((a, b) => b.tarih.localeCompare(a.tarih)), [cariFaturalar, cariOdemeler]);

  return (
    <div className="min-h-screen bg-[#060810] text-white font-sans antialiased pb-24">

      {toast && (
        <div className={`fixed top-5 right-5 z-[80] flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-2xl text-sm font-semibold ${toast.tip === "basari" ? "bg-emerald-950 border-emerald-500/30 text-emerald-400" : "bg-red-950 border-red-500/30 text-red-400"}`}>
          {toast.tip === "basari" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {toast.mesaj}
        </div>
      )}

      {/* HEADER */}
      <div className="sticky top-0 z-40 border-b border-[#0f1624] bg-[#060810]/95 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {seciliCari && (
              <button onClick={() => setSeciliCari(null)} className="p-2 text-gray-600 hover:text-white border border-[#1a2236] rounded-xl transition-colors">
                <ArrowLeft size={14} />
              </button>
            )}
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
              <Building2 className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-black text-white leading-none">{seciliCari ? seciliCari.unvan : "Cariler"}</h1>
              <p className="text-[10px] text-gray-600 mt-0.5">{seciliCari ? `VN: ${seciliCari.vergi_no || "—"}` : `${cariler.length} cari`}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {seciliCari ? (
              <>
                <button onClick={odemeAc} className="flex items-center gap-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-xl transition-colors">
                  <Wallet size={14} /> Ödeme Ekle
                </button>
                <button onClick={() => sil(seciliCari.id)} className="p-2 text-gray-600 hover:text-red-400 border border-[#1a2236] rounded-xl transition-colors">
                  <Trash2 size={14} />
                </button>
              </>
            ) : (
              <button onClick={() => setModalAcik(true)} className="flex items-center gap-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl transition-colors">
                <Plus size={14} /> Cari Ekle
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CARİ LİSTESİ */}
      {!seciliCari && (
        <div className="max-w-6xl mx-auto px-4 py-5 space-y-4">
          <div className="bg-[#0c0f1a] border border-amber-500/20 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <Calendar size={16} className="text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] text-gray-600 uppercase tracking-widest">Bu Ay Ödeme Günü</p>
              <p className="text-sm font-black text-amber-400">
                {donem.vade.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
              </p>
              <p className="text-[10px] text-gray-600 mt-0.5">{fmtTarih(donem.donemBas)} – {fmtTarih(donem.donemBit)} dönem faturaları</p>
            </div>
          </div>

          <div className="flex gap-1 bg-[#0c0f1a] border border-[#1a2236] rounded-xl p-1 w-fit">
            <button onClick={() => setAktifTab("duzenli")} className={`text-xs font-bold px-4 py-2 rounded-lg transition-colors ${aktifTab === "duzenli" ? "bg-blue-600 text-white" : "text-gray-500 hover:text-white"}`}>
              Düzenli Ödemeler ({duzenliSayisi})
            </button>
            <button onClick={() => setAktifTab("diger")} className={`text-xs font-bold px-4 py-2 rounded-lg transition-colors ${aktifTab === "diger" ? "bg-blue-600 text-white" : "text-gray-500 hover:text-white"}`}>
              Diğer ({digerSayisi})
            </button>
          </div>

          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
            <input value={aramaMetni} onChange={e => setAramaMetni(e.target.value)} placeholder="Ünvan veya vergi no ara..."
              className="w-full bg-[#0c0f1a] border border-[#1a2236] text-white text-xs h-9 pl-9 pr-3 rounded-xl outline-none focus:border-blue-500/40 placeholder:text-gray-700" />
          </div>

          {yukleniyor ? (
            <div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" /></div>
          ) : filtreliCariler.length === 0 ? (
            <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl py-16 text-center text-gray-600 text-xs uppercase tracking-widest">Cari bulunamadı</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtreliCariler.map(c => {
                const tutarlar = cariTutarMap.get(c.unvan);
                const buAyTutar = tutarlar?.buAy || 0;
                const toplamBorcCari = tutarlar?.toplam || 0;
                return (
                  <div key={c.id} onClick={() => cariDetayAc(c)}
                    className="bg-[#0c0f1a] border border-[#1a2236] hover:border-blue-500/40 rounded-2xl p-5 cursor-pointer transition-all hover:bg-[#0f1320] group">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                        <span className="text-lg font-black text-blue-400">{c.unvan?.charAt(0)?.toUpperCase()}</span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-lg shrink-0 ${c.tip === "tedarikci" ? "bg-orange-500/10 text-orange-400" : "bg-blue-500/10 text-blue-400"}`}>
                        {c.tip === "tedarikci" ? "Tedarikçi" : "Müşteri"}
                      </span>
                    </div>
                    <p className="text-sm font-black text-white group-hover:text-blue-400 transition-colors leading-tight mb-2">{c.unvan}</p>
                    {c.vergi_no && <p className="text-[11px] text-gray-600 flex items-center gap-1.5 mb-1"><Hash size={9} /> VN: {c.vergi_no}</p>}
                    {c.telefon && <p className="text-[11px] text-gray-600 flex items-center gap-1.5 mb-1"><Phone size={9} /> {c.telefon}</p>}
                    <div className="mt-3 pt-3 border-t border-[#1a2236] space-y-1.5">
                      {buAyTutar > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-amber-400 font-bold">Bu Ay Ödenecek</span>
                          <span className="text-sm font-black text-amber-400">₺{fmt(buAyTutar)}</span>
                        </div>
                      )}
                      {toplamBorcCari > 0 ? (
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-red-400/80">Toplam Borç</span>
                          <span className="text-sm font-bold text-red-400">₺{fmt(toplamBorcCari)}</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-emerald-400 font-bold">Borç Yok</span>
                          <CheckCircle2 size={14} className="text-emerald-400" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CARİ DETAY */}
      {seciliCari && (
        <div className="max-w-6xl mx-auto px-4 py-5 space-y-4">

          {/* 4 kart */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-4">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Toplam Fatura</p>
              <p className="text-2xl font-black text-blue-400">₺{fmt(toplamFatura)}</p>
              <p className="text-[10px] text-gray-600 mt-1">{cariFaturalar.length} fatura</p>
            </div>
            <div className="bg-[#0c0f1a] border border-emerald-500/20 rounded-2xl p-4">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Toplam Ödeme</p>
              <p className="text-2xl font-black text-emerald-400">₺{fmt(toplamOdeme)}</p>
              <p className="text-[10px] text-gray-600 mt-1">{cariOdemeler.length} ödeme</p>
            </div>
            <div className={`bg-[#0c0f1a] border rounded-2xl p-4 ${toplamBorc > 0 ? "border-red-500/20" : "border-emerald-500/20"}`}>
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Toplam Borç</p>
              <p className={`text-2xl font-black ${toplamBorc > 0 ? "text-red-400" : "text-emerald-400"}`}>₺{fmt(toplamBorc)}</p>
              <p className="text-[10px] text-gray-600 mt-1">ödenmemiş faturalar</p>
            </div>
            <div className="bg-[#0c0f1a] border border-amber-500/20 rounded-2xl p-4">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Bu Ay Ödenecek</p>
              <p className="text-2xl font-black text-amber-400">₺{fmt(buAyOdenecek)}</p>
              <p className="text-[10px] text-gray-600 mt-1">{fmtTarih(donem.donemBas)} – {fmtTarih(donem.donemBit)}</p>
            </div>
          </div>

          {/* Birleşik tablo */}
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1a2236]">
                  <th className="px-4 py-4 w-10">
                    <button onClick={hepsiniSec} className="text-gray-500 hover:text-white transition-colors">
                      {hepsiSecili ? <CheckSquare size={15} className="text-blue-400" /> : <Square size={15} />}
                    </button>
                  </th>
                  <th className="text-left px-4 py-4 text-xs text-gray-500 uppercase tracking-widest font-semibold">Tür</th>
                  <th className="text-left px-4 py-4 text-xs text-gray-500 uppercase tracking-widest font-semibold">No / Açıklama</th>
                  <th className="text-left px-4 py-4 text-xs text-gray-500 uppercase tracking-widest font-semibold">Tarih</th>
                  <th className="text-right px-4 py-4 text-xs text-red-400 uppercase tracking-widest font-semibold">Fatura Tutarı</th>
                  <th className="text-right px-4 py-4 text-xs text-emerald-400 uppercase tracking-widest font-semibold">Ödeme Tutarı</th>
                  <th className="text-left px-4 py-4 text-xs text-gray-500 uppercase tracking-widest font-semibold">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0f1624]">
                {birlesikListe.length === 0 ? (
                  <tr><td colSpan={7} className="py-16 text-center text-gray-500 text-sm">Kayıt bulunamadı</td></tr>
                ) : birlesikListe.map((item) => {
                  if (item.tip === "fatura") {
                    const f = item.veri as Fatura & { gercekDurum: string };
                    const secili = seciliFaturalar.has(f.id);
                    return (
                      <tr key={`f-${f.id}`} className={`transition-colors cursor-pointer ${secili ? "bg-blue-600/10" : "hover:bg-white/[0.02]"}`}
                        onClick={() => faturaSec(f.id)}>
                        <td className="px-4 py-4">
                          <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${secili ? "bg-blue-600 border-blue-600" : "border-gray-600"}`}>
                            {secili && <Check size={11} className="text-white" />}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">Fatura</span>
                        </td>
                        <td className="px-4 py-4 text-sm font-bold text-white">{f.fatura_no}</td>
                        <td className="px-4 py-4 text-sm text-gray-300">{fmtTarih(f.fatura_tarihi)}</td>
                        <td className="px-4 py-4 text-right text-base font-black text-red-400">₺{fmt(f.toplam_tutar)}</td>
                        <td className="px-4 py-4 text-right text-gray-700">—</td>
                        <td className="px-4 py-4">
                          <span className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${
                            f.gercekDurum === "odendi" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                            f.gercekDurum === "gecikti" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                            "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                          }`}>
                            {f.gercekDurum === "odendi" ? "Ödendi" : f.gercekDurum === "gecikti" ? "Gecikti" : "Bekliyor"}
                          </span>
                        </td>
                      </tr>
                    );
                  } else {
                    const o = item.veri as Odeme;
                    return (
                      <tr key={`o-${o.id}`} className="bg-emerald-950/10 hover:bg-emerald-950/20 transition-colors">
                        <td className="px-4 py-4 text-gray-700">—</td>
                        <td className="px-4 py-4">
                          <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Ödeme</span>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-300">{o.aciklama || o.odeme_yontemi}</td>
                        <td className="px-4 py-4 text-sm text-gray-300">{fmtTarih(o.tarih)}</td>
                        <td className="px-4 py-4 text-right text-gray-700">—</td>
                        <td className="px-4 py-4 text-right text-base font-black text-emerald-400">₺{fmt(o.tutar)}</td>
                        <td className="px-4 py-4 text-sm text-gray-500">{o.odeme_yontemi}</td>
                      </tr>
                    );
                  }
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#1a2236] bg-[#080b14]">
                  <td colSpan={3} className="px-4 py-4 text-xs text-gray-500 font-bold uppercase tracking-widest">
                    {cariFaturalar.length} Fatura · {cariOdemeler.length} Ödeme
                  </td>
                  <td className="px-4 py-4" />
                  <td className="px-4 py-4 text-right">
                    <p className="text-xs text-gray-500 mb-0.5">Toplam Fatura</p>
                    <p className="text-sm font-black text-red-400">₺{fmt(toplamFatura)}</p>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <p className="text-xs text-gray-500 mb-0.5">Toplam Ödeme</p>
                    <p className="text-sm font-black text-emerald-400">₺{fmt(toplamOdeme)}</p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-xs text-gray-500 mb-0.5">Toplam Borç</p>
                    <p className={`text-sm font-black ${toplamBorc > 0 ? "text-red-400" : "text-emerald-400"}`}>₺{fmt(toplamBorc)}</p>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* TOPLU İŞLEM ÇUBUĞU */}
      {seciliFaturalar.size > 0 && seciliCari && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#0c0f1a]/98 backdrop-blur-xl border-t border-blue-500/30 px-4 py-3">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-sm font-black text-blue-400">{seciliFaturalar.size} fatura seçildi</span>
              <span className="text-sm font-black text-white">· ₺{fmt(seciliToplam)}</span>
              <button onClick={() => setSeciliFaturalar(new Set())} className="text-[11px] text-gray-500 hover:text-white transition-colors">Seçimi Temizle</button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => topluDurumGuncelle("odendi")} disabled={topluIslemYukleniyor}
                className="flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 px-4 py-2 rounded-xl transition-colors">
                {topluIslemYukleniyor ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Ödendi
              </button>
              <button onClick={() => topluDurumGuncelle("gecikti")} disabled={topluIslemYukleniyor}
                className="text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 px-4 py-2 rounded-xl transition-colors">
                Gecikti
              </button>
              <button onClick={() => topluDurumGuncelle("bekliyor")} disabled={topluIslemYukleniyor}
                className="text-xs font-bold text-white bg-yellow-600 hover:bg-yellow-700 disabled:opacity-40 px-4 py-2 rounded-xl transition-colors">
                Ödenmedi
              </button>
              <button onClick={topluSil} disabled={topluIslemYukleniyor}
                className="flex items-center gap-1.5 text-xs font-bold text-white bg-gray-700 hover:bg-gray-600 disabled:opacity-40 px-4 py-2 rounded-xl transition-colors">
                <Trash2 size={12} /> Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* YENİ CARİ MODAL */}
      {modalAcik && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-black text-white">Yeni Cari</h3>
              <button onClick={() => setModalAcik(false)} className="text-gray-600 hover:text-white"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Kategori</p>
                <select value={form.kategori} onChange={e => setForm({ ...form, kategori: e.target.value })} className={inputCls}>
                  <option value="duzenli" className="bg-[#0c0f1a]">Düzenli Ödeme</option>
                  <option value="diger" className="bg-[#0c0f1a]">Diğer</option>
                </select>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Cari Tipi</p>
                <select value={form.tip} onChange={e => setForm({ ...form, tip: e.target.value })} className={inputCls}>
                  <option value="tedarikci" className="bg-[#0c0f1a]">Tedarikçi</option>
                  <option value="musteri" className="bg-[#0c0f1a]">Müşteri</option>
                </select>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Ünvan *</p>
                <input value={form.unvan} onChange={e => setForm({ ...form, unvan: e.target.value })} placeholder="Firma adı..." className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Vergi No</p>
                  <input value={form.vergi_no} onChange={e => setForm({ ...form, vergi_no: e.target.value })} placeholder="1234567890" className={inputCls} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Telefon</p>
                  <input value={form.telefon} onChange={e => setForm({ ...form, telefon: e.target.value })} placeholder="05xx..." className={inputCls} />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setModalAcik(false)} className="flex-1 text-sm font-semibold text-gray-500 hover:text-white border border-[#1a2236] py-3 rounded-xl transition-colors">İptal</button>
                <button onClick={kaydet} disabled={formSaving} className="flex-1 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                  {formSaving ? <Loader2 size={14} className="animate-spin" /> : null} Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ÖDEME MODAL */}
      {odemeModalAcik && seciliCari && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#1a2236] shrink-0">
              <h3 className="text-base font-black text-white">Ödeme Ekle</h3>
              <button onClick={() => setOdemeModalAcik(false)} className="text-gray-600 hover:text-white"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {odenmemisFaturalar.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-widest mb-3 font-bold">Ödenmemiş Faturalar</p>
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {odenmemisFaturalar.map(f => (
                      <div key={f.id} onClick={() => faturaSec(f.id)}
                        className={`flex items-center justify-between px-4 py-3 rounded-xl border cursor-pointer transition-all ${seciliFaturalar.has(f.id) ? "bg-blue-600/20 border-blue-500/40" : "bg-[#080b14] border-[#1a2236] hover:border-[#2a3550]"}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${seciliFaturalar.has(f.id) ? "bg-blue-600 border-blue-600" : "border-gray-600"}`}>
                            {seciliFaturalar.has(f.id) && <CheckCircle2 size={12} className="text-white" />}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white">{f.fatura_no}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{fmtTarih(f.fatura_tarihi)}</p>
                          </div>
                        </div>
                        <span className="text-sm font-black text-emerald-400">₺{fmt(f.toplam_tutar)}</span>
                      </div>
                    ))}
                  </div>
                  {seciliFaturalar.size > 0 && (
                    <div className="mt-3 flex items-center justify-between bg-blue-600/10 border border-blue-500/20 rounded-xl px-4 py-3">
                      <span className="text-sm text-blue-400">{seciliFaturalar.size} fatura seçildi</span>
                      <span className="text-base font-black text-blue-400">₺{fmt(seciliToplam)}</span>
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-[#1a2236]" />
                <span className="text-xs text-gray-600 uppercase tracking-widest">veya manuel tutar</span>
                <div className="flex-1 h-px bg-[#1a2236]" />
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Manuel Tutar (₺)</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-sm">₺</span>
                  <input type="number" value={manuelTutar}
                    onChange={e => { setManuelTutar(e.target.value); if (e.target.value) setSeciliFaturalar(new Set()); }}
                    placeholder={seciliFaturalar.size > 0 ? fmt(seciliToplam) : "0"}
                    className={`${inputCls} pl-8`} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Tarih</p>
                  <input type="date" value={odemeTarih} onChange={e => setOdemeTarih(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Yöntem</p>
                  <select value={odemeYontemi} onChange={e => setOdemeYontemi(e.target.value)} className={inputCls}>
                    {["Nakit", "Banka Havalesi", "EFT", "Çek", "Kredi Kartı"].map(y => (
                      <option key={y} value={y} className="bg-[#0c0f1a]">{y}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Açıklama</p>
                <input value={odemeAciklama} onChange={e => setOdemeAciklama(e.target.value)} placeholder="Opsiyonel..." className={inputCls} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#1a2236] shrink-0">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-gray-500">Ödenecek Tutar</span>
                <span className="text-2xl font-black text-emerald-400">
                  ₺{fmt(manuelTutar ? parseFloat(manuelTutar) || 0 : seciliToplam)}
                </span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setOdemeModalAcik(false)} className="flex-1 text-sm font-semibold text-gray-500 hover:text-white border border-[#1a2236] py-3 rounded-xl transition-colors">İptal</button>
                <button onClick={odemeKaydet} disabled={formSaving || (!manuelTutar && seciliFaturalar.size === 0)}
                  className="flex-1 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                  {formSaving ? <Loader2 size={14} className="animate-spin" /> : null} Ödemeyi Onayla
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
