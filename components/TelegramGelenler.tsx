"use client";

// Telegram'dan gönderilen ve panelde açılmayı bekleyen fotoğraflar (kasa formu → Raporlar, irsaliye → Stok).
// "Aç" fotoğrafları mevcut tarama akışına verir (Fişten Doldur / İrsaliye tara) ve kaydı "işlendi" yapar.
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Send, Loader2, X } from "lucide-react";

interface Foto { id: string; grup: string | null; gonderen: string | null; mime: string; created_at: string }
interface Grup { anahtar: string; fotolar: Foto[]; zaman: string; gonderen: string | null }

const saat = (t: string) => new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(t));

export default function TelegramGelenler({ tur, onSec, devreDisi }: {
  tur: "kasa" | "irsaliye";
  onSec: (dosyalar: File[]) => void;
  devreDisi?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [fotolar, setFotolar] = useState<Foto[]>([]);
  const [aciliyor, setAciliyor] = useState<string | null>(null);

  const yukle = useCallback(async () => {
    const { data } = await supabase.from("telegram_fotolar").select("id, grup, gonderen, mime, created_at")
      .eq("tur", tur).eq("durum", "bekliyor").gte("created_at", new Date(Date.now() - 14 * 86400000).toISOString())
      .order("created_at");
    setFotolar((data || []) as Foto[]);
  }, [supabase, tur]);
  useEffect(() => { yukle(); }, [yukle]);

  const gruplar = useMemo(() => {
    const m = new Map<string, Grup>();
    fotolar.forEach(f => {
      const a = f.grup || f.id;
      if (!m.has(a)) m.set(a, { anahtar: a, fotolar: [], zaman: f.created_at, gonderen: f.gonderen });
      m.get(a)!.fotolar.push(f);
    });
    return Array.from(m.values()).reverse();
  }, [fotolar]);

  const isaretle = async (g: Grup) => {
    await supabase.from("telegram_fotolar").update({ durum: "islendi" }).in("id", g.fotolar.map(f => f.id));
  };

  const ac = async (g: Grup) => {
    setAciliyor(g.anahtar);
    try {
      const { data, error } = await supabase.from("telegram_fotolar").select("id, mime, veri").in("id", g.fotolar.map(f => f.id)).order("created_at");
      if (error || !data?.length) { alert("Fotoğraf açılamadı: " + (error?.message || "bulunamadı")); return; }
      const dosyalar = data.map((d, i) => {
        const bayt = Uint8Array.from(atob(d.veri as string), c => c.charCodeAt(0));
        const uz = d.mime === "application/pdf" ? "pdf" : d.mime === "image/png" ? "png" : "jpg";
        return new File([bayt], `telegram-${i + 1}.${uz}`, { type: d.mime as string });
      });
      await isaretle(g);
      onSec(dosyalar);
      yukle();
    } finally { setAciliyor(null); }
  };

  const yoksay = async (g: Grup) => {
    if (!confirm("Bu Telegram fotoğrafı listeden kaldırılsın mı?")) return;
    await isaretle(g); yukle();
  };

  if (!gruplar.length) return null;
  return (
    <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-2.5 space-y-1.5">
      <p className="text-[11px] font-bold text-sky-300 flex items-center gap-1.5"><Send size={12} /> Telegram&apos;dan gelenler</p>
      {gruplar.map(g => (
        <div key={g.anahtar} className="flex items-center justify-between gap-2 text-[11px] text-gray-400">
          <span>{saat(g.zaman)} · {g.gonderen || "?"} · {g.fotolar.length} fotoğraf</span>
          <span className="flex items-center gap-1">
            <button type="button" disabled={devreDisi || !!aciliyor} onClick={() => ac(g)}
              className="flex items-center gap-1 font-bold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-40 px-2.5 py-1 rounded-lg">
              {aciliyor === g.anahtar ? <Loader2 size={11} className="animate-spin" /> : null} Aç ve oku
            </button>
            <button type="button" onClick={() => yoksay(g)} className="p-1 text-gray-600 hover:text-red-400" title="Kaldır"><X size={12} /></button>
          </span>
        </div>
      ))}
    </div>
  );
}
