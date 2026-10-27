"use client";

// Kağıt kasa formu ve sayım listeleri: ürünler stoktan canlı gelir, sayfa tarayıcıdan yazdırılır.
// Ön yüz kasa formu + arka yüz günlük sayım (çift taraflı) ya da tek sayfa günlük / haftalık / aylık / envanter sayımı.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useYetki } from "@/lib/useYetki";
import { kagitBelgesi, grupUrunleri, PERIYOT_ADI, type SayimPeriyodu } from "@/lib/kasaFormu";
import { ArrowLeft, Loader2, Printer } from "lucide-react";

type Urun = { id: string; urun_adi: string; birim: string; kategori: string | null; sayim_periyodu: string | null; sira_no: number | null; sayim_yeri: string | null };

type Secim = "kasa" | SayimPeriyodu;
const SECENEKLER: { v: Secim; l: string; a: string }[] = [
  { v: "kasa", l: "Kasa formu + günlük sayım", a: "Çift taraflı: ön yüz kasa raporu, arka yüz günlük sayım" },
  { v: "gunluk", l: "Günlük sayım", a: "Sadece günlükler" },
  { v: "haftalik", l: "Haftalık sayım", a: "Günlük + haftalık" },
  { v: "aylik", l: "Aylık sayım", a: "Günlük + haftalık + aylık" },
  { v: "envanter", l: "Envanter sayımı", a: "Demirbaşlar (ara sıra)" },
];

export default function KagitFormPage() {
  const supabase = useMemo(() => createClient(), []);
  const yetki = useYetki();
  const izinli = yetki.izin("stok") || yetki.izin("rapor_gir");
  const [urunler, setUrunler] = useState<Urun[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [secim, setSecim] = useState<Secim>("kasa");
  const cerceve = useRef<HTMLIFrameElement>(null);

  // /stok/kagit?liste=haftalik gibi doğrudan bir liste açılabilir (Liste düzenle sayfasındaki "Yazdır")
  useEffect(() => {
    const l = new URLSearchParams(window.location.search).get("liste");
    if (l && SECENEKLER.some(s => s.v === l)) setSecim(l as Secim);
  }, []);

  useEffect(() => {
    if (yetki.yukleniyor || !izinli) return;
    let iptal = false;
    supabase.from("stok_urunler").select("id,urun_adi,birim,kategori,sayim_periyodu,sira_no,sayim_yeri").eq("durum", "aktif")
      .then(({ data, error }) => { if (iptal) return; if (error) setHata(error.message); else setUrunler((data || []) as Urun[]); });
    return () => { iptal = true; };
  }, [supabase, yetki.yukleniyor, izinli]);

  const periyot: SayimPeriyodu = secim === "kasa" ? "gunluk" : secim;
  const liste = useMemo(() => urunler ? grupUrunleri(urunler, periyot) : [], [urunler, periyot]);
  const html = useMemo(() => kagitBelgesi(liste, periyot, secim === "kasa"), [liste, periyot, secim]);

  const yazdir = () => { const w = cerceve.current?.contentWindow; if (w) { w.focus(); w.print(); } };

  if (yetki.yukleniyor) return <div className="h-screen bg-zemin flex items-center justify-center"><Loader2 className="animate-spin text-emerald-400"/></div>;
  if (!izinli) return <div className="min-h-screen bg-zemin flex items-center justify-center p-6 text-sm text-gray-600">Bu sayfayı görme yetkiniz yok.</div>;

  return (
    <div className="min-h-screen bg-zemin text-yazi">
      <div className="max-w-screen-lg mx-auto px-4 py-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/stok" className="p-2 border border-cizgi rounded-xl text-gray-500 hover:text-yazi"><ArrowLeft size={16}/></Link>
            <div>
              <h1 className="text-lg font-black">Kağıt Formlar</h1>
              <p className="text-[11px] text-gray-600">Ürünler Stok sayfasındaki sayım gruplarından gelir. Ürün ekleyince ya da grubu değişince yeniden yazdırın.</p>
            </div>
          </div>
          <button onClick={yazdir} disabled={!urunler}
            className="flex items-center gap-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 px-4 py-2 rounded-xl">
            <Printer size={14}/> Yazdır
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {SECENEKLER.map(s => (
            <button key={s.v} onClick={() => setSecim(s.v)}
              className={`text-left rounded-xl border p-3 ${secim === s.v ? "border-emerald-500/60 bg-emerald-500/10" : "border-cizgi bg-kart hover:border-emerald-500/30"}`}>
              <div className="text-xs font-bold">{s.l}</div>
              <div className="text-[10px] text-gray-600 mt-0.5">{s.a}</div>
            </button>
          ))}
        </div>

        {hata && <p className="text-xs text-red-400">{hata}</p>}
        <p className="text-[11px] text-gray-600">
          {PERIYOT_ADI[periyot]} sayım listesinde <b className="text-yazi">{liste.length}</b> ürün var.
          {secim === "kasa" && " Yazıcıda “çift taraflı (uzun kenardan çevir)” seçin."}
          {" "}Doldurulan sayım kağıdını Stok → “Sayım kağıdı tara” ile telefondan sisteme girebilirsiniz.
        </p>

        {!urunler ? (
          <div className="h-64 flex items-center justify-center"><Loader2 className="animate-spin text-emerald-400"/></div>
        ) : (
          <iframe ref={cerceve} srcDoc={html} title="Kağıt önizleme"
            className="w-full bg-white rounded-xl border border-cizgi" style={{ height: secim === "kasa" ? 2300 : 1150 }}/>
        )}
      </div>
    </div>
  );
}
