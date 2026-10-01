"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { bugun, fmtTarih } from "@/lib/tarih";
import { fmt2 } from "@/lib/para";
import { vadeTakvimi, type TakvimFatura, type VadeGrubu } from "@/lib/cariEkstre";
import { CalendarClock, ChevronDown, ChevronUp, Wallet, Loader2 } from "lucide-react";

// VADE TAKVİMİ — açık faturaları ödeme gününe göre gruplar (Gecikmiş / Bu hafta / Gelecek hafta /
// Bu ay / Sonra). Vade: fatura.vade_tarihi, yoksa cari dönem kuralı (lib/cari). Faturaya bağlanmamış
// ödemeler carinin en erken vadeli faturalarından düşülür (Toplam Borç ile tutarlı).

const RENK: Record<VadeGrubu, { yazi: string; kenar: string; zemin: string }> = {
  gecikmis: { yazi: "text-red-400", kenar: "border-red-500/25", zemin: "bg-red-500/5" },
  bu_hafta: { yazi: "text-amber-400", kenar: "border-amber-500/25", zemin: "bg-amber-500/5" },
  gelecek_hafta: { yazi: "text-blue-400", kenar: "border-blue-500/20", zemin: "bg-blue-500/5" },
  bu_ay: { yazi: "text-indigo-400", kenar: "border-indigo-500/20", zemin: "bg-indigo-500/5" },
  sonra: { yazi: "text-gray-600", kenar: "border-cizgi", zemin: "bg-alan" },
};

export default function VadeTakvimi({ yenile, onOde }: {
  /** Değiştiğinde veriler yeniden çekilir (ödeme sonrası). */
  yenile?: number;
  /** Cari satırına tıklanınca: o carinin ödeme penceresini bu faturalar seçili olarak aç. */
  onOde: (cariId: string, faturaIdleri: string[]) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [faturalar, setFaturalar] = useState<TakvimFatura[]>([]);
  const [serbest, setSerbest] = useState<Map<string, number>>(new Map());
  const [yukleniyor, setYukleniyor] = useState(true);
  const [acik, setAcik] = useState<Set<VadeGrubu>>(new Set(["gecikmis", "bu_hafta"]));

  const cek = useCallback(async () => {
    setYukleniyor(true);
    const [{ data: f }, { data: o }] = await Promise.all([
      supabase.from("faturalar")
        .select("id, cari_id, cari_unvan, fatura_no, fatura_tarihi, vade_tarihi, toplam_tutar, durum")
        .neq("durum", "odendi"),
      supabase.from("cari_odemeler").select("cari_id, tutar, fatura_idleri"),
    ]);
    const m = new Map<string, number>();
    (o || []).forEach(x => {
      // Sadece faturaya bağlanmamış (fatura_idleri = []) ödemeler — Cariler sayfasındaki borç kuralı.
      if (!x.cari_id || !Array.isArray(x.fatura_idleri) || x.fatura_idleri.length > 0) return;
      m.set(x.cari_id, (m.get(x.cari_id) || 0) + (Number(x.tutar) || 0));
    });
    setFaturalar((f || []) as TakvimFatura[]);
    setSerbest(m);
    setYukleniyor(false);
  }, [supabase]);

  useEffect(() => { cek(); }, [cek, yenile]);

  const { gruplar, genelToplam } = useMemo(() => vadeTakvimi(faturalar, bugun(), serbest), [faturalar, serbest]);

  const degistir = (g: VadeGrubu) => setAcik(p => { const s = new Set(p); if (s.has(g)) s.delete(g); else s.add(g); return s; });

  return (
    <div className="bg-kart border border-cizgi rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <CalendarClock size={15} className="text-blue-400" />
          <h2 className="text-xs font-black text-gray-700 uppercase tracking-widest">Vade Takvimi</h2>
        </div>
        <p className="text-[11px] text-gray-500">Açık borç <span className="font-black text-yazi">₺{fmt2(genelToplam)}</span></p>
      </div>

      {yukleniyor ? (
        <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-blue-500" /></div>
      ) : (
        <>
          {/* Grup özet kutuları */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {gruplar.map(g => (
              <button key={g.anahtar} onClick={() => degistir(g.anahtar)}
                className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${RENK[g.anahtar].kenar} ${acik.has(g.anahtar) ? RENK[g.anahtar].zemin : "hover:bg-white/[0.02]"}`}>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest">{g.etiket}</p>
                <p className={`text-sm font-black ${g.toplam > 0 ? RENK[g.anahtar].yazi : "text-gray-400"}`}>₺{fmt2(g.toplam)}</p>
                <p className="text-[10px] text-gray-500">{g.cariler.length} cari · {g.faturaSayisi} fatura</p>
              </button>
            ))}
          </div>

          {/* Açık grupların cari satırları */}
          <div className="mt-3 space-y-3">
            {gruplar.filter(g => acik.has(g.anahtar) && g.cariler.length > 0).map(g => (
              <div key={g.anahtar} className={`rounded-xl border ${RENK[g.anahtar].kenar} overflow-hidden`}>
                <button onClick={() => degistir(g.anahtar)} className={`w-full flex items-center justify-between px-3 py-2 ${RENK[g.anahtar].zemin}`}>
                  <span className={`text-[11px] font-black uppercase tracking-widest ${RENK[g.anahtar].yazi}`}>{g.etiket}</span>
                  <span className="flex items-center gap-2">
                    <span className={`text-xs font-black ${RENK[g.anahtar].yazi}`}>₺{fmt2(g.toplam)}</span>
                    {acik.has(g.anahtar) ? <ChevronUp size={13} className="text-gray-500" /> : <ChevronDown size={13} className="text-gray-500" />}
                  </span>
                </button>
                <div className="divide-y divide-cizgi">
                  {g.cariler.map(c => (
                    <button key={c.cari_id} onClick={() => onOde(c.cari_id, c.faturalar.map(f => f.id))}
                      title="Bu carinin ödeme penceresini aç"
                      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-white/[0.03] transition-colors">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-yazi truncate">{c.cari_unvan}</p>
                        <p className="text-[10px] text-gray-500">
                          {c.faturalar.length} fatura · vade {c.enErkenVade ? fmtTarih(c.enErkenVade) : "belirsiz"}
                          {c.faturalar.length > 1 && c.faturalar[c.faturalar.length - 1].vade !== c.enErkenVade && c.faturalar[c.faturalar.length - 1].vade
                            ? ` – ${fmtTarih(c.faturalar[c.faturalar.length - 1].vade)}` : ""}
                        </p>
                      </div>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-black text-yazi">₺{fmt2(c.toplam)}</span>
                        <span className="flex items-center gap-1 text-[10px] font-bold text-white bg-emerald-600 px-2 py-1 rounded-lg"><Wallet size={11} /> Öde</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-500 mt-2">Vade: faturadaki vade tarihi, yoksa dönem kuralı (16–15 arası faturalar ayın 25&apos;inde). Faturasız ödemeler en eski faturalardan düşülür.</p>
        </>
      )}
    </div>
  );
}
