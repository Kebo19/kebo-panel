"use client";

// REÇETE MALZEMELERİ — tek yerden giriş (31.10.2026)
// Reçetelerde kullanılan her malzeme bir kez listelenir. Buradan yapılan değişiklik o malzemeyi
// kullanan BÜTÜN reçetelere işlenir:
//   • 1 adet = kaç gram (stok_urunler.adet_gram) — örn. tavuk topu bir kez girilir, 12 reçete kullanır
//   • aynı miktarı toplu değiştirme — örn. "90 g olan bütün tavuk döner satırlarını 99 g yap"
//   • stokta olmayan malzemeyi (sadece adı yazılı) bir stok ürününe bağlama — aynı adlı bütün satırlar bağlanır
//   • tek tek reçete miktarı düzeltme

import { useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anahtar, miktarYaz, type ReceteSatiriTam, type StokBilgi } from "@/lib/receteHesap";
import { miktarOku } from "@/lib/stok";
import { fmt2 } from "@/lib/para";
import { AlertTriangle, ChevronDown, ChevronUp, Search } from "lucide-react";

interface Props {
  supabase: SupabaseClient;
  stok: StokBilgi[];
  satirlar: ReceteSatiriTam[];
  fiyatGorunur: boolean;
  onDegisti: () => void;
}

interface Malzeme {
  anahtar: string;
  ad: string;
  tur: "stok" | "ara" | "serbest";
  stok?: StokBilgi;
  satirlar: ReceteSatiriTam[];
  adetKullaniyor: boolean;
  gramEksik: boolean;
}

const kutu = "bg-kart border border-cizgi rounded-xl";
const giris = "bg-alan border border-cizgi-guclu text-yazi text-[15px] h-10 px-2 rounded-lg outline-none focus:border-altin text-right";
const sayi = (v: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 }).format(v || 0);
const agirlikHacim = (b: string) => ["kg", "g", "gr", "lt", "l", "ml"].includes((b || "").toLowerCase());

