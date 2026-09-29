"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useYetki } from "@/lib/useYetki";
import { zamanMetni } from "@/lib/islemGecmisi";
import { cn } from "@/lib/utils";

interface Bildirim {
  id: string;
  kullanici: string | null;
  sayfa: string | null;
  mesaj: string;
  ekran_goruntusu: string | null;
  durum: string;
  created_at: string;
}

interface HataKaydi {
  id: number;
  kullanici: string | null;
  sayfa: string | null;
  mesaj: string;
  detay: Record<string, unknown> | null;
  created_at: string;
}

const DURUMLAR = [
  { deger: "yeni", ad: "Yeni", renk: "bg-amber-50 text-amber-700 border-amber-200" },
  { deger: "inceleniyor", ad: "İnceleniyor", renk: "bg-blue-50 text-blue-700 border-blue-200" },
  { deger: "cozuldu", ad: "Çözüldü", renk: "bg-green-50 text-green-700 border-green-200" },
];

export default function BildirimlerPage() {
  const yetki = useYetki();
  const yonetimIzni = yetki.izin("yonetim");
  const [sekme, setSekme] = useState<"bildirim" | "hata">("bildirim");
  const [bildirimler, setBildirimler] = useState<Bildirim[]>([]);
  const [hatalar, setHatalar] = useState<HataKaydi[]>([]);
  const [resimler, setResimler] = useState<Record<string, string>>({});
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState("");
  const [acikHata, setAcikHata] = useState<number | null>(null);

  const yukle = useCallback(async () => {
    setYukleniyor(true); setHata("");
    const supabase = createClient();
    const [b, h] = await Promise.all([
      supabase.from("geri_bildirim").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("hata_kayitlari").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    if (b.error || h.error) setHata((b.error || h.error)!.message);
    const liste = (b.data as Bildirim[]) || [];
    setBildirimler(liste);
    setHatalar((h.data as HataKaydi[]) || []);
    const yollar = liste.map(x => x.ekran_goruntusu).filter((y): y is string => !!y);
    if (yollar.length) {
      const { data } = await supabase.storage.from("geri-bildirim").createSignedUrls(yollar, 3600);
      const m: Record<string, string> = {};
      (data || []).forEach(d => { if (d.path && d.signedUrl) m[d.path] = d.signedUrl; });
      setResimler(m);
    }
    setYukleniyor(false);
  }, []);

  useEffect(() => {
    if (!yonetimIzni) return;
    const t = setTimeout(yukle, 0);
    return () => clearTimeout(t);
  }, [yukle, yonetimIzni]);

  const durumDegistir = async (id: string, durum: string) => {
    const onceki = bildirimler;
    setBildirimler(bs => bs.map(b => b.id === id ? { ...b, durum } : b));
    const { error } = await createClient().from("geri_bildirim").update({ durum }).eq("id", id);
    if (error) { alert("Durum kaydedilemedi: " + error.message); setBildirimler(onceki); }
  };

  if (yetki.yukleniyor) return <main className="p-5 text-sm text-gray-500">Yükleniyor...</main>;
  if (!yonetimIzni) return <main className="p-5 text-sm text-gray-500">Bu sayfa için yönetim (işlem geçmişi &amp; bildirimler) yetkisi gerekir.</main>;

  const yeniSayisi = bildirimler.filter(b => b.durum === "yeni").length;

  return (
    <main className="min-h-screen bg-[#f4f5f7] text-[#1a1f2e] p-4 sm:p-5">
      <div className="pt-5 mb-5 flex items-center gap-3">
        <Link href="/ayarlar" className="p-2 rounded-xl border border-[#e2e5eb] bg-[#ffffff] text-gray-500 hover:text-[#1a1f2e]">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-black">Sorun bildirimleri</h1>
          <p className="text-[13px] text-gray-500">Kullanıcı bildirimleri ve sistem hata kayıtları</p>
        </div>
        <button onClick={yukle} title="Yenile" className="p-2 rounded-xl border border-[#e2e5eb] bg-[#ffffff] text-gray-500">
          <RefreshCw size={16} className={yukleniyor ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        {([["bildirim", `Bildirimler${yeniSayisi ? ` (${yeniSayisi} yeni)` : ""}`], ["hata", `Hata kayıtları (${hatalar.length})`]] as const).map(([k, ad]) => (
          <button key={k} onClick={() => setSekme(k)}
            className={cn("px-4 py-2 rounded-xl text-[13px] font-semibold border",
              sekme === k ? "bg-blue-600 text-white border-blue-600" : "bg-[#ffffff] text-gray-600 border-[#e2e5eb]")}>
            {ad}
          </button>
        ))}
      </div>

      {hata && <p className="text-[13px] text-red-600 mb-3">{hata}</p>}

      {sekme === "bildirim" ? (
        <div className="space-y-3 max-w-3xl">
          {!bildirimler.length && !yukleniyor && <p className="text-[13px] text-gray-500">Henüz bildirim yok.</p>}
          {bildirimler.map(b => {
            const d = DURUMLAR.find(x => x.deger === b.durum) || DURUMLAR[0];
            const resim = b.ekran_goruntusu ? resimler[b.ekran_goruntusu] : null;
            return (
              <div key={b.id} className="bg-[#ffffff] border border-[#e2e5eb] rounded-2xl p-4 flex gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[12px] text-gray-500 mb-2">
                    <span className="tabular-nums">{zamanMetni(b.created_at)}</span>
                    <span>·</span>
                    <span className="font-semibold text-[#1a1f2e]">{b.kullanici || "—"}</span>
                    <span>·</span>
                    <span className="font-mono truncate">{b.sayfa || "—"}</span>
                  </div>
                  <p className="text-[14px] whitespace-pre-wrap break-words">{b.mesaj}</p>
                  <select value={b.durum} onChange={e => durumDegistir(b.id, e.target.value)}
                    className={cn("mt-3 rounded-lg border px-2 py-1 text-[12px] font-semibold outline-none", d.renk)}>
                    {DURUMLAR.map(x => <option key={x.deger} value={x.deger}>{x.ad}</option>)}
                  </select>
                </div>
                {b.ekran_goruntusu && (
                  resim ? (
                    <a href={resim} target="_blank" rel="noreferrer" className="shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={resim} alt="Ekran görüntüsü" className="w-24 h-24 object-cover rounded-xl border border-[#e2e5eb]" />
                    </a>
                  ) : <div className="w-24 h-24 shrink-0 rounded-xl border border-[#e2e5eb] bg-[#f4f5f7] text-[11px] text-gray-400 flex items-center justify-center text-center p-2">Görsel açılamadı</div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-[#ffffff] border border-[#e2e5eb] rounded-2xl overflow-hidden">
          {!hatalar.length && !yukleniyor && <p className="p-5 text-[13px] text-gray-500">Hata kaydı yok.</p>}
          {hatalar.map(h => (
            <div key={h.id} className="border-b border-[#e2e5eb] last:border-b-0">
              <button onClick={() => setAcikHata(acikHata === h.id ? null : h.id)}
                className="w-full text-left px-4 py-3 text-[13px] hover:bg-black/[0.02]">
                <div className="flex flex-wrap gap-2 text-[12px] text-gray-500 mb-1">
                  <span className="tabular-nums">{zamanMetni(h.created_at)}</span>
                  <span>·</span>
                  <span className="font-semibold text-[#1a1f2e]">{h.kullanici || "—"}</span>
                  <span>·</span>
                  <span className="font-mono truncate">{h.sayfa || "—"}</span>
                </div>
                <p className="text-red-700 break-words">{h.mesaj}</p>
              </button>
              {acikHata === h.id && h.detay && (
                <pre className="mx-4 mb-4 text-[11px] bg-[#f4f5f7] border border-[#e2e5eb] rounded-xl p-3 overflow-auto max-h-80 whitespace-pre-wrap break-all">
                  {JSON.stringify(h.detay, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
