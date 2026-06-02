"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Plus, Search, Building2, Trash2, X, Loader2, CheckCircle2,
  AlertTriangle, FileText, Wallet, ArrowLeft, Phone, Hash, TrendingDown, Clock
} from "lucide-react";

const SABIT_TATILLER = (yil: number): string[] => [
  `${yil}-01-01`, `${yil}-04-23`, `${yil}-05-01`, `${yil}-05-19`,
  `${yil}-07-15`, `${yil}-08-30`, `${yil}-10-29`,
];

const DINI_TATILLER: string[] = [
  "2024-04-10","2024-04-11","2024-04-12",
  "2024-06-16","2024-06-17","2024-06-18","2024-06-19",
  "2025-03-30","2025-03-31","2025-04-01",
  "2025-06-06","2025-06-07","2025-06-08","2025-06-09",
  "2026-03-19","2026-03-20","2026-03-21",
  "2026-05-26","2026-05-27","2026-05-28","2026-05-29",
  "2027-03-08","2027-03-09","2027-03-10",
  "2027-05-15","2027-05-16","2027-05-17","2027-05-18",
];

function isTatilGunu(tarih: Date): boolean {
  const yil = tarih.getFullYear();
  const gun = tarih.getDay();
  if (gun === 0 || gun === 6) return true;
  const str = tarih.toISOString().split("T")[0];
  return SABIT_TATILLER(yil).includes(str) || DINI_TATILLER.includes(str);
}

function ilkIsGunu(tarih: Date): Date {
  const d = new Date(tarih);
  while (isTatilGunu(d)) d.setDate(d.getDate() + 1);
  return d;
}

function odemeDonemi(faturaTarihi: string) {
  const tarih = new Date(faturaTarihi + "T00:00:00");
  const gun = tarih.getDate();
  const ay = tarih.getMonth();
  const yil = tarih.getFullYear();
  let donemBasAy: number, donemBasYil: number, donemBitAy: number, donemBitYil: number;
  if (gun >= 16) {
    donemBasAy = ay; donemBasYil = yil;
    donemBitAy = ay + 1 > 11 ? 0 : ay + 1;
    donemBitYil = ay + 1 > 11 ? yil + 1 : yil;
  } else {
    donemBasAy = ay - 1 < 0 ? 11 : ay - 1;
    donemBasYil = ay - 1 < 0 ? yil - 1 : yil;
    donemBitAy = ay; donemBitYil = yil;
  }
  const odemeAy = donemBitAy + 1 > 11 ? 0 : donemBitAy + 1;
  const odemeYil = donemBitAy + 1 > 11 ? donemBitYil + 1 : donemBitYil;
  const pad = (n: number) => String(n + 1).padStart(2, "0");
  const donemBaslangic = `${donemBasYil}-${pad(donemBasAy)}-16`;
  const donemBitis = `${donemBitYil}-${pad(donemBitAy)}-15`;
  const odemeVadesi = ilkIsGunu(new Date(odemeYil, odemeAy, 25));
  const odemeVadesiStr = odemeVadesi.toISOString().split("T")[0];
  return { donemBaslangic, donemBitis, odemeVadesi, odemeVadesiStr };
}

interface FaturaItem {
  id: string; fatura_no: string; fatura_tarihi: string;
  toplam_tutar: number; durum: string; aciklama?: string;
}

interface OdemeDonemiItem {
  odemeVadesiStr: string; odemeVadesi: Date;
  donemBaslangic: string; donemBitis: string;
  faturalar: FaturaItem[]; toplamTutar: number;
}

function faturalariDonemlereGrupla(faturalar: FaturaItem[]): OdemeDonemiItem[] {
  const map = new Map<string, OdemeDonemiItem>();
  faturalar.filter(f => f.durum !== "odendi").forEach(f => {
    if (!f.fatura_tarihi) return;
    const d = odemeDonemi(f.fatura_tarihi);
    if (!map.has(d.odemeVadesiStr)) {
      map.set(d.odemeVadesiStr, { ...d, faturalar: [], toplamTutar: 0 });
    }
    const item = map.get(d.odemeVadesiStr)!;
    item.faturalar.push(f);
    item.toplamTutar += f.toplam_tutar || 0;
  });
  return Array.from(map.values()).sort((a, b) => a.odemeVadesiStr.localeCompare(b.odemeVadesiStr));
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
  id: string; cari_id: string; tutar: number; tarih: string;
  aciklama: string; odeme_yontemi: string; donem_bas?: string; donem_bit?: string;
}

