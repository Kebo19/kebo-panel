"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { bugun, gunEkle } from "@/lib/tarih";
import { useYetki } from "@/lib/useYetki";
import { fmtTarih } from "@/lib/tarih";
import {
  stokDurumu, siparisPlani, sayimGecikti, kullanimAnalizi, cikisOzeti, miktarOku, varsayilanVakit,
  CIKIS_NEDENLERI, GUN_ADLARI, VARSAYILAN_SIPARIS,
  type StokDurumu, type CikisNedeni, type SiparisAyari, type SiparisPlani, type TahminYontemi, type SayimVakti,
} from "@/lib/stok";
import VakitSecici from "@/components/VakitSecici";
import IrsaliyePaneli, { type IrsaliyeKalemi } from "@/components/IrsaliyePaneli";

// Ekran tercihleri bu tarayıcıda hatırlanır (tarayıcı izin vermezse varsayılanlar kullanılır).
function tercihOku<T>(anahtar: string, varsayilan: T): T {
  try { const v = localStorage.getItem(anahtar); return v ? JSON.parse(v) as T : varsayilan; } catch { return varsayilan; }
}
function tercihYaz(anahtar: string, deger: unknown) {
  try { localStorage.setItem(anahtar, JSON.stringify(deger)); } catch { /* yok say */ }
}
import Link from "next/link";
import {
  Package, PlusCircle, Search, AlertTriangle, TrendingDown,
  Truck, ClipboardCheck, Loader2, X, Save, Edit3, Trash2,
  RefreshCw, Layers, Box, Clock, BrainCircuit, CheckSquare, Square,
  ListOrdered, Calendar, ArrowUp, ArrowDown, PackageMinus, ShoppingCart
} from "lucide-react";

interface Urun {
  id: string;
  urun_adi: string;
  kategori: string | null;
  birim: string;
  min_stok: number;
  mevcut_stok: number;
  son_fiyat: number | null;
  durum: string;
  notlar: string | null;
  sayim_periyodu: string;
  sira_no?: number;
  updated_at: string;
}

interface Hareket {
  id: string;
  urun_id: string;
  tarih: string;
  tip: "sayim" | "giris" | "cikis" | "duzeltme";
  miktar: number;
  neden?: string | null;
  birim_fiyat?: number | null;
  kaynak: string | null;
  aciklama: string | null;
  kullanici: string | null;
  created_at: string;
}

// Hesap mantığı lib/stok.ts'de: kullanım iki sayım arasında hesaplanır, sayılmayan
// günlere eşit bölünür; sipariş için son 7 günün ortalama günlük kullanımı esas alınır.

const fmt = (v: number, decimals = 1): string =>
  new Intl.NumberFormat("tr-TR", { maximumFractionDigits: decimals, minimumFractionDigits: 0 }).format(v);

const PERIYOTLAR = [
  { v: "gunluk", l: "Günlük Sayım" },
  { v: "haftalik", l: "Haftalık Sayım" },
  { v: "aylik", l: "Aylık Sayım" }
];
const BIRIMLER = ["kg", "gr", "lt", "ml", "adet", "koli", "paket", "düzine", "torba", "kova", "şişe"];

