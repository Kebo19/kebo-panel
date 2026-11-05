"use client";

// ─── GELİR GİDER ────────────────────────────────────────────────────────────
// Yetki: "gelir_gider" (Kasa yetkisinden ayrı). Tamamen elle tutulan basit defter (kullanıcı kararı 05.11): kasa raporu, POS, açılış bakiyesi vb.
// HİÇBİR ŞEY otomatik gelmez; bakiyeler sıfırdan başlar. Tablo: public.gelir_gider (kasa yetkisi).
// Kasa & Finans ve Kâr / Zarar'dan bağımsızdır.

import SayfaSimgesi from "@/components/kabuk/SayfaSimgesi";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useYetki } from "@/lib/useYetki";
import { tv, fmt2, paraGirdisi } from "@/lib/para";
import { bugun, fmtTarih } from "@/lib/tarih";
import { hepsiniCek } from "@/lib/hepsiniCek";
import { YEMEK_KARTI_ADLARI } from "@/lib/hesap";
import { Lock, Loader2, Trash2, ChevronDown, ChevronUp } from "lucide-react";

type Tip = "gelir" | "gider" | "transfer";
// Para hesapları (Toplam'a girer) ve yemek çekleri (alacak; Toplam'a girmez, üstte tek "Yemek Çeki" kutusu)
const HESAPLAR = ["Nakit", "TEB", "VakıfBank", "Enpara"] as const;
const YEMEK_CEKLERI = YEMEK_KARTI_ADLARI;
// Kredi kartları borç hesabıdır: karttan harcama borcu artırır, bankadan karta virman borcu kapatır. Toplam'a girmez.
const KREDI_KARTLARI = ["TEB Kredi Kartı", "Enpara Kredi Kartı"] as const;
type Hesap = (typeof HESAPLAR)[number] | (typeof YEMEK_CEKLERI)[number] | (typeof KREDI_KARTLARI)[number];
const PARA_HESABI = new Set<string>(HESAPLAR);
interface Kayit { id: string; tarih: string; tip: Tip; hesap: Hesap; hedef_hesap: Hesap | null; aciklama: string; tutar: number; ekleyen: string | null; created_at: string }

const kutu = "bg-alan border border-cizgi focus:border-altin/50 text-yazi text-[14px] h-11 px-3 rounded-xl outline-none";

