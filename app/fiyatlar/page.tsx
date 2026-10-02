"use client";

// ─── FİYAT LİSTESİ ──────────────────────────────────────────────────────────
// Satın alınan her ürünün son alış fiyatı (Mikro faturalarından): "domatesi ne
// kadara aldım?" sorusunun cevabı. Satıra tıklayınca o ürünün bütün alımları.
// "Mikro'dan güncelle" butonu yeni faturaları aktarır ve stok fiyatlarını günceller.
// Akış ve güvenlik: lib/fiyatListesi.ts. Sadece STOK_DEGER_GORENLER (proxy.ts + RLS).

import SayfaSimgesi from "@/components/kabuk/SayfaSimgesi";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useYetki } from "@/lib/useYetki";
import { sadelestir } from "@/lib/menu";
import { stokDegerGorebilirMi } from "@/lib/stokDeger";
import {
  MIKRO_GELEN_URL, MIKRO_ORIGIN, yerImiKodu, fiyatKalemleri, aramaEslesir, mikroMesajiMi, parcala,
  type FiyatSatiri, type AktarimFaturasi,
} from "@/lib/fiyatListesi";
import {
  Lock, Search, RefreshCw, Loader2, ArrowUpRight, ArrowDownRight, Bookmark, ChevronDown, X, Check, AlertTriangle, Boxes,
} from "lucide-react";

