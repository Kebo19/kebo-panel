"use client";

// Kasa sayfasındaki "Sabit giderler" kartı: her ay tekrarlayan giderler (kira,
// elektrik...) ve bu ayki ödeme durumu. "Öde" → kasa_manuel_islemler'e
// kaynak='sabit_gider', kaynak_id=<sabit gider id> ile gider kaydı eklenir.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useYetki } from "@/lib/useYetki";
import { tv, fmt2, paraGirdisi, paraYaz } from "@/lib/para";
import { bugun, ayBasi, aySonu, fmtTarih } from "@/lib/tarih";
import { ODEME_HESAPLARI, HESAP_ETIKET } from "@/lib/cari";
import { KASA_GIDER_KATEGORILERI, AY_ADLARI, sabitGiderDurum, type SabitGiderDurum } from "@/lib/karZarar";
import { CalendarClock, Plus, Pencil, Loader2, X, CheckCircle2, AlertTriangle, Clock } from "lucide-react";

export interface SabitGider {
  id: string; ad: string; kategori: string; tutar: number; gun: number; hesap: string;
  degisken: boolean; aktif: boolean; notlar: string | null;
}
interface Odeme { kaynak_id: string; islem_tarihi: string; tutar: number }

const inputCls = "w-full bg-[#f7f8fa] border border-[#e2e5eb] focus:border-blue-500/40 text-[#1a1f2e] text-[13px] h-10 px-3 rounded-xl outline-none";
const etiketCls = "block text-[11px] font-semibold text-gray-600 mb-1";

const DURUM_GORUNUM: Record<SabitGiderDurum, { yazi: string; cls: string; ikon: React.ReactNode }> = {
  odendi: { yazi: "ÖDENDİ", cls: "bg-emerald-500/10 text-emerald-700", ikon: <CheckCircle2 size={11} /> },
  bekliyor: { yazi: "BEKLİYOR", cls: "bg-amber-500/10 text-amber-700", ikon: <Clock size={11} /> },
  gecikti: { yazi: "GECİKTİ", cls: "bg-red-500/10 text-red-700", ikon: <AlertTriangle size={11} /> },
};

const bosForm = { ad: "", kategori: "Kira", tutar: "", gun: "1", hesap: "Enpara", degisken: false, notlar: "" };

