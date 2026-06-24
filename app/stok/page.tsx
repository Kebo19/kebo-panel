"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import {
  Package, PlusCircle, Search, AlertTriangle, TrendingDown,
  Truck, ClipboardCheck, Loader2, X, Save, Edit3, Trash2,
  RefreshCw, Layers, Box, Clock, BrainCircuit, CheckSquare, Square,
  Check, ListOrdered, Send, Bot, MessageSquare, Calendar, ArrowUp, ArrowDown
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
  kaynak: string | null;
  aciklama: string | null;
  kullanici: string | null;
  created_at: string;
}

interface ChatMesaj {
  sender: "user" | "ai";
  text: string;
  time: string;
}

const fmt = (v: number, decimals = 1): string =>
  new Intl.NumberFormat("tr-TR", { maximumFractionDigits: decimals, minimumFractionDigits: 0 }).format(v);
const bugun = () => new Date().toISOString().split("T")[0];

const PERIYOTLAR = [
  { v: "gunluk", l: "Günlük Sayım" },
  { v: "haftalik", l: "Haftalık Sayım" },
  { v: "aylik", l: "Aylık Sayım" }
];
const BIRIMLER = ["kg", "gr", "lt", "ml", "adet", "koli", "paket", "düzine", "torba", "kova", "şişe"];

