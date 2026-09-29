"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { createClient } from "@/lib/supabase/client";
import { useYetki } from "@/lib/useYetki";
import { bugun, gunEkle, gunFarki, fmtTarih, aySonu } from "@/lib/tarih";
import { fmt as fmtTL, fmt2 } from "@/lib/para";
import { donemOzeti, paketToplam, type RaporVerisi } from "@/lib/hesap";
import { kullanimAnalizi, donemKullanimi, miktarOku, type StokHareketi } from "@/lib/stok";
import {
  normalAd, porsiyonMaliyeti, ortalamaSatisFiyati, maliyetOrani, teorikTuketim, tuketimKarsilastir,
  foodCostYuzde, sonAylar, ayEtiketi, paketBasi, SUPHE_ESIGI, type ReceteSatiri,
} from "@/lib/recete";
import UrunSatisYukle from "@/components/UrunSatisYukle";
import { hepsiniCek } from "@/lib/hepsiniCek";
import {
  ArrowLeft, ChefHat, Plus, Trash2, Loader2, Search, AlertTriangle, RefreshCw, FileSpreadsheet,
  Scale, Percent, BookOpen, Info,
} from "lucide-react";

// REÇETE & MALİYET
// 1) Ürün satış raporu yükleme  2) Reçete düzenleyici (porsiyon maliyeti)
// 3) Teorik (satış × reçete) ve gerçek (sayımlardan) tüketim  4) Food cost % ve paket başı tüketim

interface StokUrun { id: string; urun_adi: string; birim: string; son_fiyat: number | null; durum: string; kategori: string | null; }
interface Recete extends ReceteSatiri { id: string; }
interface Satis { tarih: string; menu_urun: string; adet: number; tutar: number | null; }
interface Fatura { fatura_tarihi: string; toplam_tutar: number | null; }

type Sekme = "recete" | "tuketim" | "foodcost" | "yukle";

