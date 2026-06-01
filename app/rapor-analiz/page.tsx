"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  BarChart3, Calendar, RefreshCw, Bot, Send, Loader2,
  ArrowUpRight, ArrowDownRight, Wallet, Package, TrendingUp,
  TrendingDown, PieChart, Filter, ChevronDown, AlertTriangle, X
} from "lucide-react";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from "recharts";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface GunlukRapor {
  id: string; tarih: string;
  os_yemeksepeti: number; os_getir: number; os_trendyol: number; os_migros: number;
  ko_yemeksepeti: number; ko_getir: number; ko_trendyol: number; ko_migros: number; ko_alo_paket: number;
  kasa_nakit: number; kasa_pos: number; kasa_edenred: number;
  gunluk_gider: number; iade_tutar: number; toplam_ciro: number;
  kurye_raporlari?: any[];
}

interface ChatMesaj { rol: "user" | "assistant"; icerik: string; }

// ─── RAPOR TÜRLERİ ────────────────────────────────────────────────────────────

const RAPOR_TURLERI = [
  { key: "genel", label: "Genel Özet", desc: "Brüt/net ciro, gider, paket toplamları" },
  { key: "platform", label: "Platform Detayı", desc: "Her platformun online + kapıda satışları ayrı ayrı" },
  { key: "kasa", label: "Kasa Dağılımı", desc: "Nakit, POS, Edenred ödeme yöntemleri" },
  { key: "gunluk", label: "Gün Gün Liste", desc: "Seçilen tarih aralığında her günün detayı" },
  { key: "karsilastirma", label: "Platform Karşılaştırma", desc: "Platformları yan yana karşılaştır" },
];

const PLATFORM_COLORS: Record<string, string> = {
  Yemeksepeti: "#FF6B35", Getir: "#8B5CF6", Trendyol: "#F97316", Migros: "#10B981", "Alo Paket": "#3B82F6",
};

const PATRONLAR = ["murat@kebo.com", "bulent@kebo.com"];

// ─── PLATFORM KOLONLARI ───────────────────────────────────────────────────────

