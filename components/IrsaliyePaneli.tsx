"use client";

import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { bugun, fmtTarih } from "@/lib/tarih";
import { miktarOku } from "@/lib/stok";
import { yuklemeIcinHazirla, jsonCevap } from "@/lib/gorsel";
import { FileText, Camera, Loader2, Plus, Trash2, X, Save, PackageCheck, Truck, AlertTriangle } from "lucide-react";

// İRSALİYE / GELECEK MAL
// Mal gelmeden önce irsaliye girilir (fotoğraf/PDF okutularak ya da elle). Kalemler "yolda"
// olarak tutulur ve sipariş önerisinden düşülür. Mal gelince "Teslim Al" ile gelen miktarlar
// onaylanır; stok girişi otomatik oluşur (veritabanında irsaliye_teslim_al fonksiyonu).

export interface IrsaliyeKalemi {
  id: string; belge_id: string | null; fatura_no: string | null; tedarikci: string | null;
  fatura_tarihi: string | null; beklenen_tarih: string | null;
  urun_adi_ham: string | null; urun_id: string | null; miktar: number; birim: string | null;
  birim_fiyat: number | null; durum: string; created_at: string;
}
interface UrunKisa { id: string; urun_adi: string; birim: string; son_fiyat: number | null; }
interface FormSatiri { anahtar: number; urun_id: string; urun_adi_ham: string; miktar: string; birim: string; fiyat: string; }

const inputCls = "w-full bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] text-xs h-9 px-3 rounded-xl outline-none";
const fmt = (v: number, d = 1) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: d }).format(v || 0);
let sayac = 0;
const bosSatir = (): FormSatiri => ({ anahtar: ++sayac, urun_id: "", urun_adi_ham: "", miktar: "", birim: "", fiyat: "" });

