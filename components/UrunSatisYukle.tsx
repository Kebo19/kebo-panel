"use client";

import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { bugun, gunEkle, fmtTarih } from "@/lib/tarih";
import {
  baslikSatiriBul, kolonTahmin, satislariAyristir, temizAd,
  type KolonEslesme, type TarihSecenegi,
} from "@/lib/recete";
import { FileSpreadsheet, Loader2, Save, X, AlertTriangle, Upload } from "lucide-react";

// ÜRÜN SATIŞ RAPORU YÜKLEME
// Adisyon programından alınan "ürün satış raporu" (Excel ya da CSV) okunur, kolonlar
// eşlenir, önizleme gösterilir ve urun_satislari tablosuna (tarih + ürün adına göre) yazılır.

const inputCls = "w-full bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] text-xs h-9 px-3 rounded-xl outline-none";
const fmt = (v: number, d = 2) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: d }).format(v || 0);

interface Dosya { ad: string; sayfalar: Record<string, unknown[][]>; }

const ALANLAR: { k: keyof KolonEslesme; l: string; zorunlu: boolean }[] = [
  { k: "urun", l: "Ürün adı", zorunlu: true },
  { k: "adet", l: "Adet / Miktar", zorunlu: true },
  { k: "tutar", l: "Tutar", zorunlu: false },
  { k: "tarih", l: "Tarih", zorunlu: false },
];

