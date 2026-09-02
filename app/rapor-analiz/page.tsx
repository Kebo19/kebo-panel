"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  BarChart3, Calendar, RefreshCw, Bot, Send, Loader2,
  ArrowUpRight, ArrowDownRight, Wallet, TrendingUp,
  TrendingDown, PieChart, AlertTriangle, X, Sparkles,
  ChevronRight, MessageSquare, Zap, Truck, Percent, CheckCircle2
} from "lucide-react";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, YAxis } from "recharts";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface GunlukRapor {
  id: string; tarih: string;
  os_yemeksepeti: number; os_getir: number; os_trendyol: number; os_migros: number;
  ko_yemeksepeti: number; ko_getir: number; ko_trendyol: number; ko_migros: number; ko_alo_paket: number;
  kasa_nakit: number; kasa_pos: number; kasa_edenred: number; kasa_metropol?: number;
  gunluk_gider: number; iade_tutar: number; toplam_ciro: number;
  kurye_raporlari?: any[];
  // 02.09.2026: MagicPay karşılaştırması için — platform indirim alanları (select("*")
  // zaten hepsini getiriyor, burada sadece TypeScript'e tanıtıyoruz).
  os_kebo_ys_indirim?: number; os_cnf_ys_indirim?: number;
  os_kebo_trendyol_indirim?: number; os_cnf_trendyol_indirim?: number;
  ko_kebo_ys_indirim?: number; ko_cnf_ys_indirim?: number;
  ko_kebo_trendyol_indirim?: number; ko_cnf_trendyol_indirim?: number;
}

interface ChatMesaj { rol: "user" | "assistant"; icerik: string; zaman: Date; }

