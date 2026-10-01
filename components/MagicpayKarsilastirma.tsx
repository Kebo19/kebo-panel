"use client";

// MagicPay karşılaştırma görünümü — /magicpay sayfası ve Kasa Raporu detayı
// (rapor açılınca sağda) ortak kullanır. Sadece MAGICPAY_GORENLER görür;
// bileşeni çağıran yer kontrol eder, veriyi API route ayrıca korur.

import { useEffect, useMemo, useState } from "react";
import { fmt, fmtEsnek } from "@/lib/para";
import { fmtTarih } from "@/lib/tarih";
import { gunuKarsilastir, type MpGun, type PanelRaporu, type Satir, type GunKarsilastirma } from "@/lib/magicpay";
import { CheckCircle2, AlertTriangle, Info, Minus, Loader2, RefreshCw, ScanSearch, EyeOff } from "lucide-react";

function deger(v: number | null, tur: Satir["tur"]) {
  if (v === null) return "—";
  return tur === "adet" ? fmtEsnek(v) : `₺${fmt(v)}`;
}

function farkYazisi(s: Satir) {
  if (s.fark === null || s.durum === "yok") return "—";
  if (s.durum === "ok") return "✓";
  if (s.fark === 0) return "0";
  const isaret = s.fark > 0 ? "+" : "−";
  const mutlak = Math.abs(s.fark);
  return `${isaret}${s.tur === "adet" ? fmtEsnek(mutlak) : `₺${fmt(mutlak)}`}`;
}

function DurumSimgesi({ d }: { d: Satir["durum"] }) {
  if (d === "ok") return <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />;
  if (d === "fark") return <AlertTriangle size={14} className="text-red-400 shrink-0" />;
  if (d === "bilgi") return <Info size={14} className="text-blue-400 shrink-0" />;
  return <Minus size={14} className="text-gray-500 shrink-0" />;
}

/**
 * Bir günün karşılaştırma tabloları.
 * `sikisik`: dar sütun (rapor detayının yanı) — her ekranda kart görünümü.
 * `sadeceFark`: sadece farklı kalemleri göster.
 */