export default function UrunSatisYukle({ onKaydedildi }: { onKaydedildi?: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dosya, setDosya] = useState<Dosya | null>(null);
  const [sayfa, setSayfa] = useState("");
  const [baslikIdx, setBaslikIdx] = useState(0);
  const [eslesme, setEslesme] = useState<KolonEslesme>({ urun: -1, adet: -1, tutar: -1, tarih: -1 });
  const [tarihModu, setTarihModu] = useState<"tek" | "aralik">("tek");
  const [tekTarih, setTekTarih] = useState(gunEkle(bugun(), -1));
  const [bas, setBas] = useState(gunEkle(bugun(), -7));
  const [bit, setBit] = useState(gunEkle(bugun(), -1));
  const [okunuyor, setOkunuyor] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [mesaj, setMesaj] = useState<string | null>(null);

  const satirlar = useMemo(() => (dosya && sayfa ? dosya.sayfalar[sayfa] || [] : []), [dosya, sayfa]);
  const baslik = useMemo(() => (satirlar[baslikIdx] || []).map((x, i) => temizAd(x) || `Kolon ${i + 1}`), [satirlar, baslikIdx]);

  const sayfaSec = (d: Dosya, ad: string) => {
    setSayfa(ad);
    const s = d.sayfalar[ad] || [];
    const b = baslikSatiriBul(s);
    setBaslikIdx(b);
    setEslesme(kolonTahmin(s[b] || []));
  };

  const dosyaOku = async (f: File) => {
    setOkunuyor(true); setMesaj(null);
    try {
      const csv = /\.(csv|txt)$/i.test(f.name);
      // CSV UTF-8 metin olarak okunur (Türkçe karakterler bozulmasın), sayılar metin kalır.
      const wb = csv
        ? XLSX.read(await f.text(), { type: "string", raw: true })
        : XLSX.read(await f.arrayBuffer(), { type: "array" });
      const sayfalar: Record<string, unknown[][]> = {};
      wb.SheetNames.forEach(n => {
        sayfalar[n] = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: false });
      });
      const ilk = wb.SheetNames.find(n => sayfalar[n].length > 0) || wb.SheetNames[0];
      const d = { ad: f.name, sayfalar };
      setDosya(d);
      if (ilk) sayfaSec(d, ilk);
    } catch (e) {
      setMesaj("Dosya okunamadı: " + (e instanceof Error ? e.message : String(e)));
      setDosya(null);
    } finally {
      setOkunuyor(false);
    }
  };

  const secenek = useMemo<TarihSecenegi>(
    () => (tarihModu === "tek" ? { mod: "tek", tarih: tekTarih } : { mod: "aralik", bas, bit }), [tarihModu, tekTarih, bas, bit]);
  const eslemeTamam = eslesme.urun >= 0 && eslesme.adet >= 0 && eslesme.urun !== eslesme.adet;
  const sonuc = useMemo(
    () => (dosya && eslemeTamam ? satislariAyristir(satirlar, baslikIdx, eslesme, secenek, dosya.ad) : null),
    [dosya, satirlar, baslikIdx, eslesme, eslemeTamam, secenek],
  );

  // Önizleme: ürün başına toplam (aralık bölünmeden önceki hâli)
  const onizleme = useMemo(() => {
    if (!sonuc) return [];
    const m = new Map<string, { ad: string; adet: number; tutar: number; tutarVar: boolean; gun: Set<string> }>();
    sonuc.satirlar.forEach(s => {
      const o = m.get(s.menu_urun) || { ad: s.menu_urun, adet: 0, tutar: 0, tutarVar: false, gun: new Set<string>() };
      o.adet += s.adet; if (s.tutar !== null) { o.tutar += s.tutar; o.tutarVar = true; } o.gun.add(s.tarih);
      m.set(s.menu_urun, o);
    });
    return Array.from(m.values()).sort((a, b) => b.adet - a.adet);
  }, [sonuc]);

  const tarihler = useMemo(() => {
    if (!sonuc?.satirlar.length) return null;
    const t = sonuc.satirlar.map(s => s.tarih).sort();
    return { bas: t[0], bit: t[t.length - 1], gun: new Set(t).size };
  }, [sonuc]);

  const kaydet = async () => {
    if (!sonuc || !sonuc.satirlar.length || !tarihler) return;
    setKaydediliyor(true); setMesaj(null);
    try {
      // Aynı tarih + ürün için var olan kayıt sayısı (üzerine yazılacak)
      const { count } = await supabase.from("urun_satislari").select("id", { count: "exact", head: true })
        .gte("tarih", tarihler.bas).lte("tarih", tarihler.bit);
      const uyari = count
        ? `\n\nDİKKAT: ${fmtTarih(tarihler.bas)} – ${fmtTarih(tarihler.bit)} arasında zaten ${count} satış kaydı var. Aynı tarih ve ürün adındaki kayıtların ÜZERİNE YAZILACAK (diğerleri olduğu gibi kalır).`
        : "";
      if (!confirm(`${sonuc.satirlar.length} kayıt (${onizleme.length} ürün, ${tarihler.gun} gün) kaydedilsin mi?${uyari}`)) return;
      for (let i = 0; i < sonuc.satirlar.length; i += 500) {
        const { error } = await supabase.from("urun_satislari")
          .upsert(sonuc.satirlar.slice(i, i + 500), { onConflict: "tarih,menu_urun" });
        if (error) throw error;
      }
      setMesaj(`${sonuc.satirlar.length} satış kaydı kaydedildi.`);
      setDosya(null); setSayfa("");
      if (inputRef.current) inputRef.current.value = "";
      onKaydedildi?.();
    } catch (e) {
      const m = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
      setMesaj("Kaydedilemedi: " + m);
    } finally {
      setKaydediliyor(false);
    }
  };

  return (
    <div className="bg-[#ffffff] border border-[#e2e5eb] rounded-xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-bold text-[#1a1f2e] flex items-center gap-2"><FileSpreadsheet size={15} className="text-emerald-600"/> Ürün satış raporu yükle</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">Adisyon programının ürün satış raporu (Excel .xlsx/.xls ya da CSV). Aynı ürün birden çok satırda varsa toplanır, “Toplam” satırları atlanır.</p>
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-xl cursor-pointer">
          {okunuyor ? <Loader2 size={14} className="animate-spin"/> : <Upload size={14}/>} Dosya seç
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) dosyaOku(f); }}/>
        </label>
      </div>

      {mesaj && (
        <div className={`text-xs px-3 py-2 rounded-xl border ${mesaj.startsWith("Kaydedilemedi") || mesaj.startsWith("Dosya okunamadı") ? "bg-red-50 border-red-200 text-red-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"}`}>{mesaj}</div>
      )}

      {dosya && (
        <>
          <div className="flex items-center justify-between gap-2 text-xs bg-[#f7f8fa] border border-[#e2e5eb] rounded-xl px-3 py-2">
            <span className="font-semibold truncate">{dosya.ad}</span>
            <button onClick={() => { setDosya(null); if (inputRef.current) inputRef.current.value = ""; }} className="text-gray-500 hover:text-red-600"><X size={14}/></button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Object.keys(dosya.sayfalar).length > 1 && (
              <label className="text-[11px] font-semibold text-gray-600 space-y-1">
                <span>Sayfa</span>
                <select value={sayfa} onChange={e => sayfaSec(dosya, e.target.value)} className={inputCls}>
                  {Object.keys(dosya.sayfalar).map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            )}
            <label className="text-[11px] font-semibold text-gray-600 space-y-1">
              <span>Başlık satırı</span>
              <select value={baslikIdx} onChange={e => { const b = Number(e.target.value); setBaslikIdx(b); setEslesme(kolonTahmin(satirlar[b] || [])); }} className={inputCls}>
                {satirlar.slice(0, 30).map((r, i) => (
                  <option key={i} value={i}>{i + 1}. satır: {r.filter(x => x !== null && x !== "").slice(0, 3).map(temizAd).join(" · ").slice(0, 40)}</option>
                ))}
              </select>
            </label>
            {ALANLAR.map(a => (
              <label key={a.k} className="text-[11px] font-semibold text-gray-600 space-y-1">
                <span>{a.l}{a.zorunlu ? " *" : " (isteğe bağlı)"}</span>
                <select value={eslesme[a.k]} onChange={e => setEslesme({ ...eslesme, [a.k]: Number(e.target.value) })}
                  className={`${inputCls} ${a.zorunlu && eslesme[a.k] < 0 ? "border-red-300" : ""}`}>
                  <option value={-1}>{a.zorunlu ? "— seçin —" : "— yok —"}</option>
                  {baslik.map((b, i) => <option key={i} value={i}>{b}</option>)}
                </select>
              </label>
            ))}
          </div>

          {eslesme.tarih < 0 && (
            <div className="flex flex-wrap items-end gap-3 bg-[#f7f8fa] border border-[#e2e5eb] rounded-xl p-3">
              <div className="text-[11px] font-semibold text-gray-600 space-y-1">
                <span className="block">Dosyada tarih yok — satışlar hangi güne ait?</span>
                <div className="flex rounded-xl border border-[#e2e5eb] overflow-hidden w-fit">
                  {(["tek", "aralik"] as const).map(m => (
                    <button key={m} onClick={() => setTarihModu(m)}
                      className={`px-3 h-9 text-xs font-bold ${tarihModu === m ? "bg-emerald-600 text-white" : "bg-white text-gray-600"}`}>
                      {m === "tek" ? "Tek gün" : "Tarih aralığı"}
                    </button>
                  ))}
                </div>
              </div>
              {tarihModu === "tek" ? (
                <label className="text-[11px] font-semibold text-gray-600 space-y-1">
                  <span className="block">Tarih</span>
                  <input type="date" value={tekTarih} onChange={e => setTekTarih(e.target.value)} className={inputCls}/>
                </label>
              ) : (
                <>
                  <label className="text-[11px] font-semibold text-gray-600 space-y-1">
                    <span className="block">Başlangıç</span>
                    <input type="date" value={bas} onChange={e => setBas(e.target.value)} className={inputCls}/>
                  </label>
                  <label className="text-[11px] font-semibold text-gray-600 space-y-1">
                    <span className="block">Bitiş</span>
                    <input type="date" value={bit} onChange={e => setBit(e.target.value)} className={inputCls}/>
                  </label>
                  <p className="text-[11px] text-gray-500 basis-full">Adet ve tutar aralıktaki günlere eşit bölünerek yazılır (günlük analiz için).</p>
                </>
              )}
            </div>
          )}

          {!eslemeTamam && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-center gap-2">
              <AlertTriangle size={13}/> Ürün adı ve adet kolonlarını (farklı kolonlar) seçin.
            </div>
          )}

          {sonuc && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-600">
                <span><b className="text-[#1a1f2e]">{sonuc.urunSayisi}</b> ürün</span>
                <span>toplam <b className="text-[#1a1f2e]">{fmt(sonuc.toplamAdet)}</b> adet</span>
                {sonuc.toplamTutar > 0 && <span>toplam <b className="text-[#1a1f2e]">₺{fmt(sonuc.toplamTutar)}</b></span>}
                {tarihler && <span>{tarihler.bas === tarihler.bit ? fmtTarih(tarihler.bas) : `${fmtTarih(tarihler.bas)} – ${fmtTarih(tarihler.bit)} (${tarihler.gun} gün)`}</span>}
                <span>{sonuc.satirlar.length} kayıt yazılacak</span>
                {sonuc.atlanan > 0 && <span className="text-amber-700">{sonuc.atlanan} satır atlandı (toplam satırı / boş / okunamayan)</span>}
              </div>
              {sonuc.uyarilar.map((u, i) => <div key={i} className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{u}</div>)}
              {onizleme.length > 0 && (
                <div className="max-h-72 overflow-auto border border-[#e2e5eb] rounded-xl">
                  <table className="w-full text-xs">
                    <thead className="bg-[#f7f8fa] sticky top-0">
                      <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500">
                        <th className="px-3 py-2">Ürün</th><th className="px-3 py-2 text-right">Adet</th>
                        <th className="px-3 py-2 text-right">Tutar</th><th className="px-3 py-2 text-right">Gün</th>
                      </tr>
                    </thead>
                    <tbody>
                      {onizleme.map(o => (
                        <tr key={o.ad} className="border-t border-[#eef0f3]">
                          <td className="px-3 py-1.5">{o.ad}</td>
                          <td className="px-3 py-1.5 text-right font-semibold">{fmt(o.adet)}</td>
                          <td className="px-3 py-1.5 text-right">{o.tutarVar ? `₺${fmt(o.tutar)}` : "—"}</td>
                          <td className="px-3 py-1.5 text-right text-gray-500">{o.gun.size}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-[11px] text-gray-500">Aynı tarih ve ürün adında kayıt varsa üzerine yazılır.</p>
                <button onClick={kaydet} disabled={kaydediliyor || !sonuc.satirlar.length}
                  className="flex items-center gap-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-4 py-2 rounded-xl">
                  {kaydediliyor ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Kaydet
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
