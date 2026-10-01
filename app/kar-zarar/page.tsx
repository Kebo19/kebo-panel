"use client";

// ─── AYLIK KÂR / ZARAR ──────────────────────────────────────────────────────
// Hesap mantığı lib/karZarar.ts'de (karZararHesapla). Bu sayfa sadece veriyi
// çeker ve gösterir. Kâr / Zarar (kar_zarar) yetkisi ister.

import SayfaSimgesi from "@/components/kabuk/SayfaSimgesi";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useYetki } from "@/lib/useYetki";
import { fmt, fmtK } from "@/lib/para";
import { bugun, aySonu } from "@/lib/tarih";
import { hepsiniCek } from "@/lib/hepsiniCek";
import type { RaporVerisi } from "@/lib/hesap";
import {
  karZararHesapla, sonAylar, ayEtiketi, AY_ADLARI,
  type KarZararSonuc, type KasaIslemiKZ, type FaturaKZ, type CariOdemeKZ,
} from "@/lib/karZarar";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { Scale, AlertTriangle, Loader2, RefreshCw, Lock, ArrowLeftRight } from "lucide-react";

const RENK = { ciro: "#3B82F6", gider: "#F97316", kar: "#059669" };

const tl = (v: number) => `${v < 0 ? "−" : ""}₺${fmt(Math.abs(v))}`;
const yuzde = (v: number, taban: number) => (taban > 0 ? `%${((v / taban) * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}` : "—");

interface Veri { raporlar: RaporVerisi[]; faturalar: FaturaKZ[]; kasa: KasaIslemiKZ[]; cari: CariOdemeKZ[] | undefined }

