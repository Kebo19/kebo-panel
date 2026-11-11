"use client";

// ─── FİYAT DEĞİŞİKLİĞİ UYARISI ──────────────────────────────────────────────
// Her sayfanın en üstünde, büyük harflerle. Stokta fiyatı takip edilen bir ürünün faturadaki fiyatı
// bir önceki faturaya göre değiştiyse (01.11.2026'dan itibaren, public.fiyat_uyarilari) gösterilir.
// Kişi başınadır: "Gördüm" deyince sadece o kişinin ekranından kalkar; diğerleri girdiklerinde yine görür.
// Küçük değişimler stok fiyatına kendiliğinden işlenir. Kayıtlı stok fiyatından %30'dan fazla farklıysa
// (karar_gerekli) "Yeni fiyatı kabul et / Eski fiyat kalsın" düğmeleri çıkar (stok değeri yetkisi);
// karar uyarıyı kimseden silmez.

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
  karar_gerekli: boolean; stok_fiyati: number | string | null;
}

interface GecmisSatir {
  tarih: string; gib_no: string; tedarikci: string | null; kalem_adi: string; miktar: number | string | null; birim: string | null;
  fatura_birim_fiyat: number | string; iskonto_orani: number | string | null; net_fiyat: number | string; stok_birim_fiyat: number | string;
}

const ad = (s: string | null) => (s ? s.charAt(0).toLocaleUpperCase("tr-TR") + s.slice(1) : "");
const yuzde = (n: number) => "%" + Math.abs(n).toLocaleString("tr-TR", { maximumFractionDigits: 1 });

