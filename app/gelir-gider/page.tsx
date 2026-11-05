"use client";

// ─── GELİR GİDER ────────────────────────────────────────────────────────────
// Tamamen elle tutulan basit defter (kullanıcı kararı 05.11): kasa raporu, POS, açılış bakiyesi vb.
// HİÇBİR ŞEY otomatik gelmez; bakiyeler sıfırdan başlar. Tablo: public.gelir_gider (kasa yetkisi).
// Kasa & Finans ve Kâr / Zarar'dan bağımsızdır.

import SayfaSimgesi from "@/components/kabuk/SayfaSimgesi";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useYetki } from "@/lib/useYetki";
import { tv, fmt2, paraGirdisi } from "@/lib/para";
import { bugun, fmtTarih } from "@/lib/tarih";
import { hepsiniCek } from "@/lib/hepsiniCek";
import { Lock, Loader2, Trash2 } from "lucide-react";

type Tip = "gelir" | "gider";
const HESAPLAR = ["Nakit", "TEB", "VakıfBank", "Enpara"] as const;
type Hesap = (typeof HESAPLAR)[number];
interface Kayit { id: string; tarih: string; tip: Tip; hesap: Hesap; aciklama: string; tutar: number; created_at: string }

const kutu = "bg-alan border border-cizgi focus:border-altin/50 text-yazi text-[14px] h-11 px-3 rounded-xl outline-none";

