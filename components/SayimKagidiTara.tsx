"use client";

// Sayım kağıdını telefonla tarama: doldurulmuş sayım listesinin fotoğrafı çekilir,
// /api/sayim-tara satırları okur, kullanıcı kontrol edip kaydeder.
//   sabah / akşam → "sayim" hareketi (vakit ile), fire → "cikis" (neden: bozuk)
// Aynı kağıt iki kez kaydedilirse sayımlar sorun çıkarmaz (aynı andaki son sayım geçerli),
// fire iki kez düşmesin diye o gün kağıttan girilmiş fire varsa satır işaretlenir ve atlanır.
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { bugun, fmtTarih } from "@/lib/tarih";
import { miktarOku, type StokHareketi } from "@/lib/stok";
import { grupUrunleri, PERIYOT_ADI, type SayimPeriyodu, type SayimUrunKaydi } from "@/lib/kasaFormu";
import { yuklemeIcinHazirla, jsonCevap } from "@/lib/gorsel";
import { Camera, ImageUp, Loader2, X, AlertTriangle, Printer, Trash2 } from "lucide-react";

const KAYNAK = "kagit";

interface Satir {
  anahtar: number; urun_id: string; yazilan_ad: string | null;
  sabah: string; aksam: string; fire: string; not: string;
}
type Hareket = StokHareketi & { kaynak?: string | null };

const yaz = (v: number | null | undefined) => v == null ? "" : String(v).replace(".", ",");
const inp = "w-full bg-zemin border border-cizgi text-yazi text-xs h-8 px-2 rounded-lg outline-none focus:border-blue-500/50";