const fmt2 = (v: number) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const fmtF = (v: number) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(v);
const fmtM = (v: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(v);
const tarihYaz = (t: string | null) => (t ? `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}` : "—");

type Siralama = "tarih" | "ad" | "degisim";

interface GecmisSatiri { tarih: string; gib_no: string; miktar: number | string | null; birim: string | null; birim_fiyat: number | string; kdv_orani: number | string; iskonto_orani: number | string | null; tutar: number | string | null }
interface KontrolKalemi { urun_id: string; urun: string; eski: number; yeni: number; oran: number; fatura: string; tarih: string }

type Aktarim =
  | { durum: "yok" }
  | { durum: "bekliyor" }                       // Mikro penceresi açıldı, yer imine tıklanması bekleniyor
  | { durum: "okunuyor"; okunan: number; toplam: number }
  | { durum: "kaydediliyor"; fatura: number }
  | { durum: "bitti"; mesaj: string; kontrol: KontrolKalemi[] }
  | { durum: "hata"; mesaj: string };

export default function FiyatListesiPage() {
  const supabase = useMemo(() => createClient(), []);
  const yetki = useYetki();
  const izinli = stokDegerGorebilirMi(yetki.userId);

  const [satirlar, setSatirlar] = useState<FiyatSatiri[] | null>(null);
  const [hata, setHata] = useState("");
  const [arama, setArama] = useState("");
  const [tedarikci, setTedarikci] = useState("Tümü");
  const [siralama, setSiralama] = useState<Siralama>("tarih");
  const [acik, setAcik] = useState<string | null>(null);
  const [gecmis, setGecmis] = useState<Record<string, GecmisSatiri[] | "yukleniyor">>({});
  const [aktarim, setAktarim] = useState<Aktarim>({ durum: "yok" });
  const [kurulumAcik, setKurulumAcik] = useState(false);
  const pencere = useRef<Window | null>(null);
  /** true → aktarım yılbaşından başlar (eksik kalan eski faturaları tamamlamak için) */
  const tamTarama = useRef(false);
  const yerImi = useRef<HTMLAnchorElement | null>(null);

  const cek = useCallback(async () => {
    const { data, error } = await supabase.rpc("fiyat_listesi");
    if (error) setHata(error.code === "42501" ? "Bu sayfayı görme yetkiniz yok." : "Fiyat listesi yüklenemedi. Sayfayı yenileyin.");
    else { setHata(""); setSatirlar((data ?? []) as FiyatSatiri[]); setGecmis({}); }
  }, [supabase]);

  useEffect(() => { if (izinli) cek(); }, [izinli, cek]);

  // React javascript: adresini href'e yazmaya izin vermiyor; yer imi bağlantısını elle kuruyoruz.
  useEffect(() => {
    if (yerImi.current) yerImi.current.setAttribute("href", yerImiKodu(window.location.origin));
  }, [kurulumAcik, izinli]);

  // ─── Mikro penceresinden gelen mesajlar ───
  useEffect(() => {
    if (!izinli) return;
    const dinle = async (e: MessageEvent) => {
      if (!mikroMesajiMi(e.origin, e.data) || !pencere.current || e.source !== pencere.current) return;
      const m = e.data;
      const cevap = (veri: Record<string, unknown>) => pencere.current?.postMessage({ kaynak: "kebo-panel", ...veri }, MIKRO_ORIGIN);
      if (m.tip === "hazir") {
        const yilbasi = `${new Date().getFullYear()}-01-01`;
        const { data } = tamTarama.current ? { data: yilbasi } : await supabase.rpc("mikro_aktarim_baslangici");
        cevap({ tip: "ayar", baslangic: (data as string | null) ?? yilbasi });
        setAktarim({ durum: "okunuyor", okunan: 0, toplam: 0 });
      } else if (m.tip === "ilerleme") {
        setAktarim({ durum: "okunuyor", okunan: m.okunan, toplam: m.toplam });
      } else if (m.tip === "hata") {
        setAktarim({ durum: "hata", mesaj: m.mesaj });
      } else if (m.tip === "veri") {
        setAktarim({ durum: "kaydediliyor", fatura: m.faturalar.length });
        try {
          let yeni = 0; let son: { mesaj?: string; kontrol?: KontrolKalemi[] } = {};
          const parcalar = parcala<AktarimFaturasi>(m.faturalar, 40);
          if (!parcalar.length) parcalar.push([]); // yeni fatura yoksa da stok fiyatları eşitlensin
          for (const p of parcalar) {
            const { data, error } = await supabase.rpc("mikro_faturalari_kaydet", { p_faturalar: p });
            if (error) throw new Error(error.message);
            const d = data as { fatura: number; mesaj: string; kontrol: KontrolKalemi[] };
            yeni += d.fatura; son = d;
          }
          const mesaj = `${m.faturalar.length} fatura okundu, ${yeni} tanesi yeni. ` + (son.mesaj?.replace(/^\d+ yeni fatura aktarıldı, /, "") ?? "");
          cevap({ tip: "kaydedildi", mesaj });
          setAktarim({ durum: "bitti", mesaj: mesaj + (m.hatali ? ` (${m.hatali} fatura okunamadı)` : ""), kontrol: son.kontrol ?? [] });
          cek();
        } catch (err) {
          const mesaj = err instanceof Error ? err.message : String(err);
          cevap({ tip: "hata", mesaj });
          setAktarim({ durum: "hata", mesaj: `Kaydedilemedi: ${mesaj}` });
        }
      }
    };
    window.addEventListener("message", dinle);
    return () => window.removeEventListener("message", dinle);
  }, [izinli, supabase, cek]);

  const mikroyuAc = (tam = false) => {
    tamTarama.current = tam;
    pencere.current = window.open(MIKRO_GELEN_URL, "kebo-mikro", "width=1200,height=820");
    if (!pencere.current) { setAktarim({ durum: "hata", mesaj: "Tarayıcı açılır pencereyi engelledi. Adres çubuğundaki uyarıdan bu siteye izin verin." }); return; }
    setAktarim({ durum: "bekliyor" });
  };

  const onayla = async (k: KontrolKalemi) => {
    const { error } = await supabase.rpc("stok_fiyat_kontrol_onayla", { p_urun_id: k.urun_id });
    if (error) { setHata(error.message); return; }
    setAktarim(a => a.durum === "bitti" ? { ...a, kontrol: a.kontrol.filter(x => x.urun_id !== k.urun_id) } : a);
  };

  const gecmisAc = async (anahtar: string, ad: string, vkn: string | null) => {
    if (acik === anahtar) { setAcik(null); return; }
    setAcik(anahtar);
    if (gecmis[anahtar]) return;
    setGecmis(g => ({ ...g, [anahtar]: "yukleniyor" }));
    const { data } = await supabase.rpc("fiyat_gecmisi", { p_urun_adi: ad, p_vkn: vkn });
    setGecmis(g => ({ ...g, [anahtar]: (data ?? []) as GecmisSatiri[] }));
  };

  const kalemler = useMemo(() => (satirlar ? fiyatKalemleri(satirlar) : []), [satirlar]);
  const tedarikciler = useMemo(() => {
    const say = new Map<string, number>();
    kalemler.forEach(k => say.set(k.tedarikci, (say.get(k.tedarikci) ?? 0) + 1));
    return ["Tümü", ...[...say.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)];
  }, [kalemler]);
  const gorunen = useMemo(() => {
    const l = kalemler.filter(k => (tedarikci === "Tümü" || k.tedarikci === tedarikci) && aramaEslesir(k, arama, sadelestir));
    if (siralama === "ad") l.sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
    else if (siralama === "degisim") l.sort((a, b) => Math.abs(b.degisim ?? 0) - Math.abs(a.degisim ?? 0));
    else l.sort((a, b) => b.tarih.localeCompare(a.tarih) || a.ad.localeCompare(b.ad, "tr"));
    return l;
  }, [kalemler, tedarikci, arama, siralama]);
  const sonAktarim = useMemo(() => kalemler.reduce((m, k) => (k.tarih > m ? k.tarih : m), ""), [kalemler]);

  if (yetki.yukleniyor) return <div className="min-h-screen bg-zemin" />;
  if (!izinli) return (
    <div className="min-h-screen bg-zemin flex flex-col items-center justify-center gap-2 text-gray-600">
      <Lock size={22} /><p className="text-sm">Bu sayfaya erişiminiz yok.</p>
    </div>
  );

  const calisiyor = aktarim.durum === "bekliyor" || aktarim.durum === "okunuyor" || aktarim.durum === "kaydediliyor";

  return (
    <div className="min-h-screen bg-zemin text-yazi font-sans antialiased">
      {/* ── BAŞLIK ── */}
      <div className="sticky top-0 z-40 border-b border-cizgi bg-zemin/96 backdrop-blur-xl">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-center gap-3">
            <SayfaSimgesi />
            <div>
              <h1 className="text-sm font-black text-yazi leading-none">Fiyat Listesi</h1>
              <p className="text-[10px] text-gray-600 mt-0.5 leading-none">
                Mikro faturalarından son alış fiyatları · {kalemler.length} ürün{sonAktarim ? ` · en yeni fatura ${tarihYaz(sonAktarim)}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/kasa" className="hidden sm:flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-yazi border border-cizgi px-3 py-2 rounded-xl transition-colors">
              <Boxes size={13} /> Stok değeri
            </Link>
            <button onClick={() => mikroyuAc()} disabled={aktarim.durum === "kaydediliyor"}
              className="flex items-center gap-2 text-xs font-bold kebo-btn-altin text-[#1a1408] px-3 py-2 rounded-xl disabled:opacity-60">
              {calisiyor ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Mikro&apos;dan güncelle
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-5 space-y-4">
        {/* ── AKTARIM DURUMU ── */}
        {aktarim.durum !== "yok" && (
          <section className={`kebo-kart p-4 flex items-start gap-3 ${aktarim.durum === "hata" ? "border-red-500/40" : ""}`}>
            <div className="flex-1 min-w-0 text-[13px] space-y-2">
              {aktarim.durum === "bekliyor" && (
                <>
                  <p className="font-semibold">Mikro yeni pencerede açıldı.</p>
                  <p className="text-gray-500">O pencerede, gerekirse giriş yapın; Gelen e-Faturalar sayfası açıkken yer imleri çubuğundaki <b className="text-altin">Kebo&apos;ya aktar</b>&apos;a tıklayın.
                    {" "}Yer imi yoksa <button onClick={() => setKurulumAcik(true)} className="underline text-altin">buradan ekleyin</button>.</p>
                </>
              )}
              {aktarim.durum === "okunuyor" && (
                <>
                  <p className="font-semibold">Mikro&apos;dan faturalar okunuyor… {aktarim.toplam ? `${aktarim.okunan} / ${aktarim.toplam}` : ""}</p>
                  <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="h-full bg-altin transition-all" style={{ width: `${aktarim.toplam ? (aktarim.okunan / aktarim.toplam) * 100 : 3}%` }} />
                  </div>
                </>
              )}
              {aktarim.durum === "kaydediliyor" && <p className="font-semibold">{aktarim.fatura} fatura kaydediliyor ve stok fiyatları güncelleniyor…</p>}
              {aktarim.durum === "hata" && <p className="text-red-300 flex items-start gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{aktarim.mesaj}</p>}
              {aktarim.durum === "bitti" && (
                <>
                  <p className="font-semibold text-emerald-400 flex items-center gap-2"><Check size={14} />{aktarim.mesaj}</p>
                  {aktarim.kontrol.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[12px] text-amber-400">Bu ürünlerin fiyatı %30&apos;dan fazla değişti; birim değişmiş olabilir. Kontrol edip onaylayın:</p>
                      {aktarim.kontrol.map(k => (
                        <div key={k.urun_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] border border-cizgi rounded-xl px-3 py-2">
                          <span className="font-semibold">{k.urun}</span>
                          <span className="tabular-nums text-gray-500">₺{fmtF(Number(k.eski))} → <span className="text-yazi">₺{fmtF(Number(k.yeni))}</span> (%{k.oran})</span>
                          <span className="text-gray-600">{k.fatura} · {tarihYaz(k.tarih)}</span>
                          <button onClick={() => onayla(k)} className="ml-auto text-[11px] font-bold text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded-lg hover:bg-emerald-500/10">Yeni fiyatı kullan</button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            {!calisiyor && <button onClick={() => setAktarim({ durum: "yok" })} aria-label="Kapat" className="text-gray-600 hover:text-yazi"><X size={14} /></button>}
          </section>
        )}

        {/* ── YER İMİ KURULUMU ── */}
        <section className="kebo-kart">
          <button onClick={() => setKurulumAcik(a => !a)} className="w-full flex items-center gap-2 px-4 py-3 text-[12px] font-semibold text-gray-500 hover:text-yazi">
            <Bookmark size={13} className="text-altin" /> İlk kurulum: &quot;Kebo&apos;ya aktar&quot; yer imi (her tarayıcıda bir kez)
            <ChevronDown size={14} className={`ml-auto transition-transform ${kurulumAcik ? "rotate-180" : ""}`} />
          </button>
          {kurulumAcik && (
            <div className="px-4 pb-4 grid gap-3 md:grid-cols-[auto_1fr] md:items-center text-[12px] text-gray-500">
              <a ref={yerImi} onClick={e => e.preventDefault()} draggable
                className="inline-flex items-center gap-2 kebo-btn-altin text-[#1a1408] font-bold px-3 py-2 rounded-xl cursor-grab select-none justify-self-start">
                <Bookmark size={13} /> Kebo&apos;ya aktar
              </a>
              <ol className="list-decimal pl-5 space-y-0.5">
                <li>Yer imleri çubuğu görünmüyorsa <b>Ctrl+Shift+B</b> ile açın.</li>
                <li>Soldaki altın düğmeyi tutup yer imleri çubuğuna sürükleyip bırakın.</li>
                <li>Bundan sonra: &quot;Mikro&apos;dan güncelle&quot; → açılan Mikro penceresinde bu yer imine tıklayın.</li>
              </ol>
              <p className="md:col-span-2 text-[11px] text-gray-600">
                Normalde son aktarılan faturadan bir hafta öncesine kadar okunur. Eski bir faturanın kalemleri eksikse{" "}
                <button onClick={() => mikroyuAc(true)} className="underline text-gray-500 hover:text-altin">bütün yılı tarayın</button>{" "}
                (birkaç dakika sürer; zaten aktarılmış faturalar değişmez).
              </p>
            </div>
          )}
        </section>

        {/* ── ARAMA ── */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex-1 min-w-[220px] flex items-center gap-2 bg-kart border border-cizgi focus-within:border-altin/50 rounded-xl px-3 h-11">
            <Search size={15} className="text-gray-600" />
            <input id="fiyat-ara" value={arama} onChange={e => setArama(e.target.value)} autoFocus
              placeholder="Ürün ara: domates, kola, eldiven, döner…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-600" />
            {arama && <button onClick={() => setArama("")} aria-label="Aramayı temizle" className="text-gray-600 hover:text-yazi"><X size={14} /></button>}
          </label>
          <select id="fiyat-tedarikci" value={tedarikci} onChange={e => setTedarikci(e.target.value)}
            className="bg-kart border border-cizgi rounded-xl h-11 px-3 text-xs font-semibold text-gray-700 outline-none max-w-[220px]">
            {tedarikciler.map(t => <option key={t} value={t} className="bg-kart">{t === "Tümü" ? "Bütün tedarikçiler" : t}</option>)}
          </select>
          <select id="fiyat-sirala" value={siralama} onChange={e => setSiralama(e.target.value as Siralama)}
            className="bg-kart border border-cizgi rounded-xl h-11 px-3 text-xs font-semibold text-gray-700 outline-none">
            <option value="tarih" className="bg-kart">En son alınan</option>
            <option value="ad" className="bg-kart">Ada göre</option>
            <option value="degisim" className="bg-kart">En çok fiyatı değişen</option>
          </select>
        </div>

        {hata && <p className="text-[12px] text-red-300">{hata}</p>}

        {/* ── LİSTE ── */}
        <section className="kebo-kart overflow-hidden">
          {satirlar === null ? (
            <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-gray-600" /></div>
          ) : kalemler.length === 0 ? (
            <div className="py-14 px-6 text-center text-[13px] text-gray-500 space-y-1">
              <p className="font-semibold text-yazi">Henüz fatura aktarılmadı.</p>
              <p>&quot;Mikro&apos;dan güncelle&quot;ye basın; ilk aktarımda bu yılın bütün faturaları okunur.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[760px]">
                <thead>
                  <tr className="text-[10px] text-gray-500 uppercase tracking-wider border-b border-cizgi">
                    <th className="text-left font-semibold px-4 py-2.5">Ürün</th>
                    <th className="text-right font-semibold px-3 py-2.5">Son fiyat <span className="normal-case tracking-normal">(KDV hariç)</span></th>
                    <th className="text-right font-semibold px-3 py-2.5">Önceki alım</th>
                    <th className="text-right font-semibold px-3 py-2.5">En düşük – en yüksek</th>
                    <th className="text-left font-semibold px-3 py-2.5">Son alış</th>
                    <th className="text-right font-semibold px-4 py-2.5">Alım</th>
                  </tr>
                </thead>
                <tbody>
                  {gorunen.slice(0, 400).map(k => {
                    const g = gecmis[k.anahtar];
                    return (
                      <Fragment key={k.anahtar}>
                        <tr onClick={() => gecmisAc(k.anahtar, k.ad, k.vkn)}
                          className={`border-b border-cizgi/60 align-top cursor-pointer hover:bg-white/[0.02] ${acik === k.anahtar ? "bg-white/[0.03]" : ""}`}>
                          <td className="px-4 py-2.5">
                            <span className="font-semibold">{k.ad}</span>
                            <span className="block text-[10px] text-gray-500">{k.tedarikci}{k.birim ? ` · ${k.birim}` : ""}</span>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                            <span className="font-bold text-[13px]">₺{fmtF(k.fiyat)}</span>
                            <span className="block text-[10px] text-gray-500">KDV dahil ₺{fmt2(k.fiyatKdvli)} · %{fmtM(k.kdv)}</span>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                            {k.onceki === null ? <span className="text-gray-600">—</span> : (
                              <>
                                <span className="text-gray-500">₺{fmtF(k.onceki)}</span>
                                {k.degisim !== null && Math.abs(k.degisim) >= 0.05 && (
                                  <span className={`ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${k.degisim > 0 ? "bg-red-500/10 text-red-300" : "bg-emerald-500/10 text-emerald-400"}`}>
                                    {k.degisim > 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}%{fmtM(Math.abs(k.degisim))}
                                  </span>
                                )}
                                <span className="block text-[10px] text-gray-600">{tarihYaz(k.oncekiTarih)}</span>
                              </>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-gray-500 whitespace-nowrap">₺{fmtF(k.enDusuk)} – ₺{fmtF(k.enYuksek)}</td>
                          <td className="px-3 py-2.5 tabular-nums text-gray-500 whitespace-nowrap">{tarihYaz(k.tarih)}<span className="block text-[10px] text-gray-600">{k.fatura}</span></td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{k.alim}×</td>
                        </tr>
                        {acik === k.anahtar && (
                          <tr className="border-b border-cizgi/60 bg-white/[0.015]">
                            <td colSpan={6} className="px-4 py-3">
                              {g === undefined || g === "yukleniyor" ? <Loader2 size={14} className="animate-spin text-gray-600" /> : (
                                <div className="grid gap-1 text-[11px] max-w-2xl">
                                  <div className="grid grid-cols-[90px_1fr_110px_110px_110px] gap-3 text-[10px] uppercase tracking-wider text-gray-600">
                                    <span>Tarih</span><span>Fatura</span><span className="text-right">Miktar</span><span className="text-right">Birim fiyat</span><span className="text-right">Tutar</span>
                                  </div>
                                  {g.map((s, i) => (
                                    <div key={`${s.gib_no}-${i}`} className="grid grid-cols-[90px_1fr_110px_110px_110px] gap-3 tabular-nums">
                                      <span className="text-gray-500">{tarihYaz(s.tarih)}</span>
                                      <span className="text-gray-600 truncate">{s.gib_no}</span>
                                      <span className="text-right">{s.miktar == null ? "—" : `${fmtM(Number(s.miktar))} ${s.birim ?? ""}`}</span>
                                      <span className="text-right font-semibold">₺{fmtF(Number(s.birim_fiyat))}</span>
                                      <span className="text-right text-gray-500">{s.tutar == null ? "—" : `₺${fmt2(Number(s.tutar))}`}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {gorunen.length === 0 && <p className="py-10 text-center text-[13px] text-gray-500">&quot;{arama}&quot; ile eşleşen ürün yok.</p>}
              {gorunen.length > 400 && <p className="py-3 text-center text-[11px] text-gray-600">İlk 400 ürün gösteriliyor; aramayı daraltın.</p>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