const inputCls = "w-full bg-[#080b14] border border-[#1a2236] hover:border-[#243050] focus:border-blue-500/50 text-white text-sm h-10 px-3 rounded-xl outline-none transition-all placeholder:text-gray-700";
const fmt = (v: number) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(v);
const fmtTarih = (t: string) => { if (!t) return "—"; try { const p = t.split("-"); return `${p[2]}.${p[1]}.${p[0]}`; } catch { return t; } };

export default function CarilerPage() {
  const supabase = createClient();
  const [cariler, setCariler] = useState<Cari[]>([]);
  const [faturaBorclari, setFaturaBorclari] = useState<Map<string, number>>(new Map());
  const [yukleniyor, setYukleniyor] = useState(true);
  const [aramaMetni, setAramaMetni] = useState("");
  const [aktifTab, setAktifTab] = useState<"duzenli" | "diger">("duzenli");
  const [seciliCari, setSeciliCari] = useState<Cari | null>(null);
  const [cariFaturalar, setCariFaturalar] = useState<Fatura[]>([]);
  const [cariOdemeler, setCariOdemeler] = useState<Odeme[]>([]);
  const [yaklasanOdemeler, setYaklasanOdemeler] = useState<OdemeDonemiItem[]>([]);
  const [detayTab, setDetayTab] = useState<"yaklasan" | "faturalar" | "odemeler">("yaklasan");
  const [modalAcik, setModalAcik] = useState(false);
  const [odemeModalAcik, setOdemeModalAcik] = useState(false);
  const [araOdemeModal, setAraOdemeModal] = useState(false);
  const [araOdemeTip, setAraOdemeTip] = useState<"yaklasan" | "toplam" | null>(null);
  const [secilenDonem, setSecilenDonem] = useState<OdemeDonemiItem | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [toast, setToast] = useState<{ tip: "basari" | "hata"; mesaj: string } | null>(null);
  const [form, setForm] = useState({ cari_kodu: "", unvan: "", vergi_no: "", vergi_dairesi: "", telefon: "", adres: "", tip: "tedarikci", kategori: "duzenli" });
  const [odemeForm, setOdemeForm] = useState({ tutar: "", tarih: new Date().toISOString().split("T")[0], aciklama: "", odeme_yontemi: "Nakit" });
  const [araOdemeForm, setAraOdemeForm] = useState({ tutar: "", tarih: new Date().toISOString().split("T")[0], aciklama: "" });

  const showToast = (tip: "basari" | "hata", mesaj: string) => {
    setToast({ tip, mesaj });
    setTimeout(() => setToast(null), 3000);
  };

  const veriCek = useCallback(async () => {
    setYukleniyor(true);
    const [{ data: c }, { data: f }] = await Promise.all([
      supabase.from("cariler").select("*").order("unvan"),
      supabase.from("faturalar").select("cari_unvan, toplam_tutar, durum"),
    ]);
    if (c) setCariler(c as Cari[]);
    if (f) {
      const borcMap = new Map<string, number>();
      f.filter(fatura => fatura.durum !== "odendi").forEach(fatura => {
        borcMap.set(fatura.cari_unvan, (borcMap.get(fatura.cari_unvan) || 0) + (fatura.toplam_tutar || 0));
      });
      setFaturaBorclari(borcMap);
    }
    setYukleniyor(false);
  }, []);

  useEffect(() => { veriCek(); }, [veriCek]);

  const cariDetayAc = async (cari: Cari) => {
    setSeciliCari(cari);
    setDetayTab("yaklasan");
    const [{ data: f }, { data: o }] = await Promise.all([
      supabase.from("faturalar").select("id,fatura_no,fatura_tarihi,toplam_tutar,durum,aciklama").eq("cari_unvan", cari.unvan).order("fatura_tarihi", { ascending: false }),
      supabase.from("cari_odemeler").select("*").eq("cari_id", cari.id).order("tarih", { ascending: false }),
    ]);
    const fList = (f || []) as Fatura[];
    setCariFaturalar(fList);
    setCariOdemeler((o || []) as Odeme[]);
    setYaklasanOdemeler(faturalariDonemlereGrupla(fList));
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

  const odemeKaydet = async () => {
    if (!seciliCari || !odemeForm.tutar) return;
    setFormSaving(true);
    const { error } = await supabase.from("cari_odemeler").insert([{
      cari_id: seciliCari.id, cari_unvan: seciliCari.unvan,
      tutar: parseFloat(odemeForm.tutar), tarih: odemeForm.tarih,
      aciklama: odemeForm.aciklama, odeme_yontemi: odemeForm.odeme_yontemi,
    }]);
    setFormSaving(false);
    if (error) { showToast("hata", "Kayıt hatası: " + error.message); return; }
    showToast("basari", "Ödeme kaydedildi.");
    setOdemeModalAcik(false);
    setOdemeForm({ tutar: "", tarih: new Date().toISOString().split("T")[0], aciklama: "", odeme_yontemi: "Nakit" });
    cariDetayAc(seciliCari);
    veriCek();
  };

  const araOdemeKaydet = async () => {
    if (!seciliCari || !araOdemeForm.tutar || !secilenDonem) return;
    setFormSaving(true);
    const { error } = await supabase.from("cari_odemeler").insert([{
      cari_id: seciliCari.id, cari_unvan: seciliCari.unvan,
      tutar: parseFloat(araOdemeForm.tutar), tarih: araOdemeForm.tarih,
      aciklama: `Ara Ödeme${araOdemeTip === "yaklasan" ? ` (${fmtTarih(secilenDonem.donemBaslangic)}-${fmtTarih(secilenDonem.donemBitis)})` : ""}: ${araOdemeForm.aciklama}`,
      odeme_yontemi: "Nakit",
      donem_bas: araOdemeTip === "yaklasan" ? secilenDonem.donemBaslangic : null,
      donem_bit: araOdemeTip === "yaklasan" ? secilenDonem.donemBitis : null,
    }]);
    setFormSaving(false);
    if (error) { showToast("hata", "Kayıt hatası: " + error.message); return; }
    showToast("basari", "Ara ödeme kaydedildi.");
    setAraOdemeModal(false);
    setAraOdemeTip(null);
    setAraOdemeForm({ tutar: "", tarih: new Date().toISOString().split("T")[0], aciklama: "" });
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
  const bekleyenBakiye = toplamFatura - toplamOdeme;
  const duzenliSayisi = cariler.filter(c => c.kategori === "duzenli").length;
  const digerSayisi = cariler.filter(c => c.kategori !== "duzenli").length;
  const toplamBorc = Array.from(faturaBorclari.values()).reduce((s, v) => s + v, 0);

  const durumRenk = (durum: string) => {
    if (durum === "odendi") return "bg-emerald-500/10 text-emerald-400";
    if (durum === "gecikti") return "bg-red-500/10 text-red-400";
    return "bg-yellow-500/10 text-yellow-400";
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
                {seciliCari ? `VN: ${seciliCari.vergi_no || "—"}` : `${cariler.length} cari · Toplam borç: ₺${fmt(toplamBorc)}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {seciliCari ? (
              <>
                <button onClick={() => setOdemeModalAcik(true)} className="flex items-center gap-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-xl transition-colors">
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
          <div className="bg-[#0c0f1a] border border-red-500/20 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <TrendingDown size={16} className="text-red-400" />
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest">Toplam Bekleyen Borç</p>
                <p className="text-xl font-black text-red-400">₺{fmt(toplamBorc)}</p>
              </div>
            </div>
            <p className="text-[11px] text-gray-600">{cariler.length} cari</p>
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
                const borc = faturaBorclari.get(c.unvan) || 0;
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
                    <div className={`mt-3 pt-3 border-t ${borc > 0 ? "border-red-500/20" : "border-[#1a2236]"}`}>
                      {borc > 0 ? (
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider">Bekleyen Borç</span>
                          <span className="text-sm font-black text-red-400">₺{fmt(borc)}</span>
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

          <div className="flex gap-1 bg-[#0c0f1a] border border-[#1a2236] rounded-xl p-1 w-fit flex-wrap">
            <button onClick={() => setDetayTab("yaklasan")} className={`text-xs font-bold px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${detayTab === "yaklasan" ? "bg-amber-600 text-white" : "text-gray-500 hover:text-white"}`}>
              <Clock size={12} /> Yaklaşan Ödemeler ({yaklasanOdemeler.length})
            </button>
            <button onClick={() => setDetayTab("faturalar")} className={`text-xs font-bold px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${detayTab === "faturalar" ? "bg-blue-600 text-white" : "text-gray-500 hover:text-white"}`}>
              <FileText size={12} /> Faturalar ({cariFaturalar.length})
            </button>
            <button onClick={() => setDetayTab("odemeler")} className={`text-xs font-bold px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${detayTab === "odemeler" ? "bg-emerald-600 text-white" : "text-gray-500 hover:text-white"}`}>
              <Wallet size={12} /> Ödemeler ({cariOdemeler.length})
            </button>
          </div>

          {/* YAKLAŞAN ÖDEMELER */}
          {detayTab === "yaklasan" && (
            <div className="space-y-3">
              {yaklasanOdemeler.length === 0 ? (
                <div className="bg-[#0c0f1a] border border-emerald-500/20 rounded-2xl py-16 text-center">
                  <CheckCircle2 size={32} className="text-emerald-400 mx-auto mb-3" />
                  <p className="text-emerald-400 font-bold text-sm">Bekleyen ödeme yok</p>
                </div>
              ) : yaklasanOdemeler.map((donem, i) => {
                const bugun = new Date();
                const vade = new Date(donem.odemeVadesiStr + "T00:00:00");
                const kalan = Math.ceil((vade.getTime() - bugun.getTime()) / (1000 * 60 * 60 * 24));
                const gecmis = kalan < 0;
                const yakin = kalan >= 0 && kalan <= 7;
                const donemAraOdemeleri = cariOdemeler.filter(o => o.donem_bas === donem.donemBaslangic && o.donem_bit === donem.donemBitis);
                const donemAraOdemeToplam = donemAraOdemeleri.reduce((s, o) => s + o.tutar, 0);
                const kalanBorc = donem.toplamTutar - donemAraOdemeToplam;
                return (
                  <div key={i} className={`bg-[#0c0f1a] border rounded-2xl overflow-hidden ${gecmis ? "border-red-500/30" : yakin ? "border-amber-500/30" : "border-[#1a2236]"}`}>
                    <div className="px-5 py-4 flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${gecmis ? "bg-red-500/10 text-red-400" : yakin ? "bg-amber-500/10 text-amber-400" : "bg-blue-500/10 text-blue-400"}`}>
                            {gecmis ? `${Math.abs(kalan)} gün gecikti` : kalan === 0 ? "Bugün!" : `${kalan} gün kaldı`}
                          </span>
                          {donemAraOdemeToplam > 0 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                              ₺{fmt(donemAraOdemeToplam)} ara ödeme yapıldı
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-black text-white">
                          {new Date(donem.odemeVadesiStr + "T00:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })} — ödeme günü
                        </p>
                        <p className="text-[11px] text-gray-600 mt-0.5">
                          {fmtTarih(donem.donemBaslangic)} – {fmtTarih(donem.donemBitis)} dönem · {donem.faturalar.length} fatura
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-gray-600 mb-0.5">Dönem Toplam</p>
                        <p className="text-lg font-black text-white">₺{fmt(donem.toplamTutar)}</p>
                        {donemAraOdemeToplam > 0 && (
                          <>
                            <p className="text-[10px] text-gray-600 mt-1">Kalan</p>
                            <p className={`text-sm font-black ${kalanBorc > 0 ? "text-red-400" : "text-emerald-400"}`}>₺{fmt(kalanBorc)}</p>
                          </>
                        )}
                        <button onClick={() => { setSecilenDonem(donem); setAraOdemeModal(true); setAraOdemeTip(null); }}
                          className="mt-2 text-[11px] font-bold text-blue-400 hover:text-blue-300 transition-colors whitespace-nowrap">
                          + Ara Ödeme
                        </button>
                      </div>
                    </div>
                    <div className="border-t border-[#1a2236] overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-[#0f1624]">
                            {["Fatura No", "Tarih", "Tutar", "Durum"].map(h => (
                              <th key={h} className="text-left px-4 py-2 text-[10px] text-gray-600 uppercase tracking-widest">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#0f1624]">
                          {donem.faturalar.map((f: FaturaItem) => (
                            <tr key={f.id} className="hover:bg-white/[0.02]">
                              <td className="px-4 py-2 text-blue-400 font-bold">{f.fatura_no}</td>
                              <td className="px-4 py-2 text-gray-400">{fmtTarih(f.fatura_tarihi)}</td>
                              <td className="px-4 py-2 text-emerald-400 font-bold">₺{fmt(f.toplam_tutar)}</td>
                              <td className="px-4 py-2">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${f.durum === "gecikti" ? "bg-red-500/10 text-red-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                                  {f.durum === "gecikti" ? "Gecikti" : "Bekliyor"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* FATURALAR */}
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
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${durumRenk(f.durum)}`}>
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

          {/* ÖDEMELER */}
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
      {odemeModalAcik && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-black text-white">Ödeme Ekle</h3>
              <button onClick={() => setOdemeModalAcik(false)} className="text-gray-600 hover:text-white"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Tutar (₺) *</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-xs">₺</span>
                  <input type="number" value={odemeForm.tutar} onChange={e => setOdemeForm({ ...odemeForm, tutar: e.target.value })} placeholder="0" className={`${inputCls} pl-7`} />
                </div>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Tarih</p>
                <input type="date" value={odemeForm.tarih} onChange={e => setOdemeForm({ ...odemeForm, tarih: e.target.value })} className={inputCls} />
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Ödeme Yöntemi</p>
                <select value={odemeForm.odeme_yontemi} onChange={e => setOdemeForm({ ...odemeForm, odeme_yontemi: e.target.value })} className={inputCls}>
                  {["Nakit", "Banka Havalesi", "EFT", "Çek", "Kredi Kartı"].map(y => (
                    <option key={y} value={y} className="bg-[#0c0f1a]">{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Açıklama</p>
                <input value={odemeForm.aciklama} onChange={e => setOdemeForm({ ...odemeForm, aciklama: e.target.value })} placeholder="Opsiyonel..." className={inputCls} />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setOdemeModalAcik(false)} className="flex-1 text-xs font-semibold text-gray-500 hover:text-white border border-[#1a2236] py-2.5 rounded-xl transition-colors">İptal</button>
                <button onClick={odemeKaydet} disabled={formSaving} className="flex-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                  {formSaving ? <Loader2 size={12} className="animate-spin" /> : null} Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ARA ÖDEME MODAL */}
      {araOdemeModal && secilenDonem && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black text-white">Ara Ödeme</h3>
              <button onClick={() => { setAraOdemeModal(false); setAraOdemeTip(null); }} className="text-gray-600 hover:text-white"><X size={16} /></button>
            </div>
            <div className="bg-[#080b14] border border-[#1a2236] rounded-xl p-3 mb-4">
              <p className="text-[11px] text-gray-500">Dönem: {fmtTarih(secilenDonem.donemBaslangic)} – {fmtTarih(secilenDonem.donemBitis)}</p>
              <p className="text-sm font-bold text-white mt-1">Dönem Toplam: ₺{fmt(secilenDonem.toplamTutar)}</p>
            </div>
            {!araOdemeTip ? (
              <div className="space-y-3">
                <p className="text-xs text-gray-400 mb-3">Bu ödemeyi nereye uygulayalım?</p>
                <button onClick={() => setAraOdemeTip("yaklasan")} className="w-full bg-amber-500/10 border border-amber-500/20 hover:border-amber-500/40 text-amber-400 rounded-xl p-4 text-left transition-colors">
                  <p className="text-sm font-bold">Bu dönemden düş</p>
                  <p className="text-[11px] text-amber-400/70 mt-1">{fmtTarih(secilenDonem.donemBaslangic)} – {fmtTarih(secilenDonem.donemBitis)} dönem borcundan düşer</p>
                </button>
                <button onClick={() => setAraOdemeTip("toplam")} className="w-full bg-blue-500/10 border border-blue-500/20 hover:border-blue-500/40 text-blue-400 rounded-xl p-4 text-left transition-colors">
                  <p className="text-sm font-bold">Toplam bakiyeden düş</p>
                  <p className="text-[11px] text-blue-400/70 mt-1">Tüm fatura bakiyesinden genel ödeme olarak işlenir</p>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className={`rounded-xl px-3 py-2 border ${araOdemeTip === "yaklasan" ? "bg-amber-500/10 border-amber-500/20" : "bg-blue-500/10 border-blue-500/20"}`}>
                  <p className={`text-[11px] font-bold ${araOdemeTip === "yaklasan" ? "text-amber-400" : "text-blue-400"}`}>
                    {araOdemeTip === "yaklasan" ? "Bu dönemden düşülecek" : "Toplam bakiyeden düşülecek"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Tutar (₺) *</p>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-xs">₺</span>
                    <input type="number" value={araOdemeForm.tutar} onChange={e => setAraOdemeForm({ ...araOdemeForm, tutar: e.target.value })} placeholder="0" className={`${inputCls} pl-7`} />
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Tarih</p>
                  <input type="date" value={araOdemeForm.tarih} onChange={e => setAraOdemeForm({ ...araOdemeForm, tarih: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Açıklama</p>
                  <input value={araOdemeForm.aciklama} onChange={e => setAraOdemeForm({ ...araOdemeForm, aciklama: e.target.value })} placeholder="Ara ödeme açıklaması..." className={inputCls} />
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setAraOdemeTip(null)} className="flex-1 text-xs text-gray-500 hover:text-white border border-[#1a2236] py-2.5 rounded-xl transition-colors">Geri</button>
                  <button onClick={araOdemeKaydet} disabled={formSaving || !araOdemeForm.tutar} className="flex-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                    {formSaving ? <Loader2 size={12} className="animate-spin" /> : null} Kaydet
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}