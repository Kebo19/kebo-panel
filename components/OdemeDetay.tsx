"use client";

// ÖDEME DETAYI — cari detayında bir ödemeye tıklanınca açılır: ödemenin hangi faturaları kapattığını
// gösterir; tutar, tarih, hesap, açıklama ve bağlı faturalar düzenlenebilir.
// Hesap değişirse kasa hareketi veritabanı trigger'ıyla kendiliğinden güncellenir.

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Loader2, AlertTriangle, CheckCircle2, Link2 } from "lucide-react";
import { GIDER_HESAPLARI, HESAP_ETIKET, HATIR_FATURASI, ODEME_SECENEKLERI, kasasizMi, kartMi, odemeKaydiAlanlari } from "@/lib/cari";
import { tv, fmt2, paraGirdisi } from "@/lib/para";
import { fmtTarih as fmtTarihOrtak } from "@/lib/tarih";

export interface DetayOdeme {
  id: string; tutar: number; tarih: string; aciklama: string; odeme_yontemi: string;
  hesap?: string | null; fatura_idleri?: string[] | null; rapor_id?: string | null;
}
export interface DetayFatura { id: string; fatura_no: string; fatura_tarihi: string; toplam_tutar: number; durum: string }

interface Props {
  odeme: DetayOdeme;
  faturalar: DetayFatura[];   // bu carinin faturaları
  odemeler: DetayOdeme[];     // bu carinin ödemeleri (başka ödemeye bağlı faturaları bilmek için)
  onKapat: () => void;
  onKaydedildi: (mesaj: string) => void;
}

const fmt = fmt2;
const fmtTarih = (t: string) => fmtTarihOrtak(t) || "—";
const inputCls = "w-full bg-alan border border-cizgi hover:border-cizgi-guclu focus:border-altin/50 text-yazi text-sm h-11 px-3 rounded-xl outline-none transition-all placeholder:text-gray-700 disabled:opacity-50";
const MEVCUT = "__mevcut";
const paraYazi = (n: number) => paraGirdisi(String(Math.round((Number(n) || 0) * 100) / 100).replace(".", ","));

