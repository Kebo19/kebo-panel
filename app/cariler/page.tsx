"use client";

import SayfaSimgesi from "@/components/kabuk/SayfaSimgesi";
import { useEffect, useState, useCallback, useMemo } from "react";
import { hepsiniCek } from "@/lib/hepsiniCek";
import { createClient } from "@/lib/supabase/client";
import {
  Plus, Search, Building2, Trash2, X, Loader2, CheckCircle2,
  AlertTriangle, Wallet, ArrowLeft, Phone, Hash,
  Calendar, Check, Square, CheckSquare, ChevronDown, ChevronUp, Edit2, ScrollText, FilePlus, FileUp
} from "lucide-react";
import VadeTakvimi from "@/components/VadeTakvimi";
import CariEkstre from "@/components/CariEkstre";
import KeboEkstreYukle from "@/components/KeboEkstreYukle";
import OdemeDetay from "@/components/OdemeDetay";
import FaturaDuzenle from "@/components/FaturaDuzenle";
import { keboCariMi, keboVadeOzeti, sonrakiCuma } from "@/lib/keboEkstre";
import { aramaKelimeleri, faturaEslesir } from "@/lib/faturaArama";

import {
  buAyinOdemeDonemi, faturaDurumHesapla, GIDER_HESAPLARI, HESAP_ETIKET, kartMi,
  HAKEDIS_MAHSUP, HATIR_FATURASI, kasasizMi, ODEME_SECENEKLERI, odemeKaydiAlanlari, cariBorcu, tariheKadarOdenecek,
} from "@/lib/cari";
import { tv, fmt2, paraGirdisi } from "@/lib/para";
import { bugun, fmtTarih as fmtTarihOrtak } from "@/lib/tarih";

interface Cari {
  id: string; cari_kodu: string; unvan: string; vergi_no: string;
  vergi_dairesi: string; telefon: string; adres: string; tip: string; kategori: string;
  varsayilan_kdv?: number | null;
  hakedisten_mahsup?: boolean | null;
}
/** Faturaları platform hakedişinden kesilen cari mi? (bayrak ya da bilinen platform adı) */
const platformCariMi = (c?: Pick<Cari, "unvan" | "hakedisten_mahsup"> | null) =>
  !!c && (!!c.hakedisten_mahsup || /(yemek ?sepeti|getir|migros|trendyol)/i.test(c.unvan || ""));
const BOS_FORM = { cari_kodu: "", unvan: "", vergi_no: "", vergi_dairesi: "", telefon: "", adres: "", tip: "tedarikci", kategori: "duzenli", varsayilan_kdv: "", hakedisten_mahsup: false };
interface Fatura {
  id: string; fatura_no: string; fatura_tarihi: string;
  toplam_tutar: number; durum: string; aciklama: string; cari_id?: string; cari_unvan?: string;
  vade_tarihi?: string | null; hatir_faturasi?: boolean | null; tutar?: number | null; kdv?: number | null;
}
interface Odeme {
  id: string; tutar: number; tarih: string; aciklama: string; odeme_yontemi: string;
  hesap?: string | null; fatura_idleri?: string[] | null; rapor_id?: string | null;
}
/** Faturaya bağlanmamış (manuel) ödeme mi? Eski kayıtlarda bağlantı bilinmediği için sayılmaz. */
const serbestOdemeMi = (o: { fatura_idleri?: string[] | null }) => Array.isArray(o.fatura_idleri) && o.fatura_idleri.length === 0;
interface BuAyFatura extends Fatura {
  cari_unvan: string;
  cari_id: string;
  cariObj?: Cari;
}

const inputCls = "w-full bg-alan border border-cizgi hover:border-cizgi-guclu focus:border-altin/50 text-yazi text-sm h-11 px-3 rounded-xl outline-none transition-all placeholder:text-gray-700";
const fmt = fmt2;
const fmtTarih = (t: string) => fmtTarihOrtak(t) || "—";