export function GunDetayi({ k, sikisik = false, sadeceFark = false }: { k: GunKarsilastirma; sikisik?: boolean; sadeceFark?: boolean }) {
  const bolumler = sadeceFark
    ? k.bolumler.map(b => ({ ...b, satirlar: b.satirlar.filter(s => s.durum === "fark") })).filter(b => b.satirlar.length)
    : k.bolumler;
  return (
    <div className="space-y-4">
      {!k.raporVar && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 text-[12px] text-amber-200 flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          {fmtTarih(k.tarih)} için Kasa Raporu girilmemiş. Aşağıda sadece MagicPay rakamları var.
        </div>
      )}
      {sadeceFark && bolumler.length === 0 && k.raporVar && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 text-[12px] text-emerald-300 flex items-center gap-2">
          <CheckCircle2 size={14} /> Bütün kalemler MagicPay ile tutuyor.
        </div>
      )}
      {bolumler.map(b => (
        <div key={b.baslik} className="bg-kart border border-cizgi rounded-2xl overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-cizgi">
            <p className="text-[11px] font-black text-yazi uppercase tracking-widest">{b.baslik}</p>
            {b.aciklama && !sikisik && <p className="text-[11px] text-gray-500 mt-1 leading-snug">{b.aciklama}</p>}
          </div>
          {/* Telefon: her kalem bir kart */}
          <div className={`${sikisik ? "" : "sm:hidden "}divide-y divide-cizgi`}>
            {b.satirlar.map(s => (
              <div key={s.ad} className={`px-4 py-3 ${s.durum === "fark" ? "bg-red-500/[0.06]" : ""}`}>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5"><DurumSimgesi d={s.durum} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-yazi">{s.ad}</p>
                    {s.aciklama && <p className="text-[10.5px] text-gray-500 leading-snug mt-0.5 break-words">{s.aciklama}</p>}
                    <div className="grid grid-cols-3 gap-2 mt-2 text-[12px] tabular-nums">
                      <div><p className="text-[9px] text-gray-600 uppercase tracking-wider">Rapor</p><p className="text-yazi">{deger(s.panel, s.tur)}</p></div>
                      <div><p className="text-[9px] text-gray-600 uppercase tracking-wider">MagicPay</p><p className="text-cyan-300">{deger(s.mp, s.tur)}</p></div>
                      <div className="text-right"><p className="text-[9px] text-gray-600 uppercase tracking-wider">Fark</p>
                        <p className={`font-bold ${s.durum === "fark" ? "text-red-400" : s.durum === "ok" ? "text-emerald-400" : "text-gray-500"}`}>{farkYazisi(s)}</p></div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className={sikisik ? "hidden" : "hidden sm:block overflow-x-auto"}>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-cizgi text-[10px] text-gray-600 uppercase tracking-widest">
                  <th className="text-left font-semibold px-4 sm:px-5 py-2.5">Kalem</th>
                  <th className="text-right font-semibold px-3 py-2.5">Kasa Raporu</th>
                  <th className="text-right font-semibold px-3 py-2.5">MagicPay</th>
                  <th className="text-right font-semibold px-4 sm:px-5 py-2.5">Fark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cizgi">
                {b.satirlar.map(s => {
                  const toplam = /^(Toplam|Kasa toplamı|Yemek kartları toplamı)/.test(s.ad);
                  return (
                    <tr key={s.ad} className={`${s.durum === "fark" ? "bg-red-500/[0.06]" : ""} ${toplam ? "bg-alan" : ""}`}>
                      <td className="px-4 sm:px-5 py-2.5 align-top">
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5"><DurumSimgesi d={s.durum} /></span>
                          <div className="min-w-0">
                            <p className={toplam ? "font-black text-yazi" : "font-semibold text-yazi"}>{s.ad}</p>
                            {s.aciklama && <p className="text-[10.5px] text-gray-500 leading-snug mt-0.5 break-words">{s.aciklama}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums align-top text-yazi">{deger(s.panel, s.tur)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums align-top text-cyan-300">{deger(s.mp, s.tur)}</td>
                      <td className={`px-4 sm:px-5 py-2.5 text-right tabular-nums align-top font-bold ${
                        s.durum === "fark" ? "text-red-400" : s.durum === "ok" ? "text-emerald-400" : "text-gray-500"}`}>
                        {farkYazisi(s)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p className="text-[11px] text-gray-500 leading-relaxed px-1">
        Fark = Kasa Raporu − MagicPay. Artı: raporda fazla girilmiş, eksi: raporda eksik. Paralarda ₺1&apos;e kadar fark yok sayılır.
      </p>
    </div>
  );
}

/**
 * Kasa Raporu açıldığında yanında duran panel: o günü MagicPay'den çekip
 * KAYITLI raporla karşılaştırır.
 */
export function RaporMagicpayPaneli({ rapor }: { rapor: PanelRaporu }) {
  const [mp, setMp] = useState<MpGun | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState("");
  const [sadeceFark, setSadeceFark] = useState(false);
  const [yenile, setYenile] = useState(0);
  const tarih = rapor.tarih;

  useEffect(() => {
    let iptal = false;
    (async () => {
      setYukleniyor(true); setHata("");
      try {
        const res = await fetch(`/api/magicpay-karsilastirma?start=${tarih}&end=${tarih}`, { cache: "no-store" });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d?.error || `MagicPay verisi alınamadı (HTTP ${res.status}).`);
        const gun = ((d.gunler || []) as MpGun[]).find(g => g.tarih === tarih) || null;
        if (!iptal) setMp(gun);
      } catch (e) {
        if (!iptal) { setHata(e instanceof Error ? e.message : "Bilinmeyen hata."); setMp(null); }
      }
      if (!iptal) setYukleniyor(false);
    })();
    return () => { iptal = true; };
  }, [tarih, yenile]);

  const k = useMemo(() => (mp ? gunuKarsilastir(mp, rapor) : null), [mp, rapor]);

  return (
    <div className="rounded-2xl border border-cyan-500/20 bg-kart overflow-hidden">
      <div className="px-4 py-3 border-b border-cizgi flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <ScanSearch size={15} className="text-cyan-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-yazi leading-none">MagicPay karşılaştırması</p>
            <p className="text-[10px] text-gray-500 mt-1 leading-none flex items-center gap-1">
              Kayıtlı rapora göre <span className="inline-flex items-center gap-0.5 text-cyan-400/80"><EyeOff size={9} /> sadece sana görünür</span>
            </p>
          </div>
        </div>
        <button onClick={() => setYenile(x => x + 1)} disabled={yukleniyor} title="Yenile"
          className="p-2 text-gray-600 hover:text-yazi border border-cizgi rounded-xl disabled:opacity-40">
          {yukleniyor ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        </button>
      </div>
      <div className="p-3 space-y-3">
        {hata && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 text-[12px] text-red-300 flex items-start gap-2">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {hata}
          </div>
        )}
        {yukleniyor && !k && (
          <p className="flex items-center justify-center gap-2 py-8 text-[12px] text-gray-500"><Loader2 size={14} className="animate-spin" /> MagicPay&apos;den alınıyor…</p>
        )}
        {!yukleniyor && !hata && !mp && (
          <p className="py-6 text-center text-[12px] text-gray-500">{fmtTarih(tarih)} için MagicPay&apos;de satış yok.</p>
        )}
        {k && (
          <>
            <div className="flex items-center justify-between gap-2 px-1">
              <p className={`text-[12px] font-bold ${k.farkSayisi ? "text-red-400" : "text-emerald-400"}`}>
                {k.farkSayisi ? `${k.farkSayisi} kalemde fark var` : "Bütün kalemler tutuyor"}
              </p>
              <label className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer select-none">
                <input type="checkbox" checked={sadeceFark} onChange={e => setSadeceFark(e.target.checked)} /> Sadece farklar
              </label>
            </div>
            <GunDetayi k={k} sikisik sadeceFark={sadeceFark} />
          </>
        )}
      </div>
    </div>
  );
}
