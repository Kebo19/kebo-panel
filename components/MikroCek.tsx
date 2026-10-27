"use client";

// "Mikro'dan şimdi çek": panel bir talep yazar, dükkân bilgisayarındaki robot 5 dakika içinde alır,
// Mikro'daki yeni faturaları okuyup Faturalar'a, carilere ve stok fiyatlarına işler. Sonuç burada
// (ve bağlıysa Telegram'da) rapor olarak görünür.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DownloadCloud, Loader2, Monitor, CheckCircle2, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import type { MikroRapor } from "@/lib/telegram/ozet";

interface Durum {
  pc_son_gorulme: string | null;
  son_calisma: { bitti: string | null; durum: string; mesaj: string | null } | null;
  talep: (MikroRapor & { id: string }) | null;
}

const tl = (v: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Math.round(v || 0)) + " ₺";
const zaman = (t: string) => new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(t));
const dakikaOnce = (t: string | null) => (t ? Math.max(0, Math.round((Date.now() - Date.parse(t)) / 60000)) : null);

export default function MikroCek({ onBitti }: { onBitti?: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [d, setD] = useState<Durum | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [istekte, setIstekte] = useState(false);
  const [acik, setAcik] = useState(false);
  const oncekiDurum = useRef<string | null>(null);

  const yukle = useCallback(async () => {
    const { data, error } = await supabase.rpc("mikro_durum");
    if (error) { setHata(error.message); return; }
    const yeni = data as Durum;
    const td = yeni.talep?.durum || null;
    if (oncekiDurum.current && ["bekliyor", "calisiyor"].includes(oncekiDurum.current) && td && ["bitti", "hata"].includes(td)) {
      setAcik(true); onBitti?.();
    }
    oncekiDurum.current = td;
    setD(yeni);
  }, [supabase, onBitti]);

  useEffect(() => { yukle(); }, [yukle]);
  const aktif = !!d?.talep && ["bekliyor", "calisiyor"].includes(d.talep.durum);
  useEffect(() => {
    if (!aktif) return;
    const t = setInterval(yukle, 8000);
    return () => clearInterval(t);
  }, [aktif, yukle]);

  const iste = async () => {
    setIstekte(true); setHata(null);
    const { data, error } = await supabase.rpc("mikro_talep_olustur");
    setIstekte(false);
    if (error) { setHata(error.message); return; }
    oncekiDurum.current = "bekliyor";
    setD(data as Durum);
  };

  if (!d) return null;
  const pcDk = dakikaOnce(d.pc_son_gorulme);
  const pcAcik = pcDk !== null && pcDk <= 10;
  const t = d.talep;
  const sonTalepYakin = t && dakikaOnce(t.bitti || t.istendi)! < 24 * 60;

  return (
    <div className="rounded-2xl border border-cizgi bg-kart p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black text-yazi flex items-center gap-2"><DownloadCloud size={14} className="text-sky-400" /> Mikro&apos;dan şimdi çek</p>
          <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1.5">
            <Monitor size={11} className={pcAcik ? "text-emerald-400" : "text-amber-400"} />
            {pcDk === null ? "Dükkân bilgisayarında robot henüz kurulmadı."
              : pcAcik ? `Dükkân bilgisayarı açık (${pcDk === 0 ? "az önce" : `${pcDk} dk önce`} görüldü).`
              : `Dükkân bilgisayarı ${pcDk < 120 ? `${pcDk} dakikadır` : `en son ${zaman(d.pc_son_gorulme!)}`} görünmüyor; istek açılınca çalışır.`}
            {d.son_calisma?.bitti && <span className="text-gray-600">· son çalışma {zaman(d.son_calisma.bitti)}</span>}
          </p>
        </div>
        <button onClick={iste} disabled={istekte || aktif}
          className="flex items-center gap-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 px-4 py-2 rounded-xl">
          {istekte || aktif ? <Loader2 size={13} className="animate-spin" /> : <DownloadCloud size={13} />}
          {aktif ? (t!.durum === "calisiyor" ? "Faturalar okunuyor…" : "Robot bekleniyor…") : "Faturaları şimdi çek"}
        </button>
      </div>
      {aktif && (
        <p className="text-[11px] text-sky-300">
          {t!.durum === "bekliyor" ? "İstek gönderildi. Dükkân bilgisayarındaki robot en geç 5 dakika içinde başlayacak." : "Robot Mikro'dan faturaları okuyor; birkaç dakika sürebilir."}
          {" "}Bu sayfadan çıkabilirsiniz; Telegram bağlıysa sonuç oraya da gelir.
        </p>
      )}
      {hata && <p className="text-[11px] text-red-400">{hata}</p>}

      {t && !aktif && sonTalepYakin && (
        <div className={`rounded-xl border p-3 ${t.durum === "hata" ? "border-red-500/30 bg-red-500/5" : "border-emerald-500/25 bg-emerald-500/5"}`}>
          <button onClick={() => setAcik(!acik)} className="w-full flex items-center justify-between gap-2 text-left">
            <span className="text-[12px] font-semibold flex items-center gap-1.5">
              {t.durum === "hata" ? <XCircle size={13} className="text-red-400" /> : <CheckCircle2 size={13} className="text-emerald-400" />}
              {t.durum === "hata" ? "Son çekme başarısız" : `Son çekme: ${t.faturalar.length} yeni fatura`} · {zaman(t.bitti || t.istendi)}{t.isteyen_ad ? ` · ${t.isteyen_ad}` : ""}
            </span>
            {acik ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {acik && (
            <div className="mt-2 space-y-2 text-[11px] text-gray-400">
              <p>{t.mesaj}</p>
              {t.faturalar.length > 0 && (
                <table className="w-full">
                  <tbody>
                    {t.faturalar.map((f, i) => (
                      <tr key={i} className="border-t border-cizgi/60">
                        <td className="py-1 pr-2 whitespace-nowrap">{f.tarih.split("-").reverse().join(".")}</td>
                        <td className="py-1 pr-2">{f.cari}</td>
                        <td className="py-1 pr-2 text-gray-600">{f.no}</td>
                        <td className="py-1 text-right font-semibold text-yazi whitespace-nowrap">{tl(Number(f.tutar))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {(t.fiyat?.guncellenen || []).length > 0 && (
                <div>
                  <p className="font-semibold text-gray-300">Fiyatı güncellenen stok ürünleri</p>
                  {(t.fiyat!.guncellenen || []).map((x, i) => (
                    <p key={i}>{x.urun}: {Number(x.eski).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} → {Number(x.yeni).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ₺</p>
                  ))}
                </div>
              )}
              {(t.fiyat?.kontrol || []).length > 0 && (
                <p className="text-amber-300">{t.fiyat!.kontrol!.length} fiyat %30&apos;dan fazla değişti; Fiyat Listesi&apos;nde kontrol edin.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