const PLATFORM_KOLON = {
  Yemeksepeti: { online: "os_yemeksepeti", kapida: "ko_yemeksepeti" },
  Getir: { online: "os_getir", kapida: "ko_getir" },
  Trendyol: { online: "os_trendyol", kapida: "ko_trendyol" },
  Migros: { online: "os_migros", kapida: "ko_migros" },
  "Alo Paket": { online: null, kapida: "ko_alo_paket" },
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const fmt = (v: number) => new Intl.NumberFormat("tr-TR").format(Math.round(v));
const fmtTarih = (t: string) => { if (!t) return ""; const [y, m, d] = t.split("-"); return `${d}.${m}.${y}`; };

function TrendBadge({ value, prev }: { value: number; prev: number }) {
  if (!prev) return null;
  const pct = ((value - prev) / prev) * 100;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-lg ${pct >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
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

  // Filtre state
  const [baslangic, setBaslangic] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [bitis, setBitis] = useState(() => new Date().toISOString().split("T")[0]);
  const [raporTuru, setRaporTuru] = useState("genel");

  // Platform filtresi
  const [seciliPlatformlar, setSeciliPlatformlar] = useState<string[]>(["Yemeksepeti", "Getir", "Trendyol", "Migros", "Alo Paket"]);
  const [odemeFiltre, setOdemeFiltre] = useState<"hepsi" | "online" | "kapida">("hepsi");

  // Veri state
  const [raporlar, setRaporlar] = useState<GunlukRapor[]>([]);
  const [oncekiRaporlar, setOncekiRaporlar] = useState<GunlukRapor[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);

  // AI state
  const [chatAcik, setChatAcik] = useState(false);
  const [mesajlar, setMesajlar] = useState<ChatMesaj[]>([]);
  const [soru, setSoru] = useState("");
  const [aiYukleniyor, setAiYukleniyor] = useState(false);
  const [otomatikAnaliz, setOtomatikAnaliz] = useState<any>(null);
  const [analizYukleniyor, setAnalizYukleniyor] = useState(false);

  // Yetki
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email && PATRONLAR.includes(user.email.toLowerCase())) setYetkili(true);
      setYetkiYukleniyor(false);
    });
  }, []);

  // Önceki dönem aralığı
  const oncekiAralik = useMemo(() => {
    if (!baslangic || !bitis) return null;
    const bas = new Date(baslangic), bit = new Date(bitis);
    const gun = Math.round((bit.getTime() - bas.getTime()) / 86400000);
    const ob = new Date(bas); ob.setDate(bas.getDate() - gun - 1);
    const obit = new Date(bas); obit.setDate(bas.getDate() - 1);
    const f = (d: Date) => d.toISOString().split("T")[0];
    return { bas: f(ob), bit: f(obit) };
  }, [baslangic, bitis]);

  // Veri çek
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

  // Hesaplamalar
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
      brutCiro, netCiro, toplamGider, paket, oncBrut, oncNet,
      kasaNakit: sum(raporlar, "kasa_nakit"),
      kasaPos: sum(raporlar, "kasa_pos"),
      kasaEdenred: sum(raporlar, "kasa_edenred"),
      platformlar, toplamPlatform,
      gunlukDetay,
      gunSayisi: raporlar.length,
      gunlukOrt: raporlar.length > 0 ? brutCiro / raporlar.length : 0,
      enIyi: [...raporlar].sort((a, b) => (b.toplam_ciro || 0) - (a.toplam_ciro || 0))[0],
      enKotu: [...raporlar].sort((a, b) => (a.toplam_ciro || 0) - (b.toplam_ciro || 0))[0],
    };
  }, [raporlar, oncekiRaporlar, seciliPlatformlar, odemeFiltre]);

  // AI Analiz
  const analizYap = async () => {
    if (!raporlar.length) return;
    setAnalizYukleniyor(true);
    const ozet = `Dönem: ${fmtTarih(baslangic)}-${fmtTarih(bitis)} | ${stats.gunSayisi} gün
Brüt: ₺${fmt(stats.brutCiro)} | Net: ₺${fmt(stats.netCiro)} | Gider: ₺${fmt(stats.toplamGider)}
Günlük ort: ₺${fmt(stats.gunlukOrt)} | Önceki dönem brüt: ₺${fmt(stats.oncBrut)}
Platformlar: ${Object.entries(stats.platformlar).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ₺${fmt(v)}`).join(", ")}
Kasa: Nakit ₺${fmt(stats.kasaNakit)}, POS ₺${fmt(stats.kasaPos)}, Edenred ₺${fmt(stats.kasaEdenred)}
En iyi gün: ${stats.enIyi ? fmtTarih(stats.enIyi.tarih) + " ₺" + fmt(stats.enIyi.toplam_ciro) : "-"}`;
    
    try {
      // YENİ GÜNCELLEME: İsteği artık bizim oluşturduğumuz backend dosyasına (route.ts) atıyoruz
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20240620",
          max_tokens: 1000,
          system: `Sen KEBO ERP iş analistisisin. SADECE şu JSON formatında cevap ver ve ASLA fazladan metin yazma: 
          {
            "analysis": "Buraya türkçe, madde madde, emoji ile kısa iş raporu yaz. Gerçek rakamları kullan.",
            "chartData": [{"name": "Platform veya Kategori Adı", "deger": 0}],
            "action": {"type": "info", "description": "Önerilen aksiyon metni (örn: Giderleri incele)"}
          }`,
          messages: [{ role: "user", content: `Analiz et:\n${ozet}` }],
        }),
      });
      
      if (!res.ok) throw new Error("API Hatası");
      const d = await res.json();
      const cleaned = d.content?.[0]?.text.replace(/[\`]{3}json/g, "").replace(/[\`]{3}/g, "") || "";
      setOtomatikAnaliz(JSON.parse(cleaned));
    } catch { 
      setOtomatikAnaliz({ analysis: "Analiz sırasında bir hata oluştu veya bağlantı kurulamadı. Lütfen API ayarlarınızı kontrol edin.", chartData: [], action: { type: "none", description: "" } }); 
    }
    setAnalizYukleniyor(false);
  };

  // Chat
  const chatGonder = async () => {
    if (!soru.trim() || aiYukleniyor) return;
    const yeni: ChatMesaj = { rol: "user", icerik: soru };
    const liste = [...mesajlar, yeni];
    setMesajlar(liste); setSoru(""); setAiYukleniyor(true);
    const baglamOzet = `Brüt: ₺${fmt(stats.brutCiro)}, Net: ₺${fmt(stats.netCiro)}, Platformlar: ${Object.entries(stats.platformlar).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ₺${fmt(v)}`).join(", ")}`;
    try {
      // YENİ GÜNCELLEME: İsteği artık bizim oluşturduğumuz backend dosyasına (route.ts) atıyoruz
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20240620", max_tokens: 1000,
          system: `KEBO ERP danışmanısın. Türkçe, kısa cevap ver. Veri: ${baglamOzet}`,
          messages: liste.map(m => ({ role: m.rol, content: m.icerik })),
        }),
      });
      
      if (!res.ok) throw new Error("API Hatası");
      const d = await res.json();
      setMesajlar(prev => [...prev, { rol: "assistant", icerik: d.content?.[0]?.text || "Cevap alınamadı." }]);
    } catch { setMesajlar(prev => [...prev, { rol: "assistant", icerik: "Bağlantı hatası. Lütfen API ayarlarınızı kontrol edin." }]); }
    setAiYukleniyor(false);
  };

  if (yetkiYukleniyor) return <div className="min-h-screen bg-[#060810] flex items-center justify-center"><div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" /></div>;
  if (!yetkili) return (
    <div className="min-h-screen bg-[#060810] flex items-center justify-center p-6">
      <div className="bg-[#0c0f1a] border border-red-500/20 rounded-2xl p-8 max-w-sm text-center">
        <AlertTriangle className="h-10 w-10 text-red-400 mx-auto mb-4" />
        <h1 className="text-white font-black text-lg mb-2">Erişim Kısıtlı</h1>
        <p className="text-gray-500 text-sm">Yalnızca yöneticiler görebilir.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#060810] text-white font-sans antialiased pb-20">

      {/* HEADER */}
      <div className="sticky top-0 z-40 border-b border-[#0f1624] bg-[#060810]/95 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-black text-white leading-none">Rapor Analizi</h1>
              <p className="text-[10px] text-gray-600 mt-0.5">{stats.gunSayisi} günlük veri · {fmtTarih(baslangic)} – {fmtTarih(bitis)}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={veriCek} disabled={yukleniyor} className="p-2 text-gray-600 hover:text-white border border-[#1a2236] rounded-xl transition-colors">
              <RefreshCw size={14} className={yukleniyor ? "animate-spin" : ""} />
            </button>
            <button onClick={() => setChatAcik(!chatAcik)}
              className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-xl transition-colors ${chatAcik ? "bg-blue-600 text-white" : "border border-[#1a2236] text-gray-400 hover:text-white"}`}>
              <Bot size={14} /> AI
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-5 space-y-5">

        {/* ── FİLTRE PANELİ ── */}
        <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-5 space-y-4">
          <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold flex items-center gap-1.5"><Filter size={11} /> Rapor Filtresi</p>

          {/* Tarih aralığı */}
          <div className="flex flex-wrap gap-3 items-center">
            <div>
              <p className="text-[10px] text-gray-600 mb-1.5 uppercase tracking-widest">Başlangıç</p>
              <input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)}
                className="bg-[#080b14] border border-[#1a2236] text-white text-xs h-9 px-3 rounded-xl outline-none focus:border-blue-500/40" />
            </div>
            <div>
              <p className="text-[10px] text-gray-600 mb-1.5 uppercase tracking-widest">Bitiş</p>
              <input type="date" value={bitis} onChange={e => setBitis(e.target.value)}
                className="bg-[#080b14] border border-[#1a2236] text-white text-xs h-9 px-3 rounded-xl outline-none focus:border-blue-500/40" />
            </div>
            {/* Hızlı seçim */}
            <div className="flex gap-1.5 flex-wrap mt-4 sm:mt-0">
              {[
                { label: "Bu ay", fn: () => { const d = new Date(); d.setDate(1); setBaslangic(d.toISOString().split("T")[0]); setBitis(new Date().toISOString().split("T")[0]); } },
                { label: "Son 7 gün", fn: () => { const d = new Date(); d.setDate(d.getDate() - 7); setBaslangic(d.toISOString().split("T")[0]); setBitis(new Date().toISOString().split("T")[0]); } },
                { label: "Son 30 gün", fn: () => { const d = new Date(); d.setDate(d.getDate() - 30); setBaslangic(d.toISOString().split("T")[0]); setBitis(new Date().toISOString().split("T")[0]); } },
                { label: "Son 90 gün", fn: () => { const d = new Date(); d.setDate(d.getDate() - 90); setBaslangic(d.toISOString().split("T")[0]); setBitis(new Date().toISOString().split("T")[0]); } },
              ].map(b => (
                <button key={b.label} onClick={b.fn}
                  className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 hover:bg-blue-600 hover:text-white transition-colors">
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rapor türü */}
          <div>
            <p className="text-[10px] text-gray-600 mb-2 uppercase tracking-widest">Rapor Türü</p>
            <div className="flex flex-wrap gap-2">
              {RAPOR_TURLERI.map(t => (
                <button key={t.key} onClick={() => setRaporTuru(t.key)}
                  className={`text-xs font-bold px-4 py-2 rounded-xl transition-colors ${raporTuru === t.key ? "bg-blue-600 text-white" : "bg-white/5 text-gray-400 hover:text-white"}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-600 mt-2">{RAPOR_TURLERI.find(t => t.key === raporTuru)?.desc}</p>
          </div>

          {/* Platform filtresi (platform raporu seçilince) */}
          {(raporTuru === "platform" || raporTuru === "gunluk" || raporTuru === "karsilastirma") && (
            <div>
              <p className="text-[10px] text-gray-600 mb-2 uppercase tracking-widest">Platformlar</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {Object.keys(PLATFORM_KOLON).map(p => (
                  <button key={p} onClick={() => setSeciliPlatformlar(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])}
                    className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-colors border ${seciliPlatformlar.includes(p) ? "text-white border-transparent" : "bg-white/5 text-gray-500 border-[#1a2236]"}`}
                    style={seciliPlatformlar.includes(p) ? { backgroundColor: PLATFORM_COLORS[p] } : {}}>
                    {p}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                {(["hepsi", "online", "kapida"] as const).map(o => (
                  <button key={o} onClick={() => setOdemeFiltre(o)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-colors ${odemeFiltre === o ? "bg-emerald-600 text-white" : "bg-white/5 text-gray-400 hover:text-white"}`}>
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
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl py-16 text-center text-gray-600 text-sm">
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
                    { label: "Toplam Gider", value: stats.toplamGider, prev: 0, color: "#F87171" },
                    { label: "Günlük Ortalama", value: stats.gunlukOrt, prev: 0, color: "#FBBF24" },
                  ].map(k => (
                    <div key={k.label} className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-4">
                      <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">{k.label}</p>
                      <p className="text-xl font-black" style={{ color: k.color }}>₺{fmt(k.value)}</p>
                      {k.prev > 0 && <div className="mt-1"><TrendBadge value={k.value} prev={k.prev} /></div>}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-4">
                    <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Toplam Paket</p>
                    <p className="text-xl font-black text-purple-400">{fmt(stats.paket)}</p>
                  </div>
                  {stats.enIyi && (
                    <div className="bg-[#0c0f1a] border border-emerald-500/20 rounded-2xl p-4">
                      <p className="text-[10px] text-emerald-400 uppercase tracking-widest mb-1">En İyi Gün</p>
                      <p className="text-sm font-bold text-white">{fmtTarih(stats.enIyi.tarih)}</p>
                      <p className="text-lg font-black text-emerald-400">₺{fmt(stats.enIyi.toplam_ciro)}</p>
                    </div>
                  )}
                  {stats.enKotu && (
                    <div className="bg-[#0c0f1a] border border-red-500/20 rounded-2xl p-4">
                      <p className="text-[10px] text-red-400 uppercase tracking-widest mb-1">En Düşük Gün</p>
                      <p className="text-sm font-bold text-white">{fmtTarih(stats.enKotu.tarih)}</p>
                      <p className="text-lg font-black text-red-400">₺{fmt(stats.enKotu.toplam_ciro)}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── PLATFORM DETAYI ── */}
            {raporTuru === "platform" && (
              <div className="space-y-4">
                <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-5">
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold mb-4 flex items-center gap-1.5"><PieChart size={12} /> Platform Gelir Dağılımı · {odemeFiltre === "online" ? "Online" : odemeFiltre === "kapida" ? "Kapıda Ödeme" : "Tümü"}</p>
                  <div className="space-y-4">
                    {seciliPlatformlar.map(p => {
                      const kol = PLATFORM_KOLON[p as keyof typeof PLATFORM_KOLON];
                      const online = kol?.online ? raporlar.reduce((s, r) => s + ((r[kol.online as keyof GunlukRapor] as number) || 0), 0) : 0;
                      const kapida = kol?.kapida ? raporlar.reduce((s, r) => s + ((r[kol.kapida as keyof GunlukRapor] as number) || 0), 0) : 0;
                      const toplam = (odemeFiltre === "online" ? online : odemeFiltre === "kapida" ? kapida : online + kapida);
                      const pct = stats.toplamPlatform > 0 ? (toplam / stats.toplamPlatform) * 100 : 0;
                      return (
                        <div key={p} className="bg-[#080b14] rounded-xl border border-[#1a2236] p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PLATFORM_COLORS[p] }} />
                              <span className="text-sm font-bold text-white">{p}</span>
                            </div>
                            <span className="text-lg font-black" style={{ color: PLATFORM_COLORS[p] }}>₺{fmt(toplam)}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-3 mb-3">
                            <div className="text-center">
                              <p className="text-[10px] text-gray-600 uppercase tracking-widest">Online</p>
                              <p className="text-sm font-bold text-blue-400">₺{fmt(online)}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-[10px] text-gray-600 uppercase tracking-widest">Kapıda</p>
                              <p className="text-sm font-bold text-orange-400">₺{fmt(kapida)}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-[10px] text-gray-600 uppercase tracking-widest">Pay</p>
                              <p className="text-sm font-bold text-gray-300">{Math.round(pct)}%</p>
                            </div>
                          </div>
                          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: PLATFORM_COLORS[p] }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 pt-4 border-t border-[#1a2236] flex justify-between">
                    <span className="text-xs text-gray-600">Seçili Platform Toplamı</span>
                    <span className="text-sm font-black text-white">₺{fmt(stats.toplamPlatform)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── KASA DAĞILIMI ── */}
            {raporTuru === "kasa" && (
              <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-5 space-y-4">
                <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold flex items-center gap-1.5"><Wallet size={12} /> Kasa Ödeme Dağılımı</p>
                {[
                  { label: "Nakit", value: stats.kasaNakit, color: "#34D399" },
                  { label: "POS / Kredi Kartı", value: stats.kasaPos, color: "#60A5FA" },
                  { label: "Edenred", value: stats.kasaEdenred, color: "#FBBF24" },
                ].map(item => {
                  const toplam = stats.kasaNakit + stats.kasaPos + stats.kasaEdenred;
                  const pct = toplam > 0 ? (item.value / toplam) * 100 : 0;
                  return (
                    <div key={item.label} className="bg-[#080b14] rounded-xl border border-[#1a2236] p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-white">{item.label}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500">{Math.round(pct)}%</span>
                          <span className="text-lg font-black" style={{ color: item.color }}>₺{fmt(item.value)}</span>
                        </div>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: item.color }} />
                      </div>
                    </div>
                  );
                })}
                <div className="pt-3 border-t border-[#1a2236] flex justify-between">
                  <span className="text-xs text-gray-600">Kasa Toplamı</span>
                  <span className="text-sm font-black text-white">₺{fmt(stats.kasaNakit + stats.kasaPos + stats.kasaEdenred)}</span>
                </div>
              </div>
            )}

            {/* ── GÜN GÜN LİSTE ── */}
            {raporTuru === "gunluk" && (
              <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-[#1a2236] flex items-center justify-between">
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold flex items-center gap-1.5">
                    <Calendar size={11} /> Gün Gün Liste · {seciliPlatformlar.join(", ")} · {odemeFiltre === "online" ? "Online" : odemeFiltre === "kapida" ? "Kapıda" : "Tümü"}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#1a2236]">
                        {["Tarih", "Brüt Ciro", "Net", "Gider", ...seciliPlatformlar, "Paket"].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#0f1624]">
                      {stats.gunlukDetay.map(g => (
                        <tr key={g.tarih} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3 text-gray-300 font-medium whitespace-nowrap">{fmtTarih(g.tarih)}</td>
                          <td className="px-4 py-3 text-blue-400 font-bold">₺{fmt(g.brutCiro)}</td>
                          <td className={`px-4 py-3 font-bold ${g.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>₺{fmt(g.net)}</td>
                          <td className="px-4 py-3 text-red-400">₺{fmt(g.gider)}</td>
                          {seciliPlatformlar.map(p => (
                            <td key={p} className="px-4 py-3 font-bold whitespace-nowrap" style={{ color: PLATFORM_COLORS[p] }}>
                              ₺{fmt(g.platformDetay[p] || 0)}
                            </td>
                          ))}
                          <td className="px-4 py-3 text-purple-400">{g.paket}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-[#1a2236] bg-[#080b14]">
                        <td className="px-4 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-bold">TOPLAM</td>
                        <td className="px-4 py-3 text-blue-400 font-black">₺{fmt(stats.brutCiro)}</td>
                        <td className="px-4 py-3 text-emerald-400 font-black">₺{fmt(stats.netCiro)}</td>
                        <td className="px-4 py-3 text-red-400 font-black">₺{fmt(stats.toplamGider)}</td>
                        {seciliPlatformlar.map(p => (
                          <td key={p} className="px-4 py-3 font-black whitespace-nowrap" style={{ color: PLATFORM_COLORS[p] }}>
                            ₺{fmt(stats.platformlar[p] || 0)}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-purple-400 font-black">{fmt(stats.paket)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* ── PLATFORM KARŞILAŞTIRMA ── */}
            {raporTuru === "karsilastirma" && (
              <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-[#1a2236]">
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold flex items-center gap-1.5"><BarChart3 size={11} /> Platform Karşılaştırma</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#1a2236]">
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
                          <tr key={p} className="hover:bg-white/[0.02] transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PLATFORM_COLORS[p] }} />
                                <span className="font-bold text-white">{p}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-blue-400 font-bold">₺{fmt(online)}</td>
                            <td className="px-4 py-3 text-orange-400 font-bold">₺{fmt(kapida)}</td>
                            <td className="px-4 py-3 font-black" style={{ color: PLATFORM_COLORS[p] }}>₺{fmt(toplam)}</td>
                            <td className="px-4 py-3 text-gray-400">{pct}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-[#1a2236] bg-[#080b14]">
                        <td className="px-4 py-3 text-[10px] text-gray-600 font-bold uppercase tracking-widest">TOPLAM</td>
                        <td className="px-4 py-3 text-blue-400 font-black">₺{fmt(seciliPlatformlar.reduce((s, p) => { const kol = PLATFORM_KOLON[p as keyof typeof PLATFORM_KOLON]; return s + (kol?.online ? raporlar.reduce((rs, r) => rs + ((r[kol.online as keyof GunlukRapor] as number) || 0), 0) : 0); }, 0))}</td>
                        <td className="px-4 py-3 text-orange-400 font-black">₺{fmt(seciliPlatformlar.reduce((s, p) => { const kol = PLATFORM_KOLON[p as keyof typeof PLATFORM_KOLON]; return s + (kol?.kapida ? raporlar.reduce((rs, r) => rs + ((r[kol.kapida as keyof GunlukRapor] as number) || 0), 0) : 0); }, 0))}</td>
                        <td className="px-4 py-3 text-white font-black">₺{fmt(stats.toplamPlatform)}</td>
                        <td className="px-4 py-3 text-gray-400">100%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* ── AI ANALİZ ── */}
            <div className="bg-[#0c0f1a] border border-blue-500/20 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#1a2236] flex items-center justify-between">
                <p className="text-[10px] text-blue-400 uppercase tracking-widest font-bold flex items-center gap-1.5"><Bot size={12} /> AI İş Raporu</p>
                <button onClick={analizYap} disabled={analizYukleniyor}
                  className="flex items-center gap-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 px-4 py-2 rounded-xl transition-colors">
                  {analizYukleniyor ? <Loader2 size={12} className="animate-spin" /> : <Bot size={12} />}
                  {otomatikAnaliz ? "Yenile" : "Analiz Et"}
                </button>
              </div>
              <div className="p-5">
                {analizYukleniyor
                  ? <div className="flex items-center gap-3 text-gray-500 text-sm"><Loader2 size={16} className="animate-spin" /> Analiz ediliyor...</div>
                  : otomatikAnaliz ? (
                    <div className="space-y-5">
                      <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{otomatikAnaliz.analysis || "Analiz tamamlandı."}</p>
                      
                      {otomatikAnaliz.chartData && otomatikAnaliz.chartData.length > 0 && (
                        <div className="h-[200px] w-full mt-4">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={otomatikAnaliz.chartData}>
                              <XAxis dataKey="name" stroke="#666" fontSize={10} tickLine={false} axisLine={false} />
                              <Tooltip contentStyle={{backgroundColor: '#0c0f1a', borderColor: '#1a2236', color: '#fff'}} itemStyle={{color: '#3b82f6'}} cursor={{fill: '#1a2236'}} />
                              <Bar dataKey="deger" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      {otomatikAnaliz.action && otomatikAnaliz.action.type !== "none" && (
                        <button onClick={() => alert("Aksiyon Tetiklendi: " + otomatikAnaliz.action.description)} 
                          className="w-full bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white py-2.5 rounded-xl text-xs font-bold transition-colors mt-2">
                          {otomatikAnaliz.action.description}
                        </button>
                      )}
                    </div>
                  ) : <p className="text-sm text-gray-600">Seçili dönem ve filtreler için AI analizi almak için "Analiz Et"e tıklayın.</p>
                }
              </div>
            </div>
          </>
        )}
      </div>

      {/* AI CHAT */}
      {chatAcik && (
        <div className="fixed bottom-0 right-0 sm:bottom-6 sm:right-6 w-full sm:w-96 bg-[#0c0f1a] border border-[#1a2236] sm:rounded-2xl shadow-2xl z-50 flex flex-col" style={{ height: 480 }}>
          <div className="px-4 py-3 border-b border-[#1a2236] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot size={14} className="text-blue-400" />
              <span className="text-xs font-bold text-white">AI Danışman</span>
            </div>
            <button onClick={() => setChatAcik(false)} className="text-gray-600 hover:text-white text-lg leading-none">×</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {mesajlar.length === 0 && (
              <div className="text-center text-gray-600 text-xs py-6">
                <Bot size={22} className="mx-auto mb-2 text-gray-700" />
                Verileriniz hakkında soru sorun.
                <div className="mt-3 space-y-1">
                  {["En çok kazandıran platform hangisi?", "Bu dönem nasıl geçti?", "Giderler ne kadar yükselmiş?"].map(s => (
                    <button key={s} onClick={() => setSoru(s)}
                      className="block w-full text-left text-[11px] text-blue-400/70 hover:text-blue-400 bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/10 px-3 py-1.5 rounded-lg transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {mesajlar.map((m, i) => (
              <div key={i} className={`flex ${m.rol === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] text-xs rounded-xl px-3 py-2 leading-relaxed ${m.rol === "user" ? "bg-blue-600 text-white" : "bg-[#080b14] border border-[#1a2236] text-gray-300"}`}>
                  {m.icerik}
                </div>
              </div>
            ))}
            {aiYukleniyor && (
              <div className="flex justify-start">
                <div className="bg-[#080b14] border border-[#1a2236] rounded-xl px-3 py-2">
                  <Loader2 size={12} className="animate-spin text-blue-400" />
                </div>
              </div>
            )}
          </div>
          <div className="p-3 border-t border-[#1a2236] flex gap-2">
            <input value={soru} onChange={e => setSoru(e.target.value)} onKeyDown={e => e.key === "Enter" && chatGonder()}
              placeholder="Soru sorun..." className="flex-1 bg-[#080b14] border border-[#1a2236] text-white text-xs h-9 px-3 rounded-xl outline-none focus:border-blue-500/40 placeholder:text-gray-700" />
            <button onClick={chatGonder} disabled={aiYukleniyor || !soru.trim()}
              className="w-9 h-9 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-xl flex items-center justify-center transition-colors">
              <Send size={13} className="text-white" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}