const inputCls = "w-full bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] text-xs h-9 px-3 rounded-xl outline-none";
const kutu = "bg-[#ffffff] border border-[#e2e5eb] rounded-xl";
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
  const [receteler, setReceteler] = useState<Recete[]>([]);
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
      const [u, r, s, rap, fat] = await Promise.all([
        hepsiniCek<StokUrun>((a, b) => supabase.from("stok_urunler").select("id,urun_adi,birim,son_fiyat,durum,kategori").order("urun_adi").order("id").range(a, b)),
        hepsiniCek<Recete>((a, b) => supabase.from("receteler").select("id,menu_urun,stok_urun_id,miktar").order("menu_urun").order("id").range(a, b)),
        hepsiniCek<Satis>((a, b) => supabase.from("urun_satislari").select("tarih,menu_urun,adet,tutar").gte("tarih", gunEkle(bugunStr, -90)).order("tarih").order("id").range(a, b)),
        hepsiniCek<RaporVerisi>((a, b) => supabase.from("gunluk_raporlar").select("*").gte("tarih", altiAyBasi).order("tarih").order("id").range(a, b)),
        // Fatura okuma yetkisi yoksa food cost gösterilmez (boş veri 0 diye gösterilmesin)
        foodCostIzni
          ? hepsiniCek<Fatura>((a, b) => supabase.from("faturalar").select("fatura_tarihi,toplam_tutar").gte("fatura_tarihi", altiAyBasi).order("fatura_tarihi").order("id").range(a, b))
          : Promise.resolve([] as Fatura[]),
      ]);
      setUrunler(u); setReceteler(r.map(x => ({ ...x, miktar: Number(x.miktar) })));
      setSatis90(s.map(x => ({ ...x, adet: Number(x.adet), tutar: x.tutar === null ? null : Number(x.tutar) })));
      setRaporlar(rap); setFaturalar(fat);
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e));
    } finally {
      setYukleniyor(false);
    }
  }, [supabase, bugunStr, altiAyBasi, foodCostIzni]);

  const recetelerCek = useCallback(async () => {
    const r = await hepsiniCek<Recete>((a, b) => supabase.from("receteler").select("id,menu_urun,stok_urun_id,miktar").order("menu_urun").order("id").range(a, b));
    setReceteler(r.map(x => ({ ...x, miktar: Number(x.miktar) })));
  }, [supabase]);

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

  // ─── MENÜ ÜRÜNLERİ ────────────────────────────────────────────────────────
  const [ekMenuler, setEkMenuler] = useState<string[]>([]);
  const [menuArama, setMenuArama] = useState("");
  const [seciliMenu, setSeciliMenu] = useState<string | null>(null);

  const menuler = useMemo(() => {
    const m = new Map<string, { ad: string; adet: number; satislar: Satis[]; recete: Recete[] }>();
    const al = (ad: string) => {
      const k = normalAd(ad);
      if (!m.has(k)) m.set(k, { ad, adet: 0, satislar: [], recete: [] });
      return m.get(k)!;
    };
    satis90.forEach(s => { const o = al(s.menu_urun); o.adet += s.adet; o.satislar.push(s); });
    receteler.forEach(r => { const o = al(r.menu_urun); o.recete.push(r); o.ad = r.menu_urun; });
    ekMenuler.forEach(a => al(a));
    return Array.from(m.entries()).map(([k, o]) => {
      const { maliyet, fiyatsiz } = porsiyonMaliyeti(o.recete, urunler);
      const satisFiyati = ortalamaSatisFiyati(o.satislar);
      return { anahtar: k, ...o, maliyet, fiyatsiz, satisFiyati, oran: o.recete.length ? maliyetOrani(maliyet, satisFiyati) : null };
    }).sort((a, b) => b.adet - a.adet || a.ad.localeCompare(b.ad, "tr"));
  }, [satis90, receteler, ekMenuler, urunler]);

  const gorunenMenuler = useMemo(() => {
    const q = normalAd(menuArama);
    return q ? menuler.filter(m => m.anahtar.includes(q)) : menuler;
  }, [menuler, menuArama]);
  const secili = menuler.find(m => m.anahtar === seciliMenu) || null;
  const recetesizSayisi = menuler.filter(m => !m.recete.length && m.adet > 0).length;

  const menuEkle = () => {
    const ad = prompt("Menü ürününün adı (adisyon programındaki adıyla aynı yazın):")?.replace(/\s+/g, " ").trim();
    if (!ad) return;
    if (!menuler.some(m => m.anahtar === normalAd(ad))) setEkMenuler(x => [...x, ad]);
    setSeciliMenu(normalAd(ad));
  };

  // ─── REÇETE SATIRLARI ─────────────────────────────────────────────────────
  const [malzemeArama, setMalzemeArama] = useState("");
  const [yeniUrunId, setYeniUrunId] = useState("");
  const [yeniMiktar, setYeniMiktar] = useState("");
  const [miktarTaslak, setMiktarTaslak] = useState<Record<string, string>>({});
  const [islem, setIslem] = useState(false);

  const aktifUrunler = useMemo(() => urunler.filter(u => u.durum !== "pasif"), [urunler]);
  const malzemeSecenekleri = useMemo(() => {
    const q = normalAd(malzemeArama);
    const mevcut = new Set(secili?.recete.map(r => r.stok_urun_id) || []);
    return aktifUrunler.filter(u => !mevcut.has(u.id) && (!q || normalAd(u.urun_adi).includes(q)));
  }, [aktifUrunler, malzemeArama, secili]);

  const satirEkle = async () => {
    if (!secili || !yeniUrunId) return;
    const m = miktarOku(yeniMiktar);
    if (!Number.isFinite(m) || m <= 0) { alert("Geçerli bir miktar girin (ör. 0,18)."); return; }
    setIslem(true);
    const { error } = await supabase.from("receteler").insert([{ menu_urun: secili.ad, stok_urun_id: yeniUrunId, miktar: m }]);
    setIslem(false);
    if (error) { alert("Eklenemedi: " + error.message); return; }
    setYeniUrunId(""); setYeniMiktar(""); setMalzemeArama("");
    setEkMenuler(x => x.filter(a => normalAd(a) !== secili.anahtar));
    recetelerCek();
  };

  const miktarKaydet = async (r: Recete) => {
    const ham = miktarTaslak[r.id];
    if (ham === undefined) return;
    const m = miktarOku(ham);
    if (!Number.isFinite(m) || m <= 0) { alert("Geçerli bir miktar girin."); return; }
    if (m === r.miktar) { setMiktarTaslak(x => { const y = { ...x }; delete y[r.id]; return y; }); return; }
    const { error } = await supabase.from("receteler").update({ miktar: m }).eq("id", r.id);
    if (error) { alert("Kaydedilemedi: " + error.message); return; }
    setReceteler(x => x.map(y => y.id === r.id ? { ...y, miktar: m } : y));
    setMiktarTaslak(x => { const y = { ...x }; delete y[r.id]; return y; });
  };

  const satirSil = async (r: Recete) => {
    if (!confirm(`${urunMap.get(r.stok_urun_id)?.urun_adi || "Malzeme"} reçeteden çıkarılsın mı?`)) return;
    const { error } = await supabase.from("receteler").delete().eq("id", r.id);
    if (error) { alert("Silinemedi: " + error.message); return; }
    setReceteler(x => x.filter(y => y.id !== r.id));
  };

  // ─── TEORİK / GERÇEK TÜKETİM ──────────────────────────────────────────────
  const [sadeceReceteli, setSadeceReceteli] = useState(true);
  const tuketim = useMemo(() => {
    const donemGun = gunFarki(bas, bit) + 1;
    const satisGunleri = new Set(satisAralik.map(s => s.tarih));
    const receteliUrunler = new Set(receteler.map(r => r.stok_urun_id));
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
    const tum = teorikTuketim(satisAralik, receteler);
    const ortakTeorik = teorikTuketim(satisAralik, receteler, (id, t) => !!gunSetleri.get(id)?.has(t)).tuketim;
    // Sayımı olan üründe teorik aynı günler üzerinden; sayımı yoksa dönemin tamamı gösterilir.
    const teorik = new Map<string, number>();
    receteliUrunler.forEach(id => teorik.set(id, gunSetleri.has(id) ? (ortakTeorik.get(id) || 0) : (tum.tuketim.get(id) || 0)));
    let satirlar = tuketimKarsilastir(teorik, gercek, urunler);
    if (sadeceReceteli) satirlar = satirlar.filter(s => receteliUrunler.has(s.stok_urun_id));
    const recetesizAdlar = tum.recetesiz.map(k => satisAralik.find(s => normalAd(s.menu_urun) === k)?.menu_urun || k);
    const toplamFarkTL = satirlar.reduce((s, x) => s + (x.farkTutar && x.farkTutar > 0 ? x.farkTutar : 0), 0);
    return { donemGun, satisGunu: satisGunleri.size, satirlar, kapsam, recetesizAdlar, toplamFarkTL, receteliUrunler };
  }, [bas, bit, satisAralik, receteler, urunler, hareketler, sadeceReceteli]);

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
    <div className="h-screen bg-[#f4f5f7] flex items-center justify-center"><Loader2 className="animate-spin text-emerald-600"/></div>
  );
  if (!izinli) return (
    <div className="min-h-screen bg-[#f4f5f7] flex items-center justify-center p-6 text-sm text-gray-600">Bu sayfayı görme yetkiniz yok.</div>
  );

  const SEKMELER: { k: Sekme; l: string; i: React.ReactNode }[] = [
    { k: "recete", l: "Reçeteler", i: <BookOpen size={13}/> },
    { k: "tuketim", l: "Teorik / Gerçek", i: <Scale size={13}/> },
    { k: "foodcost", l: foodCostIzni ? "Food cost" : "Paket tüketimi", i: <Percent size={13}/> },
    { k: "yukle", l: "Satış yükle", i: <FileSpreadsheet size={13}/> },
  ];

  return (
    <div className="min-h-screen bg-[#f4f5f7] text-[#1a1f2e] font-sans antialiased pb-20">
      <div className="sticky top-0 z-40 border-b border-[#e2e5eb] bg-[#f4f5f7]/95 backdrop-blur-xl">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/stok" className="p-2 border border-[#e2e5eb] rounded-xl text-gray-600 hover:text-[#1a1f2e]"><ArrowLeft size={14}/></Link>
            <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center"><ChefHat className="h-4 w-4 text-white"/></div>
            <div>
              <h1 className="text-sm font-black tracking-tight leading-none">Reçete & Maliyet</h1>
              <p className="text-[10px] text-gray-600 leading-none mt-0.5">{menuler.length} menü ürünü · {recetesizSayisi} reçetesiz satılan</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-xl border border-[#e2e5eb] overflow-hidden bg-white">
              {SEKMELER.map(s => (
                <button key={s.k} onClick={() => setSekme(s.k)}
                  className={`flex items-center gap-1.5 px-3 h-9 text-[11px] font-bold ${sekme === s.k ? "bg-emerald-600 text-white" : "text-gray-600 hover:text-[#1a1f2e]"}`}>
                  {s.i}<span className="hidden sm:inline">{s.l}</span>
                </button>
              ))}
            </div>
            <button onClick={() => { temelVeri(); setAralikYenile(x => x + 1); }} className="p-2 text-gray-600 hover:text-[#1a1f2e] border border-[#e2e5eb] rounded-xl"><RefreshCw size={14}/></button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-4 space-y-4">
        {hata && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">Veri alınamadı: {hata}</div>}

        {sekme === "yukle" && <UrunSatisYukle onKaydedildi={() => { temelVeri(); setAralikYenile(x => x + 1); }}/>}

        {/* ─── REÇETELER ─── */}
        {sekme === "recete" && (
          <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
            <div className={`${kutu} p-3 space-y-2 lg:max-h-[calc(100vh-140px)] lg:overflow-auto`}>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                  <input value={menuArama} onChange={e => setMenuArama(e.target.value)} placeholder="Menü ürünü ara" className={`${inputCls} pl-8`}/>
                </div>
                <button onClick={menuEkle} className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 border border-emerald-500/30 bg-emerald-500/10 px-2.5 h-9 rounded-xl whitespace-nowrap">
                  <Plus size={13}/> Menü ürünü ekle
                </button>
              </div>
              <p className="text-[10px] text-gray-500">Adetler son 90 günün satışıdır.</p>
              {!gorunenMenuler.length && (
                <div className="text-xs text-gray-500 p-3">Henüz ürün satışı yüklenmemiş. “Satış yükle” sekmesinden rapor yükleyin ya da elle menü ürünü ekleyin.</div>
              )}
              <div className="space-y-1">
                {gorunenMenuler.map(m => (
                  <button key={m.anahtar} onClick={() => setSeciliMenu(m.anahtar)}
                    className={`w-full text-left px-3 py-2 rounded-xl border text-xs flex items-center justify-between gap-2 ${seciliMenu === m.anahtar ? "border-emerald-500 bg-emerald-50" : "border-transparent hover:bg-[#f7f8fa]"}`}>
                    <span className="min-w-0">
                      <span className="block font-semibold truncate">{m.ad}</span>
                      <span className="block text-[10px] text-gray-500">
                        {sayi(m.adet, 1)} adet
                        {m.recete.length > 0 && <> · maliyet ₺{fmt2(m.maliyet)}{m.oran !== null && <> · {yuzde(m.oran)}</>}</>}
                      </span>
                    </span>
                    {!m.recete.length && <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full whitespace-nowrap">reçete yok</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className={`${kutu} p-4`}>
              {!secili ? (
                <div className="text-sm text-gray-500 py-10 text-center">Soldan bir menü ürünü seçin.</div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h2 className="text-base font-black">{secili.ad}</h2>
                      <p className="text-[11px] text-gray-500">Miktarlar stok ürününün biriminde (ör. tavuk kg ise 0,18).</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-[#f7f8fa] border border-[#e2e5eb] rounded-xl px-3 py-2">
                        <div className="text-[10px] text-gray-500">Porsiyon maliyeti</div>
                        <div className="text-sm font-black">₺{fmt2(secili.maliyet)}</div>
                      </div>
                      <div className="bg-[#f7f8fa] border border-[#e2e5eb] rounded-xl px-3 py-2">
                        <div className="text-[10px] text-gray-500">Ort. satış fiyatı (90 gün)</div>
                        <div className="text-sm font-black">{secili.satisFiyati === null ? "—" : `₺${fmt2(secili.satisFiyati)}`}</div>
                      </div>
                      <div className="bg-[#f7f8fa] border border-[#e2e5eb] rounded-xl px-3 py-2">
                        <div className="text-[10px] text-gray-500">Maliyet oranı</div>
                        <div className="text-sm font-black">{yuzde(secili.oran)}</div>
                      </div>
                    </div>
                  </div>
                  {secili.fiyatsiz > 0 && (
                    <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center gap-2">
                      <AlertTriangle size={13}/> {secili.fiyatsiz} malzemenin son alış fiyatı yok; maliyete katılmadı.
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 border-b border-[#e2e5eb]">
                          <th className="py-2 pr-2">Malzeme</th><th className="py-2 px-2 w-32">Miktar</th>
                          <th className="py-2 px-2 text-right">Son fiyat</th><th className="py-2 px-2 text-right">Tutar</th><th className="w-8"/>
                        </tr>
                      </thead>
                      <tbody>
                        {secili.recete.map(r => {
                          const u = urunMap.get(r.stok_urun_id);
                          const f = Number(u?.son_fiyat || 0);
                          return (
                            <tr key={r.id} className="border-b border-[#eef0f3]">
                              <td className="py-2 pr-2 font-semibold">{u?.urun_adi || "(silinmiş ürün)"}</td>
                              <td className="py-2 px-2">
                                <div className="flex items-center gap-1">
                                  <input value={miktarTaslak[r.id] ?? String(r.miktar).replace(".", ",")} inputMode="decimal"
                                    onChange={e => setMiktarTaslak(x => ({ ...x, [r.id]: e.target.value }))}
                                    onBlur={() => miktarKaydet(r)} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                    className={`${inputCls} h-8 w-20 text-right`}/>
                                  <span className="text-[10px] text-gray-500">{u?.birim}</span>
                                </div>
                              </td>
                              <td className="py-2 px-2 text-right text-gray-600">{f ? `₺${fmt2(f)}/${u?.birim}` : "—"}</td>
                              <td className="py-2 px-2 text-right font-semibold">{f ? `₺${fmt2(r.miktar * f)}` : "—"}</td>
                              <td className="py-2 text-right">
                                <button onClick={() => satirSil(r)} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 size={13}/></button>
                              </td>
                            </tr>
                          );
                        })}
                        {!secili.recete.length && (
                          <tr><td colSpan={5} className="py-4 text-center text-gray-500">Bu ürünün reçetesi yok. Aşağıdan malzeme ekleyin.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-[#f7f8fa] border border-[#e2e5eb] rounded-xl p-3 grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_120px_auto] gap-2 items-end">
                    <label className="text-[11px] font-semibold text-gray-600 space-y-1">
                      <span className="block">Malzeme ara</span>
                      <input value={malzemeArama} onChange={e => { setMalzemeArama(e.target.value); setYeniUrunId(""); }} placeholder="ör. tavuk" className={`${inputCls} bg-white`}/>
                    </label>
                    <label className="text-[11px] font-semibold text-gray-600 space-y-1">
                      <span className="block">Stok ürünü ({malzemeSecenekleri.length})</span>
                      <select value={yeniUrunId} onChange={e => setYeniUrunId(e.target.value)} className={`${inputCls} bg-white`}>
                        <option value="">— seçin —</option>
                        {malzemeSecenekleri.map(u => <option key={u.id} value={u.id}>{u.urun_adi} ({u.birim})</option>)}
                      </select>
                    </label>
                    <label className="text-[11px] font-semibold text-gray-600 space-y-1">
                      <span className="block">Miktar {yeniUrunId && `(${urunMap.get(yeniUrunId)?.birim})`}</span>
                      <input value={yeniMiktar} onChange={e => setYeniMiktar(e.target.value)} inputMode="decimal" placeholder="0,18"
                        onKeyDown={e => { if (e.key === "Enter") satirEkle(); }} className={`${inputCls} bg-white text-right`}/>
                    </label>
                    <button onClick={satirEkle} disabled={islem || !yeniUrunId || !yeniMiktar}
                      className="flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-4 h-9 rounded-xl">
                      {islem ? <Loader2 size={13} className="animate-spin"/> : <Plus size={13}/>} Ekle
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
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
              {!receteler.length && <Uyari>Henüz hiç reçete girilmemiş — teorik tüketim hesaplanamaz.</Uyari>}
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
                  <div className="text-xs">Teorikten fazla kullanımın toplam değeri: <b className="text-red-600">₺{fmtTL(tuketim.toplamFarkTL)}</b></div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 border-b border-[#e2e5eb]">
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
                          <tr key={s.stok_urun_id} className={`border-b border-[#eef0f3] ${s.supheli ? "bg-red-50" : ""}`}>
                            <td className="py-2 pr-2">
                              <span className="font-semibold">{u?.urun_adi || "?"}</span>
                              {s.supheli && <span className="ml-2 text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full">fire / kaçak şüphesi</span>}
                              {!tuketim.receteliUrunler.has(s.stok_urun_id) && <span className="ml-2 text-[10px] text-gray-500">reçetede yok</span>}
                            </td>
                            <td className="py-2 px-2 text-right">{sayi(s.teorik)} {u?.birim}</td>
                            <td className="py-2 px-2 text-right">{s.gercek === null ? <span className="text-amber-700">sayım yok</span> : `${sayi(s.gercek)} ${u?.birim}`}</td>
                            <td className={`py-2 px-2 text-right font-semibold ${s.fark !== null && s.fark > 0 ? "text-red-600" : ""}`}>{s.fark === null ? "—" : `${s.fark > 0 ? "+" : ""}${sayi(s.fark)}`}</td>
                            <td className={`py-2 px-2 text-right font-semibold ${s.supheli ? "text-red-600" : ""}`}>{s.farkYuzde === null ? "—" : `${s.farkYuzde > 0 ? "+" : ""}${yuzde(s.farkYuzde)}`}</td>
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
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3"/>
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
                    <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 border-b border-[#e2e5eb]">
                      <th className="py-2 pr-2">Ay</th><th className="py-2 px-2 text-right">Mal alışı</th><th className="py-2 px-2 text-right">Net ciro</th>
                      <th className="py-2 px-2 text-right">Food cost</th><th className="py-2 pl-2 text-right">Değişim</th>
                    </tr>
                  </thead>
                  <tbody>
                    {foodCost.map(f => (
                      <tr key={f.ay} className="border-b border-[#eef0f3]">
                        <td className="py-2 pr-2 font-semibold">{ayEtiketi(f.ay)}{f.devam && <span className="text-[10px] text-gray-500 font-normal"> (devam ediyor)</span>}</td>
                        <td className="py-2 px-2 text-right">₺{fmtTL(f.alis)}</td>
                        <td className="py-2 px-2 text-right">{f.gun ? `₺${fmtTL(f.net)}` : <span className="text-gray-400">rapor yok</span>}</td>
                        <td className="py-2 px-2 text-right font-bold">{yuzde(f.oran)}</td>
                        <td className={`py-2 pl-2 text-right ${f.degisim === null ? "" : f.degisim > 0 ? "text-red-600" : "text-emerald-700"}`}>
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
                        <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3"/>
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
                        <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 border-b border-[#e2e5eb]">
                          <th className="py-2 pr-2">Ay</th><th className="py-2 px-2 text-right">Kullanım</th><th className="py-2 px-2 text-right">Paket</th>
                          <th className="py-2 px-2 text-right">{paketUrun.birim} / paket</th><th className="py-2 pl-2 text-right">Veri günü</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paketTrend.map(p => (
                          <tr key={p.ay} className="border-b border-[#eef0f3]">
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
    <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-start gap-2">
      <AlertTriangle size={13} className="mt-0.5 shrink-0"/><span>{children}</span>
    </div>
  );
}
