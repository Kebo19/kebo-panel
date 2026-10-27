"use client";

// Ayarlar → Telegram: kurulum (Tam Yetkili, bir kez) ve hesabı bağlama (her kullanıcı).
// Bağlama: panel tek kullanımlık kod üretir → t.me/<bot>?start=<kod> açılır → bot hesabı bağlar.
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useYetki } from "@/lib/useYetki";
import { Send, Loader2, CheckCircle2, Unlink, Settings2, RefreshCw } from "lucide-react";

interface Durum { kurulu: boolean; bot: string | null; kuruldu: string | null }
interface Baglanti { chat_id: number; telegram_ad: string | null; sabah_ozeti: boolean; oglen_uyarisi: boolean; created_at: string }

export default function TelegramAyari() {
  const supabase = useMemo(() => createClient(), []);
  const { tamYetkili } = useYetki();
  const [durum, setDurum] = useState<Durum | null>(null);
  const [baglantilar, setBaglantilar] = useState<Baglanti[]>([]);
  const [mesgul, setMesgul] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<{ tip: "ok" | "hata"; metin: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const yukle = useCallback(async () => {
    const [{ data: d }, { data: b }] = await Promise.all([
      supabase.rpc("tg_durum"),
      supabase.from("telegram_baglantilar").select("chat_id, telegram_ad, sabah_ozeti, oglen_uyarisi, created_at").order("created_at"),
    ]);
    setDurum((d as Durum) || { kurulu: false, bot: null, kuruldu: null });
    setBaglantilar((b || []) as Baglanti[]);
  }, [supabase]);
  useEffect(() => { yukle(); }, [yukle]);

  const kur = async () => {
    setMesgul("kur"); setMesaj(null);
    try {
      const r = await fetch("/api/telegram/kurulum", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setMesaj({ tip: "hata", metin: j.error || `Hata (HTTP ${r.status})` });
      else { setMesaj({ tip: "ok", metin: `Kurulum tamam: @${j.bot} bu siteye bağlandı.` }); await yukle(); }
    } finally { setMesgul(null); }
  };

  const bagla = async () => {
    if (!durum?.bot) return;
    setMesgul("bagla"); setMesaj(null);
    const { data, error } = await supabase.rpc("tg_kod_olustur");
    setMesgul(null);
    if (error || !data) { setMesaj({ tip: "hata", metin: error?.message || "Kod üretilemedi." }); return; }
    const url = `https://t.me/${durum.bot}?start=${data}`;
    setLink(url);
    window.open(url, "_blank", "noopener");
  };

  const ayir = async (chat: number) => {
    if (!confirm("Bu Telegram hesabının panel bağlantısı kaldırılsın mı?")) return;
    await supabase.from("telegram_baglantilar").delete().eq("chat_id", chat);
    yukle();
  };
  const degistir = async (chat: number, alan: "sabah_ozeti" | "oglen_uyarisi", deger: boolean) => {
    await supabase.from("telegram_baglantilar").update({ [alan]: deger }).eq("chat_id", chat);
    yukle();
  };

  return (
    <div className="bg-kart border border-cizgi rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Send size={16} className="text-sky-400" />
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Telegram asistanı</p>
        </div>
        {durum?.bot && <span className="text-[11px] text-gray-500">@{durum.bot}</span>}
      </div>
      <p className="text-[12px] text-gray-500 leading-relaxed">
        Telegram&apos;dan soru sorun (ciro, borç, stok), kasa formu / sayım kağıdı / irsaliye fotoğrafı gönderin;
        her sabah özet, öğlen önemli uyarılar gelsin. Sadece kendi yetkinizdeki bilgileri görürsünüz.
      </p>

      {!durum ? (
        <Loader2 size={16} className="animate-spin text-gray-500" />
      ) : !durum.kurulu ? (
        tamYetkili ? (
          <div className="space-y-2">
            <p className="text-[12px] text-amber-300">Henüz kurulmadı. Vercel&apos;e <code>TELEGRAM_BOT_TOKEN</code> eklendikten ve site yeniden yayınlandıktan sonra:</p>
            <button onClick={kur} disabled={!!mesgul}
              className="flex items-center gap-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 px-4 py-2 rounded-xl">
              {mesgul === "kur" ? <Loader2 size={14} className="animate-spin" /> : <Settings2 size={14} />} Telegram&apos;ı kur
            </button>
          </div>
        ) : <p className="text-[12px] text-gray-500">Telegram asistanı henüz kurulmadı (Tam Yetkili kurmalı).</p>
      ) : (
        <div className="space-y-3">
          {baglantilar.length === 0 ? (
            <p className="text-[12px] text-gray-500">Bu kullanıcıya bağlı Telegram hesabı yok.</p>
          ) : baglantilar.map(b => (
            <div key={b.chat_id} className="rounded-xl border border-cizgi p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 size={14} className="text-emerald-400" />{b.telegram_ad || "Telegram hesabı"}</span>
                <button onClick={() => ayir(b.chat_id)} className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-400"><Unlink size={12} /> Ayır</button>
              </div>
              <label className="flex items-center gap-2 text-[12px] text-gray-400">
                <input type="checkbox" checked={b.sabah_ozeti} onChange={e => degistir(b.chat_id, "sabah_ozeti", e.target.checked)} /> Sabah özeti (~10:00)
              </label>
              <label className="flex items-center gap-2 text-[12px] text-gray-400">
                <input type="checkbox" checked={b.oglen_uyarisi} onChange={e => degistir(b.chat_id, "oglen_uyarisi", e.target.checked)} /> Öğlen uyarısı (~12:00: Mikro robotu, zamlar, bitecek stok)
              </label>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button onClick={bagla} disabled={!!mesgul}
              className="flex items-center gap-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 px-4 py-2 rounded-xl">
              {mesgul === "bagla" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} {baglantilar.length ? "Başka bir Telegram bağla" : "Telegram'ı bağla"}
            </button>
            <button onClick={yukle} className="p-2 text-gray-500 hover:text-yazi border border-cizgi rounded-xl" title="Yenile"><RefreshCw size={14} /></button>
            {tamYetkili && (
              <button onClick={kur} disabled={!!mesgul} className="text-[11px] text-gray-500 hover:text-yazi px-2">
                {mesgul === "kur" ? "Kuruluyor…" : "Kurulumu yenile"}
              </button>
            )}
          </div>
          {link && (
            <p className="text-[11px] text-gray-500">
              Telegram açılmadıysa: <a href={link} target="_blank" rel="noopener" className="text-sky-400 break-all">{link}</a> — açılan sohbette <b>Başlat</b>&apos;a basın, sonra burada yenileyin. Kod 15 dakika geçerli.
            </p>
          )}
        </div>
      )}
      {mesaj && <p className={`text-[12px] ${mesaj.tip === "ok" ? "text-emerald-400" : "text-red-400"}`}>{mesaj.metin}</p>}
    </div>
  );
}