export default function CarilerPage() {
  const supabase = createClient();
  const [cariler, setCariler] = useState<Cari[]>([]);
  const [cariTutarMap, setCariTutarMap] = useState<Map<string, { buAy: number; toplam: number }>>(new Map());
  const [yukleniyor, setYukleniyor] = useState(true);
  const [aramaMetni, setAramaMetni] = useState("");
  const [aktifTab, setAktifTab] = useState<"duzenli" | "diger" | "buay">("duzenli");
  const [seciliCari, setSeciliCari] = useState<Cari | null>(null);
  const [cariFaturalar, setCariFaturalar] = useState<Fatura[]>([]);
  const [cariOdemeler, setCariOdemeler] = useState<Odeme[]>([]);
  const [modalAcik, setModalAcik] = useState(false);
  const [odemeModalAcik, setOdemeModalAcik] = useState(false);
  const [seciliFaturalar, setSeciliFaturalar] = useState<Set<string>>(new Set());
  const [manuelTutar, setManuelTutar] = useState("");
  const [odemeTarih, setOdemeTarih] = useState(bugun());
  const [odemeYontemi, setOdemeYontemi] = useState("Nakit");
  const [odemeAciklama, setOdemeAciklama] = useState("");
  const [formSaving, setFormSaving] = useState(false);
  const [topluIslemYukleniyor, setTopluIslemYukleniyor] = useState(false);
  const [toast, setToast] = useState<{ tip: "basari" | "hata"; mesaj: string } | null>(null);
  const [form, setForm] = useState(BOS_FORM);
  const [duzenlenenCariId, setDuzenlenenCariId] = useState<string | null>(null);
  const [ekstreCari, setEkstreCari] = useState<Cari | null>(null);
  const [keboEkstreAcik, setKeboEkstreAcik] = useState(false);
  const [detayArama, setDetayArama] = useState("");
  const detayKelimeler = useMemo(() => aramaKelimeleri(detayArama), [detayArama]);
  const [odemeDetay, setOdemeDetay] = useState<Odeme | null>(null);
  const [faturaDuzenle, setFaturaDuzenle] = useState<Fatura | null>(null);
  // Kebo: her cuma, o cumaya kadar vadesi (fatura + 15 gün) dolan faturalar ödenir
  const [keboOdemeTarihi, setKeboOdemeTarihi] = useState(() => sonrakiCuma(bugun()));
  // Cari detayından yeni fatura ekleme
  const [faturaModalAcik, setFaturaModalAcik] = useState(false);
  const [faturaForm, setFaturaForm] = useState({ fatura_no: "", fatura_tarihi: bugun(), vade_tarihi: "", tutar: "", kdv: "20", kdvDahil: false, aciklama: "" });
  const [takvimYenile, setTakvimYenile] = useState(0);

  // Bu Ay Ödenecekler state
  const [buAyFaturalar, setBuAyFaturalar] = useState<BuAyFatura[]>([]);
  const [acikCariGruplar, setAcikCariGruplar] = useState<Set<string>>(new Set());
  const [buAyYukleniyor, setBuAyYukleniyor] = useState(false);
  const [duzenleModal, setDuzenleModal] = useState<{ acik: boolean; fatura: BuAyFatura | null }>({ acik: false, fatura: null });
  const [duzenleForm, setDuzenleForm] = useState({ tutar: "", durum: "bekliyor" });

  // Detay sayfasında anlık durum güncellemesi için local state
  const [localDurumlar, setLocalDurumlar] = useState<Map<string, string>>(new Map());

  const showToast = (tip: "basari" | "hata", mesaj: string) => {
    setToast({ tip, mesaj });
    setTimeout(() => setToast(null), 3000);
  };

  const donem = useMemo(() => buAyinOdemeDonemi(), []);

  // Borç = carinin tüm faturaları − tüm ödemeleri (cari hesap); fatura durumları veritabanında bundan hesaplanır.
  // Map anahtarı cari id'si (ünvan değişse de bağlantı kopmasın).
  const veriCek = useCallback(async () => {
    setYukleniyor(true);
    // Listeler 1000 satırı aşabilir → sayfa sayfa (id ile kararlı sıralama)
    let c: Cari[] = [], f: { cari_id: string | null; toplam_tutar: number | null; durum: string; fatura_tarihi: string }[] = [],
      o: { cari_id: string | null; tutar: number | null; fatura_idleri: string[] | null }[] = [];
    try {
      [c, f, o] = await Promise.all([
        hepsiniCek<Cari>((a, b) => supabase.from("cariler").select("*").order("unvan").order("id").range(a, b)),
        hepsiniCek<{ cari_id: string | null; toplam_tutar: number | null; durum: string; fatura_tarihi: string }>((a, b) =>
          supabase.from("faturalar").select("cari_id, toplam_tutar, durum, fatura_tarihi").order("id").range(a, b)),
        hepsiniCek<{ cari_id: string | null; tutar: number | null; fatura_idleri: string[] | null }>((a, b) =>
          supabase.from("cari_odemeler").select("cari_id, tutar, fatura_idleri").order("id").range(a, b)),
      ]);
    } catch (e) {
      alert("Veri alınamadı: " + (e instanceof Error ? e.message : String(e)));
      setYukleniyor(false);
      return;
    }
    setCariler(c);
    const map = new Map<string, { buAy: number; toplam: number }>();
    const fGrup = new Map<string, typeof f>(); const oGrup = new Map<string, typeof o>();
    (f || []).forEach(x => { if (x.cari_id) { if (!fGrup.has(x.cari_id)) fGrup.set(x.cari_id, []); fGrup.get(x.cari_id)!.push(x); } });
    (o || []).forEach(x => { if (x.cari_id) { if (!oGrup.has(x.cari_id)) oGrup.set(x.cari_id, []); oGrup.get(x.cari_id)!.push(x); } });
    fGrup.forEach((fl, id) => {
      const borc = cariBorcu(fl, oGrup.get(id) || []);
      map.set(id, { toplam: borc, buAy: tariheKadarOdenecek(fl, borc, donem.donemBit) });
    });
    setCariTutarMap(map);
    setTakvimYenile(n => n + 1);
    setYukleniyor(false);
  }, [donem, supabase]);

  // Bu dönem ödenecekler: dönem sonuna kadar kesilmiş ve ödenmemiş tüm faturalar
  // (önceki dönemden kalan gecikmişler dahil).
  const buAyVeriCek = useCallback(async () => {
    setBuAyYukleniyor(true);
    const f = await hepsiniCek<BuAyFatura>((a, b) => supabase
      .from("faturalar")
      .select("*")
      .lte("fatura_tarihi", donem.donemBit)
      .neq("durum", "odendi")
      .order("fatura_tarihi", { ascending: false }).order("id").range(a, b)).catch(() => [] as BuAyFatura[]);
    setBuAyFaturalar(f);
    setBuAyYukleniyor(false);
  }, [donem, supabase]);

  useEffect(() => { veriCek(); }, [veriCek]);
  useEffect(() => { if (aktifTab === "buay") buAyVeriCek(); }, [aktifTab, buAyVeriCek]);

  const cariDetayAc = async (cari: Cari) => {
    if (seciliCari?.id !== cari.id) setDetayArama("");
    setSeciliCari(cari);
    setSeciliFaturalar(new Set());
    setLocalDurumlar(new Map());
    const [f, o] = await Promise.all([
      hepsiniCek<Fatura>((a, b) => supabase.from("faturalar").select("*").eq("cari_id", cari.id).order("fatura_tarihi", { ascending: false }).order("id").range(a, b)).catch(() => [] as Fatura[]),
      hepsiniCek<Odeme>((a, b) => supabase.from("cari_odemeler").select("*").eq("cari_id", cari.id).order("tarih", { ascending: false }).order("id").range(a, b)).catch(() => [] as Odeme[]),
    ]);
    setCariFaturalar(f);
    setCariOdemeler(o);
  };

  const yeniCariAc = () => { setDuzenlenenCariId(null); setForm(BOS_FORM); setModalAcik(true); };
  const cariDuzenleAc = (c: Cari) => {
    setDuzenlenenCariId(c.id);
    setForm({
      cari_kodu: c.cari_kodu || "", unvan: c.unvan || "", vergi_no: c.vergi_no || "", vergi_dairesi: c.vergi_dairesi || "",
      telefon: c.telefon || "", adres: c.adres || "", tip: c.tip || "tedarikci", kategori: c.kategori || "diger",
      varsayilan_kdv: c.varsayilan_kdv === null || c.varsayilan_kdv === undefined ? "" : String(Number(c.varsayilan_kdv)),
      hakedisten_mahsup: !!c.hakedisten_mahsup,
    });
    setModalAcik(true);
  };

  const kaydet = async () => {
    if (!form.unvan) { showToast("hata", "Ünvan zorunlu."); return; }
    setFormSaving(true);
    const kayit = { ...form, varsayilan_kdv: form.varsayilan_kdv === "" ? null : Number(form.varsayilan_kdv) };
    const { data, error } = duzenlenenCariId
      ? await supabase.from("cariler").update(kayit).eq("id", duzenlenenCariId).select().single()
      : await supabase.from("cariler").insert([kayit]).select().single();
    setFormSaving(false);
    if (error) { showToast("hata", "Kayıt hatası: " + error.message); return; }
    showToast("basari", duzenlenenCariId ? "Cari güncellendi." : "Cari kaydedildi.");
    if (duzenlenenCariId && seciliCari?.id === duzenlenenCariId && data) setSeciliCari(data as Cari);
    setModalAcik(false);
    setDuzenlenenCariId(null);
    setForm(BOS_FORM);
    veriCek();
  };

  const faturaEkleAc = () => {
    const kdv = seciliCari?.varsayilan_kdv;
    setFaturaForm({ fatura_no: "", fatura_tarihi: bugun(), vade_tarihi: "", tutar: "",
      kdv: kdv === null || kdv === undefined ? "20" : String(Number(kdv)), kdvDahil: false, aciklama: "" });
    setFaturaModalAcik(true);
  };

  // Girilen tutar ve KDV oranından matrah / KDV / toplam (kdv sütunu TUTAR tutar, oran değil)
  const faturaHesap = useMemo(() => {
    const girilen = tv(faturaForm.tutar);
    const oran = parseFloat(faturaForm.kdv) || 0;
    const matrah = faturaForm.kdvDahil ? Math.round((girilen / (1 + oran / 100)) * 100) / 100 : girilen;
    const toplam = faturaForm.kdvDahil ? girilen : Math.round(matrah * (1 + oran / 100) * 100) / 100;
    return { matrah, kdv: Math.round((toplam - matrah) * 100) / 100, toplam };
  }, [faturaForm.tutar, faturaForm.kdv, faturaForm.kdvDahil]);

  const faturaKaydet = async () => {
    if (!seciliCari) return;
    if (!faturaForm.fatura_no.trim() || faturaHesap.toplam <= 0) { showToast("hata", "Fatura no ve tutar zorunlu."); return; }
    setFormSaving(true);
    const { error } = await supabase.from("faturalar").insert([{
      cari_id: seciliCari.id, cari_unvan: seciliCari.unvan, fatura_no: faturaForm.fatura_no.trim(),
      fatura_tarihi: faturaForm.fatura_tarihi, vade_tarihi: faturaForm.vade_tarihi || null,
      tutar: faturaHesap.matrah, kdv: faturaHesap.kdv, toplam_tutar: faturaHesap.toplam,
      aciklama: faturaForm.aciklama, durum: "bekliyor", islendi: false,
    }]);
    setFormSaving(false);
    if (error) { showToast("hata", "Kayıt hatası: " + error.message); return; }
    showToast("basari", "Fatura eklendi.");
    setFaturaModalAcik(false);
    cariDetayAc(seciliCari);
    veriCek();
  };

  /** Ödeme penceresini açar. `seciliKalsin` true ise listede seçili faturalar korunur. */
  const odemeAc = (seciliKalsin = false, cari: Cari | null = seciliCari, yontem?: string) => {
    if (!seciliKalsin) setSeciliFaturalar(new Set());
    setManuelTutar("");
    setOdemeTarih(bugun());
    // Platform carilerinde varsayılan hakedişten mahsup (kasaya yansımaz); diğerlerinde çoğu ödeme Enpara'dan yapılır
    setOdemeYontemi(yontem || (platformCariMi(cari) ? HAKEDIS_MAHSUP : "Enpara"));
    setOdemeAciklama("");
    setOdemeModalAcik(true);
  };

  /** "Bu Ay Ödenecekler" listesinden tek faturayı öde: carinin detayına geçip ödeme penceresini açar. */
  const buAyOde = async (f: BuAyFatura) => {
    const cari = cariler.find(c => c.id === f.cari_id);
    if (!cari) { showToast("hata", "Faturanın carisi bulunamadı."); return; }
    await cariDetayAc(cari);
    odemeAc(true, cari);
    setSeciliFaturalar(new Set([f.id]));
  };

  /** Vade takviminden: carinin detayına geçip o gruptaki faturalar seçili ödeme penceresini açar. */
  const takvimdenOde = async (cariId: string, faturaIdleri: string[]) => {
    const cari = cariler.find(c => c.id === cariId);
    if (!cari) { showToast("hata", "Cari bulunamadı."); return; }
    await cariDetayAc(cari);
    odemeAc(true, cari);
    setSeciliFaturalar(new Set(faturaIdleri));
  };

  const faturaSec = (id: string) => {
    setSeciliFaturalar(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
    setManuelTutar("");
  };

  const hepsiniSec = () => {
    // Arama yapılmışsa sadece bulunan faturalar seçilir
    const hedef = detayKelimeler ? cariFaturalar.filter(f => faturaEslesir(f, detayKelimeler)) : cariFaturalar;
    const hepsi = hedef.length > 0 && hedef.every(f => seciliFaturalar.has(f.id));
    if (hepsi) {
      setSeciliFaturalar(new Set());
    } else {
      setSeciliFaturalar(new Set(hedef.map(f => f.id)));
    }
  };

  const seciliToplam = useMemo(() =>
    cariFaturalar.filter(f => seciliFaturalar.has(f.id)).reduce((s, f) => s + (f.toplam_tutar || 0), 0),
    [seciliFaturalar, cariFaturalar]
  );

  // Toplu işlemler — optimistic update ile durum sütununu anında güncelle
  const topluDurumGuncelle = async (durum: string) => {
    if (seciliFaturalar.size === 0) return;
    // "Ödendi" artık sadece bir ödeme kaydıyla yapılır; böylece ödeme geçmişi ve Kasa eksik kalmaz.
    if (durum === "odendi") { odemeAc(true); return; }
    // Ödendi/bekliyor bakiyeden hesaplanır: ödenmiş fatura ancak ödemesi silinir/düzenlenirse açılır
    if (cariFaturalar.some(f => seciliFaturalar.has(f.id) && (localDurumlar.get(f.id) || f.durum) === "odendi")) {
      showToast("hata", "Ödenmiş fatura elle açılamaz — durum cari bakiyesinden hesaplanıyor. İlgili ödemeye tıklayıp düzenleyin ya da silin.");
      return;
    }
    // Anında UI güncelle
    const yeniDurumlar = new Map(localDurumlar);
    seciliFaturalar.forEach(id => yeniDurumlar.set(id, durum));
    setLocalDurumlar(yeniDurumlar);

    setTopluIslemYukleniyor(true);
    await supabase.from("faturalar").update({ durum, islendi: durum === "odendi", ...(durum !== "odendi" ? { hatir_faturasi: false } : {}) }).in("id", Array.from(seciliFaturalar));
    showToast("basari", `${seciliFaturalar.size} fatura ${durum === "odendi" ? "ödendi" : durum === "gecikti" ? "gecikti" : "bekliyor"} olarak işaretlendi.`);
    setTopluIslemYukleniyor(false);
    setSeciliFaturalar(new Set());
    if (seciliCari) cariDetayAc(seciliCari);
    veriCek();
  };

  const topluSil = async () => {
    if (seciliFaturalar.size === 0) return;
    if (!confirm(`${seciliFaturalar.size} fatura silinecek. Onaylıyor musunuz?`)) return;
    setTopluIslemYukleniyor(true);
    await supabase.from("faturalar").delete().in("id", Array.from(seciliFaturalar));
    showToast("basari", `${seciliFaturalar.size} fatura silindi.`);
    setTopluIslemYukleniyor(false);
    if (seciliCari) cariDetayAc(seciliCari);
    veriCek();
  };

  const odemeKaydet = async () => {
    if (!seciliCari) return;
    const faturaIdleri = Array.from(seciliFaturalar);
    const tutar = manuelTutar ? tv(manuelTutar) : seciliToplam;
    if (!tutar || tutar <= 0) { showToast("hata", "Tutar giriniz veya fatura seçiniz."); return; }
    setFormSaving(true);
    // Kasasız yöntemlerde hesap boş kalır → veritabanı tetikleyicisi kasa hareketi oluşturmaz
    const { odeme_yontemi, hesap } = odemeKaydiAlanlari(odemeYontemi);
    const { error } = await supabase.from("cari_odemeler").insert([{
      cari_id: seciliCari.id, cari_unvan: seciliCari.unvan,
      tutar, tarih: odemeTarih,
      odeme_yontemi, hesap, fatura_idleri: faturaIdleri,
      aciklama: odemeAciklama || (kasasizMi(odemeYontemi)
        ? `${odemeYontemi}${faturaIdleri.length > 0 ? ` — ${faturaIdleri.length} fatura kapatıldı` : ""}`
        : `${faturaIdleri.length > 0 ? faturaIdleri.length + " fatura için ödeme" : "Manuel ödeme"}`),
    }]);
    if (error) { showToast("hata", "Kayıt hatası: " + error.message); setFormSaving(false); return; }
    if (faturaIdleri.length > 0) {
      // Hatır faturası: ödemesiz, KDV için kesilen fatura → kâr/zarar mal alışına da girmez
      const { error: fErr } = await supabase.from("faturalar").update({ durum: "odendi", islendi: true, hatir_faturasi: odemeYontemi === HATIR_FATURASI }).in("id", faturaIdleri);
      if (fErr) showToast("hata", "Ödeme kaydedildi ama faturalar güncellenemedi: " + fErr.message);
    }
    setFormSaving(false);
    setSeciliFaturalar(new Set());
    showToast("basari", kasasizMi(odemeYontemi) ? "Faturalar kapatıldı (kasaya yansımadı)." : hesap ? (kartMi(hesap) ? `Ödeme kaydedildi ve ${HESAP_ETIKET[hesap]} borcuna eklendi.` : `Ödeme kaydedildi ve ${HESAP_ETIKET[hesap]} hesabından düşüldü.`) : "Ödeme kaydedildi.");
    if (aktifTab === "buay") buAyVeriCek();
    setOdemeModalAcik(false);
    cariDetayAc(seciliCari);
    veriCek();
  };

  const odemeSil = async (o: Odeme) => {
    if (o.rapor_id) { showToast("hata", "Bu ödeme günlük rapordaki firma giderinden geliyor; raporu düzenleyerek değiştirin."); return; }
    if (!confirm(`₺${fmt(o.tutar)} tutarındaki ödeme silinecek${o.fatura_idleri?.length ? " ve bağlı faturalar tekrar 'bekliyor' olacak" : ""}. Onaylıyor musunuz?`)) return;
    const { error } = await supabase.from("cari_odemeler").delete().eq("id", o.id);
    if (error) { showToast("hata", "Silme hatası: " + error.message); return; }
    if (o.fatura_idleri?.length) {
      await supabase.from("faturalar").update({ durum: "bekliyor", islendi: false, hatir_faturasi: false }).in("id", o.fatura_idleri);
    }
    showToast("basari", "Ödeme silindi.");
    if (seciliCari) cariDetayAc(seciliCari);
    veriCek();
  };

  const sil = async (id: string) => {
    if (!confirm("Bu cariyi silmek istiyor musunuz?")) return;
    await supabase.from("cariler").delete().eq("id", id);
    if (seciliCari?.id === id) setSeciliCari(null);
    veriCek();
  };

  // Bu ay fatura düzenleme
  const buAyDuzenleAc = (f: BuAyFatura) => {
    setDuzenleForm({ tutar: paraGirdisi(String(f.toplam_tutar).replace(".", ",")), durum: f.durum });
    setDuzenleModal({ acik: true, fatura: f });
  };

  const buAyDuzenleKaydet = async () => {
    if (!duzenleModal.fatura) return;
    setFormSaving(true);
    const durum = duzenleForm.durum === "odendi" ? duzenleModal.fatura.durum : duzenleForm.durum;
    await supabase.from("faturalar").update({
      toplam_tutar: tv(duzenleForm.tutar) || duzenleModal.fatura.toplam_tutar,
      durum,
      islendi: durum === "odendi",
    }).eq("id", duzenleModal.fatura.id);
    setFormSaving(false);
    showToast("basari", "Fatura güncellendi.");
    setDuzenleModal({ acik: false, fatura: null });
    buAyVeriCek();
    veriCek();
  };

  const buAyTekDurumGuncelle = async (faturaId: string, durum: string) => {
    if (durum === "odendi") { const fat = buAyFaturalar.find(x => x.id === faturaId); if (fat) buAyOde(fat); return; }
    await supabase.from("faturalar").update({ durum, islendi: durum === "odendi" }).eq("id", faturaId);
    setBuAyFaturalar(prev => prev.map(f => f.id === faturaId ? { ...f, durum } : f));
    showToast("basari", `Fatura ${durum === "odendi" ? "ödendi" : durum === "gecikti" ? "gecikti" : "bekliyor"} olarak işaretlendi.`);
    veriCek();
  };

  const toggleCariGrup = (unvan: string) => {
    setAcikCariGruplar(prev => {
      const s = new Set(prev);
      s.has(unvan) ? s.delete(unvan) : s.add(unvan);
      return s;
    });
  };

  const filtreliCariler = useMemo(() => cariler.filter(c => {
    const kategoriUygun = c.kategori === aktifTab || (!c.kategori && aktifTab === "diger");
    const aramaUygun = !aramaMetni || c.unvan?.toLowerCase().includes(aramaMetni.toLowerCase()) || c.vergi_no?.includes(aramaMetni);
    return kategoriUygun && aramaUygun;
  }), [cariler, aktifTab, aramaMetni]);

  // Bu ay faturalarını cari bazlı grupla
  const buAyCariGruplari = useMemo(() => {
    const map = new Map<string, { unvan: string; faturalar: BuAyFatura[]; toplam: number }>();
    buAyFaturalar.forEach(f => {
      const unvan = f.cari_unvan || "Bilinmiyor";
      if (!map.has(unvan)) map.set(unvan, { unvan, faturalar: [], toplam: 0 });
      const g = map.get(unvan)!;
      g.faturalar.push(f);
      g.toplam += f.toplam_tutar || 0;
    });
    return Array.from(map.values()).sort((a, b) => b.toplam - a.toplam);
  }, [buAyFaturalar]);

  const buAyGenelToplam = useMemo(() =>
    buAyFaturalar.reduce((s, f) => s + (f.toplam_tutar || 0), 0),
    [buAyFaturalar]
  );

  // Toplam hesaplar (detay sayfası)
  const toplamFatura = cariFaturalar.reduce((s, f) => s + (f.toplam_tutar || 0), 0);
  const toplamOdeme = cariOdemeler.reduce((s, o) => s + (o.tutar || 0), 0);
  // Borç = tüm faturalar − tüm ödemeler (negatifse fazla ödenmiş / avans). Fatura tutarı ya da ödeme
  // değişince borç hemen değişir; ödendi/bekliyor durumları veritabanında bu bakiyeden hesaplanır.
  const toplamBorc = useMemo(() => cariBorcu(cariFaturalar, cariOdemeler), [cariFaturalar, cariOdemeler]);
  const gosterilenFaturalar = useMemo(() => cariFaturalar.map(f => ({ ...f, durum: localDurumlar.get(f.id) || f.durum })), [cariFaturalar, localDurumlar]);
  const buAyOdenecek = tariheKadarOdenecek(gosterilenFaturalar, toplamBorc, donem.donemBit);
  const keboMu = !!seciliCari && keboCariMi(seciliCari.unvan);
  const keboVade = useMemo(() => keboMu ? keboVadeOzeti(gosterilenFaturalar, toplamBorc, keboOdemeTarihi, bugun()) : null,
    [keboMu, gosterilenFaturalar, toplamBorc, keboOdemeTarihi]);
  const keboVadeOde = () => {
    if (!keboVade || keboVade.toplam <= 0) return;
    odemeAc();
    setManuelTutar(paraGirdisi(String(keboVade.toplam).replace(".", ",")));
    setOdemeAciklama(`Kebo ${fmtTarih(keboOdemeTarihi)} vadeli ödeme (${keboVade.kalemler.length} fatura)`);
  };
  const duzenliSayisi = cariler.filter(c => c.kategori === "duzenli").length;
  const digerSayisi = cariler.filter(c => c.kategori !== "duzenli").length;
  const odenmemisFaturalar = cariFaturalar.filter(f => {
    const gercek = localDurumlar.get(f.id) || faturaDurumHesapla(f.fatura_tarihi, f.durum);
    return gercek !== "odendi";
  });
  const hepsiSecili = cariFaturalar.length > 0 && cariFaturalar.every(f => seciliFaturalar.has(f.id));

  const birlesikListe = useMemo(() => [
    ...cariFaturalar.map(f => ({
      tip: "fatura" as const,
      tarih: f.fatura_tarihi,
      veri: {
        ...f,
        gercekDurum: localDurumlar.get(f.id) || faturaDurumHesapla(f.fatura_tarihi, f.durum),
      },
    })),
    ...cariOdemeler.map(o => ({ tip: "odeme" as const, tarih: o.tarih, veri: o })),
  ].sort((a, b) => b.tarih.localeCompare(a.tarih)), [cariFaturalar, cariOdemeler, localDurumlar]);
  // Cari detayında arama: faturalar no/açıklama/tutar/tarih, ödemeler açıklama/yöntem/tutar/tarih ile
  const gorunenListe = useMemo(() => !detayKelimeler ? birlesikListe : birlesikListe.filter(item =>
    item.tip === "fatura"
      ? faturaEslesir(item.veri, detayKelimeler)
      : faturaEslesir({ fatura_no: item.veri.odeme_yontemi, aciklama: item.veri.aciklama, fatura_tarihi: item.veri.tarih, toplam_tutar: item.veri.tutar }, detayKelimeler)
  ), [birlesikListe, detayKelimeler]);

  const durumRenk = (d: string) =>
    d === "odendi" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
    d === "gecikti" ? "bg-red-500/10 text-red-400 border-red-500/20" :
    "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";

  const durumEtiket = (d: string) =>
    d === "odendi" ? "Ödendi" : d === "gecikti" ? "Gecikti" : "Bekliyor";

  return (
    <div className="min-h-screen bg-zemin text-yazi font-sans antialiased pb-24">

      {toast && (
        <div className={`fixed top-5 right-5 z-[80] flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-2xl text-sm font-semibold ${toast.tip === "basari" ? "bg-emerald-950 border-emerald-500/30 text-emerald-400" : "bg-red-950 border-red-500/30 text-red-400"}`}>
          {toast.tip === "basari" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {toast.mesaj}
        </div>
      )}

      {/* HEADER */}
      <div className="sticky top-0 z-40 border-b border-cizgi bg-zemin/95 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {seciliCari && (
              <button onClick={() => setSeciliCari(null)} className="p-2 text-gray-600 hover:text-yazi border border-cizgi rounded-xl transition-colors">
                <ArrowLeft size={14} />
              </button>
            )}
            <SayfaSimgesi />
            <div>
              <h1 className="text-sm font-black text-yazi leading-none">{seciliCari ? seciliCari.unvan : "Cariler"}</h1>
              <p className="text-[10px] text-gray-600 mt-0.5">{seciliCari ? `VN: ${seciliCari.vergi_no || "—"}` : `${cariler.length} cari`}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {seciliCari ? (
              <>
                {keboCariMi(seciliCari.unvan) && (
                  <button onClick={() => setKeboEkstreAcik(true)} title="Kebo'nun haftalık cari ekstresi PDF'ini yükle"
                    className="flex items-center gap-2 text-xs font-bold text-amber-300 border border-amber-500/30 hover:bg-amber-500/10 px-3 py-2 rounded-xl transition-colors">
                    <FileUp size={14} /> <span className="hidden sm:inline">Ekstre PDF</span>
                  </button>
                )}
                <button onClick={() => setEkstreCari(seciliCari)} className="flex items-center gap-2 text-xs font-bold text-gray-700 border border-cizgi hover:bg-white/[0.03] px-3 py-2 rounded-xl transition-colors">
                  <ScrollText size={14} /> <span className="hidden sm:inline">Ekstre</span>
                </button>
                <button onClick={() => cariDuzenleAc(seciliCari)} title="Cariyi düzenle" className="p-2 text-gray-600 hover:text-blue-400 border border-cizgi rounded-xl transition-colors">
                  <Edit2 size={14} />
                </button>
                <button onClick={faturaEkleAc} className="flex items-center gap-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl transition-colors">
                  <FilePlus size={14} /> Fatura Ekle
                </button>
                <button onClick={() => odemeAc()} className="flex items-center gap-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-xl transition-colors">
                  <Wallet size={14} /> Ödeme Ekle
                </button>
                <button onClick={() => sil(seciliCari.id)} className="p-2 text-gray-600 hover:text-red-400 border border-cizgi rounded-xl transition-colors">
                  <Trash2 size={14} />
                </button>
              </>
            ) : (
              <button onClick={yeniCariAc} className="flex items-center gap-2 text-xs font-bold text-[#1a1408] kebo-btn-altin hover:brightness-110 px-4 py-2 rounded-xl transition-colors">
                <Plus size={14} /> Cari Ekle
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CARİ LİSTESİ */}
      {!seciliCari && (
        <div className="max-w-6xl mx-auto px-4 py-5 space-y-4">

          {/* Vade bilgisi */}
          <div className="bg-kart border border-amber-500/20 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <Calendar size={16} className="text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] text-gray-600 uppercase tracking-widest">Bu Ay Ödeme Günü</p>
              <p className="text-sm font-black text-amber-400">
                {donem.vade.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
              </p>
              <p className="text-[10px] text-gray-600 mt-0.5">{fmtTarih(donem.donemBas)} – {fmtTarih(donem.donemBit)} dönem faturaları</p>
            </div>
          </div>

          <VadeTakvimi yenile={takvimYenile} onOde={takvimdenOde} />

          {/* Sekmeler */}
          <div className="flex gap-1 bg-kart border border-cizgi rounded-xl p-1 w-fit">
            <button onClick={() => setAktifTab("duzenli")} className={`text-xs font-bold px-4 py-2 rounded-lg transition-colors ${aktifTab === "duzenli" ? "kebo-btn-altin text-[#1a1408]" : "text-gray-500 hover:text-yazi"}`}>
              Düzenli Ödemeler ({duzenliSayisi})
            </button>
            <button onClick={() => setAktifTab("diger")} className={`text-xs font-bold px-4 py-2 rounded-lg transition-colors ${aktifTab === "diger" ? "kebo-btn-altin text-[#1a1408]" : "text-gray-500 hover:text-yazi"}`}>
              Diğer ({digerSayisi})
            </button>
            <button onClick={() => setAktifTab("buay")} className={`text-xs font-bold px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5 ${aktifTab === "buay" ? "bg-amber-500 text-yazi" : "text-amber-400 hover:text-yazi"}`}>
              <Calendar size={11} /> Bu Ay Ödenecekler
            </button>
          </div>

          {/* Bu Ay Ödenecekler sekmesi */}
          {aktifTab === "buay" && (
            <div className="space-y-3">
              {/* Özet banner */}
              <div className="bg-kart border border-amber-500/20 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">Toplam Bu Ay Ödenecek</p>
                  <p className="text-2xl font-black text-amber-400">₺{fmt(buAyGenelToplam)}</p>
                  <p className="text-[10px] text-gray-500 mt-1">{buAyFaturalar.length} fatura · {buAyCariGruplari.length} cari · Vade: {donem.vade.toLocaleDateString("tr-TR", { day: "numeric", month: "long" })}</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Calendar size={20} className="text-amber-400" />
                </div>
              </div>

              {buAyYukleniyor ? (
                <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" /></div>
              ) : buAyCariGruplari.length === 0 ? (
                <div className="bg-kart border border-cizgi rounded-2xl py-16 text-center text-gray-600 text-xs uppercase tracking-widest">Bu dönemde ödenecek fatura yok</div>
              ) : (
                buAyCariGruplari.map(grup => (
                  <div key={grup.unvan} className="bg-kart border border-cizgi rounded-2xl overflow-hidden">
                    {/* Cari başlık satırı */}
                    <button
                      onClick={() => toggleCariGrup(grup.unvan)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                          <span className="text-sm font-black text-blue-400">{grup.unvan.charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-black text-yazi">{grup.unvan}</p>
                          <p className="text-[10px] text-gray-500">{grup.faturalar.length} fatura</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <p className="text-base font-black text-amber-400">₺{fmt(grup.toplam)}</p>
                        {acikCariGruplar.has(grup.unvan) ? <ChevronUp size={14} className="text-gray-600" /> : <ChevronDown size={14} className="text-gray-600" />}
                      </div>
                    </button>

                    {/* Fatura satırları */}
                    {acikCariGruplar.has(grup.unvan) && (
                      <div className="border-t border-cizgi">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-cizgi">
                              <th className="text-left px-5 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Fatura No</th>
                              <th className="text-left px-4 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Tarih</th>
                              <th className="text-right px-4 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Tutar</th>
                              <th className="text-left px-4 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Durum</th>
                              <th className="px-4 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold text-right">İşlem</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-cizgi">
                            {grup.faturalar.map(f => (
                              <tr key={f.id} className="hover:bg-white/[0.03] transition-colors">
                                <td className="px-5 py-3 text-blue-400 font-bold">{f.fatura_no}</td>
                                <td className="px-4 py-3 text-gray-400">{fmtTarih(f.fatura_tarihi)}</td>
                                <td className="px-4 py-3 text-right font-black text-yazi">₺{fmt(f.toplam_tutar)}</td>
                                <td className="px-4 py-3">
                                  <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${durumRenk(f.durum)}`}>
                                    {durumEtiket(f.durum)}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {f.durum !== "odendi" && (
                                      <button onClick={() => buAyTekDurumGuncelle(f.id, "odendi")}
                                        className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-lg hover:bg-emerald-500/20 transition-colors whitespace-nowrap">
                                        Ödendi
                                      </button>
                                    )}
                                    {f.durum === "bekliyor" && (
                                      <button onClick={() => buAyTekDurumGuncelle(f.id, "gecikti")}
                                        className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded-lg hover:bg-red-500/20 transition-colors whitespace-nowrap">
                                        Gecikti
                                      </button>
                                    )}
                                    <button onClick={() => buAyDuzenleAc(f)}
                                      className="text-[10px] font-bold text-gray-400 bg-white/[0.04] border border-white/10 px-2 py-1 rounded-lg hover:bg-white/10 transition-colors">
                                      <Edit2 size={10} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-cizgi bg-alan">
                              <td colSpan={2} className="px-5 py-3 text-[10px] text-gray-600 font-bold uppercase">{grup.faturalar.length} fatura</td>
                              <td className="px-4 py-3 text-right text-sm font-black text-amber-400">₺{fmt(grup.toplam)}</td>
                              <td colSpan={2} />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Düzenli / Diğer sekmeleri */}
          {aktifTab !== "buay" && (
            <>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                <input value={aramaMetni} onChange={e => setAramaMetni(e.target.value)} placeholder="Ünvan veya vergi no ara..."
                  className="w-full bg-kart border border-cizgi text-yazi text-xs h-9 pl-9 pr-3 rounded-xl outline-none focus:border-altin/50 placeholder:text-gray-700" />
              </div>

              {yukleniyor ? (
                <div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" /></div>
              ) : filtreliCariler.length === 0 ? (
                <div className="bg-kart border border-cizgi rounded-2xl py-16 text-center text-gray-600 text-xs uppercase tracking-widest">Cari bulunamadı</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filtreliCariler.map(c => {
                    const tutarlar = cariTutarMap.get(c.id);
                    const buAyTutar = tutarlar?.buAy || 0;
                    const toplamBorcCari = tutarlar?.toplam || 0;
                    return (
                      <div key={c.id} onClick={() => cariDetayAc(c)}
                        className="bg-kart border border-cizgi hover:border-blue-500/40 rounded-2xl p-5 cursor-pointer transition-all hover:bg-alan-2 group">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                            <span className="text-lg font-black text-blue-400">{c.unvan?.charAt(0)?.toUpperCase()}</span>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-lg shrink-0 ${c.tip === "tedarikci" ? "bg-orange-500/10 text-orange-400" : "bg-blue-500/10 text-blue-400"}`}>
                            {c.tip === "tedarikci" ? "Tedarikçi" : "Müşteri"}
                          </span>
                        </div>
                        <p className="text-sm font-black text-yazi group-hover:text-blue-400 transition-colors leading-tight mb-2">{c.unvan}</p>
                        {c.vergi_no && <p className="text-[11px] text-gray-600 flex items-center gap-1.5 mb-1"><Hash size={9} /> VN: {c.vergi_no}</p>}
                        {c.telefon && <p className="text-[11px] text-gray-600 flex items-center gap-1.5 mb-1"><Phone size={9} /> {c.telefon}</p>}
                        <div className="flex items-center gap-2 mt-2">
                          {c.varsayilan_kdv === null || c.varsayilan_kdv === undefined ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300">KDV tanımsız</span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/[0.04] text-gray-600">KDV %{Number(c.varsayilan_kdv)}</span>
                          )}
                          <button onClick={e => { e.stopPropagation(); setEkstreCari(c); }}
                            className="ml-auto flex items-center gap-1 text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-1 rounded-lg hover:bg-blue-500/20 transition-colors">
                            <ScrollText size={11} /> Ekstre
                          </button>
                        </div>
                        <div className="mt-3 pt-3 border-t border-cizgi space-y-1.5">
                          {buAyTutar > 0 && (
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-amber-400 font-bold">Bu Ay Ödenecek</span>
                              <span className="text-sm font-black text-amber-400">₺{fmt(buAyTutar)}</span>
                            </div>
                          )}
                          {toplamBorcCari > 0 ? (
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-red-600/80">Toplam Borç</span>
                              <span className="text-sm font-bold text-red-400">₺{fmt(toplamBorcCari)}</span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-emerald-400 font-bold">Borç Yok</span>
                              <CheckCircle2 size={14} className="text-emerald-400" />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* CARİ DETAY */}
      {seciliCari && (
        <div className="max-w-6xl mx-auto px-4 py-5 space-y-4">

          {/* 4 kart */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-kart border border-cizgi rounded-2xl p-4">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Toplam Fatura</p>
              <p className="text-2xl font-black text-blue-400">₺{fmt(toplamFatura)}</p>
              <p className="text-[10px] text-gray-600 mt-1">{cariFaturalar.length} fatura</p>
            </div>
            <div className="bg-kart border border-emerald-500/20 rounded-2xl p-4">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Toplam Ödeme</p>
              <p className="text-2xl font-black text-emerald-400">₺{fmt(toplamOdeme)}</p>
              <p className="text-[10px] text-gray-600 mt-1">{cariOdemeler.length} ödeme</p>
            </div>
            <div className={`bg-kart border rounded-2xl p-4 ${toplamBorc > 0 ? "border-red-500/20" : "border-emerald-500/20"}`}>
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Toplam Borç</p>
              <p className={`text-2xl font-black ${toplamBorc > 0 ? "text-red-400" : "text-emerald-400"}`}>₺{fmt(toplamBorc)}</p>
              <p className="text-[10px] text-gray-600 mt-1">{toplamBorc < 0 ? "fazla ödenmiş (avans)" : "toplam fatura − toplam ödeme"}</p>
            </div>
            {keboVade ? (
              <div className="bg-kart border border-amber-500/20 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-xs text-gray-500 uppercase tracking-widest">Vadesi Gelen</p>
                  <input type="date" value={keboOdemeTarihi} onChange={e => e.target.value && setKeboOdemeTarihi(e.target.value)}
                    title="Ödeme günü (her cuma) — bu tarihe kadar 15 günlük vadesi dolan faturalar"
                    className="bg-alan border border-cizgi text-yazi text-[10px] h-6 px-1.5 rounded-md outline-none" />
                </div>
                <p className="text-2xl font-black text-amber-400">₺{fmt(keboVade.toplam)}</p>
                <p className="text-[10px] text-gray-600 mt-1">
                  {fmtTarih(keboOdemeTarihi)}&apos;e kadar · {keboVade.kalemler.length} fatura
                  {keboVade.gecikmis > 0 && <span className="text-red-400"> · ₺{fmt(keboVade.gecikmis)} gecikmiş</span>}
                </p>
              </div>
            ) : (
              <div className="bg-kart border border-amber-500/20 rounded-2xl p-4">
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Bu Ay Ödenecek</p>
                <p className="text-2xl font-black text-amber-400">₺{fmt(buAyOdenecek)}</p>
                <p className="text-[10px] text-gray-600 mt-1">{fmtTarih(donem.donemBas)} – {fmtTarih(donem.donemBit)}</p>
              </div>
            )}
          </div>

          {/* Kebo: bu cuma ödenecek faturalar (fatura + 15 gün vade) */}
          {keboVade && (
            <div className="bg-kart border border-amber-500/20 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-cizgi flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-yazi">{fmtTarih(keboOdemeTarihi)} ödemesi — vadesi gelen faturalar</p>
                  <p className="text-[10px] text-gray-500">Kebo&apos;da her fatura 15 gün vadeli; kısmi ödenmiş kısım en eski faturadan düşülür. Sonraki vadelere kalan: ₺{fmt(keboVade.sonraki)}</p>
                </div>
                <button onClick={keboVadeOde} disabled={keboVade.toplam <= 0}
                  className="flex items-center gap-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 px-4 py-2 rounded-xl transition-colors">
                  <Wallet size={14} /> ₺{fmt(keboVade.toplam)} Öde
                </button>
              </div>
              {keboVade.kalemler.length === 0 ? (
                <p className="px-4 py-4 text-xs text-gray-600">Bu tarihe kadar vadesi dolan fatura yok.</p>
              ) : (
                <div className="divide-y divide-cizgi">
                  {keboVade.kalemler.map(k => (
                    <div key={k.id} className="px-4 py-2 flex items-center justify-between text-xs">
                      <span className="text-gray-400"><b className="text-blue-400">{k.fatura_no}</b> · {fmtTarih(k.fatura_tarihi)} · vade <span className={k.vade < bugun() ? "text-red-400 font-bold" : "text-yazi"}>{fmtTarih(k.vade)}</span></span>
                      <span className="font-black text-yazi">₺{fmt(k.kalan)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Arama */}
          <div className="space-y-1.5">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
              <input value={detayArama} onChange={e => setDetayArama(e.target.value)} placeholder="Bu caride ara — fatura no, açıklama, tutar veya tarih…"
                className="w-full bg-kart border border-cizgi text-yazi text-xs h-10 pl-9 pr-9 rounded-xl outline-none focus:border-altin/50 placeholder:text-gray-700" />
              {detayArama && (
                <button onClick={() => setDetayArama("")} title="Aramayı temizle" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-yazi"><X size={13} /></button>
              )}
            </div>
            {detayKelimeler && (
              <p className="text-[11px] text-gray-500 px-1">
                {gorunenListe.filter(i => i.tip === "fatura").length} fatura · {gorunenListe.filter(i => i.tip === "odeme").length} ödeme bulundu
              </p>
            )}
          </div>

          {/* Birleşik tablo */}
          <div className="bg-kart border border-cizgi rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-cizgi">
                  <th className="px-4 py-4 w-10">
                    <button onClick={hepsiniSec} className="text-gray-500 hover:text-yazi transition-colors">
                      {hepsiSecili ? <CheckSquare size={15} className="text-blue-400" /> : <Square size={15} />}
                    </button>
                  </th>
                  <th className="text-left px-4 py-4 text-xs text-gray-500 uppercase tracking-widest font-semibold">Tür</th>
                  <th className="text-left px-4 py-4 text-xs text-gray-500 uppercase tracking-widest font-semibold">No / Açıklama</th>
                  <th className="text-left px-4 py-4 text-xs text-gray-500 uppercase tracking-widest font-semibold">Tarih</th>
                  <th className="text-right px-4 py-4 text-xs text-red-400 uppercase tracking-widest font-semibold">Fatura Tutarı</th>
                  <th className="text-right px-4 py-4 text-xs text-emerald-400 uppercase tracking-widest font-semibold">Ödeme Tutarı</th>
                  <th className="text-left px-4 py-4 text-xs text-gray-500 uppercase tracking-widest font-semibold">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cizgi">
                {gorunenListe.length === 0 ? (
                  <tr><td colSpan={7} className="py-16 text-center text-gray-500 text-sm">{detayKelimeler ? "Aramaya uyan kayıt yok" : "Kayıt bulunamadı"}</td></tr>
                ) : gorunenListe.map((item) => {
                  if (item.tip === "fatura") {
                    const f = item.veri as Fatura & { gercekDurum: string };
                    const secili = seciliFaturalar.has(f.id);
                    return (
                      <tr key={`f-${f.id}`} className={`transition-colors cursor-pointer ${secili ? "bg-altin/10" : "hover:bg-white/[0.03]"}`}
                        onClick={() => faturaSec(f.id)}>
                        <td className="px-4 py-4">
                          <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${secili ? "bg-altin border-altin" : "border-gray-400"}`}>
                            {secili && <Check size={11} className="text-[#1a1408]" />}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">Fatura</span>
                        </td>
                        <td className="px-4 py-4 text-sm font-bold text-yazi">{f.fatura_no}</td>
                        <td className="px-4 py-4 text-sm text-gray-700">{fmtTarih(f.fatura_tarihi)}</td>
                        <td className="px-4 py-4 text-right text-base font-black text-red-400">₺{fmt(f.toplam_tutar)}</td>
                        <td className="px-4 py-4 text-right text-gray-700">—</td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${durumRenk(f.gercekDurum)}`}>
                              {durumEtiket(f.gercekDurum)}
                            </span>
                            <button onClick={e => { e.stopPropagation(); setFaturaDuzenle(f); }} title="Faturayı düzenle (no, tarih, tutar)"
                              className="text-gray-400 hover:text-blue-400 transition-colors"><Edit2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  } else {
                    const o = item.veri as Odeme;
                    return (
                      <tr key={`o-${o.id}`} onClick={() => setOdemeDetay(o)} title="Hangi faturalara ait olduğunu gör / düzenle"
                        className="bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors cursor-pointer">
                        <td className="px-4 py-4 text-gray-700">—</td>
                        <td className="px-4 py-4">
                          <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Ödeme</span>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700">{o.aciklama || o.odeme_yontemi}</td>
                        <td className="px-4 py-4 text-sm text-gray-700">{fmtTarih(o.tarih)}</td>
                        <td className="px-4 py-4 text-right text-gray-700">—</td>
                        <td className="px-4 py-4 text-right text-base font-black text-emerald-400">₺{fmt(o.tutar)}</td>
                        <td className="px-4 py-4 text-sm text-gray-500">
                          <div className="flex items-center justify-between gap-2">
                            <span>{o.odeme_yontemi}{serbestOdemeMi(o) ? " · faturasız" : o.fatura_idleri?.length ? ` · ${o.fatura_idleri.length} fatura` : ""}</span>
                            {!o.rapor_id && (
                              <button onClick={e => { e.stopPropagation(); odemeSil(o); }} title="Ödemeyi sil" className="text-gray-400 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  }
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-cizgi bg-alan">
                  <td colSpan={3} className="px-4 py-4 text-xs text-gray-500 font-bold uppercase tracking-widest">
                    {cariFaturalar.length} Fatura · {cariOdemeler.length} Ödeme
                  </td>
                  <td className="px-4 py-4" />
                  <td className="px-4 py-4 text-right">
                    <p className="text-xs text-gray-500 mb-0.5">Toplam Fatura</p>
                    <p className="text-sm font-black text-red-400">₺{fmt(toplamFatura)}</p>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <p className="text-xs text-gray-500 mb-0.5">Toplam Ödeme</p>
                    <p className="text-sm font-black text-emerald-400">₺{fmt(toplamOdeme)}</p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-xs text-gray-500 mb-0.5">Toplam Borç</p>
                    <p className={`text-sm font-black ${toplamBorc > 0 ? "text-red-400" : "text-emerald-400"}`}>₺{fmt(toplamBorc)}</p>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* TOPLU İŞLEM ÇUBUĞU */}
      {seciliFaturalar.size > 0 && seciliCari && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-kart/98 backdrop-blur-xl border-t border-blue-500/30 px-4 py-3">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-sm font-black text-blue-400">{seciliFaturalar.size} fatura seçildi</span>
              <span className="text-sm font-black text-yazi">· ₺{fmt(seciliToplam)}</span>
              <button onClick={() => setSeciliFaturalar(new Set())} className="text-[11px] text-gray-500 hover:text-yazi transition-colors">Seçimi Temizle</button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => odemeAc(true, seciliCari, platformCariMi(seciliCari) ? HAKEDIS_MAHSUP : HATIR_FATURASI)} disabled={topluIslemYukleniyor}
                title="Hakedişten kesilen ya da ödemesiz (hatır) faturaları kasaya yansıtmadan kapatır"
                className="flex items-center gap-1.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-40 px-4 py-2 rounded-xl transition-colors">
                <CheckCircle2 size={12} /> Kasasız Kapat
              </button>
              <button onClick={() => topluDurumGuncelle("odendi")} disabled={topluIslemYukleniyor}
                className="flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 px-4 py-2 rounded-xl transition-colors">
                {topluIslemYukleniyor ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Ödendi
              </button>
              <button onClick={() => topluDurumGuncelle("gecikti")} disabled={topluIslemYukleniyor}
                className="text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 px-4 py-2 rounded-xl transition-colors">
                Gecikti
              </button>
              <button onClick={() => topluDurumGuncelle("bekliyor")} disabled={topluIslemYukleniyor}
                className="text-xs font-bold text-yazi bg-yellow-600 hover:bg-yellow-700 disabled:opacity-40 px-4 py-2 rounded-xl transition-colors">
                Ödenmedi
              </button>
              <button onClick={topluSil} disabled={topluIslemYukleniyor}
                className="flex items-center gap-1.5 text-xs font-bold text-yazi bg-alan-2 hover:bg-cizgi-guclu disabled:opacity-40 px-4 py-2 rounded-xl transition-colors">
                <Trash2 size={12} /> Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* YENİ CARİ MODAL */}
      {modalAcik && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-kart border border-cizgi rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-black text-yazi">{duzenlenenCariId ? "Cariyi Düzenle" : "Yeni Cari"}</h3>
              <button onClick={() => setModalAcik(false)} className="text-gray-600 hover:text-yazi"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Kategori</p>
                <select value={form.kategori} onChange={e => setForm({ ...form, kategori: e.target.value })} className={inputCls}>
                  <option value="duzenli" className="bg-kart">Düzenli Ödeme</option>
                  <option value="diger" className="bg-kart">Diğer</option>
                </select>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Cari Tipi</p>
                <select value={form.tip} onChange={e => setForm({ ...form, tip: e.target.value })} className={inputCls}>
                  <option value="tedarikci" className="bg-kart">Tedarikçi</option>
                  <option value="musteri" className="bg-kart">Müşteri</option>
                </select>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Ünvan *</p>
                <input value={form.unvan} onChange={e => setForm({ ...form, unvan: e.target.value })} placeholder="Firma adı..." className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Vergi No</p>
                  <input value={form.vergi_no} onChange={e => setForm({ ...form, vergi_no: e.target.value })} placeholder="1234567890" className={inputCls} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Telefon</p>
                  <input value={form.telefon} onChange={e => setForm({ ...form, telefon: e.target.value })} placeholder="05xx..." className={inputCls} />
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Varsayılan KDV</p>
                <select value={form.varsayilan_kdv} onChange={e => setForm({ ...form, varsayilan_kdv: e.target.value })} className={inputCls}>
                  <option value="" className="bg-kart">Tanımsız</option>
                  {["0", "1", "10", "20"].map(v => <option key={v} value={v} className="bg-kart">%{v}</option>)}
                </select>
                <p className="text-[10px] text-gray-500 mt-1">İrsaliyeden fatura oluştururken ve KDV özetinde kullanılır. Tanımsızsa KDV özetinde bu carinin KDV&apos;siz girilmiş faturaları tahmin edilmez.</p>
                <label className="flex items-start gap-2 mt-3 text-xs text-gray-500 cursor-pointer select-none">
                  <input type="checkbox" className="mt-0.5" checked={!!form.hakedisten_mahsup} onChange={e => setForm({ ...form, hakedisten_mahsup: e.target.checked })} />
                  <span>Faturaları platform hakedişinden kesiliyor (Yemeksepeti, Getir, Migros, Trendyol…) — ödemeleri varsayılan olarak &quot;{HAKEDIS_MAHSUP}&quot; ile kapanır, kasaya yansımaz.</span>
                </label>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setModalAcik(false)} className="flex-1 text-sm font-semibold text-gray-500 hover:text-yazi border border-cizgi py-3 rounded-xl transition-colors">İptal</button>
                <button onClick={kaydet} disabled={formSaving} className="flex-1 text-sm font-bold text-[#1a1408] kebo-btn-altin hover:brightness-110 disabled:opacity-40 py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                  {formSaving ? <Loader2 size={14} className="animate-spin" /> : null} Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ÖDEME MODAL */}
      {odemeModalAcik && seciliCari && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-kart border border-cizgi rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-cizgi shrink-0">
              <h3 className="text-base font-black text-yazi">Ödeme Ekle</h3>
              <button onClick={() => setOdemeModalAcik(false)} className="text-gray-600 hover:text-yazi"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {odenmemisFaturalar.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-widest mb-3 font-bold">Ödenmemiş Faturalar</p>
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {odenmemisFaturalar.map(f => (
                      <div key={f.id} onClick={() => faturaSec(f.id)}
                        className={`flex items-center justify-between px-4 py-3 rounded-xl border cursor-pointer transition-all ${seciliFaturalar.has(f.id) ? "bg-altin/10 border-altin/40" : "bg-alan border-cizgi hover:border-cizgi-guclu"}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${seciliFaturalar.has(f.id) ? "bg-altin border-altin" : "border-gray-400"}`}>
                            {seciliFaturalar.has(f.id) && <CheckCircle2 size={12} className="text-[#1a1408]" />}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-yazi">{f.fatura_no}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{fmtTarih(f.fatura_tarihi)}</p>
                          </div>
                        </div>
                        <span className="text-sm font-black text-emerald-400">₺{fmt(f.toplam_tutar)}</span>
                      </div>
                    ))}
                  </div>
                  {seciliFaturalar.size > 0 && (
                    <div className="mt-3 flex items-center justify-between bg-blue-600/10 border border-blue-500/20 rounded-xl px-4 py-3">
                      <span className="text-sm text-blue-400">{seciliFaturalar.size} fatura seçildi</span>
                      <span className="text-base font-black text-blue-400">₺{fmt(seciliToplam)}</span>
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-alan-2" />
                <span className="text-xs text-gray-600 uppercase tracking-widest">veya manuel tutar</span>
                <div className="flex-1 h-px bg-alan-2" />
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Manuel Tutar (₺)</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-sm">₺</span>
                  <input type="text" inputMode="decimal" value={manuelTutar}
                    onChange={e => { const v = paraGirdisi(e.target.value); setManuelTutar(v); if (v) setSeciliFaturalar(new Set()); }}
                    placeholder={seciliFaturalar.size > 0 ? fmt(seciliToplam) : "0"}
                    className={`${inputCls} pl-8`} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Tarih</p>
                  <input type="date" value={odemeTarih} onChange={e => setOdemeTarih(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Hangi hesaptan</p>
                  <select value={odemeYontemi} onChange={e => setOdemeYontemi(e.target.value)} className={inputCls}>
                    {ODEME_SECENEKLERI.map(y => (
                      <option key={y} value={y} className="bg-kart">{HESAP_ETIKET[y] || y}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-gray-500 -mt-2">
                {odemeYontemi === HAKEDIS_MAHSUP
                  ? "Fatura online hakedişten kesildi — kapanır ama Kasa & Finans'a hiçbir hareket yazılmaz."
                  : odemeYontemi === HATIR_FATURASI
                  ? "Ödeme yapılmayan (KDV için kesilen) fatura — kapanır; Kasa & Finans'a hareket yazılmaz ve Kâr/Zarar'da mal alışına girmez."
                  : platformCariMi(seciliCari) && (GIDER_HESAPLARI as readonly string[]).includes(odemeYontemi)
                  ? `Dikkat: bu platform carisi. Fatura hakedişten kesildiyse "${HAKEDIS_MAHSUP}" seçin, yoksa ${HESAP_ETIKET[odemeYontemi]} bakiyesi düşer.`
                  : kartMi(odemeYontemi)
                  ? `Ödeme ${HESAP_ETIKET[odemeYontemi]} borcuna otomatik eklenecek (Kasa & Finans'a ayrıca girmeyin).`
                  : (GIDER_HESAPLARI as readonly string[]).includes(odemeYontemi)
                  ? `Ödeme ${HESAP_ETIKET[odemeYontemi]} bakiyesinden otomatik düşülecek (Kasa & Finans'a ayrıca girmeyin).`
                  : "Bu yöntem Kasa bakiyelerine yansımaz."}
              </p>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Açıklama</p>
                <input value={odemeAciklama} onChange={e => setOdemeAciklama(e.target.value)} placeholder="Opsiyonel..." className={inputCls} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-cizgi shrink-0">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-gray-500">{kasasizMi(odemeYontemi) ? "Kapatılacak Tutar" : "Ödenecek Tutar"}</span>
                <span className="text-2xl font-black text-emerald-400">
                  ₺{fmt(manuelTutar ? tv(manuelTutar) : seciliToplam)}
                </span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setOdemeModalAcik(false)} className="flex-1 text-sm font-semibold text-gray-500 hover:text-yazi border border-cizgi py-3 rounded-xl transition-colors">İptal</button>
                <button onClick={odemeKaydet} disabled={formSaving || (!manuelTutar && seciliFaturalar.size === 0)}
                  className="flex-1 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                  {formSaving ? <Loader2 size={14} className="animate-spin" /> : null} {kasasizMi(odemeYontemi) ? "Faturaları Kapat" : "Ödemeyi Onayla"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FATURA EKLE MODAL */}
      {faturaModalAcik && seciliCari && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-kart border border-cizgi rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-cizgi shrink-0">
              <div>
                <h3 className="text-base font-black text-yazi">Fatura Ekle</h3>
                <p className="text-[10px] text-gray-600 mt-0.5">{seciliCari.unvan}</p>
              </div>
              <button onClick={() => setFaturaModalAcik(false)} className="text-gray-600 hover:text-yazi"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Fatura No</p>
                <input value={faturaForm.fatura_no} onChange={e => setFaturaForm(p => ({ ...p, fatura_no: e.target.value }))} placeholder="Örn. ABC2026000123" className={inputCls} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Fatura Tarihi</p>
                  <input type="date" value={faturaForm.fatura_tarihi} onChange={e => setFaturaForm(p => ({ ...p, fatura_tarihi: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Vade <span className="normal-case tracking-normal text-gray-600">(opsiyonel)</span></p>
                  <input type="date" value={faturaForm.vade_tarihi} onChange={e => setFaturaForm(p => ({ ...p, vade_tarihi: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Tutar (₺)</p>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-sm">₺</span>
                    <input type="text" inputMode="decimal" value={faturaForm.tutar} placeholder="0"
                      onChange={e => setFaturaForm(p => ({ ...p, tutar: paraGirdisi(e.target.value) }))}
                      className={`${inputCls} pl-8`} />
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">KDV %</p>
                  <select value={faturaForm.kdv} onChange={e => setFaturaForm(p => ({ ...p, kdv: e.target.value }))} className={inputCls}>
                    {Array.from(new Set(["0", "1", "10", "20", faturaForm.kdv])).map(k => <option key={k} value={k} className="bg-kart">%{k}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none -mt-1">
                <input type="checkbox" checked={faturaForm.kdvDahil} onChange={e => setFaturaForm(p => ({ ...p, kdvDahil: e.target.checked }))} />
                Girdiğim tutar KDV dahil (fatura toplamı)
              </label>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Açıklama</p>
                <input value={faturaForm.aciklama} onChange={e => setFaturaForm(p => ({ ...p, aciklama: e.target.value }))} placeholder="Opsiyonel..." className={inputCls} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-cizgi shrink-0">
              <div className="flex items-center justify-between mb-1 text-xs text-gray-500">
                <span>Matrah ₺{fmt(faturaHesap.matrah)} + KDV ₺{fmt(faturaHesap.kdv)}</span>
              </div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-gray-500">Fatura Toplamı</span>
                <span className="text-2xl font-black text-blue-400">₺{fmt(faturaHesap.toplam)}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setFaturaModalAcik(false)} className="flex-1 text-sm font-semibold text-gray-500 hover:text-yazi border border-cizgi py-3 rounded-xl transition-colors">İptal</button>
                <button onClick={faturaKaydet} disabled={formSaving || !faturaForm.fatura_no.trim() || faturaHesap.toplam <= 0}
                  className="flex-1 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                  {formSaving ? <Loader2 size={14} className="animate-spin" /> : null} Faturayı Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {odemeDetay && seciliCari && (
        <OdemeDetay key={odemeDetay.id} odeme={odemeDetay} faturalar={cariFaturalar} odemeler={cariOdemeler}
          onKapat={() => setOdemeDetay(null)}
          onKaydedildi={mesaj => { setOdemeDetay(null); showToast("basari", mesaj); cariDetayAc(seciliCari); veriCek(); }} />
      )}
      {faturaDuzenle && seciliCari && (
        <FaturaDuzenle key={faturaDuzenle.id} fatura={faturaDuzenle} odemeler={cariOdemeler}
          onKapat={() => setFaturaDuzenle(null)}
          onOdemeAc={o => { setFaturaDuzenle(null); setOdemeDetay(o as Odeme); }}
          onKaydedildi={mesaj => { setFaturaDuzenle(null); showToast("basari", mesaj); cariDetayAc(seciliCari); veriCek(); }} />
      )}

      {keboEkstreAcik && seciliCari && (
        <KeboEkstreYukle cari={seciliCari} faturalar={cariFaturalar} odemeler={cariOdemeler}
          onKapat={() => setKeboEkstreAcik(false)}
          onTamam={mesaj => { setKeboEkstreAcik(false); showToast("basari", mesaj); cariDetayAc(seciliCari); veriCek(); }} />
      )}

      {ekstreCari && <CariEkstre cari={ekstreCari} onKapat={() => setEkstreCari(null)} />}

      {/* BU AY FATURA DÜZENLEME MODAL */}
      {duzenleModal.acik && duzenleModal.fatura && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-kart border border-cizgi rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-sm font-black text-yazi">Fatura Düzenle</h3>
                <p className="text-[10px] text-gray-600 mt-0.5">{duzenleModal.fatura.fatura_no} · {duzenleModal.fatura.cari_unvan}</p>
              </div>
              <button onClick={() => setDuzenleModal({ acik: false, fatura: null })} className="text-gray-600 hover:text-yazi"><X size={16} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Tutar (₺)</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-sm">₺</span>
                  <input type="text" inputMode="decimal" value={duzenleForm.tutar}
                    onChange={e => setDuzenleForm(prev => ({ ...prev, tutar: paraGirdisi(e.target.value) }))}
                    className={`${inputCls} pl-8`} />
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Durum</p>
                <select value={duzenleForm.durum}
                  onChange={e => setDuzenleForm(prev => ({ ...prev, durum: e.target.value }))}
                  className={inputCls}>
                  <option value="bekliyor" className="bg-kart">Bekliyor</option>
                  <option value="gecikti" className="bg-kart">Gecikti</option>
                </select>
                <p className="text-[10px] text-gray-500 mt-1.5">Ödendi işaretlemek için &quot;Ödendi&quot; butonuyla ödeme kaydı girin.</p>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setDuzenleModal({ acik: false, fatura: null })}
                  className="flex-1 text-sm font-semibold text-gray-500 hover:text-yazi border border-cizgi py-2.5 rounded-xl transition-colors">İptal</button>
                <button onClick={buAyDuzenleKaydet} disabled={formSaving}
                  className="flex-1 text-sm font-bold text-[#1a1408] kebo-btn-altin hover:brightness-110 disabled:opacity-40 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                  {formSaving ? <Loader2 size={13} className="animate-spin" /> : null} Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