export default function StokPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [urunler, setUrunler] = useState<Urun[]>([]);
  const [hareketler, setHareketler] = useState<Hareket[]>([]);

  const [arama, setArama] = useState("");
  const [filtreKategori, setFiltreKategori] = useState("");
  const [filtrePeriyot, setFiltrePeriyot] = useState("");
  const [sadeceKritik, setSadeceKritik] = useState(false);

  // Modaller
  const [yeniUrunAcik, setYeniUrunAcik] = useState(false);
  const [duzenleUrun, setDuzenleUrun] = useState<Urun | null>(null);
  const [sayimUrun, setSayimUrun] = useState<Urun | null>(null);
  const [malGirisUrun, setMalGirisUrun] = useState<Urun | null>(null);
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

  // AI Chatbot State'leri
  const [chatAcik, setChatAcik] = useState(false);
  const [chatGirdisi, setChatGirdisi] = useState("");
  const [chatGecmisi, setChatGecmisi] = useState<ChatMesaj[]>([
    { sender: "ai", text: "Selam Şef! Kebo Stok Asistanı hazır. Hangi malzemenin durumunu veya tüketim tahminini analiz etmemi istersin?", time: "Şimdi" }
  ]);

  const veriCek = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const mail = user?.email || "";
    setUserEmail(mail);
    setIsAdmin(mail === "murat@kebo.com" || mail === "bulent@kebo.com");

    const [urunRes, hareketRes] = await Promise.all([
      supabase.from("stok_urunler").select("*").eq("durum", "aktif"),
      supabase.from("stok_hareketler").select("*").order("tarih", { ascending: false }).limit(600),
    ]);

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

  const gunlukOrtalama = useCallback((urunId: string): number => {
    // Son 7 günün tarih sınırını hesapla
    const bugunDate = new Date();
    bugunDate.setHours(0, 0, 0, 0);
    const yediGunOnce = new Date(bugunDate);
    yediGunOnce.setDate(yediGunOnce.getDate() - 7);
    const yediGunOnceStr = yediGunOnce.toISOString().split("T")[0];

    // Bu ürünün son 7 güne ait sayımlarını tarihe göre sırala
    const sonYediGunSayimlar = hareketler
      .filter(h => h.urun_id === urunId && h.tip === "sayim" && h.tarih >= yediGunOnceStr)
      .sort((a, b) => a.tarih.localeCompare(b.tarih));

    if (sonYediGunSayimlar.length < 2) return 0;

    // Ardışık sayım çiftleri üzerinden günlük tüketim hesapla
    let toplamKullanim = 0;
    let toplamGun = 0;

    for (let i = 1; i < sonYediGunSayimlar.length; i++) {
      const onceki = sonYediGunSayimlar[i - 1];
      const sonraki = sonYediGunSayimlar[i];

      // Bu iki sayım arasındaki mal girişlerini bul
      const aradaGelen = hareketler
        .filter(h =>
          h.urun_id === urunId &&
          h.tip === "giris" &&
          h.tarih > onceki.tarih &&
          h.tarih <= sonraki.tarih
        )
        .reduce((s, h) => s + h.miktar, 0);

      const gunFarki = Math.max(
        (new Date(sonraki.tarih).getTime() - new Date(onceki.tarih).getTime()) / (1000 * 60 * 60 * 24),
        1
      );

      const kullanim = (onceki.miktar + aradaGelen) - sonraki.miktar;
      if (kullanim > 0) {
        toplamKullanim += kullanim;
        toplamGun += gunFarki;
      }
    }

    // Veri olan gün sayısına böl (eksik günler hesaba katılmaz)
    return toplamGun > 0 ? toplamKullanim / toplamGun : 0;
  }, [hareketler]);

  const tahminiBitisGunu = useCallback((urun: Urun): number | null => {
    const ort = gunlukOrtalama(urun.id);
    if (ort <= 0 || urun.mevcut_stok <= 0) return null;
    return Math.floor(urun.mevcut_stok / ort);
  }, [gunlukOrtalama]);

  const tarihteSayimVarMi = useCallback((urunId: string, tarih: string) => {
    return hareketler.some(h => h.urun_id === urunId && h.tarih === tarih && h.tip === "sayim");
  }, [hareketler]);

  const elemanYeriDegistir = async (index: number, yon: "yukari" | "asagi") => {
    const yeniUrunlerListesi = [...urunler];
    const hedefIndex = yon === "yukari" ? index - 1 : index + 1;
    
    if (hedefIndex < 0 || hedefIndex >= yeniUrunlerListesi.length) return;

    const gecici = yeniUrunlerListesi[index];
    yeniUrunlerListesi[index] = yeniUrunlerListesi[hedefIndex];
    yeniUrunlerListesi[hedefIndex] = gecici;

    const guncellenmisUrunler = yeniUrunlerListesi.map((u, i) => ({ ...u, sira_no: i + 1 }));
    setUrunler(guncellenmisUrunler);

    await Promise.all([
      supabase.from("stok_urunler").update({ sira_no: index + 1 }).eq("id", guncellenmisUrunler[index].id),
      supabase.from("stok_urunler").update({ sira_no: hedefIndex + 1 }).eq("id", guncellenmisUrunler[hedefIndex].id)
    ]);
  };

  const aiAnalizleri = useMemo(() => {
    if (urunler.length === 0 || hareketler.length < 5) return [];
    const uyarilar: { urun_adi: string; tip: "kritik" | "hizli" | "stabil" | "atik"; mesaj: string }[] = [];

    urunler.forEach(u => {
      const urunHareketleri = hareketler.filter(h => h.urun_id === u.id).sort((a, b) => b.tarih.localeCompare(a.tarih));
      const ort = gunlukOrtalama(u.id);

      if (ort > 0) {
        const sayimlar = urunHareketleri.filter(h => h.tip === "sayim");
        if (sayimlar.length >= 2) {
          const sonKullanimHizi = Math.max(sayimlar[1].miktar - sayimlar[0].miktar, 0);
          
          if (sonKullanimHizi > ort * 1.4) {
            uyarilar.push({
              urun_adi: u.urun_adi,
              tip: "hizli",
              mesaj: `Son günlerde normal tüketiminin %40 üzerine çıktı! Hızlı tükeniyor, tedarik planlamasını öne alın.`
            });
          } else if (sonKullanimHizi < ort * 0.4 && u.mevcut_stok > u.min_stok * 3) {
            uyarilar.push({
              urun_adi: u.urun_adi,
              tip: "atik",
              mesaj: `Kullanım hızı ciddi oranda düştü. Stok fazlası/atıl malzeme riski oluşabilir, siparişleri bekletin.`
            });
          }
        }

        const kalanGun = tahminiBitisGunu(u);
        if (kalanGun !== null && kalanGun <= 3 && u.mevcut_stok > 0) {
          uyarilar.push({
            urun_adi: u.urun_adi,
            tip: "kritik",
            mesaj: `Mevcut tüketim hızıyla stoğun yaklaşık ${kalanGun} gün içinde sıfırlanacak! Acil sipariş geçilmeli.`
          });
        }
      }
    });

    return uyarilar.slice(0, 3);
  }, [urunler, hareketler, gunlukOrtalama, tahminiBitisGunu]);

  const filtreliUrunler = useMemo(() => {
    return urunler.filter(u => {
      if (arama && !u.urun_adi.toLowerCase().includes(arama.toLowerCase()) && !(u.kategori || "").toLowerCase().includes(arama.toLowerCase())) return false;
      if (filtreKategori && !(u.kategori || "").startsWith(filtreKategori)) return false;
      if (filtrePeriyot && (u.sayim_periyodu || "gunluk") !== filtrePeriyot) return false;
      if (sadeceKritik && u.mevcut_stok > u.min_stok) return false;
      return true;
    });
  }, [urunler, arama, filtreKategori, filtrePeriyot, sadeceKritik]);

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
    const kritik = urunler.filter(u => u.mevcut_stok <= u.min_stok && u.min_stok > 0).length;
    const tukenmis = urunler.filter(u => u.mevcut_stok <= 0).length;
    const toplam = urunler.length;
    return { kritik, tukenmis, toplam };
  }, [urunler]);

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
        const miktarNum = parseFloat(cokluStokMiktar);
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
      .filter(([_, v]) => v.trim() !== "" && !isNaN(parseFloat(v)))
      .map(([id, miktarStr]) => {
        const ozelNot = topluNotlar[id]?.trim() || "";
        return {
          urun_id: id, tarih: topluSayimTarih, tip: "sayim" as const, miktar: parseFloat(miktarStr),
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
      const minStokNum = parseFloat(yMinStok) || 0;
      const ilkStokNum = parseFloat(yIlkStok) || 0;

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
    const miktar = parseFloat(sayimMiktar);
    if (isNaN(miktar) || miktar < 0) { alert("Geçerli bir miktar girin"); return; }
    setSaving(true);
    try {
      const ekleyen = userEmail.split("@")[0] || "Bilinmiyor";
      const { error } = await supabase.from("stok_hareketler").insert([{
        urun_id: sayimUrun.id, tarih: sayimTarih, tip: "sayim",
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
    const miktar = parseFloat(girisMiktar);
    if (isNaN(miktar) || miktar <= 0) { alert("Geçerli bir miktar girin"); return; }
    setSaving(true);
    try {
      const ekleyen = userEmail.split("@")[0] || "Bilinmiyor";
      const fiyat = parseFloat(girisFiyat);
      const { error } = await supabase.from("stok_hareketler").insert([{
        urun_id: malGirisUrun.id, tarih: girisTarih, tip: "giris",
        miktar, kaynak: "manuel", kullanici: ekleyen,
        aciklama: "Mal Girişi Tanımlandı",
      }]);
      if (error) { alert("Hata: " + error.message); return; }
      if (!isNaN(fiyat) && fiyat > 0) {
        await supabase.from("stok_urunler").update({ son_fiyat: fiyat }).eq("id", malGirisUrun.id);
      }
      setMalGirisUrun(null); setGirisMiktar(""); setGirisFiyat(""); setGirisTarih(bugun());
      veriCek();
    } finally { setSaving(false); }
  };

  const chatGonder = () => {
    if (!chatGirdisi.trim()) return;
    const yeniKullaniciMesaj: ChatMesaj = { sender: "user", text: chatGirdisi.trim(), time: "Şimdi" };
    setChatGecmisi(prev => [...prev, yeniKullaniciMesaj]);
    const arananSöz = chatGirdisi.toLowerCase();
    setChatGirdisi("");

    setTimeout(() => {
      let aiYanit = "Malzeme hareketlerini ve periyodik mutfak tüketimlerini arka planda inceliyorum şef.";
      if (arananSöz.includes("stok") || arananSöz.includes("kritik")) {
        aiYanit = `Güncel duruma göre panoda ${stats.kritik} adet kritik seviyede, ${stats.tukenmis} adet tamamen tükenmiş malzeme bulunuyor şef.`;
      }
      setChatGecmisi(prev => [...prev, { sender: "ai", text: aiYanit, time: "Şimdi" }]);
    }, 600);
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
    <div className="h-screen bg-[#060810] flex flex-col items-center justify-center gap-3">
      <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"/>
      <span className="text-[10px] text-gray-600 uppercase tracking-[0.3em]">Mutfak Deposu Yükleniyor</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#060810] text-white font-sans antialiased pb-20">
      {/* HEADER */}
      <div className="sticky top-0 z-40 border-b border-[#0f1624] bg-[#060810]/95 backdrop-blur-xl">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-900/40">
              <Package className="h-4 w-4 text-white"/>
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-white leading-none">Stok Yönetimi</h1>
              <p className="text-[10px] text-gray-600 leading-none mt-0.5">{stats.toplam} malzeme · {stats.kritik} kritik</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setTopluSayimSekme("gunluk"); setTopluSayimAcik(true); }}
              className="flex items-center gap-1.5 text-[11px] font-bold text-white bg-blue-600/90 hover:bg-blue-600 border border-blue-500/30 px-3 py-2 rounded-xl transition-all shadow-lg shadow-blue-900/20">
              <ClipboardCheck size={13}/> Gelişmiş Toplu Sayım
            </button>
            <button 
              onClick={() => setSiraDuzenleModu(!siraDuzenleModu)}
              className={`flex items-center gap-1.5 text-[11px] font-semibold px-3 py-2 rounded-xl border transition-colors ${
                siraDuzenleModu ? "bg-purple-500/20 border-purple-500/40 text-purple-400" : "text-gray-500 hover:text-purple-400 border-[#1a2236]"
              }`}
            >
              <ListOrdered size={13}/> {siraDuzenleModu ? "Sıralamayı Kapat" : "Sıralama / Düzen Değiştir"}
            </button>
            <button onClick={veriCek} className="p-2 text-gray-600 hover:text-white border border-[#1a2236] rounded-xl">
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

        {/* AI PANEL */}
        <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-r from-blue-950/20 via-[#0c0f1a] to-[#0c0f1a] p-4">
          <div className="flex items-center gap-2 mb-3">
            <BrainCircuit className="h-4 w-4 text-blue-400 animate-pulse" />
            <h2 className="text-xs font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">Kebo AI Akıllı Analiz Motoru</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {aiAnalizleri.length === 0 ? (
              <div className="col-span-3 text-xs text-gray-600 py-1">Sistem malzeme hareket döngülerini inceliyor.</div>
            ) : aiAnalizleri.map((ai, index) => (
              <div key={index} className={`rounded-xl p-3 border text-xs flex flex-col justify-between ${
                ai.tip === "kritik" ? "bg-red-500/5 border-red-500/20 text-red-200" :
                ai.tip === "hizli" ? "bg-amber-500/5 border-amber-500/20 text-amber-200" : "bg-purple-500/5 border-purple-500/20 text-purple-200"
              }`}>
                <div className="font-bold mb-1 flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${ai.tip === "kritik" ? "bg-red-500" : "bg-amber-500"}`} />
                  {ai.urun_adi}
                </div>
                <p className="text-gray-400 text-[11px] leading-relaxed">{ai.mesaj}</p>
              </div>
            ))}
          </div>
        </div>

        {/* BULK SEÇİM BAR */}
        {seciliUrunIds.size > 0 && (
          <div className="rounded-2xl border border-amber-500/30 bg-[#0c0f1a] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <CheckSquare className="text-amber-400 h-4 w-4" />
              <span className="text-xs font-bold">{seciliUrunIds.size} malzeme topluca seçildi</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input type="number" placeholder="Çoklu Stok..." value={cokluStokMiktar} onChange={e => setCokluStokMiktar(e.target.value)}
                className="bg-[#060810] border border-[#1a2236] text-white text-xs h-9 px-3 rounded-xl outline-none w-28" />
              <input type="text" placeholder="Toplu Başlık..." value={cokluKategori} onChange={e => setCokluKategori(e.target.value)}
                className="bg-[#060810] border border-[#1a2236] text-white text-xs h-9 px-3 rounded-xl outline-none w-36" />
              <select value={cokluPeriyot} onChange={e => setCokluPeriyot(e.target.value)}
                className="bg-[#060810] border border-[#1a2236] text-white text-xs h-9 px-3 rounded-xl outline-none">
                <option value="">Toplu Döngü</option>
                {PERIYOTLAR.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
              </select>
              <button onClick={cokluGuncellemeKaydet} disabled={saving} className="bg-amber-600 hover:bg-amber-700 text-xs font-bold px-4 py-2 h-9 rounded-xl">Seçilenleri Güncelle</button>
            </div>
          </div>
        )}

        {/* FİLTRELER */}
        <div className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] p-4 flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600"/>
            <input type="text" placeholder="Malzeme adı veya başlık/alt başlık ara..." value={arama} onChange={e => setArama(e.target.value)}
              className="w-full bg-[#080b14] border border-[#1a2236] text-white text-sm h-9 pl-9 pr-3 rounded-xl outline-none"/>
          </div>
          <select value={filtreKategori} onChange={e => setFiltreKategori(e.target.value)} className="bg-[#080b14] border border-[#1a2236] text-white text-xs px-3 h-9 rounded-xl outline-none">
            <option value="">Tüm Ana Başlıklar</option>
            {dinamikKategoriler.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <select value={filtrePeriyot} onChange={e => setFiltrePeriyot(e.target.value)} className="bg-[#080b14] border border-[#1a2236] text-white text-xs px-3 h-9 rounded-xl outline-none">
            <option value="">Tüm Döngüler</option>
            {PERIYOTLAR.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
          </select>
          <button onClick={() => setSadeceKritik(!sadeceKritik)}
            className={`text-xs font-semibold px-4 py-2 rounded-xl border transition-colors flex items-center gap-1.5 ${
              sadeceKritik ? "bg-amber-500/15 border-amber-500/40 text-amber-400" : "bg-[#080b14] border-[#1a2236] text-gray-500"
            }`}>
            <AlertTriangle size={12}/> Sadece Kritik
          </button>
        </div>

        {/* HİERARŞİK GÖRÜNÜM */}
        <div className="space-y-6">
          {Object.keys(hiyerarsikUrunGruplari).length === 0 ? (
            <div className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] py-12 text-center text-gray-600 text-xs">Aranan kriterlerde malzeme bulunamadı.</div>
          ) : (
            Object.entries(hiyerarsikUrunGruplari).map(([anaBaslik, altGruplar]) => (
              <div key={anaBaslik} className="space-y-3">
                <div className="flex items-center gap-2 border-b border-gray-800 pb-1.5 px-1 mt-2">
                  <Layers size={14} className="text-emerald-400" />
                  <h2 className="text-sm font-black uppercase tracking-wider text-emerald-400">{anaBaslik}</h2>
                </div>

                {Object.entries(altGruplar).map(([altBaslik, liste]) => (
                  <div key={altBaslik} className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] overflow-hidden shadow-lg pl-1">
                    <div className="px-4 py-2 bg-[#060810]/40 border-b border-[#1a2236] flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400">
                        <Clock size={11} className="text-gray-600" />
                        <span>{altBaslik}</span>
                        <span className="text-[10px] text-gray-600 font-mono font-normal">({liste.length} malzeme)</span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-[#1a2236] bg-[#060810]/10 text-gray-600">
                            <th className="px-4 py-2 text-left w-10">
                              <button onClick={tumunuSecVeyaBirak} className="text-gray-600"><Square size={13} /></button>
                            </th>
                            {siraDuzenleModu && <th className="px-4 py-2 text-left w-24">Sıralama</th>}
                            <th className="px-4 py-2 text-left">Malzeme Adı</th>
                            <th className="px-4 py-2 text-left">Döngü</th>
                            <th className="px-4 py-2 text-left">Mevcut Stok</th>
                            <th className="px-4 py-2 text-left">Min. Stok</th>
                            <th className="px-4 py-2 text-left">Günlük Tüketim</th>
                            <th className="px-4 py-2 text-left">Kalan Gün</th>
                            <th className="px-4 py-2 text-right">İşlemler</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#0f1624]">
                          {liste.map(urun => {
                            const globalIndex = urunler.findIndex(u => u.id === urun.id);
                            const ort = gunlukOrtalama(urun.id);
                            const kalanGun = tahminiBitisGunu(urun);
                            const kritik = urun.mevcut_stok <= urun.min_stok && urun.min_stok > 0;
                            const tukenmis = urun.mevcut_stok <= 0;
                            const secili = seciliUrunIds.has(urun.id);

                            return (
                              <tr key={urun.id} className={`hover:bg-white/[0.01] transition-colors group ${tukenmis ? "bg-red-950/10" : kritik ? "bg-amber-950/10" : ""} ${secili ? "bg-amber-500/5" : ""}`}>
                                <td className="px-4 py-3">
                                  <button type="button" onClick={() => secimDegis(urun.id)} className="text-gray-600">
                                    {secili ? <CheckSquare size={13} className="text-amber-500" /> : <Square size={13} />}
                                  </button>
                                </td>

                                {siraDuzenleModu && (
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-1 text-gray-500">
                                      <button type="button" onClick={() => elemanYeriDegistir(globalIndex, "yukari")} disabled={globalIndex === 0}
                                        className="p-1 hover:text-purple-400 bg-white/5 rounded disabled:opacity-20" title="Yukarı Taşı">
                                        <ArrowUp size={11} />
                                      </button>
                                      <button type="button" onClick={() => elemanYeriDegistir(globalIndex, "asagi")} disabled={globalIndex === urunler.length - 1}
                                        className="p-1 hover:text-purple-400 bg-white/5 rounded disabled:opacity-20" title="Aşağı Taşı">
                                        <ArrowDown size={11} />
                                      </button>
                                    </div>
                                  </td>
                                )}

                                <td className="px-4 py-3 font-semibold text-gray-200">
                                  <Link href={`/stok/${urun.id}`} className="hover:text-blue-400 transition-colors">{urun.urun_adi}</Link>
                                </td>
                                <td className="px-4 py-3 text-gray-400 capitalize">{urun.sayim_periyodu || "gunluk"}</td>
                                <td className={`px-4 py-3 font-black ${tukenmis ? "text-red-400" : kritik ? "text-amber-400" : "text-white"}`}>
                                  {fmt(urun.mevcut_stok)} <span className="text-[10px] text-gray-600 font-normal">{urun.birim}</span>
                                </td>
                                <td className="px-4 py-3 text-gray-500">{urun.min_stok > 0 ? `${fmt(urun.min_stok)} ${urun.birim}` : "—"}</td>
                                <td className="px-4 py-3 text-purple-400 font-semibold">{ort > 0 ? `${fmt(ort, 2)} ${urun.birim}` : "—"}</td>
                                <td className="px-4 py-3">
                                  {kalanGun !== null ? <span className={`font-semibold ${kalanGun <= 3 ? "text-red-400" : "text-emerald-400"}`}>~{kalanGun} gün</span> : <span className="text-gray-700">—</span>}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => setSayimUrun(urun)} className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded-lg"><ClipboardCheck size={12}/></button>
                                    <button onClick={() => setMalGirisUrun(urun)} className="p-1.5 text-amber-400 hover:bg-amber-500/10 rounded-lg"><Truck size={12}/></button>
                                    <button onClick={() => setDuzenleUrun(urun)} className="p-1.5 text-gray-400 hover:bg-white/5 rounded-lg"><Edit3 size={12}/></button>
                                    {isAdmin && <button onClick={() => urunSil(urun)} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg"><Trash2 size={12}/></button>}
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
          <div className="bg-[#0c0f1a] border border-blue-500/30 rounded-2xl w-full max-w-3xl shadow-2xl max-h-[85vh] flex flex-col">
            <div className="px-5 py-4 border-b border-[#1a2236] flex items-center justify-between bg-[#080b14] rounded-t-2xl">
              <div className="flex items-center gap-2">
                <ClipboardCheck size={16} className="text-blue-400"/>
                <h3 className="text-sm font-black text-white">Gelişmiş Çoklu Stok Sayım Listesi</h3>
              </div>
              <button onClick={() => { setTopluSayimAcik(false); setTopluMiktarlar({}); setTopluNotlar({}); }} className="p-1 text-gray-600 hover:text-white"><X size={16}/></button>
            </div>

            <div className="p-4 bg-[#0e1322] border-b border-[#1a2236] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span className="text-xs text-gray-400 flex items-center gap-1"><Calendar size={13}/> Giriş Yapılacak Sayım Günü Tarihi:</span>
                <input type="date" value={topluSayimTarih} onChange={e => setTopluSayimTarih(e.target.value)}
                  className="bg-[#060810] border border-[#1a2236] text-white text-xs font-bold h-9 px-3 rounded-xl outline-none" />
              </div>
              
              <div className="grid grid-cols-4 gap-1 bg-[#060810] p-1 rounded-xl border border-[#1a2236]">
                {[
                  { id: "gunluk", l: "⏱ Günlük Liste" },
                  { id: "haftalik", l: "📅 Haftalık Liste" },
                  { id: "aylik", l: "🗓 Aylık Liste" },
                  { id: "all", l: "📦 Tüm Liste" }
                ].map(tab => (
                  <button key={tab.id} type="button" onClick={() => setTopluSayimSekme(tab.id as any)}
                    className={`py-2 text-[11px] font-bold rounded-lg transition-all text-center ${topluSayimSekme === tab.id ? "bg-blue-600 text-white shadow" : "text-gray-50 hover:text-white"}`}>
                    {tab.l}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#060810]/50">
              {topluSayimSekmeFiltreliUrunler.length === 0 ? (
                <div className="text-center text-gray-600 text-xs py-8">Bu sayım periyoduna ait malzeme bulunmuyor.</div>
              ) : topluSayimSekmeFiltreliUrunler.map(urun => {
                const mukerrer = tarihteSayimVarMi(urun.id, topluSayimTarih);
                return (
                  <div key={urun.id} className={`flex flex-col sm:flex-row sm:items-center gap-3 bg-[#080b14] border rounded-xl px-4 py-2 transition-colors ${mukerrer ? "border-amber-500/30 bg-amber-500/[0.01]" : "border-[#1a2236]"}`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-white">{urun.urun_adi}</p>
                        <span className="text-[9px] text-gray-600 font-mono italic">({urun.kategori || "Kategorisiz"})</span>
                      </div>
                      <p className="text-[10px] text-gray-600 mt-0.5">Sistem Stoğu: <span className="text-gray-400 font-bold">{fmt(urun.mevcut_stok)} {urun.birim}</span></p>
                    </div>

                    {mukerrer && (
                      <div className="text-[9px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded flex items-center gap-0.5 shrink-0">
                        <AlertTriangle size={10}/> Bugün zaten sayılmış!
                      </div>
                    )}

                    <div className="flex items-center gap-2 shrink-0">
                      <input type="text" placeholder="Sayım notu..." value={topluNotlar[urun.id] || ""}
                        onChange={e => {
                          const val = e.target.value;
                          setTopluNotlar(prev => ({ ...prev, [urun.id]: val }));
                        }}
                        className="bg-[#0c0f1a] border border-[#1a2236] text-gray-300 text-[11px] h-8 px-2 w-36 rounded-lg outline-none" />
                      <input type="number" step="0.01" value={topluMiktarlar[urun.id] || ""}
                        onChange={e => {
                          const val = e.target.value;
                          setTopluMiktarlar(prev => ({ ...prev, [urun.id]: val }));
                        }}
                        placeholder={`0 ${urun.birim}`}
                        className="w-24 bg-[#0c0f1a] border border-[#1a2236] text-white text-xs font-black h-8 px-2 rounded-lg text-right outline-none focus:border-blue-500/50" />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-5 py-4 border-t border-[#1a2236] flex justify-end gap-2 bg-[#080b14] rounded-b-2xl">
              <button onClick={() => { setTopluSayimAcik(false); setTopluMiktarlar({}); setTopluNotlar({}); }} className="text-xs font-semibold text-gray-500 border border-[#1a2236] px-4 py-2 rounded-xl">Kapat</button>
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
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-5 py-4 border-b border-[#1a2236] flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">{duzenleUrun ? "Malzeme Düzenle" : "Yeni Malzeme Tanımla"}</h3>
              <button onClick={yeniUrunReset} className="p-1 text-gray-600 hover:text-white"><X size={16}/></button>
            </div>
            <form onSubmit={yeniUrunKaydet} className="p-5 space-y-3">
              <div>
                <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Malzeme Adı *</label>
                <input type="text" value={yUrunAdi} onChange={e => setYUrunAdi(e.target.value)} required
                  className="w-full bg-[#080b14] border border-[#1a2236] text-white text-sm h-9 px-3 rounded-xl outline-none"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Başlık (Örn: Soğuk Hava / A Firması)</label>
                  <input type="text" placeholder="Grup / Alt Grup" value={yKategori} onChange={e => setYKategori(e.target.value)}
                    className="w-full bg-[#080b14] border border-[#1a2236] text-white text-xs h-9 px-3 rounded-xl outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Birim</label>
                  <select value={yBirim} onChange={e => setYBirim(e.target.value)}
                    className="w-full bg-[#080b14] border border-[#1a2236] text-white text-sm h-9 px-3 rounded-xl outline-none">
                    {BIRIMLER.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Sayım Periyodu</label>
                  <select value={yPeriyot} onChange={e => setYPeriyot(e.target.value)}
                    className="w-full bg-[#080b14] border border-[#1a2236] text-white text-sm h-9 px-3 rounded-xl outline-none">
                    <option value="gunluk">Günlük Sayım</option>
                    <option value="haftalik">Haftalık Sayım</option>
                    <option value="aylik">Aylık Sayım</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Min. Stok</label>
                  <input type="number" step="0.01" value={yMinStok} onChange={e => setYMinStok(e.target.value)}
                    className="w-full bg-[#080b14] border border-[#1a2236] text-white text-sm h-9 px-3 rounded-xl outline-none"/>
                </div>
              </div>
              {!duzenleUrun && (
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Başlangıç Eldeki Stok</label>
                  <input type="number" step="0.01" value={yIlkStok} onChange={e => setYIlkStok(e.target.value)}
                    className="w-full bg-[#080b14] border border-[#1a2236] text-white text-sm h-9 px-3 rounded-xl outline-none"/>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={yeniUrunReset} className="text-xs font-semibold text-gray-500 border border-[#1a2236] px-4 py-2 rounded-xl">İptal</button>
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
          <div className="bg-[#0c0f1a] border border-blue-500/20 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="px-5 py-4 border-b border-[#1a2236] flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Münferit Sayım Gir</h3>
              <button onClick={() => setSayimUrun(null)} className="p-1 text-gray-600 hover:text-white"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Sayım Günü Tarihi</label>
                <input type="date" value={sayimTarih} onChange={e => setSayimTarih(e.target.value)}
                  className="w-full bg-[#080b14] border border-[#1a2236] text-white text-sm h-9 px-3 rounded-xl outline-none"/>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Miktar ({sayimUrun.birim})</label>
                <input type="number" step="0.01" value={sayimMiktar} onChange={e => setSayimMiktar(e.target.value)} autoFocus
                  className="w-full bg-[#080b14] border border-[#1a2236] text-white text-base h-10 px-3 rounded-xl outline-none"/>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Açıklama / Özel Not</label>
                <input type="text" value={sayimNot} onChange={e => setSayimNot(e.target.value)}
                  className="w-full bg-[#080b14] border border-[#1a2236] text-white text-xs h-8 px-3 rounded-xl outline-none"/>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setSayimUrun(null)} className="text-xs font-semibold text-gray-500 border border-[#1a2236] px-4 py-2 rounded-xl">Vazgeç</button>
                <button onClick={sayimKaydet} disabled={saving || !sayimMiktar} className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-xl">Listeye İşle</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MAL GİRİŞ MODAL */}
      {malGirisUrun && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0f1a] border border-amber-500/20 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="px-5 py-4 border-b border-[#1a2236] flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Mal Kabul Girişi</h3>
              <button onClick={() => setMalGirisUrun(null)} className="p-1 text-gray-600 hover:text-white"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Kabul Tarihi</label>
                <input type="date" value={girisTarih} onChange={e => setGirisTarih(e.target.value)}
                  className="w-full bg-[#080b14] border border-[#1a2236] text-white text-sm h-9 px-3 rounded-xl outline-none"/>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Gelen Fatura Miktarı ({malGirisUrun.birim})</label>
                <input type="number" step="0.01" value={girisMiktar} onChange={e => setGirisMiktar(e.target.value)} autoFocus
                  className="w-full bg-[#080b14] border border-[#1a2236] text-white text-base h-10 px-3 rounded-xl outline-none"/>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase font-medium mb-1">Birim Alış Fiyatı (₺)</label>
                <input type="number" step="0.01" value={girisFiyat} onChange={e => setGirisFiyat(e.target.value)}
                  className="w-full bg-[#080b14] border border-[#1a2236] text-white text-base h-10 px-3 rounded-xl outline-none"/>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setMalGirisUrun(null)} className="text-xs font-semibold text-gray-500 border border-[#1a2236] px-4 py-2 rounded-xl">İptal</button>
                <button onClick={malGirisKaydet} disabled={saving || !girisMiktar} className="text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-6 py-2 rounded-xl">Depoya Ekle</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CHATBOT ASİSTANI */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end">
        {chatAcik && (
          <div className="w-80 sm:w-96 h-[400px] border border-blue-500/30 bg-[#0c0f1a]/95 backdrop-blur-xl rounded-2xl shadow-2xl flex flex-col mb-3">
            <div className="px-4 py-3 bg-[#080b14] border-b border-[#1a2236] rounded-t-2xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot size={16} className="text-blue-400 animate-pulse" />
                <span className="text-xs font-black text-white">KEBO AI STOK ASİSTANI</span>
              </div>
              <button onClick={() => setChatAcik(false)} className="text-gray-500 hover:text-white"><X size={14} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
              {chatGecmisi.map((m, idx) => (
                <div key={idx} className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 leading-relaxed ${m.sender === "user" ? "bg-blue-600 text-white rounded-br-none" : "bg-[#161d30] text-gray-200 rounded-bl-none"}`}>
                    {m.text}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-2 border-t border-[#1a2236] bg-[#080b14] rounded-b-2xl flex items-center gap-2">
              <input type="text" placeholder="AI'a danış (örn: kritik durumlar)..." value={chatGirdisi}
                onChange={e => setChatGirdisi(e.target.value)}
                onKeyDown={e => e.key === "Enter" && chatGonder()}
                className="flex-1 bg-[#060810] border border-[#1a2236] text-white text-xs h-8 px-3 rounded-lg outline-none" />
              <button onClick={chatGonder} className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                <Send size={12} />
              </button>
            </div>
          </div>
        )}

        <button onClick={() => setChatAcik(!chatAcik)} className="w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-xl transition-transform active:scale-95">
          {chatAcik ? <X size={20} /> : <MessageSquare size={20} />}
        </button>
      </div>

    </div>
  );
}