export default function GelirGiderPage() {
  const supabase = createClient();
  const yetki = useYetki();
  const izinli = yetki.izin("gelir_gider");

  const [liste, setListe] = useState<Kayit[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState("");

  const [tip, setTip] = useState<Tip>("gider");
  const [tarih, setTarih] = useState(() => bugun());
  const [hesap, setHesap] = useState<Hesap>("Nakit");
  const [hedef, setHedef] = useState<Hesap>("TEB");
  const [aciklama, setAciklama] = useState("");
  const [tutar, setTutar] = useState("");
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [silinecek, setSilinecek] = useState<string | null>(null);
  const [cekAcik, setCekAcik] = useState(false);
  const [kartAcik, setKartAcik] = useState(false);

  const yukle = useCallback(async () => {
    setYukleniyor(true); setHata("");
    try {
      const d = await hepsiniCek<Kayit>((a, b) => supabase.from("gelir_gider")
        .select("id,tarih,tip,hesap,hedef_hesap,aciklama,tutar,ekleyen,created_at")
        .order("tarih").order("created_at").order("id").range(a, b));
      setListe(d.map(k => ({ ...k, tutar: Number(k.tutar) || 0 })));
    } catch (e) {
      setHata("Kayıtlar açılamadı: " + (e instanceof Error ? e.message : String(e)));
    }
    setYukleniyor(false);
  }, [supabase]);

  useEffect(() => { if (izinli) yukle(); }, [izinli, yukle]);

  // Eskiden yeniye yürüyen bakiye, sonra en yeni üstte gösterilir
  const { satirlar, bakiye, toplam, cekToplam, kartBorcu } = useMemo(() => {
    const b = Object.fromEntries([...HESAPLAR, ...YEMEK_CEKLERI, ...KREDI_KARTLARI].map(h => [h, 0])) as Record<Hesap, number>;
    const sirali = [...liste].sort((x, y) => x.tarih.localeCompare(y.tarih) || x.created_at.localeCompare(y.created_at));
    const s: (Kayit & { kalan: number })[] = [];
    let t = 0;
    for (const k of sirali) {
      if (k.tip === "transfer") {
        // Virman: kaynaktan düşer, hedefe eklenir. Toplam sadece para hesabı ↔ yemek çeki arasında değişir.
        if (k.hesap in b) b[k.hesap] -= k.tutar;
        if (k.hedef_hesap && k.hedef_hesap in b) b[k.hedef_hesap] += k.tutar;
        if (PARA_HESABI.has(k.hesap)) t -= k.tutar;
        if (k.hedef_hesap && PARA_HESABI.has(k.hedef_hesap)) t += k.tutar;
      } else {
        const d = k.tip === "gelir" ? k.tutar : -k.tutar;
        if (k.hesap in b) b[k.hesap] += d;
        if (PARA_HESABI.has(k.hesap)) t += d;
      }
      s.push({ ...k, kalan: t });
    }
    return { satirlar: s.reverse(), bakiye: b, toplam: t, cekToplam: YEMEK_CEKLERI.reduce((x, h) => x + b[h], 0),
      kartBorcu: KREDI_KARTLARI.reduce((x, h) => x - b[h], 0) };
  }, [liste]);

  const kaydet = async (e: React.FormEvent) => {
    e.preventDefault();
    const tl = tv(tutar);
    const virman = tip === "transfer";
    if (!virman && !aciklama.trim()) { setHata("Ne için olduğunu yazın."); return; }
    if (virman && hesap === hedef) { setHata("Aynı hesaba aktarılamaz."); return; }
    if (tl <= 0) { setHata("Tutarı yazın."); return; }
    if (!tarih) { setHata("Tarihi seçin."); return; }
    setKaydediliyor(true); setHata("");
    const { error } = await supabase.from("gelir_gider").insert([{
      tip, tarih, hesap, hedef_hesap: virman ? hedef : null,
      aciklama: aciklama.trim() || "Hesaplar arası", tutar: tl, ekleyen: yetki.kullaniciAdi || null,
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
        <div className="space-y-2">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <div className="col-span-2 sm:col-span-1 bg-kart border border-altin/40 rounded-xl px-3 py-2.5">
            <p className="text-[11px] text-gray-600 font-semibold">Toplam</p>
            <p className={`text-[15px] font-black tabular-nums mt-0.5 ${toplam < 0 ? "text-red-400" : "text-altin"}`}>{fmt2(toplam)} ₺</p>
          </div>
          {HESAPLAR.map(h => (
            <div key={h} className="bg-kart border border-cizgi rounded-xl px-3 py-2.5">
              <p className="text-[11px] text-gray-600 font-semibold">{h}</p>
              <p className={`text-[15px] font-bold tabular-nums mt-0.5 ${bakiye[h] < 0 ? "text-red-400" : ""}`}>{fmt2(bakiye[h])} ₺</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setCekAcik(a => !a)} aria-expanded={cekAcik}
            className={`text-left bg-kart border rounded-xl px-3 py-2.5 hover:border-altin/40 ${cekAcik ? "border-altin/40" : "border-cizgi"}`}>
            <p className="text-[11px] text-gray-600 font-semibold flex items-center justify-between">
              Yemek Çeki {cekAcik ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </p>
            <p className={`text-[15px] font-bold tabular-nums mt-0.5 ${cekToplam < 0 ? "text-red-400" : ""}`}>{fmt2(cekToplam)} ₺</p>
          </button>
          <button type="button" onClick={() => setKartAcik(a => !a)} aria-expanded={kartAcik}
            className={`text-left bg-kart border rounded-xl px-3 py-2.5 hover:border-altin/40 ${kartAcik ? "border-altin/40" : "border-cizgi"}`}>
            <p className="text-[11px] text-gray-600 font-semibold flex items-center justify-between">
              Kredi Kartı borcu {kartAcik ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </p>
            <p className={`text-[15px] font-bold tabular-nums mt-0.5 ${kartBorcu > 0 ? "text-red-400" : ""}`}>{fmt2(kartBorcu)} ₺</p>
          </button>
        </div>
        {kartAcik && (
          <div className="grid grid-cols-2 gap-2">
            {KREDI_KARTLARI.map(h => (
              <div key={h} className="bg-alan border border-cizgi rounded-xl px-3 py-2">
                <p className="text-[11px] text-gray-600 font-semibold">{h}</p>
                <p className={`text-[14px] font-bold tabular-nums ${-bakiye[h] > 0 ? "text-red-400" : ""}`}>{fmt2(-bakiye[h])} ₺</p>
              </div>
            ))}
          </div>
        )}
        {cekAcik && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {YEMEK_CEKLERI.map(h => (
              <div key={h} className="bg-alan border border-cizgi rounded-xl px-3 py-2">
                <p className="text-[11px] text-gray-600 font-semibold">{h}</p>
                <p className={`text-[14px] font-bold tabular-nums ${bakiye[h] < 0 ? "text-red-400" : ""}`}>{fmt2(bakiye[h])} ₺</p>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-gray-600">Yemek çekleri ve kredi kartı borcu Toplam&apos;a katılmaz. Kart borcunu ödemek için: ⇄ Virman, bankadan karta.</p>
        </div>

        {/* Yeni kayıt */}
        <form onSubmit={kaydet} className="bg-kart border border-cizgi rounded-2xl p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={() => setTip("gelir")}
              className={`h-11 rounded-xl border text-[14px] font-bold ${tip === "gelir" ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300" : "border-cizgi bg-alan text-gray-600"}`}>
              + Para girdi
            </button>
            <button type="button" onClick={() => setTip("gider")}
              className={`h-11 rounded-xl border text-[14px] font-bold ${tip === "gider" ? "border-red-500/60 bg-red-500/10 text-red-300" : "border-cizgi bg-alan text-gray-600"}`}>
              − Para çıktı
            </button>
            <button type="button" onClick={() => { setTip("transfer"); if (hedef === hesap) setHedef(hesap === "Nakit" ? "TEB" : "Nakit"); }}
              className={`h-11 rounded-xl border text-[14px] font-bold ${tip === "transfer" ? "border-sky-500/60 bg-sky-500/10 text-sky-300" : "border-cizgi bg-alan text-gray-600"}`}>
              ⇄ Virman
            </button>
          </div>
          <input value={aciklama} onChange={e => setAciklama(e.target.value)} maxLength={200}
            placeholder={tip === "transfer" ? "Açıklama (isteğe bağlı)" : "Ne için? (örn. tüp gaz)"} className={`${kutu} w-full`} />
          <div className="grid grid-cols-3 gap-2">
            <input type="date" value={tarih} onChange={e => setTarih(e.target.value)} className={`${kutu} w-full min-w-0`} aria-label="Tarih" />
            <HesapSec deger={hesap} degistir={setHesap} etiket={tip === "transfer" ? "Nereden" : "Hesap"} />
            <input value={tutar} onChange={e => setTutar(paraGirdisi(e.target.value))} inputMode="decimal"
              placeholder="Tutar ₺" className={`${kutu} w-full min-w-0 text-right tabular-nums`} aria-label="Tutar" />
          </div>
          {tip === "transfer" && (
            <div className="grid grid-cols-[auto_1fr] items-center gap-2">
              <span className="text-[12px] text-gray-600 font-semibold">{hesap} →</span>
              <HesapSec deger={hedef} degistir={setHedef} etiket="Nereye" haric={hesap} />
            </div>
          )}
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
                  <th className="px-3 py-2 font-semibold text-right">Toplam</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-cizgi">
                {satirlar.map(k => (
                  <tr key={k.id}>
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">{fmtTarih(k.tarih)}</td>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold">{k.aciklama}</span>
                      <span className="text-[11px] text-gray-600"> · {k.tip === "transfer" ? `${k.hesap} → ${k.hedef_hesap}` : k.hesap}</span>
                      {k.ekleyen && <span className="text-[11px] text-gray-600"> · <span className="text-altin/80">{k.ekleyen}</span></span>}
                    </td>
                    {k.tip === "transfer" ? (
                      <td colSpan={2} className="px-3 py-2.5 text-right tabular-nums text-sky-400 whitespace-nowrap">⇄ {fmt2(k.tutar)}</td>
                    ) : (<>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-400 whitespace-nowrap">{k.tip === "gelir" ? fmt2(k.tutar) : ""}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-red-400 whitespace-nowrap">{k.tip === "gider" ? fmt2(k.tutar) : ""}</td>
                    </>)}
                    <td className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap ${PARA_HESABI.has(k.hesap) || (k.hedef_hesap && PARA_HESABI.has(k.hedef_hesap)) ? "font-bold" : "text-gray-600"}`}>{fmt2(k.kalan)}</td>
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

function HesapSec({ deger, degistir, etiket, haric }: { deger: Hesap; degistir: (h: Hesap) => void; etiket: string; haric?: Hesap }) {
  return (
    <select value={deger} onChange={e => degistir(e.target.value as Hesap)} className={`${kutu} w-full min-w-0`} aria-label={etiket}>
      {HESAPLAR.map(h => <option key={h} value={h} disabled={h === haric}>{h}</option>)}
      <optgroup label="Kredi kartı">
        {KREDI_KARTLARI.map(h => <option key={h} value={h} disabled={h === haric}>{h}</option>)}
      </optgroup>
      <optgroup label="Yemek çeki">
        {YEMEK_CEKLERI.map(h => <option key={h} value={h} disabled={h === haric}>{h}</option>)}
      </optgroup>
    </select>
  );
}