export default function IrsaliyePaneli({ urunler, bekleyenler, varsayilanTarih, kullanici, onDegisti }: {
  urunler: UrunKisa[];
  bekleyenler: IrsaliyeKalemi[];
  varsayilanTarih: string;
  kullanici: string;
  onDegisti: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const urunMap = useMemo(() => new Map(urunler.map(u => [u.id, u])), [urunler]);

  // ── Yeni irsaliye formu ──
  const [formAcik, setFormAcik] = useState(false);
  const [tedarikci, setTedarikci] = useState("");
  const [belgeNo, setBelgeNo] = useState("");
  const [belgeTarihi, setBelgeTarihi] = useState(bugun());
  const [beklenen, setBeklenen] = useState(varsayilanTarih);
  const [satirlar, setSatirlar] = useState<FormSatiri[]>([bosSatir()]);
  const [taraniyor, setTaraniyor] = useState(false);
  const [taramaMesaj, setTaramaMesaj] = useState<{ tip: "hata" | "uyari"; metin: string } | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const dosyaRef = useRef<HTMLInputElement>(null);

  // ── Teslim alma ──
  const [teslimBelge, setTeslimBelge] = useState<string | null>(null);
  const [teslimMiktarlar, setTeslimMiktarlar] = useState<Record<string, string>>({});
  const [teslimTarihi, setTeslimTarihi] = useState(bugun());

  const belgeler = useMemo(() => {
    const m = new Map<string, IrsaliyeKalemi[]>();
    bekleyenler.forEach(k => { const a = k.belge_id || k.id; if (!m.has(a)) m.set(a, []); m.get(a)!.push(k); });
    return Array.from(m.entries()).map(([id, kalemler]) => ({ id, kalemler, ilk: kalemler[0] }))
      .sort((a, b) => String(a.ilk.beklenen_tarih || "").localeCompare(String(b.ilk.beklenen_tarih || "")));
  }, [bekleyenler]);

  const formuAc = () => {
    setTedarikci(""); setBelgeNo(""); setBelgeTarihi(bugun()); setBeklenen(varsayilanTarih);
    setSatirlar([bosSatir()]); setTaramaMesaj(null); setFormAcik(true);
  };

  const satirDegistir = (anahtar: number, alan: Partial<FormSatiri>) =>
    setSatirlar(s => s.map(x => x.anahtar === anahtar ? { ...x, ...alan } : x));

  const tara = async (file: File) => {
    setTaraniyor(true); setTaramaMesaj(null);
    try {
      const dosya = await yuklemeIcinHazirla(file);
      const res = await fetch("/api/irsaliye-tara", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dosyaBase64: dosya.base64, mediaType: dosya.mediaType,
          urunler: urunler.map(u => ({ id: u.id, ad: u.urun_adi, birim: u.birim })) }),
      });
      const { veri, hata } = await jsonCevap(res);
      if (hata) { setTaramaMesaj({ tip: "hata", metin: hata }); return; }
      const v = veri as { tedarikci?: string; belge_no?: string; tarih?: string; belirsiz?: string[];
        kalemler?: { urun_adi?: string; urun_id?: string | null; miktar?: number; birim?: string; birim_fiyat?: number | null }[] };
      if (v.tedarikci) setTedarikci(v.tedarikci);
      if (v.belge_no) setBelgeNo(v.belge_no);
      if (v.tarih) setBelgeTarihi(v.tarih);
      const yeni = (v.kalemler || []).filter(k => k.urun_adi || k.miktar).map(k => ({
        ...bosSatir(), urun_id: k.urun_id || "", urun_adi_ham: k.urun_adi || "",
        miktar: k.miktar ? String(k.miktar).replace(".", ",") : "", birim: k.birim || "",
        fiyat: k.birim_fiyat ? String(k.birim_fiyat).replace(".", ",") : "",
      }));
      if (yeni.length) setSatirlar(yeni);
      const eslesmeyen = yeni.filter(s => !s.urun_id).length;
      const notlar = [
        eslesmeyen ? `${eslesmeyen} kalem stok ürünleriyle eşleşmedi — listeden seçin.` : "",
        v.belirsiz?.length ? `Emin olunamayanlar: ${v.belirsiz.join(", ")}` : "",
      ].filter(Boolean).join(" ");
      setTaramaMesaj(notlar ? { tip: "uyari", metin: notlar } : null);
    } catch (e) {
      setTaramaMesaj({ tip: "hata", metin: e instanceof Error ? e.message : "Okunamadı." });
    } finally {
      setTaraniyor(false);
      if (dosyaRef.current) dosyaRef.current.value = "";
    }
  };

  const kaydet = async () => {
    const gecerli = satirlar.filter(s => s.urun_id && miktarOku(s.miktar) > 0);
    if (!gecerli.length) { alert("En az bir kalem için ürün ve miktar girin."); return; }
    const eslesmeyen = satirlar.filter(s => (s.urun_adi_ham || s.miktar) && !s.urun_id).length;
    if (eslesmeyen && !confirm(`${eslesmeyen} kalem bir stok ürünüyle eşleştirilmedi ve kaydedilmeyecek. Devam edilsin mi?`)) return;
    setKaydediliyor(true);
    const belgeId = crypto.randomUUID();
    const kayitlar = gecerli.map(s => {
      const miktar = miktarOku(s.miktar), fiyat = miktarOku(s.fiyat);
      const u = urunMap.get(s.urun_id)!;
      return {
        belge_id: belgeId, fatura_no: belgeNo.trim() || null, fatura_tarihi: belgeTarihi || null,
        tedarikci: tedarikci.trim() || null, beklenen_tarih: beklenen || null,
        urun_adi_ham: s.urun_adi_ham || u.urun_adi, urun_id: s.urun_id, miktar, birim: u.birim,
        birim_fiyat: fiyat > 0 ? fiyat : null, toplam_tutar: fiyat > 0 ? fiyat * miktar : null,
        durum: "bekliyor", eslesme_durumu: "eslesti", yukleyen: kullanici,
      };
    });
    const { error } = await supabase.from("stok_fatura_kalemleri").insert(kayitlar);
    setKaydediliyor(false);
    if (error) { alert("Kaydedilemedi: " + error.message); return; }
    setFormAcik(false);
    onDegisti();
  };

  const teslimAc = (belgeId: string) => {
    const b = belgeler.find(x => x.id === belgeId); if (!b) return;
    setTeslimMiktarlar(Object.fromEntries(b.kalemler.map(k => [k.id, String(k.miktar).replace(".", ",")])));
    setTeslimTarihi(bugun()); setTeslimBelge(belgeId);
  };

  const teslimAl = async () => {
    const b = belgeler.find(x => x.id === teslimBelge); if (!b) return;
    const kalemler = b.kalemler.map(k => ({ id: k.id, gelen: Math.max(miktarOku(teslimMiktarlar[k.id] || "0") || 0, 0) }));
    setKaydediliyor(true);
    const { error } = await supabase.rpc("irsaliye_teslim_al", { p_kalemler: kalemler, p_tarih: teslimTarihi });
    setKaydediliyor(false);
    if (error) { alert("Teslim alınamadı: " + error.message); return; }
    setTeslimBelge(null);
    onDegisti();
  };

  const iptal = async (belgeId: string) => {
    if (!confirm("Bu irsaliyedeki bekleyen kalemler iptal edilsin mi? (Stok değişmez)")) return;
    const ids = belgeler.find(x => x.id === belgeId)?.kalemler.map(k => k.id) || [];
    const { error } = await supabase.from("stok_fatura_kalemleri").update({ durum: "iptal" }).in("id", ids);
    if (error) { alert("Hata: " + error.message); return; }
    onDegisti();
  };

  const teslimBelgesi = belgeler.find(x => x.id === teslimBelge);

  return (
    <div className="rounded-2xl border border-[#e2e5eb] bg-[#ffffff] p-4">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="text-xs font-black text-gray-700 uppercase tracking-widest flex items-center gap-2">
          <Truck size={13} className="text-amber-600"/> Yoldaki Mal (irsaliye girilmiş)
        </h2>
        <button onClick={formuAc} className="flex items-center gap-1.5 text-[11px] font-bold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-xl">
          <FileText size={12}/> İrsaliye Ekle
        </button>
      </div>
      {belgeler.length === 0 ? (
        <p className="text-xs text-gray-600">Bekleyen irsaliye yok. Sipariş verdiğin malın irsaliyesi gelince buradan ekle; sipariş önerisi yoldaki malı hesaba katar.</p>
      ) : (
        <div className="space-y-2">
          {belgeler.map(b => {
            const gecikti = b.ilk.beklenen_tarih && b.ilk.beklenen_tarih < bugun();
            return (
              <div key={b.id} className={`rounded-xl border p-3 ${gecikti ? "border-red-500/25 bg-red-500/5" : "border-[#e2e5eb] bg-[#f7f8fa]"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs">
                    <span className="font-bold text-[#1a1f2e]">{b.ilk.tedarikci || "Tedarikçi belirtilmedi"}</span>
                    {b.ilk.fatura_no && <span className="text-gray-500"> · No {b.ilk.fatura_no}</span>}
                    <span className={`ml-2 text-[11px] ${gecikti ? "text-red-600 font-semibold" : "text-gray-500"}`}>
                      {b.ilk.beklenen_tarih ? `Beklenen: ${fmtTarih(b.ilk.beklenen_tarih)}${gecikti ? " (gecikti)" : ""}` : "Tarih yok"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => teslimAc(b.id)} className="flex items-center gap-1 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg">
                      <PackageCheck size={12}/> Teslim Al
                    </button>
                    <button onClick={() => iptal(b.id)} title="İptal" className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 size={13}/></button>
                  </div>
                </div>
                <p className="text-[11px] text-gray-600 mt-1.5">
                  {b.kalemler.map(k => `${urunMap.get(k.urun_id || "")?.urun_adi || k.urun_adi_ham}: ${fmt(k.miktar)} ${k.birim || ""}`).join(" · ")}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* ── İRSALİYE EKLE ── */}
      {formAcik && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#ffffff] border border-amber-500/20 rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-[#e2e5eb] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1a1f2e] flex items-center gap-2"><FileText size={14} className="text-amber-600"/> İrsaliye / Gelecek Mal</h3>
              <button onClick={() => setFormAcik(false)} className="p-1 text-gray-600"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto">
              <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <p className="text-xs text-indigo-800">İrsaliyenin fotoğrafını ya da PDF&apos;ini yükle; kalemleri okuyup ürünlerinle eşleştireyim. Sonra kontrol edip kaydet.</p>
                <input ref={dosyaRef} type="file" accept="image/*,application/pdf" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) tara(f); }}/>
                <button type="button" disabled={taraniyor} onClick={() => dosyaRef.current?.click()}
                  className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 px-3.5 py-2 rounded-xl">
                  {taraniyor ? <><Loader2 size={13} className="animate-spin"/> Okunuyor...</> : <><Camera size={13}/> Tara</>}
                </button>
              </div>
              {taramaMesaj && (
                <div className={`rounded-xl border px-3 py-2 text-xs flex items-center gap-2 ${taramaMesaj.tip === "hata" ? "border-red-500/30 bg-red-500/5 text-red-700" : "border-amber-500/30 bg-amber-500/5 text-amber-800"}`}>
                  <AlertTriangle size={13} className="shrink-0"/> {taramaMesaj.metin}
                </div>
              )}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                <div><label className="block text-[10px] text-gray-600 uppercase mb-1">Tedarikçi</label><input value={tedarikci} onChange={e => setTedarikci(e.target.value)} className={inputCls}/></div>
                <div><label className="block text-[10px] text-gray-600 uppercase mb-1">İrsaliye No</label><input value={belgeNo} onChange={e => setBelgeNo(e.target.value)} className={inputCls}/></div>
                <div><label className="block text-[10px] text-gray-600 uppercase mb-1">Belge Tarihi</label><input type="date" value={belgeTarihi} onChange={e => setBelgeTarihi(e.target.value)} className={inputCls}/></div>
                <div><label className="block text-[10px] text-gray-600 uppercase mb-1">Beklenen Teslim</label><input type="date" value={beklenen} onChange={e => setBeklenen(e.target.value)} className={inputCls}/></div>
              </div>
              <div className="space-y-2">
                <div className="hidden sm:grid grid-cols-12 gap-2 text-[10px] text-gray-600 uppercase px-1">
                  <span className="col-span-5">Stok ürünü</span><span className="col-span-3">Miktar</span><span className="col-span-3">Birim fiyat (₺)</span><span/>
                </div>
                {satirlar.map(s => {
                  const u = urunMap.get(s.urun_id);
                  return (
                    <div key={s.anahtar} className={`grid grid-cols-12 gap-2 items-center rounded-xl p-1 ${!s.urun_id && (s.urun_adi_ham || s.miktar) ? "bg-amber-500/5" : ""}`}>
                      <div className="col-span-12 sm:col-span-5">
                        <select value={s.urun_id} onChange={e => satirDegistir(s.anahtar, { urun_id: e.target.value })} className={inputCls}>
                          <option value="">{s.urun_adi_ham ? `Eşleştir: "${s.urun_adi_ham}"` : "Ürün seçin..."}</option>
                          {urunler.map(x => <option key={x.id} value={x.id}>{x.urun_adi} ({x.birim})</option>)}
                        </select>
                        {s.urun_adi_ham && s.urun_id && <p className="text-[10px] text-gray-500 mt-0.5 px-1">Belgede: {s.urun_adi_ham}{s.birim && u && s.birim !== u.birim ? ` · belge birimi ${s.birim}, ürün birimi ${u.birim} — kontrol edin` : ""}</p>}
                      </div>
                      <div className="col-span-5 sm:col-span-3 relative">
                        <input type="text" inputMode="decimal" value={s.miktar} onChange={e => satirDegistir(s.anahtar, { miktar: e.target.value })} className={inputCls}/>
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-500">{u?.birim || ""}</span>
                      </div>
                      <div className="col-span-5 sm:col-span-3">
                        <input type="text" inputMode="decimal" value={s.fiyat} placeholder={u?.son_fiyat ? `son: ${fmt(u.son_fiyat, 2)}` : ""} onChange={e => satirDegistir(s.anahtar, { fiyat: e.target.value })} className={inputCls}/>
                      </div>
                      <button type="button" onClick={() => setSatirlar(x => x.length > 1 ? x.filter(y => y.anahtar !== s.anahtar) : [bosSatir()])} className="col-span-2 sm:col-span-1 text-gray-400 hover:text-red-600 flex justify-center"><Trash2 size={13}/></button>
                    </div>
                  );
                })}
                <button type="button" onClick={() => setSatirlar(x => [...x, bosSatir()])} className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 px-1"><Plus size={12}/> Kalem ekle</button>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-[#e2e5eb] flex justify-end gap-2">
              <button onClick={() => setFormAcik(false)} className="text-xs font-semibold text-gray-500 border border-[#e2e5eb] px-4 py-2 rounded-xl">İptal</button>
              <button onClick={kaydet} disabled={kaydediliyor} className="text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-40 px-6 py-2 rounded-xl flex items-center gap-2">
                {kaydediliyor ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Yolda olarak kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TESLİM AL ── */}
      {teslimBelgesi && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#ffffff] border border-emerald-500/20 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-[#e2e5eb] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1a1f2e] flex items-center gap-2"><PackageCheck size={14} className="text-emerald-600"/> Teslim Al · {teslimBelgesi.ilk.tedarikci || "İrsaliye"}</h3>
              <button onClick={() => setTeslimBelge(null)} className="p-1 text-gray-600"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto">
              <p className="text-[11px] text-gray-500">Gelen miktarları kontrol et; eksik geldiyse düzelt, hiç gelmediyse 0 yaz. Onaylayınca stok girişi yapılır.</p>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase mb-1">Teslim tarihi</label>
                <input type="date" value={teslimTarihi} max={bugun()} onChange={e => setTeslimTarihi(e.target.value)} className={inputCls}/>
              </div>
              {teslimBelgesi.kalemler.map(k => {
                const u = urunMap.get(k.urun_id || "");
                const gelen = miktarOku(teslimMiktarlar[k.id] || "");
                const fark = !isNaN(gelen) ? gelen - Number(k.miktar) : 0;
                return (
                  <div key={k.id} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-6 text-xs">
                      <p className="font-semibold text-[#1a1f2e]">{u?.urun_adi || k.urun_adi_ham}</p>
                      <p className="text-[10px] text-gray-500">İrsaliyede: {fmt(k.miktar)} {k.birim || u?.birim}</p>
                    </div>
                    <input type="text" inputMode="decimal" value={teslimMiktarlar[k.id] || ""} onChange={e => setTeslimMiktarlar(m => ({ ...m, [k.id]: e.target.value }))} className={`${inputCls} col-span-4`}/>
                    <span className={`col-span-2 text-[10px] font-semibold ${fark < 0 ? "text-red-600" : fark > 0 ? "text-amber-700" : "text-emerald-600"}`}>
                      {fark === 0 ? "tam" : fark < 0 ? `${fmt(-fark)} eksik` : `${fmt(fark)} fazla`}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-4 border-t border-[#e2e5eb] flex justify-end gap-2">
              <button onClick={() => setTeslimBelge(null)} className="text-xs font-semibold text-gray-500 border border-[#e2e5eb] px-4 py-2 rounded-xl">Vazgeç</button>
              <button onClick={teslimAl} disabled={kaydediliyor} className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 px-6 py-2 rounded-xl flex items-center gap-2">
                {kaydediliyor ? <Loader2 size={12} className="animate-spin"/> : <PackageCheck size={12}/>} Teslim Al ve Stoğa Ekle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
