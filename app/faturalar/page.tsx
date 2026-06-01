"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Plus, Search, FileText, Trash2, X, Loader2, CheckCircle2,
  AlertTriangle, Building2, Upload, RefreshCw, ChevronDown
} from "lucide-react";

interface Cari { id: string; unvan: string; vergi_no: string; }
interface Fatura {
  id: string; cari_id: string; cari_unvan: string; fatura_no: string;
  fatura_tarihi: string; vade_tarihi: string; tutar: number; kdv: number;
  toplam_tutar: number; aciklama: string; durum: string; islendi: boolean;
}

const inputCls = "w-full bg-[#080b14] border border-[#1a2236] hover:border-[#243050] focus:border-blue-500/50 text-white text-sm h-10 px-3 rounded-xl outline-none transition-all placeholder:text-gray-700";
const fmt = (v: number) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 }).format(v);
const fmtTarih = (t: string) => { if (!t) return "—"; try { const [d, m, y] = t.includes(".") ? t.split(".") : t.split("-").reverse(); return `${d}.${m}.${y}`; } catch { return t; } };
const parseTutar = (s: string) => parseFloat((s || "0").replace(/\./g, "").replace(",", ".")) || 0;

export default function FaturalarPage() {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [faturalar, setFaturalar] = useState<Fatura[]>([]);
  const [cariler, setCariler] = useState<Cari[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [aramaMetni, setAramaMetni] = useState("");
  const [durumFiltre, setDurumFiltre] = useState<"hepsi" | "bekliyor" | "odendi" | "gecikti">("hepsi");
  const [cariFiltre, setCariFiltre] = useState("hepsi");
  const [modalAcik, setModalAcik] = useState(false);
  const [xlsYukleniyor, setXlsYukleniyor] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [toast, setToast] = useState<{ tip: "basari" | "hata"; mesaj: string } | null>(null);

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
  }, []);

  useEffect(() => { veriCek(); }, [veriCek]);

  useEffect(() => {
    const t = parseFloat(form.tutar) || 0;
    const k = parseFloat(form.kdv) || 0;
    setForm(prev => ({ ...prev, toplam_tutar: (t + t * k / 100).toFixed(2) }));
  }, [form.tutar, form.kdv]);

  // ── XLS Yükleme ──
  const xlsYukle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setXlsYukleniyor(true);

    try {
      const text = await file.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/html");
      const rows = doc.querySelectorAll("tbody tr");

      // Önce cariler oluştur
      const cariMap = new Map<string, string>();
      const yeniCariler: { vergi_no: string; unvan: string }[] = [];

      rows.forEach(row => {
        const cells = row.querySelectorAll("td");
        if (cells.length < 10) return;
        const vkn = cells[8].textContent?.trim() || "";
        const unvan = cells[9].textContent?.trim() || "";
        if (vkn && unvan && !cariMap.has(vkn)) {
          cariMap.set(vkn, unvan);
          yeniCariler.push({ vergi_no: vkn, unvan });
        }
      });

      // Mevcut carileri çek
      const { data: mevcutCariler } = await supabase.from("cariler").select("id, vergi_no, unvan");
      const mevcutVknMap = new Map<string, string>();
      (mevcutCariler || []).forEach(c => mevcutVknMap.set(c.vergi_no, c.id));

      // Yeni carileri ekle
      let eklenenCari = 0;
      for (const cari of yeniCariler) {
        if (!mevcutVknMap.has(cari.vergi_no)) {
          const { data } = await supabase.from("cariler").insert([{
            unvan: cari.unvan, vergi_no: cari.vergi_no, tip: "tedarikci",
          }]).select("id").single();
          if (data) { mevcutVknMap.set(cari.vergi_no, data.id); eklenenCari++; }
        }
      }

      // Faturaları ekle
      let eklenenFatura = 0;
      let atlanenFatura = 0;
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

        // Tarihi YYYY-MM-DD formatına çevir
        let fatura_tarihi = "";
        if (belge_tarihi.includes(".")) {
          const [d, m, y] = belge_tarihi.split(".");
          fatura_tarihi = `${y}-${m}-${d}`;
        }

        faturaRows.push({
          cari_id: cariId,
          cari_unvan: unvan,
          fatura_no: gibNo,
          fatura_tarihi: fatura_tarihi || null,
          tutar,
          kdv: 0,
          toplam_tutar: odenecek || tutar,
          aciklama: `Mikro e-Fatura: ${gibNo}`,
          durum: "bekliyor",
          islendi: false,
        });
      });

      // Mevcut fatura nolarını çek (duplicate kontrolü)
      const { data: mevcutFaturalar } = await supabase.from("faturalar").select("fatura_no");
      const mevcutNoSet = new Set((mevcutFaturalar || []).map(f => f.fatura_no));

      const yeniSatirlar = faturaRows.filter(f => !mevcutNoSet.has(f.fatura_no));
      atlanenFatura = faturaRows.length - yeniSatirlar.length;

      if (yeniSatirlar.length > 0) {
        const { error } = await supabase.from("faturalar").insert(yeniSatirlar);
        if (!error) eklenenFatura = yeniSatirlar.length;
      }

      showToast("basari", `${eklenenCari} yeni cari, ${eklenenFatura} yeni fatura eklendi. ${atlanenFatura > 0 ? `(${atlanenFatura} zaten mevcut)` : ""}`);
      veriCek();
    } catch (err) {
      showToast("hata", "Dosya okunamadı.");
    }

    setXlsYukleniyor(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const kaydet = async () => {
    if (!form.cari_id || !form.fatura_no || !form.tutar) {
      showToast("hata", "Cari, fatura no ve tutar zorunlu."); return;
    }
    setFormSaving(true);
    const cari = cariler.find(c => c.id === form.cari_id);
    const { error } = await supabase.from("faturalar").insert([{
      cari_id: form.cari_id, cari_unvan: cari?.unvan || "",
      fatura_no: form.fatura_no, fatura_tarihi: form.fatura_tarihi,
      vade_tarihi: form.vade_tarihi || null,
      tutar: parseFloat(form.tutar), kdv: parseFloat(form.kdv),
      toplam_tutar: parseFloat(form.toplam_tutar),
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
    showToast("basari", "Durum güncellendi.");
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
      if (aramaMetni) {
        const q = aramaMetni.toLowerCase();
        return f.cari_unvan?.toLowerCase().includes(q) || f.fatura_no?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [faturalar, durumFiltre, cariFiltre, aramaMetni]);

  // Cari bazlı gruplama
  const cariGruplari = useMemo(() => {
    const map = new Map<string, { unvan: string; faturalar: Fatura[]; toplam: number }>();
    faturalar.forEach(f => {
      if (!map.has(f.cari_unvan)) map.set(f.cari_unvan, { unvan: f.cari_unvan, faturalar: [], toplam: 0 });
      const g = map.get(f.cari_unvan)!;
      g.faturalar.push(f);
      g.toplam += f.toplam_tutar || 0;
    });
    return Array.from(map.values()).sort((a, b) => b.toplam - a.toplam);
  }, [faturalar]);

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

  const benzersizCariler = useMemo(() => [...new Set(faturalar.map(f => f.cari_unvan))].sort(), [faturalar]);

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
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
              <FileText className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-black text-white leading-none">Faturalar</h1>
              <p className="text-[10px] text-gray-600 mt-0.5">{faturalar.length} fatura · {cariGruplari.length} cari</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={veriCek} className="p-2 text-gray-600 hover:text-white border border-[#1a2236] rounded-xl transition-colors">
              <RefreshCw size={14} />
            </button>
            <label className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-xl transition-colors cursor-pointer border border-[#1a2236] text-gray-400 hover:text-white hover:border-[#2a3550] ${xlsYukleniyor ? "opacity-50" : ""}`}>
              {xlsYukleniyor ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              XLS Yükle
              <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={xlsYukle} disabled={xlsYukleniyor} />
            </label>
            <button onClick={() => setModalAcik(true)}
              className="flex items-center gap-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl transition-colors">
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

        {/* CARİ BAZLI ÖZET */}
        <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#1a2236]">
            <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold flex items-center gap-1.5">
              <Building2 size={11} /> Cari Bazlı Özet
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1a2236]">
                  {["Cari", "Fatura Sayısı", "Toplam Tutar", "Bekliyor", "Ödendi"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0f1624]">
                {cariGruplari.map(g => (
                  <tr key={g.unvan}
                    className={`hover:bg-white/[0.02] transition-colors cursor-pointer ${cariFiltre === g.unvan ? "bg-blue-600/10" : ""}`}
                    onClick={() => setCariFiltre(cariFiltre === g.unvan ? "hepsi" : g.unvan)}>
                    <td className="px-4 py-3 text-white font-medium max-w-[250px] truncate">{g.unvan}</td>
                    <td className="px-4 py-3 text-blue-400 font-bold">{g.faturalar.length}</td>
                    <td className="px-4 py-3 text-emerald-400 font-black">₺{fmt(g.toplam)}</td>
                    <td className="px-4 py-3 text-yellow-400">₺{fmt(g.faturalar.filter(f => f.durum === "bekliyor").reduce((s, f) => s + f.toplam_tutar, 0))}</td>
                    <td className="px-4 py-3 text-emerald-400">₺{fmt(g.faturalar.filter(f => f.durum === "odendi").reduce((s, f) => s + f.toplam_tutar, 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cariFiltre !== "hepsi" && (
            <div className="px-5 py-2 border-t border-[#1a2236] flex items-center justify-between">
              <p className="text-[11px] text-blue-400">Filtre: <strong>{cariFiltre}</strong></p>
              <button onClick={() => setCariFiltre("hepsi")} className="text-[11px] text-gray-500 hover:text-white transition-colors">Filtreyi Kaldır</button>
            </div>
          )}
        </div>

        {/* FİLTRE + ARAMA */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-1 bg-[#0c0f1a] border border-[#1a2236] rounded-xl p-1">
            {(["hepsi", "bekliyor", "odendi", "gecikti"] as const).map(d => (
              <button key={d} onClick={() => setDurumFiltre(d)}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${durumFiltre === d ? "bg-blue-600 text-white" : "text-gray-500 hover:text-white"}`}>
                {d === "hepsi" ? "Hepsi" : d === "bekliyor" ? "Bekliyor" : d === "odendi" ? "Ödendi" : "Gecikti"}
              </button>
            ))}
          </div>
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
            <input value={aramaMetni} onChange={e => setAramaMetni(e.target.value)}
              placeholder="Cari veya fatura no ara..."
              className="w-full bg-[#0c0f1a] border border-[#1a2236] text-white text-xs h-9 pl-9 pr-3 rounded-xl outline-none focus:border-blue-500/40 placeholder:text-gray-700" />
          </div>
        </div>

        {/* FATURA LİSTESİ */}
        {yukleniyor ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : filtreliFaturalar.length === 0 ? (
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl py-16 text-center text-gray-600 text-xs uppercase tracking-widest">
            Fatura bulunamadı
          </div>
        ) : (
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1a2236]">
                    {["Cari", "Fatura No", "Tarih", "Tutar", "Durum", "İşlem"].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#0f1624]">
                  {filtreliFaturalar.map(f => (
                    <tr key={f.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 text-white font-medium max-w-[200px] truncate">{f.cari_unvan}</td>
                      <td className="px-4 py-3 text-blue-400 font-bold text-[11px]">{f.fatura_no}</td>
                      <td className="px-4 py-3 text-gray-400">{fmtTarih(f.fatura_tarihi)}</td>
                      <td className="px-4 py-3 text-emerald-400 font-black">₺{fmt(f.toplam_tutar)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${durumRenk(f.durum)}`}>
                          {f.durum === "odendi" ? "Ödendi" : f.durum === "gecikti" ? "Gecikti" : "Bekliyor"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {f.durum === "bekliyor" && (
                            <>
                              <button onClick={() => durumGuncelle(f.id, "odendi")}
                                className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-lg hover:bg-emerald-500/20 transition-colors whitespace-nowrap">
                                Ödendi
                              </button>
                              <button onClick={() => durumGuncelle(f.id, "gecikti")}
                                className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded-lg hover:bg-red-500/20 transition-colors whitespace-nowrap">
                                Gecikti
                              </button>
                            </>
                          )}
                          {f.durum === "odendi" && <span className="text-[10px] text-emerald-400 font-bold">✓</span>}
                          <button onClick={() => sil(f.id)} className="text-gray-700 hover:text-red-400 transition-colors ml-1">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[#1a2236] bg-[#080b14]">
                    <td colSpan={3} className="px-4 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-bold">{filtreliFaturalar.length} fatura</td>
                    <td className="px-4 py-3 text-emerald-400 font-black">₺{fmt(filtreliFaturalar.reduce((s, f) => s + (f.toplam_tutar || 0), 0))}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* MANUEL FATURA MODAL */}
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
                    <option value="0" className="bg-[#0c0f1a]">%0</option>
                    <option value="1" className="bg-[#0c0f1a]">%1</option>
                    <option value="10" className="bg-[#0c0f1a]">%10</option>
                    <option value="20" className="bg-[#0c0f1a]">%20</option>
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