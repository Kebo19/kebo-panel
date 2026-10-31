"use client";

import SayfaSimgesi from "@/components/kabuk/SayfaSimgesi";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { createClient } from "@/lib/supabase/client";
import { useYetki } from "@/lib/useYetki";
import { bugun, gunEkle, gunFarki, fmtTarih, aySonu } from "@/lib/tarih";
import { fmt as fmtTL } from "@/lib/para";
import { donemOzeti, paketToplam, type RaporVerisi } from "@/lib/hesap";
import { kullanimAnalizi, donemKullanimi, type StokHareketi } from "@/lib/stok";
import {
  normalAd, ortalamaSatisFiyati, teorikTuketim, tuketimKarsilastir,
  foodCostYuzde, sonAylar, ayEtiketi, paketBasi, SUPHE_ESIGI,
} from "@/lib/recete";
import { baglamKur, duzReceteler, stokFiyati, type ReceteSatiriTam, type ReceteUrunu, type StokBilgi } from "@/lib/receteHesap";
import UrunSatisYukle from "@/components/UrunSatisYukle";
import ReceteDuzenleyici, { type MenuOzeti } from "@/components/ReceteDuzenleyici";
import { hepsiniCek } from "@/lib/hepsiniCek";
import {
  ArrowLeft, Loader2, AlertTriangle, RefreshCw, FileSpreadsheet,
  Scale, Percent, BookOpen, Info,
} from "lucide-react";

// REÇETE & MALİYET
// 1) Ürün satış raporu yükleme  2) Reçete düzenleyici (porsiyon maliyeti)
// 3) Teorik (satış × reçete) ve gerçek (sayımlardan) tüketim  4) Food cost % ve paket başı tüketim

interface StokUrun { id: string; urun_adi: string; birim: string; son_fiyat: number | null; durum: string; kategori: string | null; adet_gram: number | null; }
interface FiyatSatiri { urun_id: string; fatura_birim_fiyat: number | null; carpan: number | null; }
const RECETE_ALANLARI = "id,menu_urun,stok_urun_id,ara_recete,malzeme_adi,miktar,birim,etiket,notlar,sira";
const receteOku = (x: ReceteSatiriTam): ReceteSatiriTam => ({ ...x, miktar: Number(x.miktar), sira: Number(x.sira) || 0 });
interface Satis { tarih: string; menu_urun: string; adet: number; tutar: number | null; }
interface Fatura { fatura_tarihi: string; toplam_tutar: number | null; }

type Sekme = "recete" | "tuketim" | "foodcost" | "yukle";

const inputCls = "w-full bg-alan border border-cizgi text-yazi text-xs h-9 px-3 rounded-xl outline-none";
const kutu = "bg-kart border border-cizgi rounded-xl";
const sayi = (v: number, d = 2) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: d }).format(v || 0);
const yuzde = (v: number | null, d = 1) => (v === null ? "—" : `%${sayi(v, d)}`);

