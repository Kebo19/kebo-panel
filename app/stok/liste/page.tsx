"use client";

// ─── STOK LİSTESİ DÜZENLE ────────────────────────────────────────────────────
// Bütün malzemeler tek tabloda, düzenlenebilen her şey yan yana: sıra, ad, birim, kategori,
// sayım grubu (günlük / haftalık / aylık / envanter), sayım yeri, minimum stok, not, durum.
// Değişiklikler önce ekranda tutulur, "Kaydet" ile tek seferde yazılır.
// Sayım listeleri birikimlidir: haftalık liste = günlük + haftalık, aylık = günlük + haftalık + aylık.
// Envanter (demirbaş) ayrı listedir; tüketim/sipariş hesaplarına girmez, ara sıra sayılır.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useYetki } from "@/lib/useYetki";
import { PERIYOTLAR, PERIYOT_ADI, PERIYOT_KAPSAMI, urunPeriyodu, type SayimPeriyodu } from "@/lib/kasaFormu";
import { miktarOku } from "@/lib/stok";
import { ArrowLeft, ArrowUp, ArrowDown, Loader2, Save, Plus, Printer, Search, Undo2, Trash2 } from "lucide-react";

interface Satir {
  id: string; urun_adi: string; birim: string; kategori: string | null; sayim_periyodu: string | null;
  sayim_yeri: string | null; min_stok: number | null; notlar: string | null; durum: string; sira_no: number | null;
}
type Form = Omit<Satir, "min_stok"> & { min_stok: string; yeni?: boolean };

const BIRIMLER = ["kg", "gr", "lt", "ml", "adet", "koli", "paket", "düzine", "torba", "kova", "şişe"];
const RENK: Record<SayimPeriyodu, string> = {
  gunluk: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  haftalik: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  aylik: "bg-violet-500/20 text-violet-300 border-violet-500/40",
  envanter: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
};
const KISA: Record<SayimPeriyodu, string> = { gunluk: "Günlük", haftalik: "Haftalık", aylik: "Aylık", envanter: "Envanter" };
const inp = "w-full bg-alan border border-cizgi text-yazi text-[12px] h-8 px-2 rounded-lg outline-none focus:border-emerald-500/50";

const formaCevir = (s: Satir): Form => ({ ...s, min_stok: s.min_stok == null ? "" : String(s.min_stok).replace(".", ",") });
const ayni = (a: Form, b: Form) =>
  a.urun_adi.trim() === b.urun_adi.trim() && a.birim === b.birim && (a.kategori || "").trim() === (b.kategori || "").trim()
  && urunPeriyodu(a.sayim_periyodu) === urunPeriyodu(b.sayim_periyodu) && (a.sayim_yeri || "").trim() === (b.sayim_yeri || "").trim()
  && (miktarOku(a.min_stok) || 0) === (miktarOku(b.min_stok) || 0) && (a.notlar || "").trim() === (b.notlar || "").trim()
  && a.durum === b.durum && a.sira_no === b.sira_no;

