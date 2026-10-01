"use client";

// ─── AY DEVRİ KARTI ─────────────────────────────────────────────────────────
// Seçilen ay için: devreden tedarikçi borcu → bu ayın faturaları/ödemeleri → sonraki
// aya devreden borç; ve işletme kârı − borçtaki azalma = ay sonunda elde kalan.
// Hesap lib/devir.ts'de. Kasa ve Kâr/Zarar sayfalarında kullanılır.
// Faturaları okuyamayan kullanıcıda (RLS) ya da 1 Ekim 2026 öncesi aylarda gösterilmez.

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmt } from "@/lib/para";
import { bugun, aySonu } from "@/lib/tarih";
import { hepsiniCek } from "@/lib/hepsiniCek";
import type { RaporVerisi } from "@/lib/hesap";
import { karZararHesapla, ayEtiketi, AY_ADLARI, type KasaIslemiKZ, type FaturaKZ, type CariOdemeKZ } from "@/lib/karZarar";
import { ayDevri, kullanimdaMi, sonrakiAyBasi } from "@/lib/devir";
import { ArrowRightLeft, Loader2 } from "lucide-react";

const tl = (v: number) => `${v < 0 ? "−" : ""}₺${fmt(Math.abs(v))}`;
const ayAdi = (ay: string) => AY_ADLARI[Number(ay.slice(5, 7)) - 1];

interface Props {
  /** "YYYY-AA" */
  ay: string;
  /** Ayın günlük raporları (başka aylar da olabilir; süzülür) */
  raporlar: RaporVerisi[];
  /** Kasa/banka hareketleri (başka aylar da olabilir; süzülür) */
  kasaIslemleri: KasaIslemiKZ[];
  krediTaksidiGider?: boolean;
  /** Değişince yeniden okunur (sayfadaki "yenile") */
  yenile?: unknown;
}

interface Veri { devreden: number; faturalar: FaturaKZ[]; odemeler: CariOdemeKZ[] }

function Satir({ ad, tutar, isaret, aciklama, vurgu, renk }: {
  ad: string; tutar: number; isaret?: string; aciklama?: string; vurgu?: boolean; renk?: string;
}) {
  return (
    <div className={`px-4 sm:px-5 py-2.5 ${vurgu ? "bg-[#f7f8fa]" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[13px] ${vurgu ? "font-black" : "font-semibold"} text-[#1a1f2e]`}>
            {isaret && <span className="inline-block w-4 text-gray-400 font-bold">{isaret}</span>}{ad}
          </p>
          {aciklama && <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{aciklama}</p>}
        </div>
        <p className={`text-[14px] tabular-nums shrink-0 ${vurgu ? "font-black" : "font-bold"} ${renk || "text-[#1a1f2e]"}`}>{tl(tutar)}</p>
      </div>
    </div>
  );
}