interface AIAnaliz {
  ozet: string;
  basarilar: string[];
  riskler: string[];
  oneriler: string[];
  oncelik: "iyi" | "orta" | "kritik";
  chartData: { name: string; deger: number; onceki?: number }[];
  hedef: string;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const RAPOR_TURLERI = [
  { key: "genel", label: "Genel Özet", desc: "Brüt/net ciro, gider, paket toplamları" },
  { key: "platform", label: "Platform Detayı", desc: "Her platformun online + kapıda satışları" },
  { key: "kasa", label: "Kasa Dağılımı", desc: "Nakit, POS, Edenred ödeme yöntemleri" },
  { key: "gunluk", label: "Gün Gün Liste", desc: "Seçilen tarih aralığında her günün detayı" },
  { key: "karsilastirma", label: "Platform Karşılaştırma", desc: "Platformları yan yana karşılaştır" },
  { key: "roadrunner", label: "Roadrunner Mutabakatı", desc: "Seçilen dönem için kurye paket ücreti, POS komisyonu ve tahsilat mutabakatı (haftalık hesap için tarih aralığını o haftaya ayarlayın)" },
  { key: "magicpay", label: "MagicPay Karşılaştırma", desc: "MagicPay (kebo-admin-ui) POS/online sipariş sisteminden çekilen rakamlarla, buraya elle girilen raporun karşılaştırması" },
];

// 02.09.2026: Roadrunner kurye mutabakatı — rapor girişindeki günlük kurye verilerinden
// (paket sayısı, uzak/9km üzeri paket, nakit/pos tahsilat) seçilen tarih aralığı için
// otomatik hesaplanır. Sabit kuryede (Roadrunner) günlük en az 30 paket garantisi var;
// altında kalınırsa 30 üzerinden ücretlendirilir. Rakamlar (₺100/paket, %5 POS komisyonu,
// 1.5x/2x mesafe katsayıları) canın 02.09.2026 tarihli talimatına göre girildi — Roadrunner
// ile yapılan gerçek sözleşme farklıysa bu sabitleri güncellemek yeterli.
const RR_PAKET_UCRETI = 100; // ₺ / normal (1x) paket
const RR_UZAK_KATSAYI = 1.5; // uzak paketler
const RR_KM9_KATSAYI = 2; // 9km üzeri paketler
const RR_POS_KOMISYON_ORANI = 0.05; // kapıda ödeme POS tahsilatından kesilen komisyon
const RR_KURYE_GARANTI = 30; // sabit kurye günlük min. paket garantisi

const PLATFORM_COLORS: Record<string, string> = {
  Yemeksepeti: "#FF6B35", Getir: "#8B5CF6", Trendyol: "#F97316", Migros: "#10B981", "Alo Paket": "#3B82F6",
};

const PATRONLAR = ["murat@kebo.com", "bulent@kebo.com"];

const PLATFORM_KOLON = {
  Yemeksepeti: { online: "os_yemeksepeti", kapida: "ko_yemeksepeti" },
  Getir: { online: "os_getir", kapida: "ko_getir" },
  Trendyol: { online: "os_trendyol", kapida: "ko_trendyol" },
  Migros: { online: "os_migros", kapida: "ko_migros" },
  "Alo Paket": { online: null, kapida: "ko_alo_paket" },
};

const HAZIR_SORULAR = [
  "Bu dönemin genel performansını değerlendir, güçlü ve zayıf yönlerimi söyle",
  "Hangi platform en kârlı, hangisine daha fazla yatırım yapmalıyım?",
  "Giderlerimi nasıl optimize edebilirim? Somut öneriler ver",
  "Bir sonraki ay için ciro tahminim ne olmalı?",
  "İşletmemi büyütmek için en kritik 3 adım nedir?",
  "En düşük performanslı günlerin ortak nedeni ne olabilir?",
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const fmt = (v: number) => new Intl.NumberFormat("tr-TR").format(Math.round(v));
const fmtTarih = (t: string) => { if (!t) return ""; const [y, m, d] = t.split("-"); return `${d}.${m}.${y}`; };

function TrendBadge({ value, prev }: { value: number; prev: number }) {
  if (!prev) return null;
  const pct = ((value - prev) / prev) * 100;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-lg ${pct >= 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}>
      {pct >= 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ─── ANA SAYFA ────────────────────────────────────────────────────────────────

export default function RaporAnalizPage() {
  const supabase = createClient();
  const [yetkili, setYetkili] = useState(false);
  const [yetkiYukleniyor, setYetkiYukleniyor] = useState(true);

  const [baslangic, setBaslangic] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [bitis, setBitis] = useState(() => new Date().toISOString().split("T")[0]);
  const [raporTuru, setRaporTuru] = useState("genel");
  const [seciliPlatformlar, setSeciliPlatformlar] = useState<string[]>(["Yemeksepeti", "Getir", "Trendyol", "Migros", "Alo Paket"]);
  const [odemeFiltre, setOdemeFiltre] = useState<"hepsi" | "online" | "kapida">("hepsi");

  const [raporlar, setRaporlar] = useState<GunlukRapor[]>([]);
  const [oncekiRaporlar, setOncekiRaporlar] = useState<GunlukRapor[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);

  // AI state
  const [aktifAiSekme, setAktifAiSekme] = useState<"analiz" | "chat">("analiz");
  const [mesajlar, setMesajlar] = useState<ChatMesaj[]>([]);
  const [soru, setSoru] = useState("");
  const [aiYukleniyor, setAiYukleniyor] = useState(false);
  const [otomatikAnaliz, setOtomatikAnaliz] = useState<AIAnaliz | null>(null);
  const [analizYukleniyor, setAnalizYukleniyor] = useState(false);
  const chatSonRef = useRef<HTMLDivElement>(null);

  // MagicPay karşılaştırma (02.09.2026) — dış API'ye her tab açılışında değil, sadece
  // kullanıcı "Karşılaştır" butonuna bastığında istek atıyoruz.
  const [mpVeri, setMpVeri] = useState<{ gunler: any[]; kurye: any } | null>(null);
  const [mpYukleniyor, setMpYukleniyor] = useState(false);
  const [mpHata, setMpHata] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email && PATRONLAR.includes(user.email.toLowerCase())) setYetkili(true);
      setYetkiYukleniyor(false);
    });
  }, []);

  const oncekiAralik = useMemo(() => {
    if (!baslangic || !bitis) return null;
    const bas = new Date(baslangic), bit = new Date(bitis);
    const gun = Math.round((bit.getTime() - bas.getTime()) / 86400000);
    const ob = new Date(bas); ob.setDate(bas.getDate() - gun - 1);
    const obit = new Date(bas); obit.setDate(bas.getDate() - 1);
    const f = (d: Date) => d.toISOString().split("T")[0];
    return { bas: f(ob), bit: f(obit) };
  }, [baslangic, bitis]);

  const veriCek = useCallback(async () => {
    if (!baslangic || !bitis) return;
    setYukleniyor(true);
    const [{ data }, { data: onceki }] = await Promise.all([
      supabase.from("gunluk_raporlar").select("*").gte("tarih", baslangic).lte("tarih", bitis).order("tarih"),
      oncekiAralik
        ? supabase.from("gunluk_raporlar").select("*").gte("tarih", oncekiAralik.bas).lte("tarih", oncekiAralik.bit)
        : Promise.resolve({ data: [] }),
    ]);
    if (data) setRaporlar(data as GunlukRapor[]);
    if (onceki) setOncekiRaporlar(onceki as GunlukRapor[]);
    setYukleniyor(false);
    setOtomatikAnaliz(null);
  }, [baslangic, bitis, oncekiAralik]);

  useEffect(() => { if (yetkili) veriCek(); }, [yetkili, veriCek]);
  useEffect(() => { chatSonRef.current?.scrollIntoView({ behavior: "smooth" }); }, [mesajlar]);

  const stats = useMemo(() => {
    const sum = (arr: GunlukRapor[], key: keyof GunlukRapor) =>
      arr.reduce((s, r) => s + ((r[key] as number) || 0), 0);

    const platformToplam = (arr: GunlukRapor[], platform: string, tur: "hepsi" | "online" | "kapida") => {
      const kol = PLATFORM_KOLON[platform as keyof typeof PLATFORM_KOLON];
      if (!kol) return 0;
      let toplam = 0;
      if ((tur === "hepsi" || tur === "online") && kol.online)
        toplam += arr.reduce((s, r) => s + ((r[kol.online as keyof GunlukRapor] as number) || 0), 0);
      if ((tur === "hepsi" || tur === "kapida") && kol.kapida)
        toplam += arr.reduce((s, r) => s + ((r[kol.kapida as keyof GunlukRapor] as number) || 0), 0);
      return toplam;
    };

    const brutCiro = sum(raporlar, "toplam_ciro");
    const toplamGider = sum(raporlar, "gunluk_gider") + sum(raporlar, "iade_tutar");
    const netCiro = brutCiro - toplamGider;
    const paket = raporlar.reduce((s, r) => s + (r.kurye_raporlari?.reduce((ks: number, k: any) => ks + (parseInt(k.paketSayisi) || 0), 0) || 0), 0);
    const oncBrut = sum(oncekiRaporlar, "toplam_ciro");
    const oncNet = oncBrut - sum(oncekiRaporlar, "gunluk_gider") - sum(oncekiRaporlar, "iade_tutar");
    const oncGider = sum(oncekiRaporlar, "gunluk_gider") + sum(oncekiRaporlar, "iade_tutar");

    const platformlar = Object.fromEntries(
      Object.keys(PLATFORM_KOLON).map(p => [p, platformToplam(raporlar, p, odemeFiltre)])
    );
    const toplamPlatform = Object.values(platformlar).reduce((s, v) => s + v, 0);

    const gunlukDetay = raporlar.map(r => {
      const secilenPlatformToplam = seciliPlatformlar.reduce((s, p) => s + platformToplam([r], p, odemeFiltre), 0);
      const paket = r.kurye_raporlari?.reduce((s: number, k: any) => s + (parseInt(k.paketSayisi) || 0), 0) || 0;
      return {
        tarih: r.tarih,
        brutCiro: r.toplam_ciro || 0,
        net: (r.toplam_ciro || 0) - (r.gunluk_gider || 0) - (r.iade_tutar || 0),
        gider: (r.gunluk_gider || 0) + (r.iade_tutar || 0),
        secilenPlatform: secilenPlatformToplam,
        paket,
        platformDetay: Object.fromEntries(Object.keys(PLATFORM_KOLON).map(p => [p, platformToplam([r], p, odemeFiltre)])),
      };
    });

    return {
      brutCiro, netCiro, toplamGider, paket, oncBrut, oncNet, oncGider,
      kasaNakit: sum(raporlar, "kasa_nakit"),
      kasaPos: sum(raporlar, "kasa_pos"),
      kasaEdenred: sum(raporlar, "kasa_edenred"),
      platformlar, toplamPlatform,
      gunlukDetay,
      gunSayisi: raporlar.length,
      gunlukOrt: raporlar.length > 0 ? brutCiro / raporlar.length : 0,
      enIyi: [...raporlar].sort((a, b) => (b.toplam_ciro || 0) - (a.toplam_ciro || 0))[0],
      enKotu: [...raporlar].sort((a, b) => (a.toplam_ciro || 0) - (b.toplam_ciro || 0))[0],
      giderOrani: brutCiro > 0 ? (toplamGider / brutCiro) * 100 : 0,
    };
  }, [raporlar, oncekiRaporlar, seciliPlatformlar, odemeFiltre]);

  // ── Roadrunner Mutabakatı: seçilen dönemdeki tüm günlerin kurye satırlarını
  // (rapor girişindeki paketSayisi/uzakPaket/paket9km/nakit/pos) topluyor, kurye
  // bazında ve dönem toplamında paket ücreti + POS komisyonu hesaplıyor.
  const roadrunnerStats = useMemo(() => {
    const isimBazinda: Record<string, {
      isim: string; tip: string; normal: number; uzak: number; km9: number;
      gercek: number; uygulanan: number; garantiFarki: number; ucret: number; nakit: number; pos: number;
    }> = {};

    raporlar.forEach(r => {
      (r.kurye_raporlari || []).forEach((k: any) => {
        const sabit = k?.tip === "sabit";
        const normal = parseInt(k?.paketSayisi) || 0;
        const uzak = parseInt(k?.uzakPaket) || 0;
        const km9 = parseInt(k?.paket9km) || 0;
        const gercek = normal + uzak + km9;
        const uygulanan = sabit ? Math.max(gercek, RR_KURYE_GARANTI) : gercek;
        const garantiFarki = uygulanan - gercek; // sadece sabit kuryede ve 30'un altında kalındığında >0
        const ucret = normal * RR_PAKET_UCRETI
          + uzak * RR_PAKET_UCRETI * RR_UZAK_KATSAYI
          + km9 * RR_PAKET_UCRETI * RR_KM9_KATSAYI
          + garantiFarki * RR_PAKET_UCRETI; // garanti farkı normal (1x) ücretten tamamlanır
        const nakit = Number(k?.nakit) || 0;
        const pos = Number(k?.pos) || 0;

        const isim = (k?.isim || "").trim() || (sabit ? "Sabit Kurye" : "Havuz Kurye");
        const key = `${isim}__${sabit ? "sabit" : "havuz"}`;
        if (!isimBazinda[key]) isimBazinda[key] = { isim, tip: sabit ? "sabit" : "havuz", normal: 0, uzak: 0, km9: 0, gercek: 0, uygulanan: 0, garantiFarki: 0, ucret: 0, nakit: 0, pos: 0 };
        const acc = isimBazinda[key];
        acc.normal += normal; acc.uzak += uzak; acc.km9 += km9; acc.gercek += gercek;
        acc.uygulanan += uygulanan; acc.garantiFarki += garantiFarki; acc.ucret += ucret;
        acc.nakit += nakit; acc.pos += pos;
      });
    });

    const kuryeListesi = Object.values(isimBazinda).sort((a, b) => (a.tip === b.tip ? b.ucret - a.ucret : a.tip === "sabit" ? -1 : 1));

    const topla = (fn: (k: typeof kuryeListesi[number]) => number) => kuryeListesi.reduce((a, k) => a + fn(k), 0);
    const toplamNormal = topla(k => k.normal);
    const toplamUzak = topla(k => k.uzak);
    const toplamKm9 = topla(k => k.km9);
    const toplamGercek = topla(k => k.gercek);
    const toplamUygulanan = topla(k => k.uygulanan);
    const toplamGarantiFarki = topla(k => k.garantiFarki);
    const toplamPaketUcreti = topla(k => k.ucret);
    const toplamNakit = topla(k => k.nakit);
    const toplamPos = topla(k => k.pos);
    const posKomisyonu = toplamPos * RR_POS_KOMISYON_ORANI;
    const toplamBorc = toplamPaketUcreti + posKomisyonu; // Roadrunner'a ödenmesi/mahsup edilmesi gereken
    const toplamTahsilat = toplamNakit + toplamPos; // kuryelerin müşteriden kapıda tahsil ettiği toplam
    const mutabakatFarki = toplamTahsilat - toplamBorc; // (+) biz alacaklıyız, (-) biz borçluyuz

    return {
      kuryeListesi, toplamNormal, toplamUzak, toplamKm9, toplamGercek, toplamUygulanan, toplamGarantiFarki,
      toplamPaketUcreti, toplamNakit, toplamPos, posKomisyonu, toplamBorc, toplamTahsilat, mutabakatFarki,
    };
  }, [raporlar]);

  // ── Detaylı İşletme Özeti oluştur ──
  const isletmeOzeti = useMemo(() => {
    if (!raporlar.length) return "";
    const platformDetaylar = Object.entries(stats.platformlar)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}: ₺${fmt(v)} (pay: %${stats.toplamPlatform > 0 ? ((v/stats.toplamPlatform)*100).toFixed(1) : 0})`)
      .join(", ");

    const gunlukTrendler = stats.gunlukDetay.slice(-7)
      .map(g => `${fmtTarih(g.tarih)}: ₺${fmt(g.brutCiro)} ciro, ₺${fmt(g.gider)} gider`)
      .join(" | ");

    const enIyiGun = stats.enIyi ? `${fmtTarih(stats.enIyi.tarih)} (₺${fmt(stats.enIyi.toplam_ciro)})` : "-";
    const enKotuGun = stats.enKotu ? `${fmtTarih(stats.enKotu.tarih)} (₺${fmt(stats.enKotu.toplam_ciro)})` : "-";

    const ciroTrend = stats.oncBrut > 0
      ? `Önceki dönem brüt: ₺${fmt(stats.oncBrut)}, değişim: ${(((stats.brutCiro - stats.oncBrut) / stats.oncBrut) * 100).toFixed(1)}%`
      : "Önceki dönem verisi yok";

    return `
KEBO ERP İŞLETME RAPORU
Dönem: ${fmtTarih(baslangic)} - ${fmtTarih(bitis)} (${stats.gunSayisi} gün)

FİNANSAL ÖZET:
- Brüt Ciro: ₺${fmt(stats.brutCiro)}
- Net Ciro: ₺${fmt(stats.netCiro)}
- Toplam Gider: ₺${fmt(stats.toplamGider)} (gider oranı: %${stats.giderOrani.toFixed(1)})
- Günlük Ortalama: ₺${fmt(stats.gunlukOrt)}
- ${ciroTrend}

PLATFORM DAĞILIMI (${odemeFiltre === "hepsi" ? "Online + Kapıda" : odemeFiltre === "online" ? "Sadece Online" : "Sadece Kapıda"}):
${platformDetaylar}

KASA DAĞILIMI:
- Nakit: ₺${fmt(stats.kasaNakit)} (%${(stats.kasaNakit + stats.kasaPos + stats.kasaEdenred) > 0 ? (stats.kasaNakit / (stats.kasaNakit + stats.kasaPos + stats.kasaEdenred) * 100).toFixed(1) : 0})
- POS/Kart: ₺${fmt(stats.kasaPos)}
- Edenred: ₺${fmt(stats.kasaEdenred)}

GÜNLÜK PERFORMANS:
- En İyi Gün: ${enIyiGun}
- En Düşük Gün: ${enKotuGun}
- Son 7 Gün Trendi: ${gunlukTrendler || "Yeterli veri yok"}
    `.trim();
  }, [raporlar, stats, baslangic, bitis, odemeFiltre]);

  // ── MagicPay Karşılaştırma ──
  const magicpayKarsilastir = async () => {
    if (!baslangic || !bitis) return;
    setMpYukleniyor(true);
    setMpHata("");
    try {
      const res = await fetch(`/api/magicpay-karsilastirma?start=${baslangic}&end=${bitis}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "MagicPay verisi alınamadı.");
      setMpVeri(d);
    } catch (err: any) {
      setMpHata(err?.message || "MagicPay verisi alınamadı.");
      setMpVeri(null);
    }
    setMpYukleniyor(false);
  };

  // ── Güçlü AI Analiz ──
  const analizYap = async () => {
    if (!raporlar.length) return;
    setAnalizYukleniyor(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 2000,
          system: `Sen KEBO ERP'nin kıdemli iş analistisisin. Restoran/yemek işletmesi verilerini analiz ediyorsun.
Görevin: İşletme sahibine rakamların arkasındaki gerçek anlamı açıklamak, somut ve uygulanabilir öneriler vermek.

SADECE şu JSON formatında yanıt ver, hiçbir ek metin yazma:
{
  "ozet": "2-3 cümlelik net dönem değerlendirmesi. İşletmenin genel sağlığını özetle.",
  "basarilar": ["3-4 madde. Bu dönemde iyi giden şeyler, pozitif trendler"],
  "riskler": ["2-3 madde. Dikkat edilmesi gereken tehlikeler, düşüşler"],
  "oneriler": ["4-5 madde. Çok somut, uygulanabilir aksiyon önerileri. 'Şunu yap' formatında"],
  "oncelik": "iyi/orta/kritik — genel duruma göre",
  "chartData": [{"name": "platform/kategori adı", "deger": sayısal_değer}],
  "hedef": "Bir sonraki dönem için tek cümlelik motivasyonel hedef"
}`,
          messages: [{ role: "user", content: `Analiz et:\n${isletmeOzeti}` }],
        }),
      });
      if (!res.ok) throw new Error("API Hatası");
      const d = await res.json();
      const text = d.content?.[0]?.text || "";
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      setOtomatikAnaliz(JSON.parse(cleaned));
    } catch (err) {
      setOtomatikAnaliz({
        ozet: "Analiz yapılırken bir hata oluştu. API bağlantınızı kontrol edin.",
        basarilar: [],
        riskler: ["API bağlantısı kurulamadı"],
        oneriler: ["Vercel ortam değişkenlerinde NEXT_PUBLIC_ANTHROPIC_API_KEY ayarını kontrol edin"],
        oncelik: "kritik",
        chartData: [],
        hedef: "Teknik sorunu çöz ve yeniden dene.",
      });
    }
    setAnalizYukleniyor(false);
  };

  // ── Chat ──
  const chatGonder = async (metin?: string) => {
    const mesajMetni = metin || soru;
    if (!mesajMetni.trim() || aiYukleniyor) return;
    const yeni: ChatMesaj = { rol: "user", icerik: mesajMetni, zaman: new Date() };
    const liste = [...mesajlar, yeni];
    setMesajlar(liste);
    setSoru("");
    setAiYukleniyor(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1500,
          system: `Sen KEBO ERP'nin kıdemli iş danışmanısın. Restoran/yemek işletmesi konusunda uzmansın.
Türkçe, net ve pratik cevaplar ver. Rakamları referans al. Gerektiğinde madde madde listele.
Sohbet boyunca aşağıdaki işletme verilerini baz al:

${isletmeOzeti}`,
          messages: liste.map(m => ({ role: m.rol, content: m.icerik })),
        }),
      });
      if (!res.ok) throw new Error("API Hatası");
      const d = await res.json();
      const text = d.content?.map((c: any) => c.text || "").join("") || "Cevap alınamadı.";
      setMesajlar(prev => [...prev, { rol: "assistant", icerik: text, zaman: new Date() }]);
    } catch {
      setMesajlar(prev => [...prev, { rol: "assistant", icerik: "Bağlantı hatası oluştu. Lütfen tekrar deneyin.", zaman: new Date() }]);
    }
    setAiYukleniyor(false);
  };

  if (yetkiYukleniyor) return (
    <div className="min-h-screen bg-[#f4f5f7] flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );

  if (!yetkili) return (
    <div className="min-h-screen bg-[#f4f5f7] flex items-center justify-center p-6">
      <div className="bg-[#ffffff] border border-red-500/20 rounded-2xl p-8 max-w-sm text-center">
        <AlertTriangle className="h-10 w-10 text-red-600 mx-auto mb-4" />
        <h1 className="text-[#1a1f2e] font-black text-lg mb-2">Erişim Kısıtlı</h1>
        <p className="text-gray-500 text-sm">Yalnızca yöneticiler görebilir.</p>
      </div>
    </div>
  );

  const oncelikRenk = otomatikAnaliz?.oncelik === "iyi"
    ? { border: "border-emerald-500/30", bg: "bg-emerald-500/5", dot: "bg-emerald-500", text: "text-emerald-600", label: "İyi Durum" }
    : otomatikAnaliz?.oncelik === "kritik"
    ? { border: "border-red-500/30", bg: "bg-red-500/5", dot: "bg-red-500", text: "text-red-600", label: "Kritik" }
    : { border: "border-amber-500/30", bg: "bg-amber-500/5", dot: "bg-amber-500", text: "text-amber-600", label: "Orta" };

  return (
    <div className="min-h-screen bg-[#f4f5f7] text-[#1a1f2e] font-sans antialiased pb-10">

      {/* HEADER */}
      <div className="sticky top-0 z-40 border-b border-[#e2e5eb] bg-[#f4f5f7]/95 backdrop-blur-xl">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-black text-[#1a1f2e] leading-none">Rapor & Analiz</h1>
              <p className="text-[10px] text-gray-600 mt-0.5 leading-none">AI destekli iş zekası</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-[#ffffff] border border-[#e2e5eb] px-3 py-1.5 rounded-xl">
              <Calendar size={11} className="text-gray-600" />
              <input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)}
                className="bg-transparent text-xs font-semibold text-gray-700 outline-none cursor-pointer w-28" />
              <span className="text-gray-700">—</span>
              <input type="date" value={bitis} onChange={e => setBitis(e.target.value)}
                className="bg-transparent text-xs font-semibold text-gray-700 outline-none cursor-pointer w-28" />
            </div>
            <button onClick={veriCek} disabled={yukleniyor}
              className="p-2 text-gray-600 hover:text-[#1a1f2e] border border-[#e2e5eb] rounded-xl transition-colors disabled:opacity-40">
              <RefreshCw size={14} className={yukleniyor ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-5 space-y-5">

        {/* Rapor türü + filtreler */}
        <div className="bg-[#ffffff] border border-[#e2e5eb] rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            {RAPOR_TURLERI.map(t => (
              <button key={t.key} onClick={() => setRaporTuru(t.key)}
                className={`text-xs font-bold px-4 py-2 rounded-xl transition-colors ${raporTuru === t.key ? "bg-blue-600 text-white" : "bg-black/[0.04] text-gray-400 hover:text-[#1a1f2e]"}`}>
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-600">{RAPOR_TURLERI.find(t => t.key === raporTuru)?.desc}</p>
          {(raporTuru === "platform" || raporTuru === "gunluk" || raporTuru === "karsilastirma") && (
            <div>
              <p className="text-[10px] text-gray-600 mb-2 uppercase tracking-widest">Platformlar</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {Object.keys(PLATFORM_KOLON).map(p => (
                  <button key={p} onClick={() => setSeciliPlatformlar(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])}
                    className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-colors border ${seciliPlatformlar.includes(p) ? "text-[#1a1f2e] border-transparent" : "bg-black/[0.04] text-gray-500 border-[#e2e5eb]"}`}
                    style={seciliPlatformlar.includes(p) ? { backgroundColor: PLATFORM_COLORS[p] } : {}}>
                    {p}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                {(["hepsi", "online", "kapida"] as const).map(o => (
                  <button key={o} onClick={() => setOdemeFiltre(o)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-colors ${odemeFiltre === o ? "bg-emerald-600 text-white" : "bg-black/[0.04] text-gray-400 hover:text-[#1a1f2e]"}`}>
                    {o === "hepsi" ? "Online + Kapıda" : o === "online" ? "Sadece Online" : "Sadece Kapıda"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {yukleniyor ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : raporlar.length === 0 ? (
          <div className="bg-[#ffffff] border border-[#e2e5eb] rounded-2xl py-16 text-center text-gray-600 text-sm">
            Bu tarih aralığında rapor bulunamadı.
          </div>
        ) : (
          <>
            {/* ── GENEL ÖZET ── */}
            {raporTuru === "genel" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: "Brüt Ciro", value: stats.brutCiro, prev: stats.oncBrut, color: "#60A5FA" },
                    { label: "Net Ciro", value: stats.netCiro, prev: stats.oncNet, color: "#34D399" },
                    { label: "Toplam Gider", value: stats.toplamGider, prev: stats.oncGider, color: "#F87171" },
                    { label: "Günlük Ortalama", value: stats.gunlukOrt, prev: 0, color: "#FBBF24" },
                  ].map(k => (
                    <div key={k.label} className="bg-[#ffffff] border border-[#e2e5eb] rounded-2xl p-4">
                      <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">{k.label}</p>
                      <p className="text-xl font-black" style={{ color: k.color }}>₺{fmt(k.value)}</p>
                      {k.prev > 0 && <div className="mt-1"><TrendBadge value={k.value} prev={k.prev} /></div>}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-[#ffffff] border border-[#e2e5eb] rounded-2xl p-4">
                    <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Gider Oranı</p>
                    <p className="text-xl font-black text-orange-600">%{stats.giderOrani.toFixed(1)}</p>
                    <div className="mt-2 h-1.5 bg-black/[0.04] rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-orange-500/60" style={{ width: `${Math.min(stats.giderOrani, 100)}%` }} />
                    </div>
                  </div>
                  {stats.enIyi && (
                    <div className="bg-[#ffffff] border border-emerald-500/20 rounded-2xl p-4">
                      <p className="text-[10px] text-emerald-600 uppercase tracking-widest mb-1">En İyi Gün</p>
                      <p className="text-sm font-bold text-[#1a1f2e]">{fmtTarih(stats.enIyi.tarih)}</p>
                      <p className="text-lg font-black text-emerald-600">₺{fmt(stats.enIyi.toplam_ciro)}</p>
                    </div>
                  )}
                  {stats.enKotu && (
                    <div className="bg-[#ffffff] border border-red-500/20 rounded-2xl p-4">
                      <p className="text-[10px] text-red-600 uppercase tracking-widest mb-1">En Düşük Gün</p>
                      <p className="text-sm font-bold text-[#1a1f2e]">{fmtTarih(stats.enKotu.tarih)}</p>
                      <p className="text-lg font-black text-red-600">₺{fmt(stats.enKotu.toplam_ciro)}</p>
                    </div>
                  )}
                </div>
                {/* Günlük trend grafiği */}
                {stats.gunlukDetay.length > 1 && (
                  <div className="bg-[#ffffff] border border-[#e2e5eb] rounded-2xl p-5">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Günlük Ciro Trendi</p>
                    <div className="h-[180px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={stats.gunlukDetay.map(g => ({ name: fmtTarih(g.tarih).slice(0, 5), ciro: g.brutCiro, net: g.net }))}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1a2236" />
                          <XAxis dataKey="name" stroke="#444" fontSize={9} tickLine={false} />
                          <YAxis stroke="#444" fontSize={9} tickLine={false} tickFormatter={v => `₺${v >= 1000 ? (v/1000).toFixed(0)+"K" : v}`} />
                          <Tooltip contentStyle={{ backgroundColor: "#0c0f1a", borderColor: "#1a2236", color: "#fff", fontSize: 11 }} />
                          <Line type="monotone" dataKey="ciro" stroke="#3b82f6" strokeWidth={2} dot={false} name="Brüt Ciro" />
                          <Line type="monotone" dataKey="net" stroke="#34d399" strokeWidth={2} dot={false} name="Net" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── PLATFORM DETAYI ── */}
            {raporTuru === "platform" && (
              <div className="space-y-4">
                <div className="bg-[#ffffff] border border-[#e2e5eb] rounded-2xl p-5">
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold mb-4 flex items-center gap-1.5"><PieChart size={12} /> Platform Gelir Dağılımı</p>
                  <div className="space-y-4">
                    {seciliPlatformlar.map(p => {
                      const kol = PLATFORM_KOLON[p as keyof typeof PLATFORM_KOLON];
                      const online = kol?.online ? raporlar.reduce((s, r) => s + ((r[kol.online as keyof GunlukRapor] as number) || 0), 0) : 0;
                      const kapida = kol?.kapida ? raporlar.reduce((s, r) => s + ((r[kol.kapida as keyof GunlukRapor] as number) || 0), 0) : 0;
                      const toplam = (odemeFiltre === "online" ? online : odemeFiltre === "kapida" ? kapida : online + kapida);
                      const pct = stats.toplamPlatform > 0 ? (toplam / stats.toplamPlatform) * 100 : 0;
                      return (
                        <div key={p} className="bg-[#f7f8fa] rounded-xl border border-[#e2e5eb] p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PLATFORM_COLORS[p] }} />
                              <span className="text-sm font-bold text-[#1a1f2e]">{p}</span>
                            </div>
                            <span className="text-lg font-black" style={{ color: PLATFORM_COLORS[p] }}>₺{fmt(toplam)}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-3 mb-3">
                            <div className="text-center"><p className="text-[10px] text-gray-600 uppercase tracking-widest">Online</p><p className="text-sm font-bold text-blue-600">₺{fmt(online)}</p></div>
                            <div className="text-center"><p className="text-[10px] text-gray-600 uppercase tracking-widest">Kapıda</p><p className="text-sm font-bold text-orange-600">₺{fmt(kapida)}</p></div>
                            <div className="text-center"><p className="text-[10px] text-gray-600 uppercase tracking-widest">Pay</p><p className="text-sm font-bold text-gray-700">{Math.round(pct)}%</p></div>
                          </div>
                          <div className="h-2 bg-black/[0.04] rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: PLATFORM_COLORS[p] }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 pt-4 border-t border-[#e2e5eb] flex justify-between">
                    <span className="text-xs text-gray-600">Platform Toplamı</span>
                    <span className="text-sm font-black text-[#1a1f2e]">₺{fmt(stats.toplamPlatform)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── KASA DAĞILIMI ── */}
            {raporTuru === "kasa" && (
              <div className="bg-[#ffffff] border border-[#e2e5eb] rounded-2xl p-5 space-y-4">
                <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold flex items-center gap-1.5"><Wallet size={12} /> Kasa Ödeme Dağılımı</p>
                {[
                  { label: "Nakit", value: stats.kasaNakit, color: "#34D399" },
                  { label: "POS / Kredi Kartı", value: stats.kasaPos, color: "#60A5FA" },
                  { label: "Edenred", value: stats.kasaEdenred, color: "#FBBF24" },
                ].map(item => {
                  const toplam = stats.kasaNakit + stats.kasaPos + stats.kasaEdenred;
                  const pct = toplam > 0 ? (item.value / toplam) * 100 : 0;
                  return (
                    <div key={item.label} className="bg-[#f7f8fa] rounded-xl border border-[#e2e5eb] p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-[#1a1f2e]">{item.label}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500">{Math.round(pct)}%</span>
                          <span className="text-lg font-black" style={{ color: item.color }}>₺{fmt(item.value)}</span>
                        </div>
                      </div>
                      <div className="h-2 bg-black/[0.04] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: item.color }} />
                      </div>
                    </div>
                  );
                })}
                <div className="pt-3 border-t border-[#e2e5eb] flex justify-between">
                  <span className="text-xs text-gray-600">Kasa Toplamı</span>
                  <span className="text-sm font-black text-[#1a1f2e]">₺{fmt(stats.kasaNakit + stats.kasaPos + stats.kasaEdenred)}</span>
                </div>
              </div>
            )}

            {/* ── GÜN GÜN LİSTE ── */}
            {raporTuru === "gunluk" && (
              <div className="bg-[#ffffff] border border-[#e2e5eb] rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-[#e2e5eb]">
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold flex items-center gap-1.5">
                    <Calendar size={11} /> Gün Gün Liste
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#e2e5eb]">
                        {["Tarih", "Brüt Ciro", "Net", "Gider", ...seciliPlatformlar, "Paket"].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#0f1624]">
                      {stats.gunlukDetay.map(g => (
                        <tr key={g.tarih} className="hover:bg-black/[0.03] transition-colors">
                          <td className="px-4 py-3 text-gray-700 font-medium whitespace-nowrap">{fmtTarih(g.tarih)}</td>
                          <td className="px-4 py-3 text-blue-600 font-bold">₺{fmt(g.brutCiro)}</td>
                          <td className={`px-4 py-3 font-bold ${g.net >= 0 ? "text-emerald-600" : "text-red-600"}`}>₺{fmt(g.net)}</td>
                          <td className="px-4 py-3 text-red-600">₺{fmt(g.gider)}</td>
                          {seciliPlatformlar.map(p => (
                            <td key={p} className="px-4 py-3 font-bold whitespace-nowrap" style={{ color: PLATFORM_COLORS[p] }}>
                              ₺{fmt(g.platformDetay[p] || 0)}
                            </td>
                          ))}
                          <td className="px-4 py-3 text-purple-600">{g.paket}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-[#e2e5eb] bg-[#f7f8fa]">
                        <td className="px-4 py-3 text-[10px] text-gray-600 uppercase font-bold">TOPLAM</td>
                        <td className="px-4 py-3 text-blue-600 font-black">₺{fmt(stats.brutCiro)}</td>
                        <td className="px-4 py-3 text-emerald-600 font-black">₺{fmt(stats.netCiro)}</td>
                        <td className="px-4 py-3 text-red-600 font-black">₺{fmt(stats.toplamGider)}</td>
                        {seciliPlatformlar.map(p => (
                          <td key={p} className="px-4 py-3 font-black whitespace-nowrap" style={{ color: PLATFORM_COLORS[p] }}>
                            ₺{fmt(stats.platformlar[p] || 0)}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-purple-600 font-black">{fmt(stats.paket)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* ── PLATFORM KARŞILAŞTIRMA ── */}
            {raporTuru === "karsilastirma" && (
              <div className="bg-[#ffffff] border border-[#e2e5eb] rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-[#e2e5eb]">
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold flex items-center gap-1.5"><BarChart3 size={11} /> Platform Karşılaştırma</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#e2e5eb]">
                        {["Platform", "Online Satış", "Kapıda Ödeme", "Toplam", "Pay %"].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#0f1624]">
                      {seciliPlatformlar.map(p => {
                        const kol = PLATFORM_KOLON[p as keyof typeof PLATFORM_KOLON];
                        const online = kol?.online ? raporlar.reduce((s, r) => s + ((r[kol.online as keyof GunlukRapor] as number) || 0), 0) : 0;
                        const kapida = kol?.kapida ? raporlar.reduce((s, r) => s + ((r[kol.kapida as keyof GunlukRapor] as number) || 0), 0) : 0;
                        const toplam = online + kapida;
                        const pct = stats.toplamPlatform > 0 ? ((toplam / stats.toplamPlatform) * 100).toFixed(1) : "0";
                        return (
                          <tr key={p} className="hover:bg-black/[0.03] transition-colors">
                            <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PLATFORM_COLORS[p] }} /><span className="font-bold text-[#1a1f2e]">{p}</span></div></td>
                            <td className="px-4 py-3 text-blue-600 font-bold">₺{fmt(online)}</td>
                            <td className="px-4 py-3 text-orange-600 font-bold">₺{fmt(kapida)}</td>
                            <td className="px-4 py-3 font-black" style={{ color: PLATFORM_COLORS[p] }}>₺{fmt(toplam)}</td>
                            <td className="px-4 py-3 text-gray-400">{pct}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── ROADRUNNER MUTABAKATI ── */}
            {raporTuru === "roadrunner" && (
              <div className="space-y-4">
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 text-[11px] text-gray-700 leading-relaxed flex items-start gap-2.5">
                  <Truck size={15} className="text-amber-600 shrink-0 mt-0.5" />
                  <p>
                    Bu hesap, seçilen tarih aralığındaki rapor girişlerinden (Kurye bölümü) otomatik toplanır.
                    Paket başı <span className="font-bold text-amber-700">₺{RR_PAKET_UCRETI}</span>, uzak paketlerde{" "}
                    <span className="font-bold text-orange-700">{RR_UZAK_KATSAYI}x</span>, 9km üzeri paketlerde{" "}
                    <span className="font-bold text-red-700">{RR_KM9_KATSAYI}x</span> ücretlendirilir; sabit kuryede
                    (Roadrunner) günlük en az <span className="font-bold text-amber-700">{RR_KURYE_GARANTI} paket</span> garantisi vardır.
                    Kapıda ödemelerin POS ile tahsil edilen kısmından <span className="font-bold text-blue-700">%{RR_POS_KOMISYON_ORANI * 100}</span> komisyon
                    düşülüp Roadrunner&apos;a borcumuza eklenir. Haftalık mutabakat için üstteki tarih aralığını o haftaya ayarlayın.
                  </p>
                </div>

                {roadrunnerStats.kuryeListesi.length === 0 ? (
                  <div className="bg-[#ffffff] border border-[#e2e5eb] rounded-2xl py-16 text-center text-gray-600 text-sm">
                    Bu tarih aralığında kurye verisi bulunamadı.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      {[
                        { label: "Paket Ücreti", value: roadrunnerStats.toplamPaketUcreti, color: "#60A5FA" },
                        { label: "POS Komisyonu (%5)", value: roadrunnerStats.posKomisyonu, color: "#F97316" },
                        { label: "Toplam Borç (Roadrunner'a)", value: roadrunnerStats.toplamBorc, color: "#F87171" },
                        { label: "Toplam Tahsilat (Nakit+POS)", value: roadrunnerStats.toplamTahsilat, color: "#34D399" },
                      ].map(k => (
                        <div key={k.label} className="bg-[#ffffff] border border-[#e2e5eb] rounded-2xl p-4">
                          <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">{k.label}</p>
                          <p className="text-lg font-black" style={{ color: k.color }}>₺{fmt(k.value)}</p>
                        </div>
                      ))}
                    </div>

                    {/* Net mutabakat */}
                    <div className={`rounded-2xl border p-5 flex items-center justify-between ${roadrunnerStats.mutabakatFarki >= 0 ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                      <div className="flex items-center gap-2.5">
                        {roadrunnerStats.mutabakatFarki >= 0 ? <CheckCircle2 size={18} className="text-emerald-600" /> : <AlertTriangle size={18} className="text-red-600" />}
                        <div>
                          <p className={`text-xs font-bold uppercase tracking-widest ${roadrunnerStats.mutabakatFarki >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {roadrunnerStats.mutabakatFarki >= 0 ? "Roadrunner'dan Alacaklıyız" : "Roadrunner'a Borçluyuz"}
                          </p>
                          <p className="text-[11px] text-gray-500 mt-0.5">Tahsilat − (Paket Ücreti + POS Komisyonu)</p>
                        </div>
                      </div>
                      <p className={`text-2xl font-black ${roadrunnerStats.mutabakatFarki >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        ₺{fmt(Math.abs(roadrunnerStats.mutabakatFarki))}
                      </p>
                    </div>

                    {/* Paket dağılımı */}
                    <div className="bg-[#ffffff] border border-[#e2e5eb] rounded-2xl p-5">
                      <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold mb-4 flex items-center gap-1.5"><Percent size={12} /> Paket Dağılımı</p>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                        <div><p className="text-[10px] text-gray-500 uppercase tracking-widest">Normal (1x)</p><p className="text-base font-black text-[#1a1f2e]">{fmt(roadrunnerStats.toplamNormal)}</p></div>
                        <div><p className="text-[10px] text-gray-500 uppercase tracking-widest">Uzak (1.5x)</p><p className="text-base font-black text-orange-600">{fmt(roadrunnerStats.toplamUzak)}</p></div>
                        <div><p className="text-[10px] text-gray-500 uppercase tracking-widest">9km+ (2x)</p><p className="text-base font-black text-red-600">{fmt(roadrunnerStats.toplamKm9)}</p></div>
                        <div><p className="text-[10px] text-gray-500 uppercase tracking-widest">Garanti Farkı</p><p className="text-base font-black text-amber-600">{fmt(roadrunnerStats.toplamGarantiFarki)}</p></div>
                        <div><p className="text-[10px] text-gray-500 uppercase tracking-widest">Ödemeye Esas Toplam</p><p className="text-base font-black text-blue-600">{fmt(roadrunnerStats.toplamUygulanan)}</p></div>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-3">Gerçek teslim edilen toplam paket: <span className="font-bold text-gray-700">{fmt(roadrunnerStats.toplamGercek)}</span></p>
                    </div>

                    {/* Kurye bazında tablo */}
                    <div className="bg-[#ffffff] border border-[#e2e5eb] rounded-2xl overflow-hidden">
                      <div className="px-5 py-3 border-b border-[#e2e5eb]">
                        <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold flex items-center gap-1.5"><Truck size={11} /> Kurye Bazında Mutabakat</p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-[#e2e5eb]">
                              {["Kurye", "Tip", "Normal", "Uzak", "9km+", "Garanti Farkı", "Esas Paket", "Paket Ücreti", "Nakit", "POS"].map(h => (
                                <th key={h} className="text-left px-4 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#0f1624]">
                            {roadrunnerStats.kuryeListesi.map(k => (
                              <tr key={`${k.isim}__${k.tip}`} className="hover:bg-black/[0.03] transition-colors">
                                <td className="px-4 py-3 font-bold text-[#1a1f2e] whitespace-nowrap">{k.isim}</td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${k.tip === "sabit" ? "bg-amber-500/10 text-amber-700" : "bg-black/[0.05] text-gray-500"}`}>
                                    {k.tip === "sabit" ? "Sabit (Roadrunner)" : "Havuz"}
                                  </span>
                                </td>
                                <td className="px-4 py-3">{fmt(k.normal)}</td>
                                <td className="px-4 py-3 text-orange-600 font-bold">{fmt(k.uzak)}</td>
                                <td className="px-4 py-3 text-red-600 font-bold">{fmt(k.km9)}</td>
                                <td className="px-4 py-3 text-amber-600 font-bold">{fmt(k.garantiFarki)}</td>
                                <td className="px-4 py-3 font-black text-blue-600">{fmt(k.uygulanan)}</td>
                                <td className="px-4 py-3 font-black">₺{fmt(k.ucret)}</td>
                                <td className="px-4 py-3 text-emerald-600">₺{fmt(k.nakit)}</td>
                                <td className="px-4 py-3 text-blue-600">₺{fmt(k.pos)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-[#e2e5eb] bg-[#f7f8fa]">
                              <td className="px-4 py-3 text-[10px] text-gray-600 uppercase font-bold" colSpan={2}>TOPLAM</td>
                              <td className="px-4 py-3 font-black">{fmt(roadrunnerStats.toplamNormal)}</td>
                              <td className="px-4 py-3 text-orange-600 font-black">{fmt(roadrunnerStats.toplamUzak)}</td>
                              <td className="px-4 py-3 text-red-600 font-black">{fmt(roadrunnerStats.toplamKm9)}</td>
                              <td className="px-4 py-3 text-amber-600 font-black">{fmt(roadrunnerStats.toplamGarantiFarki)}</td>
                              <td className="px-4 py-3 font-black text-blue-600">{fmt(roadrunnerStats.toplamUygulanan)}</td>
                              <td className="px-4 py-3 font-black">₺{fmt(roadrunnerStats.toplamPaketUcreti)}</td>
                              <td className="px-4 py-3 text-emerald-600 font-black">₺{fmt(roadrunnerStats.toplamNakit)}</td>
                              <td className="px-4 py-3 text-blue-600 font-black">₺{fmt(roadrunnerStats.toplamPos)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── MAGICPAY KARŞILAŞTIRMA ── */}
            {raporTuru === "magicpay" && (
              <div className="space-y-4">
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4 text-[11px] text-gray-700 leading-relaxed flex items-start gap-2.5">
                  <RefreshCw size={15} className="text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <p>MagicPay (kebo-admin-ui) POS/online sipariş sisteminden çekilen rakamlar, buraya elle girilen günlük raporla karşılaştırılır. Hiçbir veri otomatik değiştirilmez veya kaydedilmez.</p>
                    <p className="mt-1.5 text-gray-500">
                      Not: MagicPay&apos;in &quot;Brüt&quot; (indirim öncesi) ve &quot;Net&quot; (indirim sonrası, gider/iade düşülmeden) tanımları
                      Kebo Panel&apos;deki Brüt/Net Ciro tanımından farklı — bu ikisi ayrı sütunlarda gösterilir, aralarındaki fark tek başına
                      hata anlamına gelmez. İndirim, İade ve Nakit karşılaştırmaları ise birebir aynı tanımı kullandığı için daha güvenilirdir.
                    </p>
                  </div>
                </div>

                <button onClick={magicpayKarsilastir} disabled={mpYukleniyor}
                  className="flex items-center gap-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 px-4 py-2.5 rounded-xl transition-colors">
                  {mpYukleniyor ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  {mpVeri ? "Yenile" : "MagicPay ile Karşılaştır"}
                </button>

                {mpHata && (
                  <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 text-xs text-red-700 flex items-start gap-2">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {mpHata}
                  </div>
                )}

                {mpVeri && (
                  <div className="bg-[#ffffff] border border-[#e2e5eb] rounded-2xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-[#e2e5eb]">
                      <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">Gün Gün Karşılaştırma</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-[#e2e5eb]">
                            {["Tarih", "Kebo Brüt", "MP Brüt", "Kebo Net", "MP Net", "Kebo İndirim", "MP İndirim", "Fark", "Kebo İade", "MP İade", "Fark", "Kebo Nakit", "MP Nakit", "Fark"].map(h => (
                              <th key={h} className="text-left px-3 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#0f1624]">
                          {mpVeri.gunler.map(g => {
                            const kr = raporlar.find(r => r.tarih === g.tarih);
                            const keboIndirim = kr ? (Number(kr.os_kebo_ys_indirim) || 0) + (Number(kr.os_cnf_ys_indirim) || 0)
                              + (Number(kr.os_kebo_trendyol_indirim) || 0) + (Number(kr.os_cnf_trendyol_indirim) || 0)
                              + (Number(kr.ko_kebo_ys_indirim) || 0) + (Number(kr.ko_cnf_ys_indirim) || 0)
                              + (Number(kr.ko_kebo_trendyol_indirim) || 0) + (Number(kr.ko_cnf_trendyol_indirim) || 0) : null;
                            const keboBrut = kr ? (kr.toplam_ciro || 0) : null;
                            const keboNet = kr ? (kr.toplam_ciro || 0) - (kr.gunluk_gider || 0) - (kr.iade_tutar || 0) : null;
                            const keboIade = kr ? (kr.iade_tutar || 0) : null;
                            const keboNakit = kr ? (kr.kasa_nakit || 0) : null;
                            const farkli = (a: number | null, b: number, tol = 1) => a !== null && Math.abs(a - b) > tol;
                            return (
                              <tr key={g.tarih} className="hover:bg-black/[0.03] transition-colors">
                                <td className="px-3 py-3 font-medium text-gray-700 whitespace-nowrap">{fmtTarih(g.tarih)}</td>
                                <td className="px-3 py-3">{kr ? `₺${fmt(keboBrut as number)}` : "—"}</td>
                                <td className="px-3 py-3 text-blue-600">₺{fmt(g.brutMP)}</td>
                                <td className="px-3 py-3">{kr ? `₺${fmt(keboNet as number)}` : "—"}</td>
                                <td className="px-3 py-3 text-blue-600">₺{fmt(g.netMP)}</td>
                                <td className="px-3 py-3">{kr ? `₺${fmt(keboIndirim as number)}` : "—"}</td>
                                <td className="px-3 py-3 text-orange-600">₺{fmt(g.indirimMP)}</td>
                                <td className={`px-3 py-3 font-bold ${kr && farkli(keboIndirim, g.indirimMP) ? "text-red-600" : "text-emerald-600"}`}>
                                  {kr ? (farkli(keboIndirim, g.indirimMP) ? `₺${fmt(Math.abs((keboIndirim as number) - g.indirimMP))}` : "✓") : "—"}
                                </td>
                                <td className="px-3 py-3">{kr ? `₺${fmt(keboIade as number)}` : "—"}</td>
                                <td className="px-3 py-3 text-orange-600">₺{fmt(g.iadeMP)}</td>
                                <td className={`px-3 py-3 font-bold ${kr && farkli(keboIade, g.iadeMP) ? "text-red-600" : "text-emerald-600"}`}>
                                  {kr ? (farkli(keboIade, g.iadeMP) ? `₺${fmt(Math.abs((keboIade as number) - g.iadeMP))}` : "✓") : "—"}
                                </td>
                                <td className="px-3 py-3">{kr ? `₺${fmt(keboNakit as number)}` : "—"}</td>
                                <td className="px-3 py-3 text-orange-600">₺{fmt(g.nakitMP)}</td>
                                <td className={`px-3 py-3 font-bold ${kr && farkli(keboNakit, g.nakitMP) ? "text-red-600" : "text-emerald-600"}`}>
                                  {kr ? (farkli(keboNakit, g.nakitMP) ? `₺${fmt(Math.abs((keboNakit as number) - g.nakitMP))}` : "✓") : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {mpVeri.gunler.some(g => !raporlar.find(r => r.tarih === g.tarih)) && (
                      <p className="px-5 py-3 text-[10px] text-gray-500 border-t border-[#e2e5eb]">&quot;—&quot; gösterilen günler için Kebo Panel&apos;de bu tarihte kaydedilmiş bir rapor bulunamadı.</p>
                    )}
                  </div>
                )}

                {mpVeri?.kurye && (
                  <div className="bg-[#ffffff] border border-[#e2e5eb] rounded-2xl p-5">
                    <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold mb-3 flex items-center gap-1.5"><Truck size={12} /> MagicPay Kurye Teslimat (seçili gün)</p>
                    <div className="space-y-2">
                      {mpVeri.kurye.kuryeler.map((k: any) => (
                        <div key={k.isim} className="flex flex-wrap items-center justify-between gap-2 bg-[#f7f8fa] rounded-xl border border-[#e2e5eb] px-4 py-2.5">
                          <span className="font-bold text-[#1a1f2e]">{k.isim}</span>
                          <span className="text-gray-500">{k.teslimat} teslimat</span>
                          <span className="text-emerald-600 font-bold">₺{fmt(k.tahsilat)} tahsilat</span>
                          {k.iadeGerekenTutar > 0 && <span className="text-red-600 font-bold">₺{fmt(k.iadeGerekenTutar)} Kebo&apos;ya iade gerekiyor</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ════════════════════════════════════════════════════════ */}
            {/* AI İŞ ANALİZ BÖLÜMÜ                                    */}
            {/* ════════════════════════════════════════════════════════ */}
            <div className="bg-[#ffffff] border border-blue-500/20 rounded-2xl overflow-hidden">
              {/* Sekme başlıkları */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#e2e5eb]">
                <div className="flex gap-1 bg-black/[0.04] rounded-xl p-1">
                  <button onClick={() => setAktifAiSekme("analiz")}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${aktifAiSekme === "analiz" ? "bg-blue-600 text-white" : "text-gray-500 hover:text-[#1a1f2e]"}`}>
                    <Sparkles size={12} /> AI Rapor
                  </button>
                  <button onClick={() => setAktifAiSekme("chat")}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${aktifAiSekme === "chat" ? "bg-blue-600 text-white" : "text-gray-500 hover:text-[#1a1f2e]"}`}>
                    <MessageSquare size={12} /> Danışman
                    {mesajlar.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"/>}
                  </button>
                </div>
                {aktifAiSekme === "analiz" && (
                  <button onClick={analizYap} disabled={analizYukleniyor}
                    className="flex items-center gap-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 px-4 py-2 rounded-xl transition-colors">
                    {analizYukleniyor ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                    {otomatikAnaliz ? "Yenile" : "Analiz Et"}
                  </button>
                )}
              </div>

              {/* ── AI RAPOR SEKMESİ ── */}
              {aktifAiSekme === "analiz" && (
                <div className="p-5">
                  {analizYukleniyor ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"/>
                      <p className="text-sm text-gray-500">İşletmeniz analiz ediliyor...</p>
                      <p className="text-xs text-gray-700">Verileriniz inceleniyor, öneriler hazırlanıyor</p>
                    </div>
                  ) : otomatikAnaliz ? (
                    <div className="space-y-5">
                      {/* Durum rozeti + özet */}
                      <div className={`rounded-xl border ${oncelikRenk.border} ${oncelikRenk.bg} p-4`}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-2 h-2 rounded-full ${oncelikRenk.dot}`}/>
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${oncelikRenk.text}`}>{oncelikRenk.label}</span>
                        </div>
                        <p className="text-sm text-gray-800 leading-relaxed">{otomatikAnaliz.ozet}</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Başarılar */}
                        {otomatikAnaliz.basarilar.length > 0 && (
                          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
                            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                              <TrendingUp size={11} /> Güçlü Yönler
                            </p>
                            <ul className="space-y-2">
                              {otomatikAnaliz.basarilar.map((b, i) => (
                                <li key={i} className="flex items-start gap-2 text-xs text-gray-700 leading-relaxed">
                                  <ChevronRight size={12} className="text-emerald-600 shrink-0 mt-0.5"/>
                                  {b}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Riskler */}
                        {otomatikAnaliz.riskler.length > 0 && (
                          <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                            <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                              <TrendingDown size={11} /> Dikkat Edilmesi Gerekenler
                            </p>
                            <ul className="space-y-2">
                              {otomatikAnaliz.riskler.map((r, i) => (
                                <li key={i} className="flex items-start gap-2 text-xs text-gray-700 leading-relaxed">
                                  <ChevronRight size={12} className="text-red-600 shrink-0 mt-0.5"/>
                                  {r}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* Öneriler */}
                      {otomatikAnaliz.oneriler.length > 0 && (
                        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
                          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                            <Sparkles size={11} /> Aksiyon Önerileri
                          </p>
                          <div className="space-y-2">
                            {otomatikAnaliz.oneriler.map((o, i) => (
                              <div key={i} className="flex items-start gap-3 bg-white/3 rounded-lg px-3 py-2.5">
                                <span className="text-[10px] font-black text-blue-700 bg-blue-500/10 rounded-md w-5 h-5 flex items-center justify-center shrink-0">{i+1}</span>
                                <p className="text-xs text-gray-700 leading-relaxed">{o}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Grafik */}
                      {otomatikAnaliz.chartData && otomatikAnaliz.chartData.length > 0 && (
                        <div className="h-[200px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={otomatikAnaliz.chartData}>
                              <XAxis dataKey="name" stroke="#666" fontSize={10} tickLine={false} axisLine={false} />
                              <Tooltip contentStyle={{ backgroundColor: "#0c0f1a", borderColor: "#1a2236", color: "#fff" }} itemStyle={{ color: "#3b82f6" }} cursor={{ fill: "#1a2236" }} />
                              <Bar dataKey="deger" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      {/* Hedef */}
                      {otomatikAnaliz.hedef && (
                        <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-xl px-5 py-4 flex items-center gap-3">
                          <Zap size={16} className="text-blue-600 shrink-0"/>
                          <p className="text-sm font-semibold text-gray-800">{otomatikAnaliz.hedef}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center">
                        <Bot size={24} className="text-blue-600"/>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#1a1f2e] mb-1">AI İş Analistiniz Hazır</p>
                        <p className="text-xs text-gray-500 max-w-xs">
                          Verilerinizi analiz edeyim. Ciro trendleri, platform performansı, gider optimizasyonu ve büyüme önerileri için "Analiz Et"e tıklayın.
                        </p>
                      </div>
                      <button onClick={analizYap}
                        className="flex items-center gap-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-xl transition-colors shadow-lg shadow-blue-900/30">
                        <Zap size={14}/> Analizi Başlat
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── DANIŞMAN CHAT SEKMESİ ── */}
              {aktifAiSekme === "chat" && (
                <div className="flex flex-col" style={{ height: 500 }}>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {mesajlar.length === 0 ? (
                      <div className="py-6">
                        <div className="text-center mb-5">
                          <Bot size={24} className="mx-auto mb-2 text-gray-700"/>
                          <p className="text-xs text-gray-600">İşletmeniz hakkında her şeyi sorun</p>
                        </div>
                        <div className="space-y-2">
                          {HAZIR_SORULAR.map(s => (
                            <button key={s} onClick={() => chatGonder(s)}
                              className="block w-full text-left text-[11px] text-blue-600/80 hover:text-blue-600 bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/10 px-3 py-2 rounded-xl transition-colors leading-relaxed">
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      mesajlar.map((m, i) => (
                        <div key={i} className={`flex ${m.rol === "user" ? "justify-end" : "justify-start"}`}>
                          {m.rol === "assistant" && (
                            <div className="w-6 h-6 rounded-lg bg-blue-600/20 flex items-center justify-center mr-2 shrink-0 mt-0.5">
                              <Bot size={12} className="text-blue-600"/>
                            </div>
                          )}
                          <div className={`max-w-[85%] text-xs rounded-2xl px-4 py-3 leading-relaxed whitespace-pre-wrap ${
                            m.rol === "user"
                              ? "bg-blue-600 text-white rounded-tr-sm"
                              : "bg-[#f7f8fa] border border-[#e2e5eb] text-gray-700 rounded-tl-sm"
                          }`}>
                            {m.icerik}
                          </div>
                        </div>
                      ))
                    )}
                    {aiYukleniyor && (
                      <div className="flex justify-start">
                        <div className="w-6 h-6 rounded-lg bg-blue-600/20 flex items-center justify-center mr-2 shrink-0">
                          <Bot size={12} className="text-blue-600"/>
                        </div>
                        <div className="bg-[#f7f8fa] border border-[#e2e5eb] rounded-2xl rounded-tl-sm px-4 py-3">
                          <div className="flex gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{animationDelay:"0ms"}}/>
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{animationDelay:"150ms"}}/>
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{animationDelay:"300ms"}}/>
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={chatSonRef}/>
                  </div>
                  <div className="p-3 border-t border-[#e2e5eb] flex gap-2">
                    {mesajlar.length > 0 && (
                      <button onClick={() => setMesajlar([])} className="p-2.5 text-gray-700 hover:text-gray-400 border border-[#e2e5eb] rounded-xl transition-colors">
                        <X size={13}/>
                      </button>
                    )}
                    <input value={soru} onChange={e => setSoru(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && !e.shiftKey && chatGonder()}
                      placeholder="İşletmeniz hakkında bir şey sorun..."
                      className="flex-1 bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] text-xs h-10 px-3 rounded-xl outline-none focus:border-blue-500/40 placeholder:text-gray-700" />
                    <button onClick={() => chatGonder()} disabled={aiYukleniyor || !soru.trim()}
                      className="w-10 h-10 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-xl flex items-center justify-center transition-colors">
                      <Send size={13} className="text-white" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}