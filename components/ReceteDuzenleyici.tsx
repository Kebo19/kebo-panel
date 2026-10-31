"use client";

// REÇETE DÜZENLEYİCİ — Reçete & Maliyet sayfasının "Reçeteler" sekmesi.
// Satırlar kendi biriminde (90 g, 1 adet) girilir; stok ürününe, ara reçeteye ya da
// stokta olmayan bir malzemeye (sadece ad) bağlanır. Hesap: lib/receteHesap.ts

import { useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  anahtar, receteHesapla, miktarSuphesi, miktarYaz, DURUM_METNI, RECETE_BIRIMLERI,
  type ReceteBaglami, type ReceteBirim, type ReceteSatiriTam, type ReceteUrunu, type StokBilgi,
} from "@/lib/receteHesap";
import { miktarOku } from "@/lib/stok";
import { fmt2 } from "@/lib/para";
import { AlertTriangle, Copy, Loader2, Plus, Search, Trash2, Info } from "lucide-react";

export interface MenuOzeti { ad: string; adet: number; satisFiyati: number | null; }

interface Props {
  supabase: SupabaseClient;
  baglam: ReceteBaglami;
  stok: StokBilgi[];
  urunler: ReceteUrunu[];
  satirlar: ReceteSatiriTam[];
  /** Satışı olan menü ürünleri (90 gün), ortalama satış fiyatıyla */
  satislar: Map<string, MenuOzeti>;
  fiyatGorunur: boolean;
  onDegisti: () => void;
}

const inputCls = "w-full bg-alan border border-cizgi text-yazi text-sm h-10 px-3 rounded-xl outline-none focus:border-altin";
const kutu = "bg-kart border border-cizgi rounded-xl";
const sayi = (v: number, d = 2) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: d }).format(v || 0);
const GRUP_SIRASI = ["Kebo dürüm", "Kebo çıtır", "Chick'N menü", "Ara reçete"];

type Kaynak = { tur: "stok"; id: string } | { tur: "ara"; ad: string } | { tur: "serbest" };
const kaynakDegeri = (r: Pick<ReceteSatiriTam, "stok_urun_id" | "ara_recete">) =>
  r.stok_urun_id ? `stok:${r.stok_urun_id}` : r.ara_recete ? `ara:${r.ara_recete}` : "serbest";
const kaynakOku = (v: string): Kaynak =>
  v.startsWith("stok:") ? { tur: "stok", id: v.slice(5) } : v.startsWith("ara:") ? { tur: "ara", ad: v.slice(4) } : { tur: "serbest" };

