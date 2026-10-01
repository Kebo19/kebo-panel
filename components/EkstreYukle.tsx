"use client";

// Kasa → "Ekstre yükle": banka ekstresini (Excel/CSV) okuyup satırları
// kasa_manuel_islemler'e kaynak='banka_ekstre' olarak ekler. Aynı satır iki kez
// eklenmez (ekstre_ref UNIQUE). Ayrıştırma/tahmin mantığı lib/ekstre.ts'de.

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { useYetki } from "@/lib/useYetki";
import { fmt2 } from "@/lib/para";
import { fmtTarih } from "@/lib/tarih";
import {
  EKSTRE_HESAPLARI, baslikBul, satirlariCoz, kategoriTahmin, ekstreRefleri, csvCoz, eslesmeGecerli, muhtemelEslesmeler,
  type KolonEslesme, type EkstreHesap, type MevcutKasaKaydi,
} from "@/lib/ekstre";
import { hepsiniCek } from "@/lib/hepsiniCek";
import { gunEkle } from "@/lib/tarih";
import { TUM_KASA_GIDER_KATEGORILERI, KASA_GELIR_KATEGORILERI, TRANSFER_KATEGORISI } from "@/lib/karZarar";
import { FileUp, X, Loader2, AlertTriangle, Upload } from "lucide-react";

const inputCls = "w-full bg-alan border border-cizgi text-yazi text-[12px] h-9 px-2 rounded-lg outline-none";
const KOLONLAR: { alan: keyof KolonEslesme; ad: string }[] = [
  { alan: "tarih", ad: "Tarih *" }, { alan: "aciklama", ad: "Açıklama" }, { alan: "tutar", ad: "Tutar (±)" },
  { alan: "borc", ad: "Borç / Çıkış" }, { alan: "alacak", ad: "Alacak / Giriş" },
];
const bosEslesme: KolonEslesme = { tarih: -1, aciklama: -1, tutar: -1, borc: -1, alacak: -1 };

async function dosyaOku(dosya: File): Promise<unknown[][]> {
  const buf = await dosya.arrayBuffer();
  if (/\.(csv|txt)$/i.test(dosya.name)) {
    let metin = new TextDecoder("utf-8").decode(buf);
    if (metin.includes("�")) metin = new TextDecoder("windows-1254").decode(buf); // eski Türkçe Windows kodlaması
    return csvCoz(metin);
  }
  const wb = XLSX.read(buf, { type: "array" });
  // En çok satırı olan sayfa (bazı bankalar ilk sayfaya kapak koyuyor)
  let enIyi: unknown[][] = [];
  for (const ad of wb.SheetNames) {
    const r = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[ad], { header: 1, raw: true, defval: "" });
    if (r.length > enIyi.length) enIyi = r;
  }
  return enIyi;
}

interface Duzeltme { secili?: boolean; kategori?: string }

