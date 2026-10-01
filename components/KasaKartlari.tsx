"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CreditCard, Pencil, Wallet, X, Loader2, CalendarClock, Utensils, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { tv, paraGirdisi } from "@/lib/para";
import type { KartDurumu, KrediKarti, YemekKartiAlacagi } from "@/lib/kasaHesaplari";

const fmt2 = (v: number) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const tarihYaz = (t: string | null) => (t ? `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}` : "—");

/** Bankaya göre kart rengi */
const KART_RENK: Record<string, { a: string; b: string; vurgu: string }> = {
  TEB: { a: "#0f3b2e", b: "#0a1f19", vurgu: "#34d399" },
  Enpara: { a: "#33204f", b: "#1a1129", vurgu: "#c084fc" },
};
const renkAl = (banka: string) => KART_RENK[banka] ?? { a: "#2a2418", b: "#15120c", vurgu: "#d9b866" };

// ─── KREDİ KARTLARI ─────────────────────────────────────────────────────────

export function KrediKartlariPaneli({ durumlar, onOde, onDuzenle, tabloYok }: {
  durumlar: KartDurumu[];
  onOde: (kart: KrediKarti) => void;
  onDuzenle: (kart: KrediKarti) => void;
  /** Kart tablosu henüz kurulmadıysa ayarlar kaydedilemez */
  tabloYok?: boolean;
}) {
  const toplamBorc = durumlar.reduce((t, d) => t + d.borc, 0);
  const toplamKullanilabilir = durumlar.reduce((t, d) => t + (d.kart.kart_limiti > 0 ? d.kullanilabilir : 0), 0);
  return (
    <section className="kebo-kart p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="kebo-simge w-9 h-9 !rounded-[10px]" style={{ color: "#d9b866" }}><CreditCard className="h-4 w-4" /></div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-bold">Kredi Kartları</h2>
          <p className="text-[11px] text-gray-500">Karttan yapılan gider borcu artırır · bankadan karta transfer borcu öder</p>
        </div>
        <div className="flex gap-4 text-right">
          <div><p className="text-[10px] text-gray-500 uppercase tracking-wider">Toplam borç</p><p className="text-sm font-bold text-red-300 tabular-nums">₺{fmt2(toplamBorc)}</p></div>
          <div><p className="text-[10px] text-gray-500 uppercase tracking-wider">Kullanılabilir</p><p className="text-sm font-bold text-emerald-300 tabular-nums">₺{fmt2(toplamKullanilabilir)}</p></div>
        </div>
      </div>
      {tabloYok && (
        <p className="mb-3 flex items-start gap-2 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
          <Info size={13} className="shrink-0 mt-px" /> Kart tablosu veritabanında henüz yok; limit ve ekstre günleri kaydedilemez. Harcama ve ödemeler yine de kartlara işlenir.
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {durumlar.map((d, i) => <KartKutusu key={d.kart.ad} d={d} sira={i} onOde={onOde} onDuzenle={onDuzenle} tabloYok={tabloYok} />)}
      </div>
    </section>
  );
}

function KartKutusu({ d, sira, onOde, onDuzenle, tabloYok }: {
  d: KartDurumu; sira: number; onOde: (k: KrediKarti) => void; onDuzenle: (k: KrediKarti) => void; tabloYok?: boolean;
}) {
  const r = renkAl(d.kart.banka);
  const oran = d.kullanimOrani;
  const barRenk = oran == null ? r.vurgu : oran > 0.85 ? "#f87171" : oran > 0.6 ? "#f0a94b" : r.vurgu;
  const odemeUyari = d.odemeyeKalan != null && (d.ekstreBorcu ?? 0) > 0 && d.odemeyeKalan <= 5;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: sira * 0.08, duration: 0.45 }}
      className="relative overflow-hidden rounded-2xl border border-white/10 p-4 sm:p-5"
      style={{ background: `linear-gradient(135deg, ${r.a}, ${r.b} 70%)` }}>
      {/* kart deseni */}
      <div className="pointer-events-none absolute -right-16 -top-16 w-56 h-56 rounded-full opacity-25 blur-2xl" style={{ backgroundColor: r.vurgu }} />
      <div className="pointer-events-none absolute right-5 top-5 flex">
        <span className="w-7 h-7 rounded-full bg-white/15" /><span className="-ml-3 w-7 h-7 rounded-full bg-white/10" />
      </div>

      <div className="relative">
        <div className="flex items-center gap-2">
          <span className="w-8 h-6 rounded-md bg-gradient-to-br from-[#f3dfa2] to-[#a8853f] opacity-90" />
          <p className="text-sm font-bold">{d.kart.ad}</p>
        </div>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/50">Kullanılabilir limit</p>
            <p className="text-2xl font-extrabold tabular-nums" style={{ color: d.kart.kart_limiti > 0 ? (d.kullanilabilir < 0 ? "#f87171" : "#fff") : "rgba(255,255,255,0.4)" }}>
              {d.kart.kart_limiti > 0 ? `₺${fmt2(d.kullanilabilir)}` : "Limit girilmedi"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-white/50">Güncel borç</p>
            <p className="text-lg font-bold tabular-nums text-red-200">₺{fmt2(d.borc)}</p>
          </div>
        </div>

        <div className="mt-3">
          <div className="h-2 rounded-full bg-black/30 overflow-hidden">
            <motion.div className="h-full rounded-full" style={{ backgroundColor: barRenk, boxShadow: `0 0 12px ${barRenk}` }}
              initial={{ width: 0 }} animate={{ width: `${Math.min(100, (oran ?? 0) * 100)}%` }} transition={{ delay: 0.3 + sira * 0.08, duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-white/55">
            <span>{oran != null ? `%${(oran * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} kullanıldı` : "—"}</span>
            <span>Limit ₺{fmt2(d.kart.kart_limiti)}</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
          <Bilgi ad="Ekstre borcu" deger={d.ekstreBorcu != null ? `₺${fmt2(d.ekstreBorcu)}` : "—"} />
          <Bilgi ad="Son ödeme" deger={tarihYaz(d.sonOdeme)} uyari={odemeUyari}
            alt={d.odemeyeKalan != null && (d.ekstreBorcu ?? 0) > 0 ? (d.odemeyeKalan < 0 ? `${-d.odemeyeKalan} gün geçti` : d.odemeyeKalan === 0 ? "bugün" : `${d.odemeyeKalan} gün kaldı`) : undefined} />
          <Bilgi ad="Dönem harcaması" deger={`₺${fmt2(d.donemHarcama)}`} alt={d.sonrakiKesim ? `kesim ${tarihYaz(d.sonrakiKesim)}` : undefined} />
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={() => onOde(d.kart)}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2 rounded-xl bg-white/90 text-[#111] hover:bg-white transition-colors">
            <Wallet size={13} /> Borç öde
          </button>
          <button onClick={() => onDuzenle(d.kart)} disabled={tabloYok} title={tabloYok ? "Kart tablosu kurulmadı" : "Limit ve ekstre günleri"}
            className="flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-white/20 text-white/80 hover:bg-white/10 disabled:opacity-40 transition-colors">
            <Pencil size={13} /> Ayarlar
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function Bilgi({ ad, deger, alt, uyari }: { ad: string; deger: string; alt?: string; uyari?: boolean }) {
  return (
    <div className={`rounded-xl px-2.5 py-2 ${uyari ? "bg-red-500/20 border border-red-400/30" : "bg-black/25"}`}>
      <p className="text-white/50">{ad}</p>
      <p className="font-bold tabular-nums text-white">{deger}</p>
      {alt && <p className={`text-[10px] ${uyari ? "text-red-200 font-semibold" : "text-white/45"}`}>{alt}</p>}
    </div>
  );
}

// ─── KART AYARLARI ──────────────────────────────────────────────────────────

export function KartAyarPenceresi({ kart, onKapat, onKaydedildi }: {
  kart: KrediKarti; onKapat: () => void; onKaydedildi: () => void;
}) {
  const supabase = createClient();
  const sayiYaz = (v: number) => (v ? new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(v) : "");
  const [limit, setLimit] = useState(sayiYaz(kart.kart_limiti));
  const [kesim, setKesim] = useState(kart.hesap_kesim_gunu ? String(kart.hesap_kesim_gunu) : "");
  const [odeme, setOdeme] = useState(kart.son_odeme_gunu ? String(kart.son_odeme_gunu) : "");
  const [acilis, setAcilis] = useState(sayiYaz(kart.acilis_borcu));
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const gun = (s: string) => { const n = parseInt(s, 10); return n >= 1 && n <= 31 ? n : null; };

  const kaydet = async () => {
    if (kesim && !gun(kesim)) { alert("Hesap kesim günü 1–31 arası olmalı."); return; }
    if (odeme && !gun(odeme)) { alert("Son ödeme günü 1–31 arası olmalı."); return; }
    setKaydediliyor(true);
    const { error } = await supabase.from("kredi_kartlari").update({
      kart_limiti: tv(limit), hesap_kesim_gunu: gun(kesim), son_odeme_gunu: gun(odeme), acilis_borcu: tv(acilis),
    }).eq("id", kart.id);
    setKaydediliyor(false);
    if (error) { alert("Kaydedilemedi: " + error.message); return; }
    onKaydedildi();
  };

  const inputCls = "w-full bg-alan border border-cizgi focus:border-altin/50 text-yazi text-sm h-10 px-3 rounded-xl outline-none transition-colors";
  const etiket = "text-[11px] text-gray-600 mb-1.5 block";
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onKapat}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} onClick={e => e.stopPropagation()}
        className="kebo-kart !rounded-t-2xl sm:!rounded-2xl w-full sm:max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-cizgi">
          <p className="text-sm font-bold flex items-center gap-2"><CreditCard size={15} className="text-altin" /> {kart.ad}</p>
          <button onClick={onKapat} className="text-gray-600 hover:text-yazi"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          <label className="block"><span className={etiket}>Kart limiti (₺)</span>
            <input inputMode="decimal" value={limit} onChange={e => setLimit(paraGirdisi(e.target.value))} placeholder="0,00" className={inputCls} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className={etiket}>Hesap kesim günü</span>
              <input inputMode="numeric" value={kesim} onChange={e => setKesim(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="ör. 10" className={inputCls} />
            </label>
            <label className="block"><span className={etiket}>Son ödeme günü</span>
              <input inputMode="numeric" value={odeme} onChange={e => setOdeme(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="ör. 20" className={inputCls} />
            </label>
          </div>
          <label className="block"><span className={etiket}>{tarihYaz(kart.acilis_tarihi)} itibarıyla borç (₺)</span>
            <input inputMode="decimal" value={acilis} onChange={e => setAcilis(paraGirdisi(e.target.value))} placeholder="0,00" className={inputCls} />
            <span className="mt-1 block text-[11px] text-gray-500">Bu tarihten önceki harcamalar Kasa&apos;da yok; o günkü kart borcunu buraya yazın.</span>
          </label>
          <div className="flex gap-2 pt-1">
            <button onClick={onKapat} className="flex-1 text-xs font-semibold text-gray-500 border border-cizgi py-2.5 rounded-xl hover:text-yazi transition-colors">İptal</button>
            <button onClick={kaydet} disabled={kaydediliyor} className="flex-1 text-xs font-bold kebo-btn-altin hover:brightness-110 disabled:opacity-40 py-2.5 rounded-xl flex items-center justify-center gap-2">
              {kaydediliyor && <Loader2 size={13} className="animate-spin" />} Kaydet
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── YEMEK KARTI ALACAKLARI ─────────────────────────────────────────────────

const YK_RENK: Record<string, string> = {
  Edenred: "#f87171", Metropol: "#60a5fa", Setcard: "#f0a94b", Pluxee: "#2dd4bf", Paye: "#c084fc", Multinet: "#34d399",
};

export function YemekKartiPaneli({ kartlar, belirsizYatan, toplamBekleyen, baslangic, ayAdi }: {
  kartlar: YemekKartiAlacagi[]; belirsizYatan: number; toplamBekleyen: number; baslangic: string; ayAdi: string;
}) {
  return (
    <section className="kebo-kart p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="kebo-simge w-9 h-9 !rounded-[10px]" style={{ color: "#f0a94b" }}><Utensils className="h-4 w-4" /></div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-bold">Yemek Kartları</h2>
          <p className="text-[11px] text-gray-500">{tarihYaz(baslangic)}&apos;den beri kasa raporuna girilen satış ve bankaya yatan</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Bekleyen alacak</p>
          <p className="text-lg font-bold text-altin tabular-nums">₺{fmt2(toplamBekleyen)}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
        {kartlar.map((k, i) => {
          const renk = YK_RENK[k.ad] ?? "#d9b866";
          const oran = k.satis > 0 ? Math.min(1, Math.max(0, k.yatan / k.satis)) : 0;
          return (
            <motion.div key={k.ad} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="group relative overflow-hidden rounded-2xl border border-cizgi bg-white/[0.02] p-3.5 hover:border-cizgi-guclu transition-colors">
              <div className="pointer-events-none absolute -top-8 -right-8 w-20 h-20 rounded-full blur-2xl opacity-20 group-hover:opacity-35 transition-opacity" style={{ backgroundColor: renk }} />
              <div className="relative">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: renk, boxShadow: `0 0 8px ${renk}` }} />
                  <p className="text-[13px] font-bold">{k.ad}</p>
                </div>
                <p className="mt-2 text-[10px] text-gray-500 uppercase tracking-wider">Bekleyen</p>
                <p className="text-base font-extrabold tabular-nums" style={{ color: k.bekleyen > 0.005 ? renk : undefined }}>₺{fmt2(k.bekleyen)}</p>
                <div className="mt-2 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <motion.div className="h-full rounded-full" style={{ backgroundColor: renk }}
                    initial={{ width: 0 }} animate={{ width: `${oran * 100}%` }} transition={{ delay: 0.3 + i * 0.05, duration: 0.8 }} />
                </div>
                <div className="mt-2 space-y-0.5 text-[11px]">
                  <p className="flex justify-between text-gray-600"><span>Satış</span><span className="tabular-nums text-gray-800">₺{fmt2(k.satis)}</span></p>
                  <p className="flex justify-between text-gray-600"><span>Yatan</span><span className="tabular-nums text-gray-800">₺{fmt2(k.yatan)}</span></p>
                  <p className="flex justify-between text-gray-500"><span>{ayAdi}</span><span className="tabular-nums">₺{fmt2(k.buAySatis)}</span></p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
      <p className="mt-3 flex items-start gap-2 text-[11px] text-gray-500">
        <CalendarClock size={12} className="shrink-0 mt-0.5" />
        <span>
          Tahsilat, &quot;Yemek Kartı Tahsilatı&quot; kategorisindeki banka girişinin açıklamasındaki kart adından eşlenir. Tamamı yattıktan sonra kalan küçük fark kartın komisyon kesintisidir.
          {belirsizYatan > 0 && <> Kartı anlaşılamayan ₺{fmt2(belirsizYatan)} yatış toplamdan düşüldü.</>}
        </span>
      </p>
    </section>
  );
}
