"use client";

// PERSONEL FOTOĞRAFI (31.10.2026)
// • Telefonda çekilen/seçilen fotoğraf tarayıcıda küçültülür (en fazla 480 px, JPEG %70 → ~30-50 KB),
//   gizli "personel-foto" deposuna yüklenir, yolu personeller.foto_yolu'na yazılır.
// • İsmin yanında küçük yuvarlak görünür; tıklayınca büyür. Fotoğraf yoksa baş harfler.
// Depo gizli olduğu için resim 1 saatlik imzalı adresle gösterilir (sayfa içinde önbellekli).

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Camera, Loader2, X } from "lucide-react";

const MAKS_KENAR = 480;
const KALITE = 0.7;
const onbellek = new Map<string, { url: string; bitis: number }>();

async function imzaliAdres(supabase: ReturnType<typeof createClient>, yol: string): Promise<string | null> {
  const o = onbellek.get(yol);
  if (o && o.bitis > Date.now()) return o.url;
  const { data } = await supabase.storage.from("personel-foto").createSignedUrl(yol, 3600);
  if (!data?.signedUrl) return null;
  onbellek.set(yol, { url: data.signedUrl, bitis: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}

/** Fotoğrafı küçültür (yönü düzeltilmiş, en uzun kenar 480 px) ve JPEG'e çevirir. */
export async function fotoKucult(dosya: File): Promise<Blob> {
  const bmp = await createImageBitmap(dosya, { imageOrientation: "from-image" });
  const oran = Math.min(1, MAKS_KENAR / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * oran), h = Math.round(bmp.height * oran);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return await new Promise<Blob>((ok, red) => c.toBlob(b => (b ? ok(b) : red(new Error("Fotoğraf küçültülemedi"))), "image/jpeg", KALITE));
}

const basHarf = (isim: string) => isim.split(" ").filter(Boolean).map(n => n[0]).slice(0, 2).join("").toLocaleUpperCase("tr-TR");

/** İsmin yanındaki küçük fotoğraf; tıklayınca büyür. */
export function PersonelAvatar({ yol, isim, boyut = 36, buyutulebilir = true }: { yol?: string | null; isim: string; boyut?: number; buyutulebilir?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [url, setUrl] = useState<string | null>(null);
  const [buyuk, setBuyuk] = useState(false);
  useEffect(() => {
    let iptal = false;
    if (yol) imzaliAdres(supabase, yol).then(u => { if (!iptal) setUrl(u); });
    else setUrl(null);
    return () => { iptal = true; };
  }, [yol, supabase]);
  const stil = { width: boyut, height: boyut };
  if (!url) return (
    <div style={stil} className="rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 font-bold text-blue-400"
      aria-hidden="true"><span style={{ fontSize: Math.max(11, boyut * 0.36) }}>{basHarf(isim)}</span></div>
  );
  return (
    <>
      <button type="button" aria-label={`${isim} fotoğrafını büyüt`} disabled={!buyutulebilir}
        onClick={e => { e.preventDefault(); e.stopPropagation(); setBuyuk(true); }}
        style={stil} className="rounded-full overflow-hidden shrink-0 border border-cizgi-guclu">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={isim} className="w-full h-full object-cover" />
      </button>
      {buyuk && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4" onClick={e => { e.preventDefault(); e.stopPropagation(); setBuyuk(false); }}>
          <div className="relative" onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={isim} className="max-w-[90vw] max-h-[80vh] rounded-2xl" />
            <p className="text-center text-white text-[15px] font-bold mt-2">{isim}</p>
            <button type="button" aria-label="Kapat" onClick={() => setBuyuk(false)} className="absolute -top-3 -right-3 w-10 h-10 rounded-full bg-black/70 text-white flex items-center justify-center"><X size={18} /></button>
          </div>
        </div>
      )}
    </>
  );
}

/** Fotoğraf yükle / değiştir / kaldır (personel detay sayfası). */
export function PersonelFotoYukle({ personelId, yol, onDegisti }: { personelId: string | number; yol?: string | null; onDegisti: (yeniYol: string | null) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const girdi = useRef<HTMLInputElement>(null);
  const [isliyor, setIsliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const yukle = async (dosya: File) => {
    setHata(null); setIsliyor(true);
    try {
      const blob = await fotoKucult(dosya);
      const yeniYol = `${personelId}/${Date.now()}.jpg`;
      const { error } = await supabase.storage.from("personel-foto").upload(yeniYol, blob, { contentType: "image/jpeg", upsert: false });
      if (error) throw new Error(error.message);
      const { error: e2 } = await supabase.from("personeller").update({ foto_yolu: yeniYol }).eq("id", personelId);
      if (e2) { await supabase.storage.from("personel-foto").remove([yeniYol]); throw new Error(e2.message); }
      if (yol) await supabase.storage.from("personel-foto").remove([yol]); // eskisi yer kaplamasın
      onDegisti(yeniYol);
    } catch (e) { setHata("Yüklenemedi: " + (e instanceof Error ? e.message : String(e))); }
    finally { setIsliyor(false); }
  };

  const kaldir = async () => {
    if (!yol || !confirm("Fotoğraf kaldırılsın mı?")) return;
    setIsliyor(true);
    const { error } = await supabase.from("personeller").update({ foto_yolu: null }).eq("id", personelId);
    if (!error) { await supabase.storage.from("personel-foto").remove([yol]); onDegisti(null); } else setHata(error.message);
    setIsliyor(false);
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <input ref={girdi} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) yukle(f); e.target.value = ""; }} />
      <div className="flex items-center gap-2">
        <button type="button" disabled={isliyor} onClick={() => girdi.current?.click()}
          className="h-9 px-3 rounded-lg border border-cizgi text-[13px] font-semibold text-gray-700 hover:text-yazi flex items-center gap-1.5">
          {isliyor ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />} {yol ? "Fotoğrafı değiştir" : "Fotoğraf ekle"}
        </button>
        {yol && <button type="button" disabled={isliyor} onClick={kaldir} className="text-[12px] text-gray-500 hover:text-red-400 underline">kaldır</button>}
      </div>
      {hata && <p className="text-[12px] text-red-400">{hata}</p>}
    </div>
  );
}