export default function ReceteDuzenleyici({ supabase, baglam, stok, urunler, satirlar, satislar, fiyatGorunur, onDegisti }: Props) {
  const [arama, setArama] = useState("");
  const [secili, setSecili] = useState<string | null>(null);
  const [islem, setIslem] = useState(false);
  const [taslak, setTaslak] = useState<Record<string, string>>({});

  const stokMap = useMemo(() => new Map(stok.map(s => [s.id, s])), [stok]);
  const araReceteler = useMemo(() => urunler.filter(u => u.tur === "ara").sort((a, b) => a.ad.localeCompare(b.ad, "tr")), [urunler]);
  const aktifStok = useMemo(() => [...stok].sort((a, b) => a.urun_adi.localeCompare(b.urun_adi, "tr")), [stok]);

  // Liste: reçete ürünleri + reçetesi olan/satılan diğer adlar
  const liste = useMemo(() => {
    const m = new Map<string, { ad: string; grup: string; tur: "menu" | "ara"; sira: number }>();
    urunler.forEach(u => m.set(anahtar(u.ad), { ad: u.ad, grup: u.grup || (u.tur === "ara" ? "Ara reçete" : "Diğer"), tur: u.tur, sira: u.sira }));
    satirlar.forEach(r => { const k = anahtar(r.menu_urun); if (!m.has(k)) m.set(k, { ad: r.menu_urun, grup: "Diğer", tur: "menu", sira: 99999 }); });
    satislar.forEach((s, k) => { if (!m.has(k)) m.set(k, { ad: s.ad, grup: "Satılan, reçetesi yok", tur: "menu", sira: 99999 }); });
    return Array.from(m.entries()).map(([k, o]) => {
      const h = receteHesapla(o.ad, baglam);
      const sat = satislar.get(k);
      const u = baglam.urunler.get(k);
      const fiyat = u?.satis_fiyati ?? sat?.satisFiyati ?? null;
      return { anahtar: k, ...o, hesap: h, satirSayisi: baglam.satirlar.get(k)?.length || 0, adet: sat?.adet || 0, fiyat };
    });
  }, [urunler, satirlar, satislar, baglam]);

  const gruplar = useMemo(() => {
    const q = anahtar(arama);
    const g = new Map<string, typeof liste>();
    liste.filter(x => !q || x.anahtar.includes(q)).forEach(x => { if (!g.has(x.grup)) g.set(x.grup, []); g.get(x.grup)!.push(x); });
    g.forEach(l => l.sort((a, b) => a.sira - b.sira || a.ad.localeCompare(b.ad, "tr")));
    const sira = (s: string) => { const i = GRUP_SIRASI.indexOf(s); return i < 0 ? 50 + (s === "Satılan, reçetesi yok" ? 1 : 0) : i; };
    return Array.from(g.entries()).sort((a, b) => sira(a[0]) - sira(b[0]));
  }, [liste, arama]);

  const sec = liste.find(x => x.anahtar === secili) || null;
  const secUrun = sec ? baglam.urunler.get(sec.anahtar) : undefined;
  const secSatirlar = sec ? baglam.satirlar.get(sec.anahtar) || [] : [];

  const hata = (e: { message: string } | null, ne: string) => { if (e) { alert(`${ne}: ${e.message}`); return true; } return false; };

  // ─── ÜRÜN İŞLEMLERİ ──────────────────────────────────────────────────────
  const urunKaydet = async (ad: string, alan: Partial<ReceteUrunu>) => {
    setIslem(true);
    const { error } = await supabase.from("recete_urunleri").upsert({ ad, ...alan, updated_at: new Date().toISOString() }, { onConflict: "ad" });
    setIslem(false);
    if (!hata(error, "Kaydedilemedi")) onDegisti();
  };

  const yeniRecete = async (tur: "menu" | "ara") => {
    const ad = prompt(tur === "menu"
      ? "Menü ürününün adı (MagicPay'deki adıyla aynı yazın, ör. KEBO (120 Gr)):"
      : "Ara reçetenin adı (ör. Yeşil Salata):")?.replace(/\s+/g, " ").trim();
    if (!ad) return;
    if (liste.some(x => x.anahtar === anahtar(ad) && baglam.urunler.has(x.anahtar))) { setSecili(anahtar(ad)); return; }
    await urunKaydet(ad, tur === "ara"
      ? { tur: "ara", verim_miktar: 1, verim_birim: "kg", grup: "Ara reçete" }
      : { tur: "menu", verim_miktar: 1, verim_birim: "adet", grup: sec?.grup && GRUP_SIRASI.includes(sec.grup) && sec.grup !== "Ara reçete" ? sec.grup : "Diğer" });
    setSecili(anahtar(ad));
  };

  const kopyala = async () => {
    if (!sec) return;
    const ad = prompt(`"${sec.ad}" reçetesi hangi adla kopyalansın? (ör. KEBO (120 Gr))`, sec.ad)?.replace(/\s+/g, " ").trim();
    if (!ad || anahtar(ad) === sec.anahtar) return;
    if (baglam.urunler.has(anahtar(ad)) || baglam.satirlar.has(anahtar(ad))) { alert("Bu adla bir reçete zaten var."); return; }
    setIslem(true);
    const u = secUrun;
    const { error: e1 } = await supabase.from("recete_urunleri").insert({
      ad, tur: u?.tur || "menu", verim_miktar: u?.verim_miktar || 1, verim_birim: u?.verim_birim || "adet",
      grup: u?.grup || sec.grup, notlar: `${sec.ad} reçetesinden kopyalandı`, sira: (u?.sira || 0) + 1,
    });
    if (hata(e1, "Kopyalanamadı")) { setIslem(false); return; }
    if (secSatirlar.length) {
      const { error: e2 } = await supabase.from("receteler").insert(secSatirlar.map(r => ({
        menu_urun: ad, stok_urun_id: r.stok_urun_id, ara_recete: r.ara_recete, malzeme_adi: r.malzeme_adi,
        miktar: r.miktar, birim: r.birim, etiket: r.etiket, notlar: r.notlar, sira: r.sira,
      })));
      if (hata(e2, "Satırlar kopyalanamadı")) { setIslem(false); return; }
    }
    setIslem(false);
    setSecili(anahtar(ad));
    onDegisti();
  };

  const receteSil = async () => {
    if (!sec) return;
    const kullanan = satirlar.filter(r => r.ara_recete && anahtar(r.ara_recete) === sec.anahtar).map(r => r.menu_urun);
    if (kullanan.length) { alert(`Bu ara reçete şu reçetelerde kullanılıyor, önce oradan çıkarın:\n${[...new Set(kullanan)].join("\n")}`); return; }
    if (!confirm(`"${sec.ad}" reçetesi ve ${secSatirlar.length} satırı silinsin mi?`)) return;
    setIslem(true);
    const { error: e1 } = await supabase.from("receteler").delete().eq("menu_urun", sec.ad);
    const { error: e2 } = await supabase.from("recete_urunleri").delete().eq("ad", sec.ad);
    setIslem(false);
    if (hata(e1 || e2, "Silinemedi")) return;
    setSecili(null);
    onDegisti();
  };

  // ─── SATIR İŞLEMLERİ ─────────────────────────────────────────────────────
  const satirGuncelle = async (r: ReceteSatiriTam, alan: Partial<ReceteSatiriTam>) => {
    const { error } = await supabase.from("receteler").update(alan).eq("id", r.id);
    if (!hata(error, "Kaydedilemedi")) onDegisti();
  };

  const miktarKaydet = async (r: ReceteSatiriTam) => {
    const ham = taslak[r.id];
    if (ham === undefined) return;
    const temizle = () => setTaslak(x => { const y = { ...x }; delete y[r.id]; return y; });
    const m = miktarOku(ham);
    if (!Number.isFinite(m) || m <= 0) { alert("Geçerli bir miktar girin (ör. 90 ya da 0,5)."); return; }
    if (m === Number(r.miktar)) { temizle(); return; }
    const s = miktarSuphesi(m, r.birim);
    if (s && !confirm(`${s}\nYine de kaydedilsin mi?`)) return;
    await satirGuncelle(r, { miktar: m });
    temizle();
  };

  const kaynakDegistir = async (r: ReceteSatiriTam, v: string) => {
    const k = kaynakOku(v);
    const ad = r.etiket || r.malzeme_adi || r.ara_recete || stokMap.get(r.stok_urun_id || "")?.urun_adi || "Malzeme";
    if (k.tur === "stok") await satirGuncelle(r, { stok_urun_id: k.id, ara_recete: null, malzeme_adi: null, etiket: ad });
    else if (k.tur === "ara") {
      if (anahtar(k.ad) === sec?.anahtar) { alert("Reçete kendini içeremez."); return; }
      await satirGuncelle(r, { stok_urun_id: null, ara_recete: k.ad, malzeme_adi: null, etiket: ad });
    } else await satirGuncelle(r, { stok_urun_id: null, ara_recete: null, malzeme_adi: ad, etiket: ad });
  };

  const satirSil = async (r: ReceteSatiriTam) => {
    if (!confirm(`"${r.etiket || r.malzeme_adi || "Satır"}" reçeteden çıkarılsın mı?`)) return;
    const { error } = await supabase.from("receteler").delete().eq("id", r.id);
    if (!hata(error, "Silinemedi")) onDegisti();
  };

  const adetGramKaydet = async (s: StokBilgi) => {
    const ham = prompt(`${s.urun_adi}: 1 adedi kaç gram?`, s.adet_gram ? String(s.adet_gram).replace(".", ",") : "");
    if (ham === null) return;
    const g = ham.trim() === "" ? null : miktarOku(ham);
    if (g !== null && (!Number.isFinite(g) || g <= 0)) { alert("Geçerli bir gram yazın (ör. 15)."); return; }
    const { error } = await supabase.from("stok_urunler").update({ adet_gram: g }).eq("id", s.id);
    if (!hata(error, "Kaydedilemedi")) onDegisti();
  };

  // Yeni satır
  const [yeniEtiket, setYeniEtiket] = useState("");
  const [yeniKaynak, setYeniKaynak] = useState("serbest");
  const [yeniMiktar, setYeniMiktar] = useState("");
  const [yeniBirim, setYeniBirim] = useState<ReceteBirim>("g");
  const satirEkle = async () => {
    if (!sec) return;
    const k = kaynakOku(yeniKaynak);
    const etiket = yeniEtiket.trim() || (k.tur === "stok" ? stokMap.get(k.id)?.urun_adi : k.tur === "ara" ? k.ad : "") || "";
    if (!etiket) { alert("Malzemenin adını yazın ya da listeden seçin."); return; }
    const m = miktarOku(yeniMiktar);
    if (!Number.isFinite(m) || m <= 0) { alert("Geçerli bir miktar girin (ör. 90)."); return; }
    const s = miktarSuphesi(m, yeniBirim);
    if (s && !confirm(`${s}\nYine de eklensin mi?`)) return;
    if (k.tur === "ara" && anahtar(k.ad) === sec.anahtar) { alert("Reçete kendini içeremez."); return; }
    setIslem(true);
    if (!baglam.urunler.has(sec.anahtar)) {
      await supabase.from("recete_urunleri").upsert({ ad: sec.ad, tur: "menu", grup: sec.grup === "Satılan, reçetesi yok" ? "Diğer" : sec.grup }, { onConflict: "ad" });
    }
    const { error } = await supabase.from("receteler").insert({
      menu_urun: sec.ad, etiket,
      stok_urun_id: k.tur === "stok" ? k.id : null, ara_recete: k.tur === "ara" ? k.ad : null, malzeme_adi: k.tur === "serbest" ? etiket : null,
      miktar: m, birim: yeniBirim, sira: Math.max(0, ...secSatirlar.map(r => r.sira)) + 1,
    });
    setIslem(false);
    if (hata(error, "Eklenemedi")) return;
    setYeniEtiket(""); setYeniMiktar(""); setYeniKaynak("serbest");
    onDegisti();
  };

  const kaynakSecici = (deger: string, onChange: (v: string) => void, haric?: string) => (
    <select value={deger} onChange={e => onChange(e.target.value)} className={`${inputCls} h-9 text-xs`}>
      <option value="serbest">Stokta yok (sadece ad, maliyetsiz)</option>
      <optgroup label="Ara reçeteler">
        {araReceteler.filter(a => anahtar(a.ad) !== haric).map(a => <option key={a.ad} value={`ara:${a.ad}`}>{a.ad} (ara reçete)</option>)}
      </optgroup>
      <optgroup label="Stok ürünleri">
        {aktifStok.map(s => <option key={s.id} value={`stok:${s.id}`}>{s.urun_adi} ({s.birim})</option>)}
      </optgroup>
    </select>
  );

  const toplamEksik = liste.filter(x => x.satirSayisi > 0 && x.hesap.eksikler.length).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
      {/* ─── SOL: LİSTE ─── */}
      <div className={`${kutu} p-3 space-y-3 lg:max-h-[calc(100vh-140px)] lg:overflow-auto`}>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={arama} onChange={e => setArama(e.target.value)} placeholder="Reçete ara" className={`${inputCls} pl-9`} />
        </div>
        <div className="flex gap-2">
          <button onClick={() => yeniRecete("menu")} disabled={islem} className="flex-1 flex items-center justify-center gap-1 text-xs font-bold text-emerald-300 border border-emerald-500/30 bg-emerald-500/10 h-9 rounded-xl">
            <Plus size={14} /> Yeni reçete
          </button>
          <button onClick={() => yeniRecete("ara")} disabled={islem} className="flex-1 flex items-center justify-center gap-1 text-xs font-bold text-sky-300 border border-sky-500/30 bg-sky-500/10 h-9 rounded-xl">
            <Plus size={14} /> Ara reçete
          </button>
        </div>
        {toplamEksik > 0 && <p className="text-xs text-amber-300">{toplamEksik} reçetede maliyeti tam hesaplanamayan kalem var (sarı işaret).</p>}
        {gruplar.map(([grup, l]) => (
          <div key={grup} className="space-y-1">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide px-1 pt-1">{grup} · {l.length}</div>
            {l.map(m => (
              <button key={m.anahtar} onClick={() => { setSecili(m.anahtar); setTaslak({}); }}
                className={`w-full text-left px-3 py-2 rounded-xl border text-sm flex items-center justify-between gap-2 ${secili === m.anahtar ? "border-emerald-500 bg-emerald-500/10" : "border-transparent hover:bg-alan"}`}>
                <span className="min-w-0">
                  <span className="block font-semibold truncate text-yazi">{m.ad}</span>
                  <span className="block text-xs text-gray-500">
                    {m.satirSayisi ? <>₺{fmt2(m.hesap.maliyet)}{m.fiyat ? <> · %{sayi(m.hesap.maliyet / m.fiyat * 100, 1)}</> : null}</> : "reçete yok"}
                    {m.adet > 0 && <> · {sayi(m.adet, 0)} satış</>}
                  </span>
                </span>
                {m.satirSayisi > 0 && m.hesap.eksikler.length > 0 && <AlertTriangle size={14} className="text-amber-400 shrink-0" />}
                {!m.satirSayisi && m.adet > 0 && <span className="text-xs font-bold text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-full whitespace-nowrap">reçete yok</span>}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* ─── SAĞ: SEÇİLİ REÇETE ─── */}
      <div className={`${kutu} p-4`}>
        {!sec ? (
          <div className="text-sm text-gray-500 py-10 text-center space-y-2">
            <p>Soldan bir reçete seçin.</p>
            <p className="text-xs">Miktarlar kendi biriminde yazılır: döner <b>90 g</b>, ekmek <b>1 adet</b>. Panel stok birimine (kg, adet) kendisi çevirir.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="space-y-1 min-w-0">
                <h2 className="text-lg font-black text-yazi">{sec.ad}</h2>
                <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500">
                  <span className={`px-2 py-0.5 rounded-full font-bold ${sec.tur === "ara" ? "bg-sky-500/15 text-sky-300" : "bg-emerald-500/15 text-emerald-300"}`}>{sec.tur === "ara" ? "Ara reçete" : "Menü ürünü"}</span>
                  {secUrun?.tur === "ara" && (
                    <span className="flex items-center gap-1">Bu reçete
                      <input defaultValue={String(secUrun.verim_miktar).replace(".", ",")} key={`v${secUrun.ad}${secUrun.verim_miktar}`}
                        onBlur={e => { const v = miktarOku(e.target.value); if (Number.isFinite(v) && v > 0 && v !== secUrun.verim_miktar) urunKaydet(secUrun.ad, { verim_miktar: v }); }}
                        className="w-14 bg-alan border border-cizgi rounded-lg h-7 px-2 text-right text-yazi" />
                      <select value={secUrun.verim_birim} onChange={e => urunKaydet(secUrun.ad, { verim_birim: e.target.value as ReceteUrunu["verim_birim"] })}
                        className="bg-alan border border-cizgi rounded-lg h-7 px-1 text-yazi">
                        <option value="kg">kg</option><option value="lt">lt</option><option value="adet">adet</option>
                      </select> için</span>
                  )}
                  {secUrun?.grup && <span>· {secUrun.grup}</span>}
                </div>
                {secUrun?.notlar && <p className="text-xs text-gray-500 flex items-start gap-1"><Info size={13} className="mt-0.5 shrink-0" />{secUrun.notlar}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={kopyala} disabled={islem} className="flex items-center gap-1 text-xs font-bold text-gray-700 border border-cizgi px-3 h-9 rounded-xl hover:text-yazi"><Copy size={14} /> Kopyala</button>
                {(secUrun || secSatirlar.length > 0) && <button onClick={receteSil} disabled={islem} className="flex items-center gap-1 text-xs font-bold text-red-300 border border-red-500/30 px-3 h-9 rounded-xl"><Trash2 size={14} /> Sil</button>}
              </div>
            </div>

            {sec.tur === "menu" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="bg-alan border border-cizgi rounded-xl px-3 py-2">
                  <div className="text-xs text-gray-500">Porsiyon maliyeti</div>
                  <div className="text-lg font-black text-yazi">{fiyatGorunur ? `₺${fmt2(sec.hesap.maliyet)}` : "—"}</div>
                </div>
                <div className="bg-alan border border-cizgi rounded-xl px-3 py-2">
                  <div className="text-xs text-gray-500">Satış fiyatı {secUrun?.satis_fiyati == null && satislar.get(sec.anahtar)?.satisFiyati ? "(90 gün ort.)" : ""}</div>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500">₺</span>
                    <input key={`f${sec.anahtar}${secUrun?.satis_fiyati ?? ""}`}
                      defaultValue={secUrun?.satis_fiyati != null ? String(secUrun.satis_fiyati).replace(".", ",") : satislar.get(sec.anahtar)?.satisFiyati ? fmt2(satislar.get(sec.anahtar)!.satisFiyati!) : ""}
                      placeholder="elle yazın"
                      onBlur={e => {
                        const t = e.target.value.trim();
                        const v = t === "" ? null : miktarOku(t);
                        if (v !== null && (!Number.isFinite(v) || v < 0)) return;
                        if (v === (secUrun?.satis_fiyati ?? null)) return;
                        if (v !== null && secUrun?.satis_fiyati == null && satislar.get(sec.anahtar)?.satisFiyati && fmt2(satislar.get(sec.anahtar)!.satisFiyati!) === t) return;
                        urunKaydet(sec.ad, { satis_fiyati: v, ...(secUrun ? {} : { tur: "menu", grup: "Diğer" }) });
                      }}
                      className="w-full bg-transparent text-lg font-black text-yazi outline-none" />
                  </div>
                </div>
                <div className="bg-alan border border-cizgi rounded-xl px-3 py-2">
                  <div className="text-xs text-gray-500">Maliyet oranı</div>
                  <div className="text-lg font-black text-yazi">{fiyatGorunur && sec.fiyat ? `%${sayi(sec.hesap.maliyet / sec.fiyat * 100, 1)}` : "—"}</div>
                </div>
              </div>
            )}
            {sec.tur === "ara" && fiyatGorunur && (
              <div className="text-sm text-gray-700">Maliyet: <b className="text-yazi">₺{fmt2(sec.hesap.maliyet)}</b> / {secUrun?.verim_miktar} {secUrun?.verim_birim}</div>
            )}
            {!fiyatGorunur && <div className="text-xs text-gray-500">Fiyat ve maliyetleri görmek için “Stok değeri” yetkisi gerekir.</div>}

            {sec.hesap.eksikler.length > 0 && (
              <div className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2 space-y-1">
                <div className="font-bold flex items-center gap-1.5"><AlertTriangle size={13} /> Maliyete tam girmeyen kalemler</div>
                {sec.hesap.eksikler.map((e, i) => <div key={i}>• {e.ad}: {DURUM_METNI[e.neden]}</div>)}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-cizgi">
                    <th className="py-2 pr-2">Malzeme</th>
                    <th className="py-2 px-2 w-40">Miktar</th>
                    <th className="py-2 px-2 min-w-[220px]">Bağlı olduğu</th>
                    <th className="py-2 px-2 text-right">Tutar</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {secSatirlar.map(r => {
                    const h = sec.hesap.satirlar.get(r.id);
                    const u = r.stok_urun_id ? stokMap.get(r.stok_urun_id) : undefined;
                    const supheli = miktarSuphesi(Number(r.miktar), r.birim);
                    return (
                      <tr key={r.id} className="border-b border-cizgi align-top">
                        <td className="py-2 pr-2">
                          <input key={`e${r.id}${r.etiket}`} defaultValue={r.etiket || r.malzeme_adi || ""}
                            onBlur={e => { const t = e.target.value.trim(); if (t && t !== (r.etiket || "")) satirGuncelle(r, r.malzeme_adi ? { etiket: t, malzeme_adi: t } : { etiket: t }); }}
                            className="w-full bg-transparent font-semibold text-yazi outline-none border-b border-transparent focus:border-cizgi" />
                          {h && h.durum !== "tamam" && (
                            <div className="text-xs text-amber-300 mt-0.5">
                              {DURUM_METNI[h.durum]}
                              {h.durum === "cevrilemez" && u && <button onClick={() => adetGramKaydet(u)} className="ml-1 underline font-bold">gramı yaz</button>}
                            </div>
                          )}
                          {supheli && <div className="text-xs text-red-300 mt-0.5">{supheli}</div>}
                          {r.notlar && <div className="text-xs text-gray-500 mt-0.5">{r.notlar}</div>}
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-1">
                            <input value={taslak[r.id] ?? String(r.miktar).replace(".", ",")} inputMode="decimal"
                              onChange={e => setTaslak(x => ({ ...x, [r.id]: e.target.value }))}
                              onBlur={() => miktarKaydet(r)} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                              className={`${inputCls} h-9 w-20 text-right`} />
                            <select value={r.birim ?? ""} onChange={e => satirGuncelle(r, { birim: (e.target.value || null) as ReceteBirim | null })}
                              className="bg-alan border border-cizgi rounded-xl h-9 px-1 text-sm text-yazi">
                              {r.birim === null && <option value="">{u?.birim || "?"}</option>}
                              {RECETE_BIRIMLERI.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                          </div>
                        </td>
                        <td className="py-2 px-2">
                          {kaynakSecici(kaynakDegeri(r), v => kaynakDegistir(r, v), sec.anahtar)}
                          {u && h?.stokMiktar != null && (
                            <div className="text-xs text-gray-500 mt-0.5">
                              = {miktarYaz(h.stokMiktar, u.birim)}{fiyatGorunur && u.fiyat ? ` · ₺${fmt2(u.fiyat)}/${u.birim}` : ""}
                              {u.adet_gram && r.birim === "adet" && birimFarkli(u.birim) ? <> · 1 adet = {sayi(u.adet_gram)} g <button onClick={() => adetGramKaydet(u)} className="underline">değiştir</button></> : null}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right font-semibold text-yazi whitespace-nowrap">
                          {fiyatGorunur && h && h.maliyet > 0 ? `₺${fmt2(h.maliyet)}` : "—"}
                        </td>
                        <td className="py-2 text-right">
                          <button onClick={() => satirSil(r)} className="p-1.5 text-gray-500 hover:text-red-400"><Trash2 size={14} /></button>
                        </td>
                      </tr>
                    );
                  })}
                  {!secSatirlar.length && (
                    <tr><td colSpan={5} className="py-4 text-center text-gray-500">Bu reçetenin satırı yok. Aşağıdan malzeme ekleyin.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-alan border border-cizgi rounded-xl p-3 space-y-2">
              <div className="text-sm font-bold text-yazi">Malzeme ekle</div>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_100px_90px_auto] gap-2 items-end">
                <label className="text-xs font-semibold text-gray-600 space-y-1"><span className="block">Adı</span>
                  <input value={yeniEtiket} onChange={e => setYeniEtiket(e.target.value)} placeholder="ör. Döner" className={`${inputCls} bg-kart`} /></label>
                <label className="text-xs font-semibold text-gray-600 space-y-1"><span className="block">Bağlı olduğu</span>
                  {kaynakSecici(yeniKaynak, v => {
                    setYeniKaynak(v);
                    const k = kaynakOku(v);
                    if (k.tur === "ara") setYeniBirim(baglam.urunler.get(anahtar(k.ad))?.verim_birim === "adet" ? "adet" : "g");
                    if (k.tur === "stok") { const b = stokMap.get(k.id)?.birim; setYeniBirim(b === "adet" ? "adet" : b === "lt" ? "ml" : "g"); }
                  }, sec.anahtar)}</label>
                <label className="text-xs font-semibold text-gray-600 space-y-1"><span className="block">Miktar</span>
                  <input value={yeniMiktar} onChange={e => setYeniMiktar(e.target.value)} inputMode="decimal" placeholder="90"
                    onKeyDown={e => { if (e.key === "Enter") satirEkle(); }} className={`${inputCls} bg-kart text-right`} /></label>
                <label className="text-xs font-semibold text-gray-600 space-y-1"><span className="block">Birim</span>
                  <select value={yeniBirim} onChange={e => setYeniBirim(e.target.value as ReceteBirim)} className={`${inputCls} bg-kart`}>
                    {RECETE_BIRIMLERI.map(b => <option key={b} value={b}>{b}</option>)}
                  </select></label>
                <button onClick={satirEkle} disabled={islem || !yeniMiktar}
                  className="flex items-center justify-center gap-1.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-4 h-10 rounded-xl">
                  {islem ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Ekle
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const birimFarkli = (stokBirimi: string) => stokBirimi.toLocaleLowerCase("tr-TR") !== "adet";
