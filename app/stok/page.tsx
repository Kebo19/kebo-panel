"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import {
  Package, PlusCircle, Search, AlertTriangle, TrendingDown,
  Truck, ClipboardCheck, Loader2, X, Save, Edit3, Trash2,
  RefreshCw, Layers, Box, Clock, BrainCircuit, CheckSquare, Square,
  SlidersHorizontal, ArrowUpDown, ChevronDown, ChevronUp, Check, ListOrdered
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
  sira_no?: number; // Özelleştirilebilir sıra numarası
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

interface Kategori {
  id: string;
  ad: string;
  renk: string;
  sira: number;
}

const fmt = (v: number, decimals = 1): string =>
  new Intl.NumberFormat("tr-TR", { maximumFractionDigits: decimals, minimumFractionDigits: 0 }).format(v);
const bugun = () => new Date().toISOString().split("T")[0];

const BIRIMLER = ["kg", "gr", "lt", "ml", "adet", "koli", "paket", "düzine", "torba", "kova", "şişe"];
const PERIYOTLAR = [
  { v: "gunluk", l: "Günlük Sayım" },
  { v: "haftalik", l: "Haftalık Sayım" },
  { v: "aylik", l: "Aylık Sayım" }
];

export default function StokPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [urunler, setUrunler] = useState<Urun[]>([]);
  const [hareketler, setHareketler] = useState<Hareket[]>([]);
  const [kategoriler, setKategoriler] = useState<Kategori[]>([]);

  const [arama, setArama] = useState("");
  const [filtreKategori, setFiltreKategori] = useState("");
  const [filtrePeriyot, setFiltrePeriyot] = useState("");
  const [sadeceKritik, setSadeceKritik] = useState(false);

  // Form ve Modal State'leri
  const [yeniUrunAcik, setYeniUrunAcik] = useState(false);
  const [duzenleUrun, setDuzenleUrun] = useState<Urun | null>(null);
  const [sayimUrun, setSayimUrun] = useState<Urun | null>(null);
  const [malGirisUrun, setMalGirisUrun] = useState<Urun | null>(null);
  const [topluSayimAcik, setTopluSayimAcik] = useState(false);
  const [topluMalGirisAcik, setTopluMalGirisAcik] = useState(false);

  const [yUrunAdi, setYUrunAdi] = useState("");
  const [yKategori, setYKategori] = useState("");
  const [yBirim, setYBirim] = useState("kg");
  const [yMinStok, setYMinStok] = useState("");
  const [yIlkStok, setYIlkStok] = useState("");
  const [yPeriyot, setYPeriyot] = useState("gunluk");
  const [ySiraNo, setYSiraNo] = useState("0");
  const [yNotlar, setYNotlar] = useState("");
  const [saving, setSaving] = useState(false);

  // Dinamik Kategori Alanları
  const [digerKategoriModu, setDigerKategoriModu] = useState(false);
  const [yeniKategoriAdi, setYeniKategoriAdi] = useState("");

  // Çoklu Seçim (Bulk Edit) State'leri
  const [seciliUrunIds, setSeciliUrunIds] = useState<Set<string>>(new Set());
  const [cokluDuzenleAcik, setCokluDuzenleAcik] = useState(false);
  const [cokluStokMiktar, setCokluStokMiktar] = useState("");
  const [cokluKategori, setCokluKategori] = useState("");
  const [cokluPeriyot, setCokluPeriyot] = useState("");

  // Sıra No Düzenleme Modu State'leri
  const [siraDuzenleModu, setSiraDuzenleModu] = useState(false);
  const [geciciSiralar, setGeciciSiralar] = useState<Record<string, number>>({});

  const [sayimMiktar, setSayimMiktar] = useState("");
  const [sayimTarih, setSayimTarih] = useState(bugun());
  const [sayimNot, setSayimNot] = useState("");

  const [girisMiktar, setGirisMiktar] = useState("");
  const [girisTarih, setGirisTarih] = useState(bugun());
  const [girisFiyat, setGirisFiyat] = useState("");
  const [girisNot, setGirisNot] = useState("");

  const [topluVeriler, setTopluVeriler] = useState<Record<string, string>>({});
  const [topluTarih, setTopluTarih] = useState(bugun());

  const veriCek = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const mail = user?.email || "";
    setUserEmail(mail);
    setIsAdmin(mail === "murat@kebo.com" || mail === "bulent@kebo.com");

    const [urunRes, kategoriRes, hareketRes] = await Promise.all([
      supabase.from("stok_urunler").select("*").eq("durum", "aktif"),
      supabase.from("stok_kategoriler").select("*").order("sira"),
      supabase.from("stok_hareketler").select("*").order("tarih", { ascending: false }).limit(600),
    ]);

    if (urunRes.data) {
      // Ürünleri öncelikle kullanıcı tanımlı sıra_no değerine, yoksa isme göre sıralayalım
      const siraliUrunler = (urunRes.data as Urun[]).sort((a, b) => {
        const sA = a.sira_no ?? 999;
        const sB = b.sira_no ?? 999;
        if (sA !== sB) return sA - sB;
        return a.urun_adi.localeCompare(b.urun_adi);
      });
      setUrunler(siraliUrunler);
      
      // Sıra düzenleme için geçici state'i doldur
      const siraMap: Record<string, number> = {};
      siraliUrunler.forEach(u => { siraMap[u.id] = u.sira_no ?? 0; });
      setGeciciSiralar(siraMap);
    }
    if (kategoriRes.data) setKategoriler(kategoriRes.data as Kategori[]);
    if (hareketRes.data) setHareketler(hareketRes.data as Hareket[]);
    setSeciliUrunIds(new Set());
    setLoading(false);
  }, []);

  useEffect(() => { veriCek(); }, [veriCek]);

  const gunlukOrtalama = useCallback((urunId: string): number => {
    const uHareket = hareketler.filter(h => h.urun_id === urunId && h.tip === "sayim")
      .sort((a, b) => a.tarih.localeCompare(b.tarih));
    if (uHareket.length < 2) return 0;
    const son = uHareket[uHareket.length - 1];
    const onceki = uHareket[uHareket.length - 2];
    const aradaGelen = hareketler
      .filter(h => h.urun_id === urunId && h.tip === "giris" && h.tarih > onceki.tarih && h.tarih <= son.tarih)
      .reduce((s, h) => s + h.miktar, 0);
    const gunSayisi = Math.max(
      (new Date(son.tarih).getTime() - new Date(onceki.tarih).getTime()) / (1000 * 60 * 60 * 24),
      1
    );
    const kullanim = (onceki.miktar + aradaGelen) - son.miktar;
    return kullanim > 0 ? kullanim / gunSayisi : 0;
  }, [hareketler]);

  const tahminiBitisGunu = useCallback((urun: Urun): number | null => {
    const ort = gunlukOrtalama(urun.id);
    if (ort <= 0 || urun.mevcut_stok <= 0) return null;
    return Math.floor(urun.mevcut_stok / ort);
  }, [gunlukOrtalama]);

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
      if (arama && !u.urun_adi.toLowerCase().includes(arama.toLowerCase())) return false;
      if (filtreKategori && u.kategori !== filtreKategori) return false;
      if (filtrePeriyot && (u.sayim_periyodu || "gunluk") !== filtrePeriyot) return false;
      if (sadeceKritik && u.mevcut_stok > u.min_stok) return false;
      return true;
    });
  }, [urunler, arama, filtreKategori, filtrePeriyot, sadeceKritik]);

  // Ürünleri Alt Başlıklarına (Kategorilerine) Göre Gruplandıralım
  const gruplanmisUrunler = useMemo(() => {
    const gruplar: Record<string, Urun[]> = {};
    filtreliUrunler.forEach(u => {
      const kat = u.kategori || "Diğer / Başlıksız";
      if (!gruplar[kat]) gruplar[kat] = [];
      gruplar[kat].push(u);
    });
    return gruplar;
  }, [filtreliUrunler]);

  const stats = useMemo(() => {
    const kritik = urunler.filter(u => u.mevcut_stok <= u.min_stok && u.min_stok > 0).length;
    const tukenmis = urunler.filter(u => u.mevcut_stok <= 0).length;
    const toplam = urunler.length;
    return { kritik, tukenmis, toplam };
  }, [urunler]);

  // Çoklu Seçim Yönetimi
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

  // Toplu Güncelleme / Çoklu Stok Girişi Fonksiyonu
  const cokluGuncellemeKaydet = async () => {
    if (seciliUrunIds.size === 0) return;
    setSaving(true);
    try {
      const ekleyen = userEmail.split("@")[0] || "Bilinmiyor";
      const idsArray = Array.from(seciliUrunIds);

      // 1. Eğer toplu stok girişi yapıldıysa hareket tablosuna ekleme yapalım
      if (cokluStokMiktar.trim() !== "") {
        const miktarNum = parseFloat(cokluStokMiktar);
        if (!isNaN(miktarNum) && miktarNum >= 0) {
          const kayitlar = idsArray.map(id => ({
            urun_id: id,
            tarih: bugun(),
            tip: "sayim" as const,
            miktar: miktarNum,
            kaynak: "manuel",
            kullanici: ekleyen,
            aciklama: "Toplu Çoklu Stok Girişi"
          }));
          await supabase.from("stok_hareketler").insert(kayitlar);
        }
      }

      // 2. Kategori ve Periyot güncellemelerini hazırlayalım
      const guncellemeObj: Record<string, any> = {};
      if (cokluKategori) guncellemeObj.kategori = cokluKategori;
      if (cokluPeriyot) guncellemeObj.sayim_periyodu = cokluPeriyot;

      if (Object.keys(guncellemeObj).length > 0) {
        await Promise.all(
          idsArray.map(id =>
            supabase.from("stok_urunler").update(guncellemeObj).eq("id", id)
          )
        );
      }

      setCokluDuzenleAcik(false);
      setCokluStokMiktar("");
      setCokluKategori("");
      setCokluPeriyot("");
      setSeciliUrunIds(new Set());
      veriCek();
      alert("Seçili ürünler başarıyla topluca güncellendi!");
    } catch (err: any) {
      alert("Toplu güncelleme hatası: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Kafaya Göre Sıralamayı Veritabanına Kaydetme
  const topluSiraKaydet = async () => {
    setSaving(true);
    try {
      await Promise.all(
        Object.entries(geciciSiralar).map(([id, sira]) =>
          supabase.from("stok_urunler").update({ sira_no: sira }).eq("id", id)
        )
      );
      setSiraDuzenleModu(false);
      veriCek();
    } catch (err: any) {
      alert("Sıralama kaydedilemedi: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const yeniUrunReset = () => {
    setYUrunAdi(""); setYKategori(""); setYBirim("kg");
    setYMinStok(""); setYIlkStok(""); setYPeriyot("gunluk"); setYSiraNo("0"); setYNotlar("");
    setDigerKategoriModu(false); setYeniKategoriAdi("");
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
      const siraNum = parseInt(ySiraNo) || 0;
      let nihaiKategori = yKategori;

      if (digerKategoriModu && yeniKategoriAdi.trim()) {
        const katAd = yeniKategoriAdi.trim();
        const mevcutKat = kategoriler.find(k => k.ad.toLowerCase() === katAd.toLowerCase());
        
        if (mevcutKat) {
          nihaiKategori = mevcutKat.ad;
        } else {
          const renkler = ["#10B981", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4"];
          const rasgeleRenk = renkler[Math.floor(Math.random() * renkler.length)];
          const { data: yeniKatData, error: katErr } = await supabase
            .from("stok_kategoriler")
            .insert([{ ad: katAd, renk: rasgeleRenk, sira: kategoriler.length + 1 }])
            .select()
            .single();

          if (!katErr && yeniKatData) {
            nihaiKategori = yeniKatData.ad;
          }
        }
      }

      if (duzenleUrun) {
        const { error } = await supabase.from("stok_urunler").update({
          urun_adi: yUrunAdi.trim(),
          kategori: nihaiKategori || null,
          birim: yBirim,
          min_stok: minStokNum,
          sayim_periyodu: yPeriyot,
          sira_no: siraNum,
          notlar: yNotlar.trim() || null,
        }).eq("id", duzenleUrun.id);
        if (error) { alert("Hata: " + error.message); return; }
      } else {
        const { data: yeni, error } = await supabase.from("stok_urunler").insert([{
          urun_adi: yUrunAdi.trim(),
          kategori: nihaiKategori || null,
          birim: yBirim,
          min_stok: minStokNum,
          sayim_periyodu: yPeriyot,
          sira_no: siraNum,
          notlar: yNotlar.trim() || null,
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
    if (!confirm(`"${urun.urun_adi}" silinsin mi? Tüm hareketler de silinir.`)) return;
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
        aciklama: girisNot.trim() || `${malGirisUrun.urun_adi} mal girişi`,
      }]);
      if (error) { alert("Hata: " + error.message); return; }
      if (!isNaN(fiyat) && fiyat > 0) {
        await supabase.from("stok_urunler").update({ son_fiyat: fiyat }).eq("id", malGirisUrun.id);
      }
      setMalGirisUrun(null); setGirisMiktar(""); setGirisFiyat(""); setGirisNot(""); setGirisTarih(bugun());
      veriCek();
    } finally { setSaving(false); }
  };

  const topluSayimKaydet = async () => {
    const ekleyen = userEmail.split("@")[0] || "Bilinmiyor";
    const kayitlar = Object.entries(topluVeriler)
      .filter(([_, v]) => v.trim() !== "" && !isNaN(parseFloat(v)))
      .map(([id, v]) => ({
        urun_id: id, tarih: topluTarih, tip: "sayim" as const,
        miktar: parseFloat(v), kaynak: "manuel", kullanici: ekleyen,
        aciklama: "Toplu sayım",
      }));
    if (kayitlar.length === 0) { alert("En az bir ürüne miktar girin"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("stok_hareketler").insert(kayitlar);
      if (error) { alert("Hata: " + error.message); return; }
      setTopluSayimAcik(false); setTopluVeriler({}); setTopluTarih(bugun());
      veriCek();
    } finally { setSaving(false); }
  };

  const topluMalGirisKaydet = async () => {
    const ekleyen = userEmail.split("@")[0] || "Bilinmiyor";
    const kayitlar = Object.entries(topluVeriler)
      .filter(([_, v]) => v.trim() !== "" && !isNaN(parseFloat(v)) && parseFloat(v) > 0)
      .map(([id, v]) => ({
        urun_id: id, tarih: topluTarih, tip: "giris" as const,
        miktar: parseFloat(v), kaynak: "manuel", kullanici: ekleyen,
        aciklama: "Toplu mal girişi",
      }));
    if (kayitlar.length === 0) { alert("En az bir ürüne miktar girin"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("stok_hareketler").insert(kayitlar);
      if (error) { alert("Hata: " + error.message); return; }
      setTopluMalGirisAcik(false); setTopluVeriler({}); setTopluTarih(bugun());
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
      setYSiraNo((duzenleUrun.sira_no || 0).toString());
      setYNotlar(duzenleUrun.notlar || "");
      setDigerKategoriModu(false);
      setYeniKategoriAdi("");
      setYeniUrunAcik(true);
    }
  }, [duzenleUrun]);

  if (loading) return (
    <div className="h-screen bg-[#060810] flex flex-col items-center justify-center gap-3">
      <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"/>
      <span className="text-[10px] text-gray-600 uppercase tracking-[0.3em]">Stok Yükleniyor</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#060810] text-white font-sans antialiased">
      {/* HEADER */}
      <div className="sticky top-0 z-40 border-b border-[#0f1624] bg-[#060810]/95 backdrop-blur-xl">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-900/40">
              <Package className="h-4 w-4 text-white"/>
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-white leading-none">Stok Yönetimi</h1>
              <p className="text-[10px] text-gray-600 leading-none mt-0.5">{stats.toplam} ürün · {stats.kritik} kritik</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setTopluMalGirisAcik(true)}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-amber-400 border border-[#1a2236] hover:border-amber-500/30 px-3 py-2 rounded-xl transition-colors">
              <Truck size={13}/> Mal Geldi
            </button>
            <button onClick={() => setTopluSayimAcik(true)}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-blue-400 border border-[#1a2236] hover:border-blue-500/30 px-3 py-2 rounded-xl transition-colors">
              <ClipboardCheck size={13}/> Toplu Sayım
            </button>
            <button 
              onClick={() => setSiraDuzenleModu(!siraDuzenleModu)}
              className={`flex items-center gap-1.5 text-[11px] font-semibold px-3 py-2 rounded-xl border transition-colors ${
                siraDuzenleModu ? "bg-purple-500/10 border-purple-500/40 text-purple-400" : "text-gray-500 hover:text-purple-400 border-[#1a2236]"
              }`}
            >
              <ListOrdered size={13}/> {siraDuzenleModu ? "Sıralamayı Bitir" : "Sıralama Düzenle"}
            </button>
            <button onClick={veriCek} className="p-2 text-gray-600 hover:text-white border border-[#1a2236] rounded-xl">
              <RefreshCw size={14}/>
            </button>
            <button onClick={() => { setDuzenleUrun(null); setYeniUrunAcik(true); }}
              className="flex items-center gap-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-xl transition-colors shadow-lg shadow-emerald-900/30">
              <PlusCircle size={14}/> Yeni Ürün
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* AI PANEL */}
        <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-r from-blue-950/20 via-[#0c0f1a] to-[#0c0f1a] p-4">
          <div className="flex items-center gap-2 mb-3">
            <BrainCircuit className="h-4 w-4 text-blue-400 animate-pulse" />
            <h2 className="text-xs font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
              Kebo AI Stok Analiz Motoru <span className="text-[9px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded-md font-mono font-normal">Kendi Kendini Geliştiren Algoritma v1.0</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {aiAnalizleri.length === 0 ? (
              <div className="col-span-3 text-xs text-gray-600 py-2">
                Sistem malzeme tüketim trendlerini öğreniyor. Yeterli analiz verisi toplandığında akıllı uyarılar burada listelenecektir.
              </div>
            ) : aiAnalizleri.map((ai, index) => (
              <div key={index} className={`rounded-xl p-3 border text-xs flex flex-col justify-between ${
                ai.tip === "kritik" ? "bg-red-500/5 border-red-500/20 text-red-200" :
                ai.tip === "hizli" ? "bg-amber-500/5 border-amber-500/20 text-amber-200" :
                "bg-purple-500/5 border-purple-500/20 text-purple-200"
              }`}>
                <div className="font-bold flex items-center gap-1.5 mb-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${ai.tip === "kritik" ? "bg-red-500" : ai.tip === "hizli" ? "bg-amber-500" : "bg-purple-500"}`} />
                  {ai.urun_adi}
                </div>
                <p className="text-gray-400 leading-relaxed text-[11px]">{ai.mesaj}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ─── ÇOKLU SEÇİM / TOPLU GÜNCELLEME ALANI (NEW COMPONENT) ─── */}
        {seciliUrunIds.size > 0 && (
          <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-950/20 to-[#0c0f1a] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fadeIn">
            <div className="flex items-center gap-3">
              <CheckSquare className="text-amber-400 h-5 w-5 shrink-0" />
              <div>
                <p className="text-xs font-bold text-white">{seciliUrunIds.size} Ürün Seçildi</p>
                <p className="text-[10px] text-gray-500">Seçili tüm ürünlerin stoklarını, kategorilerini veya sayım döngülerini aynı anda değiştirebilirsin.</p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <input 
                type="number" 
                placeholder="Çoklu Stok Girişi..." 
                value={cokluStokMiktar} 
                onChange={e => setCokluStokMiktar(e.target.value)}
                className="bg-[#080b14] border border-[#1a2236] text-white text-xs h-9 px-3 rounded-xl outline-none w-36"
              />
              <select 
                value={cokluKategori} 
                onChange={e => setCokluKategori(e.target.value)}
                className="bg-[#080b14] border border-[#1a2236] text-white text-xs h-9 px-3 rounded-xl outline-none w-36"
              >
                <option value="">Toplu Kategori Değiştir</option>
                {kategoriler.map(k => <option key={k.id} value={k.ad}>{k.ad}</option>)}
              </select>
              <select 
                value={cokluPeriyot} 
                onChange={e => setCokluPeriyot(e.target.value)}
                className="bg-[#080b14] border border-[#1a2236] text-white text-xs h-9 px-3 rounded-xl outline-none w-36"
              >
                <option value="">Toplu Döngü Değiştir</option>
                {PERIYOTLAR.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
              </select>
              <button 
                onClick={cokluGuncellemeKaydet}
                disabled={saving || (!cokluStokMiktar && !cokluKategori && !cokluPeriyot)}
                className="bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-xs font-bold px-4 py-2 h-9 rounded-xl transition-colors flex items-center gap-1.5 shadow-lg shadow-amber-900/20"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Değişiklikleri Uygula
              </button>
            </div>
          </div>
        )}

        {/* ─── MANUEL SIRALAMA DEĞİŞTİRME BUTONU PANELİ ─── */}
        {siraDuzenleModu && (
          <div className="rounded-2xl border border-purple-500/30 bg-purple-950/10 p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="text-purple-400 h-4 w-4" />
              <p className="text-xs text-purple-300">Ürünlerin yanlarındaki kutulardan liste sıra numaralarını değiştir ve kaydet.</p>
            </div>
            <button 
              onClick={topluSiraKaydet}
              disabled={saving}
              className="bg-purple-600 hover:bg-purple-700 text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 transition-colors"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Yeni Sıralamayı Kaydet
            </button>
          </div>
        )}

        {/* FİLTRELER */}
        <div className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] p-4 flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600"/>
            <input type="text" placeholder="Ürün ara..." value={arama} onChange={e => setArama(e.target.value)}
              className="w-full bg-[#080b14] border border-[#1a2236] focus:border-blue-500/40 text-white text-sm h-9 pl-9 pr-3 rounded-xl outline-none"/>
          </div>
          
          <div className="flex items-center gap-1 bg-[#080b14] border border-[#1a2236] rounded-xl px-2">
            <Clock size={12} className="text-gray-500" />
            <select value={filtrePeriyot} onChange={e => setFiltrePeriyot(e.target.value)}
              className="bg-transparent text-xs text-white h-9 outline-none border-0 cursor-pointer min-w-[120px]">
              <option value="" className="bg-[#0c0f1a]">Tüm Sayım Grupları</option>
              {PERIYOTLAR.map(p => <option key={p.v} value={p.v} className="bg-[#0c0f1a]">{p.l}</option>)}
            </select>
          </div>

          <select value={filtreKategori} onChange={e => setFiltreKategori(e.target.value)}
            className="bg-[#080b14] border border-[#1a2236] text-white text-xs px-3 h-9 rounded-xl outline-none focus:border-blue-500/40">
            <option value="">Tüm Kategoriler</option>
            {kategoriler.map(k => <option key={k.id} value={k.ad}>{k.ad}</option>)}
          </select>
          
          <button onClick={() => setSadeceKritik(!sadeceKritik)}
            className={`text-xs font-semibold px-4 py-2 rounded-xl border transition-colors flex items-center gap-1.5 ${
              sadeceKritik ? "bg-amber-500/15 border-amber-500/40 text-amber-400" : "bg-[#080b14] border-[#1a2236] text-gray-500 hover:border-amber-500/20"
            }`}>
            <AlertTriangle size={12}/> Sadece Kritik
          </button>
        </div>

        {/* ─── KATEGORİLERE / ALT BAŞLIKLARA GÖRE GRUPLANMIŞ ÜRÜN TABLOSU ─── */}
        <div className="space-y-4">
          {Object.keys(gruplanmisUrunler).length === 0 ? (
            <div className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] py-12 text-center text-gray-600 text-xs uppercase tracking-widest">
              Aranan kriterlere uygun ürün bulunamadı.
            </div>
          ) : (
            Object.entries(gruplanmisUrunler).map(([kategoriAdi, urunListesi]) => {
              const katObj = kategoriler.find(k => k.ad === kategoriAdi);
              const baslikRengi = katObj ? katObj.renk : "#94a3b8";

              return (
                <div key={kategoriAdi} className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] overflow-hidden shadow-xl">
                  {/* ALT BAŞLIK / KATEGORİ ALANI */}
                  <div className="px-4 py-3 bg-[#080b14] border-b border-[#1a2236] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: baslikRengi }} />
                      <h3 className="text-xs font-black uppercase tracking-wider" style={{ color: baslikRengi }}>
                        {kategoriAdi} <span className="text-[10px] text-gray-600 font-normal lowercase font-mono">({urunListesi.length} ürün)</span>
                      </h3>
                    </div>
                    {/* Tümünü Seçme Onay Kutusu */}
                    <button 
                      onClick={tumunuSecVeyaBirak}
                      className="text-[10px] font-bold text-gray-500 hover:text-white transition-colors"
                    >
                      Kategori Seçimini Değiştir
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#1a2236] bg-[#060810]/40 text-gray-600">
                          <th className="px-4 py-2 text-left w-10">
                            <button onClick={tumunuSecVeyaBirak} className="text-gray-600 hover:text-white">
                              {seciliUrunIds.size === filtreliUrunler.length ? <CheckSquare size={14} className="text-amber-500" /> : <Square size={14} />}
                            </button>
                          </th>
                          {siraDuzenleModu && <th className="px-4 py-2 text-left w-16">Sıra No</th>}
                          <th className="px-4 py-2 text-left">Ürün Adı</th>
                          <th className="px-4 py-2 text-left">Sayım Döngüsü</th>
                          <th className="px-4 py-2 text-left">Mevcut Stok</th>
                          <th className="px-4 py-2 text-left">Min. Stok</th>
                          <th className="px-4 py-2 text-left">Günlük Kull.</th>
                          <th className="px-4 py-2 text-left">Tahmini Bitiş</th>
                          <th className="px-4 py-2 text-left">Son Güncelleme</th>
                          <th className="px-4 py-2 text-right">İşlemler</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#0f1624]">
                        {urunListesi.map(urun => {
                          const ort = gunlukOrtalama(urun.id);
                          const kalanGun = tahminiBitisGunu(urun);
                          const kritik = urun.mevcut_stok <= urun.min_stok && urun.min_stok > 0;
                          const tukenmis = urun.mevcut_stok <= 0;
                          const secili = seciliUrunIds.has(urun.id);

                          return (
                            <tr key={urun.id} className={`hover:bg-white/[0.02] transition-colors group ${tukenmis ? "bg-red-950/10" : kritik ? "bg-amber-950/10" : ""} ${secili ? "bg-amber-500/5" : ""}`}>
                              {/* Onay Kutusu */}
                              <td className="px-4 py-3">
                                <button type="button" onClick={() => secimDegis(urun.id)} className="text-gray-600 hover:text-white">
                                  {secili ? <CheckSquare size={14} className="text-amber-500" /> : <Square size={14} />}
                                </button>
                              </td>

                              {/* Sıra No Değiştirme Alanı */}
                              {siraDuzenleModu && (
                                <td className="px-4 py-3">
                                  <input 
                                    type="number" 
                                    value={geciciSiralar[urun.id] ?? 0}
                                    onChange={e => setGeciciSiralar({ ...geciciSiralar, [urun.id]: parseInt(e.target.value) || 0 })}
                                    className="w-12 bg-[#080b14] border border-[#1a2236] text-purple-400 text-center font-bold text-xs h-7 rounded-md outline-none"
                                  />
                                </td>
                              )}

                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  {tukenmis ? <TrendingDown size={12} className="text-red-400 shrink-0"/> :
                                   kritik ? <AlertTriangle size={12} className="text-amber-400 shrink-0"/> :
                                   <Box size={12} className="text-emerald-400 shrink-0"/>}
                                  <Link href={`/stok/${urun.id}`} className="font-semibold text-gray-200 hover:text-blue-400 transition-colors">
                                    {urun.urun_adi}
                                  </Link>
                                </div>
                              </td>

                              <td className="px-4 py-3 font-medium text-gray-400 capitalize">
                                {urun.sayim_periyodu === "aylik" ? "🗓 Aylık" : urun.sayim_periyodu === "haftalik" ? "📅 Haftalık" : "⏱ Günlük"}
                              </td>

                              <td className={`px-4 py-3 font-black ${tukenmis ? "text-red-400" : kritik ? "text-amber-400" : "text-white"}`}>
                                {fmt(urun.mevcut_stok)} <span className="text-[10px] text-gray-600 font-normal">{urun.birim}</span>
                              </td>
                              <td className="px-4 py-3 text-gray-500">
                                {urun.min_stok > 0 ? `${fmt(urun.min_stok)} ${urun.birim}` : "—"}
                              </td>
                              <td className="px-4 py-3 text-purple-400 font-semibold">
                                {ort > 0 ? `${fmt(ort, 2)} ${urun.birim}` : "—"}
                              </td>
                              <td className="px-4 py-3">
                                {kalanGun !== null ? (
                                  <span className={`font-semibold ${kalanGun <= 3 ? "text-red-400" : kalanGun <= 7 ? "text-amber-400" : "text-emerald-400"}`}>
                                    ~{kalanGun} gün
                                  </span>
                                ) : <span className="text-gray-700">—</span>}
                              </td>
                              <td className="px-4 py-3 text-gray-600 text-[10px]">
                                {new Date(urun.updated_at).toLocaleDateString("tr-TR")}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => setSayimUrun(urun)} className="p-1.5 text-blue-400 hover:bg-blue-500/10 rounded-lg" title="Sayım Gir"><ClipboardCheck size={12}/></button>
                                  <button onClick={() => setMalGirisUrun(urun)} className="p-1.5 text-amber-400 hover:bg-amber-500/10 rounded-lg" title="Mal Geldi"><Truck size={12}/></button>
                                  <button onClick={() => setDuzenleUrun(urun)} className="p-1.5 text-gray-400 hover:bg-white/5 rounded-lg" title="Düzenle"><Edit3 size={12}/></button>
                                  {isAdmin && (
                                    <button onClick={() => urunSil(urun)} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg" title="Sil"><Trash2 size={12}/></button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* YENİ / DÜZENLEME MODAL */}
      {yeniUrunAcik && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-5 py-4 border-b border-[#1a2236] flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">{duzenleUrun ? "Ürün Düzenle" : "Yeni Ürün"}</h3>
              <button onClick={yeniUrunReset} className="p-1 text-gray-600 hover:text-white"><X size={16}/></button>
            </div>
            <form onSubmit={yeniUrunKaydet} className="p-5 space-y-3">
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Ürün Adı *</label>
                <input type="text" value={yUrunAdi} onChange={e => setYUrunAdi(e.target.value)} required
                  className="w-full bg-[#080b14] border border-[#1a2236] text-white text-sm h-9 px-3 rounded-xl outline-none"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Kategori / Ana Başlık</label>
                  {!digerKategoriModu ? (
                    <select 
                      value={yKategori} 
                      onChange={e => {
                        if (e.target.value === "__DIGER__") {
                          setDigerKategoriModu(true);
                          setYKategori("");
                        } else {
                          setYKategori(e.target.value);
                        }
                      }}
                      className="w-full bg-[#080b14] border border-[#1a2236] text-white text-sm h-9 px-3 rounded-xl outline-none"
                    >
                      <option value="">Seçiniz</option>
                      {kategoriler.map(k => <option key={k.id} value={k.ad}>{k.ad}</option>)}
                      <option value="__DIGER__" className="text-blue-400 font-bold">✨ Diğer (Yeni Başlık Ekle...)</option>
                    </select>
                  ) : (
                    <div className="relative flex items-center">
                      <input 
                        type="text" 
                        placeholder="Başlık Adı..." 
                        value={yeniKategoriAdi}
                        onChange={e => setYeniKategoriAdi(e.target.value)}
                        autoFocus
                        className="w-full bg-[#080b14] border border-blue-500/50 text-white text-xs h-9 pl-3 pr-8 rounded-xl outline-none"
                      />
                      <button 
                        type="button" 
                        onClick={() => {
                          setDigerKategoriModu(false);
                          setYeniKategoriAdi("");
                        }}
                        className="absolute right-2 p-1 text-gray-500 hover:text-red-400"
                      >
                        <X size={12}/>
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Birim</label>
                  <select value={yBirim} onChange={e => setYBirim(e.target.value)}
                    className="w-full bg-[#080b14] border border-[#1a2236] text-white text-sm h-9 px-3 rounded-xl outline-none">
                    {BIRIMLER.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Sayım Döngüsü</label>
                  <select value={yPeriyot} onChange={e => setYPeriyot(e.target.value)}
                    className="w-full bg-[#080b14] border border-[#1a2236] text-white text-sm h-9 px-3 rounded-xl outline-none">
                    <option value="gunluk">Günlük Rutin Sayım</option>
                    <option value="haftalik">Haftalık Rutin Sayım</option>
                    <option value="aylik">Aylık Rutin Sayım</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Liste Sıra No</label>
                  <input type="number" value={ySiraNo} onChange={e => setYSiraNo(e.target.value)} placeholder="0"
                    className="w-full bg-[#080b14] border border-[#1a2236] text-white text-sm h-9 px-3 rounded-xl outline-none"/>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Min. Stok</label>
                  <input type="number" step="0.01" value={yMinStok} onChange={e => setYMinStok(e.target.value)} placeholder="0"
                    className="w-full bg-[#080b14] border border-[#1a2236] text-white text-sm h-9 px-3 rounded-xl outline-none"/>
                </div>
                {!duzenleUrun && (
                  <div>
                    <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Başlangıç Stoğu</label>
                    <input type="number" step="0.01" value={yIlkStok} onChange={e => setYIlkStok(e.target.value)} placeholder="0"
                      className="w-full bg-[#080b14] border border-[#1a2236] text-white text-sm h-9 px-3 rounded-xl outline-none"/>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Notlar</label>
                <textarea value={yNotlar} onChange={e => setYNotlar(e.target.value)} rows={2}
                  className="w-full bg-[#080b14] border border-[#1a2236] text-white text-xs px-3 py-2 rounded-xl outline-none resize-none"/>
              </div>
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

      {/* SAYIM MODAL */}
      {sayimUrun && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0f1a] border border-blue-500/20 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="px-5 py-4 border-b border-[#1a2236] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardCheck size={16} className="text-blue-400"/>
                <h3 className="text-sm font-bold text-white">Sayım Gir ({sayimUrun.sayim_periyodu})</h3>
              </div>
              <button onClick={() => setSayimUrun(null)} className="p-1 text-gray-600 hover:text-white"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl px-3 py-2.5">
                <p className="text-xs font-bold text-blue-400">{sayimUrun.urun_adi}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">Sistemdeki: <strong className="text-white">{fmt(sayimUrun.mevcut_stok)} {sayimUrun.birim}</strong></p>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Sayım Tarihi</label>
                <input type="date" value={sayimTarih} onChange={e => setSayimTarih(e.target.value)}
                  className="w-full bg-[#080b14] border border-[#1a2236] text-white text-sm h-9 px-3 rounded-xl outline-none"/>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Fiziki Stok Miktarı ({sayimUrun.birim})</label>
                <input type="number" step="0.01" value={sayimMiktar} onChange={e => setSayimMiktar(e.target.value)} placeholder="0" autoFocus
                  className="w-full bg-[#080b14] border border-[#1a2236] text-white text-lg font-bold h-12 px-3 rounded-xl outline-none"/>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Not</label>
                <input type="text" value={sayimNot} onChange={e => setSayimNot}
                  className="w-full bg-[#080b14] border border-[#1a2236] text-xs h-8 px-3 rounded-xl outline-none"/>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setSayimUrun(null)} className="text-xs font-semibold text-gray-500 border border-[#1a2236] px-4 py-2 rounded-xl">İptal</button>
                <button onClick={sayimKaydet} disabled={saving || !sayimMiktar} className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-xl flex items-center gap-2">
                  {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Kaydet
                </button>
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
              <div className="flex items-center gap-2">
                <Truck size={16} className="text-amber-400"/>
                <h3 className="text-sm font-bold text-white">Mal Girişi</h3>
              </div>
              <button onClick={() => setMalGirisUrun(null)} className="p-1 text-gray-600 hover:text-white"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2.5">
                <p className="text-xs font-bold text-amber-400">{malGirisUrun.urun_adi}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">Mevcut: <strong className="text-white">{fmt(malGirisUrun.mevcut_stok)} {malGirisUrun.birim}</strong></p>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Geliş Tarihi</label>
                <input type="date" value={girisTarih} onChange={e => setGirisTarih(e.target.value)}
                  className="w-full bg-[#080b14] border border-[#1a2236] text-white text-sm h-9 px-3 rounded-xl outline-none"/>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Gelen Miktar ({malGirisUrun.birim})</label>
                <input type="number" step="0.01" value={girisMiktar} onChange={e => setGirisMiktar(e.target.value)} placeholder="0" autoFocus
                  className="w-full bg-[#080b14] border border-[#1a2236] text-white text-lg font-bold h-12 px-3 rounded-xl outline-none"/>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Birim Fiyat</label>
                <input type="number" step="0.01" value={girisFiyat} onChange={e => setGirisFiyat(e.target.value)} placeholder="₺"
                  className="w-full bg-[#080b14] border border-[#1a2236] text-white text-sm h-9 px-3 rounded-xl outline-none"/>
              </div>
              <div>
                <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Not</label>
                <input type="text" value={girisNot} onChange={e => setGirisNot(e.target.value)} className="w-full bg-[#080b14] border border-[#1a2236] text-xs h-8 px-3 rounded-xl outline-none"/>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setMalGirisUrun(null)} className="text-xs font-semibold text-gray-500 border border-[#1a2236] px-4 py-2 rounded-xl">İptal</button>
                <button onClick={malGirisKaydet} disabled={saving || !girisMiktar} className="text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-6 py-2 rounded-xl flex items-center gap-2">
                  {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOPLU SAYIM MODAL */}
      {topluSayimAcik && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0f1a] border border-blue-500/20 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-[#1a2236] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardCheck size={16} className="text-blue-400"/>
                <h3 className="text-sm font-bold text-white">Toplu Sayım</h3>
              </div>
              <button onClick={() => { setTopluSayimAcik(false); setTopluVeriler({}); }} className="p-1 text-gray-600 hover:text-white"><X size={16}/></button>
            </div>
            <div className="p-5 border-b border-[#1a2236]">
              <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Sayım Tarihi</label>
              <input type="date" value={topluTarih} onChange={e => setTopluTarih(e.target.value)}
                className="bg-[#080b14] border border-[#1a2236] text-white text-sm h-9 px-3 rounded-xl outline-none"/>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-2">
              {urunler.map(urun => (
                <div key={urun.id} className="flex items-center gap-3 bg-[#080b14] border border-[#1a2236] rounded-xl px-3 py-2">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-white">{urun.urun_adi}</p>
                    <p className="text-[10px] text-gray-600">Mevcut: {fmt(urun.mevcut_stok)} {urun.birim} <span className="text-blue-400 ml-2 font-mono">({urun.sayim_periyodu || "gunluk"})</span></p>
                  </div>
                  <div className="relative w-32">
                    <input type="number" step="0.01" value={topluVeriler[urun.id] || ""}
                      onChange={e => setTopluVeriler({ ...topluVeriler, [urun.id]: e.target.value })}
                      placeholder={`0 ${urun.birim}`}
                      className="w-full bg-[#0c0f1a] border border-[#1a2236] text-white text-sm font-bold h-8 px-2 rounded-lg text-right outline-none"/>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-[#1a2236] flex justify-end gap-2">
              <button onClick={() => { setTopluSayimAcik(false); setTopluVeriler({}); }} className="text-xs font-semibold text-gray-500 border border-[#1a2236] px-4 py-2 rounded-xl">İptal</button>
              <button onClick={topluSayimKaydet} disabled={saving} className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-xl flex items-center gap-2">
                {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Tümünü Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOPLU MAL GİRİŞ MODAL */}
      {topluMalGirisAcik && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0f1a] border border-amber-500/20 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-[#1a2236] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck size={16} className="text-amber-400"/>
                <h3 className="text-sm font-bold text-white">Toplu Mal Girişi</h3>
              </div>
              <button onClick={() => { setTopluMalGirisAcik(false); setTopluVeriler({}); }} className="p-1 text-gray-600 hover:text-white"><X size={16}/></button>
            </div>
            <div className="p-5 border-b border-[#1a2236]">
              <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Mal Geliş Tarihi</label>
              <input type="date" value={topluTarih} onChange={e => setTopluTarih(e.target.value)}
                className="bg-[#080b14] border border-[#1a2236] text-white text-sm h-9 px-3 rounded-xl outline-none"/>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-2">
              {urunler.map(urun => (
                <div key={urun.id} className="flex items-center gap-3 bg-[#080b14] border border-[#1a2236] rounded-xl px-3 py-2">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-white">{urun.urun_adi}</p>
                    <p className="text-[10px] text-gray-600">Mevcut: {fmt(urun.mevcut_stok)} {urun.birim}</p>
                  </div>
                  <div className="relative w-32">
                    <input type="number" step="0.01" value={topluVeriler[urun.id] || ""}
                      onChange={e => setTopluVeriler({ ...topluVeriler, [urun.id]: e.target.value })}
                      placeholder={`+ ${urun.birim}`}
                      className="w-full bg-[#0c0f1a] border border-[#1a2236] text-white text-sm font-bold h-8 px-2 rounded-lg text-right outline-none"/>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-[#1a2236] flex justify-end gap-2">
              <button onClick={() => { setTopluMalGirisAcik(false); setTopluVeriler({}); }} className="text-xs font-semibold text-gray-500 border border-[#1a2236] px-4 py-2 rounded-xl">İptal</button>
              <button onClick={topluMalGirisKaydet} disabled={saving} className="text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-6 py-2 rounded-xl flex items-center gap-2">
                {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}