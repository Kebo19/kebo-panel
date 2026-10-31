"use client";

// MAL GELDİ — toplu stok girişi (31.10.2026)
// Mal gelince tek ekranda birçok ürünün gelen miktarı yazılır, "Kaydet" ile hepsi stoğa girer
// (stok_hareketler tip "giris", kaynak "manuel"). İrsaliye fotoğrafı okutmak isteyen
// aşağıdaki İrsaliye bölümüne yönlendirilir. Fatura sonra Mikro'dan gelince "Faturadan gelen mal"
// bölümü bu elle girişi görür ve çift giriş uyarısı verir.

import { useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bugun } from "@/lib/tarih";
import { miktarOku } from "@/lib/stok";
import { Camera, Loader2, PackagePlus, Search, X } from "lucide-react";

interface Urun { id: string; urun_adi: string; birim: string; kategori: string | null; }

const kutu = "w-full bg-alan border border-cizgi-guclu text-yazi text-[15px] h-11 px-3 rounded-lg outline-none focus:border-altin";
const trKucuk = (s: string) => s.toLocaleLowerCase("tr-TR");

export default function MalGeldi({ supabase, urunler, kullanici, onKapat, onKaydedildi, onIrsaliye }: {
  supabase: SupabaseClient; urunler: Urun[]; kullanici: string;
  onKapat: () => void; onKaydedildi: () => void; onIrsaliye: () => void;
}) {
  const [tarih, setTarih] = useState(bugun());
  const [tedarikci, setTedarikci] = useState("");
  const [belge, setBelge] = useState("");
  const [ara, setAra] = useState("");
  const [miktar, setMiktar] = useState<Record<string, string>>({});
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const girilen = useMemo(() => Object.entries(miktar).filter(([, v]) => v.trim() && miktarOku(v) > 0), [miktar]);
  const liste = useMemo(() => {
    const q = trKucuk(ara.trim());
    const s = [...urunler].sort((a, b) => a.urun_adi.localeCompare(b.urun_adi, "tr"));
    // Miktar girilenler hep üstte kalsın (arama değişse de kaybolmasın)
    const dolu = s.filter(u => miktar[u.id]?.trim());
    const diger = s.filter(u => !miktar[u.id]?.trim() && (!q || trKucuk(u.urun_adi).includes(q) || trKucuk(u.kategori || "").includes(q)));
    return [...dolu, ...diger];
  }, [urunler, ara, miktar]);

  const kaydet = async () => {
    setHata(null);
    const hatali = Object.entries(miktar).filter(([, v]) => v.trim() && !(miktarOku(v) > 0));
    if (hatali.length) { setHata("Miktarı sayı olmayan satır var."); return; }
    if (!girilen.length) { setHata("Hiç miktar yazılmadı."); return; }
    const not = ["Mal geldi", tedarikci.trim(), belge.trim() && `belge ${belge.trim()}`].filter(Boolean).join(" · ");
    setKaydediliyor(true);
    const { error } = await supabase.from("stok_hareketler").insert(girilen.map(([id, v]) => ({
      urun_id: id, tarih, tip: "giris", miktar: miktarOku(v), kaynak: "manuel", kullanici: kullanici || "panel", aciklama: not,
    })));
    setKaydediliyor(false);
    if (error) { setHata(error.message); return; }
    onKaydedildi();
    onKapat();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start sm:items-center justify-center p-2 sm:p-6" onClick={onKapat}>
      <div className="w-full max-w-3xl max-h-[95vh] flex flex-col rounded-2xl border border-cizgi bg-zemin" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-cizgi">
          <h2 className="text-[18px] font-black text-yazi flex items-center gap-2"><PackagePlus size={18} /> Mal geldi</h2>
          <button onClick={onKapat} className="p-2 text-gray-500 hover:text-yazi"><X size={18} /></button>
        </div>

        <div className="px-4 py-3 space-y-3 border-b border-cizgi">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="space-y-1"><span className="block text-[13px] text-gray-600">Tarih</span>
              <input type="date" value={tarih} max={bugun()} onChange={e => e.target.value && setTarih(e.target.value)} className={kutu} style={{ colorScheme: "dark" }} /></label>
            <label className="space-y-1"><span className="block text-[13px] text-gray-600">Firma (isteğe bağlı)</span>
              <input value={tedarikci} onChange={e => setTedarikci(e.target.value)} placeholder="ör. Kebo, İbocan" className={kutu} /></label>
            <label className="space-y-1"><span className="block text-[13px] text-gray-600">İrsaliye / fiş no (isteğe bağlı)</span>
              <input value={belge} onChange={e => setBelge(e.target.value)} className={kutu} /></label>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input value={ara} onChange={e => setAra(e.target.value)} placeholder="Ürün ara" className={`${kutu} pl-9`} />
            </div>
            <button type="button" onClick={onIrsaliye} title="İrsaliyenin fotoğrafını ya da PDF'ini okut"
              className="flex items-center gap-1.5 text-[14px] font-bold text-yazi border border-cizgi-guclu px-3 rounded-lg hover:border-altin whitespace-nowrap">
              <Camera size={16} /> İrsaliye fotoğrafı
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2">
          {liste.map(u => {
            const dolu = !!miktar[u.id]?.trim();
            return (
              <div key={u.id} className={`flex items-center gap-3 py-2 border-b border-cizgi last:border-b-0 ${dolu ? "bg-emerald-500/5" : ""}`}>
                <span className={`flex-1 min-w-0 text-[15px] truncate ${dolu ? "font-bold text-yazi" : "text-gray-800"}`}>{u.urun_adi}</span>
                <input inputMode="decimal" placeholder="0" value={miktar[u.id] || ""}
                  onChange={e => setMiktar(m => ({ ...m, [u.id]: e.target.value }))}
                  className="w-24 bg-alan border border-cizgi-guclu text-yazi text-[16px] font-bold h-11 px-2 rounded-lg text-right outline-none focus:border-altin" />
                <span className="w-12 text-[14px] text-gray-600">{u.birim}</span>
              </div>
            );
          })}
          {!liste.length && <p className="text-[14px] text-gray-500 py-6 text-center">Ürün bulunamadı.</p>}
        </div>

        <div className="px-4 py-3 border-t border-cizgi space-y-2">
          {hata && <p className="text-[14px] text-red-400">{hata}</p>}
          <div className="flex items-center gap-3">
            <span className="flex-1 text-[14px] text-gray-600">{girilen.length ? `${girilen.length} ürün girilecek` : "Gelen ürünlerin miktarını yazın"}</span>
            <button onClick={onKapat} className="h-12 px-4 rounded-xl border border-cizgi text-[15px] text-gray-600 hover:text-yazi">Vazgeç</button>
            <button onClick={kaydet} disabled={kaydediliyor || !girilen.length}
              className="h-12 px-6 rounded-xl text-[15px] font-black text-[#1a1408] kebo-btn-altin disabled:opacity-40 flex items-center gap-2">
              {kaydediliyor && <Loader2 size={16} className="animate-spin" />} Stoğa ekle
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