export default function EkstreYukle({ onKaydedildi }: { onKaydedildi?: () => void }) {
  const supabase = createClient();
  const { kullaniciAdi } = useYetki();
  const [acik, setAcik] = useState(false);
  const [hesap, setHesap] = useState<EkstreHesap>("Enpara");
  const [dosyaAdi, setDosyaAdi] = useState("");
  const [ham, setHam] = useState<unknown[][]>([]);
  const [baslikSatir, setBaslikSatir] = useState(0);
  const [eslesme, setEslesme] = useState<KolonEslesme>(bosEslesme);
  const [duzeltme, setDuzeltme] = useState<Record<number, Duzeltme>>({});
  const [mevcutRefler, setMevcutRefler] = useState<Set<string>>(new Set());
  const [elleKayitlar, setElleKayitlar] = useState<MevcutKasaKaydi[]>([]);
  const [okunuyor, setOkunuyor] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [sonuc, setSonuc] = useState("");
  const dosyaRef = useRef<HTMLInputElement>(null);

  const sifirla = () => {
    setDosyaAdi(""); setHam([]); setBaslikSatir(0); setEslesme(bosEslesme); setDuzeltme({}); setMevcutRefler(new Set()); setElleKayitlar([]); setSonuc("");
    if (dosyaRef.current) dosyaRef.current.value = "";
  };
  const kapat = () => { setAcik(false); sifirla(); };

  const dosyaSecildi = async (dosya?: File) => {
    if (!dosya) return;
    setOkunuyor(true); setSonuc("");
    try {
      const satirlar = await dosyaOku(dosya);
      setHam(satirlar); setDosyaAdi(dosya.name); setDuzeltme({});
      const b = baslikBul(satirlar);
      if (b) { setBaslikSatir(b.satir); setEslesme(b.eslesme); }
      else { setBaslikSatir(0); setEslesme(bosEslesme); }
    } catch (e) {
      alert("Dosya okunamadı: " + (e instanceof Error ? e.message : String(e)));
    } finally { setOkunuyor(false); }
  };

  const basliklar = useMemo(() => {
    const r = ham[baslikSatir] || [];
    const genislik = Math.max(r.length, ...ham.slice(baslikSatir, baslikSatir + 20).map(x => x?.length || 0));
    return Array.from({ length: genislik }, (_, i) => String(r[i] ?? "").trim() || `Kolon ${i + 1}`);
  }, [ham, baslikSatir]);

  const satirlar = useMemo(() => (eslesmeGecerli(eslesme) ? satirlariCoz(ham, baslikSatir, eslesme) : []), [ham, baslikSatir, eslesme]);
  const refler = useMemo(() => ekstreRefleri(hesap, satirlar), [hesap, satirlar]);
  const tahminler = useMemo(() => satirlar.map(s => kategoriTahmin(s.aciklama, s.tutar)), [satirlar]);

  // Daha önce yüklenmiş satırları bul
  useEffect(() => {
    if (!refler.length) { setMevcutRefler(new Set()); return; }
    let iptal = false;
    (async () => {
      const bulunan = new Set<string>();
      for (let i = 0; i < refler.length; i += 100) {
        const { data } = await supabase.from("kasa_manuel_islemler").select("ekstre_ref").in("ekstre_ref", refler.slice(i, i + 100));
        (data || []).forEach(d => d.ekstre_ref && bulunan.add(d.ekstre_ref));
      }
      if (!iptal) setMevcutRefler(bulunan);
    })();
    return () => { iptal = true; };
  }, [refler, supabase]);

  // Elle girilmiş (ekstre dışı) kayıtlar: aynı hareket Kasa'dan ya da cari ödemeden zaten girilmiş olabilir.
  // kaynak='banka_ekstre' kayıtları muhtemelEslesmeler içinde elenir.
  const tarihAraligi = useMemo(() => {
    if (!satirlar.length) return null;
    const t = satirlar.map(s => s.tarih).sort();
    return { bas: gunEkle(t[0], -2), bit: gunEkle(t[t.length - 1], 2) };
  }, [satirlar]);
  useEffect(() => {
    if (!tarihAraligi) { setElleKayitlar([]); return; }
    let iptal = false;
    hepsiniCek<MevcutKasaKaydi>((from, to) => supabase.from("kasa_manuel_islemler")
      .select("id,tip,hesap,hedef_hesap,tutar,islem_tarihi,aciklama,kategori,kaynak")
      .or(`hesap.eq."${hesap}",hedef_hesap.eq."${hesap}"`)
      .gte("islem_tarihi", tarihAraligi.bas).lte("islem_tarihi", tarihAraligi.bit)
      .order("islem_tarihi").order("id").range(from, to))
      .then(k => { if (!iptal) setElleKayitlar(k); })
      .catch(() => { if (!iptal) setElleKayitlar([]); });
    return () => { iptal = true; };
  }, [tarihAraligi, hesap, supabase]);
  const eslesmeler = useMemo(() => muhtemelEslesmeler(hesap, satirlar, elleKayitlar), [hesap, satirlar, elleKayitlar]);

  const satirBilgi = satirlar.map((s, i) => {
    const t = tahminler[i];
    const d = duzeltme[i] || {};
    const mevcut = mevcutRefler.has(refler[i]);
    const kategori = d.kategori ?? t.kategori;
    const eslesen = mevcut ? null : eslesmeler[i];
    return {
      ...s, ref: refler[i], mevcut, kategori, tip: t.tip, eslesen,
      transfer: kategori === TRANSFER_KATEGORISI,
      // Transfer ya da muhtemelen zaten girilmiş satırlar varsayılan işaretsiz
      secili: !mevcut && (d.secili ?? (!t.transfer && !eslesen)),
    };
  });
  const secililer = satirBilgi.filter(s => s.secili);
  const seciliTransfer = secililer.filter(s => s.transfer).length;
  const giris = secililer.filter(s => s.tutar > 0).reduce((t, s) => t + s.tutar, 0);
  const cikis = secililer.filter(s => s.tutar < 0).reduce((t, s) => t - s.tutar, 0);

  const duzelt = (i: number, d: Duzeltme) => setDuzeltme(p => ({ ...p, [i]: { ...p[i], ...d } }));
  const tumunuSec = (secili: boolean) => setDuzeltme(p => {
    const y = { ...p };
    satirBilgi.forEach((s, i) => { if (!s.mevcut) y[i] = { ...y[i], secili: secili && ((!s.transfer && !s.eslesen) || !!p[i]?.secili) }; });
    return y;
  });

  const kaydet = async () => {
    if (!secililer.length) { alert("Kaydedilecek satır seçin."); return; }
    if (seciliTransfer > 0 && !confirm(
      `${seciliTransfer} satır "Hesaplar arası transfer" olarak işaretli. Bunlar gelir/gider olarak kaydedilecek (kâr/zarara girmez, sadece hesap bakiyesini değiştirir). ` +
      `Bu transferi Kasa'da "Transfer" olarak zaten girdiyseniz bakiye iki kez değişir. Devam edilsin mi?`)) return;
    setKaydediliyor(true);
    try {
      const kayitlar = secililer.map(s => ({
        tip: s.tip, hesap, kategori: s.kategori, tutar: Math.abs(s.tutar),
        aciklama: s.aciklama.slice(0, 500), islem_tarihi: s.tarih,
        ekleyen_kullanici: kullaniciAdi || "Bilinmiyor",
        kaynak: "banka_ekstre", ekstre_ref: s.ref,
      }));
      // Kayıttan hemen önce tekrar kontrol (başka sekmede yüklenmiş olabilir).
      // Not: ekstre_ref kısmi (WHERE ekstre_ref IS NOT NULL) unique index olduğu için upsert/onConflict kullanılamıyor.
      const varOlan = new Set<string>();
      for (let i = 0; i < kayitlar.length; i += 100) {
        const { data } = await supabase.from("kasa_manuel_islemler").select("ekstre_ref").in("ekstre_ref", kayitlar.slice(i, i + 100).map(k => k.ekstre_ref));
        (data || []).forEach(d => d.ekstre_ref && varOlan.add(d.ekstre_ref));
      }
      const yeniler = kayitlar.filter(k => !varOlan.has(k.ekstre_ref));
      let eklenen = 0, cakisan = 0, hata = "";
      for (let i = 0; i < yeniler.length && !hata; i += 200) {
        const parca = yeniler.slice(i, i + 200);
        const { error } = await supabase.from("kasa_manuel_islemler").insert(parca);
        if (!error) { eklenen += parca.length; continue; }
        if (error.code !== "23505") { hata = error.message; break; }
        // Aynı anda eklenmiş satır var: tek tek dene, çakışanları atla
        for (const k of parca) {
          const { error: e2 } = await supabase.from("kasa_manuel_islemler").insert([k]);
          if (!e2) eklenen++;
          else if (e2.code === "23505") cakisan++;
          else { hata = e2.message; break; }
        }
      }
      if (hata) alert("Kayıt hatası: " + hata + (eklenen ? ` (${eklenen} satır kaydedildi)` : ""));
      const zatenVar = satirBilgi.filter(s => s.mevcut).length + varOlan.size + cakisan;
      if (eklenen || !hata) setSonuc(`${eklenen} yeni kayıt eklendi${zatenVar ? `, ${zatenVar} zaten vardı` : ""}.`);
      setDuzeltme({});
      if (!hata) setMevcutRefler(new Set([...mevcutRefler, ...kayitlar.map(k => k.ekstre_ref)]));
      onKaydedildi?.();
    } finally { setKaydediliyor(false); }
  };

  return (
    <>
      <button onClick={() => setAcik(true)}
        className="flex items-center gap-2 text-xs font-bold text-yazi bg-kart border border-cizgi-guclu hover:bg-gray-50 px-3 py-2 rounded-xl transition-colors">
        <FileUp size={13} /> <span className="hidden sm:inline">Ekstre yükle</span><span className="sm:hidden">Ekstre</span>
      </button>

      {acik && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-kart border border-cizgi rounded-t-2xl sm:rounded-2xl w-full sm:max-w-5xl max-h-[94vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-cizgi">
              <div>
                <p className="text-sm font-black text-yazi">Banka ekstresi yükle</p>
                <p className="text-[11px] text-gray-500">Excel (.xlsx/.xls) veya CSV. Daha önce yüklenen satırlar tekrar eklenmez.</p>
              </div>
              <button onClick={kapat} className="text-gray-600"><X size={16} /></button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block text-[11px] font-semibold text-gray-600">Hesap
                  <select value={hesap} onChange={e => setHesap(e.target.value as EkstreHesap)} className={`${inputCls} mt-1 h-10`}>
                    {EKSTRE_HESAPLARI.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
                <label className="block text-[11px] font-semibold text-gray-600 sm:col-span-2">Dosya
                  <div className="mt-1 flex items-center gap-2">
                    <input ref={dosyaRef} type="file" accept=".xlsx,.xls,.csv,.txt" onChange={e => dosyaSecildi(e.target.files?.[0])}
                      className="block w-full text-[12px] file:mr-3 file:border-0 file:bg-altin file:text-[#1a1408] file:text-[11px] file:font-bold file:px-3 file:py-2 file:rounded-lg" />
                    {okunuyor && <Loader2 size={16} className="animate-spin text-gray-400" />}
                  </div>
                </label>
              </div>

              {dosyaAdi && (
                <div className="rounded-xl border border-cizgi bg-alan p-3 space-y-2">
                  <p className="text-[11px] text-gray-600">
                    <b>{dosyaAdi}</b> · {ham.length} satır okundu. Kolon eşlemesi yanlışsa düzeltin:
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                    <label className="block text-[10px] font-semibold text-gray-600">Başlık satırı
                      <input type="number" min={1} max={Math.max(1, ham.length)} value={baslikSatir + 1}
                        onChange={e => { setBaslikSatir(Math.max(0, Math.min(ham.length - 1, Number(e.target.value) - 1))); setDuzeltme({}); }}
                        className={`${inputCls} mt-0.5`} />
                    </label>
                    {KOLONLAR.map(k => (
                      <label key={k.alan} className="block text-[10px] font-semibold text-gray-600">{k.ad}
                        <select value={eslesme[k.alan]} onChange={e => { setEslesme({ ...eslesme, [k.alan]: Number(e.target.value) }); setDuzeltme({}); }}
                          className={`${inputCls} mt-0.5`}>
                          <option value={-1}>— yok —</option>
                          {basliklar.map((b, i) => <option key={i} value={i}>{b}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                  {!eslesmeGecerli(eslesme) && (
                    <p className="text-[11px] text-red-400 font-semibold">Tarih kolonu ve tutar (ya da borç/alacak) kolonu seçilmeli.</p>
                  )}
                  <p className="text-[10px] text-gray-500">Borç/Alacak kolonları varsa tutar onlardan hesaplanır (Borç = hesaptan çıkış).</p>
                </div>
              )}

              {satirBilgi.length > 0 && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
                    <p className="text-gray-600">
                      <b>{secililer.length}</b> / {satirBilgi.length} satır seçili
                      {giris > 0 && <> · <span className="text-emerald-300 font-semibold">+₺{fmt2(giris)}</span></>}
                      {cikis > 0 && <> · <span className="text-red-300 font-semibold">−₺{fmt2(cikis)}</span></>}
                      {mevcutRefler.size > 0 && <> · <span className="text-gray-500">{satirBilgi.filter(s => s.mevcut).length} satır zaten kayıtlı</span></>}
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => tumunuSec(true)} className="text-[11px] font-semibold text-blue-300">Tümünü seç</button>
                      <button onClick={() => tumunuSec(false)} className="text-[11px] font-semibold text-gray-500">Hiçbiri</button>
                    </div>
                  </div>
                  {satirBilgi.some(s => s.eslesen) && (
                    <div className="flex gap-2 items-start rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-[11px] text-amber-200">
                      <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                      <p>{satirBilgi.filter(s => s.eslesen).length} satır Kasa&apos;da elle girilmiş bir kayıtla (aynı hesap, aynı yön, ±1 TL, ±2 gün) eşleşiyor; çift sayılmasın diye varsayılan olarak seçilmedi. Farklı bir hareketse işaretleyebilirsiniz.</p>
                    </div>
                  )}
                  {satirBilgi.some(s => s.transfer) && (
                    <div className="flex gap-2 items-start rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-[11px] text-amber-200">
                      <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                      <p>&quot;Hesaplar arası transfer&quot; satırları kendi hesaplarımız arasındaki para hareketi olabilir; varsayılan olarak seçilmedi. Seçerseniz gelir/gider olarak kaydedilir (kâr/zarara girmez).</p>
                    </div>
                  )}
                  <div className="rounded-xl border border-cizgi overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="bg-alan border-b border-cizgi text-[10px] uppercase tracking-widest text-gray-600">
                          <th className="px-2 py-2 w-8" />
                          <th className="px-2 py-2 text-left">Tarih</th>
                          <th className="px-2 py-2 text-left">Açıklama</th>
                          <th className="px-2 py-2 text-right">Tutar</th>
                          <th className="px-2 py-2 text-left">Kategori</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cizgi">
                        {satirBilgi.map((s, i) => (
                          <tr key={s.ref} className={s.mevcut ? "opacity-40" : s.secili ? "" : "bg-alan text-gray-500"}>
                            <td className="px-2 py-1.5 text-center">
                              <input type="checkbox" disabled={s.mevcut} checked={s.secili} onChange={e => duzelt(i, { secili: e.target.checked })} />
                            </td>
                            <td className="px-2 py-1.5 whitespace-nowrap">{fmtTarih(s.tarih)}</td>
                            <td className="px-2 py-1.5 max-w-[320px]">
                              <span className="line-clamp-2 break-words">{s.aciklama || "—"}</span>
                              {s.mevcut && <span className="text-[10px] font-semibold text-gray-600">zaten kayıtlı</span>}
                              {s.eslesen && (
                                <span className="block text-[10px] font-semibold text-amber-300">
                                  Muhtemelen zaten girilmiş: {s.eslesen.aciklama || s.eslesen.kategori || (s.eslesen.tip === "transfer" ? "Transfer" : "Kasa kaydı")}, {fmtTarih(String(s.eslesen.islem_tarihi).slice(0, 10))}
                                </span>
                              )}
                            </td>
                            <td className={`px-2 py-1.5 text-right font-bold whitespace-nowrap ${s.tutar >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                              {s.tutar >= 0 ? "+" : "−"}₺{fmt2(Math.abs(s.tutar))}
                            </td>
                            <td className="px-2 py-1.5 min-w-[170px]">
                              <select value={s.kategori} disabled={s.mevcut} onChange={e => duzelt(i, { kategori: e.target.value })}
                                className={`${inputCls} h-8 ${s.transfer ? "border-amber-400" : ""}`}>
                                <optgroup label={s.tip === "gelir" ? "Gelir" : "Gider"}>
                                  {(s.tip === "gelir" ? KASA_GELIR_KATEGORILERI : TUM_KASA_GIDER_KATEGORILERI).map(k => <option key={k} value={k}>{k}</option>)}
                                </optgroup>
                                <option value={TRANSFER_KATEGORISI}>{TRANSFER_KATEGORISI}</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {dosyaAdi && eslesmeGecerli(eslesme) && satirBilgi.length === 0 && (
                <p className="text-[12px] text-gray-500">Bu eşlemeyle tarih ve tutarı okunabilen satır bulunamadı. Başlık satırını ve kolonları kontrol edin.</p>
              )}
              {sonuc && <p className="text-[13px] font-bold text-emerald-300">✓ {sonuc}</p>}
            </div>

            <div className="px-5 py-3 border-t border-cizgi flex gap-2">
              <button onClick={kapat} className="flex-1 sm:flex-none sm:px-6 text-xs font-semibold text-gray-500 border border-cizgi py-2.5 rounded-xl">Kapat</button>
              <button onClick={kaydet} disabled={kaydediliyor || !secililer.length}
                className="flex-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 py-2.5 rounded-xl flex items-center justify-center gap-2">
                {kaydediliyor ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {secililer.length} satırı {hesap} hesabına kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
