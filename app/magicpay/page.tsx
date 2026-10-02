"use client";

// ─── MAGICPAY KONTROL ───────────────────────────────────────────────────────
// Kasa Raporu'na girilen rakamları adisyon programının raporlama sitesiyle
// (MagicPay) karşılaştırır: paket sayıları, platform tutarları, indirimler,
// kasa nakit/POS/yemek kartları, kapıda tahsilat.
// Sadece lib/magicpay.ts → MAGICPAY_GORENLER görebilir (proxy.ts + API route).
// Karşılaştırma mantığı lib/magicpay.ts → gunuKarsilastir.

import SayfaSimgesi from "@/components/kabuk/SayfaSimgesi";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useYetki } from "@/lib/useYetki";
import { bugun, gunEkle, fmtTarih } from "@/lib/tarih";
import { magicpayGorebilirMi, gunuKarsilastir, type MpGun, type PanelRaporu } from "@/lib/magicpay";
import { GunDetayi } from "@/components/MagicpayKarsilastirma";
import { Lock, Loader2, RefreshCw, AlertTriangle, EyeOff } from "lucide-react";

const GUN_ADLARI = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const gunAdi = (t: string) => GUN_ADLARI[new Date(t + "T12:00:00Z").getUTCDay()];

export default function MagicpayKontrolPage() {
  const supabase = createClient();
  const yetki = useYetki();
  const izinli = magicpayGorebilirMi(yetki.userId);

  const dun = gunEkle(bugun(), -1);
  const [baslangic, setBaslangic] = useState(dun);
  const [bitis, setBitis] = useState(dun);
  const [mpGunler, setMpGunler] = useState<MpGun[] | null>(null);
  const [raporlar, setRaporlar] = useState<PanelRaporu[]>([]);
  const [seciliGun, setSeciliGun] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState("");

  const getir = useCallback(async (bas: string, bit: string) => {
    if (!bas || !bit || bit < bas) { setHata("Bitiş tarihi başlangıçtan önce olamaz."); return; }
    setYukleniyor(true); setHata("");
    try {
      const [mpCevap, { data, error }] = await Promise.all([
        fetch(`/api/magicpay-karsilastirma?start=${bas}&end=${bit}`, { cache: "no-store" }),
        supabase.from("gunluk_raporlar").select("*").gte("tarih", bas).lte("tarih", bit).order("tarih"),
      ]);
      const mp = await mpCevap.json().catch(() => ({}));
      if (!mpCevap.ok) throw new Error(mp?.error || `MagicPay verisi alınamadı (HTTP ${mpCevap.status}).`);
      if (error) throw new Error(`Kasa raporları okunamadı: ${error.message}`);
      const gunler = (mp.gunler || []) as MpGun[];
      setMpGunler(gunler);
      setRaporlar((data || []) as PanelRaporu[]);
      setSeciliGun(gunler.length ? gunler[gunler.length - 1].tarih : null);
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Bilinmeyen hata.");
      setMpGunler(null);
    }
    setYukleniyor(false);
  }, [supabase]);

  // İlk açılışta dünü getir.
  useEffect(() => {
    if (izinli) getir(dun, dun);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [izinli]);

  const karsilastirmalar = useMemo(() =>
    (mpGunler || []).map(g => gunuKarsilastir(g, raporlar.find(r => r.tarih === g.tarih) || null)),
  [mpGunler, raporlar]);

  const secili = karsilastirmalar.find(k => k.tarih === seciliGun) || null;

  const hazirAralik = (gunSayisi: number) => {
    const bit = dun, bas = gunEkle(dun, -(gunSayisi - 1));
    setBaslangic(bas); setBitis(bit); getir(bas, bit);
  };

  if (yetki.yukleniyor) return <div className="min-h-screen bg-zemin" />;
  if (!izinli) return (
    <div className="min-h-screen bg-zemin flex flex-col items-center justify-center gap-2 text-gray-600">
      <Lock size={22} /><p className="text-sm">Bu sayfaya erişiminiz yok.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-zemin text-yazi font-sans antialiased">
      <div className="sticky top-0 z-40 border-b border-cizgi bg-zemin/95 backdrop-blur-xl">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <SayfaSimgesi />
            <div>
              <h1 className="text-sm font-black leading-none">MagicPay Kontrol</h1>
              <p className="text-[10px] text-gray-600 mt-0.5 leading-none flex items-center gap-1">
                Kasa Raporu ↔ adisyon programı <span className="inline-flex items-center gap-0.5 text-cyan-400/80"><EyeOff size={10} /> sadece Murat &amp; Bülent görür</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => hazirAralik(1)} className="text-[12px] font-bold px-3 py-2 rounded-xl border border-cizgi bg-kart text-gray-700 hover:text-yazi">Dün</button>
            <button onClick={() => hazirAralik(7)} className="text-[12px] font-bold px-3 py-2 rounded-xl border border-cizgi bg-kart text-gray-700 hover:text-yazi">Son 7 gün</button>
            <input type="date" value={baslangic} max={bugun()} onChange={e => setBaslangic(e.target.value)}
              className="bg-kart border border-cizgi text-[12px] font-bold px-3 py-2 rounded-xl outline-none" />
            <span className="text-gray-500 text-xs">–</span>
            <input type="date" value={bitis} max={bugun()} onChange={e => setBitis(e.target.value)}
              className="bg-kart border border-cizgi text-[12px] font-bold px-3 py-2 rounded-xl outline-none" />
            <button onClick={() => getir(baslangic, bitis)} disabled={yukleniyor}
              className="flex items-center gap-2 text-xs font-bold text-[#1a1408] kebo-btn-altin hover:brightness-110 disabled:opacity-40 px-4 py-2.5 rounded-xl">
              {yukleniyor ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Karşılaştır
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-5 space-y-5">
        {hata && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 text-xs text-red-300 flex items-start gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {hata}
          </div>
        )}

        {yukleniyor && !mpGunler && (
          <div className="flex items-center justify-center gap-2 py-16 text-gray-500 text-sm">
            <Loader2 size={16} className="animate-spin" /> MagicPay&apos;den veriler alınıyor…
          </div>
        )}

        {mpGunler && mpGunler.length === 0 && !yukleniyor && (
          <p className="text-sm text-gray-500 py-10 text-center">Bu aralık için MagicPay&apos;de satış yok.</p>
        )}

        {karsilastirmalar.length > 1 && (
          <div className="bg-kart border border-cizgi rounded-2xl p-3">
            <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold px-1 pb-2">Günler</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {karsilastirmalar.map(k => (
                <button key={k.tarih} onClick={() => setSeciliGun(k.tarih)}
                  className={`shrink-0 text-left rounded-xl border px-3 py-2 transition-colors ${
                    k.tarih === seciliGun ? "border-altin/60 bg-altin/10" : "border-cizgi bg-alan hover:border-cizgi-guclu"}`}>
                  <p className="text-[12px] font-bold text-yazi">{fmtTarih(k.tarih).slice(0, 5)} <span className="text-gray-500 font-medium">{gunAdi(k.tarih).slice(0, 3)}</span></p>
                  <p className={`text-[10.5px] font-bold mt-0.5 ${!k.raporVar ? "text-amber-300" : k.farkSayisi ? "text-red-400" : "text-emerald-400"}`}>
                    {!k.raporVar ? "rapor yok" : k.farkSayisi ? `${k.farkSayisi} fark` : "hepsi tutuyor"}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {secili && (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
              <h2 className="text-base font-black">{fmtTarih(secili.tarih)} · {gunAdi(secili.tarih)}</h2>
              <p className={`text-[12px] font-bold ${!secili.raporVar ? "text-amber-300" : secili.farkSayisi ? "text-red-400" : "text-emerald-400"}`}>
                {!secili.raporVar ? "Kasa Raporu girilmemiş" : secili.farkSayisi ? `${secili.farkSayisi} kalemde fark var` : "Bütün kalemler tutuyor"}
              </p>
            </div>
            <GunDetayi k={secili} />
          </>
        )}
      </div>
    </div>
  );
}
