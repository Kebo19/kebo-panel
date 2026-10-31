"use client";

// ─── KURYE KONTROL ──────────────────────────────────────────────────────────
// Roket (Roadrunner) Paket Raporu Excel'i yüklenir → günlük özet kaydedilir
// (roket_gunluk; müşteri bilgisi kaydedilmez). Her gün için:
//   • kurye kurye: Roket ↔ Kasa Raporu (paket, kapıda nakit / POS / kart)
//   • platform platform: Roket ↔ MagicPay paket sayısı
// Okuma ve karşılaştırma kuralları: lib/roket.ts.

import SayfaSimgesi from "@/components/kabuk/SayfaSimgesi";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { useYetki } from "@/lib/useYetki";
import { fmtTarih } from "@/lib/tarih";
import { roketExcelOku, kuryeKarsilastir, paketKontrolu, roketTahsilat, atamaBirlestir, atamaBul, ATAMA_ADI, type RoketGun, type RoketAtama, type KuryeKarsilastirma } from "@/lib/roket";
import { KANALLAR, mpKanalPaketleri, type MpRaporDoldurma, type Kanal } from "@/lib/magicpay";
import { Lock, Loader2, Upload, AlertTriangle, CheckCircle2, Truck } from "lucide-react";

const tl = (v: number) => "₺" + new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(v || 0);
const GUN_ADLARI = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const gunAdi = (t: string) => GUN_ADLARI[new Date(t + "T12:00:00Z").getUTCDay()];

interface KasaKurye { isim?: string; tip?: string; paketSayisi?: unknown; uzakPaket?: unknown; paket9km?: unknown; nakit?: unknown; pos?: unknown; tokenflex?: unknown; paye?: unknown }

/** Roket ↔ diğer kaynak hücresi: eşitse sade, farklıysa kırmızı fark. */
function Hucre({ r, k, para = true, kim = "kasada" }: { r: number | undefined; k: number | undefined; para?: boolean; kim?: string }) {
  const yaz = (v: number) => (para ? tl(v) : String(v));
  if (r === undefined && k === undefined) return <td className="px-2 py-1.5 text-right text-gray-600">—</td>;
  const fark = (r ?? 0) - (k ?? 0);
  const ayni = Math.abs(fark) < (para ? 1 : 0.5);
  return (
    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
      <span className="text-yazi">{r === undefined ? "—" : yaz(r)}</span>
      <span className="text-gray-500"> / {k === undefined ? "—" : yaz(k)}</span>
      {!ayni && r !== undefined && k !== undefined && (
        <span className="block text-[11px] font-bold text-red-300">{fark > 0 ? `${kim} eksik ` : `${kim} fazla `}{yaz(Math.abs(fark))}</span>
      )}
    </td>
  );
}