function Kalem({ ad, aciklama, tutar, taban, isaret, detay, vurgu, soluk }: {
  ad: string; aciklama?: string; tutar: number; taban: number; isaret?: "+" | "−" | "±";
  detay?: Record<string, number>; vurgu?: boolean; soluk?: boolean;
}) {
  const detaylar = Object.entries(detay || {}).filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]);
  return (
    <div className={`px-4 sm:px-5 py-3 ${vurgu ? "bg-alan" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[13px] ${vurgu ? "font-black text-yazi" : soluk ? "text-gray-500" : "font-semibold text-yazi"}`}>
            {isaret && <span className="inline-block w-4 text-gray-400 font-bold">{isaret}</span>}{ad}
          </p>
          {aciklama && <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{aciklama}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className={`text-[14px] tabular-nums ${vurgu ? "font-black" : "font-bold"} ${soluk ? "text-gray-500" : "text-yazi"}`}>{tl(tutar)}</p>
          <p className="text-[10px] text-gray-500 tabular-nums">{yuzde(tutar, taban)}</p>
        </div>
      </div>
      {detaylar.length > 0 && (
        <div className="mt-1.5 ml-4 space-y-0.5">
          {detaylar.map(([k, v]) => (
            <div key={k} className="flex justify-between text-[11px] text-gray-600">
              <span className="truncate">{k}</span><span className="tabular-nums">{tl(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function KarZararPage() {
  const supabase = createClient();
  const yetki = useYetki();
  const bugunStr = bugun();
  const [ay, setAy] = useState(() => bugunStr.slice(0, 7));
  const [krediGider, setKrediGider] = useState(false);
  const [veri, setVeri] = useState<Veri | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState("");

  const aylar6 = useMemo(() => sonAylar(ay, 6), [ay]);
  const secenekler = useMemo(() => sonAylar(bugunStr.slice(0, 7), 24).reverse(), [bugunStr]);

  const yukle = useCallback(async () => {
    setYukleniyor(true); setHata("");
    const bas = `${aylar6[0]}-01`;
    const bit = aySonu(ay.slice(0, 4), ay.slice(5, 7));
    // 6 aylık veri 1000 satırı aşabilir → sayfa sayfa çek (id ile kararlı sıralama)
    const guvenli = <T,>(p: Promise<T[]>) => p.then(
      data => ({ data, error: null as string | null }),
      (e: unknown) => ({ data: [] as T[], error: e instanceof Error ? e.message : String(e) }),
    );
    const [r, f, k, c] = await Promise.all([
      guvenli(hepsiniCek<RaporVerisi>((a, b) => supabase.from("gunluk_raporlar").select("*").gte("tarih", bas).lte("tarih", bit).order("tarih").order("id").range(a, b))),
      guvenli(hepsiniCek<FaturaKZ>((a, b) => supabase.from("faturalar").select("fatura_tarihi,toplam_tutar").gte("fatura_tarihi", bas).lte("fatura_tarihi", bit).order("fatura_tarihi").order("id").range(a, b))),
      guvenli(hepsiniCek<KasaIslemiKZ>((a, b) => supabase.from("kasa_manuel_islemler").select("tip,kategori,tutar,islem_tarihi,kaynak").gte("islem_tarihi", bas).lte("islem_tarihi", bit).order("islem_tarihi").order("id").range(a, b))),
      guvenli(hepsiniCek<CariOdemeKZ>((a, b) => supabase.from("cari_odemeler").select("tarih,tutar,rapor_id").gte("tarih", bas).lte("tarih", bit).order("tarih").order("id").range(a, b))),
    ]);
    const ilkHata = [r, f, k].find(x => x.error)?.error;
    if (ilkHata) setHata(ilkHata);
    setVeri({
      raporlar: r.data,
      faturalar: f.data,
      kasa: k.data,
      cari: c.error ? undefined : c.data, // okunamazsa kasa kayıtlarından hesaplanır
    });
    setYukleniyor(false);
  }, [supabase, ay, aylar6]);

  const karZararIzni = yetki.izin("kar_zarar");
  useEffect(() => { if (karZararIzni) yukle(); }, [yukle, karZararIzni]);

  const sonuclar = useMemo<KarZararSonuc[]>(() => {
    if (!veri) return [];
    return aylar6.map(a => karZararHesapla({
      ay: a, raporlar: veri.raporlar, faturalar: veri.faturalar, kasaIslemleri: veri.kasa,
      cariOdemeler: veri.cari, krediTaksidiGider: krediGider, bugun: bugunStr,
    }));
  }, [veri, aylar6, krediGider, bugunStr]);

  const s = sonuclar[sonuclar.length - 1];
  const grafik = sonuclar.map(x => ({
    ay: `${AY_ADLARI[Number(x.ay.slice(5, 7)) - 1].slice(0, 3)} ${x.ay.slice(2, 4)}`,
    "Net ciro": x.netCiro, "Toplam gider": x.toplamGider, "İşletme kârı": x.isletmeKari,
  }));

  if (yetki.yukleniyor) return <div className="min-h-screen bg-zemin flex items-center justify-center"><Loader2 className="animate-spin text-gray-400" /></div>;
  if (!karZararIzni) return (
    <div className="min-h-screen bg-zemin flex flex-col items-center justify-center gap-2 text-gray-600">
      <Lock size={22} /><p className="text-sm">Bu sayfa için Kâr / Zarar yetkisi gerekir.</p>
    </div>
  );

  const ayAdi = ayEtiketi(ay);
  const taban = s?.netCiro || 0;

  return (
    <div className="min-h-screen bg-zemin text-yazi font-sans antialiased">
      {/* ── HEADER ── */}
      <div className="sticky top-0 z-40 border-b border-cizgi bg-zemin/95 backdrop-blur-xl">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <SayfaSimgesi />
            <div>
              <h1 className="text-sm font-black leading-none">Aylık Kâr / Zarar</h1>
              <p className="text-[10px] text-gray-600 mt-0.5 leading-none">Ciro · giderler · işletme kârı</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-[12px] font-semibold text-gray-700 bg-kart border border-cizgi px-3 py-2 rounded-xl cursor-pointer select-none">
              <input type="checkbox" checked={krediGider} onChange={e => setKrediGider(e.target.checked)} />
              Kredi taksidini gider say
            </label>
            <select value={ay} onChange={e => setAy(e.target.value)} className="bg-kart border border-cizgi text-[12px] font-bold px-3 py-2 rounded-xl outline-none">
              {secenekler.map(a => <option key={a} value={a}>{ayEtiketi(a)}</option>)}
            </select>
            <button onClick={yukle} title="Yenile" className="p-2 text-gray-600 border border-cizgi bg-kart rounded-xl"><RefreshCw size={14} /></button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-5 space-y-5">
        {hata && <p className="text-[12px] text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">Veri okunamadı: {hata}</p>}

        {yukleniyor || !s ? (
          <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-gray-400" /></div>
        ) : (
          <>
            {s.eksikGun > 0 && (
              <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/25 px-4 py-3 text-[12px] text-amber-100">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                <p><b>{AY_ADLARI[Number(ay.slice(5, 7)) - 1]}: {s.eksikGun} gün rapor eksik</b> — ciro eksik olduğu için kâr olduğundan düşük görünür. ({s.raporGunSayisi} gün rapor girildi.)</p>
              </div>
            )}

            {/* ── ÖZET ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-1 bg-kart border border-cizgi rounded-2xl p-5">
                <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold">{ayAdi} · İşletme kârı</p>
                <p className={`text-4xl font-black tracking-tight mt-2 tabular-nums ${s.isletmeKari >= 0 ? "text-emerald-300" : "text-red-300"}`}>{tl(s.isletmeKari)}</p>
                <p className="text-[13px] text-gray-600 mt-1">Kâr marjı <b className="text-yazi">%{s.karMarji.toLocaleString("tr-TR")}</b> <span className="text-gray-500">(net ciroya göre)</span></p>
                <div className="mt-4 pt-4 border-t border-cizgi grid grid-cols-2 gap-3">
                  <div><p className="text-[10px] text-gray-500 uppercase tracking-widest">Net ciro</p><p className="text-[15px] font-black tabular-nums">{tl(s.netCiro)}</p></div>
                  <div><p className="text-[10px] text-gray-500 uppercase tracking-widest">Toplam gider</p><p className="text-[15px] font-black tabular-nums">{tl(s.toplamGider)}</p></div>
                </div>
              </div>

              <div className="lg:col-span-2 bg-kart border border-cizgi rounded-2xl p-5">
                <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mb-3">Son 6 ay</p>
                <div className="h-[230px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={grafik} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis dataKey="ay" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} width={48} tickFormatter={v => fmtK(Number(v))} />
                      <Tooltip formatter={(v) => tl(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #e2e5eb" }} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} iconSize={9} />
                      <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
                      <Bar dataKey="Net ciro" fill={RENK.ciro} radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="Toplam gider" fill={RENK.gider} radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Line dataKey="İşletme kârı" stroke={RENK.kar} strokeWidth={2} dot={{ r: 4, fill: RENK.kar, stroke: "#fff", strokeWidth: 2 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
              {/* ── KALEM TABLOSU ── */}
              <div className="lg:col-span-2 bg-kart border border-cizgi rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-cizgi flex justify-between items-center">
                  <p className="text-sm font-semibold text-gray-800">{ayAdi} kâr/zarar tablosu</p>
                  <p className="text-[10px] text-gray-500">tutar · net ciroya oranı</p>
                </div>
                <div className="divide-y divide-cizgi">
                  <Kalem ad="Brüt ciro" tutar={s.brut} taban={taban} aciklama={`${s.raporGunSayisi} günlük rapor: online + kasa (nakit, POS, yemek kartı) + gün içi giderler (+ Roadrunner döneminde kapıda ödeme).`} />
                  <Kalem ad="Kasadan ödenen günlük giderler" isaret="−" tutar={s.gunlukGider} taban={taban} soluk
                    aciklama="Raporlara girilen gün içi nakit giderler (rapordan verilen avanslar ve cari ödemeler dahil). Net cirodan zaten düşülür, aşağıda tekrar düşülmez." />
                  <Kalem ad="Platform indirimleri" isaret="−" tutar={s.indirim} taban={taban} soluk />
                  <Kalem ad="İadeler" isaret="−" tutar={s.iade} taban={taban} soluk />
                  {s.raporCariOdeme !== 0 && (
                    <Kalem ad="Kasadan cari ödeme (mal alışında sayıldı)" isaret="+" tutar={s.raporCariOdeme} taban={taban} soluk
                      aciklama="Günlük rapordan kasadan yapılan tedarikçi ödemeleri gün içi giderlerde düşülmüştü; faturaları mal alışında sayıldığı için çift düşülmesin diye geri eklenir." />
                  )}
                  <Kalem ad="NET CİRO" tutar={s.netCiro} taban={taban} vurgu />

                  <Kalem ad="Mal alışı" isaret="−" tutar={s.malAlisi} taban={taban}
                    aciklama={`Bu ay tarihli ${s.faturaSayisi} tedarikçi faturasının KDV dahil toplamı (ödenip ödenmediğine bakılmaz).`} />
                  <Kalem ad="Personel" isaret="−" tutar={s.personel} taban={taban} detay={s.personelDetay}
                    aciklama="Kasadan/bankadan girilen Personel Maaş, Personel Avans (Personel sayfasından nakit/bankadan verilenler dahil), SGK Primi, İkramiye. Rapordan verilen avanslar gün içi giderlerde zaten düşülür." />
                  <Kalem ad="Kurye (Roadrunner)" isaret="−" tutar={s.kurye} taban={taban}
                    aciklama={`Raporlardaki sabit/havuz kuryelerin ücreti (${s.kuryePaket} paket; sabit kuryede 30 paket garantisi).`} />
                  <Kalem ad="Sabit ve işletme giderleri" isaret="−" tutar={s.sabitIsletme} taban={taban} detay={s.sabitIsletmeDetay}
                    aciklama="Kira, elektrik, doğalgaz, su, internet, muhasebe, market/malzeme ve diğer kasa/banka giderleri." />
                  <Kalem ad="Komisyonlar" isaret="−" tutar={s.komisyon} taban={taban} detay={s.komisyonDetay}
                    aciklama="Banka ve POS komisyonları (kasaya/ekstreden girilenler)." />
                  {krediGider && (
                    <Kalem ad="Kredi taksitleri" isaret="−" tutar={s.krediTaksidi} taban={taban} aciklama="Anahtar açık: kredi taksitleri gider sayılıyor." />
                  )}
                  <Kalem ad="Diğer gelir" isaret="+" tutar={s.digerGelir} taban={taban} detay={s.digerGelirDetay}
                    aciklama="Satış dışı gelirler. POS/platform/yemek kartı tahsilatları (ciroda zaten var), ortak sermaye ve kredi girişleri hariç." />
                  <Kalem ad="Kasa farkı" isaret="±" tutar={s.kasaFarki} taban={taban}
                    aciklama="Nakit kasa sayımlarında çıkan fazla (+) / açık (−). İlk sayım açılışı dahil değil." />
                  <Kalem ad="İŞLETME KÂRI" tutar={s.isletmeKari} taban={taban} vurgu />
                </div>
              </div>

              {/* ── NAKİT AKIŞI ── */}
              <div className="bg-kart border border-cizgi rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-cizgi flex items-center gap-2">
                  <ArrowLeftRight size={14} className="text-gray-500" />
                  <p className="text-sm font-semibold text-gray-800">Nakit akışı <span className="text-[11px] font-normal text-gray-500">(kâr/zarar dışı)</span></p>
                </div>
                <div className="divide-y divide-cizgi text-[13px]">
                  {[
                    { l: "Ortak sermaye girişi", v: s.nakitAkisi.ortakSermaye, a: "Ortakların koyduğu para — gelir değildir." },
                    { l: "Kredi girişi", v: s.nakitAkisi.krediGirisi },
                    { l: "Kredi taksitleri", v: s.nakitAkisi.krediTaksidi, a: krediGider ? "Anahtar açık: kâr/zararda gider olarak da sayıldı." : "Gider sayılması için üstteki anahtarı açın." },
                    { l: "Cari ödemeleri (ödenen)", v: s.nakitAkisi.cariOdeme, a: "Tedarikçilere gerçekten yapılan ödemeler. Faturalar mal alışında sayıldığı için tekrar düşülmez." },
                    { l: "POS / platform / yemek kartı tahsilatı", v: s.nakitAkisi.tahsilat, a: "Satışın bankaya geçmesi (ciroda zaten var)." },
                    { l: "Hesaplar arası transfer", v: s.nakitAkisi.transfer },
                    { l: "Nakit kasa açılış düzeltmesi", v: s.nakitAkisi.kasaAcilis },
                  ].filter(x => x.v !== 0 || x.l.startsWith("Ortak") || x.l.startsWith("Kredi taks") || x.l.startsWith("Cari")).map(x => (
                    <div key={x.l} className="px-5 py-2.5">
                      <div className="flex justify-between gap-3"><span className="text-gray-700">{x.l}</span><span className="font-bold tabular-nums">{tl(x.v)}</span></div>
                      {x.a && <p className="text-[10px] text-gray-500 mt-0.5">{x.a}</p>}
                    </div>
                  ))}
                </div>
                <div className="px-5 py-3 border-t border-cizgi text-[11px] text-gray-500">
                  Giderleri eksiksiz görmek için banka ekstrelerini <Link href="/kasa" className="font-semibold text-blue-400">Kasa → Ekstre yükle</Link> ile aktarın.
                </div>
              </div>
            </div>

            {/* ── SON 6 AY TABLOSU ── */}
            <div className="bg-kart border border-cizgi rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-cizgi"><p className="text-sm font-semibold text-gray-800">Son 6 ay karşılaştırma</p></div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-alan border-b border-cizgi text-[10px] uppercase tracking-widest text-gray-600">
                      <th className="px-4 py-2.5 text-left">Kalem</th>
                      {sonuclar.map(x => <th key={x.ay} className={`px-3 py-2.5 text-right whitespace-nowrap ${x.ay === ay ? "text-yazi" : ""}`}>{ayEtiketi(x.ay)}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cizgi">
                    {([
                      ["Net ciro", (x: KarZararSonuc) => x.netCiro],
                      ["Mal alışı", (x: KarZararSonuc) => x.malAlisi],
                      ["Personel", (x: KarZararSonuc) => x.personel],
                      ["Kurye", (x: KarZararSonuc) => x.kurye],
                      ["Sabit ve işletme", (x: KarZararSonuc) => x.sabitIsletme],
                      ["Komisyonlar", (x: KarZararSonuc) => x.komisyon],
                      ...(krediGider ? [["Kredi taksitleri", (x: KarZararSonuc) => x.krediTaksidi] as const] : []),
                      ["Diğer gelir", (x: KarZararSonuc) => x.digerGelir],
                      ["Kasa farkı", (x: KarZararSonuc) => x.kasaFarki],
                      ["İşletme kârı", (x: KarZararSonuc) => x.isletmeKari],
                      ["Kâr marjı", (x: KarZararSonuc) => x.karMarji],
                      ["Rapor eksik gün", (x: KarZararSonuc) => x.eksikGun],
                    ] as const).map(([ad, f]) => {
                      const kar = ad === "İşletme kârı";
                      return (
                        <tr key={ad} className={kar ? "bg-alan font-black" : ""}>
                          <td className="px-4 py-2.5 whitespace-nowrap text-gray-700">{ad}</td>
                          {sonuclar.map(x => {
                            const v = f(x);
                            const metin = ad === "Kâr marjı" ? `%${v.toLocaleString("tr-TR")}` : ad === "Rapor eksik gün" ? (v ? `${v} gün` : "—") : tl(v);
                            return (
                              <td key={x.ay} className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap ${kar ? (v >= 0 ? "text-emerald-300" : "text-red-300") : ""} ${ad === "Rapor eksik gün" && v ? "text-amber-300" : ""}`}>{metin}</td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
