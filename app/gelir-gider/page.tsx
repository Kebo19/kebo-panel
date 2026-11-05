"use client";

// ─── GELİR GİDER ────────────────────────────────────────────────────────────
// Kasa & Finans'ın sade yüzü: giren / çıkan parayı yazarsın, dört hesabın (Nakit, TEB, VakıfBank, Enpara)
// bakiyesi kendiliğinden tutulur. Kayıtlar kasa_manuel_islemler'e yazılır → Kasa & Finans ve Kâr / Zarar'da
// da görünür. Günlük kasa raporlarının nakdi kasaya kendiliğinden eklenir (listede "Kasa raporu" satırı).
// Bakiye hesabı lib/kasaBakiye (Kasa & Finans ile aynı).

import SayfaSimgesi from "@/components/kabuk/SayfaSimgesi";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useYetki } from "@/lib/useYetki";
import { tv, fmt2, paraGirdisi } from "@/lib/para";
import { bugun, gunEkle, aySonu, fmtTarih } from "@/lib/tarih";
import { hepsiniCek } from "@/lib/hepsiniCek";
import { KASA_BASLANGIC } from "@/lib/devir";
import { kuryeTahsilati } from "@/lib/hesap";
import { KASA_GIDER_KATEGORILERI, KASA_GELIR_KATEGORILERI, ACILIS_KATS, TRANSFER_KATEGORISI } from "@/lib/karZarar";
import { KASA_HESAPLARI, hesapBakiyeleri, posBekleyenHesapla, type KasaHesabi, type BakiyeRaporu } from "@/lib/kasaBakiye";
import { POS_BANKA_HESABI } from "@/lib/mutabakat";
import {
  Lock, Loader2, Plus, Trash2, ChevronLeft, ChevronRight, ArrowDownCircle, ArrowUpCircle,
  ArrowLeftRight, AlertTriangle, FileText,
} from "lucide-react";

type Tip = "gelir" | "gider" | "transfer";
interface Hareket {
  id: string; tip: Tip; hesap: string; hedef_hesap: string | null; kategori: string;
  tutar: number; aciklama: string | null; islem_tarihi: string; ekleyen_kullanici: string | null;
  kaynak: string | null; created_at: string;
}
/** Listede gösterilen satır: elle hareket ya da günlük kasa raporunun nakdi */
interface Satir {
  anahtar: string; tip: Tip; tarih: string; baslik: string; alt: string; tutar: number;
  hesap: string; hareket?: Hareket;
}

const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const HESAP_ADI: Record<string, string> = { Nakit: "Nakit Kasa", TEB: "TEB", VakıfBank: "VakıfBank", Enpara: "Enpara" };
const GELIR_SECENEKLERI = KASA_GELIR_KATEGORILERI.filter(k => !ACILIS_KATS.has(k));
// Başka ekrandan gelen kayıtlar kaynağında silinir (Kasa & Finans ile aynı kural)
const SILINEBILIR_KAYNAKLAR = new Set(["banka_ekstre", "sabit_gider"]);
const KAYNAK_ETIKET: Record<string, string> = {
  avans: "personel avansı", cari_odeme: "cari ödemesi", rapor_nakit: "kasa raporu", banka_ekstre: "ekstre", sabit_gider: "sabit gider",
};
const inputCls = "w-full bg-alan border border-cizgi focus:border-altin/50 text-yazi text-[14px] h-11 px-3 rounded-xl outline-none";

