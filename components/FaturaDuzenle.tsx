"use client";

// FATURA DÜZENLE — cari detayında faturanın no, tarih, vade, tutar ve açıklamasını düzeltir;
// faturayı kapatan ödemeleri listeler (tıklanınca o ödemenin detayı açılır).

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Loader2, AlertTriangle, Link2 } from "lucide-react";
import { tv, fmt2, paraGirdisi } from "@/lib/para";
import { fmtTarih as fmtTarihOrtak } from "@/lib/tarih";
import type { DetayOdeme } from "@/components/OdemeDetay";

export interface DuzenlenecekFatura {
  id: string; fatura_no: string; fatura_tarihi: string; vade_tarihi?: string | null;
  toplam_tutar: number; tutar?: number | null; kdv?: number | null; aciklama?: string | null; durum: string;
}

interface Props {
  fatura: DuzenlenecekFatura;
  odemeler: DetayOdeme[];
  onKapat: () => void;
  onKaydedildi: (mesaj: string) => void;
  onOdemeAc: (o: DetayOdeme) => void;
}

const fmt = fmt2;
const fmtTarih = (t: string) => fmtTarihOrtak(t) || "—";
const inputCls = "w-full bg-alan border border-cizgi hover:border-cizgi-guclu focus:border-altin/50 text-yazi text-sm h-11 px-3 rounded-xl outline-none transition-all placeholder:text-gray-700";
const paraYazi = (n: number) => paraGirdisi(String(Math.round((Number(n) || 0) * 100) / 100).replace(".", ","));
const yuvarla = (n: number) => Math.round(n * 100) / 100;