export default function ReceteMaliyetPage() {
  const supabase = useMemo(() => createClient(), []);
  const yetki = useYetki();
  const izinli = yetki.izin("recete");
  // Food cost faturaları okur (RLS: cari | kar_zarar | anasayfa) → cari veya kâr/zarar yetkisi ister.
  const foodCostIzni = yetki.izin("cari") || yetki.izin("kar_zarar");

  const [sekme, setSekme] = useState<Sekme>("recete");
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);

  const [urunler, setUrunler] = useState<StokUrun[]>([]);
  const [receteler, setReceteler] = useState<ReceteSatiriTam[]>([]);
  const [receteUrunleri, setReceteUrunleri] = useState<ReceteUrunu[]>([]);
  const [fiyatlar, setFiyatlar] = useState<FiyatSatiri[]>([]);
  const [fiyatGorunur, setFiyatGorunur] = useState(false);
  const [satis90, setSatis90] = useState<Satis[]>([]);
  const [raporlar, setRaporlar] = useState<RaporVerisi[]>([]);
  const [faturalar, setFaturalar] = useState<Fatura[]>([]);
  const [hareketler, setHareketler] = useState<StokHareketi[]>([]);

  const bugunStr = bugun();
  const aylar = useMemo(() => sonAylar(bugunStr, 6), [bugunStr]);
  const altiAyBasi = `${aylar[0]}-01`;

  // Tüketim dönemi (varsayılan: son 30 gün, bugün hariç — bugünün sayımı henüz yok)
  const [bas, setBas] = useState(gunEkle(bugunStr, -30));
  const [bit, setBit] = useState(gunEkle(bugunStr, -1));
  const [satisAralik, setSatisAralik] = useState<Satis[]>([]);
  const hareketBas = gunEkle(bas < altiAyBasi ? bas : altiAyBasi, -60);

  const temelVeri = useCallback(async () => {
    setHata(null);
    try {
      const [u, r, ru, fy, s, rap, fat] = await Promise.all([
        hepsiniCek<StokUrun>((a, b) => supabase.from("stok_urunler").select("id,urun_adi,birim,son_fiyat,durum,kategori,adet_gram").order("urun_adi").order("id").range(a, b)),
        hepsiniCek<ReceteSatiriTam>((a, b) => supabase.from("receteler").select(RECETE_ALANLARI).order("menu_urun").order("sira").order("id").range(a, b)),
        hepsiniCek<ReceteUrunu>((a, b) => supabase.from("recete_urunleri").select("ad,tur,verim_miktar,verim_birim,satis_fiyati,grup,notlar,sira").order("sira").order("ad").range(a, b)),
        // Fiyatlar "Stok değeri" yetkisi ister (RLS); yetki yoksa boş gelir.
        hepsiniCek<FiyatSatiri>((a, b) => supabase.from("stok_fiyatlar").select("urun_id,fatura_birim_fiyat,carpan").order("urun_id").range(a, b)).catch(() => [] as FiyatSatiri[]),
        hepsiniCek<Satis>((a, b) => supabase.from("urun_satislari").select("tarih,menu_urun,adet,tutar").gte("tarih", gunEkle(bugunStr, -90)).order("tarih").order("id").range(a, b)),
        hepsiniCek<RaporVerisi>((a, b) => supabase.from("gunluk_raporlar").select("*").gte("tarih", altiAyBasi).order("tarih").order("id").range(a, b)),
        // Fatura okuma yetkisi yoksa food cost gösterilmez (boş veri 0 diye gösterilmesin)
        foodCostIzni
          ? hepsiniCek<Fatura>((a, b) => supabase.from("faturalar").select("fatura_tarihi,toplam_tutar").gte("fatura_tarihi", altiAyBasi).order("fatura_tarihi").order("id").range(a, b))
          : Promise.resolve([] as Fatura[]),
      ]);
      setUrunler(u.map(x => ({ ...x, adet_gram: x.adet_gram === null ? null : Number(x.adet_gram) })));
      setReceteler(r.map(receteOku));
      setReceteUrunleri(ru.map(x => ({ ...x, verim_miktar: Number(x.verim_miktar) || 1, satis_fiyati: x.satis_fiyati === null ? null : Number(x.satis_fiyati), sira: Number(x.sira) || 0 })));
      setFiyatlar(fy);
      setFiyatGorunur(fy.length > 0 || u.some(x => Number(x.son_fiyat) > 0));
      setSatis90(s.map(x => ({ ...x, adet: Number(x.adet), tutar: x.tutar === null ? null : Number(x.tutar) })));
      setRaporlar(rap); setFaturalar(fat);
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e));
    } finally {
      setYukleniyor(false);
    }
  }, [supabase, bugunStr, altiAyBasi, foodCostIzni]);

  useEffect(() => {
    if (yetki.yukleniyor || !izinli) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    temelVeri();
  }, [yetki.yukleniyor, izinli, temelVeri]);

  // Dönem satışları
  const [aralikYenile, setAralikYenile] = useState(0);
  useEffect(() => {
    if (yetki.yukleniyor || !izinli || !bas || !bit) return;
    let iptal = false;
    hepsiniCek<Satis>((a, b) => supabase.from("urun_satislari").select("tarih,menu_urun,adet,tutar").gte("tarih", bas).lte("tarih", bit).order("tarih").order("id").range(a, b))
      .then(s => { if (!iptal) setSatisAralik(s.map(x => ({ ...x, adet: Number(x.adet), tutar: x.tutar === null ? null : Number(x.tutar) }))); })
      .catch(e => { if (!iptal) setHata(String(e)); });
    return () => { iptal = true; };
  }, [supabase, bas, bit, yetki.yukleniyor, izinli, aralikYenile]);

  // Stok hareketleri (sayım öncesi de lazım: dönem başından 60 gün önce)
  useEffect(() => {
    if (yetki.yukleniyor || !izinli) return;
    let iptal = false;
    hepsiniCek<StokHareketi>((a, b) => supabase.from("stok_hareketler").select("urun_id,tarih,tip,miktar,created_at,neden,birim_fiyat,vakit").gte("tarih", hareketBas).order("tarih").order("id").range(a, b))
      .then(h => { if (!iptal) setHareketler(h); })
      .catch(e => { if (!iptal) setHata(String(e)); });
    return () => { iptal = true; };
  }, [supabase, hareketBas, yetki.yukleniyor, izinli]);

  const urunMap = useMemo(() => new Map(urunler.map(u => [u.id, u])), [urunler]);

  // ─── REÇETE HESABI ────────────────────────────────────────────────────────
  const stokBilgi = useMemo<StokBilgi[]>(() => {
    const f = new Map(fiyatlar.map(x => [x.urun_id, x]));
    return urunler.map(u => ({ id: u.id, urun_adi: u.urun_adi, birim: u.birim, adet_gram: u.adet_gram, fiyat: stokFiyati(f.get(u.id), u.son_fiyat) }));
  }, [urunler, fiyatlar]);
  const baglam = useMemo(() => baglamKur(receteler, receteUrunleri, stokBilgi), [receteler, receteUrunleri, stokBilgi]);
  // Teorik tüketim için ara reçeteler açılmış, stok biriminde düz reçete
  const duzRecete = useMemo(() => duzReceteler(baglam), [baglam]);
  const satisOzeti = useMemo(() => {
    const m = new Map<string, MenuOzeti & { satislar: Satis[] }>();
    satis90.forEach(s => {
      const k = normalAd(s.menu_urun);
      if (!m.has(k)) m.set(k, { ad: s.menu_urun, adet: 0, satisFiyati: null, satislar: [] });
      const o = m.get(k)!; o.adet += s.adet; o.satislar.push(s);
    });
    m.forEach(o => { o.satisFiyati = ortalamaSatisFiyati(o.satislar); });
    return m;
  }, [satis90]);
  const receteliAdlar = useMemo(() => new Set(duzRecete.map(r => normalAd(r.menu_urun))), [duzRecete]);
  const recetesizSayisi = Array.from(satisOzeti.keys()).filter(k => !receteliAdlar.has(k)).length;
  const urunSayisi = new Set([...receteUrunleri.filter(u => u.tur === "menu").map(u => normalAd(u.ad)), ...satisOzeti.keys()]).size;

  // ─── TEORİK / GERÇEK TÜKETİM ──────────────────────────────────────────────
  const [sadeceReceteli, setSadeceReceteli] = useState(true);
  const tuketim = useMemo(() => {
    const donemGun = gunFarki(bas, bit) + 1;
    const satisGunleri = new Set(satisAralik.map(s => s.tarih));
    const receteliUrunler = new Set(duzRecete.map(r => r.stok_urun_id));
    // Gerçek: lib/stok kullanım analizi; yalnızca satışı yüklü günler (teorikle aynı günler) sayılır.
    const gercek = new Map<string, number | null>();
    const kapsam = new Map<string, { gun: number; tahminiGun: number }>();
    const gunSetleri = new Map<string, Set<string>>();
    urunler.forEach(u => {
      const analiz = kullanimAnalizi(hareketler, u.id);
      const ortak = { ...analiz, gunler: analiz.gunler.filter(g => satisGunleri.has(g.tarih)) };
      const d = donemKullanimi(ortak, bas, bit);
      kapsam.set(u.id, { gun: d.gun, tahminiGun: d.tahminiGun });
      if (d.gun > 0) {
        gercek.set(u.id, d.toplam);
        gunSetleri.set(u.id, new Set(ortak.gunler.filter(g => g.tarih >= bas && g.tarih <= bit).map(g => g.tarih)));
      } else if (receteliUrunler.has(u.id)) gercek.set(u.id, null);
    });
    const tum = teorikTuketim(satisAralik, duzRecete);
    const ortakTeorik = teorikTuketim(satisAralik, duzRecete, (id, t) => !!gunSetleri.get(id)?.has(t)).tuketim;
    // Sayımı olan üründe teorik aynı günler üzerinden; sayımı yoksa dönemin tamamı gösterilir.
    const teorik = new Map<string, number>();
    receteliUrunler.forEach(id => teorik.set(id, gunSetleri.has(id) ? (ortakTeorik.get(id) || 0) : (tum.tuketim.get(id) || 0)));
    let satirlar = tuketimKarsilastir(teorik, gercek, stokBilgi.map(x => ({ id: x.id, son_fiyat: x.fiyat })));
    if (sadeceReceteli) satirlar = satirlar.filter(s => receteliUrunler.has(s.stok_urun_id));
    const recetesizAdlar = tum.recetesiz.map(k => satisAralik.find(s => normalAd(s.menu_urun) === k)?.menu_urun || k);
    const toplamFarkTL = satirlar.reduce((s, x) => s + (x.farkTutar && x.farkTutar > 0 ? x.farkTutar : 0), 0);
    return { donemGun, satisGunu: satisGunleri.size, satirlar, kapsam, recetesizAdlar, toplamFarkTL, receteliUrunler };
  }, [bas, bit, satisAralik, duzRecete, urunler, stokBilgi, hareketler, sadeceReceteli]);

  // ─── FOOD COST ────────────────────────────────────────────────────────────
  const foodCost = useMemo(() => aylar.map((ay, i) => {
    const alis = faturalar.filter(f => f.fatura_tarihi?.startsWith(ay)).reduce((s, f) => s + Number(f.toplam_tutar || 0), 0);
    const ayRaporlari = raporlar.filter(r => r.tarih.startsWith(ay));
    const net = donemOzeti(ayRaporlari).net;
    return { ay, alis, net, gun: ayRaporlari.length, oran: foodCostYuzde(alis, net), devam: i === aylar.length - 1 };
  }).map((x, i, arr) => ({
    ...x, degisim: i > 0 && x.oran !== null && arr[i - 1].oran !== null ? x.oran - arr[i - 1].oran! : null,
  })), [aylar, faturalar, raporlar]);

  const [paketUrunId, setPaketUrunId] = useState("");
  const paketUrun = urunMap.get(paketUrunId) || urunler.find(u => normalAd(u.urun_adi).includes("tavuk")) || urunler[0] || null;
  const paketTrend = useMemo(() => {
    if (!paketUrun) return [];
    const analiz = kullanimAnalizi(hareketler, paketUrun.id);
    return aylar.map(ay => {
      const ab = `${ay}-01`, as = aySonu(ay.slice(0, 4), ay.slice(5, 7));
      const d = donemKullanimi(analiz, ab, as);
      // Paket yalnızca kullanım verisi olan günlerden sayılır (aynı günler karşılaştırılsın).
      const gunler = new Set(analiz.gunler.filter(g => g.tarih >= ab && g.tarih <= as).map(g => g.tarih));
      const paket = raporlar.filter(r => gunler.has(r.tarih)).reduce((s, r) => s + paketToplam(r), 0);
      return { ay, kullanim: d.toplam, gun: d.gun, paket, oran: paketBasi(d.toplam, paket) };
    });
  }, [paketUrun, hareketler, aylar, raporlar]);

  // ─── GÖRÜNÜM ──────────────────────────────────────────────────────────────
  if (yetki.yukleniyor || (izinli && yukleniyor)) return (
    <div className="h-screen bg-zemin flex items-center justify-center"><Loader2 className="animate-spin text-emerald-400"/></div>
  );
  if (!izinli) return (
    <div className="min-h-screen bg-zemin flex items-center justify-center p-6 text-sm text-gray-600">Bu sayfayı görme yetkiniz yok.</div>
  );

  const SEKMELER: { k: Sekme; l: string; i: React.ReactNode }[] = [
    { k: "recete", l: "Reçeteler", i: <BookOpen size={13}/> },
    { k: "tuketim", l: "Teorik / Gerçek", i: <Scale size={13}/> },
    { k: "foodcost", l: foodCostIzni ? "Food cost" : "Paket tüketimi", i: <Percent size={13}/> },
    { k: "yukle", l: "Satış yükle", i: <FileSpreadsheet size={13}/> },
  ];

  return (
    <div className="min-h-screen bg-zemin text-yazi font-sans antialiased pb-20">
      <div className="sticky top-0 z-40 border-b border-cizgi bg-zemin/95 backdrop-blur-xl">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/stok" className="p-2 border border-cizgi rounded-xl text-gray-600 hover:text-yazi"><ArrowLeft size={14}/></Link>
            <SayfaSimgesi />
            <div>
              <h1 className="text-sm font-black tracking-tight leading-none">Reçete & Maliyet</h1>
              <p className="text-[10px] text-gray-600 leading-none mt-0.5">{urunSayisi} menü ürünü · {recetesizSayisi} reçetesiz satılan</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-xl border border-cizgi overflow-hidden bg-kart">
              {SEKMELER.map(s => (
                <button key={s.k} onClick={() => setSekme(s.k)}
                  className={`flex items-center gap-1.5 px-3 h-9 text-[11px] font-bold ${sekme === s.k ? "bg-emerald-600 text-white" : "text-gray-600 hover:text-yazi"}`}>
                  {s.i}<span className="hidden sm:inline">{s.l}</span>
                </button>
              ))}
            </div>
            <button onClick={() => { temelVeri(); setAralikYenile(x => x + 1); }} className="p-2 text-gray-600 hover:text-yazi border border-cizgi rounded-xl"><RefreshCw size={14}/></button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-4 space-y-4">
        {hata && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/25 rounded-xl px-3 py-2">Veri alınamadı: {hata}</div>}

        {sekme === "yukle" && <UrunSatisYukle onKaydedildi={() => { temelVeri(); setAralikYenile(x => x + 1); }}/>}

        {/* ─── REÇETELER ─── */}
        {sekme === "recete" && (
          <ReceteDuzenleyici supabase={supabase} baglam={baglam} stok={stokBilgi} urunler={receteUrunleri} satirlar={receteler}
            satislar={satisOzeti} fiyatGorunur={fiyatGorunur} onDegisti={temelVeri}/>
        )}

        {/* ─── TEORİK / GERÇEK ─── */}
        {sekme === "tuketim" && (
          <div className={`${kutu} p-4 space-y-3`}>
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-sm font-bold">Teorik ve gerçek tüketim</h2>
                <p className="text-[11px] text-gray-500">Teorik = satış adedi × reçete miktarı. Gerçek = sayımlardan çıkan kullanım (sayım + giriş − çıkış − sonraki sayım).</p>
              </div>
              <div className="flex items-end gap-2 flex-wrap">
                <label className="text-[11px] font-semibold text-gray-600 space-y-1"><span className="block">Başlangıç</span>
                  <input type="date" value={bas} max={bit} onChange={e => e.target.value && setBas(e.target.value)} className={inputCls}/></label>
                <label className="text-[11px] font-semibold text-gray-600 space-y-1"><span className="block">Bitiş</span>
                  <input type="date" value={bit} min={bas} onChange={e => e.target.value && setBit(e.target.value)} className={inputCls}/></label>
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 h-9">
                  <input type="checkbox" checked={sadeceReceteli} onChange={e => setSadeceReceteli(e.target.checked)}/> Sadece reçetedeki malzemeler
                </label>
              </div>
            </div>

            <div className="space-y-1.5">
              {!satisAralik.length && <Uyari>Bu dönemde yüklenmiş ürün satışı yok — teorik tüketim hesaplanamaz. “Satış yükle” sekmesinden rapor yükleyin.</Uyari>}
              {!duzRecete.length && <Uyari>Henüz hiç reçete girilmemiş — teorik tüketim hesaplanamaz.</Uyari>}
              {satisAralik.length > 0 && tuketim.satisGunu < tuketim.donemGun && (
                <Uyari>Dönemin {tuketim.donemGun} gününden yalnızca {tuketim.satisGunu} gününün satışı yüklü. Karşılaştırma sadece satışı yüklü günler üzerinden yapılır.</Uyari>
              )}
              {tuketim.recetesizAdlar.length > 0 && (
                <Uyari>Reçetesi olmayan {tuketim.recetesizAdlar.length} menü ürünü satılmış; bunların malzemesi teorik tüketime girmedi: {tuketim.recetesizAdlar.slice(0, 8).join(", ")}{tuketim.recetesizAdlar.length > 8 ? "…" : ""}</Uyari>
              )}
              <p className="text-[11px] text-gray-500 flex items-start gap-1.5"><Info size={12} className="mt-0.5 shrink-0"/>Sayımı olan malzemelerde teorik de gerçek de yalnızca kullanım verisi olan (sayımlar arası) günler üzerinden hesaplanır. Sayımı olmayan malzemede gerçek tüketim “sayım yok” görünür.</p>
            </div>

            {tuketim.satirlar.length > 0 && (
              <>
                {tuketim.toplamFarkTL > 0 && (
                  <div className="text-xs">Teorikten fazla kullanımın toplam değeri: <b className="text-red-400">₺{fmtTL(tuketim.toplamFarkTL)}</b></div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 border-b border-cizgi">
                        <th className="py-2 pr-2">Stok ürünü</th><th className="py-2 px-2 text-right">Teorik</th><th className="py-2 px-2 text-right">Gerçek</th>
                        <th className="py-2 px-2 text-right">Fark</th><th className="py-2 px-2 text-right">Fark %</th><th className="py-2 px-2 text-right">Fark ₺</th>
                        <th className="py-2 pl-2">Kapsam</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tuketim.satirlar.map(s => {
                        const u = urunMap.get(s.stok_urun_id);
                        const k = tuketim.kapsam.get(s.stok_urun_id);
                        return (
                          <tr key={s.stok_urun_id} className={`border-b border-cizgi ${s.supheli ? "bg-red-500/10" : ""}`}>
                            <td className="py-2 pr-2">
                              <span className="font-semibold">{u?.urun_adi || "?"}</span>
                              {s.supheli && <span className="ml-2 text-[10px] font-bold text-red-300 bg-red-500/15 px-1.5 py-0.5 rounded-full">fire / kaçak şüphesi</span>}
                              {!tuketim.receteliUrunler.has(s.stok_urun_id) && <span className="ml-2 text-[10px] text-gray-500">reçetede yok</span>}
                            </td>
                            <td className="py-2 px-2 text-right">{sayi(s.teorik)} {u?.birim}</td>
                            <td className="py-2 px-2 text-right">{s.gercek === null ? <span className="text-amber-300">sayım yok</span> : `${sayi(s.gercek)} ${u?.birim}`}</td>
                            <td className={`py-2 px-2 text-right font-semibold ${s.fark !== null && s.fark > 0 ? "text-red-400" : ""}`}>{s.fark === null ? "—" : `${s.fark > 0 ? "+" : ""}${sayi(s.fark)}`}</td>
                            <td className={`py-2 px-2 text-right font-semibold ${s.supheli ? "text-red-400" : ""}`}>{s.farkYuzde === null ? "—" : `${s.farkYuzde > 0 ? "+" : ""}${yuzde(s.farkYuzde)}`}</td>
                            <td className="py-2 px-2 text-right">{s.farkTutar === null ? "—" : `${s.farkTutar > 0 ? "+" : ""}₺${fmtTL(s.farkTutar)}`}</td>
                            <td className="py-2 pl-2 text-[10px] text-gray-500 whitespace-nowrap">
                              {k && k.gun > 0 ? `${k.gun}/${tuketim.satisGunu} gün${k.tahminiGun ? ` (${k.tahminiGun} tahmini)` : ""}` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-gray-500">Gerçek tüketim teorikten %{SUPHE_ESIGI}’dan fazlaysa satır kırmızı işaretlenir. Fark ₺ = fark × son alış fiyatı. Fireler (SKT, bozulma) stok çıkışı olarak girildiyse kullanıma dahil edilmez.</p>
              </>
            )}
          </div>
        )}

        {/* ─── FOOD COST ─── */}
        {sekme === "foodcost" && (
          <div className={`grid grid-cols-1 gap-4 ${foodCostIzni ? "xl:grid-cols-2" : ""}`}>
            {foodCostIzni && (
            <div className={`${kutu} p-4 space-y-3`}>
              <div>
                <h2 className="text-sm font-bold">Food cost % (aylık)</h2>
                <p className="text-[11px] text-gray-500">Mal alışı (o ayın tüm tedarikçi faturaları, KDV dahil toplam) / net ciro (günlük raporlar) × 100.</p>
              </div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={foodCost.map(f => ({ ad: ayEtiketi(f.ay), oran: f.oran === null ? null : Number(f.oran.toFixed(1)) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)"/>
                    <XAxis dataKey="ad" tick={{ fontSize: 10 }}/>
                    <YAxis tick={{ fontSize: 10 }} unit="%" width={40}/>
                    <Tooltip formatter={(v) => [`%${sayi(Number(v), 1)}`, "Food cost"]}/>
                    <Line type="monotone" dataKey="oran" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} connectNulls/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 border-b border-cizgi">
                      <th className="py-2 pr-2">Ay</th><th className="py-2 px-2 text-right">Mal alışı</th><th className="py-2 px-2 text-right">Net ciro</th>
                      <th className="py-2 px-2 text-right">Food cost</th><th className="py-2 pl-2 text-right">Değişim</th>
                    </tr>
                  </thead>
                  <tbody>
                    {foodCost.map(f => (
                      <tr key={f.ay} className="border-b border-cizgi">
                        <td className="py-2 pr-2 font-semibold">{ayEtiketi(f.ay)}{f.devam && <span className="text-[10px] text-gray-500 font-normal"> (devam ediyor)</span>}</td>
                        <td className="py-2 px-2 text-right">₺{fmtTL(f.alis)}</td>
                        <td className="py-2 px-2 text-right">{f.gun ? `₺${fmtTL(f.net)}` : <span className="text-gray-400">rapor yok</span>}</td>
                        <td className="py-2 px-2 text-right font-bold">{yuzde(f.oran)}</td>
                        <td className={`py-2 pl-2 text-right ${f.degisim === null ? "" : f.degisim > 0 ? "text-red-400" : "text-emerald-300"}`}>
                          {f.degisim === null ? "—" : `${f.degisim > 0 ? "+" : ""}${sayi(f.degisim, 1)} puan`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-gray-500">Fatura tarihi esas alınır; ay sonunda alınıp sonraki ay kullanılan mal oranı dalgalandırabilir.</p>
            </div>
            )}

            <div className={`${kutu} p-4 space-y-3`}>
              <div className="flex items-end justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-sm font-bold">Paket başı tüketim</h2>
                  <p className="text-[11px] text-gray-500">Aylık kullanım (sayımlardan) / aynı günlerde kurye raporlarındaki teslim edilen paket.</p>
                </div>
                <select value={paketUrun?.id || ""} onChange={e => setPaketUrunId(e.target.value)} className={`${inputCls} w-auto max-w-[260px]`}>
                  {urunler.map(u => <option key={u.id} value={u.id}>{u.urun_adi}</option>)}
                </select>
              </div>
              {paketUrun && (
                <>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={paketTrend.map(p => ({ ad: ayEtiketi(p.ay), oran: p.oran === null ? null : Number(p.oran.toFixed(4)) }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)"/>
                        <XAxis dataKey="ad" tick={{ fontSize: 10 }}/>
                        <YAxis tick={{ fontSize: 10 }} width={48}/>
                        <Tooltip formatter={(v) => [`${sayi(Number(v), 3)} ${paketUrun.birim} / paket`, paketUrun.urun_adi]}/>
                        <Line type="monotone" dataKey="oran" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} connectNulls/>
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 border-b border-cizgi">
                          <th className="py-2 pr-2">Ay</th><th className="py-2 px-2 text-right">Kullanım</th><th className="py-2 px-2 text-right">Paket</th>
                          <th className="py-2 px-2 text-right">{paketUrun.birim} / paket</th><th className="py-2 pl-2 text-right">Veri günü</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paketTrend.map(p => (
                          <tr key={p.ay} className="border-b border-cizgi">
                            <td className="py-2 pr-2 font-semibold">{ayEtiketi(p.ay)}</td>
                            <td className="py-2 px-2 text-right">{p.gun ? `${sayi(p.kullanim)} ${paketUrun.birim}` : <span className="text-gray-400">sayım yok</span>}</td>
                            <td className="py-2 px-2 text-right">{p.gun ? sayi(p.paket, 0) : "—"}</td>
                            <td className="py-2 px-2 text-right font-bold">{p.oran === null ? "—" : sayi(p.oran, 3)}</td>
                            <td className="py-2 pl-2 text-right text-gray-500">{p.gun}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-gray-500">Salon satışları paket sayısına dahil değildir. Sayım yapılmayan aylarda değer hesaplanamaz.</p>
                </>
              )}
            </div>
          </div>
        )}
        <p className="text-[10px] text-gray-400">Bugün: {fmtTarih(bugunStr)}</p>
      </div>
    </div>
  );
}

function Uyari({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] text-amber-200 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2 flex items-start gap-2">
      <AlertTriangle size={13} className="mt-0.5 shrink-0"/><span>{children}</span>
    </div>
  );
}
