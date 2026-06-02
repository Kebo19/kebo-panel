"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Plus, Search, FileText, Trash2, X, Loader2, CheckCircle2,
  AlertTriangle, Building2, Upload, RefreshCw, Calendar,
  ChevronDown, ChevronUp, Check, Square, CheckSquare
} from "lucide-react";

interface Cari { id: string; unvan: string; vergi_no: string; }
interface Fatura {
  id: string; cari_id: string; cari_unvan: string; fatura_no: string;
  fatura_tarihi: string; vade_tarihi: string; tutar: number; kdv: number;
  toplam_tutar: number; aciklama: string; durum: string; islendi: boolean;
}

const inputCls = "w-full bg-[#080b14] border border-[#1a2236] hover:border-[#243050] focus:border-blue-500/50 text-white text-sm h-10 px-3 rounded-xl outline-none transition-all placeholder:text-gray-700";
const fmt = (v: number) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(v);
const fmtTarih = (t: string) => { if (!t) return "—"; try { const p = t.split("-"); return `${p[2]}.${p[1]}.${p[0]}`; } catch { return t; } };
const parseTutar = (s: string) => parseFloat((s || "0").replace(/\./g, "").replace(",", ".")) || 0;
const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

export default function FaturalarPage() {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [faturalar, setFaturalar] = useState<Fatura[]>([]);
  const [cariler, setCariler] = useState<Cari[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [aramaMetni, setAramaMetni] = useState("");
  const [durumFiltre, setDurumFiltre] = useState<"hepsi" | "bekliyor" | "odendi" | "gecikti">("hepsi");
  const [cariFiltre, setCariFiltre] = useState("hepsi");
  const [gorunumModu, setGorunumModu] = useState<"aylik" | "tarih" | "cari">("aylik");
  const [baslangic, setBaslangic] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0]; });
  const [bitis, setBitis] = useState(() => new Date().toISOString().split("T")[0]);
  const [acikAylar, setAcikAylar] = useState<Set<string>>(new Set());
  const [modalAcik, setModalAcik] = useState(false);
  const [xlsYukleniyor, setXlsYukleniyor] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [toast, setToast] = useState<{ tip: "basari" | "hata"; mesaj: string } | null>(null);

  // Toplu seçim
  const [seciliFaturalar, setSeciliFaturalar] = useState<Set<string>>(new Set());
  const [topluIslemYukleniyor, setTopluIslemYukleniyor] = useState(false);

  const [form, setForm] = useState({
    cari_id: "", fatura_no: "",
    fatura_tarihi: new Date().toISOString().split("T")[0],
    vade_tarihi: "", tutar: "", kdv: "20", toplam_tutar: "",
    aciklama: "", durum: "bekliyor",
  });

  const showToast = (tip: "basari" | "hata", mesaj: string) => {
    setToast({ tip, mesaj });
    setTimeout(() => setToast(null), 3500);
  };

  const veriCek = useCallback(async () => {
    setYukleniyor(true);
    const [{ data: f }, { data: c }] = await Promise.all([
      supabase.from("faturalar").select("*").order("fatura_tarihi", { ascending: false }),
      supabase.from("cariler").select("id, unvan, vergi_no").order("unvan"),
    ]);
    if (f) setFaturalar(f as Fatura[]);
    if (c) setCariler(c as Cari[]);
    setYukleniyor(false);
    setSeciliFaturalar(new Set());
  }, []);

  useEffect(() => { veriCek(); }, [veriCek]);

  useEffect(() => {
    const t = parseFloat(form.tutar) || 0;
    const k = parseFloat(form.kdv) || 0;
    setForm(prev => ({ ...prev, toplam_tutar: (t + t * k / 100).toFixed(2) }));
  }, [form.tutar, form.kdv]);

  // Toplu seçim işlemleri
  const faturaSec = (id: string) => {
    setSeciliFaturalar(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const hepsiniSec = (liste: Fatura[]) => {
    const hepsiSecili = liste.every(f => seciliFaturalar.has(f.id));
    if (hepsiSecili) {
      setSeciliFaturalar(prev => {
        const s = new Set(prev);
        liste.forEach(f => s.delete(f.id));
        return s;
      });
    } else {
      setSeciliFaturalar(prev => {
        const s = new Set(prev);
        liste.forEach(f => s.add(f.id));
        return s;
      });
    }
  };

  const secimTemizle = () => setSeciliFaturalar(new Set());

  const topluOdendi = async () => {
    if (seciliFaturalar.size === 0) return;
    setTopluIslemYukleniyor(true);
    await supabase.from("faturalar").update({ durum: "odendi", islendi: true }).in("id", Array.from(seciliFaturalar));
    showToast("basari", `${seciliFaturalar.size} fatura ödendi olarak işaretlendi.`);
    setTopluIslemYukleniyor(false);
    veriCek();
  };

  const topluGecikti = async () => {
    if (seciliFaturalar.size === 0) return;
    setTopluIslemYukleniyor(true);
    await supabase.from("faturalar").update({ durum: "gecikti" }).in("id", Array.from(seciliFaturalar));
    showToast("basari", `${seciliFaturalar.size} fatura gecikti olarak işaretlendi.`);
    setTopluIslemYukleniyor(false);
    veriCek();
  };

  const topluSil = async () => {
    if (seciliFaturalar.size === 0) return;
    if (!confirm(`${seciliFaturalar.size} fatura silinecek. Onaylıyor musunuz?`)) return;
    setTopluIslemYukleniyor(true);
    await supabase.from("faturalar").delete().in("id", Array.from(seciliFaturalar));
    showToast("basari", `${seciliFaturalar.size} fatura silindi.`);
    setTopluIslemYukleniyor(false);
    veriCek();
  };

  // XLS Yükleme
  const xlsYukle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setXlsYukleniyor(true);
    try {
      const buffer = await file.arrayBuffer();
      const decoder = new TextDecoder("utf-16le");
      const text = decoder.decode(buffer).replace(/^\uFEFF/, "");
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/html");
      const rows = doc.querySelectorAll("tbody tr");

      const cariMap = new Map<string, string>();
      const yeniCariler: { vergi_no: string; unvan: string }[] = [];
      rows.forEach(row => {
        const cells = row.querySelectorAll("td");
        if (cells.length < 10) return;
        const vkn = cells[8].textContent?.trim() || "";
        const unvan = cells[9].textContent?.trim() || "";
        if (vkn && unvan && !cariMap.has(vkn)) { cariMap.set(vkn, unvan); yeniCariler.push({ vergi_no: vkn, unvan }); }
      });

      const { data: mevcutCariler } = await supabase.from("cariler").select("id, vergi_no");
      const mevcutVknMap = new Map<string, string>();
      (mevcutCariler || []).forEach(c => mevcutVknMap.set(c.vergi_no, c.id));

      let eklenenCari = 0;
      for (const cari of yeniCariler) {
        if (!mevcutVknMap.has(cari.vergi_no)) {
          const { data } = await supabase.from("cariler").insert([{ unvan: cari.unvan, vergi_no: cari.vergi_no, tip: "tedarikci" }]).select("id").single();
          if (data) { mevcutVknMap.set(cari.vergi_no, data.id); eklenenCari++; }
        }
      }

      const faturaRows: any[] = [];
      rows.forEach(row => {
        const cells = row.querySelectorAll("td");
        if (cells.length < 21) return;
        const vkn = cells[8].textContent?.trim() || "";
        const cariId = mevcutVknMap.get(vkn);
        if (!cariId) return;
        const gibNo = cells[0].textContent?.trim() || "";
        const belge_tarihi = cells[6].textContent?.trim() || "";
        const unvan = cells[9].textContent?.trim() || "";
        const tutar = parseTutar(cells[11].textContent?.trim() || "0");
        const odenecek = parseTutar(cells[20].textContent?.trim() || "0");
        let fatura_tarihi = "";
        if (belge_tarihi.includes(".")) { const [d, m, y] = belge_tarihi.split("."); fatura_tarihi = `${y}-${m}-${d}`; }
        faturaRows.push({ cari_id: cariId, cari_unvan: unvan, fatura_no: gibNo, fatura_tarihi: fatura_tarihi || null, tutar, kdv: 0, toplam_tutar: odenecek || tutar, aciklama: `Mikro e-Fatura: ${gibNo}`, durum: "bekliyor", islendi: false });
      });

      const { data: mevcutFaturalar } = await supabase.from("faturalar").select("fatura_no");
      const mevcutNoSet = new Set((mevcutFaturalar || []).map(f => f.fatura_no));
      const yeniSatirlar = faturaRows.filter(f => !mevcutNoSet.has(f.fatura_no));
      const atlanenFatura = faturaRows.length - yeniSatirlar.length;
      let eklenenFatura = 0;
      if (yeniSatirlar.length > 0) {
        const { error } = await supabase.from("faturalar").insert(yeniSatirlar);
        if (!error) eklenenFatura = yeniSatirlar.length;
      }
      showToast("basari", `${eklenenCari} yeni cari, ${eklenenFatura} yeni fatura eklendi.${atlanenFatura > 0 ? ` (${atlanenFatura} zaten mevcut)` : ""}`);
      veriCek();
    } catch { showToast("hata", "Dosya okunamadı."); }
    setXlsYukleniyor(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const kaydet = async () => {
    if (!form.cari_id || !form.fatura_no || !form.tutar) { showToast("hata", "Cari, fatura no ve tutar zorunlu."); return; }
    setFormSaving(true);
    const cari = cariler.find(c => c.id === form.cari_id);
    const { error } = await supabase.from("faturalar").insert([{
      cari_id: form.cari_id, cari_unvan: cari?.unvan || "", fatura_no: form.fatura_no,
      fatura_tarihi: form.fatura_tarihi, vade_tarihi: form.vade_tarihi || null,
      tutar: parseFloat(form.tutar), kdv: parseFloat(form.kdv), toplam_tutar: parseFloat(form.toplam_tutar),
      aciklama: form.aciklama, durum: form.durum, islendi: false,
    }]);
    setFormSaving(false);
    if (error) { showToast("hata", "Kayıt hatası: " + error.message); return; }
    showToast("basari", "Fatura kaydedildi.");
    setModalAcik(false);
    setForm({ cari_id: "", fatura_no: "", fatura_tarihi: new Date().toISOString().split("T")[0], vade_tarihi: "", tutar: "", kdv: "20", toplam_tutar: "", aciklama: "", durum: "bekliyor" });
    veriCek();
  };

  const durumGuncelle = async (id: string, durum: string) => {
    await supabase.from("faturalar").update({ durum, islendi: durum === "odendi" }).eq("id", id);
    veriCek();
  };

  const sil = async (id: string) => {
    if (!confirm("Bu faturayı silmek istiyor musunuz?")) return;
    await supabase.from("faturalar").delete().eq("id", id);
    veriCek();
  };

  const filtreliFaturalar = useMemo(() => {
    return faturalar.filter(f => {
      if (durumFiltre !== "hepsi" && f.durum !== durumFiltre) return false;
      if (cariFiltre !== "hepsi" && f.cari_unvan !== cariFiltre) return false;
      if (gorunumModu === "tarih") {
        if (baslangic && f.fatura_tarihi < baslangic) return false;
        if (bitis && f.fatura_tarihi > bitis) return false;
      }
      if (aramaMetni) {
        const q = aramaMetni.toLowerCase();
        return f.cari_unvan?.toLowerCase().includes(q) || f.fatura_no?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [faturalar, durumFiltre, cariFiltre, gorunumModu, baslangic, bitis, aramaMetni]);

  const aylikGruplar = useMemo(() => {
    const map = new Map<string, Fatura[]>();
    filtreliFaturalar.forEach(f => {
      if (!f.fatura_tarihi) return;
      const [y, m] = f.fatura_tarihi.split("-");
      const key = `${y}-${m}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtreliFaturalar]);

  const cariGruplari = useMemo(() => {
    const map = new Map<string, { unvan: string; faturalar: Fatura[]; toplam: number }>();
    filtreliFaturalar.forEach(f => {
      if (!map.has(f.cari_unvan)) map.set(f.cari_unvan, { unvan: f.cari_unvan, faturalar: [], toplam: 0 });
      const g = map.get(f.cari_unvan)!;
      g.faturalar.push(f);
      g.toplam += f.toplam_tutar || 0;
    });
    return Array.from(map.values()).sort((a, b) => b.toplam - a.toplam);
  }, [filtreliFaturalar]);

  const toplamlar = useMemo(() => ({
    bekliyor: faturalar.filter(f => f.durum === "bekliyor").reduce((s, f) => s + (f.toplam_tutar || 0), 0),
    odendi: faturalar.filter(f => f.durum === "odendi").reduce((s, f) => s + (f.toplam_tutar || 0), 0),
    gecikti: faturalar.filter(f => f.durum === "gecikti").reduce((s, f) => s + (f.toplam_tutar || 0), 0),
    toplam: faturalar.reduce((s, f) => s + (f.toplam_tutar || 0), 0),
  }), [faturalar]);

  const durumRenk = (durum: string) => {
    if (durum === "odendi") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (durum === "gecikti") return "bg-red-500/10 text-red-400 border-red-500/20";
    return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
  };

  const toggleAy = (key: string) => {
    setAcikAylar(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });
  };

  const ayBaslik = (key: string) => {
    const [y, m] = key.split("-");
    return `${AYLAR[parseInt(m) - 1]} ${y}`;
  };

  const seciliToplam = useMemo(() => {
    return faturalar.filter(f => seciliFaturalar.has(f.id)).reduce((s, f) => s + (f.toplam_tutar || 0), 0);
  }, [seciliFaturalar, faturalar]);

  // Fatura tablosu — toplu seçim ile
  const FaturaTablosu = ({ liste }: { liste: Fatura[] }) => {
    const hepsiSecili = liste.length > 0 && liste.every(f => seciliFaturalar.has(f.id));
    return (
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#1a2236]">
            <th className="px-4 py-3 w-10">
              <button onClick={() => hepsiniSec(liste)} className="text-gray-500 hover:text-white transition-colors">
                {hepsiSecili ? <CheckSquare size={14} className="text-blue-400" /> : <Square size={14} />}
              </button>
            </th>
            {["Cari", "Fatura No", "Tarih", "Tutar", "Durum", "İşlem"].map(h => (
              <th key={h} className="text-left px-4 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#0f1624]">
          {liste.map(f => (
            <tr key={f.id} className={`transition-colors ${seciliFaturalar.has(f.id) ? "bg-blue-600/10" : "hover:bg-white/[0.02]"}`}>
              <td className="px-4 py-3">
                <button onClick={() => faturaSec(f.id)} className="text-gray-500 hover:text-white transition-colors">
                  {seciliFaturalar.has(f.id)
                    ? <CheckSquare size={14} className="text-blue-400" />
                    : <Square size={14} />}
                </button>
              </td>
              <td className="px-4 py-3 text-white font-medium max-w-[150px] truncate">{f.cari_unvan}</td>
              <td className="px-4 py-3 text-blue-400 font-bold text-[11px]">{f.fatura_no}</td>
              <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{fmtTarih(f.fatura_tarihi)}</td>
              <td className="px-4 py-3 text-emerald-400 font-black whitespace-nowrap">₺{fmt(f.toplam_tutar)}</td>
              <td className="px-4 py-3">
                <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${durumRenk(f.durum)}`}>
                  {f.durum === "odendi" ? "Ödendi" : f.durum === "gecikti" ? "Gecikti" : "Bekliyor"}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1.5">
                  {f.durum === "bekliyor" && (
                    <>
                      <button onClick={() => durumGuncelle(f.id, "odendi")} className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-lg hover:bg-emerald-500/20 transition-colors whitespace-nowrap">Ödendi</button>
                      <button onClick={() => durumGuncelle(f.id, "gecikti")} className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded-lg hover:bg-red-500/20 transition-colors whitespace-nowrap">Gecikti</button>
                    </>
                  )}
                  {f.durum === "odendi" && <span className="text-[10px] text-emerald-400 font-bold">✓</span>}
                  <button onClick={() => sil(f.id)} className="text-gray-700 hover:text-red-400 transition-colors ml-1"><Trash2 size={13} /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-[#1a2236] bg-[#080b14]">
            <td colSpan={4} className="px-4 py-3 text-[10px] text-gray-600 font-bold uppercase">{liste.length} fatura</td>
            <td className="px-4 py-3 text-emerald-400 font-black">₺{fmt(liste.reduce((s, f) => s + (f.toplam_tutar || 0), 0))}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    );
  };

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
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
              <FileText className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-black text-white leading-none">Faturalar</h1>
              <p className="text-[10px] text-gray-600 mt-0.5">{faturalar.length} fatura</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={veriCek} className="p-2 text-gray-600 hover:text-white border border-[#1a2236] rounded-xl transition-colors">
              <RefreshCw size={14} />
            </button>
            <label className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-xl transition-colors cursor-pointer border border-[#1a2236] text-gray-400 hover:text-white ${xlsYukleniyor ? "opacity-50" : ""}`}>
              {xlsYukleniyor ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              XLS Yükle
              <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={xlsYukle} disabled={xlsYukleniyor} />
            </label>
            <button onClick={() => setModalAcik(true)} className="flex items-center gap-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl transition-colors">
              <Plus size={14} /> Fatura Ekle
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-5 space-y-4">

        {/* KPI */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Toplam", value: toplamlar.toplam, color: "#60A5FA" },
            { label: "Bekliyor", value: toplamlar.bekliyor, color: "#FBBF24" },
            { label: "Ödendi", value: toplamlar.odendi, color: "#34D399" },
            { label: "Gecikti", value: toplamlar.gecikti, color: "#F87171" },
          ].map(k => (
            <div key={k.label} className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-4">
              <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">{k.label}</p>
              <p className="text-lg font-black" style={{ color: k.color }}>₺{fmt(k.value)}</p>
            </div>
          ))}
        </div>

        {/* FİLTRELER */}
        <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <div className="flex gap-1 bg-[#080b14] border border-[#1a2236] rounded-xl p-1">
              {[{ key: "aylik", label: "Aylık" }, { key: "tarih", label: "Tarih Aralığı" }, { key: "cari", label: "Cari Bazlı" }].map(m => (
                <button key={m.key} onClick={() => setGorunumModu(m.key as any)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${gorunumModu === m.key ? "bg-blue-600 text-white" : "text-gray-500 hover:text-white"}`}>
                  {m.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1 bg-[#080b14] border border-[#1a2236] rounded-xl p-1">
              {(["hepsi", "bekliyor", "odendi", "gecikti"] as const).map(d => (
                <button key={d} onClick={() => setDurumFiltre(d)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${durumFiltre === d ? "bg-blue-600 text-white" : "text-gray-500 hover:text-white"}`}>
                  {d === "hepsi" ? "Hepsi" : d === "bekliyor" ? "Bekliyor" : d === "odendi" ? "Ödendi" : "Gecikti"}
                </button>
              ))}
            </div>
          </div>

          {gorunumModu === "tarih" && (
            <div className="flex flex-wrap gap-3 items-center">
              <input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)} className="bg-[#080b14] border border-[#1a2236] text-white text-xs h-9 px-3 rounded-xl outline-none focus:border-blue-500/40" />
              <span className="text-gray-600 text-xs">—</span>
              <input type="date" value={bitis} onChange={e => setBitis(e.target.value)} className="bg-[#080b14] border border-[#1a2236] text-white text-xs h-9 px-3 rounded-xl outline-none focus:border-blue-500/40" />
              <div className="flex gap-1.5 flex-wrap">
                {[
                  { label: "Bu ay", fn: () => { const d = new Date(); d.setDate(1); setBaslangic(d.toISOString().split("T")[0]); setBitis(new Date().toISOString().split("T")[0]); } },
                  { label: "Son 30 gün", fn: () => { const d = new Date(); d.setDate(d.getDate() - 30); setBaslangic(d.toISOString().split("T")[0]); setBitis(new Date().toISOString().split("T")[0]); } },
                  { label: "Son 3 ay", fn: () => { const d = new Date(); d.setMonth(d.getMonth() - 3); setBaslangic(d.toISOString().split("T")[0]); setBitis(new Date().toISOString().split("T")[0]); } },
                ].map(b => (
                  <button key={b.label} onClick={b.fn} className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 hover:bg-blue-600 hover:text-white transition-colors">{b.label}</button>
                ))}
              </div>
            </div>
          )}

          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
            <input value={aramaMetni} onChange={e => setAramaMetni(e.target.value)} placeholder="Cari veya fatura no ara..."
              className="w-full bg-[#080b14] border border-[#1a2236] text-white text-xs h-9 pl-9 pr-3 rounded-xl outline-none focus:border-blue-500/40 placeholder:text-gray-700" />
          </div>
        </div>

        {yukleniyor ? (
          <div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" /></div>
        ) : filtreliFaturalar.length === 0 ? (
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl py-16 text-center text-gray-600 text-xs uppercase tracking-widest">Fatura bulunamadı</div>
        ) : (
          <>
            {/* AYLIK */}
            {gorunumModu === "aylik" && (
              <div className="space-y-3">
                {aylikGruplar.map(([key, liste]) => (
                  <div key={key} className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl overflow-hidden">
                    <button onClick={() => toggleAy(key)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-center gap-3">
                        <Calendar size={14} className="text-blue-400" />
                        <span className="text-sm font-black text-white">{ayBaslik(key)}</span>
                        <span className="text-[11px] text-gray-600 bg-white/5 px-2 py-0.5 rounded-full">{liste.length} fatura</span>
                        {liste.some(f => seciliFaturalar.has(f.id)) && (
                          <span className="text-[11px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
                            {liste.filter(f => seciliFaturalar.has(f.id)).length} seçili
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-black text-emerald-400">₺{fmt(liste.reduce((s, f) => s + (f.toplam_tutar || 0), 0))}</span>
                        {acikAylar.has(key) ? <ChevronUp size={14} className="text-gray-600" /> : <ChevronDown size={14} className="text-gray-600" />}
                      </div>
                    </button>
                    {acikAylar.has(key) && <div className="border-t border-[#1a2236] overflow-x-auto"><FaturaTablosu liste={liste} /></div>}
                  </div>
                ))}
              </div>
            )}

            {/* TARİH ARALIKLI */}
            {gorunumModu === "tarih" && (
              <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl overflow-hidden overflow-x-auto">
                <FaturaTablosu liste={filtreliFaturalar} />
              </div>
            )}

            {/* CARİ BAZLI */}
            {gorunumModu === "cari" && (
              <div className="space-y-3">
                {cariGruplari.map(g => (
                  <div key={g.unvan} className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl overflow-hidden">
                    <button onClick={() => setCariFiltre(cariFiltre === g.unvan ? "hepsi" : g.unvan)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                          <span className="text-xs font-black text-blue-400">{g.unvan.charAt(0)}</span>
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-bold text-white">{g.unvan}</p>
                          <p className="text-[10px] text-gray-600">{g.faturalar.length} fatura</p>
                        </div>
                        {g.faturalar.some(f => seciliFaturalar.has(f.id)) && (
                          <span className="text-[11px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
                            {g.faturalar.filter(f => seciliFaturalar.has(f.id)).length} seçili
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm font-black text-emerald-400">₺{fmt(g.toplam)}</p>
                          <p className="text-[10px] text-yellow-400">₺{fmt(g.faturalar.filter(f => f.durum === "bekliyor").reduce((s, f) => s + f.toplam_tutar, 0))} bekliyor</p>
                        </div>
                        {cariFiltre === g.unvan ? <ChevronUp size={14} className="text-gray-600" /> : <ChevronDown size={14} className="text-gray-600" />}
                      </div>
                    </button>
                    {cariFiltre === g.unvan && <div className="border-t border-[#1a2236] overflow-x-auto"><FaturaTablosu liste={g.faturalar} /></div>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* TOPLU İŞLEM ÇUBUĞU */}
      {seciliFaturalar.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#0c0f1a]/98 backdrop-blur-xl border-t border-blue-500/30 px-4 py-3">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-sm font-black text-blue-400">{seciliFaturalar.size} fatura seçildi</span>
              <span className="text-sm font-black text-white">· ₺{fmt(seciliToplam)}</span>
              <button onClick={secimTemizle} className="text-[11px] text-gray-500 hover:text-white transition-colors">Seçimi Temizle</button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={topluOdendi} disabled={topluIslemYukleniyor}
                className="flex items-center gap-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 px-4 py-2 rounded-xl transition-colors">
                {topluIslemYukleniyor ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Ödendi İşaretle
              </button>
              <button onClick={topluGecikti} disabled={topluIslemYukleniyor}
                className="flex items-center gap-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-40 px-4 py-2 rounded-xl transition-colors">
                Gecikti İşaretle
              </button>
              <button onClick={topluSil} disabled={topluIslemYukleniyor}
                className="flex items-center gap-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 px-4 py-2 rounded-xl transition-colors">
                <Trash2 size={12} /> Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FATURA MODAL */}
      {modalAcik && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-black text-white">Yeni Fatura</h3>
              <button onClick={() => setModalAcik(false)} className="text-gray-600 hover:text-white"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Cari *</p>
                <select value={form.cari_id} onChange={e => setForm({ ...form, cari_id: e.target.value })} className={inputCls}>
                  <option value="" className="bg-[#0c0f1a]">Cari seçin...</option>
                  {cariler.map(c => <option key={c.id} value={c.id} className="bg-[#0c0f1a]">{c.unvan}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Fatura No *</p>
                <input value={form.fatura_no} onChange={e => setForm({ ...form, fatura_no: e.target.value })} placeholder="FAT-2024-001" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Fatura Tarihi</p>
                  <input type="date" value={form.fatura_tarihi} onChange={e => setForm({ ...form, fatura_tarihi: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Vade Tarihi</p>
                  <input type="date" value={form.vade_tarihi} onChange={e => setForm({ ...form, vade_tarihi: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Tutar *</p>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-xs">₺</span>
                    <input type="number" value={form.tutar} onChange={e => setForm({ ...form, tutar: e.target.value })} placeholder="0" className={`${inputCls} pl-7`} />
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">KDV (%)</p>
                  <select value={form.kdv} onChange={e => setForm({ ...form, kdv: e.target.value })} className={inputCls}>
                    {["0", "1", "10", "20"].map(v => <option key={v} value={v} className="bg-[#0c0f1a]">%{v}</option>)}
                  </select>
                </div>
              </div>
              <div className="bg-[#080b14] border border-[#1a2236] rounded-xl px-4 py-3 flex justify-between">
                <span className="text-xs text-gray-500">Toplam (KDV Dahil)</span>
                <span className="text-sm font-black text-emerald-400">₺{fmt(parseFloat(form.toplam_tutar) || 0)}</span>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Açıklama</p>
                <input value={form.aciklama} onChange={e => setForm({ ...form, aciklama: e.target.value })} placeholder="Opsiyonel..." className={inputCls} />
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Durum</p>
                <select value={form.durum} onChange={e => setForm({ ...form, durum: e.target.value })} className={inputCls}>
                  <option value="bekliyor" className="bg-[#0c0f1a]">Bekliyor</option>
                  <option value="odendi" className="bg-[#0c0f1a]">Ödendi</option>
                  <option value="gecikti" className="bg-[#0c0f1a]">Gecikti</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setModalAcik(false)} className="flex-1 text-xs font-semibold text-gray-500 hover:text-white border border-[#1a2236] py-2.5 rounded-xl transition-colors">İptal</button>
                <button onClick={kaydet} disabled={formSaving}
                  className="flex-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                  {formSaving ? <Loader2 size={12} className="animate-spin" /> : null} Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}