export default function StokListePage() {
  const supabase = useMemo(() => createClient(), []);
  const yetki = useYetki();
  const izinli = yetki.izin("stok");
  const [orijinal, setOrijinal] = useState<Map<string, Form>>(new Map());
  const [satirlar, setSatirlar] = useState<Form[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [mesaj, setMesaj] = useState<{ tip: "ok" | "hata"; metin: string } | null>(null);
  const [arama, setArama] = useState("");
  const [grupFiltre, setGrupFiltre] = useState<SayimPeriyodu | "">("");
  const [pasifler, setPasifler] = useState(false);
  const [secili, setSecili] = useState<Set<string>>(new Set());
  const [topluYer, setTopluYer] = useState("");
  const [topluKategori, setTopluKategori] = useState("");

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    const { data, error } = await supabase.from("stok_urunler")
      .select("id,urun_adi,birim,kategori,sayim_periyodu,sayim_yeri,min_stok,notlar,durum,sira_no")
      .order("sira_no", { ascending: true, nullsFirst: false }).order("urun_adi");
    setYukleniyor(false);
    if (error) { setMesaj({ tip: "hata", metin: error.message }); return; }
    const f = ((data || []) as Satir[]).map(formaCevir);
    setOrijinal(new Map(f.map(x => [x.id, x])));
    setSatirlar(f);
    setSecili(new Set());
  }, [supabase]);
  useEffect(() => { if (!yetki.yukleniyor && izinli) yukle(); }, [yukle, yetki.yukleniyor, izinli]);

  // Değişiklik takibi
  const degisenler = useMemo(() => satirlar.filter(s => s.yeni ? s.urun_adi.trim() : !ayni(s, orijinal.get(s.id)!)), [satirlar, orijinal]);
  const degisti = useCallback((id: string) => {
    const s = satirlar.find(x => x.id === id);
    return !!s && (s.yeni || !ayni(s, orijinal.get(id)!));
  }, [satirlar, orijinal]);

  const guncelle = (id: string, alan: Partial<Form>) => setSatirlar(l => l.map(s => s.id === id ? { ...s, ...alan } : s));
  const toplu = (alan: Partial<Form>) => setSatirlar(l => l.map(s => secili.has(s.id) ? { ...s, ...alan } : s));

  const aktifler = useMemo(() => satirlar.filter(s => s.durum === "aktif"), [satirlar]);
  const gorunen = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr-TR");
    return satirlar.filter(s => (pasifler || s.durum === "aktif")
      && (!grupFiltre || urunPeriyodu(s.sayim_periyodu) === grupFiltre)
      && (!q || [s.urun_adi, s.kategori, s.sayim_yeri].some(v => (v || "").toLocaleLowerCase("tr-TR").includes(q))));
  }, [satirlar, arama, grupFiltre, pasifler]);

  // Sıra: görünen listede bir üst/alt satırla yer değiştirir; kaydederken bütün aktifler 1..n numaralanır
  const tasi = (id: string, yon: -1 | 1) => {
    const i = gorunen.findIndex(s => s.id === id), j = i + yon;
    if (j < 0 || j >= gorunen.length) return;
    const a = gorunen[i].id, b = gorunen[j].id;
    setSatirlar(l => {
      const k = [...l]; const ia = k.findIndex(s => s.id === a), ib = k.findIndex(s => s.id === b);
      [k[ia], k[ib]] = [k[ib], k[ia]];
      let n = 0;
      return k.map(s => s.durum === "aktif" ? { ...s, sira_no: ++n } : s);
    });
  };

  const yeniSatir = () => {
    const id = `yeni-${Date.now()}`;
    setSatirlar(l => [...l, { id, yeni: true, urun_adi: "", birim: "kg", kategori: null, sayim_periyodu: grupFiltre || "gunluk",
      sayim_yeri: null, min_stok: "", notlar: null, durum: "aktif", sira_no: l.filter(s => s.durum === "aktif").length + 1 }]);
    setGrupFiltre(""); setArama("");
    setTimeout(() => document.getElementById(`ad-${id}`)?.focus(), 50);
  };

  const geriAl = () => { setSatirlar([...orijinal.values()].sort((a, b) => (a.sira_no ?? 9999) - (b.sira_no ?? 9999))); setSecili(new Set()); };

  /** Kaydeder; başarılıysa true (Yazdır önce kaydeder ki kağıda son liste gelsin). */
  const kaydet = async (): Promise<boolean> => {
    const bos = satirlar.filter(s => !s.yeni && !s.urun_adi.trim());
    if (bos.length) { setMesaj({ tip: "hata", metin: "Adı boş bırakılan ürün var." }); return false; }
    const hatali = degisenler.filter(s => s.min_stok.trim() && !(miktarOku(s.min_stok) >= 0));
    if (hatali.length) { setMesaj({ tip: "hata", metin: `Minimum stok sayı olmalı: ${hatali.map(s => s.urun_adi).join(", ")}` }); return false; }
    setKaydediliyor(true); setMesaj(null);
    try {
      const alanlar = (s: Form) => ({
        urun_adi: s.urun_adi.trim(), birim: s.birim, kategori: (s.kategori || "").trim() || null,
        sayim_periyodu: urunPeriyodu(s.sayim_periyodu), sayim_yeri: (s.sayim_yeri || "").trim() || null,
        min_stok: miktarOku(s.min_stok) || 0, notlar: (s.notlar || "").trim() || null, durum: s.durum, sira_no: s.sira_no,
      });
      const yeniler = degisenler.filter(s => s.yeni);
      const eskiler = degisenler.filter(s => !s.yeni);
      const sonuclar = await Promise.all(eskiler.map(s => supabase.from("stok_urunler").update({ ...alanlar(s), updated_at: new Date().toISOString() }).eq("id", s.id)));
      const hata = sonuclar.find(r => r.error)?.error;
      if (yeniler.length) {
        const { error } = await supabase.from("stok_urunler").insert(yeniler.map(s => ({ ...alanlar(s), mevcut_stok: 0 })));
        if (error) throw error;
      }
      if (hata) throw hata;
      setMesaj({ tip: "ok", metin: `${degisenler.length} ürün kaydedildi.` });
      await yukle();
      return true;
    } catch (e) {
      setMesaj({ tip: "hata", metin: e instanceof Error ? e.message : String((e as { message?: string })?.message || e) });
      return false;
    } finally { setKaydediliyor(false); }
  };
  /** Yazdır / PDF: kaydedilmemiş değişiklik varsa önce kaydeder, sonra güncel listeyi kağıt sayfasında açar. */
  const yazdir = async (p: SayimPeriyodu) => {
    if (degisenler.length && !(await kaydet())) return;
    window.location.assign(`/stok/kagit?liste=${p}`);
  };

  const kategoriler = useMemo(() => [...new Set(satirlar.map(s => (s.kategori || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr")), [satirlar]);
  const yerler = useMemo(() => [...new Set(satirlar.map(s => (s.sayim_yeri || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr")), [satirlar]);
  const listeSayisi = (p: SayimPeriyodu) => aktifler.filter(s => PERIYOT_KAPSAMI[p].includes(urunPeriyodu(s.sayim_periyodu))).length;
  const grupSayisi = (p: SayimPeriyodu) => aktifler.filter(s => urunPeriyodu(s.sayim_periyodu) === p).length;
  const hepsiSecili = gorunen.length > 0 && gorunen.every(s => secili.has(s.id));

  if (yetki.yukleniyor || (izinli && yukleniyor && !satirlar.length)) return <div className="h-screen bg-zemin flex items-center justify-center"><Loader2 className="animate-spin text-emerald-400" /></div>;
  if (!izinli) return <div className="min-h-screen bg-zemin flex items-center justify-center p-6 text-sm text-gray-600">Bu sayfayı görme yetkiniz yok.</div>;

  return (
    <div className="min-h-screen bg-zemin text-yazi pb-28">
      <div className="sticky top-0 z-30 border-b border-cizgi bg-zemin/95 backdrop-blur-xl">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/stok" className="p-2 border border-cizgi rounded-xl text-gray-500 hover:text-yazi"><ArrowLeft size={16} /></Link>
            <div>
              <h1 className="text-sm font-black">Stok Listesi Düzenle</h1>
              <p className="text-[10px] text-gray-600">{aktifler.length} aktif malzeme · değişiklikler &quot;Kaydet&quot;e basınca yazılır</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {degisenler.length > 0 && (
              <button onClick={geriAl} className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-yazi border border-cizgi px-3 py-2 rounded-xl"><Undo2 size={13} /> Geri al</button>
            )}
            <button onClick={yeniSatir} className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-300 border border-emerald-500/40 px-3 py-2 rounded-xl hover:bg-emerald-500/10"><Plus size={13} /> Yeni malzeme</button>
            <button onClick={() => { void kaydet(); }} disabled={!degisenler.length || kaydediliyor}
              className="flex items-center gap-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 px-4 py-2 rounded-xl">
              {kaydediliyor ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Kaydet{degisenler.length ? ` (${degisenler.length})` : ""}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-4 py-4 space-y-4">
        {/* Sayım listeleri */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {PERIYOTLAR.map(p => (
            <div key={p} className={`rounded-2xl border p-3 ${grupFiltre === p ? "border-emerald-500/60" : "border-cizgi"} bg-kart`}>
              <div className="flex items-center justify-between gap-2">
                <button onClick={() => setGrupFiltre(grupFiltre === p ? "" : p)} className="text-left">
                  <p className="text-xs font-black">{PERIYOT_ADI[p]} sayım listesi</p>
                  <p className="text-[10px] text-gray-500">
                    {p === "envanter" ? "Demirbaşlar, ara sıra" : PERIYOT_KAPSAMI[p].map(x => KISA[x]).join(" + ")}
                  </p>
                </button>
                <span className="text-lg font-black">{listeSayisi(p)}</span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-gray-600">{p !== "gunluk" && p !== "envanter" ? `bu grupta ${grupSayisi(p)} ürün` : "ürün"}</span>
                <button type="button" onClick={() => { void yazdir(p); }} disabled={kaydediliyor}
                  title={degisenler.length ? "Önce değişiklikler kaydedilir, sonra güncel liste açılır" : "Güncel listeyi yazdır / PDF al"}
                  className="flex items-center gap-1 text-[12px] font-semibold text-gray-700 hover:text-yazi border border-cizgi px-2 py-1 rounded-lg disabled:opacity-40">
                  <Printer size={12} /> {degisenler.length ? "Kaydet + Yazdır / PDF" : "Yazdır / PDF"}
                </button>
              </div>
            </div>
          ))}
        </div>
        {degisenler.length > 0 && <p className="text-[12px] text-amber-300">Kaydedilmemiş {degisenler.length} değişiklik var. &quot;Kaydet + Yazdır / PDF&quot; önce kaydeder, kağıda son hali gelir.</p>}

        {/* Filtre */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={arama} onChange={e => setArama(e.target.value)} placeholder="Ürün, kategori ya da yer ara…" className={inp + " pl-8 h-9"} />
          </div>
          <div className="flex gap-1">
            <button onClick={() => setGrupFiltre("")} className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border ${!grupFiltre ? "border-emerald-500/50 text-yazi" : "border-cizgi text-gray-500"}`}>Tümü</button>
            {PERIYOTLAR.map(p => (
              <button key={p} onClick={() => setGrupFiltre(p)} className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border ${grupFiltre === p ? RENK[p] : "border-cizgi text-gray-500"}`}>{KISA[p]} ({grupSayisi(p)})</button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-gray-500"><input type="checkbox" checked={pasifler} onChange={e => setPasifler(e.target.checked)} /> Pasifleri göster</label>
        </div>

        {/* Toplu işlem */}
        {secili.size > 0 && (
          <div className="rounded-2xl border border-amber-500/30 bg-kart p-3 flex flex-wrap items-center gap-2 text-[11px]">
            <b>{secili.size} seçili:</b>
            {PERIYOTLAR.map(p => <button key={p} onClick={() => toplu({ sayim_periyodu: p })} className={`font-bold px-2.5 py-1.5 rounded-lg border ${RENK[p]}`}>{KISA[p]}</button>)}
            <span className="flex items-center gap-1">
              <input list="yerler" value={topluYer} onChange={e => setTopluYer(e.target.value)} placeholder="Sayım yeri" className={inp + " w-32"} />
              <button onClick={() => toplu({ sayim_yeri: topluYer.trim() || null })} className="font-bold px-2 py-1.5 rounded-lg border border-cizgi">Ata</button>
            </span>
            <span className="flex items-center gap-1">
              <input list="kategoriler" value={topluKategori} onChange={e => setTopluKategori(e.target.value)} placeholder="Kategori" className={inp + " w-32"} />
              <button onClick={() => toplu({ kategori: topluKategori.trim() || null })} className="font-bold px-2 py-1.5 rounded-lg border border-cizgi">Ata</button>
            </span>
            <button onClick={() => toplu({ durum: "pasif" })} className="font-bold px-2.5 py-1.5 rounded-lg border border-red-500/40 text-red-300">Pasif yap</button>
            <button onClick={() => toplu({ durum: "aktif" })} className="font-bold px-2.5 py-1.5 rounded-lg border border-cizgi">Aktif yap</button>
            <button onClick={() => setSecili(new Set())} className="text-gray-500 ml-auto">Seçimi kaldır</button>
          </div>
        )}

        <datalist id="kategoriler">{kategoriler.map(k => <option key={k} value={k} />)}</datalist>
        <datalist id="yerler">{[...new Set([...yerler, "Dondurucu", "Soğuk oda", "Kuru depo", "Ambalaj rafı", "Mutfak", "Salon"])].map(k => <option key={k} value={k} />)}</datalist>

        {/* Tablo */}
        <div className="rounded-2xl border border-cizgi bg-kart overflow-x-auto">
          <table className="w-full min-w-[1150px] text-[12px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-cizgi">
                <th className="p-2 w-8"><input type="checkbox" checked={hepsiSecili} onChange={() => setSecili(hepsiSecili ? new Set() : new Set(gorunen.map(s => s.id)))} /></th>
                <th className="p-2 w-16 text-left">Sıra</th>
                <th className="p-2 text-left">Ürün adı</th>
                <th className="p-2 w-24 text-left">Birim</th>
                <th className="p-2 w-40 text-left">Kategori</th>
                <th className="p-2 w-[260px] text-left">Sayım grubu</th>
                <th className="p-2 w-36 text-left">Sayım yeri</th>
                <th className="p-2 w-24 text-left">Min. stok</th>
                <th className="p-2 w-44 text-left">Not</th>
                <th className="p-2 w-24 text-left">Durum</th>
              </tr>
            </thead>
            <tbody>
              {gorunen.map((s, i) => {
                const g = urunPeriyodu(s.sayim_periyodu);
                return (
                  <tr key={s.id} className={`border-b border-cizgi/50 ${degisti(s.id) ? "bg-amber-500/5" : ""} ${s.durum !== "aktif" ? "opacity-50" : ""}`}>
                    <td className="p-2 text-center"><input type="checkbox" checked={secili.has(s.id)} onChange={() => setSecili(x => { const n = new Set(x); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })} /></td>
                    <td className="p-2">
                      <div className="flex items-center gap-0.5">
                        <span className="w-6 text-[11px] text-gray-500 text-right">{s.durum === "aktif" ? s.sira_no : "–"}</span>
                        <button disabled={i === 0} onClick={() => tasi(s.id, -1)} className="p-0.5 text-gray-500 hover:text-yazi disabled:opacity-20"><ArrowUp size={12} /></button>
                        <button disabled={i === gorunen.length - 1} onClick={() => tasi(s.id, 1)} className="p-0.5 text-gray-500 hover:text-yazi disabled:opacity-20"><ArrowDown size={12} /></button>
                      </div>
                    </td>
                    <td className="p-2"><input id={`ad-${s.id}`} value={s.urun_adi} onChange={e => guncelle(s.id, { urun_adi: e.target.value })} placeholder="Ürün adı (ör. TAVUK DÖNER (1 KOLİ 10 KG))" className={inp + " font-semibold"} /></td>
                    <td className="p-2">
                      <select value={s.birim} onChange={e => guncelle(s.id, { birim: e.target.value })} className={inp}>
                        {[...new Set([...BIRIMLER, s.birim])].map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </td>
                    <td className="p-2"><input list="kategoriler" value={s.kategori || ""} onChange={e => guncelle(s.id, { kategori: e.target.value })} className={inp} /></td>
                    <td className="p-2">
                      <div className="grid grid-cols-4 gap-0.5">
                        {PERIYOTLAR.map(p => (
                          <button key={p} onClick={() => guncelle(s.id, { sayim_periyodu: p })}
                            className={`text-[10px] font-bold py-1.5 rounded-md border ${g === p ? RENK[p] : "border-cizgi text-gray-600 hover:text-gray-300"}`}>{KISA[p]}</button>
                        ))}
                      </div>
                    </td>
                    <td className="p-2"><input list="yerler" value={s.sayim_yeri || ""} onChange={e => guncelle(s.id, { sayim_yeri: e.target.value })} placeholder="—" className={inp} /></td>
                    <td className="p-2"><input inputMode="decimal" value={s.min_stok} onChange={e => guncelle(s.id, { min_stok: e.target.value })} placeholder="0" className={inp + ((s.min_stok.trim() && !(miktarOku(s.min_stok) >= 0)) ? " border-red-500" : "")} /></td>
                    <td className="p-2"><input value={s.notlar || ""} onChange={e => guncelle(s.id, { notlar: e.target.value })} className={inp} /></td>
                    <td className="p-2">
                      {s.yeni ? (
                        <button onClick={() => setSatirlar(l => l.filter(x => x.id !== s.id))} className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-400"><Trash2 size={12} /> Vazgeç</button>
                      ) : (
                        <select value={s.durum} onChange={e => guncelle(s.id, { durum: e.target.value })} className={inp}>
                          <option value="aktif">Aktif</option><option value="pasif">Pasif</option>
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
              {gorunen.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-gray-600">Bu filtreye uyan ürün yok.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-600 leading-relaxed">
          <b>Sayım yeri</b> (ör. Dondurucu, Kuru depo) girerseniz sayım kağıdı yerlere göre bölümlenir; sayan kişi depoyu bir kez dolaşarak sayar.
          Kağıttaki sıra = buradaki sıra (yer girildiyse önce yer, sonra sıra). <b>Envanter</b> grubundaki demirbaşlar tüketim ve sipariş hesaplarına girmez.
          Pasif yapılan ürün listelerden ve kağıtlardan çıkar, geçmiş kayıtları silinmez.
        </p>
      </div>

      {mesaj && (
        <div className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-xl text-xs font-semibold shadow-xl border ${mesaj.tip === "ok" ? "bg-emerald-950 border-emerald-500/40 text-emerald-200" : "bg-red-950 border-red-500/40 text-red-200"}`}
          onClick={() => setMesaj(null)}>{mesaj.metin}</div>
      )}
    </div>
  );
}