export default function SabitGiderler({ onChange }: { onChange?: () => void }) {
  const supabase = createClient();
  const { kullaniciAdi } = useYetki();
  const [liste, setListe] = useState<SabitGider[]>([]);
  const [odemeler, setOdemeler] = useState<Odeme[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [pasifGoster, setPasifGoster] = useState(false);

  const [duzenlenen, setDuzenlenen] = useState<SabitGider | "yeni" | null>(null);
  const [form, setForm] = useState(bosForm);

  const [odenecek, setOdenecek] = useState<SabitGider | null>(null);
  const [oTutar, setOTutar] = useState("");
  const [oHesap, setOHesap] = useState("Enpara");
  const [oTarih, setOTarih] = useState(() => bugun());

  const bugunStr = bugun();
  const ayAdi = AY_ADLARI[Number(bugunStr.slice(5, 7)) - 1];

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    const t = bugun();
    const [{ data: s, error }, { data: o }] = await Promise.all([
      supabase.from("sabit_giderler").select("*").order("gun"),
      supabase.from("kasa_manuel_islemler").select("kaynak_id,islem_tarihi,tutar")
        .eq("kaynak", "sabit_gider").gte("islem_tarihi", ayBasi(t)).lte("islem_tarihi", aySonu(t.slice(0, 4), t.slice(5, 7))),
    ]);
    if (error) console.error("sabit_giderler:", error.message);
    setListe((s || []) as SabitGider[]);
    setOdemeler((o || []) as Odeme[]);
    setYukleniyor(false);
  }, [supabase]);

  useEffect(() => { yukle(); }, [yukle]);

  const satirlar = useMemo(() => liste
    .filter(s => pasifGoster || s.aktif)
    .map(s => {
      const odeme = odemeler.filter(o => o.kaynak_id === s.id).sort((a, b) => b.islem_tarihi.localeCompare(a.islem_tarihi))[0];
      return { ...s, odeme, durum: sabitGiderDurum(s.gun, bugunStr, odeme?.islem_tarihi) };
    }), [liste, odemeler, pasifGoster, bugunStr]);

  const aktifler = satirlar.filter(s => s.aktif);
  const bekleyenToplam = aktifler.filter(s => s.durum !== "odendi").reduce((t, s) => t + (s.degisken ? 0 : Number(s.tutar) || 0), 0);
  const gecikenSayi = aktifler.filter(s => s.durum === "gecikti").length;

  // ── Ekle / düzenle ──
  const formAc = (s: SabitGider | "yeni") => {
    setDuzenlenen(s);
    setForm(s === "yeni" ? bosForm : {
      ad: s.ad, kategori: s.kategori, tutar: s.degisken ? "" : paraYaz(Number(s.tutar)), gun: String(s.gun),
      hesap: s.hesap, degisken: s.degisken, notlar: s.notlar || "",
    });
  };
  const formKaydet = async (e: React.FormEvent) => {
    e.preventDefault();
    const gun = Math.round(Number(form.gun));
    if (!form.ad.trim()) { alert("Gider adı girin."); return; }
    if (!(gun >= 1 && gun <= 31)) { alert("Ayın günü 1–31 arasında olmalı."); return; }
    const tutar = form.degisken ? 0 : tv(form.tutar);
    if (!form.degisken && tutar <= 0) { alert("Tutar girin (her ay değişiyorsa \"Değişken tutar\" seçin)."); return; }
    setKaydediliyor(true);
    try {
      const kayit = { ad: form.ad.trim(), kategori: form.kategori, tutar, gun, hesap: form.hesap, degisken: form.degisken, notlar: form.notlar.trim() || null };
      const { error } = duzenlenen === "yeni"
        ? await supabase.from("sabit_giderler").insert([kayit])
        : await supabase.from("sabit_giderler").update(kayit).eq("id", (duzenlenen as SabitGider).id);
      if (error) { alert("Hata: " + error.message); return; }
      setDuzenlenen(null);
      yukle();
    } finally { setKaydediliyor(false); }
  };
  const aktiflikDegistir = async (s: SabitGider) => {
    if (s.aktif && !confirm(`"${s.ad}" pasifleştirilsin mi? Listede görünmez, geçmiş ödemeler kalır.`)) return;
    const { error } = await supabase.from("sabit_giderler").update({ aktif: !s.aktif }).eq("id", s.id);
    if (error) { alert("Hata: " + error.message); return; }
    setDuzenlenen(null);
    yukle();
  };

  // ── Öde ──
  const odeAc = (s: SabitGider) => {
    setOdenecek(s);
    setOTutar(s.degisken ? "" : paraYaz(Number(s.tutar)));
    setOHesap(s.hesap || "Enpara");
    setOTarih(bugun());
  };
  const odemeKaydet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!odenecek) return;
    const tutar = tv(oTutar);
    if (tutar <= 0) { alert("Ödenen tutarı girin."); return; }
    setKaydediliyor(true);
    try {
      const ay = AY_ADLARI[Number(oTarih.slice(5, 7)) - 1];
      const { error } = await supabase.from("kasa_manuel_islemler").insert([{
        tip: "gider", hesap: oHesap, kategori: odenecek.kategori, tutar,
        aciklama: `${odenecek.ad} — ${ay}`, islem_tarihi: oTarih,
        ekleyen_kullanici: kullaniciAdi || "Bilinmiyor",
        kaynak: "sabit_gider", kaynak_id: odenecek.id,
      }]);
      if (error) { alert("Hata: " + error.message); return; }
      setOdenecek(null);
      await yukle();
      onChange?.();
    } finally { setKaydediliyor(false); }
  };

  return (
    <div className="bg-[#ffffff] border border-[#e2e5eb] rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#e2e5eb] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center"><CalendarClock size={14} className="text-indigo-600" /></div>
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Sabit giderler — {ayAdi}</h3>
            <p className="text-[11px] text-gray-500">
              {aktifler.length === 0 ? "Her ay tekrarlayan ödemeler"
                : bekleyenToplam > 0 || gecikenSayi > 0
                  ? <>Bekleyen ₺{fmt2(bekleyenToplam)}{gecikenSayi > 0 && <span className="text-red-600 font-semibold"> · {gecikenSayi} gecikmiş</span>}</>
                  : "Bu ayın tüm sabit giderleri ödendi ✓"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {liste.some(s => !s.aktif) && (
            <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer">
              <input type="checkbox" checked={pasifGoster} onChange={e => setPasifGoster(e.target.checked)} /> Pasifler
            </label>
          )}
          <button onClick={() => formAc("yeni")} className="flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-2 rounded-xl">
            <Plus size={13} /> Sabit gider
          </button>
        </div>
      </div>

      {yukleniyor ? (
        <div className="py-8 flex justify-center"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
      ) : satirlar.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-[13px] text-gray-600">Kira, elektrik, doğalgaz, su, internet, muhasebe gibi her ay tekrarlayan giderleri ekleyin.</p>
          <p className="text-[11px] text-gray-500 mt-1">Her ay hangisinin ödendiğini buradan takip edip tek tıkla ödeyebilirsiniz.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#f7f8fa] border-b border-[#e2e5eb]">
                {["Gider", "Kategori", "Tutar", "Gün", "Hesap", "Bu ay", ""].map((h, i) => (
                  <th key={i} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef0f3]">
              {satirlar.map(s => {
                const g = DURUM_GORUNUM[s.durum];
                return (
                  <tr key={s.id} className={s.aktif ? "" : "opacity-50"}>
                    <td className="px-4 py-3 font-semibold text-[#1a1f2e]">
                      {s.ad}
                      {s.notlar && <p className="text-[10px] font-normal text-gray-500 max-w-[200px] truncate">{s.notlar}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{s.kategori}</td>
                    <td className="px-4 py-3 font-bold whitespace-nowrap">{s.degisken ? <span className="text-gray-500 font-medium italic">değişken</span> : `₺${fmt2(Number(s.tutar))}`}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">Ayın {s.gun}&apos;i</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{HESAP_ETIKET[s.hesap] || s.hesap}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {s.aktif ? (
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg ${g.cls}`}>
                          {g.ikon} {g.yazi}{s.odeme && ` ${fmtTarih(s.odeme.islem_tarihi)}`}
                        </span>
                      ) : <span className="text-[10px] text-gray-500">pasif</span>}
                      {s.odeme && s.degisken && <p className="text-[10px] text-gray-500 mt-0.5">₺{fmt2(Number(s.odeme.tutar))}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {s.aktif && s.durum !== "odendi" && (
                          <button onClick={() => odeAc(s)} className="text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg">Öde</button>
                        )}
                        <button onClick={() => formAc(s)} title="Düzenle" className="p-1.5 text-gray-500 hover:text-[#1a1f2e]"><Pencil size={13} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Ekle / düzenle ── */}
      {duzenlenen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <form onSubmit={formKaydet} className="bg-white border border-[#e2e5eb] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e2e5eb]">
              <p className="text-sm font-black text-[#1a1f2e]">{duzenlenen === "yeni" ? "Sabit gider ekle" : "Sabit gideri düzenle"}</p>
              <button type="button" onClick={() => setDuzenlenen(null)} className="text-gray-600"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              <label className="block"><span className={etiketCls}>Gider adı *</span>
                <input value={form.ad} onChange={e => setForm({ ...form, ad: e.target.value })} placeholder="Örn. Dükkan kirası" className={inputCls} />
              </label>
              <label className="block"><span className={etiketCls}>Kategori</span>
                <select value={form.kategori} onChange={e => setForm({ ...form, kategori: e.target.value })} className={inputCls}>
                  {KASA_GIDER_KATEGORILERI.map(g => (
                    <optgroup key={g.grup} label={g.grup}>{g.items.map(k => <option key={k} value={k}>{k}</option>)}</optgroup>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-[12px] text-gray-700 cursor-pointer">
                <input type="checkbox" checked={form.degisken} onChange={e => setForm({ ...form, degisken: e.target.checked })} />
                Değişken tutar (elektrik, doğalgaz gibi — tutar öderken girilir)
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className={etiketCls}>Tutar ₺ {form.degisken ? "" : "*"}</span>
                  <input type="text" inputMode="decimal" disabled={form.degisken} value={form.degisken ? "" : form.tutar}
                    onChange={e => setForm({ ...form, tutar: paraGirdisi(e.target.value) })} placeholder={form.degisken ? "değişken" : "0"} className={`${inputCls} disabled:opacity-50`} />
                </label>
                <label className="block"><span className={etiketCls}>Ayın kaçı *</span>
                  <input type="number" min={1} max={31} value={form.gun} onChange={e => setForm({ ...form, gun: e.target.value })} className={inputCls} />
                </label>
              </div>
              <label className="block"><span className={etiketCls}>Ödeneceği hesap</span>
                <select value={form.hesap} onChange={e => setForm({ ...form, hesap: e.target.value })} className={inputCls}>
                  {ODEME_HESAPLARI.map(h => <option key={h} value={h}>{HESAP_ETIKET[h]}</option>)}
                </select>
              </label>
              <label className="block"><span className={etiketCls}>Not</span>
                <input value={form.notlar} onChange={e => setForm({ ...form, notlar: e.target.value })} placeholder="Opsiyonel (abone no, IBAN...)" className={inputCls} />
              </label>
              <div className="flex gap-2 pt-1">
                {duzenlenen !== "yeni" && (
                  <button type="button" onClick={() => aktiflikDegistir(duzenlenen)}
                    className="text-xs font-semibold text-gray-600 border border-[#e2e5eb] px-3 py-2.5 rounded-xl hover:text-red-600">
                    {duzenlenen.aktif ? "Pasifleştir" : "Aktifleştir"}
                  </button>
                )}
                <button type="button" onClick={() => setDuzenlenen(null)} className="flex-1 text-xs font-semibold text-gray-500 border border-[#e2e5eb] py-2.5 rounded-xl">İptal</button>
                <button type="submit" disabled={kaydediliyor} className="flex-1 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 py-2.5 rounded-xl flex items-center justify-center gap-2">
                  {kaydediliyor && <Loader2 size={13} className="animate-spin" />} Kaydet
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ── Öde ── */}
      {odenecek && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <form onSubmit={odemeKaydet} className="bg-white border border-[#e2e5eb] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e2e5eb]">
              <div>
                <p className="text-sm font-black text-[#1a1f2e]">{odenecek.ad} — öde</p>
                <p className="text-[11px] text-gray-500">{odenecek.kategori} · kasaya gider olarak işlenir</p>
              </div>
              <button type="button" onClick={() => setOdenecek(null)} className="text-gray-600"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              <label className="block"><span className={etiketCls}>Tutar ₺ *</span>
                <input type="text" inputMode="decimal" autoFocus={odenecek.degisken} value={oTutar} onChange={e => setOTutar(paraGirdisi(e.target.value))}
                  placeholder={odenecek.degisken ? "Bu ayki tutarı girin" : "0"} className="w-full border-2 border-[#1a1f2e] rounded-xl h-11 px-3 text-[16px] font-black text-right outline-none" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className={etiketCls}>Hesap</span>
                  <select value={oHesap} onChange={e => setOHesap(e.target.value)} className={inputCls}>
                    {ODEME_HESAPLARI.map(h => <option key={h} value={h}>{HESAP_ETIKET[h]}</option>)}
                  </select>
                </label>
                <label className="block"><span className={etiketCls}>Tarih</span>
                  <input type="date" value={oTarih} max={bugun()} onChange={e => setOTarih(e.target.value)} style={{ colorScheme: "light" }} className={inputCls} />
                </label>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setOdenecek(null)} className="flex-1 text-xs font-semibold text-gray-500 border border-[#e2e5eb] py-2.5 rounded-xl">İptal</button>
                <button type="submit" disabled={kaydediliyor} className="flex-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 py-2.5 rounded-xl flex items-center justify-center gap-2">
                  {kaydediliyor && <Loader2 size={13} className="animate-spin" />} Ödendi olarak kaydet
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
