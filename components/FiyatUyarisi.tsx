"use client";

// ─── YÜKSEK FİYAT DEĞİŞİMİ UYARISI ──────────────────────────────────────────
// Her sayfanın en üstünde, büyük harflerle. Stokta fiyatı takip edilen bir ürünün yeni faturadaki fiyatı
// kayıtlı fiyattan %30'dan fazla farklıysa (public.fiyat_uyarilari) gösterilir.
// Kişi başınadır: "Gördüm" deyince sadece o kişinin ekranından kalkar; diğerleri girdiklerinde yine görür.
// Fiyat kararı (yeni fiyatı kabul et / eski fiyat kalsın) stok değeri yetkisi olanlarda; karar uyarıyı kimseden silmez.

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useYetki } from "@/lib/useYetki";
import { fmt2 } from "@/lib/para";
import { fmtTarih } from "@/lib/tarih";
import { kisaUnvan } from "@/lib/fiyatListesi";

interface Uyari {
  id: string; urun_id: string; urun_adi: string; birim: string | null; tedarikci: string | null;
  eski_fiyat: number | string; yeni_fiyat: number | string; oran: number | string;
  eski_tarih: string | null; yeni_tarih: string; gib_no: string;
  karar: "kabul" | "eski" | null; karar_veren: string | null;
}

const ad = (s: string | null) => (s ? s.charAt(0).toLocaleUpperCase("tr-TR") + s.slice(1) : "");

export default function FiyatUyarisi() {
  const pathname = usePathname();
  const yetki = useYetki();
  const [uyarilar, setUyarilar] = useState<Uyari[]>([]);
  const [islem, setIslem] = useState<string | null>(null);

  const yukle = useCallback(async () => {
    const { data, error } = await createClient().rpc("fiyat_uyarilari");
    if (!error) setUyarilar((data as Uyari[]) || []);
  }, []);

  // Her sayfa açılışında yeniden bakılır (yeni fatura gelmiş olabilir).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void yukle(); }, [yukle, pathname]);

  const gordum = async (u: Uyari) => {
    setIslem(u.id);
    const { error } = await createClient().rpc("fiyat_uyarisi_gordum", { p_id: u.id });
    setIslem(null);
    if (error) { alert("Kaydedilemedi: " + error.message); return; }
    setUyarilar(l => l.filter(x => x.id !== u.id));
  };

  const karar = async (u: Uyari, k: "kabul" | "eski") => {
    const soru = k === "kabul"
      ? `${u.urun_adi}: yeni fiyat ₺${fmt2(Number(u.yeni_fiyat))} stok fiyatı olarak kaydedilsin mi? (Stok değeri ve reçete maliyetleri bu fiyatla hesaplanır.)`
      : `${u.urun_adi}: eski fiyat ₺${fmt2(Number(u.eski_fiyat))} kalsın mı? (Faturadaki fiyat yanlış okunduysa bunu seçin.)`;
    if (!confirm(soru)) return;
    setIslem(u.id);
    const { error } = await createClient().rpc("fiyat_uyarisi_karar", { p_id: u.id, p_karar: k });
    setIslem(null);
    if (error) { alert("Kaydedilemedi: " + error.message); return; }
    void yukle();
  };

  if (!uyarilar.length) return null;
  const fiyatYetkisi = yetki.izin("stok_deger");

  return (
    <div className="mx-3 mt-3 lg:mx-6 lg:mt-6 rounded-2xl border-2 border-red-500/70 bg-red-950/60 p-4 lg:p-5 space-y-3" role="alert">
      <p className="text-[18px] lg:text-[22px] font-black uppercase tracking-wide text-red-200 leading-tight">
        ⚠ DİKKAT: FİYATI ÇOK DEĞİŞEN {uyarilar.length === 1 ? "ÜRÜN" : `${uyarilar.length} ÜRÜN`} VAR
      </p>
      <div className="space-y-2.5">
        {uyarilar.map(u => {
          const oran = Number(u.oran);
          const artis = oran > 0;
          return (
            <div key={u.id} className="rounded-xl bg-black/30 border border-red-500/30 px-3.5 py-3">
              <p className="text-[17px] lg:text-[19px] font-black uppercase text-white leading-snug">
                {u.urun_adi.toLocaleUpperCase("tr-TR")}:{" "}
                <span className={artis ? "text-red-300" : "text-emerald-300"}>
                  {artis ? "%" + Math.abs(oran).toLocaleString("tr-TR") + " ZAM" : "%" + Math.abs(oran).toLocaleString("tr-TR") + " İNDİRİM"}
                </span>
              </p>
              <p className="text-[15px] lg:text-[16px] font-bold text-red-100 mt-0.5">
                ₺{fmt2(Number(u.eski_fiyat))} → ₺{fmt2(Number(u.yeni_fiyat))}{u.birim ? ` / ${u.birim}` : ""}
                <span className="font-normal text-red-200/80">
                  {" "}· {kisaUnvan(u.tedarikci)} · fatura {fmtTarih(u.yeni_tarih)}{u.eski_tarih ? ` (önceki ${fmtTarih(u.eski_tarih)})` : ""}
                </span>
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-2.5">
                {u.karar ? (
                  <span className="text-[13px] font-semibold text-red-100/90">
                    {ad(u.karar_veren)} {u.karar === "kabul" ? "yeni fiyatı kabul etti." : "eski fiyatı bıraktı."}
                  </span>
                ) : fiyatYetkisi ? (<>
                  <button type="button" disabled={islem === u.id} onClick={() => karar(u, "kabul")}
                    className="h-10 px-3.5 rounded-lg bg-white/10 border border-white/20 text-[13px] font-bold text-white hover:bg-white/20 disabled:opacity-40">
                    Yeni fiyatı kabul et
                  </button>
                  <button type="button" disabled={islem === u.id} onClick={() => karar(u, "eski")}
                    className="h-10 px-3.5 rounded-lg bg-white/5 border border-white/15 text-[13px] font-semibold text-red-100 hover:bg-white/10 disabled:opacity-40">
                    Eski fiyat kalsın
                  </button>
                </>) : (
                  <span className="text-[13px] text-red-100/80">Fiyat kararını Murat ya da Bülent verecek.</span>
                )}
                <button type="button" disabled={islem === u.id} onClick={() => gordum(u)}
                  className="ml-auto h-10 px-4 rounded-lg bg-red-500 text-white text-[14px] font-black uppercase hover:bg-red-400 disabled:opacity-40">
                  Gördüm
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[12px] text-red-200/70">“Gördüm” sadece sizin ekranınızdan kaldırır; diğer kullanıcılar girdiklerinde kendileri görür.</p>
    </div>
  );
}
