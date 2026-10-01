"use client";

// POS & Yemek Kartı mutabakatı — Rapor & Analiz > "POS & Kart" sekmesi.
// Günlük raporlardaki kart satışlarını, banka ekstresinden içe aktarılan tahsilatlarla
// (kasa_manuel_islemler) karşılaştırır. Hesap mantığı lib/mutabakat.ts'de (saf fonksiyonlar).

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CreditCard, Info, Loader2, Utensils } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fmt } from "@/lib/para";
import { bugun, fmtTarih, gunEkle, aySonu } from "@/lib/tarih";
import {
  posMutabakati, yemekKartiMutabakati, POS_DURUM_ETIKET, POS_KOMISYON_ORANI, POS_BANKA_HESABI,
  POS_KATEGORI, YEMEK_KARTI_KATEGORI, YEMEK_KARTI_YASAL_UST_SINIR, POS_TARIH_TOLERANS, ayAnahtari,
  type BankaHareketi, type PosDurum,
} from "@/lib/mutabakat";
import { kuryeTahsilati, type RaporVerisi } from "@/lib/hesap";

export interface MutabakatRaporu {
  tarih: string;
  kasa_pos?: number | null;
  kurye_raporlari?: RaporVerisi["kurye_raporlari"];
}

const DURUM_STIL: Record<PosDurum, string> = {
  tuttu: "bg-emerald-500/10 text-emerald-300",
  eksik: "bg-red-500/10 text-red-300",
  bekliyor: "bg-amber-500/10 text-amber-300",
  kayit_yok: "bg-white/[0.05] text-gray-500",
};

const AY_ADLARI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const ayEtiketi = (ay: string) => `${AY_ADLARI[Number(ay.slice(5, 7)) - 1]} ${ay.slice(0, 4)}`;
const yuzde = (v: number) => `%${(v * 100).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const isaretli = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}₺${fmt(Math.abs(v))}`;

const th = "text-left px-3 py-2.5 text-[10px] text-gray-600 uppercase tracking-widest font-semibold whitespace-nowrap";
const td = "px-3 py-2.5 whitespace-nowrap";

