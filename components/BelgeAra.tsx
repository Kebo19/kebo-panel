"use client";

// "Bu irsaliyenin faturası hangisi? / Bu faturanın irsaliyesi hangisi?" — irsaliye no, fatura (GİB) no
// ya da tedarikçi adıyla arar; eşleşen irsaliye ↔ fatura çiftlerini gösterir (son 6 ay).
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtTarih } from "@/lib/tarih";
import { Search, Loader2, FileText, Truck, ArrowLeftRight } from "lucide-react";
import type { BelgeEslesmesi } from "@/lib/telegram/ozet";

const tl = (v: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Math.round(v || 0)) + " ₺";

export default function BelgeAra() {
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [sonuc, setSonuc] = useState<BelgeEslesmesi[] | null>(null);
  const [yuk, setYuk] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const ara = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setYuk(true); setHata(null);
    const { data, error } = await supabase.rpc("belge_eslesme_ara", { p_q: q.trim() || null });
    setYuk(false);
    if (error) { setHata(error.message); return; }
    setSonuc((data || []) as BelgeEslesmesi[]);
  };

  return (
    <div className="rounded-2xl border border-cizgi bg-kart p-4 space-y-3">
      <form onSubmit={ara} className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-black text-yazi flex items-center gap-2 mr-2"><ArrowLeftRight size={14} className="text-sky-400" /> İrsaliye ↔ fatura</p>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="İrsaliye no, fatura no ya da firma (ör. Kalem)"
            className="w-full bg-alan border border-cizgi text-yazi text-xs h-9 pl-8 pr-3 rounded-xl outline-none" />
        </div>
        <button className="flex items-center gap-1.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 px-4 h-9 rounded-xl">
          {yuk ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} Bul
        </button>
      </form>
      {hata && <p className="text-[11px] text-red-400">{hata}</p>}
      {sonuc && (sonuc.length === 0 ? <p className="text-[11px] text-gray-500">Bulunamadı.</p> : (
        <div className="space-y-1.5">
          {sonuc.map((b, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-2 items-center rounded-xl border border-cizgi p-2.5 text-[11px]">
              <div className="min-w-0">
                <p className="font-semibold flex items-center gap-1.5"><Truck size={12} className="text-amber-400 shrink-0" />
                  {b.belge ? <>İrsaliye {b.irsaliye_no || "numarasız"} · {b.irsaliye_tarihi ? fmtTarih(b.irsaliye_tarihi) : ""}{b.teslim === false ? " · teslim alınmadı" : ""}</> : <span className="text-gray-500">İrsaliyesi yok</span>}
                </p>
                {b.kalemler && <p className="text-gray-500 truncate" title={b.kalemler}>{b.kalemler}</p>}
              </div>
              <ArrowLeftRight size={12} className="text-gray-600 hidden md:block" />
              <div className="min-w-0">
                <p className="font-semibold flex items-center gap-1.5"><FileText size={12} className="text-sky-400 shrink-0" />
                  {b.gib_no ? <>Fatura {b.gib_no} · {b.fatura_tarihi ? fmtTarih(b.fatura_tarihi) : ""}{b.toplam != null ? ` · ${tl(Number(b.toplam))}` : ""}</> : <span className="text-amber-300">Faturası henüz gelmedi / eşleşmedi</span>}
                </p>
                <p className="text-gray-500 truncate">{b.tedarikci || b.fatura_tedarikci}</p>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
