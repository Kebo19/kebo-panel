"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { HelpCircle, X, Send, CheckCircle2, ImagePlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useYetki } from "@/lib/useYetki";
import { yuklemeIcinHazirla } from "@/lib/gorsel";
import { bugun } from "@/lib/tarih";

function base64Blob(base64: string, tip: string): Blob {
  const ikili = atob(base64);
  const dizi = new Uint8Array(ikili.length);
  for (let i = 0; i < ikili.length; i++) dizi[i] = ikili.charCodeAt(i);
  return new Blob([dizi], { type: tip });
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Sağ altta "Sorun bildir" düğmesi ve formu. */
export default function SorunBildir() {
  const pathname = usePathname();
  const yetki = useYetki();
  const [acik, setAcik] = useState(false);
  const [mesaj, setMesaj] = useState("");
  const [dosya, setDosya] = useState<File | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [gonderildi, setGonderildi] = useState(false);
  const [hata, setHata] = useState("");

  const kapat = () => {
    setAcik(false); setMesaj(""); setDosya(null); setGonderildi(false); setHata("");
  };

  const gonder = async () => {
    if (!mesaj.trim()) { setHata("Lütfen sorunu kısaca yazın."); return; }
    setGonderiliyor(true); setHata("");
    const supabase = createClient();
    try {
      let yol: string | null = null;
      if (dosya) {
        const hazir = await yuklemeIcinHazirla(dosya, 1600);
        if (hazir.mediaType === "application/pdf") throw new Error("Lütfen ekran görüntüsü (resim) seçin.");
        yol = `${bugun()}/${uuid()}.jpg`;
        const { error: yErr } = await supabase.storage.from("geri-bildirim")
          .upload(yol, base64Blob(hazir.base64, hazir.mediaType), { contentType: hazir.mediaType, upsert: false });
        if (yErr) throw new Error("Ekran görüntüsü yüklenemedi: " + yErr.message);
      }
      const sayfa = pathname + (typeof window !== "undefined" ? window.location.search : "");
      const { error } = await supabase.from("geri_bildirim").insert({
        kullanici: yetki.kullaniciAdi || null,
        sayfa,
        mesaj: mesaj.trim().slice(0, 4000),
        ekran_goruntusu: yol,
      });
      if (error) throw new Error(error.message);
      setGonderildi(true);
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Gönderilemedi, tekrar deneyin.");
    } finally {
      setGonderiliyor(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setAcik(true)}
        title="Sorun bildir"
        aria-label="Sorun bildir"
        className="fixed right-4 bottom-20 lg:bottom-5 lg:right-5 z-40 w-10 h-10 rounded-full bg-kart border border-cizgi shadow-md text-gray-500 hover:text-blue-400 hover:border-blue-500/25 flex items-center justify-center transition-colors print:hidden"
      >
        <HelpCircle size={18} />
      </button>

      {acik && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={kapat}>
          <div className="w-full sm:max-w-md bg-kart rounded-t-2xl sm:rounded-2xl border border-cizgi p-5 text-yazi"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">Sorun bildir</h2>
              <button onClick={kapat} className="p-1.5 text-gray-500 hover:text-yazi border border-cizgi rounded-lg">
                <X size={14} />
              </button>
            </div>

            {gonderildi ? (
              <div className="text-center py-6">
                <CheckCircle2 className="mx-auto text-green-400 mb-3" size={36} />
                <p className="font-semibold">Gönderildi, teşekkürler.</p>
                <p className="text-[13px] text-gray-500 mt-1">En kısa sürede incelenecek.</p>
                <button onClick={kapat} className="mt-5 px-4 py-2 rounded-xl kebo-btn-altin text-[#1a1408] text-sm font-semibold">Kapat</button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[12px] text-gray-500">Sayfa: <span className="font-mono">{pathname}</span></p>
                <textarea
                  value={mesaj}
                  onChange={e => setMesaj(e.target.value)}
                  rows={5}
                  autoFocus
                  placeholder="Ne oldu? Ne yapmak istiyordunuz?"
                  className="w-full rounded-xl border border-cizgi bg-kart p-3 text-[14px] outline-none focus:border-blue-400"
                />
                <label className="flex items-center gap-2 text-[13px] text-gray-600 cursor-pointer border border-dashed border-cizgi rounded-xl px-3 py-2.5 hover:border-blue-500/25">
                  <ImagePlus size={16} className="text-gray-500 shrink-0" />
                  <span className="truncate">{dosya ? dosya.name : "Ekran görüntüsü ekle (isteğe bağlı)"}</span>
                  <input type="file" accept="image/*" className="hidden"
                    onChange={e => setDosya(e.target.files?.[0] || null)} />
                </label>
                {hata && <p className="text-[13px] text-red-400">{hata}</p>}
                <button onClick={gonder} disabled={gonderiliyor}
                  className="w-full flex items-center justify-center gap-2 rounded-xl kebo-btn-altin hover:brightness-110 disabled:opacity-60 text-[#1a1408] py-2.5 text-sm font-semibold">
                  <Send size={15} /> {gonderiliyor ? "Gönderiliyor..." : "Gönder"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
