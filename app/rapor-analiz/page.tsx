"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  TrendingUp, TrendingDown, BarChart3, PieChart, Calendar,
  RefreshCw, Bot, Send, Loader2, ChevronDown, ArrowUpRight,
  ArrowDownRight, Minus, Wallet, Package, AlertTriangle
} from "lucide-react";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface GunlukRapor {
  id: string; tarih: string;
  os_yemeksepeti: number; os_getir: number; os_trendyol: number; os_migros: number;
  ko_yemeksepeti: number; ko_getir: number; ko_trendyol: number; ko_migros: number; ko_alo_paket: number;
  kasa_nakit: number; kasa_pos: number; kasa_edenred: number;
  gunluk_gider: number; iade_tutar: number; toplam_ciro: number;
  kurye_raporlari?: any[];
}

interface ChatMesaj {
  rol: "user" | "assistant";
  icerik: string;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const fmt = (v: number) => new Intl.NumberFormat("tr-TR").format(Math.round(v));
const fmtTarih = (t: string) => { if (!t) return ""; const [y, m, d] = t.split("-"); return `${d}.${m}.${y}`; };

const PLATFORM_COLORS: Record<string, string> = {
  Yemeksepeti: "#FF6B35", Getir: "#8B5CF6", Trendyol: "#F97316", Migros: "#10B981", "Alo Paket": "#3B82F6",
};

const PATRONLAR = ["murat@kebo.com", "bulent@kebo.com"];

// ─── TREND BADGE ──────────────────────────────────────────────────────────────

function TrendBadge({ value, prev }: { value: number; prev: number }) {
  if (prev === 0) return null;
  const pct = ((value - prev) / prev) * 100;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-lg ${up ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
      {up ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ─── ANA SAYFA ────────────────────────────────────────────────────────────────

export default function RaporAnalizPage() {
  const supabase = createClient();
  const [yetkili, setYetkili] = useState(false);
  const [yetkiYukleniyor, setYetkiYukleniyor] = useState(true);
  const [raporlar, setRaporlar] = useState<GunlukRapor[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [donem, setDonem] = useState<"hafta" | "ay" | "3ay" | "ozel">("ay");
  const [baslangic, setBaslangic] = useState("");
  const [bitis, setBitis] = useState("");
  const [chatAcik, setChatAcik] = useState(false);
  const [mesajlar, setMesajlar] = useState<ChatMesaj[]>([]);
  const [soru, setSoru] = useState("");
  const [aiYukleniyor, setAiYukleniyor] = useState(false);
  const [otomatikAnaliz, setOtomatikAnaliz] = useState("");
  const [analizYukleniyor, setAnalizYukleniyor] = useState(false);

  // Yetki kontrolü
  useEffect(() => {
    const kontrol = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email && PATRONLAR.includes(user.email.toLowerCase())) {
        setYetkili(true);
      }
      setYetkiYukleniyor(false);
    };
    kontrol();
  }, []);

  // Tarih aralığı hesapla
  const tarihAraligi = useMemo(() => {
    const bugun = new Date();
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    if (donem === "hafta") {
      const bas = new Date(bugun); bas.setDate(bugun.getDate() - 7);
      return { bas: fmt(bas), bit: fmt(bugun) };
    }
    if (donem === "ay") {
      const bas = new Date(bugun); bas.setDate(bugun.getDate() - 30);
      return { bas: fmt(bas), bit: fmt(bugun) };
    }
    if (donem === "3ay") {
      const bas = new Date(bugun); bas.setDate(bugun.getDate() - 90);
      return { bas: fmt(bas), bit: fmt(bugun) };
    }
    return { bas: baslangic, bit: bitis };
  }, [donem, baslangic, bitis]);

  // Önceki dönem aralığı
  const oncekiAralik = useMemo(() => {
    if (!tarihAraligi.bas || !tarihAraligi.bit) return null;
    const bas = new Date(tarihAraligi.bas);
    const bit = new Date(tarihAraligi.bit);
    const gun = Math.round((bit.getTime() - bas.getTime()) / (1000 * 60 * 60 * 24));
    const oncekiBit = new Date(bas); oncekiBit.setDate(bas.getDate() - 1);
    const oncekiBas = new Date(oncekiBit); oncekiBas.setDate(oncekiBit.getDate() - gun);
    const f = (d: Date) => d.toISOString().split("T")[0];
    return { bas: f(oncekiBas), bit: f(oncekiBit) };
  }, [tarihAraligi]);

  // Veri çek
  const veriCek = useCallback(async () => {
    if (!tarihAraligi.bas || !tarihAraligi.bit) return;
    setYukleniyor(true);
    const { data } = await supabase
      .from("gunluk_raporlar")
      .select("*")
      .gte("tarih", tarihAraligi.bas)
      .lte("tarih", tarihAraligi.bit)
      .order("tarih");
    if (data) setRaporlar(data as GunlukRapor[]);
    setYukleniyor(false);
  }, [tarihAraligi]);

  useEffect(() => { veriCek(); }, [veriCek]);

  // Önceki dönem verisi
  const [oncekiRaporlar, setOncekiRaporlar] = useState<GunlukRapor[]>([]);
  useEffect(() => {
    if (!oncekiAralik) return;
    supabase.from("gunluk_raporlar").select("*")
      .gte("tarih", oncekiAralik.bas).lte("tarih", oncekiAralik.bit)
      .then(({ data }) => { if (data) setOncekiRaporlar(data as GunlukRapor[]); });
  }, [oncekiAralik]);

  // Hesaplamalar
  const stats = useMemo(() => {
    const toplam = (arr: GunlukRapor[]) => arr.reduce((s, r) => s + (r.toplam_ciro || 0), 0);
    const gider = (arr: GunlukRapor[]) => arr.reduce((s, r) => s + (r.gunluk_gider || 0) + (r.iade_tutar || 0), 0);
    const paket = (arr: GunlukRapor[]) => arr.reduce((s, r) => s + (r.kurye_raporlari?.reduce((ks: number, k: any) => ks + (parseInt(k.paketSayisi) || 0), 0) || 0), 0);

    const brutCiro = toplam(raporlar);
    const toplamGider = gider(raporlar);
    const netCiro = brutCiro - toplamGider;
    const toplamPaket = paket(raporlar);
    const gunSayisi = raporlar.length;
    const gunlukOrt = gunSayisi > 0 ? brutCiro / gunSayisi : 0;

    const oncBrut = toplam(oncekiRaporlar);
    const oncNet = oncBrut - gider(oncekiRaporlar);

    const platformlar = {
      Yemeksepeti: raporlar.reduce((s, r) => s + (r.os_yemeksepeti || 0) + (r.ko_yemeksepeti || 0), 0),
      Getir: raporlar.reduce((s, r) => s + (r.os_getir || 0) + (r.ko_getir || 0), 0),
      Trendyol: raporlar.reduce((s, r) => s + (r.os_trendyol || 0) + (r.ko_trendyol || 0), 0),
      Migros: raporlar.reduce((s, r) => s + (r.os_migros || 0) + (r.ko_migros || 0), 0),
      "Alo Paket": raporlar.reduce((s, r) => s + (r.ko_alo_paket || 0), 0),
    };
    const toplamPlatform = Object.values(platformlar).reduce((s, v) => s + v, 0);

    const kasaNakit = raporlar.reduce((s, r) => s + (r.kasa_nakit || 0), 0);
    const kasaPos = raporlar.reduce((s, r) => s + (r.kasa_pos || 0), 0);
    const kasaEdenred = raporlar.reduce((s, r) => s + (r.kasa_edenred || 0), 0);

    const enIyiGun = [...raporlar].sort((a, b) => (b.toplam_ciro || 0) - (a.toplam_ciro || 0))[0];
    const enKotuGun = [...raporlar].sort((a, b) => (a.toplam_ciro || 0) - (b.toplam_ciro || 0))[0];

    return {
      brutCiro, netCiro, toplamGider, toplamPaket, gunSayisi, gunlukOrt,
      oncBrut, oncNet, platformlar, toplamPlatform,
      kasaNakit, kasaPos, kasaEdenred, enIyiGun, enKotuGun,
    };
  }, [raporlar, oncekiRaporlar]);

  // Otomatik AI analizi
  const analizYap = useCallback(async () => {
    if (raporlar.length === 0) return;
    setAnalizYukleniyor(true);
    const ozet = `
KEBO ERP İş Analizi:
- Dönem: ${fmtTarih(tarihAraligi.bas)} - ${fmtTarih(tarihAraligi.bit)}
- Rapor günü: ${stats.gunSayisi}
- Brüt ciro: ₺${fmt(stats.brutCiro)}
- Net ciro: ₺${fmt(stats.netCiro)}
- Toplam gider: ₺${fmt(stats.toplamGider)}
- Günlük ortalama: ₺${fmt(stats.gunlukOrt)}
- Önceki dönem brüt: ₺${fmt(stats.oncBrut)}
- Platform dağılımı: ${Object.entries(stats.platformlar).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ₺${fmt(v)}`).join(", ")}
- Kasa: Nakit ₺${fmt(stats.kasaNakit)}, POS ₺${fmt(stats.kasaPos)}, Edenred ₺${fmt(stats.kasaEdenred)}
- En iyi gün: ${stats.enIyiGun ? fmtTarih(stats.enIyiGun.tarih) + " ₺" + fmt(stats.enIyiGun.toplam_ciro) : "-"}
- En kötü gün: ${stats.enKotuGun ? fmtTarih(stats.enKotuGun.tarih) + " ₺" + fmt(stats.enKotuGun.toplam_ciro) : "-"}
    `.trim();

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: "Sen KEBO ERP sisteminin iş analistisisin. Türkçe, kısa ve net iş raporu yaz. Madde madde yaz. Emoji kullan. Gerçek rakamlarla konuş.",
          messages: [{ role: "user", content: `Bu verileri analiz et ve iş raporu yaz:\n\n${ozet}` }],
        }),
      });
      const data = await res.json();
      setOtomatikAnaliz(data.content?.[0]?.text || "Analiz alınamadı.");
    } catch {
      setOtomatikAnaliz("Analiz sırasında hata oluştu.");
    }
    setAnalizYukleniyor(false);
  }, [raporlar, stats, tarihAraligi]);

  // Chat gönder
  const chatGonder = async () => {
    if (!soru.trim() || aiYukleniyor) return;
    const yeniMesaj: ChatMesaj = { rol: "user", icerik: soru };
    const guncelMesajlar = [...mesajlar, yeniMesaj];
    setMesajlar(guncelMesajlar);
    setSoru("");
    setAiYukleniyor(true);

    const baglamOzet = `
Mevcut dönem verileri:
- Brüt ciro: ₺${fmt(stats.brutCiro)}, Net: ₺${fmt(stats.netCiro)}
- Platform: ${Object.entries(stats.platformlar).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ₺${fmt(v)}`).join(", ")}
- Günlük ort: ₺${fmt(stats.gunlukOrt)}, Gider: ₺${fmt(stats.toplamGider)}
    `.trim();

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: `Sen KEBO ERP iş danışmanısın. Türkçe konuş. Kısa ve net cevap ver. Veri bağlamı:\n${baglamOzet}`,
          messages: guncelMesajlar.map(m => ({ role: m.rol, content: m.icerik })),
        }),
      });
      const data = await res.json();
      const cevap = data.content?.[0]?.text || "Cevap alınamadı.";
      setMesajlar(prev => [...prev, { rol: "assistant", icerik: cevap }]);
    } catch {
      setMesajlar(prev => [...prev, { rol: "assistant", icerik: "Bağlantı hatası oluştu." }]);
    }
    setAiYukleniyor(false);
  };

  // Yetki yok
  if (yetkiYukleniyor) return (
    <div className="min-h-screen bg-[#060810] flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );

  if (!yetkili) return (
    <div className="min-h-screen bg-[#060810] flex items-center justify-center text-center p-6">
      <div className="bg-[#0c0f1a] border border-red-500/20 rounded-2xl p-8 max-w-sm">
        <AlertTriangle className="h-10 w-10 text-red-400 mx-auto mb-4" />
        <h1 className="text-white font-black text-lg mb-2">Erişim Kısıtlı</h1>
        <p className="text-gray-500 text-sm">Bu sayfa yalnızca yöneticiler tarafından görüntülenebilir.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#060810] text-white font-sans antialiased pb-10">

      {/* ── HEADER ── */}
      <div className="sticky top-0 z-40 border-b border-[#0f1624] bg-[#060810]/95 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-white leading-none">Rapor Analizi</h1>
              <p className="text-[10px] text-gray-600 leading-none mt-0.5">{stats.gunSayisi} günlük veri</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={veriCek} disabled={yukleniyor}
              className="p-2 text-gray-600 hover:text-white border border-[#1a2236] rounded-xl transition-colors">
              <RefreshCw size={14} className={yukleniyor ? "animate-spin" : ""} />
            </button>
            <button onClick={() => setChatAcik(!chatAcik)}
              className={`flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-xl transition-colors ${chatAcik ? "bg-blue-600 text-white" : "border border-[#1a2236] text-gray-400 hover:text-white"}`}>
              <Bot size={14} /> AI Danışman
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 space-y-5">

        {/* ── DÖNEM SEÇİCİ ── */}
        <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-4">
          <div className="flex flex-wrap gap-2 items-center">
            {(["hafta", "ay", "3ay", "ozel"] as const).map(d => (
              <button key={d} onClick={() => setDonem(d)}
                className={`text-xs font-bold px-4 py-2 rounded-xl transition-colors ${donem === d ? "bg-blue-600 text-white" : "bg-white/5 text-gray-400 hover:text-white"}`}>
                {d === "hafta" ? "Son 7 Gün" : d === "ay" ? "Son 30 Gün" : d === "3ay" ? "Son 90 Gün" : "Özel Aralık"}
              </button>
            ))}
            {donem === "ozel" && (
              <div className="flex items-center gap-2 mt-2 sm:mt-0">
                <input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)}
                  className="bg-[#080b14] border border-[#1a2236] text-white text-xs h-9 px-3 rounded-xl outline-none focus:border-blue-500/40" />
                <span className="text-gray-600 text-xs">—</span>
                <input type="date" value={bitis} onChange={e => setBitis(e.target.value)}
                  className="bg-[#080b14] border border-[#1a2236] text-white text-xs h-9 px-3 rounded-xl outline-none focus:border-blue-500/40" />
              </div>
            )}
          </div>
        </div>

        {yukleniyor ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : raporlar.length === 0 ? (
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl py-16 text-center text-gray-600 text-sm">
            Bu dönemde rapor bulunamadı.
          </div>
        ) : (
          <>
            {/* ── KPI KARTLARI ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: "Brüt Ciro", value: `₺${fmt(stats.brutCiro)}`, prev: stats.oncBrut, color: "#60A5FA", icon: <TrendingUp size={14} /> },
                { label: "Net Ciro", value: `₺${fmt(stats.netCiro)}`, prev: stats.oncNet, color: "#34D399", icon: <Wallet size={14} /> },
                { label: "Toplam Gider", value: `₺${fmt(stats.toplamGider)}`, prev: 0, color: "#F87171", icon: <TrendingDown size={14} /> },
                { label: "Toplam Paket", value: fmt(stats.toplamPaket), prev: 0, color: "#A78BFA", icon: <Package size={14} /> },
              ].map(k => (
                <div key={k.label} className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-4 hover:border-[#2a3550] transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] text-gray-600 uppercase tracking-widest font-medium">{k.label}</p>
                    <span style={{ color: k.color }}>{k.icon}</span>
                  </div>
                  <p className="text-xl font-black" style={{ color: k.color }}>{k.value}</p>
                  {k.prev > 0 && (
                    <div className="mt-1">
                      <TrendBadge value={k.label === "Brüt Ciro" ? stats.brutCiro : stats.netCiro} prev={k.prev} />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* ── PLATFORM DAĞILIMI ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-5">
                <p className="text-[10px] text-gray-600 uppercase tracking-widest font-medium mb-4 flex items-center gap-1.5">
                  <PieChart size={12} /> Platform Gelir Dağılımı
                </p>
                <div className="space-y-3">
                  {Object.entries(stats.platformlar).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a).map(([label, value]) => {
                    const pct = stats.toplamPlatform > 0 ? (value / stats.toplamPlatform) * 100 : 0;
                    return (
                      <div key={label}>
                        <div className="flex justify-between items-center mb-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PLATFORM_COLORS[label] }} />
                            <span className="text-xs text-gray-300 font-medium">{label}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-black text-white">₺{fmt(value)}</span>
                            <span className="text-[10px] text-gray-600 w-8 text-right">{Math.round(pct)}%</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, backgroundColor: PLATFORM_COLORS[label] }} />
                        </div>
                      </div>
                    );
                  })}
                  {stats.toplamPlatform === 0 && <p className="text-xs text-gray-600 text-center py-4">Platform verisi yok</p>}
                </div>
              </div>

              {/* ── KASA DAĞILIMI ── */}
              <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-5">
                <p className="text-[10px] text-gray-600 uppercase tracking-widest font-medium mb-4 flex items-center gap-1.5">
                  <Wallet size={12} /> Kasa Ödeme Dağılımı
                </p>
                <div className="space-y-3">
                  {[
                    { label: "Nakit", value: stats.kasaNakit, color: "#34D399" },
                    { label: "POS / Kredi Kartı", value: stats.kasaPos, color: "#60A5FA" },
                    { label: "Edenred", value: stats.kasaEdenred, color: "#FBBF24" },
                  ].map(item => {
                    const toplam = stats.kasaNakit + stats.kasaPos + stats.kasaEdenred;
                    const pct = toplam > 0 ? (item.value / toplam) * 100 : 0;
                    return (
                      <div key={item.label}>
                        <div className="flex justify-between items-center mb-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="text-xs text-gray-300 font-medium">{item.label}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-black text-white">₺{fmt(item.value)}</span>
                            <span className="text-[10px] text-gray-600 w-8 text-right">{Math.round(pct)}%</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, backgroundColor: item.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Özet istatistikler */}
                <div className="mt-4 pt-4 border-t border-[#1a2236] grid grid-cols-2 gap-3">
                  <div className="bg-[#080b14] rounded-xl p-3">
                    <p className="text-[10px] text-gray-600 uppercase tracking-widest">Günlük Ortalama</p>
                    <p className="text-sm font-black text-blue-400 mt-1">₺{fmt(stats.gunlukOrt)}</p>
                  </div>
                  <div className="bg-[#080b14] rounded-xl p-3">
                    <p className="text-[10px] text-gray-600 uppercase tracking-widest">Rapor Günü</p>
                    <p className="text-sm font-black text-purple-400 mt-1">{stats.gunSayisi} gün</p>
                  </div>
                </div>
              </div>
            </div>

            {/* ── EN İYİ / EN KÖTÜ GÜN ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {stats.enIyiGun && (
                <div className="bg-[#0c0f1a] border border-emerald-500/20 rounded-2xl p-4">
                  <p className="text-[10px] text-emerald-400 uppercase tracking-widest font-bold mb-2 flex items-center gap-1.5">
                    <ArrowUpRight size={12} /> En İyi Gün
                  </p>
                  <p className="text-lg font-black text-white">{fmtTarih(stats.enIyiGun.tarih)}</p>
                  <p className="text-2xl font-black text-emerald-400">₺{fmt(stats.enIyiGun.toplam_ciro)}</p>
                </div>
              )}
              {stats.enKotuGun && (
                <div className="bg-[#0c0f1a] border border-red-500/20 rounded-2xl p-4">
                  <p className="text-[10px] text-red-400 uppercase tracking-widest font-bold mb-2 flex items-center gap-1.5">
                    <ArrowDownRight size={12} /> En Düşük Gün
                  </p>
                  <p className="text-lg font-black text-white">{fmtTarih(stats.enKotuGun.tarih)}</p>
                  <p className="text-2xl font-black text-red-400">₺{fmt(stats.enKotuGun.toplam_ciro)}</p>
                </div>
              )}
            </div>

            {/* ── GÜNLÜK DETAY TABLOSU ── */}
            <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-[#1a2236]">
                <p className="text-[10px] text-gray-600 uppercase tracking-widest font-medium flex items-center gap-1.5">
                  <Calendar size={12} /> Günlük Detay
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#1a2236]">
                      {["Tarih", "Brüt Ciro", "Gider", "Net", "YS", "Getir", "Trendyol", "Paket"].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-[10px] text-gray-600 uppercase tracking-widest font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#0f1624]">
                    {[...raporlar].sort((a, b) => b.tarih.localeCompare(a.tarih)).map(r => {
                      const net = (r.toplam_ciro || 0) - (r.gunluk_gider || 0) - (r.iade_tutar || 0);
                      const paket = r.kurye_raporlari?.reduce((s: number, k: any) => s + (parseInt(k.paketSayisi) || 0), 0) || 0;
                      return (
                        <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-2.5 text-gray-300 font-medium">{fmtTarih(r.tarih)}</td>
                          <td className="px-4 py-2.5 text-blue-400 font-bold">₺{fmt(r.toplam_ciro || 0)}</td>
                          <td className="px-4 py-2.5 text-red-400">₺{fmt((r.gunluk_gider || 0) + (r.iade_tutar || 0))}</td>
                          <td className={`px-4 py-2.5 font-bold ${net >= 0 ? "text-emerald-400" : "text-red-400"}`}>₺{fmt(net)}</td>
                          <td className="px-4 py-2.5 text-gray-400">₺{fmt((r.os_yemeksepeti || 0) + (r.ko_yemeksepeti || 0))}</td>
                          <td className="px-4 py-2.5 text-gray-400">₺{fmt((r.os_getir || 0) + (r.ko_getir || 0))}</td>
                          <td className="px-4 py-2.5 text-gray-400">₺{fmt((r.os_trendyol || 0) + (r.ko_trendyol || 0))}</td>
                          <td className="px-4 py-2.5 text-purple-400">{paket}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── OTOMATİK ANALİZ ── */}
            <div className="bg-[#0c0f1a] border border-blue-500/20 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#1a2236] flex items-center justify-between">
                <p className="text-[10px] text-blue-400 uppercase tracking-widest font-bold flex items-center gap-1.5">
                  <Bot size={12} /> AI İş Raporu
                </p>
                <button onClick={analizYap} disabled={analizYukleniyor}
                  className="flex items-center gap-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 px-4 py-2 rounded-xl transition-colors">
                  {analizYukleniyor ? <Loader2 size={12} className="animate-spin" /> : <Bot size={12} />}
                  {otomatikAnaliz ? "Yenile" : "Analiz Et"}
                </button>
              </div>
              <div className="p-5">
                {analizYukleniyor ? (
                  <div className="flex items-center gap-3 text-gray-500 text-sm">
                    <Loader2 size={16} className="animate-spin" /> Veriler analiz ediliyor...
                  </div>
                ) : otomatikAnaliz ? (
                  <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{otomatikAnaliz}</p>
                ) : (
                  <p className="text-sm text-gray-600">Dönem verilerinin yapay zeka analizini görmek için "Analiz Et" butonuna tıklayın.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── AI CHAT PANELİ ── */}
      {chatAcik && (
        <div className="fixed bottom-0 right-0 sm:bottom-6 sm:right-6 w-full sm:w-96 bg-[#0c0f1a] border border-[#1a2236] sm:rounded-2xl shadow-2xl z-50 flex flex-col" style={{ height: "480px" }}>
          <div className="px-4 py-3 border-b border-[#1a2236] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot size={14} className="text-blue-400" />
              <span className="text-xs font-bold text-white">AI Danışman</span>
              <span className="text-[10px] text-gray-600 bg-white/5 px-2 py-0.5 rounded-full">KEBO ERP</span>
            </div>
            <button onClick={() => setChatAcik(false)} className="text-gray-600 hover:text-white transition-colors text-lg leading-none">×</button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {mesajlar.length === 0 && (
              <div className="text-center text-gray-600 text-xs py-8">
                <Bot size={24} className="mx-auto mb-2 text-gray-700" />
                Merhaba! Dönem verileriniz hakkında soru sorabilirsiniz.
                <div className="mt-3 space-y-1">
                  {["En çok satan platform hangisi?", "Bu ay giderler ne kadar?", "Performansı nasıl değerlendirirsin?"].map(s => (
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
            <input value={soru} onChange={e => setSoru(e.target.value)}
              onKeyDown={e => e.key === "Enter" && chatGonder()}
              placeholder="Soru sorun..."
              className="flex-1 bg-[#080b14] border border-[#1a2236] text-white text-xs h-9 px-3 rounded-xl outline-none focus:border-blue-500/40 placeholder:text-gray-700" />
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