export default function OdemeDetay({ odeme, faturalar, odemeler, onKapat, onKaydedildi }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const saltOkunur = !!odeme.rapor_id;
  const eskiKayit = !Array.isArray(odeme.fatura_idleri); // bağlantı bilgisi tutulmamış eski kayıt
  // Mevcut yöntem: hesaplı kayıtlar hesap adıyla; hesapsız ve listede olmayan eski yöntemler ("Nakit", "Banka Havalesi"…)
  // olduğu gibi korunur ki kaydedince yanlışlıkla kasaya gider yazılmasın.
  const baslangicYontem = odeme.hesap ? odeme.hesap
    : (ODEME_SECENEKLERI as readonly string[]).includes(odeme.odeme_yontemi) && !(GIDER_HESAPLARI as readonly string[]).includes(odeme.odeme_yontemi)
      ? odeme.odeme_yontemi : MEVCUT;

  const [duzenle, setDuzenle] = useState(false);
  const [tutar, setTutar] = useState(paraYazi(odeme.tutar));
  const [tarih, setTarih] = useState(odeme.tarih);
  const [yontem, setYontem] = useState(baslangicYontem);
  const [aciklama, setAciklama] = useState(odeme.aciklama || "");
  const [bagli, setBagli] = useState<Set<string>>(new Set(odeme.fatura_idleri || []));
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const faturaMap = useMemo(() => new Map(faturalar.map(f => [f.id, f])), [faturalar]);
  const bagliFaturalar = (odeme.fatura_idleri || []).map(id => faturaMap.get(id)).filter((f): f is DetayFatura => !!f);
  const bulunamayan = (odeme.fatura_idleri || []).length - bagliFaturalar.length;
  const bagliToplam = bagliFaturalar.reduce((t, f) => t + (Number(f.toplam_tutar) || 0), 0);

  // Başka ödemelerin kapattığı faturalar (seçim listesinde işaretlenir)
  const digerBaglar = useMemo(() => {
    const m = new Map<string, string>();
    odemeler.filter(o => o.id !== odeme.id).forEach(o => (o.fatura_idleri || []).forEach(id => m.set(id, `${fmtTarih(o.tarih)} · ₺${fmt(o.tutar)}`)));
    return m;
  }, [odemeler, odeme.id]);
  // Seçilebilir faturalar: bu ödemeye bağlı olanlar + ödenmemişler
  const secilebilir = useMemo(() => faturalar
    .filter(f => bagli.has(f.id) || (odeme.fatura_idleri || []).includes(f.id) || f.durum !== "odendi")
    .sort((a, b) => b.fatura_tarihi.localeCompare(a.fatura_tarihi)), [faturalar, bagli, odeme.fatura_idleri]);
  const seciliToplam = secilebilir.filter(f => bagli.has(f.id)).reduce((t, f) => t + (Number(f.toplam_tutar) || 0), 0);

  const sec = (id: string) => setBagli(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });

  const kaydet = async () => {
    const yeniTutar = tv(tutar);
    if (!yeniTutar || yeniTutar <= 0) { setHata("Tutar giriniz."); return; }
    setKaydediliyor(true); setHata(null);
    try {
      const alanlar = yontem === MEVCUT ? { odeme_yontemi: odeme.odeme_yontemi, hesap: null } : odemeKaydiAlanlari(yontem);
      const eski = new Set(odeme.fatura_idleri || []);
      const yeni = [...bagli];
      // Eski kayıtta hiçbir fatura seçilmediyse bağlantısız (null) kalsın — boş liste "faturasız ödeme" sayılır ve borcu değiştirir
      const fatura_idleri = eskiKayit && yeni.length === 0 ? null : yeni;
      const { error } = await supabase.from("cari_odemeler").update({
        tutar: yeniTutar, tarih, aciklama, ...alanlar, fatura_idleri,
      }).eq("id", odeme.id);
      if (error) throw new Error("Ödeme güncellenemedi: " + error.message);
      // Bağlantıdan çıkan faturalar başka ödemeye bağlı değilse tekrar "bekliyor" olur
      const cikan = [...eski].filter(id => !bagli.has(id) && !digerBaglar.has(id));
      if (cikan.length) {
        const { error: e2 } = await supabase.from("faturalar").update({ durum: "bekliyor", islendi: false, hatir_faturasi: false }).in("id", cikan);
        if (e2) throw new Error("Faturalar güncellenemedi: " + e2.message);
      }
      if (yeni.length) {
        const { error: e3 } = await supabase.from("faturalar").update({ durum: "odendi", islendi: true, hatir_faturasi: yontem === HATIR_FATURASI }).in("id", yeni);
        if (e3) throw new Error("Faturalar güncellenemedi: " + e3.message);
      }
      onKaydedildi("Ödeme güncellendi.");
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e));
    } finally {
      setKaydediliyor(false);
    }
  };

  const hesapDegisti = (yontem === MEVCUT ? null : odemeKaydiAlanlari(yontem).hesap) !== (odeme.hesap || null);
  const yeniHesap = yontem === MEVCUT ? null : odemeKaydiAlanlari(yontem).hesap;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onKapat}>
      <div className="bg-kart border border-cizgi rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-cizgi shrink-0">
          <div>
            <h3 className="text-base font-black text-yazi">{duzenle ? "Ödemeyi Düzenle" : "Ödeme Detayı"}</h3>
            <p className="text-[10px] text-gray-600 mt-0.5">{fmtTarih(odeme.tarih)} · {odeme.odeme_yontemi}</p>
          </div>
          <button onClick={onKapat} className="text-gray-600 hover:text-yazi"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {!duzenle ? (
            <>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-widest">Ödeme tutarı</p>
                  <p className="text-3xl font-black text-emerald-400">₺{fmt(odeme.tutar)}</p>
                </div>
                <p className="text-xs text-gray-500 text-right">
                  {odeme.hesap ? <>Kasa: <b className="text-yazi">{HESAP_ETIKET[odeme.hesap] || odeme.hesap}</b></> : "Kasaya yansımıyor"}
                </p>
              </div>
              {odeme.aciklama && <p className="text-sm text-gray-400 bg-alan border border-cizgi rounded-xl px-3 py-2">{odeme.aciklama}</p>}

              <div>
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-2 font-bold flex items-center gap-1.5"><Link2 size={12} /> Kapattığı faturalar</p>
                {eskiKayit ? (
                  <p className="text-xs text-gray-500 bg-alan border border-cizgi rounded-xl px-3 py-3">Bu eski bir kayıt; hangi faturaları kapattığı kaydedilmemiş. &quot;Düzenle&quot;den faturaları seçerek bağlayabilirsiniz.</p>
                ) : bagliFaturalar.length === 0 && bulunamayan === 0 ? (
                  <p className="text-xs text-gray-500 bg-alan border border-cizgi rounded-xl px-3 py-3">Faturaya bağlı değil (faturasız ödeme) — cari borcundan doğrudan düşülür.</p>
                ) : (
                  <div className="rounded-xl border border-cizgi overflow-hidden">
                    {bagliFaturalar.map(f => (
                      <div key={f.id} className="flex items-center justify-between px-4 py-2.5 text-sm border-b border-cizgi last:border-b-0">
                        <div>
                          <p className="font-bold text-blue-400">{f.fatura_no}</p>
                          <p className="text-[11px] text-gray-500">{fmtTarih(f.fatura_tarihi)}</p>
                        </div>
                        <span className="font-black text-yazi">₺{fmt(f.toplam_tutar)}</span>
                      </div>
                    ))}
                    {bulunamayan > 0 && <p className="px-4 py-2 text-[11px] text-red-300">{bulunamayan} fatura silinmiş.</p>}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-alan text-xs">
                      <span className="text-gray-500">{bagliFaturalar.length} fatura toplamı</span>
                      <span className="font-black text-yazi">₺{fmt(bagliToplam)}</span>
                    </div>
                  </div>
                )}
                {!eskiKayit && bagliFaturalar.length > 0 && Math.abs(bagliToplam - odeme.tutar) > 0.01 && (
                  <p className="mt-2 text-[11px] text-amber-300 flex items-center gap-1.5"><AlertTriangle size={12} /> Ödeme tutarı fatura toplamından ₺{fmt(Math.abs(odeme.tutar - bagliToplam))} {odeme.tutar > bagliToplam ? "fazla" : "eksik"}.</p>
                )}
              </div>
              {saltOkunur && <p className="text-[11px] text-gray-500">Bu ödeme günlük rapordaki firma giderinden geliyor; değiştirmek için ilgili günlük raporu düzenleyin.</p>}
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Tutar (₺)</p>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-sm">₺</span>
                    <input type="text" inputMode="decimal" value={tutar} onChange={e => setTutar(paraGirdisi(e.target.value))} className={`${inputCls} pl-8`} />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Tarih</p>
                  <input type="date" value={tarih} onChange={e => setTarih(e.target.value)} className={inputCls} />
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Hangi hesaptan</p>
                <select value={yontem} onChange={e => setYontem(e.target.value)} className={inputCls}>
                  {baslangicYontem === MEVCUT && <option value={MEVCUT} className="bg-kart">{odeme.odeme_yontemi} (kasaya yansımıyor — mevcut)</option>}
                  {ODEME_SECENEKLERI.map(y => <option key={y} value={y} className="bg-kart">{HESAP_ETIKET[y] || y}</option>)}
                </select>
                {hesapDegisti ? (
                  <p className="text-[11px] text-amber-300 mt-1.5">
                    {odeme.hesap && <>{HESAP_ETIKET[odeme.hesap] || odeme.hesap} hesabındaki kasa hareketi kaldırılır. </>}
                    {yeniHesap ? (kartMi(yeniHesap) ? `${HESAP_ETIKET[yeniHesap]} borcuna eklenir.` : `${HESAP_ETIKET[yeniHesap]} bakiyesinden düşülür.`) : "Kasaya yansımaz."}
                  </p>
                ) : (
                  <p className="text-[11px] text-gray-500 mt-1.5">{yeniHesap ? "Tutar/tarih değişirse kasa hareketi de güncellenir." : kasasizMi(yontem) ? "Kasaya yansımaz." : "Bu yöntem kasaya yansımaz."}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Açıklama</p>
                <input value={aciklama} onChange={e => setAciklama(e.target.value)} placeholder="Opsiyonel..." className={inputCls} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-500 uppercase tracking-widest font-bold">Kapattığı faturalar</p>
                  <span className="text-xs text-gray-500">{bagli.size} seçili · ₺{fmt(seciliToplam)}</span>
                </div>
                {secilebilir.length === 0 ? (
                  <p className="text-xs text-gray-500">Seçilebilecek açık fatura yok.</p>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {secilebilir.map(f => {
                      const s = bagli.has(f.id);
                      const baska = digerBaglar.get(f.id);
                      return (
                        <div key={f.id} onClick={() => sec(f.id)}
                          className={`flex items-center justify-between px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${s ? "bg-altin/10 border-altin/40" : "bg-alan border-cizgi hover:border-cizgi-guclu"}`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${s ? "bg-altin border-altin" : "border-gray-400"}`}>
                              {s && <CheckCircle2 size={12} className="text-[#1a1408]" />}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-yazi">{f.fatura_no}</p>
                              <p className="text-[11px] text-gray-500">{fmtTarih(f.fatura_tarihi)}{baska && <span className="text-amber-300"> · başka ödemede de var ({baska})</span>}</p>
                            </div>
                          </div>
                          <span className="text-sm font-black text-emerald-400">₺{fmt(f.toplam_tutar)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {bagli.size > 0 && Math.abs(seciliToplam - tv(tutar)) > 0.01 && (
                  <button type="button" onClick={() => setTutar(paraYazi(seciliToplam))} className="mt-2 text-[11px] font-bold text-blue-400 hover:text-blue-300">
                    Tutarı seçili faturaların toplamı yap (₺{fmt(seciliToplam)})
                  </button>
                )}
              </div>
            </>
          )}
          {hata && <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2 flex items-center gap-2"><AlertTriangle size={13} /> {hata}</p>}
        </div>

        <div className="px-6 py-4 border-t border-cizgi shrink-0 flex gap-2">
          {!duzenle ? (
            <>
              <button onClick={onKapat} className="flex-1 text-sm font-semibold text-gray-500 hover:text-yazi border border-cizgi py-3 rounded-xl transition-colors">Kapat</button>
              {!saltOkunur && (
                <button onClick={() => setDuzenle(true)} className="flex-1 text-sm font-bold text-[#1a1408] kebo-btn-altin hover:brightness-110 py-3 rounded-xl transition-colors">Düzenle</button>
              )}
            </>
          ) : (
            <>
              <button onClick={() => setDuzenle(false)} className="flex-1 text-sm font-semibold text-gray-500 hover:text-yazi border border-cizgi py-3 rounded-xl transition-colors">Vazgeç</button>
              <button onClick={kaydet} disabled={kaydediliyor}
                className="flex-1 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                {kaydediliyor ? <Loader2 size={14} className="animate-spin" /> : null} Kaydet
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