function GunKarti({ gun, kasa, kirMigros, mp, onAtama, kaydediliyor }: { gun: RoketGun; kasa: KasaKurye[] | null; kirMigros: number | null; mp: MpRaporDoldurma | null | undefined; onAtama: (ad: string, atama: RoketAtama) => void; kaydediliyor: boolean }) {
  const satirlar: KuryeKarsilastirma[] = useMemo(() => kuryeKarsilastir(gun, kasa), [gun, kasa]);
  // Kıraloğlu Migros MagicPay'de yok: kasa raporuna elle girilen paket sayısı eklenir.
  const bizde: Partial<Record<Kanal, number>> | undefined = mp ? { ...mpKanalPaketleri(mp), kir_migros: kirMigros ?? 0 } : undefined;
  const mpPaket = (kanal: Kanal): number | undefined => bizde ? (bizde[kanal] ?? 0) : undefined;
  const kanalSatirlari = KANALLAR.map(k => ({ ...k, ad: k.kanal === "kir_migros" ? `${k.ad} (kasa raporundan)` : k.ad, roket: gun.kanallar[k.kanal] || 0, mp: mpPaket(k.kanal) }))
    .filter(k => k.roket || k.mp);
  const kuryeFark = satirlar.some(s => s.roket && s.kasa && (
    Math.abs(s.roket.paket - s.kasa.paket) > 0 || Math.abs(s.roket.nakit - s.kasa.nakit) >= 1 ||
    Math.abs(s.roket.pos - s.kasa.pos) >= 1 || Math.abs(s.roket.kart - s.kasa.kart) >= 1));
  // Fiş tarandı / Roket Adisyon girişleri, MagicPay'de fazla görünen kanallarla eşleştirilir.
  const pkK = bizde ? paketKontrolu(gun, bizde) : null;
  const kanalFark = pkK ? pkK.farkliKanallar.length > 0 || pkK.eslesmeyenFis > 0 : false;
  // Kapıda toplam: Roket (kuryelerin topladığı) ↔ MagicPay (Alo Paket + platform kapıda ödemesi)
  const roketKapida = gun.kuryeler.reduce((t, k) => t + roketTahsilat(k), 0);
  const mpKapida = mp ? mp.alo.nakit + mp.alo.pos + mp.kapidaKebo.ys + mp.kapidaKebo.trendyol + mp.kapidaKebo.migros
    + Object.entries(mp.platform).filter(([a]) => a.startsWith("ko_")).reduce((t, [, v]) => t + v.tutar, 0) : undefined;
  const roketPaketPlatform = gun.toplamPaket;
  const mpPaketToplam = bizde ? KANALLAR.reduce((t, k) => t + (bizde[k.kanal] || 0), 0) : undefined;

  return (
    <section className="kebo-kart p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-black">{fmtTarih(gun.tarih)} <span className="text-gray-500 font-medium">{gunAdi(gun.tarih)}</span></h2>
        <span className="text-[12px] text-gray-500">{gun.toplamPaket} paket teslim{gun.iptal ? ` · ${gun.iptal} iptal` : ""}</span>
      </div>
      {!kasa && <p className="text-[12px] text-amber-300">Bu gün için kasa raporu yok; sadece Roket ve MagicPay karşılaştırılıyor.</p>}

      <details className="rounded-lg border border-cizgi" open={!kasa}>
        <summary className="cursor-pointer px-3 py-2 text-[12px] font-semibold flex flex-wrap items-center gap-x-2">
          Kim sabit? <span className="font-normal text-gray-500">{(["s1", "s2"] as const).map(sl => `${ATAMA_ADI[sl]}: ${gun.kuryeler.filter(k => atamaBul(gun, k) === sl).map(k => k.ad).join(" + ") || "—"}`).join(" · ")}</span>
          {kaydediliyor && <Loader2 size={12} className="animate-spin text-gray-500" />}
        </summary>
        <div className="px-3 pb-3 space-y-1.5">
          <p className="text-[11px] text-gray-500">Sabit kurye izinliyse ya da birkaç saat yerine başka kurye geldiyse o kuryeyi de aynı sabite atayın; paketleri ve paraları toplanır.</p>
          {gun.kuryeler.map(k => (
            <div key={k.ad} className="flex flex-wrap items-center gap-2 text-[12px]">
              <span className="flex-1 min-w-[140px]">{k.ad} <span className="text-gray-500">· {k.paket} paket</span></span>
              <div role="radiogroup" aria-label={`${k.ad} ataması`} className="flex rounded-lg border border-cizgi overflow-hidden">
                {(["s1", "s2", "havuz"] as const).map(sl => {
                  const secili = atamaBul(gun, k) === sl;
                  return (
                    <button key={sl} type="button" role="radio" aria-checked={secili} onClick={() => !secili && onAtama(k.ad, sl)}
                      className={`px-2.5 py-1.5 text-[11px] font-semibold ${secili ? (sl === "havuz" ? "bg-purple-500/20 text-purple-200" : "bg-amber-500/20 text-amber-200") : "text-gray-500 hover:text-yazi"}`}>
                      {ATAMA_ADI[sl]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </details>

      <div className="overflow-x-auto rounded-lg border border-cizgi">
        <table className="w-full text-[12px]">
          <thead className="bg-alan text-gray-500">
            <tr>
              <th className="px-2 py-1.5 text-left font-semibold">Satır <span className="font-normal">(Roket / Kasa raporu)</span></th>
              <th className="px-2 py-1.5 text-right font-semibold">Paket</th>
              <th className="px-2 py-1.5 text-right font-semibold">Nakit</th>
              <th className="px-2 py-1.5 text-right font-semibold">POS</th>
              <th className="px-2 py-1.5 text-right font-semibold">Kart (Paye/Token…)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cizgi">
            {satirlar.map(s => (
              <tr key={s.ad}>
                <td className="px-2 py-1.5">
                  <span className="font-semibold">{s.ad}</span>
                  <span className="block text-[10px] text-gray-500">{s.kuryeler.length ? s.kuryeler.join(" + ") : "Roket'te yok"} · {s.sabit ? "kasaya teslim eder" : "parası Roadrunner'da kalır"}</span>
                </td>
                <Hucre r={s.roket?.paket} k={s.kasa?.paket} para={false} />
                <Hucre r={s.roket?.nakit} k={s.kasa?.nakit} />
                <Hucre r={s.roket?.pos} k={s.kasa?.pos} />
                <Hucre r={s.roket?.kart} k={s.kasa?.kart} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {kasa && (kuryeFark
        ? <p className="text-[12px] text-red-300 flex items-start gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" />Kasa raporundaki kurye bilgisi Roket&apos;ten farklı. Kasa raporunu açıp 3 · Kurye adımında &quot;Roket&apos;ten doldur&quot;u kullanabilirsiniz.</p>
        : <p className="text-[12px] text-emerald-300 flex items-center gap-1.5"><CheckCircle2 size={13} />Kurye bilgileri Roket ile aynı.</p>)}

      <div className="rounded-lg border border-cizgi overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-alan text-gray-500"><tr><th className="px-3 py-1.5 text-left font-semibold">Roket / MagicPay</th><th className="px-2 py-1.5 text-right font-semibold">Değer</th></tr></thead>
          <tbody className="divide-y divide-cizgi">
            <tr><td className="px-3 py-1.5">Paket sayısı <span className="text-gray-500">(MagicPay + Kıraloğlu Migros)</span></td><Hucre r={roketPaketPlatform} k={mpPaketToplam} para={false} kim="MagicPay'de" /></tr>
            <tr><td className="px-3 py-1.5">Kapıda toplanan para <span className="text-gray-500">(nakit + POS + kart)</span></td><Hucre r={roketKapida} k={mpKapida} kim="MagicPay'de" /></tr>
          </tbody>
        </table>
        {mpKapida !== undefined && Math.abs(roketKapida - mpKapida) >= 1 && (
          <p className="px-3 pb-2 text-[11px] text-amber-300">Roket&apos;te olup MagicPay&apos;de olmayan sipariş, adisyona girilmemiş satış olabilir; Roket&apos;teki o günün siparişlerine bakın.</p>
        )}
      </div>

      <details className="rounded-lg border border-cizgi">
        <summary className="cursor-pointer px-3 py-2 text-[12px] font-semibold flex items-center gap-2">
          Platform paketleri: Roket / MagicPay {mp === undefined ? "" : kanalFark ? <span className="text-red-300">· fark var</span> : mp ? <span className="text-emerald-300">· aynı</span> : <span className="text-gray-500">· MagicPay alınamadı</span>}
        </summary>
        <table className="w-full text-[12px]">
          <tbody className="divide-y divide-cizgi">
            {kanalSatirlari.map(k => (
              <tr key={k.kanal}><td className="px-3 py-1.5">{k.ad}</td><Hucre r={k.roket} k={k.mp} para={false} kim="MagicPay'de" /></tr>
            ))}
            {gun.digerPaket > 0 && <tr><td className="px-3 py-1.5 text-gray-500">Roket&apos;in kendi girişleri (fiş tarandı vb.)</td><td className="px-2 py-1.5 text-right">{gun.digerPaket}</td></tr>}
          </tbody>
        </table>
        {gun.digerPaket > 0 && (
          <div className="px-3 py-2 border-t border-cizgi text-[12px] space-y-0.5">
            {(gun.digerSiparisler || []).map((d, i) => (
              <p key={i} className="text-gray-400">· {d.saat || "—"} · {d.kaynak}{d.musteri ? <> · <b className="text-gray-200">{d.musteri}</b></> : null}{d.isletme ? ` · ${d.isletme}` : ""} · {d.kurye} · <b className="text-yazi">{tl(d.tutar)}</b> {d.odeme.toLocaleLowerCase("tr-TR")}</p>
            ))}
            {!gun.digerSiparisler && <p className="text-gray-500">Ayrıntı yok: bu gün eski yöntemle yüklenmiş; Roket&apos;ten yeniden çekince görünür.</p>}
            {pkK && pkK.fisEslesme.length > 0 && <p className="text-emerald-300">→ Büyük olasılıkla: {pkK.fisEslesme.map(e => `${e.ad}${e.adet > 1 ? ` (${e.adet})` : ""}`).join(", ")} (MagicPay&apos;de o kanalda fazla sipariş var)</p>}
            {pkK && pkK.eslesmeyenFis > 0 && <p className="text-amber-300">→ {pkK.eslesmeyenFis} tanesi hiçbir platformda karşılık bulmadı: adisyona girilmemiş satış olabilir.</p>}
          </div>
        )}
        <p className="px-3 pb-2 text-[11px] text-gray-500">Roket&apos;te sadece kuryeyle giden paketler var; MagicPay&apos;de gel-al siparişler de olabilir.</p>
      </details>
    </section>
  );
}

export default function KuryeKontrolPage() {
  const supabase = useMemo(() => createClient(), []);
  const yetki = useYetki();
  const izinli = yetki.izin("rapor_gir") || yetki.izin("rapor_analiz");

  const [gunler, setGunler] = useState<RoketGun[]>([]);
  const [kasa, setKasa] = useState<Record<string, KasaKurye[] | null>>({});
  const [kirMigros, setKirMigros] = useState<Record<string, number | null>>({});
  const [mp, setMp] = useState<Record<string, MpRaporDoldurma | null>>({});
  const [yukleniyor, setYukleniyor] = useState(true);
  const [isleniyor, setIsleniyor] = useState(false);
  const [mesaj, setMesaj] = useState<{ tur: "ok" | "hata"; metin: string } | null>(null);
  const [atamaKaydi, setAtamaKaydi] = useState<string | null>(null);

  /** Kuryenin satırını (Sabit 1 / Sabit 2 / Havuz) değiştirip günü kaydeder. */
  const atamaDegistir = async (tarih: string, ad: string, atama: RoketAtama) => {
    const g = gunler.find(x => x.tarih === tarih);
    if (!g) return;
    const yeni: RoketGun = { ...g, kuryeler: g.kuryeler.map(k => k.ad === ad ? { ...k, atama, elle: true } : { ...k, atama: atamaBul(g, k) }) };
    setGunler(l => l.map(x => x.tarih === tarih ? yeni : x));
    setAtamaKaydi(tarih);
    const { error } = await supabase.from("roket_gunluk").update({ veri: yeni }).eq("tarih", tarih);
    setAtamaKaydi(null);
    if (error) setMesaj({ tur: "hata", metin: "Atama kaydedilemedi: " + error.message });
  };
  const dosya = useRef<HTMLInputElement>(null);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    const { data, error } = await supabase.from("roket_gunluk").select("tarih, veri").order("tarih", { ascending: false }).limit(31);
    if (error) { setMesaj({ tur: "hata", metin: "Kayıtlar okunamadı: " + error.message }); setYukleniyor(false); return; }
    const liste = (data || []).map(d => ({ ...(d.veri as RoketGun), tarih: d.tarih as string }));
    setGunler(liste);
    if (liste.length) {
      const bas = liste[liste.length - 1].tarih, bit = liste[0].tarih;
      const [{ data: raporlar }, mpCevap] = await Promise.all([
        supabase.from("gunluk_raporlar").select("tarih, kurye_raporlari, os_kir_migros_yemek_paket, ko_kir_migros_yemek_paket").gte("tarih", bas).lte("tarih", bit),
        fetch(`/api/magicpay-karsilastirma?kapsam=indirim&start=${bas}&end=${bit}`, { cache: "no-store" }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      setKasa(Object.fromEntries(liste.map(g => {
        const r = (raporlar || []).find(x => x.tarih === g.tarih);
        return [g.tarih, r ? ((r.kurye_raporlari as KasaKurye[]) || []) : null];
      })));
      setKirMigros(Object.fromEntries(liste.map(g => {
        const r = (raporlar || []).find(x => x.tarih === g.tarih);
        return [g.tarih, r ? (Number(r.os_kir_migros_yemek_paket) || 0) + (Number(r.ko_kir_migros_yemek_paket) || 0) : null];
      })));
      const mpGunler = ((mpCevap?.gunler || []) as { tarih: string; doldurma?: MpRaporDoldurma }[]);
      setMp(Object.fromEntries(liste.map(g => [g.tarih, mpGunler.find(x => x.tarih === g.tarih)?.doldurma ?? null])));
    }
    setYukleniyor(false);
  }, [supabase]);

  useEffect(() => { if (izinli) { const t = setTimeout(yukle, 0); return () => clearTimeout(t); } }, [izinli, yukle]);

  const dosyaSecildi = async (f: File | undefined) => {
    if (!f) return;
    setIsleniyor(true); setMesaj(null);
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const satirlar = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: null, blankrows: false });
      const o = roketExcelOku(satirlar);
      if (!o.gunler.length) throw new Error(o.uyari[0] || "Dosyada teslim edilmiş paket bulunamadı.");
      // Sabit atamaları: aynı gün elle seçildiyse korunur; yoksa bir önceki günün sabit kuryesi (yeterince
      // paket attıysa), o da yoksa en çok paket atan (izin / yerine gelen kurye Kurye Kontrol'den değiştirilir).
      const ilk = o.gunler[0].tarih;
      const [{ data: onceki }, { data: mevcut }] = await Promise.all([
        supabase.from("roket_gunluk").select("tarih, veri").lt("tarih", ilk).order("tarih", { ascending: false }).limit(1),
        supabase.from("roket_gunluk").select("tarih, veri").in("tarih", o.gunler.map(g => g.tarih)),
      ]);
      const sabitAdlari = (g: RoketGun | undefined) => g ? {
        s1: g.kuryeler.filter(k => atamaBul(g, k) === "s1").map(k => k.ad),
        s2: g.kuryeler.filter(k => atamaBul(g, k) === "s2").map(k => k.ad),
      } : {};
      let ref = sabitAdlari(onceki?.[0]?.veri as RoketGun | undefined);
      const hazir = o.gunler.map(g => {
        const eski = (mevcut || []).find(m => m.tarih === g.tarih)?.veri as RoketGun | undefined;
        // Elle yapılan atamalar korunur; diğerleri o günün paket sayısına göre yeniden (lib/roket atamaBirlestir)
        const kuryeler = atamaBirlestir(g.kuryeler, eski, ref);
        const yeni = { ...g, kuryeler };
        ref = sabitAdlari(yeni);
        return yeni;
      });
      const kayit = hazir.map(g => ({ tarih: g.tarih, veri: g, yukleyen: yetki.kullaniciAdi, yuklendi: new Date().toISOString() }));
      const { error } = await supabase.from("roket_gunluk").upsert(kayit, { onConflict: "tarih" });
      if (error) throw new Error(error.message);
      setMesaj({ tur: "ok", metin: `${o.gunler.length} gün işlendi (${o.gunler.map(g => fmtTarih(g.tarih)).join(", ")}). ${o.uyari.join(" ")} İlk ve son gün dosyada eksik saatle başlıyorsa o günü tam aralıkla yeniden yükleyin.` });
      await yukle();
    } catch (e) {
      setMesaj({ tur: "hata", metin: e instanceof Error ? e.message : String(e) });
    } finally {
      setIsleniyor(false);
      if (dosya.current) dosya.current.value = "";
    }
  };

  if (yetki.yukleniyor) return <div className="min-h-screen bg-zemin" />;
  if (!izinli) return (
    <div className="min-h-screen bg-zemin flex flex-col items-center justify-center gap-2 text-gray-600">
      <Lock size={22} /><p className="text-sm">Bu sayfaya erişiminiz yok.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-zemin text-yazi font-sans antialiased">
      <div className="sticky top-0 z-40 border-b border-cizgi bg-zemin/96 backdrop-blur-xl">
        <div className="max-w-screen-lg mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <SayfaSimgesi />
            <div>
              <h1 className="text-sm font-black leading-none">Kurye Kontrol</h1>
              <p className="text-[10px] text-gray-600 mt-0.5 leading-none">Roket ↔ Kasa raporu ↔ MagicPay</p>
            </div>
          </div>
          <label className={`flex items-center gap-2 text-xs font-bold kebo-btn-altin text-[#1a1408] px-3 py-2 rounded-xl cursor-pointer ${isleniyor ? "opacity-60 pointer-events-none" : ""}`}>
            {isleniyor ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Roket Excel&apos;i yükle
            <input ref={dosya} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => dosyaSecildi(e.target.files?.[0])} />
          </label>
        </div>
      </div>

      <main className="max-w-screen-lg mx-auto px-4 sm:px-6 py-5 space-y-4">
        <div className="kebo-kart p-4 text-[12px] text-gray-500 space-y-1">
          <p className="font-semibold text-yazi flex items-center gap-2"><Truck size={14} className="text-altin" />Nasıl kullanılır</p>
          <p><b>Dükkân robotu</b> kuruluysa Roket verisi her gün kendiliğinden gelir (Faturalar&apos;daki &quot;Faturaları şimdi çek&quot; ile hemen de çekilir; son 7 gün yenilenir).</p>
          <p>Elle yüklemek için: Roket Adisyon → Raporlama → <b>Paket Raporu</b>: tarihleri seçin, Filtrele, <b>Excel olarak indir</b>, dosyayı buraya yükleyin. Aynı günü yeniden yüklerseniz eskisinin yerine geçer (sabit kurye seçimleri korunur).</p>
          <p>Panelde sadece kurye kurye günlük toplamlar tutulur; müşteri adı, telefon ve adres kaydedilmez.</p>
        </div>

        {mesaj && (
          <p className={`text-[12px] rounded-lg px-3 py-2 border ${mesaj.tur === "ok" ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/25" : "text-red-300 bg-red-500/10 border-red-500/25"}`}>{mesaj.metin}</p>
        )}

        {yukleniyor ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-500" /></div>
        ) : gunler.length === 0 ? (
          <p className="text-[13px] text-gray-500 text-center py-10">Henüz Roket dosyası yüklenmedi.</p>
        ) : (
          gunler.map(g => <GunKarti key={g.tarih} gun={g} kasa={kasa[g.tarih] ?? null} kirMigros={kirMigros[g.tarih] ?? null} mp={g.tarih in mp ? mp[g.tarih] : undefined}
            onAtama={(ad, atama) => atamaDegistir(g.tarih, ad, atama)} kaydediliyor={atamaKaydi === g.tarih} />)
        )}
      </main>
    </div>
  );
}
