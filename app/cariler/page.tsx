"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Plus, Search, Building2, Trash2, X, Loader2, CheckCircle2,
  AlertTriangle, FileText, Wallet, ArrowLeft, Phone, Hash,
  TrendingDown, Calendar
} from "lucide-react";

// ─── ÖDEME TAKVİMİ ────────────────────────────────────────────────────────────

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

// Bu ayın 25'inde ödenecek fatura dönemini hesapla
// Dönem: geçen ayın 16 - bu ayın 15
function buAyinOdemeDonemi() {
  const bugun = new Date();
  const ay = bugun.getMonth();
  const yil = bugun.getFullYear();
  const pad = (n: number) => String(n + 1).padStart(2, "0");
  // Bu ayın 16 - sonraki ayın 15 arası = sonraki ayın 25'inde ödenecek
  // Geçen ayın 16 - bu ayın 15 arası = bu ayın 25'inde ödenecek
  const donemBas = `${ay === 0 ? yil - 1 : yil}-${pad(ay === 0 ? 11 : ay - 1)}-16`;
  const donemBit = `${yil}-${pad(ay)}-15`;
  const vade = ilkIsGunu(new Date(yil, ay, 25));
  return { donemBas, donemBit, vade };
}

// ─── TYPES ────────────────────────────────────────────────────────────────────

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

const inputCls = "w-full bg-[#080b14] border border-[#1a2236] hover:border-[#243050] focus:border-blue-500/50 text-white text-sm h-10 px-3 rounded-xl outline-none transition-all placeholder:text-gray-700";
const fmt = (v: number) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(v);
const fmtTarih = (t: string) => { if (!t) return "—"; try { const p = t.split("-"); return `${p[2]}.${p[1]}.${p[0]}`; } catch { return t; } };