export default function GelirGiderPage() {
  const supabase = createClient();
  const yetki = useYetki();
  const izinli = yetki.izin("kasa");

  const [liste, setListe] = useState<Kayit[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState("");

  const [tip, setTip] = useState<Tip>("gider");
  const [tarih, setTarih] = useState(() => bugun());
  const [hesap, setHesap] = useState<Hesap>("Nakit");
  const [aciklama, setAciklama] = useState("");
  const [tutar, setTutar] = useState("");
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [silinecek, setSilinecek] = useState<string | null>(null);

  const yukle = useCallback(async () => {
    setYukleniyor(true); setHata("");
    try {
      const d = await hepsiniCek<Kayit>((a, b) => supabase.from("gelir_gider")
        .select("id,tarih,tip,hesap,aciklama,tutar,created_at")
        .order("tarih").order("created_at").order("id").range(a, b));
      setListe(d.map(k => ({ ...k, tutar: Number(k.tutar) || 0 })));
    } catch (e) {
      setHata("Kayıtlar açılamadı: " + (e instanceof Error ? e.message : String(e)));
    }
    setYukleniyor(false);
  }, [supabase]);

  useEffect(() => { if (izinli) yukle(); }, [izinli, yukle]);

  // Eskiden yeniye yürüyen bakiye, sonra en yeni üstte gösterilir
  const { satirlar, bakiye, toplam } = useMemo(() => {
    const b: Record<Hesap, number> = { Nakit: 0, TEB: 0, VakıfBank: 0, Enpara: 0 };
    const sirali = [...liste].sort((x, y) => x.tarih.localeCompare(y.tarih) || x.created_at.localeCompare(y.created_at));
    const s: (Kayit & { kalan: number })[] = [];
    let t = 0;
    for (const k of sirali) {
      const d = k.tip === "gelir" ? k.tutar : -k.tutar;
      if (k.hesap in b) b[k.hesap] += d;
      t += d;
      s.push({ ...k, kalan: t });
    }
    return { satirlar: s.reverse(), bakiye: b, toplam: t };
  }, [liste]);

  const kaydet = async (e: React.FormEvent) => {
    e.preventDefault();
    const tl = tv(tutar);
    if (!aciklama.trim()) { setHata("Ne için olduğunu yazın."); return; }
    if (tl <= 0) { setHata("Tutarı yazın."); return; }
    if (!tarih) { setHata("Tarihi seçin."); return; }
    setKaydediliyor(true); setHata("");
    const { error } = await supabase.from("gelir_gider").insert([{
      tip, tarih, hesap, aciklama: aciklama.trim(), tutar: tl, ekleyen: yetki.kullaniciAdi || null,
    }]);
    setKaydediliyor(false);
    if (error) { setHata("Kaydedilemedi: " + error.message); return; }
    setAciklama(""); setTutar("");
    yukle();
  };

  const sil = async (id: string) => {
    setSilinecek(null);
    const { error } = await supabase.from("gelir_gider").delete().eq("id", id);
    if (error) { setHata("Silinemedi: " + error.message); return; }
    yukle();
  };

  if (yetki.yukleniyor) return <div className="min-h-screen bg-zemin" />;
  if (!izinli) return (
    <div className="min-h-screen bg-zemin flex flex-col items-center justify-center gap-2 text-gray-600">
      <Lock size={22} /><p className="text-sm">Bu sayfaya erişiminiz yok.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-zemin text-yazi font-sans antialiased">
      <div className="sticky top-0 z-40 border-b border-cizgi bg-zemin/95 backdrop-blur-xl">
        <div className="max-w-screen-md mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <SayfaSimgesi />
          <h1 className="text-sm font-black">Gelir Gider</h1>
        </div>
      </div>

      <div className="max-w-screen-md mx-auto px-4 sm:px-6 py-5 space-y-4">
        {/* Kasa */}
        <div className="bg-kart border border-cizgi rounded-2xl p-4">
          <p className="text-[12px] text-gray-600 font-semibold">Kasada toplam</p>
          <p className={`text-3xl font-black tabular-nums mt-1 ${toplam < 0 ? "text-red-400" : ""}`}>{fmt2(toplam)} ₺</p>
          <p className="text-[12px] text-gray-600 mt-2 tabular-nums">
            {HESAPLAR.map(h => `${h} ${fmt2(bakiye[h])} ₺`).join("  ·  ")}
          </p>
        </div>

        {/* Yeni kayıt */}
        <form onSubmit={kaydet} className="bg-kart border border-cizgi rounded-2xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setTip("gelir")}
              className={`h-11 rounded-xl border text-[14px] font-bold ${tip === "gelir" ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300" : "border-cizgi bg-alan text-gray-600"}`}>
              + Para girdi
            </button>
            <button type="button" onClick={() => setTip("gider")}
              className={`h-11 rounded-xl border text-[14px] font-bold ${tip === "gider" ? "border-red-500/60 bg-red-500/10 text-red-300" : "border-cizgi bg-alan text-gray-600"}`}>
              − Para çıktı
            </button>
          </div>
          <input value={aciklama} onChange={e => setAciklama(e.target.value)} maxLength={200}
            placeholder="Ne için? (örn. tüp gaz)" className={`${kutu} w-full`} />
          <div className="grid grid-cols-3 gap-2">
            <input type="date" value={tarih} onChange={e => setTarih(e.target.value)} className={`${kutu} w-full min-w-0`} aria-label="Tarih" />
            <select value={hesap} onChange={e => setHesap(e.target.value as Hesap)} className={`${kutu} w-full min-w-0`} aria-label="Hesap">
              {HESAPLAR.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            <input value={tutar} onChange={e => setTutar(paraGirdisi(e.target.value))} inputMode="decimal"
              placeholder="Tutar ₺" className={`${kutu} w-full min-w-0 text-right tabular-nums`} aria-label="Tutar" />
          </div>
          {hata && <p className="text-[12px] text-red-300">{hata}</p>}
          <button type="submit" disabled={kaydediliyor}
            className="w-full flex items-center justify-center gap-2 h-11 text-[14px] font-bold text-[#1a1408] kebo-btn-altin hover:brightness-110 disabled:opacity-40 rounded-xl">
            {kaydediliyor && <Loader2 size={15} className="animate-spin" />} Kaydet
          </button>
        </form>

        {/* Defter */}
        <div className="bg-kart border border-cizgi rounded-2xl overflow-x-auto">
          {yukleniyor ? (
            <div className="flex items-center justify-center gap-2 py-10 text-gray-500 text-sm">
              <Loader2 size={15} className="animate-spin" /> Yükleniyor…
            </div>
          ) : satirlar.length === 0 ? (
            <p className="text-sm text-gray-500 py-10 text-center">Henüz kayıt yok.</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[11px] text-gray-600 text-left border-b border-cizgi">
                  <th className="px-3 py-2 font-semibold">Tarih</th>
                  <th className="px-3 py-2 font-semibold">Açıklama</th>
                  <th className="px-3 py-2 font-semibold text-right">Giren</th>
                  <th className="px-3 py-2 font-semibold text-right">Çıkan</th>
                  <th className="px-3 py-2 font-semibold text-right">Kasa</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-cizgi">
                {satirlar.map(k => (
                  <tr key={k.id}>
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">{fmtTarih(k.tarih)}</td>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold">{k.aciklama}</span>
                      <span className="text-[11px] text-gray-600"> · {k.hesap}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-400 whitespace-nowrap">{k.tip === "gelir" ? fmt2(k.tutar) : ""}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-red-400 whitespace-nowrap">{k.tip === "gider" ? fmt2(k.tutar) : ""}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold whitespace-nowrap">{fmt2(k.kalan)}</td>
                    <td className="pr-2 text-right whitespace-nowrap">
                      {silinecek === k.id ? (
                        <button onClick={() => sil(k.id)} className="px-2 h-7 rounded-lg bg-red-500/15 border border-red-500/40 text-red-300 text-[11px] font-bold">Sil</button>
                      ) : (
                        <button onClick={() => setSilinecek(k.id)} aria-label="Sil" className="p-1.5 rounded-lg text-gray-600 hover:text-red-400">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