function ayKaydir(ay: string, adim: number): string {
  const [y, m] = ay.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + adim, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
const say = (v: unknown) => Number(v) || 0;

export default function GelirGiderPage() {
  const supabase = createClient();
  const yetki = useYetki();
  const izinli = yetki.izin("kasa");

  const [ay, setAy] = useState(() => bugun().slice(0, 7));
  const [raporlar, setRaporlar] = useState<BakiyeRaporu[]>([]);
  const [hareketler, setHareketler] = useState<Hareket[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState("");

  const [tip, setTip] = useState<Tip>("gider");
  const [tarih, setTarih] = useState(() => bugun());
  const [hesap, setHesap] = useState<KasaHesabi>("Nakit");
  const [hedef, setHedef] = useState<KasaHesabi>("TEB");
  const [kategori, setKategori] = useState("Market / Malzeme");
  const [aciklama, setAciklama] = useState("");
  const [tutar, setTutar] = useState("");
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [silinecek, setSilinecek] = useState<string | null>(null);

  // Bakiye 1 Kasım'dan sayılır; 31 Ekim raporu POS beklentisi için gerekir.
  const yukle = useCallback(async () => {
    setYukleniyor(true); setHata("");
    try {
      const ilk = gunEkle(KASA_BASLANGIC, -1);
      const [r, h] = await Promise.all([
        hepsiniCek<BakiyeRaporu>((a, b) => supabase.from("gunluk_raporlar").select("id,tarih,kasa_nakit,kasa_pos,kurye_raporlari")
          .gte("tarih", ilk).order("tarih", { ascending: false }).order("id", { ascending: false }).range(a, b)),
        hepsiniCek<Hareket>((a, b) => supabase.from("kasa_manuel_islemler")
          .select("id,tip,hesap,hedef_hesap,kategori,tutar,aciklama,islem_tarihi,ekleyen_kullanici,kaynak,created_at")
          .gte("islem_tarihi", KASA_BASLANGIC).order("islem_tarihi", { ascending: false }).order("id", { ascending: false }).range(a, b)),
      ]);
      setRaporlar(r);
      setHareketler(h.map(x => ({ ...x, tutar: say(x.tutar) })));
    } catch (e) {
      setHata("Kayıtlar açılamadı: " + (e instanceof Error ? e.message : String(e)));
    }
    setYukleniyor(false);
  }, [supabase]);

  useEffect(() => { if (izinli) yukle(); }, [izinli, yukle]);

  const posBekleyen = useMemo(() => posBekleyenHesapla(raporlar, hareketler, bugun()), [raporlar, hareketler]);
  const bakiyeler = useMemo(() => hesapBakiyeleri(raporlar, hareketler, posBekleyen.toplam), [raporlar, hareketler, posBekleyen]);
  const toplamBakiye = KASA_HESAPLARI.reduce((t, h) => t + bakiyeler[h], 0);

  // Seçili ayın satırları: elle hareketler + her kasa raporunun kasaya giren nakdi
  const satirlar = useMemo<Satir[]>(() => {
    const ayIci = (t: string) => t.slice(0, 7) === ay && t >= KASA_BASLANGIC;
    const s: Satir[] = hareketler.filter(h => ayIci(h.islem_tarihi)).map(h => ({
      anahtar: h.id, tip: h.tip, tarih: h.islem_tarihi, tutar: h.tutar, hesap: h.hesap, hareket: h,
      baslik: h.aciklama?.trim() ? h.aciklama : h.kategori,
      alt: [h.aciklama?.trim() ? h.kategori : "", h.tip === "transfer" ? `${HESAP_ADI[h.hesap] || h.hesap} → ${HESAP_ADI[h.hedef_hesap || ""] || h.hedef_hesap}` : HESAP_ADI[h.hesap] || h.hesap,
        h.ekleyen_kullanici || ""].filter(Boolean).join(" · "),
    }));
    raporlar.filter(r => ayIci(r.tarih)).forEach(r => {
      const kurye = kuryeTahsilati(r).nakit;
      const nakit = say(r.kasa_nakit) + kurye;
      if (nakit) s.push({
        anahtar: `rapor-${r.tarih}`, tip: "gelir", tarih: r.tarih, tutar: nakit, hesap: "Nakit",
        baslik: "Kasa raporu nakdi", alt: `Nakit Kasa · sayılan ${fmt2(say(r.kasa_nakit))} ₺${kurye ? ` + kurye ${fmt2(kurye)} ₺` : ""}`,
      });
    });
    return s.sort((a, b) => b.tarih.localeCompare(a.tarih) || (b.hareket?.created_at || "").localeCompare(a.hareket?.created_at || ""));
  }, [hareketler, raporlar, ay]);

  // Ay özeti: açılış bakiyesi ve hesaplar arası para geçişi gelir/gider sayılmaz
  const ozet = useMemo(() => {
    let giren = 0, cikan = 0;
    satirlar.forEach(s => {
      if (s.tip === "transfer" || ACILIS_KATS.has(s.hareket?.kategori || "") || s.hareket?.kategori === TRANSFER_KATEGORISI) return;
      if (s.tip === "gelir") giren += s.tutar; else cikan += s.tutar;
    });
    return { giren, cikan, fark: giren - cikan };
  }, [satirlar]);

  const tipSec = (t: Tip) => {
    setTip(t);
    if (t === "gelir") setKategori("Diğer Gelir");
    if (t === "gider") setKategori("Market / Malzeme");
    if (t === "transfer" && hedef === hesap) setHedef(KASA_HESAPLARI.find(h => h !== hesap) || "TEB");
  };

  const ekle = async (e: React.FormEvent) => {
    e.preventDefault();
    const tl = tv(tutar);
    if (tl <= 0) { setHata("Tutarı yazın."); return; }
    if (!tarih) { setHata("Tarihi seçin."); return; }
    if (tip === "transfer" && hesap === hedef) { setHata("Aynı hesaba aktarılamaz."); return; }
    if (tip !== "transfer" && !kategori) { setHata("Ne için olduğunu seçin."); return; }
    setKaydediliyor(true); setHata("");
    const { error } = await supabase.from("kasa_manuel_islemler").insert([{
      tip, hesap, hedef_hesap: tip === "transfer" ? hedef : null,
      kategori: tip === "transfer" ? `${hesap} → ${hedef}` : kategori,
      tutar: tl, aciklama: aciklama.trim(), islem_tarihi: tarih,
      ekleyen_kullanici: yetki.kullaniciAdi || "Bilinmiyor",
    }]);
    setKaydediliyor(false);
    if (error) { setHata("Kaydedilemedi: " + error.message); return; }
    setAciklama(""); setTutar("");
    if (tarih.slice(0, 7) !== ay) setAy(tarih.slice(0, 7));
    yukle();
  };

  const sil = async (h: Hareket) => {
    const { error } = await supabase.from("kasa_manuel_islemler").delete().eq("id", h.id);
    setSilinecek(null);
    if (error) { setHata("Silinemedi: " + error.message); return; }
    yukle();
  };

  if (yetki.yukleniyor) return <div className="min-h-screen bg-zemin" />;
  if (!izinli) return (
    <div className="min-h-screen bg-zemin flex flex-col items-center justify-center gap-2 text-gray-600">
      <Lock size={22} /><p className="text-sm">Bu sayfaya erişiminiz yok.</p>
    </div>
  );

  const [yil, ayNo] = ay.split("-");
  const ayAdi = `${AYLAR[Number(ayNo) - 1]} ${yil}`;
  const baslangictanOnce = aySonu(yil, ayNo) < KASA_BASLANGIC;
  const tipRenk = (t: Tip) => t === "gelir" ? "text-emerald-400" : t === "gider" ? "text-red-400" : "text-sky-400";
  const TipSimge = ({ t, size }: { t: Tip; size: number }) =>
    t === "gelir" ? <ArrowDownCircle size={size} /> : t === "gider" ? <ArrowUpCircle size={size} /> : <ArrowLeftRight size={size} />;

  return (
    <div className="min-h-screen bg-zemin text-yazi font-sans antialiased">
      <div className="sticky top-0 z-40 border-b border-cizgi bg-zemin/95 backdrop-blur-xl">
        <div className="max-w-screen-md mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <SayfaSimgesi />
            <div>
              <h1 className="text-sm font-black leading-none">Gelir Gider</h1>
              <p className="text-[10px] text-gray-600 mt-0.5 leading-none">Giren ve çıkan parayı yazın, kasa kendiliğinden tutulur</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setAy(ayKaydir(ay, -1))} aria-label="Önceki ay"
              className="p-2 rounded-xl border border-cizgi bg-kart text-gray-700 hover:text-yazi"><ChevronLeft size={15} /></button>
            <span className="text-[13px] font-bold w-28 text-center">{ayAdi}</span>
            <button onClick={() => setAy(ayKaydir(ay, 1))} aria-label="Sonraki ay"
              className="p-2 rounded-xl border border-cizgi bg-kart text-gray-700 hover:text-yazi"><ChevronRight size={15} /></button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-md mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* Bugünkü bakiyeler */}
        <div className="bg-kart border border-cizgi rounded-2xl p-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[11px] text-gray-600 font-semibold">Şu an hesaplarda</p>
            <p className="text-lg font-black tabular-nums">{yukleniyor ? "…" : `${fmt2(toplamBakiye)} ₺`}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            {KASA_HESAPLARI.map(h => (
              <div key={h} className="bg-alan border border-cizgi rounded-xl px-3 py-2">
                <p className="text-[11px] text-gray-600 font-semibold">{HESAP_ADI[h]}</p>
                <p className={`text-[15px] font-black tabular-nums mt-0.5 ${bakiyeler[h] < 0 ? "text-red-400" : ""}`}>
                  {yukleniyor ? "…" : `${fmt2(bakiyeler[h])} ₺`}
                </p>
                {h === POS_BANKA_HESABI && posBekleyen.toplam > 0 && !yukleniyor && (
                  <p className="text-[10px] text-gray-600 mt-0.5">{fmt2(posBekleyen.toplam)} ₺ POS dahil</p>
                )}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-600 mt-2">
            1 Kasım&apos;dan beri. Açılış bakiyeleri <Link href="/kasa" className="text-altin hover:underline">Kasa &amp; Finans</Link> → &quot;01.11.2026 açılışı&quot;ndan girilir.
          </p>
        </div>

        {/* Bu ayın özeti */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="bg-kart border border-cizgi rounded-2xl p-3 sm:p-4">
            <p className="text-[11px] text-gray-600 font-semibold">Giren</p>
            <p className="text-base sm:text-xl font-black text-emerald-400 mt-1 tabular-nums">{fmt2(ozet.giren)} ₺</p>
          </div>
          <div className="bg-kart border border-cizgi rounded-2xl p-3 sm:p-4">
            <p className="text-[11px] text-gray-600 font-semibold">Çıkan</p>
            <p className="text-base sm:text-xl font-black text-red-400 mt-1 tabular-nums">{fmt2(ozet.cikan)} ₺</p>
          </div>
          <div className="bg-kart border border-cizgi rounded-2xl p-3 sm:p-4">
            <p className="text-[11px] text-gray-600 font-semibold">Fark</p>
            <p className={`text-base sm:text-xl font-black mt-1 tabular-nums ${ozet.fark < 0 ? "text-red-400" : "text-yazi"}`}>{fmt2(ozet.fark)} ₺</p>
          </div>
        </div>

        {/* Yeni kayıt */}
        <form onSubmit={ekle} className="bg-kart border border-cizgi rounded-2xl p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {([
              ["gelir", "Para girdi", "border-emerald-500/60 bg-emerald-500/10 text-emerald-300"],
              ["gider", "Para çıktı", "border-red-500/60 bg-red-500/10 text-red-300"],
              ["transfer", "Hesaplar arası", "border-sky-500/60 bg-sky-500/10 text-sky-300"],
            ] as const).map(([t, ad, renk]) => (
              <button key={t} type="button" onClick={() => tipSec(t)}
                className={`flex items-center justify-center gap-1.5 h-11 rounded-xl border text-[12px] sm:text-[13px] font-bold transition-colors ${
                  tip === t ? renk : "border-cizgi bg-alan text-gray-600"}`}>
                <TipSimge t={t} size={15} /> {ad}
              </button>
            ))}
          </div>

          <div>
            <span className="block text-[11px] font-semibold text-gray-600 mb-1">{tip === "transfer" ? "Hangi hesaptan?" : tip === "gelir" ? "Hangi hesaba girdi?" : "Hangi hesaptan çıktı?"}</span>
            <div className="grid grid-cols-4 gap-1.5">
              {KASA_HESAPLARI.map(h => (
                <button key={h} type="button" onClick={() => { setHesap(h); if (tip === "transfer" && hedef === h) setHedef(KASA_HESAPLARI.find(x => x !== h) || "TEB"); }}
                  className={`h-10 rounded-xl border text-[12px] font-bold ${hesap === h ? "border-altin/60 bg-altin/10 text-altin" : "border-cizgi bg-alan text-gray-600"}`}>
                  {HESAP_ADI[h]}
                </button>
              ))}
            </div>
          </div>
          {tip === "transfer" && (
            <div>
              <span className="block text-[11px] font-semibold text-gray-600 mb-1">Hangi hesaba?</span>
              <div className="grid grid-cols-4 gap-1.5">
                {KASA_HESAPLARI.map(h => (
                  <button key={h} type="button" disabled={h === hesap} onClick={() => setHedef(h)}
                    className={`h-10 rounded-xl border text-[12px] font-bold disabled:opacity-30 ${hedef === h ? "border-altin/60 bg-altin/10 text-altin" : "border-cizgi bg-alan text-gray-600"}`}>
                    {HESAP_ADI[h]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-[11px] font-semibold text-gray-600 mb-1">Tarih</span>
              <input type="date" value={tarih} min={KASA_BASLANGIC} onChange={e => setTarih(e.target.value)} className={inputCls} />
            </label>
            {tip !== "transfer" && (
              <label className="block">
                <span className="block text-[11px] font-semibold text-gray-600 mb-1">Ne için?</span>
                <select value={kategori} onChange={e => setKategori(e.target.value)} className={inputCls}>
                  {tip === "gelir"
                    ? GELIR_SECENEKLERI.map(k => <option key={k} value={k}>{k}</option>)
                    : KASA_GIDER_KATEGORILERI.map(g => (
                      <optgroup key={g.grup} label={g.grup}>{g.items.map(k => <option key={k} value={k}>{k}</option>)}</optgroup>
                    ))}
                </select>
              </label>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-2">
            <label className="block">
              <span className="block text-[11px] font-semibold text-gray-600 mb-1">Açıklama (isteğe bağlı)</span>
              <input value={aciklama} onChange={e => setAciklama(e.target.value)} maxLength={200}
                placeholder={tip === "gelir" ? "Örn. ortaktan nakit" : tip === "gider" ? "Örn. tüp gaz" : "Örn. kasadaki nakit bankaya"} className={inputCls} />
            </label>
            <label className="block">
              <span className="block text-[11px] font-semibold text-gray-600 mb-1">Tutar (₺)</span>
              <input value={tutar} onChange={e => setTutar(paraGirdisi(e.target.value))} inputMode="decimal"
                placeholder="0" className={`${inputCls} text-right tabular-nums`} />
            </label>
          </div>
          {tarih && tarih < KASA_BASLANGIC && (
            <p className="text-[12px] text-amber-300 flex items-center gap-1.5"><AlertTriangle size={13} /> 1 Kasım&apos;dan önceki kayıtlar bakiyeye girmez (Ekim deneme ayı).</p>
          )}
          {hata && <p className="text-[12px] text-red-300 flex items-center gap-1.5"><AlertTriangle size={13} /> {hata}</p>}
          <button type="submit" disabled={kaydediliyor}
            className="w-full flex items-center justify-center gap-2 h-11 text-[13px] font-bold text-[#1a1408] kebo-btn-altin hover:brightness-110 disabled:opacity-40 rounded-xl">
            {kaydediliyor ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Kaydet
          </button>
        </form>

        {/* Liste */}
        <div className="bg-kart border border-cizgi rounded-2xl overflow-hidden">
          <p className="text-[11px] text-gray-600 font-semibold px-4 pt-3 pb-2">{ayAdi} hareketleri</p>
          {yukleniyor ? (
            <div className="flex items-center justify-center gap-2 py-10 text-gray-500 text-sm">
              <Loader2 size={15} className="animate-spin" /> Yükleniyor…
            </div>
          ) : baslangictanOnce ? (
            <p className="text-sm text-gray-500 py-10 text-center px-4">Kayıtlar 1 Kasım 2026&apos;dan başlar. Ekim deneme ayı Kasa &amp; Finans arşivinde.</p>
          ) : satirlar.length === 0 ? (
            <p className="text-sm text-gray-500 py-10 text-center">Bu ay için kayıt yok.</p>
          ) : (
            <ul className="divide-y divide-cizgi">
              {satirlar.map(s => {
                const h = s.hareket;
                const silinebilir = !!h && (!h.kaynak || SILINEBILIR_KAYNAKLAR.has(h.kaynak));
                const kaynak = h ? (h.kaynak ? KAYNAK_ETIKET[h.kaynak] || h.kaynak : null) : "kasa raporu";
                return (
                  <li key={s.anahtar} className="flex items-center gap-3 px-4 py-3">
                    <span className={`shrink-0 ${tipRenk(s.tip)}`}>{h ? <TipSimge t={s.tip} size={18} /> : <FileText size={18} />}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold truncate">{s.baslik}</p>
                      <p className="text-[11px] text-gray-600 truncate">
                        {fmtTarih(s.tarih)} · {s.alt}
                        {kaynak && <span className="ml-1.5 px-1.5 py-px rounded bg-alan border border-cizgi text-[10px]">{kaynak}</span>}
                      </p>
                    </div>
                    <p className={`text-[14px] font-black tabular-nums whitespace-nowrap ${tipRenk(s.tip)}`}>
                      {s.tip === "gelir" ? "+" : s.tip === "gider" ? "−" : ""}{fmt2(s.tutar)} ₺
                    </p>
                    {silinebilir && h ? (
                      silinecek === h.id ? (
                        <span className="flex items-center gap-1">
                          <button onClick={() => sil(h)} className="px-2 h-8 rounded-lg bg-red-500/15 border border-red-500/40 text-red-300 text-[11px] font-bold">Sil</button>
                          <button onClick={() => setSilinecek(null)} className="px-2 h-8 rounded-lg border border-cizgi text-gray-600 text-[11px] font-bold">Vazgeç</button>
                        </span>
                      ) : (
                        <button onClick={() => setSilinecek(h.id)} aria-label="Sil" className="p-1.5 rounded-lg text-gray-600 hover:text-red-400">
                          <Trash2 size={15} />
                        </button>
                      )
                    ) : <span className="w-[27px]" />}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <p className="text-[10px] text-gray-600 text-center pb-4">
          Buraya yazılanlar Kasa &amp; Finans ve Kâr / Zarar&apos;da da görünür. Kasa raporu, cari ödemesi ve avans satırları kendi sayfalarından silinir.
        </p>
      </div>
    </div>
  );
}