// ─── ANA SAYFA ────────────────────────────────────────────────────────────────

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
  const [detayTab, setDetayTab] = useState<"faturalar" | "odemeler">("faturalar");
  const [modalAcik, setModalAcik] = useState(false);
  const [odemeModalAcik, setOdemeModalAcik] = useState(false);
  const [seciliFaturalar, setSeciliFaturalar] = useState<Set<string>>(new Set());
  const [manuelTutar, setManuelTutar] = useState("");
  const [odemeTarih, setOdemeTarih] = useState(new Date().toISOString().split("T")[0]);
  const [odemeYontemi, setOdemeYontemi] = useState("Nakit");
  const [odemeAciklama, setOdemeAciklama] = useState("");
  const [formSaving, setFormSaving] = useState(false);
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
        if (fatura.durum !== "odendi") {
          item.toplam += fatura.toplam_tutar || 0;
          // Bu ayın 25'inde ödenecek dönem mi?
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
    setDetayTab("faturalar");
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
    setManuelTutar(""); // seçim değişince manuel tutarı temizle
  };

  const seciliToplam = useMemo(() => {
    return cariFaturalar
      .filter(f => seciliFaturalar.has(f.id) && f.durum !== "odendi")
      .reduce((s, f) => s + (f.toplam_tutar || 0), 0);
  }, [seciliFaturalar, cariFaturalar]);

  const odemeKaydet = async () => {
    if (!seciliCari) return;
    const tutar = manuelTutar ? parseFloat(manuelTutar) : seciliToplam;
    if (!tutar) { showToast("hata", "Tutar giriniz veya fatura seçiniz."); return; }
    setFormSaving(true);

    // Ödemeyi kaydet
    const { error } = await supabase.from("cari_odemeler").insert([{
      cari_id: seciliCari.id, cari_unvan: seciliCari.unvan,
      tutar, tarih: odemeTarih,
      odeme_yontemi: odemeYontemi,
      aciklama: odemeAciklama || `${seciliFaturalar.size} fatura için ödeme`,
    }]);

    if (error) { showToast("hata", "Kayıt hatası: " + error.message); setFormSaving(false); return; }

    // Seçili faturaları ödendi işaretle
    if (seciliFaturalar.size > 0) {
      await supabase.from("faturalar").update({ durum: "odendi", islendi: true })
        .in("id", Array.from(seciliFaturalar));
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

  const toplamFatura = cariFaturalar.reduce((s, f) => s + (f.toplam_tutar || 0), 0);
  const toplamOdeme = cariOdemeler.reduce((s, o) => s + (o.tutar || 0), 0);
  const bekleyenBakiye = cariFaturalar.filter(f => f.durum !== "odendi").reduce((s, f) => s + (f.toplam_tutar || 0), 0) - toplamOdeme;
  const duzenliSayisi = cariler.filter(c => c.kategori === "duzenli").length;
  const digerSayisi = cariler.filter(c => c.kategori !== "duzenli").length;
  const odenmemisFaturalar = cariFaturalar.filter(f => f.durum !== "odendi");

  const durumRenk = (durum: string) => {
    if (durum === "odendi") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (durum === "gecikti") return "bg-red-500/10 text-red-400 border-red-500/20";
    return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
  };

  return (
    <div className="min-h-screen bg-[#060810] text-white font-sans antialiased pb-10">

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
              <p className="text-[10px] text-gray-600 mt-0.5">
                {seciliCari ? `VN: ${seciliCari.vergi_no || "—"}` : `${cariler.length} cari`}
              </p>
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

          {/* Bu ayın ödeme tarihi */}
          <div className="bg-[#0c0f1a] border border-amber-500/20 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <Calendar size={16} className="text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] text-gray-600 uppercase tracking-widest">Bu Ay Ödeme Günü</p>
              <p className="text-sm font-black text-amber-400">
                {donem.vade.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
              </p>
              <p className="text-[10px] text-gray-600 mt-0.5">
                {fmtTarih(donem.donemBas)} – {fmtTarih(donem.donemBit)} dönem faturaları
              </p>
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
                const toplamBorc = tutarlar?.toplam || 0;
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
                      {buAyTutar > 0 ? (
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">Bu Ay Ödenecek</span>
                          <span className="text-sm font-black text-amber-400">₺{fmt(buAyTutar)}</span>
                        </div>
                      ) : null}
                      {toplamBorc > 0 ? (
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-red-400/70 uppercase tracking-wider">Toplam Borç</span>
                          <span className="text-xs font-bold text-red-400">₺{fmt(toplamBorc)}</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Borç Yok</span>
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
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-4">
              <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">Toplam Fatura</p>
              <p className="text-xl font-black text-blue-400">₺{fmt(toplamFatura)}</p>
            </div>
            <div className="bg-[#0c0f1a] border border-emerald-500/20 rounded-2xl p-4">
              <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">Toplam Ödeme</p>
              <p className="text-xl font-black text-emerald-400">₺{fmt(toplamOdeme)}</p>
            </div>
            <div className={`bg-[#0c0f1a] border rounded-2xl p-4 ${bekleyenBakiye > 0 ? "border-red-500/20" : "border-emerald-500/20"}`}>
              <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">Bakiye</p>
              <p className={`text-xl font-black ${bekleyenBakiye > 0 ? "text-red-400" : "text-emerald-400"}`}>₺{fmt(bekleyenBakiye)}</p>
            </div>
          </div>

          <div className="flex gap-1 bg-[#0c0f1a] border border-[#1a2236] rounded-xl p-1 w-fit">
            <button onClick={() => setDetayTab("faturalar")} className={`text-xs font-bold px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${detayTab === "faturalar" ? "bg-blue-600 text-white" : "text-gray-500 hover:text-white"}`}>
              <FileText size={12} /> Faturalar ({cariFaturalar.length})
            </button>
            <button onClick={() => setDetayTab("odemeler")} className={`text-xs font-bold px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${detayTab === "odemeler" ? "bg-emerald-600 text-white" : "text-gray-500 hover:text-white"}`}>
              <Wallet size={12} /> Ödemeler ({cariOdemeler.length})
            </button>
          </div>

          {detayTab === "faturalar" && (
            <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl overflow-hidden">
              {cariFaturalar.length === 0 ? (
                <div className="py-16 text-center text-gray-600 text-xs uppercase tracking-widest">Fatura bulunamadı</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#1a2236]">
                      {["Fatura No", "Tarih", "Tutar", "Durum"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#0f1624]">
                    {cariFaturalar.map(f => (
                      <tr key={f.id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3 text-blue-400 font-bold">{f.fatura_no}</td>
                        <td className="px-4 py-3 text-gray-400">{fmtTarih(f.fatura_tarihi)}</td>
                        <td className="px-4 py-3 text-emerald-400 font-black">₺{fmt(f.toplam_tutar)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${durumRenk(f.durum)}`}>
                            {f.durum === "odendi" ? "Ödendi" : f.durum === "gecikti" ? "Gecikti" : "Bekliyor"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-[#1a2236] bg-[#080b14]">
                      <td colSpan={2} className="px-4 py-3 text-[10px] text-gray-600 font-bold uppercase">{cariFaturalar.length} fatura</td>
                      <td className="px-4 py-3 text-emerald-400 font-black">₺{fmt(toplamFatura)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          )}

          {detayTab === "odemeler" && (
            <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl overflow-hidden">
              {cariOdemeler.length === 0 ? (
                <div className="py-16 text-center text-gray-600 text-xs uppercase tracking-widest">Ödeme kaydı yok</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#1a2236]">
                      {["Tarih", "Tutar", "Yöntem", "Açıklama"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#0f1624]">
                    {cariOdemeler.map(o => (
                      <tr key={o.id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3 text-gray-400">{fmtTarih(o.tarih)}</td>
                        <td className="px-4 py-3 text-emerald-400 font-black">₺{fmt(o.tutar)}</td>
                        <td className="px-4 py-3 text-gray-400">{o.odeme_yontemi}</td>
                        <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{o.aciklama || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-[#1a2236] bg-[#080b14]">
                      <td className="px-4 py-3 text-[10px] text-gray-600 font-bold uppercase">{cariOdemeler.length} ödeme</td>
                      <td className="px-4 py-3 text-emerald-400 font-black">₺{fmt(toplamOdeme)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* YENİ CARİ MODAL */}
      {modalAcik && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-black text-white">Yeni Cari</h3>
              <button onClick={() => setModalAcik(false)} className="text-gray-600 hover:text-white"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Kategori</p>
                <select value={form.kategori} onChange={e => setForm({ ...form, kategori: e.target.value })} className={inputCls}>
                  <option value="duzenli" className="bg-[#0c0f1a]">Düzenli Ödeme</option>
                  <option value="diger" className="bg-[#0c0f1a]">Diğer</option>
                </select>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Cari Tipi</p>
                <select value={form.tip} onChange={e => setForm({ ...form, tip: e.target.value })} className={inputCls}>
                  <option value="tedarikci" className="bg-[#0c0f1a]">Tedarikçi</option>
                  <option value="musteri" className="bg-[#0c0f1a]">Müşteri</option>
                </select>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Ünvan *</p>
                <input value={form.unvan} onChange={e => setForm({ ...form, unvan: e.target.value })} placeholder="Firma adı..." className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Vergi No</p>
                  <input value={form.vergi_no} onChange={e => setForm({ ...form, vergi_no: e.target.value })} placeholder="1234567890" className={inputCls} />
                </div>
                <div>
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Telefon</p>
                  <input value={form.telefon} onChange={e => setForm({ ...form, telefon: e.target.value })} placeholder="05xx..." className={inputCls} />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setModalAcik(false)} className="flex-1 text-xs font-semibold text-gray-500 hover:text-white border border-[#1a2236] py-2.5 rounded-xl transition-colors">İptal</button>
                <button onClick={kaydet} disabled={formSaving} className="flex-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                  {formSaving ? <Loader2 size={12} className="animate-spin" /> : null} Kaydet
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
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a2236] shrink-0">
              <h3 className="text-sm font-black text-white">Ödeme Ekle — {seciliCari.unvan}</h3>
              <button onClick={() => setOdemeModalAcik(false)} className="text-gray-600 hover:text-white"><X size={16} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

              {/* Ödenmemiş faturalar */}
              {odenmemisFaturalar.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2 font-bold">Ödenmemiş Faturalar — Seçerek Ekle</p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {odenmemisFaturalar.map(f => (
                      <div key={f.id} onClick={() => faturaSec(f.id)}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${seciliFaturalar.has(f.id) ? "bg-blue-600/20 border-blue-500/40" : "bg-[#080b14] border-[#1a2236] hover:border-[#2a3550]"}`}>
                        <div className="flex items-center gap-2.5">
                          <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${seciliFaturalar.has(f.id) ? "bg-blue-600 border-blue-600" : "border-gray-600"}`}>
                            {seciliFaturalar.has(f.id) && <CheckCircle2 size={10} className="text-white" />}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white">{f.fatura_no}</p>
                            <p className="text-[10px] text-gray-600">{fmtTarih(f.fatura_tarihi)}</p>
                          </div>
                        </div>
                        <span className="text-xs font-black text-emerald-400">₺{fmt(f.toplam_tutar)}</span>
                      </div>
                    ))}
                  </div>
                  {seciliFaturalar.size > 0 && (
                    <div className="mt-2 flex items-center justify-between bg-blue-600/10 border border-blue-500/20 rounded-xl px-3 py-2">
                      <span className="text-[11px] text-blue-400">{seciliFaturalar.size} fatura seçildi</span>
                      <span className="text-sm font-black text-blue-400">₺{fmt(seciliToplam)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Ayraç */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-[#1a2236]" />
                <span className="text-[10px] text-gray-600 uppercase tracking-widest">veya manuel tutar gir</span>
                <div className="flex-1 h-px bg-[#1a2236]" />
              </div>

              {/* Manuel tutar */}
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Manuel Tutar (₺)</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-xs">₺</span>
                  <input type="number" value={manuelTutar}
                    onChange={e => { setManuelTutar(e.target.value); if (e.target.value) setSeciliFaturalar(new Set()); }}
                    placeholder={seciliFaturalar.size > 0 ? fmt(seciliToplam) : "0"}
                    className={`${inputCls} pl-7`} />
                </div>
                {manuelTutar && <p className="text-[10px] text-gray-600 mt-1">Manuel tutar girilince fatura seçimi temizlenir</p>}
              </div>

              {/* Ödeme detayları */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Tarih</p>
                  <input type="date" value={odemeTarih} onChange={e => setOdemeTarih(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Yöntem</p>
                  <select value={odemeYontemi} onChange={e => setOdemeYontemi(e.target.value)} className={inputCls}>
                    {["Nakit", "Banka Havalesi", "EFT", "Çek", "Kredi Kartı"].map(y => (
                      <option key={y} value={y} className="bg-[#0c0f1a]">{y}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Açıklama</p>
                <input value={odemeAciklama} onChange={e => setOdemeAciklama(e.target.value)} placeholder="Opsiyonel..." className={inputCls} />
              </div>
            </div>

            {/* Toplam + Onayla */}
            <div className="px-6 py-4 border-t border-[#1a2236] shrink-0">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-500">Ödenecek Tutar</span>
                <span className="text-xl font-black text-emerald-400">
                  ₺{fmt(manuelTutar ? parseFloat(manuelTutar) || 0 : seciliToplam)}
                </span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setOdemeModalAcik(false)} className="flex-1 text-xs font-semibold text-gray-500 hover:text-white border border-[#1a2236] py-2.5 rounded-xl transition-colors">İptal</button>
                <button onClick={odemeKaydet} disabled={formSaving || (!manuelTutar && seciliFaturalar.size === 0)}
                  className="flex-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                  {formSaving ? <Loader2 size={12} className="animate-spin" /> : null} Ödemeyi Onayla
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}