export default function AyDevri({ ay, raporlar, kasaIslemleri, krediTaksidiGider = false, yenile }: Props) {
  const aktif = kullanimdaMi(ay);
  // Sonuç hangi ay/yenileme için okunduysa onunla birlikte saklanır; farklıysa "yükleniyor".
  const [okunan, setOkunan] = useState<{ ay: string; yenile: unknown; veri: Veri | null } | null>(null);

  useEffect(() => {
    if (!aktif) return;
    let iptal = false;
    const supabase = createClient();
    const bitir = (v: Veri | null) => { if (!iptal) setOkunan({ ay, yenile, veri: v }); };
    (async () => {
      const bas = `${ay}-01`, bit = aySonu(ay.slice(0, 4), ay.slice(5, 7));
      try {
        const [{ data: devreden, error }, faturalar, odemeler] = await Promise.all([
          supabase.rpc("cari_borc_bakiyesi", { p_tarih: bas }),
          hepsiniCek<FaturaKZ>((a, b) => supabase.from("faturalar").select("fatura_tarihi,toplam_tutar").gte("fatura_tarihi", bas).lte("fatura_tarihi", bit).order("id").range(a, b)),
          hepsiniCek<CariOdemeKZ>((a, b) => supabase.from("cari_odemeler").select("tarih,tutar,rapor_id").gte("tarih", bas).lte("tarih", bit).order("id").range(a, b)),
        ]);
        if (error || devreden === null || devreden === undefined) bitir(null);
        else bitir({ devreden: Number(devreden) || 0, faturalar, odemeler });
      } catch {
        bitir(null); // yetki yoksa kart gösterilmez
      }
    })();
    return () => { iptal = true; };
  }, [ay, aktif, yenile]);

  const guncel = okunan && okunan.ay === ay && okunan.yenile === yenile ? okunan : null;
  const veri = guncel?.veri ?? null;
  const durum: "yukleniyor" | "hazir" | "yok" = !aktif ? "yok" : !guncel ? "yukleniyor" : veri ? "hazir" : "yok";

  const s = useMemo(() => {
    if (!veri) return null;
    const kz = karZararHesapla({
      ay, raporlar, faturalar: veri.faturalar, kasaIslemleri, cariOdemeler: veri.odemeler,
      krediTaksidiGider, bugun: bugun(),
    });
    return {
      ...ayDevri({ devredenBorc: veri.devreden, buAyFatura: kz.malAlisi, buAyOdeme: kz.nakitAkisi.cariOdeme, isletmeKari: kz.isletmeKari }),
      eksikGun: kz.eksikGun,
    };
  }, [veri, ay, raporlar, kasaIslemleri, krediTaksidiGider]);

  if (durum === "yok") return null;

  const bugunStr = bugun();
  const bitti = bugunStr >= sonrakiAyBasi(ay);
  const sonraki = ayAdi(sonrakiAyBasi(ay).slice(0, 7));

  return (
    <div className="bg-white border border-[#e2e5eb] rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-[#e2e5eb] flex items-center gap-2">
        <ArrowRightLeft size={14} className="text-gray-500" />
        <p className="text-sm font-semibold text-gray-800">{ayEtiketi(ay)} · Ay devri</p>
        {!bitti && <span className="text-[10px] text-gray-500 bg-black/[0.04] px-2 py-0.5 rounded-full">ay devam ediyor</span>}
      </div>
      {durum === "yukleniyor" || !s ? (
        <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-gray-400" size={18} /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x divide-[#eef0f3]">
          <div className="divide-y divide-[#eef0f3]">
            <p className="px-5 pt-3 pb-1 text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Tedarikçi borcu</p>
            <Satir ad={`Devreden borç (1 ${ayAdi(ay)})`} tutar={s.devredenBorc}
              aciklama="Önceki aylardan kalan, ödenmemiş fatura toplamı." />
            <Satir ad="Bu ay gelen faturalar" isaret="+" tutar={s.buAyFatura} />
            <Satir ad="Bu ay yapılan cari ödemeler" isaret="−" tutar={s.buAyOdeme}
              aciklama="Eski ve yeni faturalar için yapılan tüm tedarikçi ödemeleri." />
            <Satir ad={bitti ? `${sonraki} ayına devreden borç` : "Şu anki borç"} tutar={s.aySonuBorc} vurgu
              renk={s.aySonuBorc > s.devredenBorc ? "text-red-700" : "text-[#1a1f2e]"} />
          </div>
          <div className="divide-y divide-[#eef0f3] border-t lg:border-t-0 border-[#eef0f3]">
            <p className="px-5 pt-3 pb-1 text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Ay sonucu</p>
            <Satir ad="İşletme kârı" tutar={s.isletmeKari} renk={s.isletmeKari >= 0 ? "text-emerald-700" : "text-red-700"}
              aciklama="Net ciro − bu ayın faturaları − personel, kurye, sabit giderler ve komisyonlar." />
            {s.borcAzalisi >= 0 ? (
              <Satir ad="Eski borçtan ödenen" isaret="−" tutar={s.borcAzalisi}
                aciklama="Borç bu ay bu kadar azaldı; kârın bu kısmı eski borca gitti." />
            ) : (
              <Satir ad="Ödenmeyip borca eklenen" isaret="+" tutar={-s.borcAzalisi}
                aciklama="Bu ayın faturalarından ödenmeyen kısım; para henüz elde ama borç arttı." />
            )}
            <Satir ad={bitti ? "Ay sonunda elde kalan" : "Şu an elde kalan"} tutar={s.eldeKalan} vurgu
              renk={s.eldeKalan >= 0 ? "text-emerald-700" : "text-red-700"} />
            <p className="px-5 py-2.5 text-[10px] text-gray-500 leading-snug">
              Ortak sermaye, kredi girişi/taksidi ve bankaya henüz geçmemiş POS/yemek kartı tutarları bu hesaba dahil değildir.
              {s.eksikGun > 0 && <span className="text-amber-700"> {s.eksikGun} gün rapor eksik; kâr olduğundan düşük görünür.</span>}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