export default function SayimKagidiTara({ urunler, hareketler, kullanici, onKapat, onKaydedildi }: {
  urunler: SayimUrunKaydi[];
  hareketler: Hareket[];
  kullanici: string;
  onKapat: () => void;
  onKaydedildi: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [periyot, setPeriyot] = useState<SayimPeriyodu>("gunluk");
  const [tarih, setTarih] = useState(bugun());
  const [satirlar, setSatirlar] = useState<Satir[] | null>(null);
  const [belirsiz, setBelirsiz] = useState<string[]>([]);
  const [genelNot, setGenelNot] = useState<string | null>(null);
  const [sayan, setSayan] = useState<string | null>(null);
  const [taraniyor, setTaraniyor] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const kamera = useRef<HTMLInputElement>(null);
  const galeri = useRef<HTMLInputElement>(null);

  const liste = useMemo(() => grupUrunleri(urunler, periyot), [urunler, periyot]);
  const urunMap = useMemo(() => new Map(urunler.map(u => [u.id, u])), [urunler]);
  const siraliTum = useMemo(() => [...urunler].sort((a, b) => a.urun_adi.localeCompare(b.urun_adi, "tr")), [urunler]);

  // O gün kağıttan girilmiş fire ve mevcut sayımlar (uyarı için)
  const oGun = useMemo(() => {
    const fire = new Set<string>(), sabah = new Set<string>(), aksam = new Set<string>();
    hareketler.filter(h => h.tarih === tarih).forEach(h => {
      if (h.tip === "cikis" && h.kaynak === KAYNAK) fire.add(h.urun_id);
      if (h.tip === "sayim") (h.vakit === "aksam" ? aksam : sabah).add(h.urun_id);
    });
    return { fire, sabah, aksam };
  }, [hareketler, tarih]);

  const tara = async (file: File) => {
    setTaraniyor(true); setHata(null);
    try {
      const dosya = await yuklemeIcinHazirla(file);
      const res = await fetch("/api/sayim-tara", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dosyaBase64: dosya.base64, mediaType: dosya.mediaType, periyot: PERIYOT_ADI[periyot],
          urunler: liste.map(u => ({ id: u.id, no: u.no, ad: u.urun_adi, birim: u.birim })) }),
      });
      const { veri, hata } = await jsonCevap(res);
      if (hata) { setHata(hata); return; }
      const v = veri as { tarih?: string | null; sayan?: string | null; genel_not?: string | null; belirsiz?: string[];
        satirlar?: { urun_id: string | null; yazilan_ad: string | null; sabah: number | null; aksam: number | null; fire: number | null; not: string | null }[] };
      if (v.tarih && v.tarih <= bugun()) setTarih(v.tarih);
      setSayan(v.sayan || null); setGenelNot(v.genel_not || null); setBelirsiz(v.belirsiz || []);
      const okunan = (v.satirlar || []).map((s, i) => ({
        anahtar: i, urun_id: s.urun_id || "", yazilan_ad: s.yazilan_ad,
        sabah: yaz(s.sabah), aksam: yaz(s.aksam), fire: yaz(s.fire), not: s.not || "",
      }));
      if (!okunan.length) setHata("Kağıtta dolu satır bulunamadı. Fotoğrafın net ve tüm tablonun görünür olduğundan emin olun.");
      setSatirlar(okunan);
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e));
    } finally {
      setTaraniyor(false);
      if (kamera.current) kamera.current.value = "";
      if (galeri.current) galeri.current.value = "";
    }
  };

  const degistir = (k: number, alan: Partial<Satir>) => setSatirlar(s => s && s.map(x => x.anahtar === k ? { ...x, ...alan } : x));
  const sil = (k: number) => setSatirlar(s => s && s.filter(x => x.anahtar !== k));

  const gecersiz = (t: string) => t.trim() !== "" && !(miktarOku(t) >= 0);
  const eslesmeyen = (satirlar || []).filter(s => !s.urun_id).length;
  const hataliSayi = (satirlar || []).some(s => gecersiz(s.sabah) || gecersiz(s.aksam) || gecersiz(s.fire));
  const ayniUrun = (() => {
    const g = new Set<string>(); let tekrar = false;
    (satirlar || []).forEach(s => { if (s.urun_id) { if (g.has(s.urun_id)) tekrar = true; g.add(s.urun_id); } });
    return tekrar;
  })();

  const kaydet = async () => {
    if (!satirlar) return;
    const kayitlar: Record<string, unknown>[] = [];
    let atlananFire = 0;
    satirlar.filter(s => s.urun_id).forEach(s => {
      const ek = s.not.trim() ? ` (${s.not.trim()})` : "";
      const ortak = { urun_id: s.urun_id, tarih, kaynak: KAYNAK, kullanici };
      if (s.sabah.trim()) kayitlar.push({ ...ortak, tip: "sayim", vakit: "sabah", miktar: miktarOku(s.sabah), aciklama: "Sayım kağıdı" + ek });
      if (s.aksam.trim()) kayitlar.push({ ...ortak, tip: "sayim", vakit: "aksam", miktar: miktarOku(s.aksam), aciklama: "Sayım kağıdı" + ek });
      const fire = miktarOku(s.fire);
      if (s.fire.trim() && fire > 0) {
        if (oGun.fire.has(s.urun_id)) atlananFire++;
        else kayitlar.push({ ...ortak, tip: "cikis", neden: "bozuk", miktar: fire, aciklama: "Sayım kağıdı (fire)" + ek });
      }
    });
    if (!kayitlar.length) { setHata("Kaydedilecek miktar yok."); return; }
    setKaydediliyor(true); setHata(null);
    try {
      const { error } = await supabase.from("stok_hareketler").insert(kayitlar);
      if (error) { setHata(error.message); return; }
      alert(`${kayitlar.length} kayıt işlendi (${fmtTarih(tarih)}).` + (atlananFire ? `\n${atlananFire} ürünün o günkü firesi zaten kağıttan girilmişti, tekrar düşülmedi.` : ""));
      onKaydedildi();
      onKapat();
    } finally { setKaydediliyor(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-kart border border-blue-500/30 rounded-2xl w-full max-w-3xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="px-4 py-3 border-b border-cizgi flex items-center justify-between bg-alan rounded-t-2xl">
          <div className="flex items-center gap-2"><Camera size={16} className="text-blue-400"/><h3 className="text-sm font-black text-yazi">Sayım Kağıdı Tara</h3></div>
          <button onClick={onKapat} className="p-1 text-gray-600 hover:text-yazi"><X size={16}/></button>
        </div>

        <div className="p-4 border-b border-cizgi space-y-3 bg-alan">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-gray-500">Kağıt
              <select value={periyot} onChange={e => { setPeriyot(e.target.value as SayimPeriyodu); setSatirlar(null); }} className={inp + " mt-1 font-bold"}>
                {(Object.keys(PERIYOT_ADI) as SayimPeriyodu[]).map(p => <option key={p} value={p}>{PERIYOT_ADI[p]} sayım listesi</option>)}
              </select>
            </label>
            <label className="text-[11px] text-gray-500">Sayım tarihi
              <input type="date" value={tarih} max={bugun()} onChange={e => setTarih(e.target.value)} className={inp + " mt-1 font-bold"}/>
            </label>
          </div>
          <input ref={kamera} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => e.target.files?.[0] && tara(e.target.files[0])}/>
          <input ref={galeri} type="file" accept="image/*,application/pdf" className="hidden" onChange={e => e.target.files?.[0] && tara(e.target.files[0])}/>
          <div className="flex flex-wrap gap-2">
            <button disabled={taraniyor} onClick={() => kamera.current?.click()}
              className="flex-1 min-w-[140px] flex items-center justify-center gap-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 h-10 rounded-xl">
              {taraniyor ? <Loader2 size={14} className="animate-spin"/> : <Camera size={14}/>} {taraniyor ? "Okunuyor…" : "Fotoğraf çek"}
            </button>
            <button disabled={taraniyor} onClick={() => galeri.current?.click()}
              className="flex-1 min-w-[140px] flex items-center justify-center gap-2 text-xs font-bold text-blue-300 border border-blue-500/40 hover:bg-blue-500/10 disabled:opacity-50 h-10 rounded-xl">
              <ImageUp size={14}/> Galeriden seç
            </button>
            <Link href="/stok/kagit" className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-yazi px-2"><Printer size={13}/> Boş kağıt yazdır</Link>
          </div>
          <p className="text-[10px] text-gray-600">Kağıdı düz bir yere koyup tüm tablo görünecek şekilde, gölgesiz çekin. Okunan değerler kaydetmeden önce aşağıda düzeltilebilir.</p>
          {hata && <p className="text-xs text-red-400">{hata}</p>}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {!satirlar ? (
            <p className="text-xs text-gray-600 text-center py-8">{liste.length} ürünlük {PERIYOT_ADI[periyot].toLocaleLowerCase("tr-TR")} sayım kağıdının fotoğrafını yükleyin.</p>
          ) : (
            <>
              {(belirsiz.length > 0 || sayan || genelNot) && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] text-amber-200 space-y-1">
                  {sayan && <p>Sayan: <b>{sayan}</b></p>}
                  {genelNot && <p>Kağıttaki not: {genelNot}</p>}
                  {belirsiz.map((b, i) => <p key={i} className="flex gap-1.5"><AlertTriangle size={12} className="shrink-0 mt-0.5"/>{b}</p>)}
                </div>
              )}
              <div className="hidden sm:grid grid-cols-[1fr_76px_76px_64px_28px] gap-1.5 text-[10px] font-bold text-gray-500 px-1">
                <span>Ürün</span><span>Sabah</span><span>Akşam</span><span>Fire</span><span/>
              </div>
              {satirlar.map(s => {
                const u = urunMap.get(s.urun_id);
                const uyarilar = [
                  !s.urun_id && "Ürün seçin",
                  s.sabah.trim() && oGun.sabah.has(s.urun_id) && "o gün sabah sayımı var, bu geçerli olur",
                  s.aksam.trim() && oGun.aksam.has(s.urun_id) && "o gün akşam sayımı var, bu geçerli olur",
                  s.fire.trim() && oGun.fire.has(s.urun_id) && "fire zaten girilmiş, atlanacak",
                ].filter(Boolean);
                return (
                  <div key={s.anahtar} className={`rounded-xl border p-2 ${!s.urun_id ? "border-red-500/40 bg-red-500/5" : "border-cizgi"}`}>
                    <div className="grid grid-cols-[1fr_28px] sm:grid-cols-[1fr_76px_76px_64px_28px] gap-1.5 items-center">
                      <select value={s.urun_id} onChange={e => degistir(s.anahtar, { urun_id: e.target.value })} className={inp + " sm:col-span-1"}>
                        <option value="">{s.yazilan_ad ? `“${s.yazilan_ad}” — ürün seçin` : "Ürün seçin"}</option>
                        {siraliTum.map(x => <option key={x.id} value={x.id}>{x.urun_adi}</option>)}
                      </select>
                      <button onClick={() => sil(s.anahtar)} className="sm:order-last p-1 text-gray-600 hover:text-red-400 justify-self-center"><Trash2 size={13}/></button>
                      <div className="col-span-2 sm:col-span-3 grid grid-cols-3 sm:grid-cols-[76px_76px_64px] gap-1.5">
                        {(["sabah", "aksam", "fire"] as const).map(a => (
                          <input key={a} inputMode="decimal" value={s[a]} placeholder={a === "sabah" ? "Sabah" : a === "aksam" ? "Akşam" : "Fire"}
                            onChange={e => degistir(s.anahtar, { [a]: e.target.value })}
                            className={inp + (gecersiz(s[a]) ? " border-red-500" : "")}/>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-3 text-[10px] text-gray-600 mt-1 px-1">
                      {u && <span>{u.birim}</span>}
                      {s.not && <span>Not: {s.not}</span>}
                      {uyarilar.map((w, i) => <span key={i} className="text-amber-400">{w}</span>)}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {satirlar && satirlar.length > 0 && (
          <div className="p-3 border-t border-cizgi flex items-center justify-between gap-2 bg-alan rounded-b-2xl">
            <span className="text-[11px] text-gray-500">
              {satirlar.length} satır{eslesmeyen ? ` · ${eslesmeyen} eşleşmedi (kaydedilmez)` : ""}{ayniUrun ? " · aynı ürün iki kez var" : ""}
            </span>
            <button onClick={kaydet} disabled={kaydediliyor || hataliSayi}
              className="flex items-center gap-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 px-4 h-10 rounded-xl">
              {kaydediliyor && <Loader2 size={14} className="animate-spin"/>} {fmtTarih(tarih)} sayımını kaydet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