export default function FiyatUyarisi() {
  const pathname = usePathname();
  const yetki = useYetki();
  const [uyarilar, setUyarilar] = useState<Uyari[]>([]);
  const [islem, setIslem] = useState<string | null>(null);
  // Tıklanan uyarının altında o ürünün bütün geçmiş alış fiyatları (public.fiyat_gecmisi)
  const [acik, setAcik] = useState<string | null>(null);
  const [gecmis, setGecmis] = useState<Record<string, GecmisSatir[] | "yukleniyor" | { hata: string }>>({});

  const gecmisAc = async (u: Uyari) => {
    if (acik === u.id) { setAcik(null); return; }
    setAcik(u.id);
    if (Array.isArray(gecmis[u.urun_id])) return;
    setGecmis(g => ({ ...g, [u.urun_id]: "yukleniyor" }));
    const { data, error } = await createClient().rpc("fiyat_gecmisi", { p_urun_id: u.urun_id });
    setGecmis(g => ({ ...g, [u.urun_id]: error ? { hata: error.message } : ((data as GecmisSatir[]) || []) }));
  };

  const yukle = useCallback(async () => {
    const { data, error } = await createClient().rpc("fiyat_uyarilari");
    if (!error) setUyarilar((data as Uyari[]) || []);
  }, []);

  // Her sayfa açılışında yeniden bakılır (yeni fatura gelmiş olabilir).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void yukle(); }, [yukle, pathname]);

  const gordum = async (liste: Uyari[]) => {
    setIslem(liste.length > 1 ? "hepsi" : liste[0].id);
    const sonuc = await Promise.all(liste.map(u => createClient().rpc("fiyat_uyarisi_gordum", { p_id: u.id })));
    setIslem(null);
    const hata = sonuc.find(r => r.error)?.error;
    if (hata) { alert("Kaydedilemedi: " + hata.message); void yukle(); return; }
    const idler = new Set(liste.map(u => u.id));
    setUyarilar(l => l.filter(x => !idler.has(x.id)));
  };

  const karar = async (u: Uyari, k: "kabul" | "eski") => {
    const soru = k === "kabul"
      ? `${u.urun_adi}: yeni fiyat ₺${fmt2(Number(u.yeni_fiyat))} stok fiyatı olarak kaydedilsin mi? (Stok değeri ve reçete maliyetleri bu fiyatla hesaplanır.)`
      : `${u.urun_adi}: kayıtlı stok fiyatı ₺${fmt2(Number(u.stok_fiyati))} kalsın mı? (Faturadaki fiyat yanlış okunduysa bunu seçin.)`;
    if (!confirm(soru)) return;
    setIslem(u.id);
    const { error } = await createClient().rpc("fiyat_uyarisi_karar", { p_id: u.id, p_karar: k });
    setIslem(null);
    if (error) { alert("Kaydedilemedi: " + error.message); return; }
    void yukle();
  };

  if (!uyarilar.length) return null;
  const fiyatYetkisi = yetki.izin("stok_deger");
  const zamSayisi = uyarilar.filter(u => Number(u.oran) > 0).length;

  return (
    <div className="mx-3 mt-3 lg:mx-6 lg:mt-6 rounded-2xl border-2 border-amber-500/70 bg-amber-950/50 p-4 lg:p-5 space-y-3" role="alert">
      <div className="flex flex-wrap items-start gap-3">
        <p className="flex-1 text-[18px] lg:text-[22px] font-black uppercase tracking-wide text-amber-100 leading-tight">
          ⚠ FİYAT DEĞİŞİKLİĞİ: {uyarilar.length} ÜRÜN{zamSayisi ? ` (${zamSayisi} ZAM)` : ""}
        </p>
        {uyarilar.length > 1 && (
          <button type="button" disabled={!!islem} onClick={() => gordum(uyarilar)}
            className="h-10 px-4 rounded-lg bg-amber-500 text-[#1a1408] text-[13px] font-black uppercase hover:bg-amber-400 disabled:opacity-40">
            Hepsini gördüm
          </button>
        )}
      </div>
      <div className="space-y-2.5">
        {uyarilar.map(u => {
          const oran = Number(u.oran);
          const artis = oran > 0;
          const cok = Math.abs(oran) > 30;
          return (
            <div key={u.id} className={`rounded-xl bg-black/30 border px-3.5 py-3 ${u.karar_gerekli ? "border-red-500/70" : "border-amber-500/25"}`}>
              <button type="button" onClick={() => gecmisAc(u)} className="block w-full text-left group" aria-expanded={acik === u.id}>
                <p className="text-[17px] lg:text-[19px] font-black uppercase text-white leading-snug">
                  {u.urun_adi.toLocaleUpperCase("tr-TR")}:{" "}
                  <span className={artis ? "text-red-300" : "text-emerald-300"}>
                    {yuzde(oran)} {artis ? "ZAM" : "İNDİRİM"}{cok ? " (ÇOK)" : ""}
                  </span>
                </p>
                <p className="text-[15px] lg:text-[16px] font-bold text-amber-50 mt-0.5">
                  ₺{fmt2(Number(u.eski_fiyat))} → ₺{fmt2(Number(u.yeni_fiyat))}{u.birim ? ` / ${u.birim}` : ""}
                  <span className="font-normal text-amber-100/75">
                    {" "}· {kisaUnvan(u.tedarikci)} · fatura {fmtTarih(u.yeni_tarih)}{u.eski_tarih ? ` (önceki ${fmtTarih(u.eski_tarih)})` : ""}
                  </span>
                </p>
                <p className="text-[13px] font-semibold text-amber-300 mt-1 group-hover:underline">
                  {acik === u.id ? "▲ Geçmiş fiyatları kapat" : "▼ Geçmiş bütün alış fiyatlarını gör"}
                </p>
              </button>
              {acik === u.id && <GecmisTablo veri={gecmis[u.urun_id]} birim={u.birim} />}
              <div className="flex flex-wrap items-center gap-2 mt-2.5">
                {u.karar ? (
                  <span className="text-[13px] font-semibold text-amber-50/90">
                    {ad(u.karar_veren)} {u.karar === "kabul" ? "yeni fiyatı kabul etti." : "kayıtlı stok fiyatını bıraktı."}
                  </span>
                ) : u.karar_gerekli ? (
                  <>
                    <span className="w-full text-[13px] font-semibold text-red-200">
                      Stokta kayıtlı fiyat ₺{fmt2(Number(u.stok_fiyati))} — fark %30&apos;dan büyük olduğu için kendiliğinden güncellenmedi.
                    </span>
                    {fiyatYetkisi ? (<>
                      <button type="button" disabled={islem === u.id} onClick={() => karar(u, "kabul")}
                        className="h-10 px-3.5 rounded-lg bg-white/10 border border-white/20 text-[13px] font-bold text-white hover:bg-white/20 disabled:opacity-40">
                        Yeni fiyatı kabul et
                      </button>
                      <button type="button" disabled={islem === u.id} onClick={() => karar(u, "eski")}
                        className="h-10 px-3.5 rounded-lg bg-white/5 border border-white/15 text-[13px] font-semibold text-amber-50 hover:bg-white/10 disabled:opacity-40">
                        Eski fiyat kalsın
                      </button>
                    </>) : (
                      <span className="text-[13px] text-amber-50/80">Fiyat kararını Murat ya da Bülent verecek.</span>
                    )}
                  </>
                ) : (
                  <span className="text-[13px] text-amber-50/70">Stok fiyatı kendiliğinden güncellendi.</span>
                )}
                <button type="button" disabled={islem === u.id || islem === "hepsi"} onClick={() => gordum([u])}
                  className="ml-auto h-10 px-4 rounded-lg bg-amber-500 text-[#1a1408] text-[14px] font-black uppercase hover:bg-amber-400 disabled:opacity-40">
                  Gördüm
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[12px] text-amber-100/60">“Gördüm” sadece sizin ekranınızdan kaldırır; diğer kullanıcılar girdiklerinde kendileri görür.</p>
    </div>
  );
}

// ─── Geçmiş alış fiyatları tablosu ──────────────────────────────────────────
function GecmisTablo({ veri, birim }: { veri: GecmisSatir[] | "yukleniyor" | { hata: string } | undefined; birim: string | null }) {
  if (!veri || veri === "yukleniyor") return <p className="mt-3 text-[13px] text-amber-50/70">Geçmiş fiyatlar yükleniyor…</p>;
  if (!Array.isArray(veri)) return <p className="mt-3 text-[13px] text-red-300">Geçmiş fiyatlar alınamadı: {veri.hata}</p>;
  if (!veri.length) return <p className="mt-3 text-[13px] text-amber-50/70">Bu ürün için fatura kaydı bulunamadı.</p>;

  const fiyatlar = veri.map(r => Number(r.stok_birim_fiyat));
  const enDusuk = Math.min(...fiyatlar), enYuksek = Math.max(...fiyatlar);
  const ilk = fiyatlar[fiyatlar.length - 1], son = fiyatlar[0];
  const toplamDegisim = ilk > 0 ? ((son - ilk) / ilk) * 100 : 0;
  // Fatura birimi stok biriminden farklıysa (ör. teneke → lt) iki fiyat da gösterilir
  const ikiFiyat = veri.some(r => Math.abs(Number(r.net_fiyat) - Number(r.stok_birim_fiyat)) > 0.005);
  const bu = birim ? ` / ${birim}` : "";

  return (
    <div className="mt-3 rounded-lg bg-black/30 border border-white/10 overflow-hidden">
      <div className="flex flex-wrap gap-x-5 gap-y-1 px-3 py-2 text-[13px] text-amber-50 border-b border-white/10">
        <span>{veri.length} alış · {fmtTarih(veri[veri.length - 1].tarih)} – {fmtTarih(veri[0].tarih)}</span>
        <span>En düşük <b>₺{fmt2(enDusuk)}</b>{bu}</span>
        <span>En yüksek <b>₺{fmt2(enYuksek)}</b>{bu}</span>
        {veri.length > 1 && (
          <span>Baştan bugüne <b className={toplamDegisim > 0 ? "text-red-300" : "text-emerald-300"}>
            {toplamDegisim > 0 ? "+" : "−"}{yuzde(toplamDegisim)}</b></span>
        )}
      </div>
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-[#1a1408] text-amber-200/80">
            <tr>
              <th className="text-left font-semibold px-3 py-1.5">Tarih</th>
              <th className="text-left font-semibold px-2 py-1.5 hidden sm:table-cell">Firma</th>
              <th className="text-right font-semibold px-2 py-1.5">Miktar</th>
              {ikiFiyat && <th className="text-right font-semibold px-2 py-1.5">Fatura fiyatı</th>}
              <th className="text-right font-semibold px-2 py-1.5">Fiyat{bu}</th>
              <th className="text-right font-semibold px-3 py-1.5">Değişim</th>
            </tr>
          </thead>
          <tbody>
            {veri.map((r, i) => {
              const f = Number(r.stok_birim_fiyat);
              const onceki = i + 1 < veri.length ? Number(veri[i + 1].stok_birim_fiyat) : null;
              const d = onceki && onceki > 0 ? ((f - onceki) / onceki) * 100 : null;
              const isk = Number(r.iskonto_orani) || 0;
              return (
                <tr key={r.gib_no + i} className="border-t border-white/5 text-amber-50/90">
                  <td className="px-3 py-1.5 whitespace-nowrap">{fmtTarih(r.tarih)}</td>
                  <td className="px-2 py-1.5 hidden sm:table-cell">{kisaUnvan(r.tedarikci)}</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    {r.miktar != null ? Number(r.miktar).toLocaleString("tr-TR") : "—"} {(r.birim || "").toLocaleLowerCase("tr-TR")}
                  </td>
                  {ikiFiyat && (
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      ₺{fmt2(Number(r.net_fiyat))}{isk ? <span className="text-amber-200/60"> (−%{isk.toLocaleString("tr-TR")})</span> : null}
                    </td>
                  )}
                  <td className="px-2 py-1.5 text-right font-bold whitespace-nowrap">
                    ₺{fmt2(f)}{!ikiFiyat && isk ? <span className="font-normal text-amber-200/60"> (−%{isk.toLocaleString("tr-TR")})</span> : null}
                  </td>
                  <td className={`px-3 py-1.5 text-right whitespace-nowrap ${d == null || Math.abs(d) < 0.5 ? "text-amber-50/40" : d > 0 ? "text-red-300" : "text-emerald-300"}`}>
                    {d == null ? "—" : Math.abs(d) < 0.5 ? "=" : `${d > 0 ? "+" : "−"}${yuzde(d)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