export default function FaturaDuzenle({ fatura, odemeler, onKapat, onKaydedildi, onOdemeAc }: Props) {
  const supabase = useMemo(() => createClient(), []);
  // Mevcut KDV oranı: kdv sütunu TUTAR tutar (matrah × oran)
  const mevcutOran = Number(fatura.tutar) > 0 ? Math.round((Number(fatura.kdv) || 0) / Number(fatura.tutar) * 100) : 0;
  const [form, setForm] = useState({
    fatura_no: fatura.fatura_no || "", fatura_tarihi: fatura.fatura_tarihi, vade_tarihi: fatura.vade_tarihi || "",
    toplam: paraYazi(fatura.toplam_tutar), kdv: String(mevcutOran), aciklama: fatura.aciklama || "",
  });
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const kapatanlar = odemeler.filter(o => (o.fatura_idleri || []).includes(fatura.id));
  const hesap = useMemo(() => {
    const toplam = tv(form.toplam);
    const oran = parseFloat(form.kdv) || 0;
    const matrah = yuvarla(toplam / (1 + oran / 100));
    return { toplam, matrah, kdv: yuvarla(toplam - matrah) };
  }, [form.toplam, form.kdv]);
  const tutarDegisti = Math.abs(hesap.toplam - (Number(fatura.toplam_tutar) || 0)) > 0.005;

  const kaydet = async () => {
    if (!form.fatura_no.trim() || hesap.toplam <= 0) { setHata("Fatura no ve tutar zorunlu."); return; }
    setKaydediliyor(true); setHata(null);
    const { error } = await supabase.from("faturalar").update({
      fatura_no: form.fatura_no.trim(), fatura_tarihi: form.fatura_tarihi, vade_tarihi: form.vade_tarihi || null,
      tutar: hesap.matrah, kdv: hesap.kdv, toplam_tutar: hesap.toplam, aciklama: form.aciklama,
    }).eq("id", fatura.id);
    setKaydediliyor(false);
    if (error) { setHata("Kayıt hatası: " + error.message); return; }
    onKaydedildi("Fatura güncellendi.");
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onKapat}>
      <div className="bg-kart border border-cizgi rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-cizgi shrink-0">
          <div>
            <h3 className="text-base font-black text-yazi">Faturayı Düzenle</h3>
            <p className="text-[10px] text-gray-600 mt-0.5">{fatura.fatura_no} · {fatura.durum === "odendi" ? "Ödendi" : "Ödenmedi"}</p>
          </div>
          <button onClick={onKapat} className="text-gray-600 hover:text-yazi"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Fatura No</p>
            <input value={form.fatura_no} onChange={e => setForm(p => ({ ...p, fatura_no: e.target.value }))} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Fatura Tarihi</p>
              <input type="date" value={form.fatura_tarihi} onChange={e => setForm(p => ({ ...p, fatura_tarihi: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Vade</p>
              <input type="date" value={form.vade_tarihi} onChange={e => setForm(p => ({ ...p, vade_tarihi: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Toplam Tutar (KDV dahil)</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-sm">₺</span>
                <input type="text" inputMode="decimal" value={form.toplam} onChange={e => setForm(p => ({ ...p, toplam: paraGirdisi(e.target.value) }))} className={`${inputCls} pl-8`} />
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">KDV %</p>
              <select value={form.kdv} onChange={e => setForm(p => ({ ...p, kdv: e.target.value }))} className={inputCls}>
                {Array.from(new Set(["0", "1", "10", "20", form.kdv])).map(k => <option key={k} value={k} className="bg-kart">%{k}</option>)}
              </select>
            </div>
          </div>
          <p className="text-[11px] text-gray-500 -mt-1">Matrah ₺{fmt(hesap.matrah)} + KDV ₺{fmt(hesap.kdv)}{tutarDegisti && <> · eski tutar <span className="line-through">₺{fmt(fatura.toplam_tutar)}</span></>}</p>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Açıklama</p>
            <input value={form.aciklama} onChange={e => setForm(p => ({ ...p, aciklama: e.target.value }))} placeholder="Opsiyonel..." className={inputCls} />
          </div>

          <div>
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-2 font-bold flex items-center gap-1.5"><Link2 size={12} /> Bu faturayı kapatan ödemeler</p>
            {kapatanlar.length === 0 ? (
              <p className="text-xs text-gray-500">{fatura.durum === "odendi" ? "Ödendi işaretli ama bağlı ödeme kaydı yok (toplu işaretlenmiş ya da eski kayıt)." : "Henüz ödeme yok."}</p>
            ) : (
              <div className="rounded-xl border border-cizgi overflow-hidden">
                {kapatanlar.map(o => (
                  <button key={o.id} type="button" onClick={() => onOdemeAc(o)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-sm border-b border-cizgi last:border-b-0 hover:bg-white/[0.03] text-left">
                    <div>
                      <p className="font-bold text-yazi">{fmtTarih(o.tarih)} · {o.odeme_yontemi}</p>
                      {o.aciklama && <p className="text-[11px] text-gray-500 truncate max-w-[260px]">{o.aciklama}</p>}
                    </div>
                    <span className="font-black text-emerald-400">₺{fmt(o.tutar)}</span>
                  </button>
                ))}
              </div>
            )}
            {tutarDegisti && kapatanlar.length > 0 && (
              <p className="mt-2 text-[11px] text-amber-300 flex items-center gap-1.5"><AlertTriangle size={12} /> Tutar değişirse bağlı ödemenin tutarını da kontrol edin (ödemeye tıklayıp düzenleyebilirsiniz).</p>
            )}
          </div>
          {hata && <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2 flex items-center gap-2"><AlertTriangle size={13} /> {hata}</p>}
        </div>

        <div className="px-6 py-4 border-t border-cizgi shrink-0 flex gap-2">
          <button onClick={onKapat} className="flex-1 text-sm font-semibold text-gray-500 hover:text-yazi border border-cizgi py-3 rounded-xl transition-colors">Vazgeç</button>
          <button onClick={kaydet} disabled={kaydediliyor}
            className="flex-1 text-sm font-bold text-[#1a1408] kebo-btn-altin hover:brightness-110 disabled:opacity-40 py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
            {kaydediliyor ? <Loader2 size={14} className="animate-spin" /> : null} Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}
