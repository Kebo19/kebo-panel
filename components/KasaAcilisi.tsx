"use client";

// ─── KASA AÇILIŞI (31.10.2026, canlıya geçiş) ────────────────────────────────
// 1 Kasım (KASA_BASLANGIC) sabahı elde olan para ve kart borçları bir kez girilir:
//   • Nakit / TEB / VakıfBank / Enpara → kasa_manuel_islemler, kategori "Açılış bakiyesi",
//     tarih KASA_BASLANGIC (kâr/zarara girmez). Tekrar kaydedilirse aynı satır güncellenir (çift olmaz).
//   • Kredi kartları → kredi_kartlari.acilis_borcu, acilis_tarihi = KASA_BASLANGIC.
// Firma (cari) borçları sistemdeki faturalar ve ödemelerden hesaplanır (kullanıcı kararı), burada girilmez.

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { tv, paraGirdisi, paraYaz, fmt } from "@/lib/para";
import { fmtTarih } from "@/lib/tarih";
import { KASA_BASLANGIC } from "@/lib/devir";
import { ACILIS_KATEGORISI } from "@/lib/karZarar";
import type { KrediKarti } from "@/lib/kasaHesaplari";
import { CheckCircle2, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

interface Islem { id: string; tip: string; hesap: string; kategori: string; tutar: number; islem_tarihi: string }

const HESAPLAR: { ad: string; etiket: string; ipucu: string }[] = [
  { ad: "Nakit", etiket: "Nakit kasa", ipucu: "31 Ekim gün sonu sayılan nakit (dükkân + sabit kuryelerin getirdiği)" },
  { ad: "TEB", etiket: "TEB", ipucu: "Hesaptaki para" },
  { ad: "VakıfBank", etiket: "VakıfBank", ipucu: "31 Ekim POS'u yatmadan önceki bakiye (o POS otomatik eklenir)" },
  { ad: "Enpara", etiket: "Enpara", ipucu: "Hesaptaki para" },
];

export default function KasaAcilisi({ islemler, kartlar, onKaydedildi }: {
  islemler: Islem[]; kartlar: KrediKarti[]; onKaydedildi: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const mevcut = useMemo(() => {
    const m = new Map<string, Islem>();
    islemler.filter(i => i.kategori === ACILIS_KATEGORISI && i.islem_tarihi === KASA_BASLANGIC).forEach(i => m.set(i.hesap, i));
    return m;
  }, [islemler]);
  const kartGirildi = kartlar.length > 0 && kartlar.every(k => k.acilis_tarihi === KASA_BASLANGIC);
  const girildi = mevcut.size > 0;
  const [acik, setAcik] = useState(false);
  const [deger, setDeger] = useState<Record<string, string>>({});
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const ac = () => {
    const d: Record<string, string> = {};
    HESAPLAR.forEach(h => { const x = mevcut.get(h.ad); d[h.ad] = x ? paraYaz(x.tip === "gider" ? -Number(x.tutar) : Number(x.tutar)) : ""; });
    kartlar.forEach(k => { d[`kart:${k.id}`] = k.acilis_tarihi === KASA_BASLANGIC ? paraYaz(Number(k.acilis_borcu)) : ""; });
    setDeger(d); setHata(null); setAcik(true);
  };

  const kaydet = async () => {
    setHata(null); setKaydediliyor(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const ekleyen = user?.email?.split("@")[0] || "panel";
      for (const h of HESAPLAR) {
        const ham = (deger[h.ad] || "").trim();
        if (!ham) continue;
        const v = tv(ham);
        const satir = { tip: v < 0 ? "gider" : "gelir", hesap: h.ad, kategori: ACILIS_KATEGORISI, tutar: Math.abs(v),
          aciklama: `${fmtTarih(KASA_BASLANGIC)} açılış bakiyesi`, islem_tarihi: KASA_BASLANGIC };
        const x = mevcut.get(h.ad);
        const { error } = x
          ? await supabase.from("kasa_manuel_islemler").update(satir).eq("id", x.id)
          : await supabase.from("kasa_manuel_islemler").insert([{ ...satir, ekleyen_kullanici: ekleyen }]);
        if (error) throw new Error(`${h.etiket}: ${error.message}`);
      }
      for (const k of kartlar) {
        const ham = (deger[`kart:${k.id}`] || "").trim();
        if (!ham) continue;
        const { error } = await supabase.from("kredi_kartlari").update({ acilis_borcu: tv(ham), acilis_tarihi: KASA_BASLANGIC }).eq("id", k.id);
        if (error) throw new Error(`${k.ad}: ${error.message}`);
      }
      setAcik(false); onKaydedildi();
    } catch (e) { setHata(e instanceof Error ? e.message : String(e)); }
    finally { setKaydediliyor(false); }
  };

  const kutu = "w-full bg-alan border border-cizgi-guclu text-yazi text-[15px] h-11 px-3 rounded-lg outline-none focus:border-altin text-right font-bold";
  const ozet = HESAPLAR.filter(h => mevcut.has(h.ad)).map(h => { const x = mevcut.get(h.ad)!; return `${h.etiket} ₺${fmt(x.tip === "gider" ? -x.tutar : x.tutar)}`; });

  return (
    <div className={`rounded-2xl border ${girildi ? "border-cizgi" : "border-altin/60"} bg-kart`}>
      <button type="button" onClick={() => acik ? setAcik(false) : ac()} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="flex items-center gap-2 text-[15px] font-bold text-yazi">
          {girildi && <CheckCircle2 size={16} className="text-emerald-400" />}
          {fmtTarih(KASA_BASLANGIC)} açılışı
          <span className="text-[13px] font-normal text-gray-600">
            {girildi ? ozet.join(" · ") + (kartGirildi ? " · kart borçları girildi" : "") : "— elde olan parayı ve kart borçlarını girin"}
          </span>
        </span>
        <span className="text-[13px] font-semibold text-altin flex items-center gap-1">{girildi ? "Düzelt" : "Gir"} {acik ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
      </button>
      {acik && (
        <div className="px-4 pb-4 space-y-4 border-t border-cizgi pt-3">
          <p className="text-[13px] text-gray-600">Ekim ayı arşivde kalır; bakiyeler bu tarihten itibaren sayılır. Firma borçları faturalar ve ödemelerden kendiliğinden hesaplanır. Açılış kâr/zarara girmez; tekrar kaydederseniz üzerine yazılır.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {HESAPLAR.map(h => (
              <label key={h.ad} className="space-y-1">
                <span className="block text-[14px] font-semibold text-yazi">{h.etiket}</span>
                <input inputMode="decimal" placeholder="0" value={deger[h.ad] || ""} onChange={e => setDeger(d => ({ ...d, [h.ad]: paraGirdisi(e.target.value) }))} className={kutu} />
                <span className="block text-[12px] text-gray-500">{h.ipucu}</span>
              </label>
            ))}
          </div>
          {kartlar.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {kartlar.map(k => (
                <label key={k.id} className="space-y-1">
                  <span className="block text-[14px] font-semibold text-yazi">{k.ad} — borç</span>
                  <input inputMode="decimal" placeholder="0" value={deger[`kart:${k.id}`] || ""} onChange={e => setDeger(d => ({ ...d, [`kart:${k.id}`]: paraGirdisi(e.target.value) }))} className={kutu} />
                  <span className="block text-[12px] text-gray-500">31 Ekim itibarıyla karttaki toplam borç</span>
                </label>
              ))}
            </div>
          )}
          {hata && <p className="text-[13px] text-red-400">{hata}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAcik(false)} className="h-11 px-4 rounded-xl border border-cizgi text-[14px] text-gray-600 hover:text-yazi">Vazgeç</button>
            <button type="button" onClick={kaydet} disabled={kaydediliyor}
              className="h-11 px-6 rounded-xl text-[14px] font-black text-[#1a1408] kebo-btn-altin disabled:opacity-40 flex items-center gap-2">
              {kaydediliyor && <Loader2 size={15} className="animate-spin" />} Kaydet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