export default function ReceteMalzemeleri({ supabase, stok, satirlar, fiyatGorunur, onDegisti }: Props) {
  const [arama, setArama] = useState("");
  const [sadeceEksik, setSadeceEksik] = useState(false);
  const [acik, setAcik] = useState<string | null>(null);
  const [taslak, setTaslak] = useState<Record<string, string>>({});
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [isliyor, setIsliyor] = useState(false);
  const stokMap = useMemo(() => new Map(stok.map(s => [s.id, s])), [stok]);
  const stokSirali = useMemo(() => [...stok].sort((a, b) => a.urun_adi.localeCompare(b.urun_adi, "tr")), [stok]);

  const malzemeler = useMemo(() => {
    const m = new Map<string, Malzeme>();
    for (const r of satirlar) {
      const s = r.stok_urun_id ? stokMap.get(r.stok_urun_id) : undefined;
      const tur: Malzeme["tur"] = r.stok_urun_id ? "stok" : r.ara_recete ? "ara" : "serbest";
      const ad = s?.urun_adi || r.ara_recete || r.malzeme_adi || r.etiket || "Malzeme";
      const k = tur === "stok" ? `stok:${r.stok_urun_id}` : tur === "ara" ? `ara:${anahtar(ad)}` : `serbest:${anahtar(ad)}`;
      if (!m.has(k)) m.set(k, { anahtar: k, ad, tur, stok: s, satirlar: [], adetKullaniyor: false, gramEksik: false });
      const x = m.get(k)!;
      x.satirlar.push(r);
      if (r.birim === "adet" && s && agirlikHacim(s.birim)) { x.adetKullaniyor = true; if (!s.adet_gram) x.gramEksik = true; }
    }
    return [...m.values()].sort((a, b) => Number(b.gramEksik) - Number(a.gramEksik) || Number(b.tur === "serbest") - Number(a.tur === "serbest")
      || b.satirlar.length - a.satirlar.length || a.ad.localeCompare(b.ad, "tr"));
  }, [satirlar, stokMap]);

  const eksikGram = malzemeler.filter(x => x.gramEksik).length;
  const baglanmamis = malzemeler.filter(x => x.tur === "serbest").length;
  const liste = malzemeler.filter(x => (!sadeceEksik || x.gramEksik || x.tur === "serbest")
    && (!arama.trim() || anahtar(x.ad).includes(anahtar(arama)) || x.satirlar.some(r => anahtar(r.menu_urun).includes(anahtar(arama)))));

  const calistir = async (is: () => Promise<{ error: { message: string } | null }>, basari: string) => {
    setIsliyor(true); setMesaj(null);
    const { error } = await is();
    setIsliyor(false);
    if (error) { setMesaj(`Kaydedilemedi: ${error.message}`); return false; }
    setMesaj(basari); onDegisti(); return true;
  };

  const gramKaydet = async (x: Malzeme) => {
    if (!x.stok) return;
    const ham = (taslak[`g:${x.anahtar}`] ?? "").trim();
    const g = ham ? miktarOku(ham) : null;
    if (g !== null && (!Number.isFinite(g) || g <= 0)) { setMesaj("Geçerli bir gram yazın (ör. 15)."); return; }
    if (await calistir(async () => supabase.from("stok_urunler").update({ adet_gram: g }).eq("id", x.stok!.id),
      `${x.ad}: 1 adet = ${g ?? "—"} g → ${x.satirlar.length} reçeteye işlendi.`)) setTaslak(t => { const y = { ...t }; delete y[`g:${x.anahtar}`]; return y; });
  };

  const topluDegistir = async (x: Malzeme, eskiMiktar: number, birim: string | null) => {
    const k = `t:${x.anahtar}:${eskiMiktar}:${birim}`;
    const yeni = miktarOku(taslak[k] ?? "");
    if (!Number.isFinite(yeni) || yeni <= 0) { setMesaj("Geçerli bir miktar yazın."); return; }
    const idler = x.satirlar.filter(r => Number(r.miktar) === eskiMiktar && r.birim === birim).map(r => r.id);
    if (await calistir(async () => supabase.from("receteler").update({ miktar: yeni }).in("id", idler),
      `${x.ad}: ${sayi(eskiMiktar)} ${birim || ""} olan ${idler.length} reçete satırı ${sayi(yeni)} ${birim || ""} yapıldı.`)) setTaslak(t => { const y = { ...t }; delete y[k]; return y; });
  };

  const satirMiktar = async (r: ReceteSatiriTam) => {
    const k = `s:${r.id}`;
    const yeni = miktarOku(taslak[k] ?? "");
    if (!Number.isFinite(yeni) || yeni <= 0) { setMesaj("Geçerli bir miktar yazın."); return; }
    if (await calistir(async () => supabase.from("receteler").update({ miktar: yeni }).eq("id", r.id), `${r.menu_urun}: ${sayi(yeni)} ${r.birim || ""} kaydedildi.`))
      setTaslak(t => { const y = { ...t }; delete y[k]; return y; });
  };

  const stogaBagla = async (x: Malzeme, stokId: string) => {
    if (!stokId) return;
    const s = stokMap.get(stokId);
    await calistir(async () => supabase.from("receteler").update({ stok_urun_id: stokId, malzeme_adi: null, ara_recete: null }).in("id", x.satirlar.map(r => r.id)),
      `"${x.ad}" ${x.satirlar.length} reçetede ${s?.urun_adi || "stok ürünü"} ile bağlandı.`);
  };

  return (
    <div className="space-y-3">
      <div className={`${kutu} px-4 py-3 space-y-2`}>
        <p className="text-[15px] font-bold text-yazi">Malzemeler — bir kez girin, bütün reçetelere işlensin</p>
        <p className="text-[13px] text-gray-600">Bir malzemenin adet gramını ya da miktarını burada değiştirince o malzemeyi kullanan bütün reçeteler birlikte güncellenir.</p>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[12rem]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={arama} onChange={e => setArama(e.target.value)} placeholder="Malzeme ya da reçete ara"
              className="w-full bg-alan border border-cizgi text-yazi text-[14px] h-10 pl-9 pr-3 rounded-lg outline-none focus:border-altin" />
          </div>
          <button type="button" onClick={() => setSadeceEksik(!sadeceEksik)}
            className={`h-10 px-3 rounded-lg border text-[13px] font-semibold ${sadeceEksik ? "border-amber-500/50 text-amber-300 bg-amber-500/10" : "border-cizgi text-gray-600 hover:text-yazi"}`}>
            Sadece eksikler ({eksikGram + baglanmamis})
          </button>
        </div>
        {(eksikGram > 0 || baglanmamis > 0) && (
          <p className="text-[13px] text-amber-300 flex items-center gap-1.5"><AlertTriangle size={14} />
            {eksikGram > 0 && `${eksikGram} malzemenin adet gramı eksik`}{eksikGram > 0 && baglanmamis > 0 && " · "}{baglanmamis > 0 && `${baglanmamis} malzeme stoğa bağlı değil`} — maliyeti hesaplanamıyor.
          </p>
        )}
        {mesaj && <p className="text-[13px] text-emerald-300">{mesaj}</p>}
      </div>

      <div className={`${kutu} divide-y divide-cizgi`}>
        {liste.map(x => {
          const ac = acik === x.anahtar;
          const gruplar = new Map<string, { miktar: number; birim: string | null; adet: number }>();
          x.satirlar.forEach(r => { const k = `${Number(r.miktar)}|${r.birim}`; const g = gruplar.get(k); if (g) g.adet++; else gruplar.set(k, { miktar: Number(r.miktar), birim: r.birim, adet: 1 }); });
          return (
            <div key={x.anahtar}>
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <button type="button" onClick={() => setAcik(ac ? null : x.anahtar)} className="flex-1 min-w-[14rem] text-left">
                  <span className="text-[15px] font-semibold text-yazi">{x.ad}</span>
                  <span className="text-[13px] text-gray-500"> · {x.satirlar.length} reçete{x.tur === "ara" ? " · ara reçete" : ""}{x.stok ? ` · stok birimi ${x.stok.birim}` : ""}
                    {fiyatGorunur && x.stok?.fiyat ? ` · ${fmt2(x.stok.fiyat)} ₺/${x.stok.birim}` : ""}</span>
                </button>
                {x.adetKullaniyor && x.stok && (
                  <label className="flex items-center gap-2 text-[14px]">
                    <span className={x.gramEksik ? "text-amber-300 font-semibold" : "text-gray-600"}>1 adet =</span>
                    <input inputMode="decimal" placeholder={x.stok.adet_gram ? sayi(x.stok.adet_gram) : "?"} value={taslak[`g:${x.anahtar}`] ?? (x.stok.adet_gram ? sayi(x.stok.adet_gram) : "")}
                      onChange={e => setTaslak(t => ({ ...t, [`g:${x.anahtar}`]: e.target.value }))}
                      onKeyDown={e => e.key === "Enter" && gramKaydet(x)}
                      className={`${giris} w-20 ${x.gramEksik ? "border-amber-500/60" : ""}`} />
                    <span className="text-gray-600">g</span>
                    {taslak[`g:${x.anahtar}`] !== undefined && <button type="button" disabled={isliyor} onClick={() => gramKaydet(x)} className="h-10 px-3 rounded-lg text-[13px] font-bold text-[#1a1408] kebo-btn-altin">Hepsine işle</button>}
                  </label>
                )}
                {x.tur === "serbest" && (
                  <select defaultValue="" disabled={isliyor} onChange={e => stogaBagla(x, e.target.value)}
                    className="h-10 bg-alan border border-amber-500/50 text-yazi text-[13px] px-2 rounded-lg max-w-[16rem]">
                    <option value="">Stokta yok — stok ürününe bağla…</option>
                    {stokSirali.map(s => <option key={s.id} value={s.id}>{s.urun_adi}</option>)}
                  </select>
                )}
                <button type="button" onClick={() => setAcik(ac ? null : x.anahtar)} aria-label="Reçeteleri göster" className="text-gray-500 hover:text-yazi">{ac ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>
              </div>
              {ac && (
                <div className="px-4 pb-4 space-y-3">
                  <div className="rounded-lg border border-cizgi p-3 space-y-2">
                    <p className="text-[13px] font-bold text-gray-700">Toplu değiştir</p>
                    {[...gruplar.values()].map(g => {
                      const k = `t:${x.anahtar}:${g.miktar}:${g.birim}`;
                      return (
                        <div key={k} className="flex flex-wrap items-center gap-2 text-[14px]">
                          <span className="min-w-[9rem]">{miktarYaz(g.miktar, g.birim || x.stok?.birim || "")} <span className="text-gray-500">({g.adet} reçete)</span></span>
                          <span className="text-gray-500">→</span>
                          <input inputMode="decimal" placeholder={sayi(g.miktar)} value={taslak[k] ?? ""} onChange={e => setTaslak(t => ({ ...t, [k]: e.target.value }))}
                            onKeyDown={e => e.key === "Enter" && topluDegistir(x, g.miktar, g.birim)} className={`${giris} w-24`} />
                          <span className="text-gray-600">{g.birim || ""}</span>
                          {taslak[k] && <button type="button" disabled={isliyor} onClick={() => topluDegistir(x, g.miktar, g.birim)} className="h-10 px-3 rounded-lg text-[13px] font-bold text-[#1a1408] kebo-btn-altin">{g.adet} reçeteye işle</button>}
                        </div>
                      );
                    })}
                  </div>
                  <div className="space-y-1">
                    {x.satirlar.slice().sort((a, b) => a.menu_urun.localeCompare(b.menu_urun, "tr")).map(r => {
                      const k = `s:${r.id}`;
                      return (
                        <div key={r.id} className="flex flex-wrap items-center gap-2 text-[14px] py-1 border-b border-cizgi/50 last:border-b-0">
                          <span className="flex-1 min-w-[12rem]">{r.menu_urun}</span>
                          <input inputMode="decimal" value={taslak[k] ?? sayi(Number(r.miktar))} onChange={e => setTaslak(t => ({ ...t, [k]: e.target.value }))}
                            onKeyDown={e => e.key === "Enter" && satirMiktar(r)} className={`${giris} w-24`} />
                          <span className="w-10 text-gray-600">{r.birim || x.stok?.birim || ""}</span>
                          {taslak[k] !== undefined && <button type="button" disabled={isliyor} onClick={() => satirMiktar(r)} className="h-9 px-3 rounded-lg text-[13px] font-bold text-[#1a1408] kebo-btn-altin">Kaydet</button>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!liste.length && <p className="px-4 py-6 text-center text-[14px] text-gray-500">Malzeme bulunamadı.</p>}
      </div>
    </div>
  );
}