export default function PosMutabakat({ raporlar, baslangic, bitis }: {
  raporlar: MutabakatRaporu[]; baslangic: string; bitis: string;
}) {
  const supabase = createClient();
  const [hareketler, setHareketler] = useState<(BankaHareketi & { kategori: string })[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState("");
  const [kaydirma, setKaydirma] = useState(0);

  // Yatışlar: POS için (başlangıç−1 … bitiş+3), yemek kartı için bitişten sonraki ayın sonuna kadar.
  const aralik = useMemo(() => {
    const sonrakiAy = ayAnahtari(bitis, 1);
    return { bas: gunEkle(baslangic, -1), bit: aySonu(sonrakiAy.slice(0, 4), sonrakiAy.slice(5, 7)) };
  }, [baslangic, bitis]);

  useEffect(() => {
    let iptal = false;
    (async () => {
      setYukleniyor(true);
      setHata("");
      const { data, error } = await supabase
        .from("kasa_manuel_islemler")
        .select("id, islem_tarihi, tutar, hesap, kategori, aciklama")
        .eq("tip", "gelir")
        .in("kategori", [POS_KATEGORI, YEMEK_KARTI_KATEGORI])
        .gte("islem_tarihi", aralik.bas)
        .lte("islem_tarihi", aralik.bit)
        .order("islem_tarihi");
      if (iptal) return;
      if (error) { setHata("Banka kayıtları okunamadı: " + error.message); setHareketler([]); }
      else setHareketler((data || []).map(r => ({
        id: r.id, tarih: String(r.islem_tarihi).slice(0, 10), tutar: Number(r.tutar) || 0,
        hesap: r.hesap, kategori: r.kategori, aciklama: r.aciklama,
      })));
      setYukleniyor(false);
    })();
    return () => { iptal = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aralik.bas, aralik.bit]);

  const pos = useMemo(() => {
    const posHareket = hareketler.filter(h =>
      h.kategori === POS_KATEGORI && h.hesap === POS_BANKA_HESABI && h.tarih <= gunEkle(bitis, 1 + POS_TARIH_TOLERANS));
    return posMutabakati(
      raporlar.map(r => ({ tarih: r.tarih, pos: (Number(r.kasa_pos) || 0) + kuryeTahsilati(r).pos })),
      posHareket, bugun(),
    );
  }, [raporlar, hareketler, bitis]);

  const kart = useMemo(() => yemekKartiMutabakati(
    raporlar, hareketler.filter(h => h.kategori === YEMEK_KARTI_KATEGORI), kaydirma,
  ), [raporlar, hareketler, kaydirma]);

  const kartSatisVar = kart.toplam.some(k => k.satis > 0);
  const sinirAsanlar = kart.toplam.filter(k => k.sinirAsimi);

  return (
    <div className="space-y-4">
      {yukleniyor && (
        <div className="flex items-center gap-2 text-xs text-gray-500"><Loader2 size={13} className="animate-spin" /> Banka kayıtları yükleniyor…</div>
      )}
      {hata && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 text-xs text-red-300 flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {hata}
        </div>
      )}
      {!yukleniyor && !hata && !pos.hareketVar && !kart.hareketVar && (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-2xl p-4 text-[12px] text-amber-200 flex items-start gap-2.5">
          <Info size={15} className="shrink-0 mt-0.5" />
          <p>
            Bu dönem için bankaya yatan kart tahsilatı kaydı yok. Banka ekstresini <b>Kasa &amp; Finans &gt; Ekstre yükle</b> ile
            içe aktarınca bu tablo dolar. (POS yatışları: VakıfBank, kategori &quot;{POS_KATEGORI}&quot;; yemek kartları: tüm hesaplar,
            kategori &quot;{YEMEK_KARTI_KATEGORI}&quot;.)
          </p>
        </div>
      )}

      {/* ── POS ── */}
      <div className="bg-kart border border-cizgi rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-cizgi flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold flex items-center gap-1.5">
            <CreditCard size={12} /> POS Mutabakatı ({POS_BANKA_HESABI})
          </p>
          <p className="text-[10px] text-gray-500">
            Beklenen: ertesi gün, satış × (1 − %{(POS_KOMISYON_ORANI * 100).toLocaleString("tr-TR")}) · tarih ±{POS_TARIH_TOLERANS} gün, tutar ±%0,5 / ±5 TL
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 p-4 border-b border-cizgi">
          {[
            { label: "POS Satışı", value: `₺${fmt(pos.toplamSatis)}`, cls: "text-blue-400" },
            { label: "Beklenen Yatış", value: `₺${fmt(pos.toplamBeklenen)}`, cls: "text-gray-800" },
            { label: "Gerçekleşen", value: `₺${fmt(pos.toplamYatan)}`, cls: "text-emerald-400" },
            { label: "Gerçekleşen Komisyon", value: `₺${fmt(pos.gerceklesenKomisyon)}`, cls: "text-orange-400",
              alt: pos.eslesenSatis > 0 ? `${yuzde(pos.gerceklesenKomisyon / pos.eslesenSatis)} (eşleşen günler)` : "eşleşen gün yok" },
            { label: "Beklenen Komisyon", value: `₺${fmt(pos.beklenenKomisyon)}`, cls: "text-gray-700", alt: "tüm dönem" },
          ].map(k => (
            <div key={k.label} className="bg-alan border border-cizgi rounded-xl p-3">
              <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">{k.label}</p>
              <p className={`text-base font-black ${k.cls}`}>{k.value}</p>
              {k.alt && <p className="text-[10px] text-gray-500 mt-0.5">{k.alt}</p>}
            </div>
          ))}
        </div>

        <div className="px-4 py-2.5 flex flex-wrap gap-2 border-b border-cizgi">
          {(Object.keys(POS_DURUM_ETIKET) as PosDurum[]).map(d => (
            <span key={d} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${DURUM_STIL[d]}`}>
              {POS_DURUM_ETIKET[d]}: {pos.sayac[d]}
            </span>
          ))}
        </div>

        {pos.satirlar.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500">Bu dönemde POS satışı yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-cizgi">
                  {["Gün", "POS Satışı", "Beklenen Yatış", "Gerçekleşen", "Fark", "Durum"].map(h => <th key={h} className={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-cizgi">
                {pos.satirlar.map(s => (
                  <tr key={s.tarih} className="hover:bg-white/[0.03]">
                    <td className={`${td} font-medium text-gray-700`}>{fmtTarih(s.tarih)}</td>
                    <td className={`${td} text-blue-400 font-bold`}>₺{fmt(s.posSatis)}</td>
                    <td className={td}>
                      ₺{fmt(s.beklenen)} <span className="text-[10px] text-gray-400">{fmtTarih(s.beklenenTarih).slice(0, 5)}</span>
                    </td>
                    <td className={td}>
                      {s.gerceklesen === null ? "—" : (
                        <>₺{fmt(s.gerceklesen)} <span className="text-[10px] text-gray-400">
                          {fmtTarih(s.gerceklesenTarih).slice(0, 5)}{s.birlesik ? " · birleşik" : ""}
                        </span></>
                      )}
                    </td>
                    <td className={`${td} font-bold ${s.fark === null ? "text-gray-400" : Math.abs(s.fark) < 1 ? "text-emerald-400" : s.fark < 0 ? "text-red-400" : "text-amber-400"}`}>
                      {s.fark === null ? "—" : isaretli(s.fark)}
                    </td>
                    <td className={td}>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${DURUM_STIL[s.durum]}`}>{POS_DURUM_ETIKET[s.durum]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-cizgi bg-alan font-black">
                  <td className={`${td} text-[10px] text-gray-600 uppercase`}>Toplam</td>
                  <td className={`${td} text-blue-400`}>₺{fmt(pos.toplamSatis)}</td>
                  <td className={td}>₺{fmt(pos.toplamBeklenen)}</td>
                  <td className={`${td} text-emerald-400`}>₺{fmt(pos.toplamYatan)}</td>
                  <td className={td} colSpan={2}>Komisyon (satış − yatan, eşleşen günler): ₺{fmt(pos.gerceklesenKomisyon)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {pos.eslesmeyenHareketler.length > 0 && (
          <div className="px-5 py-3 border-t border-cizgi text-[11px] text-gray-600">
            <p className="font-bold text-gray-700 mb-1">Hiçbir güne eşleşmeyen POS yatışları</p>
            <ul className="space-y-0.5">
              {pos.eslesmeyenHareketler.map(h => (
                <li key={String(h.id)}>{fmtTarih(h.tarih)} · ₺{fmt(h.tutar)}{h.aciklama ? ` · ${h.aciklama}` : ""}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── YEMEK KARTLARI ── */}
      <div className="bg-kart border border-cizgi rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-cizgi flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold flex items-center gap-1.5">
            <Utensils size={12} /> Yemek Kartı Mutabakatı (aylık, tüm hesaplar)
          </p>
          <label className="flex items-center gap-2 text-[11px] text-gray-600">
            Yatışları eşleştir:
            <select value={kaydirma} onChange={e => setKaydirma(Number(e.target.value))}
              className="bg-alan border border-cizgi rounded-lg px-2 py-1 text-[11px] outline-none">
              <option value={0}>Aynı ay</option>
              <option value={1}>Ertesi ay (satış ayı + 1)</option>
            </select>
          </label>
        </div>

        {sinirAsanlar.length > 0 && (
          <div className="mx-4 mt-4 bg-red-500/5 border border-red-500/30 rounded-xl p-3 text-[12px] text-red-300 flex items-start gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <p>
              <b>Yasal üst sınır %{YEMEK_KARTI_YASAL_UST_SINIR * 100}</b> aşılıyor: {sinirAsanlar.map(k => `${k.ad} (${yuzde(k.komisyonOrani || 0)})`).join(", ")}.
              Eksik yatış da olabilir — ekstreyi ve eşleştirme ayını kontrol edin.
            </p>
          </div>
        )}

        {!kartSatisVar ? (
          <p className="py-10 text-center text-sm text-gray-500">Bu dönemde yemek kartı satışı yok.</p>
        ) : (
          <div className="p-4 space-y-4">
            {[...kart.aylar.map(a => ({ baslik: ayEtiketi(a.ay), kartlar: a.kartlar, belirsiz: a.belirsizYatan })),
              ...(kart.aylar.length > 1 ? [{ baslik: "Dönem Toplamı", kartlar: kart.toplam, belirsiz: kart.belirsizYatan }] : []),
            ].map(blok => (
              <div key={blok.baslik} className="border border-cizgi rounded-xl overflow-hidden">
                <p className="px-3 py-2 bg-alan border-b border-cizgi text-[11px] font-bold text-gray-700">{blok.baslik}</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-cizgi">
                        {["Kart", "Satış", "Yatan", "Fark", "Zımni Komisyon"].map(h => <th key={h} className={th}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-cizgi">
                      {blok.kartlar.filter(k => k.satis > 0 || k.yatan > 0).map(k => (
                        <tr key={k.ad} className={k.sinirAsimi ? "bg-red-500/5" : ""}>
                          <td className={`${td} font-bold text-yazi`}>{k.ad}</td>
                          <td className={`${td} text-blue-400 font-bold`}>₺{fmt(k.satis)}</td>
                          <td className={`${td} text-emerald-400`}>{k.yatan > 0 ? `₺${fmt(k.yatan)}` : "—"}</td>
                          <td className={`${td} font-bold ${k.fark < 0 ? "text-red-400" : "text-gray-700"}`}>{k.yatan > 0 ? isaretli(k.fark) : "—"}</td>
                          <td className={td}>
                            {k.komisyonOrani === null ? <span className="text-gray-400">yatış yok</span> : (
                              <span className={`font-bold ${k.sinirAsimi ? "text-red-400" : "text-gray-700"}`}>
                                {yuzde(k.komisyonOrani)}
                                {k.sinirAsimi && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/10">Yasal üst sınır %6</span>}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {blok.belirsiz > 0 && (
                  <p className="px-3 py-2 border-t border-cizgi text-[10px] text-gray-500">
                    Açıklamasından kartı anlaşılamayan yatış: <b>₺{fmt(blok.belirsiz)}</b> (hesaba katılmadı — açıklamaya kart adını ekleyin).
                  </p>
                )}
              </div>
            ))}
            <p className="text-[10px] text-gray-500">
              Kısmi ay seçiliyse satış tarafı da kısmi olur; en doğru sonuç için üstte tam ay seçin. Kart ataması, banka açıklamasında
              kart adı (Edenred/Ticket, Metropol, Setcard, Pluxee/Sodexo, Paye) geçmesine göre yapılır.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