export default function StokPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const yetki = useYetki();
  const userEmail = yetki.email;
  const isAdmin = yetki.tamYetkili;
  const [urunler, setUrunler] = useState<Urun[]>([]);
  const [hareketler, setHareketler] = useState<Hareket[]>([]);
  const [bekleyenIrsaliye, setBekleyenIrsaliye] = useState<IrsaliyeKalemi[]>([]);

  const [arama, setArama] = useState("");
  const [filtreKategori, setFiltreKategori] = useState("");
  const [filtrePeriyot, setFiltrePeriyot] = useState("");
  const [sadeceKritik, setSadeceKritik] = useState(false);

  // Modaller
  const [yeniUrunAcik, setYeniUrunAcik] = useState(false);
  const [duzenleUrun, setDuzenleUrun] = useState<Urun | null>(null);
  const [sayimUrun, setSayimUrun] = useState<Urun | null>(null);
  const [malGirisUrun, setMalGirisUrun] = useState<Urun | null>(null);
  const [cikisUrun, setCikisUrun] = useState<Urun | null>(null);
  const [cikisMiktar, setCikisMiktar] = useState("");
  const [cikisNeden, setCikisNeden] = useState<CikisNedeni>("skt");
  const [cikisTarih, setCikisTarih] = useState(bugun());
  const [cikisNot, setCikisNot] = useState("");
  // Sipariş takvimi (varsayılan: Salı sipariş, 7 gün sonra teslim) ve tahmin yöntemi
  const [siparisAyar, setSiparisAyarState] = useState<SiparisAyari>(VARSAYILAN_SIPARIS);
  const [yontem, setYontemState] = useState<TahminYontemi>("gun");
  useEffect(() => {
    setSiparisAyarState(tercihOku("kebo-stok-siparis", VARSAYILAN_SIPARIS));
    setYontemState(tercihOku<TahminYontemi>("kebo-stok-yontem", "gun"));
  }, []);
  const setSiparisAyar = (a: SiparisAyari) => { setSiparisAyarState(a); tercihYaz("kebo-stok-siparis", a); };
  const setYontem = (y: TahminYontemi) => { setYontemState(y); tercihYaz("kebo-stok-yontem", y); };
  const [sayimVakti, setSayimVakti] = useState<SayimVakti>("sabah");
  const [topluVakit, setTopluVakit] = useState<SayimVakti>("sabah");
  const [topluSayimAcik, setTopluSayimAcik] = useState(false);

  // Form Verileri
  const [yUrunAdi, setYUrunAdi] = useState("");
  const [yKategori, setYKategori] = useState("");
  const [yBirim, setYBirim] = useState("kg");
  const [yMinStok, setYMinStok] = useState("");
  const [yIlkStok, setYIlkStok] = useState("");
  const [yPeriyot, setYPeriyot] = useState("gunluk");
  const [yNotlar, setYNotlar] = useState("");
  const [saving, setSaving] = useState(false);

  // Çoklu Seçim Verileri
  const [seciliUrunIds, setSeciliUrunIds] = useState<Set<string>>(new Set());
  const [cokluStokMiktar, setCokluStokMiktar] = useState("");
  const [cokluKategori, setCokluKategori] = useState("");
  const [cokluPeriyot, setCokluPeriyot] = useState("");

  // Toplu Sayım Formu Verileri (4 Sekmeli Yapı)
  const [topluSayimSekme, setTopluSayimSekme] = useState<"gunluk" | "haftalik" | "aylik" | "all">("gunluk");
  const [topluSayimTarih, setTopluSayimTarih] = useState(bugun());
  const [topluMiktarlar, setTopluMiktarlar] = useState<Record<string, string>>({});
  const [topluNotlar, setTopluNotlar] = useState<Record<string, string>>({});

  // Sıralama Düzenleme Modu
  const [siraDuzenleModu, setSiraDuzenleModu] = useState(false);

  // Tekli İşlem State'leri
  const [sayimMiktar, setSayimMiktar] = useState("");
  const [sayimTarih, setSayimTarih] = useState(bugun());
  const [sayimNot, setSayimNot] = useState("");
  const [girisMiktar, setGirisMiktar] = useState("");
  const [girisTarih, setGirisTarih] = useState(bugun());
  const [girisFiyat, setGirisFiyat] = useState("");


  const veriCek = useCallback(async () => {
    setLoading(true);
    const [urunRes, hareketRes, irsaliyeRes] = await Promise.all([
      supabase.from("stok_urunler").select("*").eq("durum", "aktif"),
      // Son 120 günün hareketleri (eskiden sabit 600 kayıt sınırı vardı; ürün sayısı arttıkça ortalamalar bozuluyordu)
      supabase.from("stok_hareketler").select("*").gte("tarih", gunEkle(bugun(), -120)).order("tarih", { ascending: false }),
      supabase.from("stok_fatura_kalemleri").select("*").eq("durum", "bekliyor").order("beklenen_tarih"),
    ]);
    if (irsaliyeRes.data) setBekleyenIrsaliye(irsaliyeRes.data as IrsaliyeKalemi[]);

    if (urunRes.data) {
      const sirali = (urunRes.data as Urun[]).sort((a, b) => {
        const sA = a.sira_no ?? 999;
        const sB = b.sira_no ?? 999;
        if (sA !== sB) return sA - sB;
        return a.urun_adi.localeCompare(b.urun_adi);
      });
      setUrunler(sirali);
    }
    if (hareketRes.data) setHareketler(hareketRes.data as Hareket[]);
    setSeciliUrunIds(new Set());
    setLoading(false);
  }, [supabase]);

  useEffect(() => { veriCek(); }, [veriCek]);

  const dinamikKategoriler = useMemo(() => {
    const set = new Set<string>();
    urunler.forEach(u => {
      if (u.kategori) {
        const anaKat = u.kategori.split("/")[0].trim();
        set.add(anaKat);
      }
    });
    return Array.from(set).sort();
  }, [urunler]);

  // Her ürünün güncel durumu: son sayım, tahmini stok, 7 günlük ortalama, kalan gün.
  const durumlar = useMemo(() => {
    const m = new Map<string, StokDurumu>();
    const bugunStr = bugun();
    urunler.forEach(u => m.set(u.id, stokDurumu(hareketler, u.id, bugunStr, yontem)));
    return m;
  }, [urunler, hareketler, yontem]);
  const planlar = useMemo(() => {
    const m = new Map<string, SiparisPlani>();
    urunler.forEach(u => {
      const d = durumlar.get(u.id); if (!d) return;
      const yolda = bekleyenIrsaliye.filter(k => k.urun_id === u.id).map(k => ({ miktar: Number(k.miktar), beklenen_tarih: k.beklenen_tarih }));
      m.set(u.id, siparisPlani(d, siparisAyar, u.min_stok, bugun(), yolda));
    });
    return m;
  }, [urunler, durumlar, siparisAyar, bekleyenIrsaliye]);
  const ornekPlan = planlar.values().next().value as SiparisPlani | undefined;
  const durum = useCallback((id: string) => durumlar.get(id)!, [durumlar]);
  const kritikMi = useCallback((u: Urun) => {
    const d = durumlar.get(u.id);
    return !!d && u.min_stok > 0 && d.tahminiMevcut <= u.min_stok;
  }, [durumlar]);

  const tarihteSayimVarMi = useCallback((urunId: string, tarih: string) => {
    return hareketler.some(h => h.urun_id === urunId && h.tarih === tarih && h.tip === "sayim");
  }, [hareketler]);

  // Sıralama ekranda gösterilen grup içinde yapılır; tüm liste yeniden numaralanıp
  // sırası değişen her ürün kaydedilir (eskiden sadece yer değiştiren iki ürün yazılıyordu).
  const elemanYeriDegistir = async (urun: Urun, grup: Urun[], yon: "yukari" | "asagi") => {
    const grupIdx = grup.findIndex(u => u.id === urun.id);
    const komsu = grup[yon === "yukari" ? grupIdx - 1 : grupIdx + 1];
    if (!komsu) return;
    const liste = [...urunler];
    const i = liste.findIndex(u => u.id === urun.id), j = liste.findIndex(u => u.id === komsu.id);
    [liste[i], liste[j]] = [liste[j], liste[i]];
    const yeni = liste.map((u, k) => ({ ...u, sira_no: k + 1 }));
    const degisenler = yeni.filter(u => urunler.find(x => x.id === u.id)?.sira_no !== u.sira_no);
    setUrunler(yeni);
    const sonuclar = await Promise.all(degisenler.map(u => supabase.from("stok_urunler").update({ sira_no: u.sira_no }).eq("id", u.id)));
    if (sonuclar.some(s => s.error)) { alert("Sıralama kaydedilemedi, sayfa yenileniyor."); veriCek(); }
  };

  // Uyarılar: gerçek verilerden basit kurallar (sahte "AI" metni yok).
  const uyarilar = useMemo(() => {
    const liste: { urun: Urun; tip: "bitiyor" | "sayim" | "tutarsiz" | "fire"; mesaj: string }[] = [];
    const bugunStr = bugun();
    urunler.forEach(u => {
      const d = durumlar.get(u.id); if (!d) return;
      const p = planlar.get(u.id);
      if (p && d.kalanGun !== null && !p.varisaKadarYeter) {
        liste.push({ urun: u, tip: "bitiyor", mesaj: `Tahmini ${fmt(d.tahminiMevcut)} ${u.birim} kaldı, ~${d.kalanGun} gün yeter; bir sonraki sipariş ${fmtTarih(p.varisTarihi)}'de geliyor. Ara alım gerekebilir.` });
      }
      if (sayimGecikti(u.sayim_periyodu, d.sonSayimdanBeriGun)) {
        liste.push({ urun: u, tip: "sayim", mesaj: d.sonSayimTarih ? `Son sayım ${fmtTarih(d.sonSayimTarih)} (${d.sonSayimdanBeriGun} gün önce). Tahminler eskiyor.` : "Hiç sayım girilmemiş." });
      }
      const a = kullanimAnalizi(hareketler, u.id);
      const sonTutarsiz = a.tutarsizAraliklar.filter(t => t.bit >= gunEkle(bugunStr, -14)).pop();
      if (sonTutarsiz) {
        liste.push({ urun: u, tip: "tutarsiz", mesaj: `${fmtTarih(sonTutarsiz.bas)} → ${fmtTarih(sonTutarsiz.bit)} arası stok ${fmt(sonTutarsiz.fark)} ${u.birim} arttı ama mal girişi yok. Giriş unutulmuş ya da sayım hatalı olabilir.` });
      }
      const c = cikisOzeti(hareketler, u.id, gunEkle(bugunStr, -7), bugunStr, u.son_fiyat);
      const kullanim7 = d.ort7.ortalama * 7;
      if (c.fire > 0 && kullanim7 > 0 && c.fire / kullanim7 > 0.1) {
        liste.push({ urun: u, tip: "fire", mesaj: `Son 7 günde ${fmt(c.fire)} ${u.birim} fire (kullanımın %${Math.round(c.fire / kullanim7 * 100)}'i)${c.fireTutar ? `, ~₺${fmt(c.fireTutar, 0)}` : ""}.` });
      }
    });
    const oncelik = { bitiyor: 0, tutarsiz: 1, fire: 2, sayim: 3 };
    return liste.sort((x, y) => oncelik[x.tip] - oncelik[y.tip]);
  }, [urunler, hareketler, durumlar, planlar]);
  const [tumUyarilar, setTumUyarilar] = useState(false);

  const filtreliUrunler = useMemo(() => {
    return urunler.filter(u => {
      if (arama && !u.urun_adi.toLowerCase().includes(arama.toLowerCase()) && !(u.kategori || "").toLowerCase().includes(arama.toLowerCase())) return false;
      if (filtreKategori && !(u.kategori || "").startsWith(filtreKategori)) return false;
      if (filtrePeriyot && (u.sayim_periyodu || "gunluk") !== filtrePeriyot) return false;
      if (sadeceKritik) {
        const d = durumlar.get(u.id);
        const bitiyor = d?.kalanGun !== null && planlar.get(u.id)?.varisaKadarYeter === false;
        if (!kritikMi(u) && !bitiyor) return false;
      }
      return true;
    });
  }, [urunler, arama, filtreKategori, filtrePeriyot, sadeceKritik, durumlar, kritikMi, planlar]);

  const topluSayimSekmeFiltreliUrunler = useMemo(() => {
    return urunler.filter(u => {
      if (topluSayimSekme === "all") return true;
      return u.sayim_periyodu === topluSayimSekme;
    });
  }, [urunler, topluSayimSekme]);

  const hiyerarsikUrunGruplari = useMemo(() => {
    const ağaç: Record<string, Record<string, Urun[]>> = {};

    filtreliUrunler.forEach(u => {
      const katAlani = u.kategori || "Genel / Başlıksız";
      const parcalar = katAlani.split("/");
      const anaBaslik = parcalar[0].trim();
      const altBaslik = parcalar[1] ? parcalar[1].trim() : "Genel Listesi";

      if (!ağaç[anaBaslik]) ağaç[anaBaslik] = {};
      if (!ağaç[anaBaslik][altBaslik]) ağaç[anaBaslik][altBaslik] = [];
      ağaç[anaBaslik][altBaslik].push(u);
    });

    return ağaç;
  }, [filtreliUrunler]);

  const stats = useMemo(() => {
    const kritik = urunler.filter(kritikMi).length;
    const sayilacak = urunler.filter(u => (u.sayim_periyodu || "gunluk") === "gunluk" && durumlar.get(u.id)?.sonSayimTarih !== bugun()).length;
    return { kritik, sayilacak, toplam: urunler.length };
  }, [urunler, kritikMi, durumlar]);

  // Sipariş listesi: önerisi olan ürünler (panoya kopyalanabilir metin)
  const siparisListesi = useMemo(() => urunler
    .map(u => ({ u, miktar: planlar.get(u.id)?.oneri || 0 }))
    .filter(x => x.miktar > 0), [urunler, planlar]);
  const siparisKopyala = async () => {
    const baslik = ornekPlan ? `Sipariş ${fmtTarih(ornekPlan.siparisTarihi)} (teslim ${fmtTarih(ornekPlan.varisTarihi)})\n` : "";
    const metin = baslik + siparisListesi.map(x => `${x.u.urun_adi}: ${fmt(Math.ceil(x.miktar * 10) / 10)} ${x.u.birim}`).join("\n");
    try { await navigator.clipboard.writeText(metin); alert(`${siparisListesi.length} kalem kopyalandı.`); }
    catch { alert(metin); }
  };

  const secimDegis = (id: string) => {
    const yeniSecim = new Set(seciliUrunIds);
    if (yeniSecim.has(id)) yeniSecim.delete(id);
    else yeniSecim.add(id);
    setSeciliUrunIds(yeniSecim);
  };

  const tumunuSecVeyaBirak = () => {
    if (seciliUrunIds.size === filtreliUrunler.length) {
      setSeciliUrunIds(new Set());
    } else {
      setSeciliUrunIds(new Set(filtreliUrunler.map(u => u.id)));
    }
  };

  const cokluGuncellemeKaydet = async () => {
    if (seciliUrunIds.size === 0) return;
    setSaving(true);
    try {
      const ekleyen = userEmail.split("@")[0] || "Bilinmiyor";
      const idsArray = Array.from(seciliUrunIds);

      if (cokluStokMiktar.trim() !== "") {
        const miktarNum = miktarOku(cokluStokMiktar);
        if (!isNaN(miktarNum) && miktarNum >= 0) {
          const kayitlar = idsArray.map(id => ({
            urun_id: id, tarih: bugun(), tip: "sayim" as const, miktar: miktarNum,
            kaynak: "manuel", kullanici: ekleyen, aciklama: "Çoklu Toplu Stok Ataması"
          }));
          await supabase.from("stok_hareketler").insert(kayitlar);
        }
      }

      const guncellemeObj: Record<string, any> = {};
      if (cokluKategori) guncellemeObj.kategori = cokluKategori;
      if (cokluPeriyot) guncellemeObj.sayim_periyodu = cokluPeriyot;

      if (Object.keys(guncellemeObj).length > 0) {
        await Promise.all(idsArray.map(id => supabase.from("stok_urunler").update(guncellemeObj).eq("id", id)));
      }

      setCokluStokMiktar(""); setCokluKategori(""); setCokluPeriyot("");
      setSeciliUrunIds(new Set());
      veriCek();
      alert("Seçili tüm malzemeler başarıyla güncellendi!");
    } catch (err: any) { alert("Hata: " + err.message); }
    finally { setSaving(false); }
  };

  const gelişmişTopluSayımKaydet = async () => {
    const ekleyen = userEmail.split("@")[0] || "Bilinmiyor";
    
    const kayitlar = Object.entries(topluMiktarlar)
      .filter(([, v]) => v.trim() !== "" && miktarOku(v) >= 0)
      .map(([id, miktarStr]) => {
        const ozelNot = topluNotlar[id]?.trim() || "";
        return {
          urun_id: id, tarih: topluSayimTarih, tip: "sayim" as const, vakit: topluVakit, miktar: miktarOku(miktarStr),
          kaynak: "manuel", kullanici: ekleyen, aciklama: ozelNot ? `Toplu Sayım (${ozelNot})` : `Toplu Sayım Girildi`
        };
      });

    if (kayitlar.length === 0) { alert("Miktar girilmedi."); return; }
    
    setSaving(true);
    try {
      const { error } = await supabase.from("stok_hareketler").insert(kayitlar);
      if (error) { alert("Hata: " + error.message); return; }
      setTopluSayimAcik(false); setTopluMiktarlar({}); setTopluNotlar({}); setTopluSayimTarih(bugun());
      veriCek();
    } finally { setSaving(false); }
  };

  const yeniUrunReset = () => {
    setYUrunAdi(""); setYKategori(""); setYBirim("kg");
    setYMinStok(""); setYIlkStok(""); setYPeriyot("gunluk");
    setYeniUrunAcik(false); setDuzenleUrun(null);
  };

  const yeniUrunKaydet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!yUrunAdi.trim()) { alert("Ürün adı zorunlu"); return; }
    setSaving(true);
    try {
      const ekleyen = userEmail.split("@")[0] || "Bilinmiyor";
      const minStokNum = miktarOku(yMinStok) || 0;
      const ilkStokNum = miktarOku(yIlkStok) || 0;

      if (duzenleUrun) {
        const { error } = await supabase.from("stok_urunler").update({
          urun_adi: yUrunAdi.trim(),
          kategori: yKategori.trim() || null,
          birim: yBirim,
          min_stok: minStokNum,
          sayim_periyodu: yPeriyot,
        }).eq("id", duzenleUrun.id);
        if (error) { alert("Hata: " + error.message); return; }
      } else {
        const { data: yeni, error } = await supabase.from("stok_urunler").insert([{
          urun_adi: yUrunAdi.trim(),
          kategori: yKategori.trim() || null,
          birim: yBirim,
          min_stok: minStokNum,
          sayim_periyodu: yPeriyot,
        }]).select().single();
        if (error || !yeni) { alert("Hata: " + (error?.message || "Bilinmeyen")); return; }
        
        if (ilkStokNum > 0) {
          await supabase.from("stok_hareketler").insert([{
            urun_id: yeni.id, tarih: bugun(), tip: "sayim",
            miktar: ilkStokNum, kaynak: "manuel", kullanici: ekleyen,
            aciklama: "İlk açılış sayımı",
          }]);
        }
      }
      yeniUrunReset();
      veriCek();
    } catch (err: any) { alert("Hata: " + err.message); }
    finally { setSaving(false); }
  };

  const urunSil = async (urun: Urun) => {
    if (!isAdmin) { alert("Silme yetkisi yok"); return; }
    if (!confirm(`"${urun.urun_adi}" silinsin mi?`)) return;
    const { error } = await supabase.from("stok_urunler").delete().eq("id", urun.id);
    if (error) { alert("Hata: " + error.message); return; }
    veriCek();
  };

  const sayimKaydet = async () => {
    if (!sayimUrun) return;
    const miktar = miktarOku(sayimMiktar);
    if (isNaN(miktar) || miktar < 0) { alert("Geçerli bir miktar girin"); return; }
    setSaving(true);
    try {
      const ekleyen = userEmail.split("@")[0] || "Bilinmiyor";
      const { error } = await supabase.from("stok_hareketler").insert([{
        urun_id: sayimUrun.id, tarih: sayimTarih, tip: "sayim", vakit: sayimVakti,
        miktar, kaynak: "manuel", kullanici: ekleyen,
        aciklama: sayimNot.trim() || `${sayimUrun.urun_adi} sayımı`,
      }]);
      if (error) { alert("Hata: " + error.message); return; }
      setSayimUrun(null); setSayimMiktar(""); setSayimNot(""); setSayimTarih(bugun());
      veriCek();
    } finally { setSaving(false); }
  };

  const malGirisKaydet = async () => {
    if (!malGirisUrun) return;
    const miktar = miktarOku(girisMiktar);
    if (isNaN(miktar) || miktar <= 0) { alert("Geçerli bir miktar girin"); return; }
    setSaving(true);
    try {
      const ekleyen = userEmail.split("@")[0] || "Bilinmiyor";
      const fiyat = miktarOku(girisFiyat);
      const { error } = await supabase.from("stok_hareketler").insert([{
        urun_id: malGirisUrun.id, tarih: girisTarih, tip: "giris",
        miktar, kaynak: "manuel", kullanici: ekleyen,
        birim_fiyat: !isNaN(fiyat) && fiyat > 0 ? fiyat : null,
        aciklama: "Mal girişi",
      }]);
      if (error) { alert("Hata: " + error.message); return; }
      if (!isNaN(fiyat) && fiyat > 0) {
        await supabase.from("stok_urunler").update({ son_fiyat: fiyat }).eq("id", malGirisUrun.id);
      }
      setMalGirisUrun(null); setGirisMiktar(""); setGirisFiyat(""); setGirisTarih(bugun());
      veriCek();
    } finally { setSaving(false); }
  };

  const cikisKaydet = async () => {
    if (!cikisUrun) return;
    const miktar = miktarOku(cikisMiktar);
    if (isNaN(miktar) || miktar <= 0) { alert("Geçerli bir miktar girin"); return; }
    const d = durumlar.get(cikisUrun.id);
    if (d && miktar > d.tahminiMevcut * 1.5 + 0.001 && !confirm(`Çıkış (${fmt(miktar)} ${cikisUrun.birim}) tahmini stoktan (${fmt(d.tahminiMevcut)}) fazla. Yine de kaydedilsin mi?`)) return;
    setSaving(true);
    try {
      const ekleyen = userEmail.split("@")[0] || "Bilinmiyor";
      const { error } = await supabase.from("stok_hareketler").insert([{
        urun_id: cikisUrun.id, tarih: cikisTarih, tip: "cikis", miktar, neden: cikisNeden,
        birim_fiyat: cikisUrun.son_fiyat, kaynak: "manuel", kullanici: ekleyen,
        aciklama: cikisNot.trim() || CIKIS_NEDENLERI.find(n => n.v === cikisNeden)?.l || "Çıkış",
      }]);
      if (error) { alert("Hata: " + error.message); return; }
      setCikisUrun(null); setCikisMiktar(""); setCikisNot(""); setCikisNeden("skt"); setCikisTarih(bugun());
      veriCek();
    } finally { setSaving(false); }
  };

  useEffect(() => {
    if (duzenleUrun) {
      setYUrunAdi(duzenleUrun.urun_adi);
      setYKategori(duzenleUrun.kategori || "");
      setYBirim(duzenleUrun.birim);
      setYMinStok(duzenleUrun.min_stok.toString());
      setYPeriyot(duzenleUrun.sayim_periyodu || "gunluk");
      setYNotlar(duzenleUrun.notlar || "");
      setYeniUrunAcik(true);
    }
  }, [duzenleUrun]);

  if (loading) return (
    <div className="h-screen bg-[#f4f5f7] flex flex-col items-center justify-center gap-3">
      <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"/>
      <span className="text-[10px] text-gray-600 uppercase tracking-[0.3em]">Mutfak Deposu Yükleniyor</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f4f5f7] text-[#1a1f2e] font-sans antialiased pb-20">
      {/* HEADER */}
      <div className="sticky top-0 z-40 border-b border-[#e2e5eb] bg-[#f4f5f7]/95 backdrop-blur-xl">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-900/40">
              <Package className="h-4 w-4 text-white"/>
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-[#1a1f2e] leading-none">Stok Yönetimi</h1>
              <p className="text-[10px] text-gray-600 leading-none mt-0.5">{stats.toplam} malzeme · {stats.kritik} kritik · bugün sayılacak {stats.sayilacak}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 bg-[#ffffff] border border-[#e2e5eb] px-2.5 py-1.5 rounded-xl"
              title="Haftanın günlerine göre: her gün için son 4 haftanın aynı günleri. Son 7 gün: tüm günler için son 7 günün ortalaması.">
              Tahmin
              <select value={yontem} onChange={e => setYontem(e.target.value as TahminYontemi)} className="bg-transparent font-bold text-[#1a1f2e] outline-none">
                <option value="gun">Haftanın günlerine göre</option>
                <option value="ort7">Son 7 gün ortalaması</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 bg-[#ffffff] border border-[#e2e5eb] px-2.5 py-1.5 rounded-xl"
              title="Bu gün verilen sipariş, teslim süresi sonra gelir ve bir sonraki haftanın siparişi gelene kadar yetmelidir.">
              <ShoppingCart size={12} className="text-emerald-600"/> Sipariş
              <select value={siparisAyar.siparisGunu} onChange={e => setSiparisAyar({ ...siparisAyar, siparisGunu: Number(e.target.value) })} className="bg-transparent font-bold text-[#1a1f2e] outline-none">
                {GUN_ADLARI.map((g, i) => <option key={i} value={i}>{g}</option>)}
              </select>
              · teslim
              <select value={siparisAyar.teslimGun} onChange={e => setSiparisAyar({ ...siparisAyar, teslimGun: Number(e.target.value) })} className="bg-transparent font-bold text-[#1a1f2e] outline-none">
                {[1, 2, 3, 4, 5, 6, 7, 10, 14].map(g => <option key={g} value={g}>{g} gün</option>)}
              </select>
            </label>
            {siparisListesi.length > 0 && (
              <button onClick={siparisKopyala}
                className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 rounded-xl hover:bg-emerald-500/15">
                <ShoppingCart size={13}/> Sipariş listesi ({siparisListesi.length})
              </button>
            )}
            <button onClick={() => { setTopluVakit(varsayilanVakit()); setTopluSayimSekme("gunluk"); setTopluSayimAcik(true); }}
              className="flex items-center gap-1.5 text-[11px] font-bold text-white bg-blue-600/90 hover:bg-blue-600 border border-blue-500/30 px-3 py-2 rounded-xl transition-all shadow-lg shadow-blue-900/20">
              <ClipboardCheck size={13}/> Toplu Sayım
            </button>
            <button 
              onClick={() => setSiraDuzenleModu(!siraDuzenleModu)}
              className={`flex items-center gap-1.5 text-[11px] font-semibold px-3 py-2 rounded-xl border transition-colors ${
                siraDuzenleModu ? "bg-purple-500/20 border-purple-500/40 text-purple-600" : "text-gray-500 hover:text-purple-600 border-[#e2e5eb]"
              }`}
            >
              <ListOrdered size={13}/> {siraDuzenleModu ? "Sıralamayı Kapat" : "Sırala"}
            </button>
            <button onClick={veriCek} className="p-2 text-gray-600 hover:text-[#1a1f2e] border border-[#e2e5eb] rounded-xl">
              <RefreshCw size={14}/>
            </button>
            <button onClick={() => { setDuzenleUrun(null); setYeniUrunAcik(true); }}
              className="flex items-center gap-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-xl shadow-lg shadow-emerald-900/30">
              <PlusCircle size={14}/> Yeni Malzeme
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* UYARILAR — gerçek verilerden: bitecek ürünler, tutarsız sayımlar, yüksek fire, geciken sayımlar */}
        <div className="rounded-2xl border border-[#e2e5eb] bg-[#ffffff] p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-black text-gray-700 uppercase tracking-widest flex items-center gap-2"><AlertTriangle size={13} className="text-amber-600"/> Stok Uyarıları</h2>
            {uyarilar.length > 6 && (
              <button onClick={() => setTumUyarilar(!tumUyarilar)} className="text-[11px] font-semibold text-blue-600">{tumUyarilar ? "Daha az" : `Tümü (${uyarilar.length})`}</button>
            )}
          </div>
          {uyarilar.length === 0 ? (
            <p className="text-xs text-gray-600">Her şey yolunda: bitmek üzere ürün, tutarsız sayım ya da yüksek fire yok.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {(tumUyarilar ? uyarilar : uyarilar.slice(0, 6)).map((u, i) => (
                <div key={i} className={`rounded-xl p-3 border text-xs ${
                  u.tip === "bitiyor" ? "bg-red-500/5 border-red-500/20" :
                  u.tip === "tutarsiz" ? "bg-purple-500/5 border-purple-500/20" :
                  u.tip === "fire" ? "bg-orange-500/5 border-orange-500/20" : "bg-amber-500/5 border-amber-500/20"}`}>
                  <div className="font-bold mb-1 flex items-center justify-between gap-2">
                    <Link href={`/stok/${u.urun.id}`} className="text-[#1a1f2e] hover:text-blue-600">{u.urun.urun_adi}</Link>
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                      u.tip === "bitiyor" ? "bg-red-500/10 text-red-600" : u.tip === "tutarsiz" ? "bg-purple-500/10 text-purple-600" :
                      u.tip === "fire" ? "bg-orange-500/10 text-orange-600" : "bg-amber-500/10 text-amber-700"}`}>
                      {u.tip === "bitiyor" ? "Bitiyor" : u.tip === "tutarsiz" ? "Kontrol et" : u.tip === "fire" ? "Fire" : "Sayım"}
                    </span>
                  </div>
                  <p className="text-gray-600 text-[11px] leading-relaxed">{u.mesaj}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* İRSALİYE / YOLDAKİ MAL */}
        <IrsaliyePaneli
          urunler={urunler.map(u => ({ id: u.id, urun_adi: u.urun_adi, birim: u.birim, son_fiyat: u.son_fiyat }))}
          bekleyenler={bekleyenIrsaliye}
          varsayilanTarih={ornekPlan?.varisTarihi || bugun()}
          kullanici={yetki.kullaniciAdi}
          onDegisti={veriCek}
        />

        {/* BULK SEÇİM BAR */}
        {seciliUrunIds.size > 0 && (
          <div className="rounded-2xl border border-amber-500/30 bg-[#ffffff] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <CheckSquare className="text-amber-600 h-4 w-4" />
              <span className="text-xs font-bold">{seciliUrunIds.size} malzeme topluca seçildi</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input type="text" inputMode="decimal" placeholder="Hepsine sayım..." value={cokluStokMiktar} onChange={e => setCokluStokMiktar(e.target.value)}
                className="bg-[#f4f5f7] border border-[#e2e5eb] text-[#1a1f2e] text-xs h-9 px-3 rounded-xl outline-none w-28" />
              <input type="text" placeholder="Toplu Başlık..." value={cokluKategori} onChange={e => setCokluKategori(e.target.value)}
                className="bg-[#f4f5f7] border border-[#e2e5eb] text-[#1a1f2e] text-xs h-9 px-3 rounded-xl outline-none w-36" />
              <select value={cokluPeriyot} onChange={e => setCokluPeriyot(e.target.value)}
                className="bg-[#f4f5f7] border border-[#e2e5eb] text-[#1a1f2e] text-xs h-9 px-3 rounded-xl outline-none">
                <option value="">Toplu Döngü</option>
                {PERIYOTLAR.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
              </select>
              <button onClick={cokluGuncellemeKaydet} disabled={saving} className="bg-amber-600 hover:bg-amber-700 text-xs font-bold px-4 py-2 h-9 rounded-xl">Seçilenleri Güncelle</button>
            </div>
          </div>
        )}

        {/* FİLTRELER */}
        <div className="rounded-2xl border border-[#e2e5eb] bg-[#ffffff] p-4 flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600"/>
            <input type="text" placeholder="Malzeme adı veya başlık/alt başlık ara..." value={arama} onChange={e => setArama(e.target.value)}
              className="w-full bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] text-sm h-9 pl-9 pr-3 rounded-xl outline-none"/>
          </div>
          <select value={filtreKategori} onChange={e => setFiltreKategori(e.target.value)} className="bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] text-xs px-3 h-9 rounded-xl outline-none">
            <option value="">Tüm Ana Başlıklar</option>
            {dinamikKategoriler.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <select value={filtrePeriyot} onChange={e => setFiltrePeriyot(e.target.value)} className="bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] text-xs px-3 h-9 rounded-xl outline-none">
            <option value="">Tüm Döngüler</option>
            {PERIYOTLAR.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
          </select>
          <button onClick={() => setSadeceKritik(!sadeceKritik)}
            className={`text-xs font-semibold px-4 py-2 rounded-xl border transition-colors flex items-center gap-1.5 ${
              sadeceKritik ? "bg-amber-500/15 border-amber-500/40 text-amber-600" : "bg-[#f7f8fa] border-[#e2e5eb] text-gray-500"
            }`}>
            <AlertTriangle size={12}/> Sadece kritik / bitecek
          </button>
        </div>

        {/* HİERARŞİK GÖRÜNÜM */}
        <div className="space-y-6">
          {Object.keys(hiyerarsikUrunGruplari).length === 0 ? (
            <div className="rounded-2xl border border-[#e2e5eb] bg-[#ffffff] py-12 text-center text-gray-600 text-xs">Aranan kriterlerde malzeme bulunamadı.</div>
          ) : (
            Object.entries(hiyerarsikUrunGruplari).map(([anaBaslik, altGruplar]) => (
              <div key={anaBaslik} className="space-y-3">
                <div className="flex items-center gap-2 border-b border-gray-800 pb-1.5 px-1 mt-2">
                  <Layers size={14} className="text-emerald-600" />
                  <h2 className="text-sm font-black uppercase tracking-wider text-emerald-600">{anaBaslik}</h2>
                </div>

                {Object.entries(altGruplar).map(([altBaslik, liste]) => (
                  <div key={altBaslik} className="rounded-2xl border border-[#e2e5eb] bg-[#ffffff] overflow-hidden shadow-lg pl-1">
                    <div className="px-4 py-2 bg-[#f4f5f7]/40 border-b border-[#e2e5eb] flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400">
                        <Clock size={11} className="text-gray-600" />
                        <span>{altBaslik}</span>
                        <span className="text-[10px] text-gray-600 font-mono font-normal">({liste.length} malzeme)</span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-[#e2e5eb] bg-[#f4f5f7]/10 text-gray-600">
                            <th className="px-4 py-2 text-left w-10">
                              <button onClick={tumunuSecVeyaBirak} className="text-gray-600"><Square size={13} /></button>
                            </th>
                            {siraDuzenleModu && <th className="px-4 py-2 text-left w-24">Sıralama</th>}
                            <th className="px-4 py-2 text-left">Malzeme</th>
                            <th className="px-4 py-2 text-left" title="En son girilen sayım ve tarihi">Son Sayım</th>
                            <th className="px-4 py-2 text-left" title="Son sayım + sonraki girişler − çıkışlar − (günlük ortalama × geçen gün)">Tahmini Stok</th>
                            <th className="px-4 py-2 text-left">Min.</th>
                            <th className="px-4 py-2 text-left" title="Son 7 günün ortalama günlük kullanımı ve bugün için tahmin (sayılmayan günler aradaki sayımlardan bölünerek hesaplanır)">Günlük Kullanım</th>
                            <th className="px-4 py-2 text-left">Yeter</th>
                            <th className="px-4 py-2 text-left" title="Bir sonraki haftanın siparişi gelene kadarki tahmini kullanım + minimum stok − tahmini stok">
                              Sipariş{ornekPlan ? ` (${fmtTarih(ornekPlan.siparisTarihi).slice(0, 5)})` : ""}
                            </th>
                            <th className="px-4 py-2 text-right">İşlemler</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#0f1624]">
                          {liste.map(urun => {
                            const grupIdx = liste.findIndex(u => u.id === urun.id);
                            const d = durum(urun.id);
                            const ort = d.ort7.ortalama;
                            const plan = planlar.get(urun.id);
                            const kalanGun = d.kalanGun;
                            const kritik = kritikMi(urun);
                            const tukenmis = d.sonSayimTarih !== null && d.tahminiMevcut <= 0;
                            const oneri = plan?.oneri || 0;
                            const gecikti = sayimGecikti(urun.sayim_periyodu, d.sonSayimdanBeriGun);
                            const secili = seciliUrunIds.has(urun.id);

                            return (
                              <tr key={urun.id} className={`hover:bg-white/[0.01] transition-colors group ${tukenmis ? "bg-red-100/60" : kritik ? "bg-amber-100/60" : ""} ${secili ? "bg-amber-500/5" : ""}`}>
                                <td className="px-4 py-3">
                                  <button type="button" onClick={() => secimDegis(urun.id)} className="text-gray-600">
                                    {secili ? <CheckSquare size={13} className="text-amber-700" /> : <Square size={13} />}
                                  </button>
                                </td>

                                {siraDuzenleModu && (
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-1 text-gray-500">
                                      <button type="button" onClick={() => elemanYeriDegistir(urun, liste, "yukari")} disabled={grupIdx === 0}
                                        className="p-1 hover:text-purple-600 bg-black/[0.04] rounded disabled:opacity-20" title="Yukarı Taşı">
                                        <ArrowUp size={11} />
                                      </button>
                                      <button type="button" onClick={() => elemanYeriDegistir(urun, liste, "asagi")} disabled={grupIdx === liste.length - 1}
                                        className="p-1 hover:text-purple-600 bg-black/[0.04] rounded disabled:opacity-20" title="Aşağı Taşı">
                                        <ArrowDown size={11} />
                                      </button>
                                    </div>
                                  </td>
                                )}

                                <td className="px-4 py-3 font-semibold text-gray-800">
                                  <Link href={`/stok/${urun.id}`} className="hover:text-blue-600 transition-colors">{urun.urun_adi}</Link>
                                </td>
                                <td className="px-4 py-3">
                                  {d.sonSayimTarih ? (
                                    <div>
                                      <span className="font-semibold text-gray-800">{fmt(d.sonSayimMiktar || 0)} {urun.birim}</span>
                                      <p className={`text-[10px] ${gecikti ? "text-amber-700 font-semibold" : "text-gray-500"}`}>
                                        {d.sonSayimdanBeriGun === 0 ? "bugün" : `${fmtTarih(d.sonSayimTarih).slice(0, 5)} · ${d.sonSayimdanBeriGun} gün önce`}
                                      </p>
                                    </div>
                                  ) : <span className="text-[10px] text-amber-700 font-semibold">sayım yok</span>}
                                </td>
                                <td className={`px-4 py-3 font-black ${tukenmis ? "text-red-600" : kritik ? "text-amber-600" : "text-[#1a1f2e]"}`}>
                                  {d.sonSayimTarih || d.tahminiMevcut > 0 ? <>~{fmt(d.tahminiMevcut)} <span className="text-[10px] text-gray-600 font-normal">{urun.birim}</span></> : "—"}
                                  {plan && plan.yolda > 0 && <p className="text-[10px] font-semibold text-amber-700">+{fmt(plan.yolda)} yolda</p>}
                                </td>
                                <td className="px-4 py-3 text-gray-500">{urun.min_stok > 0 ? `${fmt(urun.min_stok)} ${urun.birim}` : "—"}</td>
                                <td className="px-4 py-3">
                                  {ort > 0 ? (
                                    <div>
                                      <span className="text-purple-600 font-semibold">7g ort. {fmt(ort, 1)} {urun.birim}</span>
                                      <p className="text-[10px] text-gray-500">
                                        {yontem === "gun" && Math.abs(d.bugunkuTahmin - ort) > 0.05 ? `bugün tahmini ${fmt(d.bugunkuTahmin, 1)} · ` : ""}
                                        {d.ort7.veriGunu} günlük veri{d.ort7.pencere > 7 ? " (son 30 gün)" : ""}
                                      </p>
                                    </div>
                                  ) : <span className="text-gray-500 text-[10px]">en az 2 sayım gerekli</span>}
                                </td>
                                <td className="px-4 py-3">
                                  {kalanGun !== null
                                    ? <span title={plan ? `Bir sonraki teslim: ${fmtTarih(plan.varisTarihi)}` : undefined} className={`font-semibold ${plan && !plan.varisaKadarYeter ? "text-red-600" : "text-emerald-600"}`}>{kalanGun >= 120 ? "120+" : `~${kalanGun}`} gün</span>
                                    : <span className="text-gray-700">—</span>}
                                </td>
                                <td className="px-4 py-3">
                                  {oneri > 0 ? <span className="font-black text-emerald-700 bg-emerald-500/10 px-2 py-1 rounded-lg">{fmt(Math.ceil(oneri * 10) / 10)} {urun.birim}</span> : <span className="text-gray-400">—</span>}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <button onClick={() => { setSayimVakti(varsayilanVakit()); setSayimUrun(urun); }} title="Sayım gir" className="p-1.5 text-blue-600 hover:bg-blue-500/10 rounded-lg"><ClipboardCheck size={13}/></button>
                                    <button onClick={() => setMalGirisUrun(urun)} title="Mal girişi" className="p-1.5 text-amber-600 hover:bg-amber-500/10 rounded-lg"><Truck size={13}/></button>
                                    <button onClick={() => setCikisUrun(urun)} title="Stok çıkışı / fire" className="p-1.5 text-red-600 hover:bg-red-500/10 rounded-lg"><PackageMinus size={13}/></button>
                                    <button onClick={() => setDuzenleUrun(urun)} title="Düzenle" className="p-1.5 text-gray-400 hover:bg-black/[0.04] rounded-lg"><Edit3 size={13}/></button>
                                    {isAdmin && <button onClick={() => urunSil(urun)} className="p-1.5 text-red-600 hover:bg-red-500/10 rounded-lg"><Trash2 size={12}/></button>}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 4 SEKMELİ TOPLU SAYIM MODAL */}
      {topluSayimAcik && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#ffffff] border border-blue-500/30 rounded-2xl w-full max-w-3xl shadow-2xl max-h-[85vh] flex flex-col">
            <div className="px-5 py-4 border-b border-[#e2e5eb] flex items-center justify-between bg-[#f7f8fa] rounded-t-2xl">
              <div className="flex items-center gap-2">
                <ClipboardCheck size={16} className="text-blue-600"/>
                <h3 className="text-sm font-black text-[#1a1f2e]">Gelişmiş Çoklu Stok Sayım Listesi</h3>
              </div>
              <button onClick={() => { setTopluSayimAcik(false); setTopluMiktarlar({}); setTopluNotlar({}); }} className="p-1 text-gray-600 hover:text-[#1a1f2e]"><X size={16}/></button>
            </div>

            <div className="p-4 bg-[#f7f8fa] border-b border-[#e2e5eb] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span className="text-xs text-gray-400 flex items-center gap-1"><Calendar size={13}/> Giriş Yapılacak Sayım Günü Tarihi:</span>
                <div className="flex items-center gap-2">
                  <input type="date" value={topluSayimTarih} max={bugun()} onChange={e => setTopluSayimTarih(e.target.value)}
                    className="bg-[#f4f5f7] border border-[#e2e5eb] text-[#1a1f2e] text-xs font-bold h-9 px-3 rounded-xl outline-none" />
                  <select value={topluVakit} onChange={e => setTopluVakit(e.target.value as SayimVakti)}
                    className="bg-[#f4f5f7] border border-[#e2e5eb] text-[#1a1f2e] text-xs font-bold h-9 px-3 rounded-xl outline-none">
                    <option value="sabah">Sabah (açılış)</option>
                    <option value="aksam">Akşam (kapanış)</option>
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-4 gap-1 bg-[#f4f5f7] p-1 rounded-xl border border-[#e2e5eb]">
                {[
                  { id: "gunluk", l: "⏱ Günlük Liste" },
                  { id: "haftalik", l: "📅 Haftalık Liste" },
                  { id: "aylik", l: "🗓 Aylık Liste" },
                  { id: "all", l: "📦 Tüm Liste" }
                ].map(tab => (
                  <button key={tab.id} type="button" onClick={() => setTopluSayimSekme(tab.id as any)}
                    className={`py-2 text-[11px] font-bold rounded-lg transition-all text-center ${topluSayimSekme === tab.id ? "bg-blue-600 text-white shadow" : "text-gray-50 hover:text-[#1a1f2e]"}`}>
                    {tab.l}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#f4f5f7]/50">
              {topluSayimSekmeFiltreliUrunler.length === 0 ? (
                <div className="text-center text-gray-600 text-xs py-8">Bu sayım periyoduna ait malzeme bulunmuyor.</div>
              ) : topluSayimSekmeFiltreliUrunler.map(urun => {
                const mukerrer = tarihteSayimVarMi(urun.id, topluSayimTarih);
                return (
                  <div key={urun.id} className={`flex flex-col sm:flex-row sm:items-center gap-3 bg-[#f7f8fa] border rounded-xl px-4 py-2 transition-colors ${mukerrer ? "border-amber-500/30 bg-amber-500/[0.01]" : "border-[#e2e5eb]"}`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-[#1a1f2e]">{urun.urun_adi}</p>
                        <span className="text-[9px] text-gray-600 font-mono italic">({urun.kategori || "Kategorisiz"})</span>
                      </div>
                      <p className="text-[10px] text-gray-600 mt-0.5">Tahmini şu an: <span className="text-gray-700 font-bold">~{fmt(durum(urun.id).tahminiMevcut)} {urun.birim}</span></p>
                    </div>

                    {mukerrer && (
                      <div className="text-[9px] text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded flex items-center gap-0.5 shrink-0">
                        <AlertTriangle size={10}/> Bugün zaten sayılmış!
                      </div>
                    )}

                    <div className="flex items-center gap-2 shrink-0">
                      <input type="text" placeholder="Sayım notu..." value={topluNotlar[urun.id] || ""}
                        onChange={e => {
                          const val = e.target.value;
                          setTopluNotlar(prev => ({ ...prev, [urun.id]: val }));
                        }}
                        className="bg-[#ffffff] border border-[#e2e5eb] text-gray-700 text-[11px] h-8 px-2 w-36 rounded-lg outline-none" />
                      <input type="text" inputMode="decimal" value={topluMiktarlar[urun.id] || ""}
                        onChange={e => {
                          const val = e.target.value;
                          setTopluMiktarlar(prev => ({ ...prev, [urun.id]: val }));
                        }}
                        placeholder={`0 ${urun.birim}`}
                        className="w-24 bg-[#ffffff] border border-[#e2e5eb] text-[#1a1f2e] text-xs font-black h-8 px-2 rounded-lg text-right outline-none focus:border-blue-500/50" />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-5 py-4 border-t border-[#e2e5eb] flex justify-end gap-2 bg-[#f7f8fa] rounded-b-2xl">
              <button onClick={() => { setTopluSayimAcik(false); setTopluMiktarlar({}); setTopluNotlar({}); }} className="text-xs font-semibold text-gray-500 border border-[#e2e5eb] px-4 py-2 rounded-xl">Kapat</button>
              <button onClick={gelişmişTopluSayımKaydet} disabled={saving} className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-xl flex items-center gap-2 shadow-lg shadow-blue-900/30">
                {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Sayımları Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* YENİ / DÜZENLEME MODAL */}
      {yeniUrunAcik && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#ffffff] border border-[#e2e5eb] rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-5 py-4 border-b border-[#e2e5eb] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1a1f2e]">{duzenleUrun ? "Malzeme Düzenle" : "Yeni Malzeme Tanımla"}</h3>
              <button onClick={yeniUrunReset} className="p-1 text-gray-600 hover:text-[#1a1f2e]"><X size={16}/></button>
            </div>
            <form onSubmit={yeniUrunKaydet} className="p-5 space-y-3">
              <div>
                <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Malzeme Adı *</label>
                <input type="text" value={yUrunAdi} onChange={e => setYUrunAdi(e.target.value)} required
                  className="w-full bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] text-sm h-9 px-3 rounded-xl outline-none"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Başlık (Örn: Soğuk Hava / A Firması)</label>
                  <input type="text" placeholder="Grup / Alt Grup" value={yKategori} onChange={e => setYKategori(e.target.value)}
                    className="w-full bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] text-xs h-9 px-3 rounded-xl outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Birim</label>
                  <select value={yBirim} onChange={e => setYBirim(e.target.value)}
                    className="w-full bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] text-sm h-9 px-3 rounded-xl outline-none">
                    {BIRIMLER.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Sayım Periyodu</label>
                  <select value={yPeriyot} onChange={e => setYPeriyot(e.target.value)}
                    className="w-full bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] text-sm h-9 px-3 rounded-xl outline-none">
                    <option value="gunluk">Günlük Sayım</option>
                    <option value="haftalik">Haftalık Sayım</option>
                    <option value="aylik">Aylık Sayım</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Min. Stok</label>
                  <input type="text" inputMode="decimal" value={yMinStok} onChange={e => setYMinStok(e.target.value)}
                    className="w-full bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] text-sm h-9 px-3 rounded-xl outline-none"/>
                </div>
              </div>
              {!duzenleUrun && (
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Başlangıç Eldeki Stok</label>
                  <input type="text" inputMode="decimal" value={yIlkStok} onChange={e => setYIlkStok(e.target.value)}
                    className="w-full bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] text-sm h-9 px-3 rounded-xl outline-none"/>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={yeniUrunReset} className="text-xs font-semibold text-gray-500 border border-[#e2e5eb] px-4 py-2 rounded-xl">İptal</button>
                <button type="submit" disabled={saving} className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-6 py-2 rounded-xl flex items-center gap-2">
                  {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TEKLİ SAYIM MODAL */}
      {sayimUrun && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#ffffff] border border-blue-500/20 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="px-5 py-4 border-b border-[#e2e5eb] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1a1f2e]">Sayım Gir · {sayimUrun.urun_adi}</h3>
              <button onClick={() => setSayimUrun(null)} className="p-1 text-gray-600 hover:text-[#1a1f2e]"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Sayım Günü Tarihi</label>
                <input type="date" value={sayimTarih} max={bugun()} onChange={e => setSayimTarih(e.target.value)}
                  className="w-full bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] text-sm h-9 px-3 rounded-xl outline-none"/>
              </div>
              <VakitSecici value={sayimVakti} onChange={setSayimVakti}/>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Miktar ({sayimUrun.birim})</label>
                <input type="text" inputMode="decimal" value={sayimMiktar} onChange={e => setSayimMiktar(e.target.value)} autoFocus
                  className="w-full bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] text-base h-10 px-3 rounded-xl outline-none"/>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Açıklama / Özel Not</label>
                <input type="text" value={sayimNot} onChange={e => setSayimNot(e.target.value)}
                  className="w-full bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] text-xs h-8 px-3 rounded-xl outline-none"/>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setSayimUrun(null)} className="text-xs font-semibold text-gray-500 border border-[#e2e5eb] px-4 py-2 rounded-xl">Vazgeç</button>
                <button onClick={sayimKaydet} disabled={saving || !sayimMiktar} className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-xl">Listeye İşle</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STOK ÇIKIŞI / FİRE MODAL */}
      {cikisUrun && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#ffffff] border border-red-500/20 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="px-5 py-4 border-b border-[#e2e5eb] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1a1f2e]">Stok Çıkışı · {cikisUrun.urun_adi}</h3>
              <button onClick={() => setCikisUrun(null)} className="p-1 text-gray-600 hover:text-[#1a1f2e]"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-[11px] text-gray-500">Mutfakta kullanım için değil; atılan, bozulan ya da iade edilen mal için. Kullanım hesabından ayrı tutulur ve fire raporunda görünür.</p>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Neden</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {CIKIS_NEDENLERI.map(n => (
                    <button key={n.v} type="button" onClick={() => setCikisNeden(n.v)}
                      className={`text-xs font-semibold py-2 rounded-lg border transition-colors ${cikisNeden === n.v ? "bg-red-600 text-white border-red-600" : "bg-[#f7f8fa] border-[#e2e5eb] text-gray-600"}`}>
                      {n.l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Tarih</label>
                  <input type="date" value={cikisTarih} max={bugun()} onChange={e => setCikisTarih(e.target.value)}
                    className="w-full bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] text-sm h-9 px-3 rounded-xl outline-none"/>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Miktar ({cikisUrun.birim})</label>
                  <input type="text" inputMode="decimal" value={cikisMiktar} onChange={e => setCikisMiktar(e.target.value)} autoFocus
                    className="w-full bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] text-base h-9 px-3 rounded-xl outline-none"/>
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Açıklama</label>
                <input type="text" value={cikisNot} onChange={e => setCikisNot(e.target.value)} placeholder="Opsiyonel (örn. parti no, tedarikçi)"
                  className="w-full bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] text-xs h-8 px-3 rounded-xl outline-none"/>
              </div>
              {cikisUrun.son_fiyat && miktarOku(cikisMiktar) > 0 && (
                <p className="text-[11px] text-red-700">Yaklaşık değer: ₺{fmt(miktarOku(cikisMiktar) * cikisUrun.son_fiyat, 0)} (son alış fiyatıyla)</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setCikisUrun(null)} className="text-xs font-semibold text-gray-500 border border-[#e2e5eb] px-4 py-2 rounded-xl">Vazgeç</button>
                <button onClick={cikisKaydet} disabled={saving || !cikisMiktar} className="text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 px-6 py-2 rounded-xl">Çıkışı Kaydet</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MAL GİRİŞ MODAL */}
      {malGirisUrun && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#ffffff] border border-amber-500/20 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="px-5 py-4 border-b border-[#e2e5eb] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1a1f2e]">Mal Girişi · {malGirisUrun.urun_adi}</h3>
              <button onClick={() => setMalGirisUrun(null)} className="p-1 text-gray-600 hover:text-[#1a1f2e]"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Kabul Tarihi</label>
                <input type="date" value={girisTarih} onChange={e => setGirisTarih(e.target.value)}
                  className="w-full bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] text-sm h-9 px-3 rounded-xl outline-none"/>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Gelen Fatura Miktarı ({malGirisUrun.birim})</label>
                <input type="text" inputMode="decimal" value={girisMiktar} onChange={e => setGirisMiktar(e.target.value)} autoFocus
                  className="w-full bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] text-base h-10 px-3 rounded-xl outline-none"/>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Birim Alış Fiyatı (₺)</label>
                <input type="text" inputMode="decimal" value={girisFiyat} onChange={e => setGirisFiyat(e.target.value)}
                  className="w-full bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] text-base h-10 px-3 rounded-xl outline-none"/>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setMalGirisUrun(null)} className="text-xs font-semibold text-gray-500 border border-[#e2e5eb] px-4 py-2 rounded-xl">İptal</button>
                <button onClick={malGirisKaydet} disabled={saving || !girisMiktar} className="text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-6 py-2 rounded-xl">Depoya Ekle</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
