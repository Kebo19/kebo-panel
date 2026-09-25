"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  FileText, PlusCircle, Loader2, TrendingUp, Wallet, CheckCircle2, Bike,
  XCircle, Trash2, Monitor, Home, Edit3, Eye, AlertTriangle, BarChart3,
  Calendar, Lock, User, Clock, ShieldAlert, Check, X, ArrowUpRight,
  Layers, Bell, Printer, ChevronDown, ChevronUp, PieChart, Activity,
  RefreshCw, Download, FileDown, StickyNote, DollarSign, Package,
  RotateCcw, Save, Slash, TrendingDown, Hash, Building2, Search, Sparkles,
  Banknote, CreditCard, Percent, Truck, Users2, Camera, ImageUp
} from "lucide-react";
import { BarChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart } from "recharts";
import { tv, fmt, paraGirdisi, paraYaz } from "@/lib/para";
import { bugun, buAyYil, aySonu, gunEkle, fmtTarih } from "@/lib/tarih";
import {
  brutCiro as brutHesapla, netCiro as netHesapla, raporOzeti, donemOzeti, platformKirilimi, paketToplam,
  kapidaKasadaMi, kuryeGercekPaket, yeniYapiMi, PLATFORM_RENK, PLATFORMLAR,
  ROADRUNNER_GECIS_GUNU, KURYE_GARANTI_PAKET,
} from "@/lib/hesap";
import { useYetki } from "@/lib/useYetki";
import { yuklemeIcinHazirla, jsonCevap } from "@/lib/gorsel";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface KuryeRaporu {
  id: number; isim: string; nakit: string; pos: string; paketSayisi: string;
  // 02.09.2026: Roadrunner bazı paketleri farklı ücretlendiriyor — uzak paketler 1.5 kat,
  // 9km üzeri paketler 2 kat. paketSayisi = normal (1x) ücretli paket sayısı; bu ikisi ayrı tutulur.
  uzakPaket?: string; paket9km?: string;
  tip?: "sabit" | "havuz" | "kendi"; // sabit = Roadrunner garantili kurye, havuz = garantisiz ek kurye, kendi = 14.08.2026 öncesi kendi personel kurye
}
interface PlatformGiris { tutar: string; paket: string; }
interface SatirRaporu {
  id: number; aciklama: string; tutar: string; tip?: "normal" | "firma" | "personel";
  firmaId?: string; firmaUnvan?: string; personelIsim?: string; personelId?: string;
}

/** Form satırları için benzersiz anahtar. */
const yeniSatirId = () => Date.now() + Math.floor(Math.random() * 1000);

// ─── GİDER METNİ ──────────────────────────────────────────────────────────────
// Giderler gunluk_raporlar.gider_aciklama alanında tek metin olarak saklanıyor:
//   "Market: ₺1.250 | [Firma] Sütaş: ₺3.000 | [Personel Avans] Ali — kola: ₺40 || NOT: ..."
// Açıklamalardaki "|" ve ": ₺" karakterleri bu biçimi bozduğu için yazarken temizlenir.
const FIRMA_ONEK = "[Firma] ";
const PERSONEL_ONEK = "[Personel Avans] ";
const temizMetin = (s?: string) => (s || "").replace(/\|/g, "/").replace(/:\s*₺/g, " ₺").replace(/\s+/g, " ").trim();

interface AyrikGider { tip: "normal"|"firma"|"personel"; aciklama: string; tutar: string; personelIsim?: string; detay: string; }

function satirMetniniAyristir(metin?: string | null): { aciklama: string; tutar: string }[] {
  if (!metin) return [];
  return metin.split(" | ").filter(Boolean).map(g => {
    const idx = g.lastIndexOf(": ₺");
    return idx > -1 ? { aciklama: g.substring(0, idx).trim(), tutar: g.substring(idx + 3).trim() } : { aciklama: g.trim(), tutar: "" };
  });
}

function giderMetniniAyristir(metin?: string | null): { giderler: AyrikGider[]; not: string } {
  const ham = metin || "";
  let govde = ham, not = "";
  const notIdx = ham.indexOf("|| NOT:");
  if (notIdx > -1) { govde = ham.substring(0, notIdx).trim(); not = ham.substring(notIdx + 7).trim(); }
  else if (ham.startsWith("NOT:")) { govde = ""; not = ham.substring(4).trim(); }
  const giderler = satirMetniniAyristir(govde).map(({ aciklama, tutar }): AyrikGider => {
    if (aciklama.startsWith(FIRMA_ONEK)) return { tip: "firma", aciklama: aciklama.substring(FIRMA_ONEK.length), tutar, detay: "" };
    if (aciklama.startsWith(PERSONEL_ONEK)) {
      const govdeP = aciklama.substring(PERSONEL_ONEK.length);
      const ayrim = govdeP.indexOf(" — ");
      const personelIsim = ayrim > -1 ? govdeP.substring(0, ayrim) : govdeP;
      const detay = ayrim > -1 ? govdeP.substring(ayrim + 3) : "";
      return { tip: "personel", aciklama, tutar, personelIsim, detay: detay === "Belirtilmemiş" ? "" : detay };
    }
    return { tip: "normal", aciklama, tutar, detay: "" };
  });
  return { giderler, not };
}

function giderMetniOlustur(giderler: SatirRaporu[], notlar: string): string {
  const govde = giderler
    .filter(g => g.tutar || g.aciklama)
    .map(g => {
      const ad = g.tip === "firma" && g.firmaUnvan ? `${FIRMA_ONEK}${temizMetin(g.firmaUnvan)}`
        : g.tip === "personel" && g.personelIsim ? `${PERSONEL_ONEK}${temizMetin(g.personelIsim)} — ${temizMetin(g.aciklama) || "Belirtilmemiş"}`
        : (temizMetin(g.aciklama) || "Belirtilmemiş");
      return `${ad}: ₺${g.tutar || "0"}`;
    })
    .join(" | ");
  const not = (notlar || "").replace(/\|\|/g, "/").trim();
  return not ? (govde ? `${govde} || NOT: ${not}` : `NOT: ${not}`) : govde;
}
interface GunlukRapor {
  id: string; tarih: string;
  // Legacy (eski, tek platform bazlı — geçmiş raporlarda okuma amaçlı hâlâ tutuluyor)
  os_yemeksepeti: number; os_getir: number; os_trendyol: number; os_migros: number; os_chicknfride: number;
  ko_yemeksepeti: number; ko_getir: number; ko_trendyol: number; ko_migros: number; ko_alo_paket: number; ko_chicknfride: number;
  // Online — Kebo
  os_kebo_ys: number; os_kebo_ys_paket: number; os_kebo_ys_indirim: number;
  os_kebo_trendyol: number; os_kebo_trendyol_paket: number; os_kebo_trendyol_indirim: number;
  os_kebo_migros: number; os_kebo_migros_paket: number;
  // Online — Chick'N Fride
  os_cnf_ys: number; os_cnf_ys_paket: number; os_cnf_ys_indirim: number;
  os_cnf_trendyol: number; os_cnf_trendyol_paket: number; os_cnf_trendyol_indirim: number;
  os_cnf_migros_yemek: number; os_cnf_migros_yemek_paket: number;
  // Kapıda Ödeme — Kebo
  ko_kebo_ys: number; ko_kebo_ys_paket: number; ko_kebo_ys_indirim: number;
  ko_kebo_trendyol: number; ko_kebo_trendyol_paket: number; ko_kebo_trendyol_indirim: number;
  ko_kebo_migros_yemek: number; ko_kebo_migros_yemek_paket: number;
  ko_kebo_alo: number; ko_kebo_alo_paket: number;
  // Kapıda Ödeme — Chick'N Fride
  ko_cnf_ys: number; ko_cnf_ys_paket: number; ko_cnf_ys_indirim: number;
  ko_cnf_trendyol: number; ko_cnf_trendyol_paket: number; ko_cnf_trendyol_indirim: number;
  ko_cnf_migros_yemek: number; ko_cnf_migros_yemek_paket: number;
  ko_cnf_alo: number; ko_cnf_alo_paket: number;
  kasa_nakit: number; kasa_pos: number; kasa_edenred: number; kasa_metropol: number;
  gunluk_gider: number; gider_aciklama?: string;
  iade_tutar: number; iade_aciklama?: string;
  kurye_raporlari?: KuryeRaporu[];
  toplam_ciro: number; ekleyen_kullanici: string; created_at?: string;
}
interface Cari {
  id: string; unvan: string; cari_kodu: string;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

// Yetkiler profiles.role alanından gelir (lib/useYetki). "Tam Yetkili" raporları
// doğrudan düzenler ve talepleri onaylar; "Müdür" yeni rapor girer, mevcut rapordaki
// değişikliği onaya gönderir.
interface PersonelKisa { id: string; isim: string; }
interface DegisiklikTalebi {
  id: string; rapor_id: string; rapor_tarihi: string;
  talep_eden: string; talep_tarihi: string;
  eski_veri: Record<string, unknown> | null; yeni_veri: Record<string, unknown> | null;
  durum: "bekliyor" | "onaylandi" | "reddedildi";
  onaylayan?: string | null; onay_tarihi?: string | null; red_sebebi?: string | null;
}

const AYLAR = [
  {value:"01",label:"Ocak"},{value:"02",label:"Şubat"},{value:"03",label:"Mart"},
  {value:"04",label:"Nisan"},{value:"05",label:"Mayıs"},{value:"06",label:"Haziran"},
  {value:"07",label:"Temmuz"},{value:"08",label:"Ağustos"},{value:"09",label:"Eylül"},
  {value:"10",label:"Ekim"},{value:"11",label:"Kasım"},{value:"12",label:"Aralık"},
];

const VARSAYILAN_GIDER_ONERILERI = [
  "Benzin", "Market", "Temizlik", "Kira", "Elektrik", "Su", "İnternet",
  "Telefon", "Mutfak Malzemesi", "Ambalaj", "Avans", "Tamir", "Kargo",
];

// Para, tarih ve brüt/net hesapları ortak modüllerden gelir:
//   lib/para.ts  → tv, fmt, paraGirdisi (kuruşlu giriş), paraYaz
//   lib/tarih.ts → İstanbul saatine göre bugün, fmtTarih
//   lib/hesap.ts → brüt/net/paket formülleri (tek kaynak)

// ─── SPARKLINE ────────────────────────────────────────────────────────────────

function Sparkline({values, color="#60A5FA"}: {values:number[], color?:string}) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const w=80, h=28;
  const pts = values.map((v,i)=>`${(i/(values.length-1))*w},${h-(v/max)*(h-4)}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" opacity={0.9}/>
    </svg>
  );
}

// ─── MISSING DAYS BANNER ──────────────────────────────────────────────────────

function EksikRaporBanner({enSonRaporTarihi, onEkle}: {enSonRaporTarihi:string|null, onEkle:()=>void}) {
  const [eksik, setEksik] = useState<string[]>([]);
  useEffect(() => {
    if (!enSonRaporTarihi) return;
    const bugunStr = bugun();
    const list: string[] = [];
    // Bugünün raporu gün sonunda girilir; dünden geriye eksik günler listelenir.
    for (let t = gunEkle(enSonRaporTarihi, 1); t < bugunStr && list.length < 400; t = gunEkle(t, 1)) {
      list.push(fmtTarih(t));
    }
    setEksik(list);
  }, [enSonRaporTarihi]);
  if (eksik.length===0) return null;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-red-500/20 bg-[#fef2f2] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="absolute inset-0 bg-gradient-to-r from-red-100/60 to-transparent pointer-events-none"/>
      <div className="relative flex items-start gap-3">
        <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 shrink-0">
          <Bell className="h-4 w-4 text-red-600 animate-pulse"/>
        </div>
        <div>
          <p className="text-xs font-bold text-red-600 uppercase tracking-widest">{eksik.length} Günlük Rapor Eksik</p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {eksik.slice(0,4).join(" · ")}{eksik.length>4 ? ` · +${eksik.length-4} gün` : ""}
          </p>
        </div>
      </div>
      <button onClick={onEkle} className="relative shrink-0 text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded-xl transition-colors">
        Hemen Ekle
      </button>
    </div>
  );
}

// ─── DASHBOARD PANEL ──────────────────────────────────────────────────────────

function DashboardPanel({raporlar}: {raporlar:GunlukRapor[]}) {
  const [acik, setAcik] = useState(true);

  const sorted = useMemo(()=>[...raporlar].sort((a,b)=>a.tarih.localeCompare(b.tarih)), [raporlar]);
  const ozet = useMemo(()=>donemOzeti(raporlar), [raporlar]);

  // Platform dağılımı (online + kapıda). Eski raporlarda Chick'N Fride tek kalem olarak
  // girildiği için ayrı görünür; yeni raporlarda gerçek platformlarına dağıtılır.
  const platformData = useMemo(()=>{
    const t: Record<string, number> = {};
    raporlar.forEach(r=>{
      const k = platformKirilimi(r);
      PLATFORMLAR.forEach(p=>{ t[p] = (t[p]||0) + k.online[p] + k.kapida[p]; });
    });
    return PLATFORMLAR.map(p=>({label:p, value:t[p]||0, color:PLATFORM_RENK[p]}));
  },[raporlar]);

  const markaData = useMemo(()=>{
    let kebo=0, cnf=0;
    raporlar.forEach(r=>{ const m = platformKirilimi(r).marka; kebo+=m.kebo; cnf+=m.cnf; });
    return {kebo, cnf};
  },[raporlar]);

  const grafikVerisi = useMemo(()=>sorted.map(r=>({
    gun: fmtTarih(r.tarih).substring(0,5), brut: brutHesapla(r), net: netHesapla(r),
  })), [sorted]);

  const totalPlatform = platformData.reduce((s,d)=>s+d.value,0);
  const son14 = grafikVerisi.slice(-14);
  const trendValues = son14.map(g=>g.brut);
  const netTrend    = son14.map(g=>g.net);
  const gunlukOrt   = ozet.gunSayisi>0 ? ozet.brut/ozet.gunSayisi : 0;
  const gunlukOrtNet= ozet.gunSayisi>0 ? ozet.net/ozet.gunSayisi : 0;

  if (raporlar.length===0) return null;

  return (
    <div className="rounded-2xl border border-[#e2e5eb] bg-[#ffffff] overflow-hidden shadow-2xl">
      <button onClick={()=>setAcik(!acik)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-black/[0.03] transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Activity className="h-3.5 w-3.5 text-blue-600"/>
          </div>
          <span className="text-sm font-semibold text-gray-800 tracking-tight">Dönem Analizi</span>
          <span className="text-[10px] text-gray-600 bg-black/[0.04] border border-white/10 px-2 py-0.5 rounded-full">{raporlar.length} gün</span>
        </div>
        {acik ? <ChevronUp className="h-4 w-4 text-gray-600"/> : <ChevronDown className="h-4 w-4 text-gray-600"/>}
      </button>

      {acik && (
        <div className="border-t border-[#e2e5eb] p-5 space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {label:"Günlük Ort. Brüt", value:`₺${fmt(gunlukOrt)}`, sub:"brüt ciro", spark:trendValues, color:"#60A5FA"},
              {label:"Günlük Ort. Net",  value:`₺${fmt(gunlukOrtNet)}`, sub:"net ciro", spark:netTrend, color:"#34D399"},
              {label:"En Yüksek Gün",    value:`₺${fmt(ozet.enYuksekBrut)}`, sub:ozet.enYuksekTarih?fmtTarih(ozet.enYuksekTarih):"—", spark:null, color:"#FBBF24"},
              {label:"Toplam Paket",     value:fmt(ozet.paket), sub:"adet dağıtım (uzak + 9km dahil)", spark:null, color:"#A78BFA"},
            ].map(card=>(
              <div key={card.label} className="bg-[#f7f8fa] rounded-xl border border-[#e2e5eb] p-4 hover:border-[#d8dde5] transition-colors">
                <p className="text-[10px] text-gray-600 uppercase tracking-widest font-medium mb-2">{card.label}</p>
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <p className="text-lg font-bold tracking-tight" style={{color:card.color}}>{card.value}</p>
                    <p className="text-[10px] text-gray-600 mt-0.5">{card.sub}</p>
                  </div>
                  {card.spark && <Sparkline values={card.spark} color={card.color}/>}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
            <div className="xl:col-span-2 bg-[#f7f8fa] rounded-xl border border-[#e2e5eb] p-4">
              <p className="text-[10px] text-gray-600 uppercase tracking-widest font-medium mb-3 flex items-center gap-1.5">
                <PieChart className="h-3 w-3"/> Platform Dağılımı
              </p>
              <div className="space-y-2">
                {platformData.filter(d=>d.value>0).map(d=>{
                  const pct = totalPlatform>0 ? (d.value/totalPlatform)*100 : 0;
                  return (
                    <div key={d.label}>
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{backgroundColor:d.color}}/>
                          <span className="text-[11px] text-gray-500">{d.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-[#1a1f2e]">₺{fmt(d.value)}</span>
                          <span className="text-[10px] text-gray-600 w-7 text-right">{Math.round(pct)}%</span>
                        </div>
                      </div>
                      <div className="h-1 bg-black/[0.04] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{width:`${pct}%`, backgroundColor:d.color, opacity:0.7}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
              {(markaData.kebo + markaData.cnf) > 0 && (
                <div className="mt-3 pt-3 border-t border-[#e2e5eb] flex items-center justify-between text-[11px]">
                  <span className="text-amber-700 font-semibold">🍔 Kebo ₺{fmt(markaData.kebo)}</span>
                  <span className="text-red-700 font-semibold">🍗 Chick&apos;N Fride ₺{fmt(markaData.cnf)}</span>
                </div>
              )}
            </div>

            <div className="xl:col-span-3 bg-[#f7f8fa] rounded-xl border border-[#e2e5eb] p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] text-gray-600 uppercase tracking-widest font-medium flex items-center gap-1.5">
                  <BarChart3 className="h-3 w-3"/> Günlük Ciro Trendi
                </p>
                <div className="flex items-center gap-3 text-[10px] text-gray-600">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500/60 inline-block"/>Brüt</span>
                  <span className="flex items-center gap-1"><span className="w-4 border-t-2 border-dashed border-emerald-500/60 inline-block"/>Net</span>
                </div>
              </div>
              <div className="relative" style={{height:"160px"}} role="img" aria-label="Günlük brüt ve net ciro grafiği">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={grafikVerisi} margin={{top:4,right:4,left:0,bottom:0}}>
                    <CartesianGrid stroke="rgba(0,0,0,0.06)" vertical={false}/>
                    <XAxis dataKey="gun" tick={{fontSize:10, fill:"#6b7280"}} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
                    <YAxis tick={{fontSize:10, fill:"#6b7280"}} tickLine={false} axisLine={false} width={44}
                      tickFormatter={(v:number)=>`₺${(v/1000).toFixed(0)}K`}/>
                    <Tooltip formatter={(v, ad)=>[`₺${fmt(Number(v))}`, ad==="brut"?"Brüt Ciro":"Net Ciro"]}
                      contentStyle={{fontSize:11, borderRadius:8, borderColor:"#d8dde5"}}/>
                    <Bar dataKey="brut" fill="rgba(59,130,246,0.5)" stroke="#3B82F6" radius={[4,4,0,0]}/>
                    <Line dataKey="net" type="monotone" stroke="#10B981" strokeWidth={2} strokeDasharray="5 3" dot={{r:2}}/>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PRINT MODAL ──────────────────────────────────────────────────────────────

function PrintModal({rapor, onClose}: {rapor:GunlukRapor, onClose:()=>void}) {
  const ref = useRef<HTMLDivElement>(null);
  const oz = raporOzeti(rapor);
  const kirilim = platformKirilimi(rapor);
  const tO = oz.online, tK = oz.kapida, tKasa = oz.kasa;
  const kapidaKasada = kapidaKasadaMi(rapor.tarih);
  // Yeni (Kebo/Chick'N Fride marka bazlı) yapıyla girilmiş mi? — eski raporlarda bu alanlar 0 olur.
  const yeniYapiVarMi = yeniYapiMi(rapor);
  const tIndirimPT = (rapor.os_kebo_ys_indirim||0)+(rapor.os_cnf_ys_indirim||0)+(rapor.ko_kebo_ys_indirim||0)+(rapor.ko_cnf_ys_indirim||0);
  const tIndirimTY = (rapor.os_kebo_trendyol_indirim||0)+(rapor.os_cnf_trendyol_indirim||0)+(rapor.ko_kebo_trendyol_indirim||0)+(rapor.ko_cnf_trendyol_indirim||0);
  const brutCiro = oz.brut;
  const net = oz.net;
  const toplamPaket = oz.paket;

  const doPrint = () => {
    const c=ref.current?.innerHTML||"";
    const w=window.open("","_blank"); if(!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>KEBO ERP — ${fmtTarih(rapor.tarih)}</title>
    <style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Courier New',monospace;font-size:11px;color:#111;background:#fff;padding:28px;}
    .logo{font-size:22px;font-weight:900;letter-spacing:4px;text-align:center;}
    .sub{text-align:center;font-size:10px;color:#888;margin-top:3px;}
    .divider{border:none;border-top:1px solid #ccc;margin:10px 0;}
    .section-title{font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;color:#555;margin:10px 0 5px;}
    .row{display:flex;justify-content:space-between;padding:2px 0;font-size:11px;}
    .row.bold{font-weight:900;}
    .row.net{font-size:14px;font-weight:900;border-top:2px solid #111;padding-top:5px;margin-top:3px;}
    .footer{text-align:center;font-size:9px;color:#aaa;margin-top:20px;}
    </style></head><body>${c}</body></html>`);
    w.document.close(); w.focus();
    setTimeout(()=>{w.print();w.close();},400);
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white text-gray-900 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="bg-gray-50 border-b px-5 py-3 flex items-center justify-between">
          <h3 className="font-bold text-sm text-gray-700 flex items-center gap-2"><Printer className="h-4 w-4"/>Yazdırma Önizlemesi</h3>
          <div className="flex gap-2">
            <button onClick={doPrint} className="bg-[#0c1a3a] text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 hover:bg-[#162040]">
              <Printer className="h-3.5 w-3.5"/>Yazdır / PDF
            </button>
            <button onClick={onClose} className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold px-4 py-2 rounded-lg">Kapat</button>
          </div>
        </div>
        <div className="p-6 max-h-[75vh] overflow-y-auto">
          <div ref={ref} className="font-mono text-xs text-gray-900">
            <div className="logo">KEBO ERP</div>
            <div className="sub">Günlük Kasa Kapanış Raporu</div>
            <div className="sub" style={{fontWeight:"bold",marginTop:"6px"}}>{fmtTarih(rapor.tarih)}</div>
            <div className="sub">Giren: {rapor.ekleyen_kullanici}</div>
            <hr className="divider"/>
            <div className="section-title">Online Kanallar</div>
            {PLATFORMLAR.filter(p=>kirilim.online[p]>0).map(p=>(
              <div key={p} className="row"><span>{p}</span><span>₺{fmt(kirilim.online[p])}</span></div>
            ))}
            <div className="row bold"><span>Online Toplam</span><span>₺{fmt(tO)}</span></div>
            <hr className="divider"/>
            <div className="section-title">Kapıda Ödeme</div>
            {PLATFORMLAR.filter(p=>kirilim.kapida[p]>0).map(p=>(
              <div key={p} className="row"><span>{p} Kapıda</span><span>₺{fmt(kirilim.kapida[p])}</span></div>
            ))}
            <div className="row bold"><span>Kapıda Toplam</span><span>₺{fmt(tK)}</span></div>
            <div className="row"><span style={{color:"#888",fontSize:"10px"}}>{kapidaKasada
              ? "↳ Kendi kuryelerimiz topladı; tutar kasa sayımının içinde (brüte ayrıca eklenmez)"
              : "↳ Roadrunner'da kalır, haftalık mutabakatla mahsup edilir (brüte ayrıca eklenir)"}</span><span></span></div>
            <hr className="divider"/>
            <div className="section-title">Fiziki Kasa</div>
            {rapor.kasa_nakit>0&&<div className="row"><span>Nakit</span><span>₺{fmt(rapor.kasa_nakit)}</span></div>}
            {rapor.kasa_pos>0&&<div className="row"><span>POS / K.Kartı</span><span>₺{fmt(rapor.kasa_pos)}</span></div>}
            {rapor.kasa_edenred>0&&<div className="row"><span>Edenred / Sodexo</span><span>₺{fmt(rapor.kasa_edenred)}</span></div>}
            {rapor.kasa_metropol>0&&<div className="row"><span>Metropol</span><span>₺{fmt(rapor.kasa_metropol)}</span></div>}
            <div className="row bold"><span>Kasa Toplam</span><span>₺{fmt(tKasa)}</span></div>
            {yeniYapiVarMi && (
              <>
                <hr className="divider"/>
                <div className="section-title">Marka Detayı (Kebo / Chick&apos;N Fride)</div>
                <div className="row"><span style={{fontWeight:700}}>Kebo</span><span></span></div>
                {(rapor.os_kebo_ys||rapor.ko_kebo_ys)>0&&<div className="row"><span>· Yemeksepeti ({(rapor.os_kebo_ys_paket||0)+(rapor.ko_kebo_ys_paket||0)} pkt)</span><span>₺{fmt((rapor.os_kebo_ys||0)+(rapor.ko_kebo_ys||0))}</span></div>}
                {(rapor.os_kebo_trendyol||rapor.ko_kebo_trendyol)>0&&<div className="row"><span>· Trendyol ({(rapor.os_kebo_trendyol_paket||0)+(rapor.ko_kebo_trendyol_paket||0)} pkt)</span><span>₺{fmt((rapor.os_kebo_trendyol||0)+(rapor.ko_kebo_trendyol||0))}</span></div>}
                {(rapor.os_kebo_migros||rapor.ko_kebo_migros_yemek)>0&&<div className="row"><span>· Migros ({(rapor.os_kebo_migros_paket||0)+(rapor.ko_kebo_migros_yemek_paket||0)} pkt)</span><span>₺{fmt((rapor.os_kebo_migros||0)+(rapor.ko_kebo_migros_yemek||0))}</span></div>}
                {rapor.ko_kebo_alo>0&&<div className="row"><span>· Alo Paket ({rapor.ko_kebo_alo_paket||0} pkt)</span><span>₺{fmt(rapor.ko_kebo_alo)}</span></div>}
                <div className="row"><span style={{fontWeight:700,marginTop:"4px"}}>Chick&apos;N Fride</span><span></span></div>
                {(rapor.os_cnf_ys||rapor.ko_cnf_ys)>0&&<div className="row"><span>· Yemeksepeti ({(rapor.os_cnf_ys_paket||0)+(rapor.ko_cnf_ys_paket||0)} pkt)</span><span>₺{fmt((rapor.os_cnf_ys||0)+(rapor.ko_cnf_ys||0))}</span></div>}
                {(rapor.os_cnf_trendyol||rapor.ko_cnf_trendyol)>0&&<div className="row"><span>· Trendyol ({(rapor.os_cnf_trendyol_paket||0)+(rapor.ko_cnf_trendyol_paket||0)} pkt)</span><span>₺{fmt((rapor.os_cnf_trendyol||0)+(rapor.ko_cnf_trendyol||0))}</span></div>}
                {(rapor.os_cnf_migros_yemek||rapor.ko_cnf_migros_yemek)>0&&<div className="row"><span>· Migros Yemek ({(rapor.os_cnf_migros_yemek_paket||0)+(rapor.ko_cnf_migros_yemek_paket||0)} pkt)</span><span>₺{fmt((rapor.os_cnf_migros_yemek||0)+(rapor.ko_cnf_migros_yemek||0))}</span></div>}
                {rapor.ko_cnf_alo>0&&<div className="row"><span>· Alo Paket ({rapor.ko_cnf_alo_paket||0} pkt)</span><span>₺{fmt(rapor.ko_cnf_alo)}</span></div>}
                {(tIndirimPT+tIndirimTY)>0&&<>
                  <div className="row" style={{color:"#dc2626"}}><span>(-) Yemeksepeti İndirim</span><span>-₺{fmt(tIndirimPT)}</span></div>
                  <div className="row" style={{color:"#dc2626"}}><span>(-) Trendyol İndirim</span><span>-₺{fmt(tIndirimTY)}</span></div>
                </>}
              </>
            )}
            <hr className="divider"/>
            <div className="row"><span>Online</span><span>₺{fmt(tO)}</span></div>
            {!kapidaKasada && tK>0 && <div className="row"><span>(+) Kapıda Ödeme</span><span>₺{fmt(tK)}</span></div>}
            <div className="row"><span>(+) Kasa</span><span>₺{fmt(tKasa)}</span></div>
            {oz.gider>0&&<div className="row"><span>(+) Giderler (kasadan ödendi)</span><span>₺{fmt(oz.gider)}</span></div>}
            <div className="row bold" style={{fontSize:"13px"}}><span>BRÜT CİRO</span><span>₺{fmt(brutCiro)}</span></div>
            {oz.gider>0&&<div className="row"><span>(-) Giderler</span><span>-₺{fmt(oz.gider)}</span></div>}
            {oz.iade>0&&<div className="row"><span>(-) İadeler</span><span>-₺{fmt(oz.iade)}</span></div>}
            {oz.indirim>0&&<div className="row"><span>(-) Platform İndirimleri</span><span>-₺{fmt(oz.indirim)}</span></div>}
            <div className="row net"><span>✦ NET CİRO</span><span>₺{fmt(net)}</span></div>
            {rapor.kurye_raporlari && rapor.kurye_raporlari.length>0&&<>
              <hr className="divider"/>
              <div className="section-title">Kurye Mutabakatı ({toplamPaket} Paket)</div>
              {rapor.kurye_raporlari.map((k,i)=>(
                <div key={i} className="row">
                  <span>{k.isim||"—"} · {kuryeGercekPaket(k)} pkt</span>
                  <span>Nakit: ₺{fmt(Number(k.nakit))} | Kredi: ₺{fmt(Number(k.pos))}</span>
                </div>
              ))}
            </>}
            {rapor.gider_aciklama?.includes("|| NOT:") && (
              <><hr className="divider"/><div className="section-title">Notlar</div>
              <div style={{fontSize:"10px",color:"#555",lineHeight:"1.5"}}>
                {rapor.gider_aciklama.split("|| NOT:")[1]?.trim()}
              </div></>
            )}
            <div className="footer">KEBO ERP · {new Date().toLocaleString("tr-TR")} · Sistem Kaydı</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CSV EXPORT ───────────────────────────────────────────────────────────────

function exportCSV(raporlar: GunlukRapor[], ay: string, yil: string) {
  const ayLabel = ["","Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"][parseInt(ay)];
  const headers = ["Tarih","Brüt Ciro","Net Ciro","Online Toplam","Kapıda Toplam","Kasa Toplam","Gider","İade","İndirim","Toplam Paket","Raporu Giren"];
  // Excel'in Türkçe ayarlarında ondalık ayırıcı virgül olduğu için alan ayırıcı olarak ";" kullanılıyor.
  const hucre = (v: string|number) => typeof v === "number" ? v.toFixed(2).replace(".", ",") : `"${String(v ?? "").replace(/"/g,'""')}"`;
  const rows = raporlar.map(r=>{
    const o = raporOzeti(r);
    return [fmtTarih(r.tarih),o.brut,o.net,o.online,o.kapida,o.kasa,o.gider,o.iade,o.indirim,o.paket,r.ekleyen_kullanici].map(hucre).join(";");
  });
  const csv = [headers.join(";"), ...rows].join("\n");
  const blob = new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url;
  a.download=`KEBO_Rapor_${ayLabel}_${yil}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ─── PDF EXPORT ───────────────────────────────────────────────────────────────

function exportPDF(raporlar: GunlukRapor[], ay: string, yil: string) {
  const ayLabel = ["","Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"][parseInt(ay)];
  const kacis = (s: string) => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c] as string));
  const rows = raporlar.map(r=>{
    const o = raporOzeti(r);
    return `<tr><td>${fmtTarih(r.tarih)}</td><td>₺${fmt(o.brut)}</td><td style="color:#16a34a;font-weight:700">₺${fmt(o.net)}</td>
      <td>₺${fmt(o.online)}</td><td style="color:#dc2626">-₺${fmt(o.gider+o.iade+o.indirim)}</td><td>${o.paket}</td><td>${kacis(r.ekleyen_kullanici)}</td></tr>`;
  }).join("");
  const dOzet = donemOzeti(raporlar);
  const toplam = dOzet.brut;
  const toplamNet = dOzet.net;
  const w=window.open("","_blank"); if(!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>KEBO ERP — ${ayLabel} ${yil}</title>
  <style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:system-ui,sans-serif;font-size:11px;color:#111;background:#fff;padding:32px;}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #0c1a3a;}
  .logo{font-size:28px;font-weight:900;letter-spacing:3px;color:#0c1a3a;}.logo span{color:#3B82F6;}
  .meta{text-align:right;color:#666;font-size:11px;line-height:1.8;}
  h2{font-size:14px;font-weight:700;color:#0c1a3a;margin-bottom:12px;}
  table{width:100%;border-collapse:collapse;font-size:11px;}
  th{background:#0c1a3a;color:#fff;padding:8px 10px;text-align:left;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;}
  td{padding:7px 10px;border-bottom:1px solid #e5e7eb;}
  tr:nth-child(even) td{background:#f9fafb;}
  tfoot td{background:#0c1a3a;color:#fff;font-weight:700;padding:8px 10px;}
  .footer{margin-top:24px;text-align:center;font-size:9px;color:#aaa;}
  @media print{@page{margin:20mm;size:A4 landscape;}}
  </style></head><body>
  <div class="header">
    <div><div class="logo">KEBO<span>.</span>ERP</div><div style="font-size:11px;color:#888;margin-top:4px;">Finansal Yönetim Sistemi</div></div>
    <div class="meta"><div><strong>${ayLabel} ${yil}</strong> Dönemi</div><div>Toplam ${raporlar.length} günlük rapor</div><div>Oluşturuldu: ${new Date().toLocaleString("tr-TR")}</div></div>
  </div>
  <h2>Günlük Kasa Kapanış Raporu — ${ayLabel} ${yil}</h2>
  <table><thead><tr><th>Tarih</th><th>Brüt Ciro</th><th>Net Ciro</th><th>Online Toplam</th><th>Gider+İade+İndirim</th><th>Paket</th><th>Giren</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr><td>DÖNEM TOPLAMI</td><td>₺${fmt(toplam)}</td><td>₺${fmt(toplamNet)}</td><td>₺${fmt(dOzet.online)}</td><td>-₺${fmt(dOzet.gider+dOzet.iade+dOzet.indirim)}</td><td>${dOzet.paket}</td><td></td></tr></tfoot>
  </table>
  <div class="footer">KEBO ERP Finansal Yönetim Sistemi · Gizli ve Yetkili Kullanım İçindir</div>
  </body></html>`);
  w.document.close(); w.focus(); setTimeout(()=>{w.print();w.close();},500);
}

// ─── CURRENCY INPUT ───────────────────────────────────────────────────────────

function CurrencyInput({label, value, onChange, disabled=false}:
  {label:string, value:string, onChange:(v:string)=>void, disabled?:boolean}) {
  return (
    <div className="group">
      <label className="block text-[12px] text-gray-700 font-semibold mb-1.5">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-[13px] font-semibold">₺</span>
        <input
          type="text" inputMode="decimal" value={value} disabled={disabled}
          onChange={e=>onChange(paraGirdisi(e.target.value))}
          className="w-full bg-[#f7f8fa] border border-[#dde1e8] hover:border-[#b9c2d1] focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/15 text-[#1a1f2e] text-[15px] font-bold h-10 pl-7 pr-3 rounded-xl outline-none transition-all disabled:opacity-40 disabled:cursor-not-allowed placeholder:text-gray-600"
          placeholder="0"
        />
      </div>
    </div>
  );
}

// ─── KURYE DÖNEM YAPISI ────────────────────────────────────────────────────────
// 13.08.2026: Geçiş günü — hem kendi kurye hem Roadrunner havuz kuryesi çalıştı (garanti yok).
// 14.08.2026'dan itibaren: Roadrunner 2 sabit kurye (30 paket garantili) + havuz kurye.
// Bu tarihten öncesi: sadece kendi personel kuryesi (garanti yok).
function kuryeYapisiHesapla(tarihStr: string): KuryeRaporu[] {
  if (!tarihStr || tarihStr < ROADRUNNER_GECIS_GUNU) {
    return [{id:Date.now(),isim:"",nakit:"",pos:"",paketSayisi:"",uzakPaket:"",paket9km:"",tip:"kendi"}];
  }
  if (tarihStr === ROADRUNNER_GECIS_GUNU) {
    return [
      {id:Date.now(),isim:"",nakit:"",pos:"",paketSayisi:"",uzakPaket:"",paket9km:"",tip:"kendi"},
      {id:Date.now()+1,isim:"Havuz Kurye",nakit:"",pos:"",paketSayisi:"",uzakPaket:"",paket9km:"",tip:"havuz"},
    ];
  }
  return [
    {id:1,isim:"Kurye 1",nakit:"",pos:"",paketSayisi:"",uzakPaket:"",paket9km:"",tip:"sabit"},
    {id:2,isim:"Kurye 2",nakit:"",pos:"",paketSayisi:"",uzakPaket:"",paket9km:"",tip:"sabit"},
    {id:3,isim:"Havuz Kurye",nakit:"",pos:"",paketSayisi:"",uzakPaket:"",paket9km:"",tip:"havuz"},
  ];
}
// ─── PLATFORM SATIRI (tutar + paket sayısı + opsiyonel indirim) ───────────────
function PlatformSatir({label, value, onChange, indirim, onIndirimChange, disabled=false}:
  {label:string, value:PlatformGiris, onChange:(v:PlatformGiris)=>void,
   indirim?:string, onIndirimChange?:(v:string)=>void, disabled?:boolean}) {
  return (
    <div className="rounded-xl border border-[#dde1e8] bg-[#f7f8fa] p-3 hover:border-[#d8dde5] transition-colors">
      <p className="text-[13px] text-gray-800 font-semibold mb-2">{label}</p>
      <div className="flex items-center gap-2">
        <div className="relative flex-[1.4]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-[13px] font-semibold pointer-events-none">₺</span>
          <input type="text" inputMode="decimal" value={value.tutar} disabled={disabled}
            onChange={e=>onChange({...value, tutar: paraGirdisi(e.target.value)})}
            placeholder="0"
            className="w-full bg-[#f7f8fa] border border-[#dde1e8] hover:border-[#b9c2d1] focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/15 text-[#1a1f2e] text-[15px] font-bold h-10 pl-7 pr-2 rounded-lg outline-none transition-all disabled:opacity-40 disabled:cursor-not-allowed placeholder:text-gray-600"/>
        </div>
        <div className="relative flex-1">
          <Package size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-700/70 pointer-events-none"/>
          <input type="number" value={value.paket} disabled={disabled}
            onChange={e=>onChange({...value, paket: e.target.value})}
            placeholder="0"
            title="Paket sayısı"
            className="w-full bg-[#f7f8fa] border border-[#dde1e8] hover:border-[#b9c2d1] focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/15 text-amber-700 text-[15px] font-bold h-10 pl-8 pr-2 rounded-lg outline-none transition-all disabled:opacity-40 disabled:cursor-not-allowed placeholder:text-gray-600"/>
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-gray-600 font-medium pointer-events-none hidden sm:block">pkt</span>
        </div>
      </div>
      {onIndirimChange && (
        <div className="relative mt-2">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-red-600/90 pointer-events-none">İndirim ₺</span>
          <input type="text" inputMode="decimal" value={indirim||""} disabled={disabled}
            onChange={e=>onIndirimChange(paraGirdisi(e.target.value))}
            placeholder="0"
            className="w-full bg-[#fef2f2] border border-red-500/15 hover:border-red-500/30 focus:border-red-500/50 focus:ring-2 focus:ring-red-500/15 text-red-700 text-[13px] font-bold h-8 pl-[68px] pr-2 rounded-lg outline-none transition-all disabled:opacity-40 disabled:cursor-not-allowed placeholder:text-gray-700 text-right"/>
        </div>
      )}
    </div>
  );
}
// ─── AKILLI GİDER INPUT ───────────────────────────────────────────────────────

function AkilliGiderInput({
  value, onChange, disabled, oneriListesi, placeholder="Açıklama..."
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  oneriListesi: string[];
  placeholder?: string;
}) {
  const [acik, setAcik] = useState(false);
  const [arama, setArama] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAcik(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtreli = useMemo(() => {
    const q = (arama || value).toLowerCase();
    if (!q) return oneriListesi.slice(0, 8);
    return oneriListesi.filter(o => o.toLowerCase().includes(q)).slice(0, 8);
  }, [arama, value, oneriListesi]);

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        placeholder={placeholder}
        disabled={disabled}
        value={value}
        onChange={e => { onChange(e.target.value); setArama(e.target.value); setAcik(true); }}
        onFocus={() => setAcik(true)}
        className="w-full bg-[#f7f8fa] border border-[#e2e5eb] hover:border-[#d8dde5] focus:border-blue-500/40 text-[#1a1f2e] text-xs h-7 px-2.5 rounded-lg outline-none transition-all disabled:opacity-40 placeholder:text-gray-700"
      />
      {acik && !disabled && filtreli.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[#ffffff] border border-[#e2e5eb] rounded-xl shadow-2xl overflow-hidden">
          {filtreli.map((o, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={() => { onChange(o); setAcik(false); setArama(""); }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-500/10 hover:text-[#1a1f2e] transition-colors flex items-center gap-2"
            >
              <Sparkles size={9} className="text-blue-700/50 shrink-0"/>
              {o}
            </button>
          ))}
          <div className="border-t border-[#e2e5eb] px-3 py-1 text-[10px] text-gray-700">
            Diğer: istediğinizi yazabilirsiniz
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function RaporlarPage() {
  const supabase = useMemo(() => createClient(), []);
  const yetki = useYetki();
  const isAdmin = yetki.tamYetkili;
  const isOnayliDuzenleyici = yetki.mudur;
  const userEmail = yetki.email;

  // ── Auth & Data ──
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [onayBekleyenler, setOnayBekleyenler] = useState<DegisiklikTalebi[]>([]);
  const [onayGecmisi, setOnayGecmisi] = useState<DegisiklikTalebi[]>([]);
  const [onayModalAcik, setOnayModalAcik] = useState(false);
  const [onayModalTab, setOnayModalTab] = useState<"bekleyen"|"gecmis">("bekleyen");
  const [onayIslemId, setOnayIslemId] = useState<string|null>(null);
  const [raporlar, setRaporlar] = useState<GunlukRapor[]>([]);
  const [enSonRaporTarihi, setEnSonRaporTarihi] = useState<string|null>(null);
  const [mevcutTarihler, setMevcutTarihler] = useState<Set<string>>(new Set());
  const [cariListesi, setCariListesi] = useState<Cari[]>([]);
  const [secilenAy, setSecilenAy] = useState(()=>buAyYil().ay);
  const [secilenYil, setSecilenYil] = useState(()=>buAyYil().yil);

  // ── Akıllı gider önerileri ──
  const [giderOnerileri, setGiderOnerileri] = useState<string[]>(VARSAYILAN_GIDER_ONERILERI);

  // ── UI State ──
  const [formAcik, setFormAcik] = useState(false);
  const [selectedRapor, setSelectedRapor] = useState<GunlukRapor|null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [printRapor, setPrintRapor] = useState<GunlukRapor|null>(null);
  const [duplikaTarihHata, setDuplikaTarihHata] = useState(false);

  // ── AI Soru ──
  const [aiSoru, setAiSoru] = useState("");
  const [aiCevap, setAiCevap] = useState("");
  const [aiYukleniyor, setAiYukleniyor] = useState(false);
  const [aiAcik, setAiAcik] = useState(false);

  // ── Form Fields ──
  const [tarih, setTarih] = useState("");
  const [tarihHataVarMi, setTarihHataVarMi] = useState(false);
  const [adminOnayliGecis, setAdminOnayliGecis] = useState(false);
  // ── Online — Kebo ──
  const [osKeboYs, setOsKeboYs] = useState<PlatformGiris>({tutar:"",paket:""});
  const [osKeboYsIndirim, setOsKeboYsIndirim] = useState("");
  const [osKeboTrendyol, setOsKeboTrendyol] = useState<PlatformGiris>({tutar:"",paket:""});
  const [osKeboTrendyolIndirim, setOsKeboTrendyolIndirim] = useState("");
  const [osKeboMigros, setOsKeboMigros] = useState<PlatformGiris>({tutar:"",paket:""});
  // ── Online — Chick'N Fride ──
  const [osCnfYs, setOsCnfYs] = useState<PlatformGiris>({tutar:"",paket:""});
  const [osCnfYsIndirim, setOsCnfYsIndirim] = useState("");
  const [osCnfTrendyol, setOsCnfTrendyol] = useState<PlatformGiris>({tutar:"",paket:""});
  const [osCnfTrendyolIndirim, setOsCnfTrendyolIndirim] = useState("");
  const [osCnfMigrosYemek, setOsCnfMigrosYemek] = useState<PlatformGiris>({tutar:"",paket:""});
  // ── Kapıda Ödeme — Kebo ──
  const [koKeboYs, setKoKeboYs] = useState<PlatformGiris>({tutar:"",paket:""});
  const [koKeboYsIndirim, setKoKeboYsIndirim] = useState("");
  const [koKeboTrendyol, setKoKeboTrendyol] = useState<PlatformGiris>({tutar:"",paket:""});
  const [koKeboTrendyolIndirim, setKoKeboTrendyolIndirim] = useState("");
  const [koKeboMigrosYemek, setKoKeboMigrosYemek] = useState<PlatformGiris>({tutar:"",paket:""});
  const [koKeboAlo, setKoKeboAlo] = useState<PlatformGiris>({tutar:"",paket:""});
  // ── Kapıda Ödeme — Chick'N Fride ──
  const [koCnfYs, setKoCnfYs] = useState<PlatformGiris>({tutar:"",paket:""});
  const [koCnfYsIndirim, setKoCnfYsIndirim] = useState("");
  const [koCnfTrendyol, setKoCnfTrendyol] = useState<PlatformGiris>({tutar:"",paket:""});
  const [koCnfTrendyolIndirim, setKoCnfTrendyolIndirim] = useState("");
  const [koCnfMigrosYemek, setKoCnfMigrosYemek] = useState<PlatformGiris>({tutar:"",paket:""});
  const [koCnfAlo, setKoCnfAlo] = useState<PlatformGiris>({tutar:"",paket:""});
  const [kasaNakit, setKasaNakit] = useState(""); const [kasaPos, setKasaPos] = useState("");
  const [kasaEdenred, setKasaEdenred] = useState(""); const [kasaMetropol, setKasaMetropol] = useState("");
  const [giderler, setGiderler] = useState<SatirRaporu[]>(()=>[{id:1,aciklama:"",tutar:"",tip:"normal"}]);
  const [iadeler, setIadeler] = useState<SatirRaporu[]>(()=>[{id:2,aciklama:"",tutar:""}]); // İptal-İade Fişleri
  const [kuryeler, setKuryeler] = useState<KuryeRaporu[]>(()=>kuryeYapisiHesapla(bugun()));
  const [notlar, setNotlar] = useState("");
  // Personel Avans / Yemek Kesintisi için tüm aktif personel (id + isim)
  const [avansPersonelListesi, setAvansPersonelListesi] = useState<PersonelKisa[]>([]);
  const [kesintiSatirlari, setKesintiSatirlari] = useState<{id:number; personelId?:string; personelIsim:string; tutar:string; aciklama:string}[]>([]);
  // ── Fişten Doldur (AI tarama) ──
  const [taramaYukleniyor, setTaramaYukleniyor] = useState(false);
  const [taramaHata, setTaramaHata] = useState("");
  const [taramaBelirsizAlanlar, setTaramaBelirsizAlanlar] = useState<string[]>([]);
  const dosyaInputRef = useRef<HTMLInputElement>(null);

  const personelIdBul = useCallback((isim?: string) =>
    avansPersonelListesi.find(p => p.isim === isim)?.id, [avansPersonelListesi]);

  // ── Data Fetch ──
  const veriCek = useCallback(async () => {
    if (yetki.yukleniyor) return;
    setLoading(true);
    if (yetki.tamYetkili) {
      const { data: talepler } = await supabase.from("rapor_degisiklik_talepleri")
        .select("*").order("talep_tarihi", { ascending: false });
      if (talepler) {
        setOnayBekleyenler((talepler as DegisiklikTalebi[]).filter(t => t.durum === "bekliyor"));
        setOnayGecmisi((talepler as DegisiklikTalebi[]).filter(t => t.durum !== "bekliyor"));
      }
    }

    const [sonRaporRes, tumTarihlerRes, personelRes, cariRes, raporRes] = await Promise.all([
      supabase.from("gunluk_raporlar").select("tarih").order("tarih",{ascending:false}).limit(1),
      supabase.from("gunluk_raporlar").select("tarih").gte("tarih", `${Number(secilenYil)-1}-01-01`),
      supabase.from("personeller").select("id, isim").eq("durum","aktif").order("isim"),
      supabase.from("cariler").select("id, unvan, cari_kodu").order("unvan"),
      supabase.from("gunluk_raporlar").select("*")
        .gte("tarih", `${secilenYil}-${secilenAy}-01`)
        .lte("tarih", aySonu(secilenYil, secilenAy))
        .order("tarih",{ascending:false}),
    ]);
    setEnSonRaporTarihi(sonRaporRes.data?.[0]?.tarih ?? null);
    setMevcutTarihler(new Set((tumTarihlerRes.data||[]).map((r:{tarih:string})=>r.tarih)));
    setAvansPersonelListesi((personelRes.data||[]).map((p:{id:number|string; isim:string})=>({id:String(p.id), isim:p.isim})));
    if (cariRes.data) setCariListesi(cariRes.data as Cari[]);

    if (!raporRes.error && raporRes.data) {
      const rList = raporRes.data as GunlukRapor[];
      setRaporlar(rList);
      const gecmisGiderler = new Set<string>(VARSAYILAN_GIDER_ONERILERI);
      rList.forEach(r => {
        giderMetniniAyristir(r.gider_aciklama).giderler.forEach(g => {
          if (g.tip === "normal" && g.aciklama && g.aciklama !== "Belirtilmemiş") gecmisGiderler.add(g.aciklama);
        });
      });
      setGiderOnerileri([...gecmisGiderler]);
    }
    setLoading(false);
  }, [secilenAy, secilenYil, supabase, yetki.yukleniyor, yetki.tamYetkili]);

  useEffect(()=>{veriCek();},[veriCek]);

  // ── Helpers ──
  const siradakiTarih = (): string|null => enSonRaporTarihi ? gunEkle(enSonRaporTarihi, 1) : null;

  const handleTarihChange = (val: string) => {
    setTarih(val); setAdminOnayliGecis(false); setDuplikaTarihHata(false);
    // Yeni rapor eklerken (düzenleme değil) seçilen tarihe göre doğru kurye yapısını (kendi/geçiş/Roadrunner) otomatik kur.
    if (!selectedRapor) setKuryeler(kuryeYapisiHesapla(val));
    if (!val||selectedRapor) { setTarihHataVarMi(false); return; }
    if (mevcutTarihler.has(val)) { setDuplikaTarihHata(true); setTarihHataVarMi(false); return; }
    if (val > bugun()) { setTarihHataVarMi(true); return; }
    if (!enSonRaporTarihi) { setTarihHataVarMi(false); return; }
    const dogruTarih = siradakiTarih();
    setTarihHataVarMi(!!dogruTarih && val!==dogruTarih);
  };

  const formuTemizle = () => {
    const bosPG = ():PlatformGiris=>({tutar:"",paket:""});
    setOsKeboYs(bosPG());setOsKeboYsIndirim("");setOsKeboTrendyol(bosPG());setOsKeboTrendyolIndirim("");setOsKeboMigros(bosPG());
    setOsCnfYs(bosPG());setOsCnfYsIndirim("");setOsCnfTrendyol(bosPG());setOsCnfTrendyolIndirim("");setOsCnfMigrosYemek(bosPG());
    setKoKeboYs(bosPG());setKoKeboYsIndirim("");setKoKeboTrendyol(bosPG());setKoKeboTrendyolIndirim("");setKoKeboMigrosYemek(bosPG());setKoKeboAlo(bosPG());
    setKoCnfYs(bosPG());setKoCnfYsIndirim("");setKoCnfTrendyol(bosPG());setKoCnfTrendyolIndirim("");setKoCnfMigrosYemek(bosPG());setKoCnfAlo(bosPG());
    setKasaNakit("");setKasaPos("");setKasaEdenred("");setKasaMetropol("");
    setGiderler([{id:yeniSatirId(),aciklama:"",tutar:"",tip:"normal"}]);
    setIadeler([{id:yeniSatirId(),aciklama:"",tutar:""}]);
    setKesintiSatirlari([]);
    setTarih("");setTarihHataVarMi(false);setAdminOnayliGecis(false);setDuplikaTarihHata(false);
    setKuryeler(kuryeYapisiHesapla(bugun()));
    setNotlar("");setSelectedRapor(null);setIsEditMode(false);
    setTaramaHata(""); setTaramaBelirsizAlanlar([]);
  };

  // ── Rapor Sil ── (rapora bağlı avans/kesinti/firma ödemeleri veritabanında otomatik silinir)
  const handleRaporSil = async (rapor: GunlukRapor) => {
    if (!confirm(`${fmtTarih(rapor.tarih)} tarihli raporu ve rapordan oluşan avans/kesinti/firma ödemesi kayıtlarını silmek istiyor musunuz?`)) return;
    const { error } = await supabase.from("gunluk_raporlar").delete().eq("id", rapor.id);
    if (error) { alert("Silme hatası: " + error.message); return; }
    formuTemizle(); setFormAcik(false); veriCek();
  };

  // ── Onay Bekleyen Değişiklik: Onayla / Reddet ──
  const handleTalepOnayla = async (talep: DegisiklikTalebi) => {
    if (!isAdmin) return;
    if (!confirm(`${fmtTarih(talep.rapor_tarihi)} tarihli rapor için ${talep.talep_eden} tarafından yapılan değişikliği onaylıyor musunuz?`)) return;
    setOnayIslemId(talep.id);
    try {
      // Rapor, avans/kesinti/firma ödemeleri ve talep durumu tek işlemde güncellenir.
      const { error } = await supabase.rpc("talep_onayla", { p_talep_id: talep.id });
      if (error) { alert("Onaylanırken hata: " + error.message); return; }
      veriCek();
    } finally {
      setOnayIslemId(null);
    }
  };

  const handleTalepReddet = async (talep: DegisiklikTalebi) => {
    if (!isAdmin) return;
    const sebep = prompt("Reddetme sebebi (opsiyonel):");
    if (sebep === null) return;
    setOnayIslemId(talep.id);
    try {
      const { error } = await supabase.from("rapor_degisiklik_talepleri")
        .update({ durum: "reddedildi", onaylayan: userEmail, onay_tarihi: new Date().toISOString(), red_sebebi: sebep })
        .eq("id", talep.id);
      if (error) { alert("Hata: " + error.message); return; }
      veriCek();
    } finally {
      setOnayIslemId(null);
    }
  };

  // İki rapor kaydı arasındaki farklı alanları okunabilir şekilde listeler
  const talepFarklari = (eski: Record<string, unknown> | null, yeni: Record<string, unknown> | null) => {
    const ALAN_ETIKET: Record<string,string> = {
      os_kebo_ys:"Kebo · Yemeksepeti (Online)", os_kebo_trendyol:"Kebo · Trendyol (Online)", os_kebo_migros:"Kebo · Migros (Online)",
      os_cnf_ys:"CNF · Yemeksepeti (Online)", os_cnf_trendyol:"CNF · Trendyol (Online)", os_cnf_migros_yemek:"CNF · Migros Yemek (Online)",
      ko_kebo_ys:"Kebo · Yemeksepeti (Kapıda)", ko_kebo_trendyol:"Kebo · Trendyol (Kapıda)", ko_kebo_migros_yemek:"Kebo · Migros Yemek (Kapıda)", ko_kebo_alo:"Kebo · Alo Paket",
      ko_cnf_ys:"CNF · Yemeksepeti (Kapıda)", ko_cnf_trendyol:"CNF · Trendyol (Kapıda)", ko_cnf_migros_yemek:"CNF · Migros Yemek (Kapıda)", ko_cnf_alo:"CNF · Alo Paket",
      os_yemeksepeti:"Yemeksepeti (Online, eski)", os_getir:"Getir (Online)", os_trendyol:"Trendyol (Online, eski)",
      os_migros:"Migros (Online, eski)", os_chicknfride:"Chick'N Fride (Online, eski)",
      ko_yemeksepeti:"Yemeksepeti (Kapıda, eski)", ko_getir:"Getir (Kapıda)", ko_trendyol:"Trendyol (Kapıda, eski)",
      ko_migros:"Migros (Kapıda, eski)", ko_alo_paket:"Alo Paket (eski)", ko_chicknfride:"Chick'N Fride (Kapıda, eski)",
      kasa_nakit:"Kasa Nakit", kasa_pos:"Kasa POS", kasa_edenred:"Kasa Edenred", kasa_metropol:"Kasa Metropol",
      gunluk_gider:"Günlük Gider", iade_tutar:"İade Tutarı", toplam_ciro:"Brüt Ciro",
      gider_aciklama:"Gider Açıklaması", iade_aciklama:"İade Açıklaması",
    };
    const farklar: { alan:string; eskiDeger:unknown; yeniDeger:unknown }[] = [];
    Object.keys(ALAN_ETIKET).forEach(k => {
      if (!yeni || !(k in yeni)) return;
      const eskiVal = eski?.[k] ?? null; const yeniVal = yeni?.[k] ?? null;
      const sayisal = typeof eskiVal === "number" || typeof yeniVal === "number";
      const ayni = sayisal ? Number(eskiVal||0) === Number(yeniVal||0) : JSON.stringify(eskiVal) === JSON.stringify(yeniVal);
      if (!ayni) farklar.push({ alan: ALAN_ETIKET[k], eskiDeger: eskiVal, yeniDeger: yeniVal });
    });
    return farklar;
  };

  const raporuFormaYukle = async (r: GunlukRapor) => {
    setTarih(r.tarih); setTarihHataVarMi(false); setAdminOnayliGecis(false); setDuplikaTarihHata(false);
    const pg = (tutar: number, paket: number) => ({tutar: paraYaz(tutar), paket: paket ? String(paket) : ""});
    if (yeniYapiMi(r)) {
      setOsKeboYs(pg(r.os_kebo_ys, r.os_kebo_ys_paket)); setOsKeboYsIndirim(paraYaz(r.os_kebo_ys_indirim));
      setOsKeboTrendyol(pg(r.os_kebo_trendyol, r.os_kebo_trendyol_paket)); setOsKeboTrendyolIndirim(paraYaz(r.os_kebo_trendyol_indirim));
      setOsKeboMigros(pg(r.os_kebo_migros, r.os_kebo_migros_paket));
      setOsCnfYs(pg(r.os_cnf_ys, r.os_cnf_ys_paket)); setOsCnfYsIndirim(paraYaz(r.os_cnf_ys_indirim));
      setOsCnfTrendyol(pg(r.os_cnf_trendyol, r.os_cnf_trendyol_paket)); setOsCnfTrendyolIndirim(paraYaz(r.os_cnf_trendyol_indirim));
      setOsCnfMigrosYemek(pg(r.os_cnf_migros_yemek, r.os_cnf_migros_yemek_paket));
      setKoKeboYs(pg(r.ko_kebo_ys, r.ko_kebo_ys_paket)); setKoKeboYsIndirim(paraYaz(r.ko_kebo_ys_indirim));
      setKoKeboTrendyol(pg(r.ko_kebo_trendyol, r.ko_kebo_trendyol_paket)); setKoKeboTrendyolIndirim(paraYaz(r.ko_kebo_trendyol_indirim));
      setKoKeboMigrosYemek(pg(r.ko_kebo_migros_yemek, r.ko_kebo_migros_yemek_paket));
      setKoKeboAlo(pg(r.ko_kebo_alo, r.ko_kebo_alo_paket));
      setKoCnfYs(pg(r.ko_cnf_ys, r.ko_cnf_ys_paket)); setKoCnfYsIndirim(paraYaz(r.ko_cnf_ys_indirim));
      setKoCnfTrendyol(pg(r.ko_cnf_trendyol, r.ko_cnf_trendyol_paket)); setKoCnfTrendyolIndirim(paraYaz(r.ko_cnf_trendyol_indirim));
      setKoCnfMigrosYemek(pg(r.ko_cnf_migros_yemek, r.ko_cnf_migros_yemek_paket));
      setKoCnfAlo(pg(r.ko_cnf_alo, r.ko_cnf_alo_paket));
    } else {
      // Eski (tek platform) raporlar: Kebo alanlarına aktarılır, CNF tek kalem olduğu için
      // CNF · Yemeksepeti satırına yazılır. Kaydedince yeni yapıya dönüşür.
      const bosPG = ():PlatformGiris=>({tutar:"",paket:""});
      setOsKeboYs(pg(r.os_yemeksepeti + (r.os_getir||0), 0)); setOsKeboYsIndirim("");
      setOsKeboTrendyol(pg(r.os_trendyol, 0)); setOsKeboTrendyolIndirim("");
      setOsKeboMigros(pg(r.os_migros, 0));
      setOsCnfYs(pg(r.os_chicknfride, 0)); setOsCnfYsIndirim(""); setOsCnfTrendyol(bosPG()); setOsCnfTrendyolIndirim(""); setOsCnfMigrosYemek(bosPG());
      setKoKeboYs(pg(r.ko_yemeksepeti + (r.ko_getir||0), 0)); setKoKeboYsIndirim("");
      setKoKeboTrendyol(pg(r.ko_trendyol, 0)); setKoKeboTrendyolIndirim("");
      setKoKeboMigrosYemek(pg(r.ko_migros, 0)); setKoKeboAlo(pg(r.ko_alo_paket, 0));
      setKoCnfYs(pg(r.ko_chicknfride, 0)); setKoCnfYsIndirim(""); setKoCnfTrendyol(bosPG()); setKoCnfTrendyolIndirim(""); setKoCnfMigrosYemek(bosPG()); setKoCnfAlo(bosPG());
    }
    setKasaNakit(paraYaz(r.kasa_nakit)); setKasaPos(paraYaz(r.kasa_pos)); setKasaEdenred(paraYaz(r.kasa_edenred)); setKasaMetropol(paraYaz(r.kasa_metropol));
    setKuryeler(r.kurye_raporlari?.length
      ? r.kurye_raporlari.map((k,i)=>({...k, id:k.id ?? Date.now()+i, isim:k.isim||"",
          nakit:paraYaz(tv(k.nakit)), pos:paraYaz(tv(k.pos)), paketSayisi:String(k.paketSayisi??""),
          uzakPaket:k.uzakPaket||"", paket9km:k.paket9km||"", tip:k.tip || (r.tarih < ROADRUNNER_GECIS_GUNU ? "kendi" : "havuz")}))
      : kuryeYapisiHesapla(r.tarih));
    const ayrik = giderMetniniAyristir(r.gider_aciklama);
    setNotlar(ayrik.not);
    setGiderler(ayrik.giderler.length
      ? ayrik.giderler.map((g,i)=>{
          if (g.tip === "firma") {
            const firma = cariListesi.find(c => c.unvan === g.aciklama);
            return { id: Date.now()+i, aciklama: g.aciklama, tutar: g.tutar, tip: "firma" as const, firmaId: firma?.id, firmaUnvan: g.aciklama };
          }
          if (g.tip === "personel") {
            return { id: Date.now()+i, aciklama: g.detay, tutar: g.tutar, tip: "personel" as const,
              personelIsim: g.personelIsim, personelId: personelIdBul(g.personelIsim) };
          }
          return { id: Date.now()+i, aciklama: g.aciklama, tutar: g.tutar, tip: "normal" as const };
        })
      : [{id:Date.now(),aciklama:"",tutar:"",tip:"normal" as const}]);
    const iadeListesi = satirMetniniAyristir(r.iade_aciklama);
    setIadeler(iadeListesi.length
      ? iadeListesi.map((g,i)=>({id:Date.now()+i+1000, aciklama:g.aciklama, tutar:g.tutar}))
      : [{id:Date.now()+1000,aciklama:"",tutar:""}]);
    // Rapora bağlı kesintiler ayrı tabloda; düzenlemede kaybolmasınlar diye yüklenir.
    setKesintiSatirlari([]);
    const { data: kesintiData } = await supabase.from("kesintiler").select("personel_id, personel_isim, tutar, aciklama").eq("rapor_id", r.id);
    if (kesintiData?.length) {
      setKesintiSatirlari(kesintiData.map((k, i) => ({
        id: Date.now()+2000+i, personelId: k.personel_id || undefined, personelIsim: k.personel_isim || "",
        tutar: paraYaz(Number(k.tutar)), aciklama: k.aciklama || "",
      })));
    }
  };

  // ── Live calculations ──
  // BRÜT CİRO = Online + Kasa + Gider (+ Kapıda, 13.08.2026'dan itibaren; öncesinde kapıda parası kasadaydı)
  // NET CİRO  = Brüt − Gider − İade − Platform indirimleri
  const ch = useMemo(()=>{
    const pk = (p:PlatformGiris)=>parseInt(p.paket)||0;
    // ── Online ──
    const tOnlineKebo = tv(osKeboYs.tutar)+tv(osKeboTrendyol.tutar)+tv(osKeboMigros.tutar);
    const tOnlineCnf  = tv(osCnfYs.tutar)+tv(osCnfTrendyol.tutar)+tv(osCnfMigrosYemek.tutar);
    const tOnline = tOnlineKebo + tOnlineCnf;
    const tOnlinePaket = pk(osKeboYs)+pk(osKeboTrendyol)+pk(osKeboMigros)+pk(osCnfYs)+pk(osCnfTrendyol)+pk(osCnfMigrosYemek);
    // ── Kapıda Ödeme ──
    const tKapidaKebo = tv(koKeboYs.tutar)+tv(koKeboTrendyol.tutar)+tv(koKeboMigrosYemek.tutar)+tv(koKeboAlo.tutar);
    const tKapidaCnf  = tv(koCnfYs.tutar)+tv(koCnfTrendyol.tutar)+tv(koCnfMigrosYemek.tutar)+tv(koCnfAlo.tutar);
    const tKapida = tKapidaKebo + tKapidaCnf;
    const tKapidaPaket = pk(koKeboYs)+pk(koKeboTrendyol)+pk(koKeboMigrosYemek)+pk(koKeboAlo)+pk(koCnfYs)+pk(koCnfTrendyol)+pk(koCnfMigrosYemek)+pk(koCnfAlo);
    const kapidaKasada = kapidaKasadaMi(tarih);
    // ── İndirim Analizi (Yemeksepeti + Trendyol, Kebo + CNF, online + kapıda) ──
    const tIndirimYS = tv(osKeboYsIndirim)+tv(osCnfYsIndirim)+tv(koKeboYsIndirim)+tv(koCnfYsIndirim);
    const tIndirimTrendyol = tv(osKeboTrendyolIndirim)+tv(osCnfTrendyolIndirim)+tv(koKeboTrendyolIndirim)+tv(koCnfTrendyolIndirim);
    const tIndirim = tIndirimYS + tIndirimTrendyol;
    const paketCiroToplami = tOnline + tKapida; // platform tutarları indirim öncesi (brüt)
    const indirimOrani = paketCiroToplami>0 ? (tIndirim/paketCiroToplami)*100 : 0;
    const indirimUyari = indirimOrani > 15;
    // ── Kasa ──
    const tKasa=tv(kasaNakit)+tv(kasaPos)+tv(kasaEdenred)+tv(kasaMetropol);
    const tGider=giderler.reduce((a,g)=>a+tv(g.tutar),0);
    const tIade=iadeler.reduce((a,i)=>a+tv(i.tutar),0);
    const brutCiro = tOnline + (kapidaKasada ? 0 : tKapida) + tKasa + tGider;
    const netCiro  = brutCiro - tGider - tIade - tIndirim;
    // ── Kuryeler: SADECE tip==="sabit" (Roadrunner, 14.08.2026+) olan satırlarda min. 30 paket garantisi var.
    const kuryelerHesap = kuryeler.map(k=>{
      const normalPaket = parseInt(k.paketSayisi)||0;
      const uzakPaket = parseInt(k.uzakPaket||"")||0;
      const paket9km = parseInt(k.paket9km||"")||0;
      const gercek = normalPaket + uzakPaket + paket9km;
      const uygulanan = k.tip==="sabit" ? Math.max(gercek, KURYE_GARANTI_PAKET) : gercek;
      return { ...k, normalPaket, uzakPaket, paket9km, gercekPaket:gercek, uygulananPaket:uygulanan, garantiUygulandi: k.tip==="sabit" && gercek<KURYE_GARANTI_PAKET };
    });
    const tKuryePaket=kuryelerHesap.reduce((a,k)=>a+k.uygulananPaket,0);
    const tKuryeGercekPaket=kuryelerHesap.reduce((a,k)=>a+k.gercekPaket,0);
    const tKuryeUzakPaket=kuryelerHesap.reduce((a,k)=>a+k.uzakPaket,0);
    const tKuryePaket9km=kuryelerHesap.reduce((a,k)=>a+k.paket9km,0);
    const tKuryeTahsilat=kuryeler.reduce((a,k)=>a+tv(k.nakit)+tv(k.pos),0);
    // Sepet ortalaması gerçek teslim edilen pakete göre (garanti farkı ortalamayı düşürmesin)
    const paketOrt = paketCiroToplami>0 && tKuryeGercekPaket>0 ? paketCiroToplami/tKuryeGercekPaket : 0;
    const kuryeFark=Math.round((tKapida-tKuryeTahsilat)*100)/100;
    return {tOnline,tOnlineKebo,tOnlineCnf,tOnlinePaket,tKapida,tKapidaKebo,tKapidaCnf,tKapidaPaket,kapidaKasada,
      tIndirimYS,tIndirimTrendyol,tIndirim,indirimOrani,indirimUyari,
      tKasa,brutCiro,tGider,tIade,netCiro,kuryelerHesap,tKuryePaket,tKuryeGercekPaket,
      tKuryeUzakPaket,tKuryePaket9km,tKuryeTahsilat,paketOrt,kuryeFark};
  },[tarih,osKeboYs,osKeboYsIndirim,osKeboTrendyol,osKeboTrendyolIndirim,osKeboMigros,
     osCnfYs,osCnfYsIndirim,osCnfTrendyol,osCnfTrendyolIndirim,osCnfMigrosYemek,
     koKeboYs,koKeboYsIndirim,koKeboTrendyol,koKeboTrendyolIndirim,koKeboMigrosYemek,koKeboAlo,
     koCnfYs,koCnfYsIndirim,koCnfTrendyol,koCnfTrendyolIndirim,koCnfMigrosYemek,koCnfAlo,
     kasaNakit,kasaPos,kasaEdenred,kasaMetropol,giderler,iadeler,kuryeler]);

  // ── Table totals ──
  const tabloToplam = useMemo(()=>{
    const o = donemOzeti(raporlar);
    return {brut:o.brut, net:o.net, paket:o.paket, giderIade:o.gider+o.iade, paketOrt:o.paket>0?o.platformCiro/o.paket:0};
  },[raporlar]);

  // ── Handlers ──
  const giderEkle = (tip: "normal"|"firma"|"personel" = "normal") =>
    setGiderler([...giderler,{id:Date.now(),aciklama:tip==="personel"?"Personel tüketim (yemek/içecek)":"",tutar:"",tip}]);
  const giderSil = (id:number)=>setGiderler(giderler.filter(g=>g.id!==id));
  const giderDegistir = (id:number, alanlar: Partial<SatirRaporu>) =>
    setGiderler(onceki => onceki.map(g=>g.id===id?{...g,...alanlar, ...(alanlar.tutar!==undefined?{tutar:paraGirdisi(alanlar.tutar)}:{})}:g));

  const iadeEkle = ()=>setIadeler([...iadeler,{id:Date.now(),aciklama:"",tutar:""}]);
  const iadeSil = (id:number)=>setIadeler(iadeler.filter(i=>i.id!==id));
  const iadeDegistir = (id:number,field:"aciklama"|"tutar",val:string)=>
    setIadeler(iadeler.map(i=>i.id===id?{...i,[field]:field==="tutar"?paraGirdisi(val):val}:i));

  const kuryeEkle = ()=>setKuryeler([...kuryeler,{id:Date.now(),isim:"",nakit:"",pos:"",paketSayisi:"",uzakPaket:"",paket9km:"",
    tip: tarih && tarih < ROADRUNNER_GECIS_GUNU ? "kendi" : "havuz"}]);
  const kuryeSil = (id:number)=>setKuryeler(kuryeler.filter(k=>k.id!==id));
  const kuryeDegistir = (id:number,field:keyof KuryeRaporu,val:string)=>{
    const v=(field==="nakit"||field==="pos")?paraGirdisi(val):val;
    setKuryeler(kuryeler.map(k=>k.id===id?{...k,[field]:v}:k));
  };
  // ── Fişten Doldur: kağıt raporu fotoğraflayıp/yükleyip AI'ye okutma ──
  const nToStr = (n:number|undefined) => (n && n>0) ? paraYaz(n) : "";
  const handleFisTara = async (file: File) => {
    if (!file) return;
    setTaramaYukleniyor(true); setTaramaHata(""); setTaramaBelirsizAlanlar([]);
    try {
      // Fotoğraf yüklemeden önce küçültülür (Vercel ~4,5 MB istek sınırı).
      const dosya = await yuklemeIcinHazirla(file);
      const response = await fetch("/api/rapor-tara", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: dosya.base64, mediaType: dosya.mediaType }),
      });
      const { veri: hamVeri, hata } = await jsonCevap(response);
      if (hata) { setTaramaHata(hata); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const veri = hamVeri as any;
      // Tarih (sadece yeni rapor eklerken, düzenleme modunda tarihi ezme)
      const hedefTarih: string = (veri.tarih && !selectedRapor) ? veri.tarih : tarih;
      if (veri.tarih && !selectedRapor) handleTarihChange(veri.tarih);
      const pg = (o:{tutar?:number;paket?:number}|undefined): PlatformGiris => ({ tutar: nToStr(o?.tutar), paket: o?.paket ? String(o.paket) : "" });
      const ok = veri.online?.kebo || {}; const oc = veri.online?.cnf || {};
      setOsKeboYs(pg(ok.ys)); setOsKeboYsIndirim(nToStr(ok.ys?.indirim));
      setOsKeboTrendyol(pg(ok.trendyol)); setOsKeboTrendyolIndirim(nToStr(ok.trendyol?.indirim));
      setOsKeboMigros(pg(ok.migros));
      setOsCnfYs(pg(oc.ys)); setOsCnfYsIndirim(nToStr(oc.ys?.indirim));
      setOsCnfTrendyol(pg(oc.trendyol)); setOsCnfTrendyolIndirim(nToStr(oc.trendyol?.indirim));
      setOsCnfMigrosYemek(pg(oc.migrosYemek));
      const kk = veri.kapida?.kebo || {}; const kc = veri.kapida?.cnf || {};
      setKoKeboYs(pg(kk.ys)); setKoKeboYsIndirim(nToStr(kk.ys?.indirim));
      setKoKeboTrendyol(pg(kk.trendyol)); setKoKeboTrendyolIndirim(nToStr(kk.trendyol?.indirim));
      setKoKeboMigrosYemek(pg(kk.migrosYemek)); setKoKeboAlo(pg(kk.alo));
      setKoCnfYs(pg(kc.ys)); setKoCnfYsIndirim(nToStr(kc.ys?.indirim));
      setKoCnfTrendyol(pg(kc.trendyol)); setKoCnfTrendyolIndirim(nToStr(kc.trendyol?.indirim));
      setKoCnfMigrosYemek(pg(kc.migrosYemek)); setKoCnfAlo(pg(kc.alo));
      if (veri.kasa) {
        setKasaNakit(nToStr(veri.kasa.nakit)); setKasaPos(nToStr(veri.kasa.pos));
        setKasaEdenred(nToStr(veri.kasa.edenred)); setKasaMetropol(nToStr(veri.kasa.metropol));
      }
      type TaramaSatiri = { tutar?: number; aciklama?: string; personel?: string; isim?: string; nakit?: number; pos?: number; paket?: number };
      const yeniGiderler: SatirRaporu[] = [];
      (veri.giderler||[]).forEach((g:TaramaSatiri,i:number) => {
        if (g.tutar || g.aciklama) yeniGiderler.push({ id: Date.now()+i, aciklama: g.aciklama||"", tutar: nToStr(g.tutar), tip: "normal" });
      });
      (veri.avanslar||[]).forEach((a:TaramaSatiri,i:number) => {
        if (a.tutar || a.personel) yeniGiderler.push({ id: Date.now()+100+i, aciklama: a.aciklama||"", tutar: nToStr(a.tutar), tip: "personel",
          personelIsim: a.personel||"", personelId: personelIdBul(a.personel) });
      });
      if (yeniGiderler.length) setGiderler(yeniGiderler);
      const yeniKesintiler = (veri.kesintiler||[]).filter((k:TaramaSatiri)=>k.tutar||k.personel)
        .map((k:TaramaSatiri,i:number)=>({ id: Date.now()+200+i, personelId: personelIdBul(k.personel), personelIsim: k.personel||"", tutar: nToStr(k.tutar), aciklama: k.aciklama||"" }));
      if (yeniKesintiler.length) setKesintiSatirlari(yeniKesintiler);
      const yeniIadeler = (veri.iadeler||[]).filter((i:TaramaSatiri)=>i.tutar||i.aciklama)
        .map((i:TaramaSatiri,idx:number)=>({ id: Date.now()+300+idx, aciklama: i.aciklama||"", tutar: nToStr(i.tutar) }));
      if (yeniIadeler.length) setIadeler(yeniIadeler);
      const sabitler: TaramaSatiri[] = (veri.kuryeSabit||[]);
      const havuzlar: TaramaSatiri[] = (veri.kuryeHavuz||[]).filter((k:TaramaSatiri)=>k.isim||k.paket||k.nakit||k.pos);
      const satir = (k: TaramaSatiri|undefined, id: number, tip: KuryeRaporu["tip"], varsayilanIsim: string): KuryeRaporu => ({
        id, isim: k?.isim || varsayilanIsim, nakit: nToStr(k?.nakit), pos: nToStr(k?.pos),
        paketSayisi: k?.paket ? String(k.paket) : "", uzakPaket:"", paket9km:"", tip });
      if (hedefTarih && hedefTarih < ROADRUNNER_GECIS_GUNU) {
        // Roadrunner öncesi: fişteki tüm kuryeler kendi personel kuryemiz.
        const hepsi = [...sabitler.filter(k=>k.isim||k.paket||k.nakit||k.pos), ...havuzlar];
        setKuryeler(hepsi.length ? hepsi.map((k,i)=>satir(k, Date.now()+400+i, "kendi", "")) : kuryeYapisiHesapla(hedefTarih));
      } else {
        setKuryeler([
          satir(sabitler[0], 1, "sabit", "Kurye 1"),
          satir(sabitler[1], 2, "sabit", "Kurye 2"),
          ...havuzlar.map((k,i)=>satir(k, Date.now()+400+i, "havuz", "Havuz Kurye")),
        ]);
      }
      if (veri.notlar) setNotlar(veri.notlar);
      setTaramaBelirsizAlanlar(veri.belirsiz_alanlar || []);
    } catch (err) {
      setTaramaHata(err instanceof Error ? err.message : "Bağlantı hatası, tekrar deneyin.");
    } finally {
      setTaramaYukleniyor(false);
      if (dosyaInputRef.current) dosyaInputRef.current.value = "";
    }
  };

  // ── AI Rapor Analizi (proje içi /api/chat endpoint'i üzerinden) ──
  const handleAiSoru = async (soru?: string) => {
    const soruFinal = (soru ?? aiSoru).trim();
    if (!soruFinal || aiYukleniyor) return;
    if (soru !== undefined) setAiSoru(soru);
    setAiYukleniyor(true);
    setAiCevap("");
    try {
      // Raporları özetle (token tasarrufu)
      const ozet = raporlar.slice(0, 31).map(r => {
        const o = raporOzeti(r);
        return `${fmtTarih(r.tarih)}: Brüt=₺${fmt(o.brut)} Net=₺${fmt(o.net)} Online=₺${fmt(o.online)} Kapıda=₺${fmt(o.kapida)} Kasa=₺${fmt(o.kasa)} Gider=₺${fmt(o.gider)} İade=₺${fmt(o.iade)} İndirim=₺${fmt(o.indirim)} Paket=${o.paket}`;
      }).join("\n");
      const d = donemOzeti(raporlar);

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_tokens: 1024,
          system: `Sen KEBO ERP finansal analiz asistanısın. Restoran/yemek dağıtım işletmesinin günlük kasa raporlarını analiz ediyorsun.

ÖNEMLİ KAVRAMLAR:
- Platform tutarları indirim öncesidir.
- Brüt Ciro = Online + Kasa (nakit/POS/yemek kartı) + Gider (gider kasadan ödendiği için geri eklenir)
  + Kapıda ödeme (sadece 13.08.2026 ve sonrası; öncesinde kapıda parası kasa sayımının içindeydi).
- Net Ciro = Brüt − Gider − İade − Platform indirimleri.

CEVAP STİLİ: Kısa, net, Türkçe. Sayıları ₺ ile göster. Madde madde yazabilirsin.`,
          messages: [{
            role: "user",
            content: `Dönem: ${AYLAR.find(m=>m.value===secilenAy)?.label} ${secilenYil} (${raporlar.length} gün)
Toplam Brüt: ₺${fmt(d.brut)}
Toplam Net: ₺${fmt(d.net)}
Toplam Gider: ₺${fmt(d.gider)} · İade: ₺${fmt(d.iade)} · İndirim: ₺${fmt(d.indirim)}
Toplam Paket: ${d.paket}

Günlük Detay:
${ozet}

Soru: ${soruFinal}`
          }]
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAiCevap(`AI hatası (${response.status}): ${data?.error || "Bilinmeyen hata"}`);
        return;
      }
      const cevap = data.content?.map((c: {text?: string}) => c.text || "").join("") || data.error || "Cevap alınamadı.";
      setAiCevap(typeof cevap === "string" ? cevap : JSON.stringify(cevap));
    } catch (err) {
      setAiCevap(`Bağlantı hatası: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAiYukleniyor(false);
    }
  };

  // ── Save ──
  const handleRaporKaydet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (duplikaTarihHata) { alert(`${fmtTarih(tarih)} tarihli rapor zaten mevcut!`); return; }
    if (!selectedRapor && tarih > bugun()) { alert("İleri tarihli rapor girilemez."); return; }
    if (!selectedRapor && !adminOnayliGecis && tarihHataVarMi) { alert("Rapor tarihi sırası hatalı."); return; }
    if (ch.brutCiro<=0) { alert("Lütfen en az bir ciro kalemi girin!"); return; }
    const eksikPersonel = giderler.some(g=>g.tip==="personel" && tv(g.tutar)>0 && !g.personelIsim)
      || kesintiSatirlari.some(k=>tv(k.tutar)>0 && !k.personelIsim);
    if (eksikPersonel) { alert("Personel avansı / kesintisi satırlarında personel seçilmemiş."); return; }
    const eksikFirma = giderler.some(g=>g.tip==="firma" && tv(g.tutar)>0 && !g.firmaId);
    if (eksikFirma) { alert("Firma ödemesi satırında firma seçilmemiş."); return; }
    setSaving(true);
    try {
      const ekleyen = yetki.kullaniciAdi || "Bilinmiyor";
      const ilkGiren = (s: string) => (s || "").split(" | Düz:")[0];

      const giderAciklamaFinal = giderMetniOlustur(giderler, notlar);
      const birlesikIade = iadeler.filter(i=>i.tutar||i.aciklama).map(i=>`${temizMetin(i.aciklama)||"Belirtilmemiş"}: ₺${i.tutar||"0"}`).join(" | ");
      const temizKuryeler = kuryeler.map(k=>({...k,nakit:tv(k.nakit).toString(),pos:tv(k.pos).toString()}));
      const pk = (p:PlatformGiris)=>parseInt(p.paket)||0;

      const raporData = {
        tarih,
        // Eski (tek platform) alanlar: eski ekranlar ve dışa aktarımlar bozulmasın diye platform
        // başına Kebo + Chick'N Fride toplamıyla doldurulur. CNF zaten bu toplamların içinde
        // olduğu için os_chicknfride / ko_chicknfride 0 yazılır (eskiden iki kez sayılıyordu).
        os_yemeksepeti:tv(osKeboYs.tutar)+tv(osCnfYs.tutar), os_getir:0,
        os_trendyol:tv(osKeboTrendyol.tutar)+tv(osCnfTrendyol.tutar),
        os_migros:tv(osKeboMigros.tutar)+tv(osCnfMigrosYemek.tutar), os_chicknfride:0,
        ko_yemeksepeti:tv(koKeboYs.tutar)+tv(koCnfYs.tutar), ko_getir:0,
        ko_trendyol:tv(koKeboTrendyol.tutar)+tv(koCnfTrendyol.tutar),
        ko_migros:tv(koKeboMigrosYemek.tutar)+tv(koCnfMigrosYemek.tutar),
        ko_alo_paket:tv(koKeboAlo.tutar)+tv(koCnfAlo.tutar), ko_chicknfride:0,
        // Online — Kebo
        os_kebo_ys:tv(osKeboYs.tutar), os_kebo_ys_paket:pk(osKeboYs), os_kebo_ys_indirim:tv(osKeboYsIndirim),
        os_kebo_trendyol:tv(osKeboTrendyol.tutar), os_kebo_trendyol_paket:pk(osKeboTrendyol), os_kebo_trendyol_indirim:tv(osKeboTrendyolIndirim),
        os_kebo_migros:tv(osKeboMigros.tutar), os_kebo_migros_paket:pk(osKeboMigros),
        // Online — Chick'N Fride
        os_cnf_ys:tv(osCnfYs.tutar), os_cnf_ys_paket:pk(osCnfYs), os_cnf_ys_indirim:tv(osCnfYsIndirim),
        os_cnf_trendyol:tv(osCnfTrendyol.tutar), os_cnf_trendyol_paket:pk(osCnfTrendyol), os_cnf_trendyol_indirim:tv(osCnfTrendyolIndirim),
        os_cnf_migros_yemek:tv(osCnfMigrosYemek.tutar), os_cnf_migros_yemek_paket:pk(osCnfMigrosYemek),
        // Kapıda Ödeme — Kebo
        ko_kebo_ys:tv(koKeboYs.tutar), ko_kebo_ys_paket:pk(koKeboYs), ko_kebo_ys_indirim:tv(koKeboYsIndirim),
        ko_kebo_trendyol:tv(koKeboTrendyol.tutar), ko_kebo_trendyol_paket:pk(koKeboTrendyol), ko_kebo_trendyol_indirim:tv(koKeboTrendyolIndirim),
        ko_kebo_migros_yemek:tv(koKeboMigrosYemek.tutar), ko_kebo_migros_yemek_paket:pk(koKeboMigrosYemek),
        ko_kebo_alo:tv(koKeboAlo.tutar), ko_kebo_alo_paket:pk(koKeboAlo),
        // Kapıda Ödeme — Chick'N Fride
        ko_cnf_ys:tv(koCnfYs.tutar), ko_cnf_ys_paket:pk(koCnfYs), ko_cnf_ys_indirim:tv(koCnfYsIndirim),
        ko_cnf_trendyol:tv(koCnfTrendyol.tutar), ko_cnf_trendyol_paket:pk(koCnfTrendyol), ko_cnf_trendyol_indirim:tv(koCnfTrendyolIndirim),
        ko_cnf_migros_yemek:tv(koCnfMigrosYemek.tutar), ko_cnf_migros_yemek_paket:pk(koCnfMigrosYemek),
        ko_cnf_alo:tv(koCnfAlo.tutar), ko_cnf_alo_paket:pk(koCnfAlo),
        kasa_nakit:tv(kasaNakit), kasa_pos:tv(kasaPos), kasa_edenred:tv(kasaEdenred), kasa_metropol:tv(kasaMetropol),
        gunluk_gider:ch.tGider, gider_aciklama:giderAciklamaFinal,
        iade_tutar:ch.tIade, iade_aciklama:birlesikIade,
        kurye_raporlari:temizKuryeler,
        toplam_ciro:ch.brutCiro,
        ekleyen_kullanici:selectedRapor?`${ilkGiren(selectedRapor.ekleyen_kullanici)} | Düz:${ekleyen}`:ekleyen,
        // Rapordan doğan kayıtlar — veritabanında raporla birlikte, tek işlemde yazılır.
        _ekler: {
          avanslar: giderler.filter(g=>g.tip==="personel" && g.personelIsim && tv(g.tutar)>0).map(g=>({
            personel_id: g.personelId || personelIdBul(g.personelIsim) || "", personel_isim: g.personelIsim,
            tutar: tv(g.tutar), aciklama: g.aciklama || `Personel tüketim — ${fmtTarih(tarih)}`,
          })),
          kesintiler: kesintiSatirlari.filter(k=>k.personelIsim && tv(k.tutar)>0).map(k=>({
            personel_id: k.personelId || personelIdBul(k.personelIsim) || "", personel_isim: k.personelIsim,
            tutar: tv(k.tutar), aciklama: k.aciklama || `Günlük rapor — ${fmtTarih(tarih)}`,
          })),
          firma_odemeleri: giderler.filter(g=>g.tip==="firma" && g.firmaId && tv(g.tutar)>0).map(g=>({
            cari_id: g.firmaId, cari_unvan: g.firmaUnvan || g.aciklama, tutar: tv(g.tutar),
            aciklama: `Günlük rapor gideri — ${fmtTarih(tarih)}`,
          })),
        },
      };
      // Müdür mevcut bir raporu düzenliyorsa: rapor doğrudan güncellenmez, Tam Yetkili onayına gider.
      if (selectedRapor && !isAdmin) {
        if (!isOnayliDuzenleyici) { alert("Bu raporu düzenleme yetkiniz yok."); return; }
        const { error: talepError } = await supabase.from("rapor_degisiklik_talepleri").insert([{
          rapor_id: selectedRapor.id,
          rapor_tarihi: selectedRapor.tarih,
          talep_eden: userEmail,
          eski_veri: selectedRapor,
          yeni_veri: raporData,
          durum: "bekliyor",
        }]);
        if (talepError) { alert("Talep gönderilirken hata: "+talepError.message); return; }
        alert(`${fmtTarih(selectedRapor.tarih)} tarihli rapor için değişiklik talebiniz onaya gönderildi. Tam yetkili bir kullanıcı onayladığında rapor güncellenecek.`);
        formuTemizle(); setFormAcik(false); veriCek();
        return;
      }
      const { error } = await supabase.rpc("rapor_kaydet", { p_veri: raporData, p_rapor_id: selectedRapor?.id ?? null });
      if (error) {
        if (error.code === "23505") { alert(`${fmtTarih(tarih)} tarihli rapor zaten mevcut.`); setDuplikaTarihHata(true); return; }
        alert("Kaydedilemedi: "+error.message); return;
      }
      formuTemizle(); setFormAcik(false); veriCek();
    } catch(err) { alert("Hata: "+(err instanceof Error ? err.message : String(err))); }
    finally { setSaving(false); }
  };

  // ── Derived ──
  const beklenenTarih = siradakiTarih();
  const formKilitli = !tarih || (tarihHataVarMi && !adminOnayliGecis) || duplikaTarihHata;
  const isReadOnly = !!(selectedRapor && !isEditMode);

  const platformOzetSatirlar = [
    { label: "Kebo · Yemeksepeti",  online: tv(osKeboYs.tutar), kapida: tv(koKeboYs.tutar), color: "#FF6B35" },
    { label: "Kebo · Trendyol",     online: tv(osKeboTrendyol.tutar), kapida: tv(koKeboTrendyol.tutar), color: "#F97316" },
    { label: "Kebo · Migros",       online: tv(osKeboMigros.tutar), kapida: tv(koKeboMigrosYemek.tutar), color: "#10B981" },
    { label: "Kebo · Alo Paket",    online: 0, kapida: tv(koKeboAlo.tutar), color: "#3B82F6" },
    { label: "CNF · Yemeksepeti",   online: tv(osCnfYs.tutar), kapida: tv(koCnfYs.tutar), color: "#FDBA74" },
    { label: "CNF · Trendyol",      online: tv(osCnfTrendyol.tutar), kapida: tv(koCnfTrendyol.tutar), color: "#FB923C" },
    { label: "CNF · Migros Yemek",  online: tv(osCnfMigrosYemek.tutar), kapida: tv(koCnfMigrosYemek.tutar), color: "#EF4444" },
    { label: "CNF · Alo Paket",     online: 0, kapida: tv(koCnfAlo.tutar), color: "#F87171" },
  ].filter(p => p.online + p.kapida > 0);

  // ─── FORM ───────────────────────────────────────────────────────────────────

  const renderForm = () => (
    <form onSubmit={handleRaporKaydet} className="space-y-3">

      {/* META BAR */}
      {selectedRapor && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-3 text-[11px] text-gray-600">
            <span className="flex items-center gap-1.5"><User size={11} className="text-blue-600"/>{selectedRapor.ekleyen_kullanici}</span>
            {selectedRapor.created_at && <span className="flex items-center gap-1.5"><Clock size={11} className="text-blue-600"/>{new Date(selectedRapor.created_at).toLocaleString("tr-TR")}</span>}
          </div>
          {!isEditMode && (isAdmin || isOnayliDuzenleyici) && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={()=>setIsEditMode(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 bg-amber-400/10 border border-amber-400/20 px-3 py-1.5 rounded-lg hover:bg-amber-400/15 transition-colors">
                <Edit3 size={12}/> Düzenle
              </button>
              {isAdmin && (
              <button type="button" onClick={()=>selectedRapor && handleRaporSil(selectedRapor)}
                className="flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-400/10 border border-red-400/20 px-3 py-1.5 rounded-lg hover:bg-red-400/15 transition-colors">
                <Trash2 size={12}/> Sil
              </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* FİŞTEN DOLDUR (AI Tarama) */}
      {!isReadOnly && (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center shrink-0">
              {taramaYukleniyor ? <Loader2 size={14} className="text-indigo-600 animate-spin"/> : <Camera size={14} className="text-indigo-600"/>}
            </div>
            <div>
              <p className="text-xs font-bold text-indigo-700">Fişten Doldur</p>
              <p className="text-[10px] text-gray-500">Kağıt raporun fotoğrafını yükle, AI okuyup formu doldursun</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input ref={dosyaInputRef} type="file" accept="image/*,application/pdf" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFisTara(f); }}/>
            <button type="button" disabled={taramaYukleniyor} onClick={() => dosyaInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 px-3.5 py-2 rounded-xl transition-colors">
              {taramaYukleniyor ? "Okunuyor..." : <><Camera size={13}/> Tara</>}
            </button>
          </div>
        </div>
      )}
      {taramaHata && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-2.5 flex items-center gap-2">
          <AlertTriangle size={13} className="text-red-600 shrink-0"/>
          <p className="text-xs text-red-700">{taramaHata}</p>
        </div>
      )}
      {taramaBelirsizAlanlar.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5">
          <p className="text-xs font-bold text-amber-600 flex items-center gap-1.5 mb-1"><AlertTriangle size={12}/> AI bazı alanlardan emin olamadı — lütfen kontrol et:</p>
          <p className="text-[11px] text-amber-200/80">{taramaBelirsizAlanlar.join(", ")}</p>
        </div>
      )}
      {/* TARİH + CANLI METRİKLER */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 items-center">
        <div className="sm:col-span-1">
          <label className="block text-[12px] text-amber-700 font-bold tracking-wide mb-1.5">Rapor Tarihi</label>
          <div className="flex flex-col gap-1">
            <input type="date" value={tarih} disabled={isReadOnly}
              onChange={e=>handleTarihChange(e.target.value)}
              min={!isAdmin&&!selectedRapor&&beklenenTarih?beklenenTarih:undefined}
              max={!isAdmin&&!selectedRapor&&beklenenTarih?beklenenTarih:undefined}
              style={{colorScheme:"light"}}
              className={`bg-[#f7f8fa] text-[#1a1f2e] font-bold text-center h-11 text-[15px] rounded-xl px-3 w-full outline-none focus:ring-2 focus:ring-amber-500/20 transition-all border-2 ${
                duplikaTarihHata ? "border-orange-500 text-orange-600"
                : tarihHataVarMi&&!adminOnayliGecis ? "border-red-500 text-red-600"
                : "border-[#e2e5eb] focus:border-amber-500/60"
              }`} required/>
            {duplikaTarihHata && <p className="text-[11px] font-semibold text-orange-600 flex items-center gap-1"><AlertTriangle size={11}/> Bu tarih mevcut</p>}
            {enSonRaporTarihi && <p className="text-[11px] text-gray-500 font-medium">Son rapor: <span className="text-gray-700 font-bold">{fmtTarih(enSonRaporTarihi)}</span></p>}
          </div>
        </div>
        {[
          {label:"Brüt Ciro", value:`₺${fmt(ch.brutCiro)}`, color:"text-blue-600", border:"border-blue-500/10 bg-blue-500/5"},
          {label:"Net Ciro",  value:`₺${fmt(ch.netCiro)}`,  color:"text-emerald-600", border:"border-emerald-500/10 bg-emerald-500/5"},
          {label:"Paket",     value:`${fmt(ch.tKuryeGercekPaket)}`, color:"text-amber-600", border:"border-amber-500/10 bg-amber-500/5"},
          {label:"Ort. Sepet",value:`₺${fmt(ch.paketOrt)}`, color:"text-purple-600", border:"border-purple-500/10 bg-purple-500/5"},
        ].map(c=>(
          <div key={c.label} className={`rounded-xl border ${c.border} px-4 py-3 transition-transform hover:-translate-y-0.5 hover:shadow-sm`}>
            <p className="text-[12px] text-gray-500 font-semibold">{c.label}</p>
            <p className={`text-xl font-black tracking-tight ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Admin skip onayı */}
      {tarihHataVarMi && isAdmin && !adminOnayliGecis && !isReadOnly && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-100/60 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <p className="text-xs text-amber-600 flex items-center gap-2">
            <AlertTriangle size={12}/>
            <strong className="text-[#1a1f2e]">{beklenenTarih?fmtTarih(beklenenTarih):""}</strong> eklenmeden devam edilsin mi?
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={()=>setAdminOnayliGecis(true)} className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg flex items-center gap-1"><Check size={11}/> Evet</button>
            <button type="button" onClick={()=>{setTarih("");setTarihHataVarMi(false);}} className="text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg flex items-center gap-1"><X size={11}/> Hayır</button>
          </div>
        </div>
      )}

      {/* Non-admin blocker */}
      {tarihHataVarMi && !isAdmin && !isReadOnly && (
        <div className="rounded-xl border border-red-500/20 bg-[#fef2f2] p-6 text-center">
          <ShieldAlert className="h-10 w-10 text-red-700 mx-auto mb-3 animate-bounce"/>
          <p className="text-sm font-black text-[#1a1f2e] mb-1 uppercase">Gün Atlayamazsınız</p>
          <p className="text-gray-500 text-xs mb-4">
            Sıradaki gün: <strong className="text-red-600">{beklenenTarih?fmtTarih(beklenenTarih):""}</strong>
          </p>
          <button type="button" onClick={()=>setTarih("")} className="text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-6 py-2 rounded-xl transition-colors">Tarihi Düzelt</button>
        </div>
      )}

      <div className={`transition-all duration-200 ${formKilitli&&!isReadOnly?"opacity-20 pointer-events-none blur-sm select-none":""}`}>

        {!tarih && !isReadOnly && (
          <div className="flex items-center justify-center gap-2 py-8 text-gray-600 text-xs border border-dashed border-[#e2e5eb] rounded-xl">
            <Lock size={12} className="text-amber-700"/> Tarih seçilince form aktif olur
          </div>
        )}

        {(tarih || isReadOnly) && (
          <div className="space-y-3">

            {/* CİRO GİRİŞLERİ: Online / Kapıda Ödeme (Kebo + Chick'N Fride) + Kasa */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* ── ONLINE ── */}
              <div className="rounded-xl border border-blue-500/20 bg-[#ffffff] overflow-hidden">
                <div className="px-4 py-3 border-b border-blue-500/15 flex items-center justify-between bg-blue-500/[0.03]">
                  <span className="text-[13px] font-bold text-blue-700 flex items-center gap-2"><Monitor size={14}/>Online Satışlar</span>
                  <span className="text-sm font-black text-blue-700">₺{fmt(ch.tOnline)} <span className="text-gray-500 font-medium text-[11px]">· {ch.tOnlinePaket} paket</span></span>
                </div>
                <div className="p-3 space-y-4">
                  <div>
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-amber-700 bg-amber-500/10 border border-amber-500/25 px-2.5 py-1 rounded-full mb-2">🍔 Kebo</span>
                    <div className="space-y-2">
                      <PlatformSatir label="Yemeksepeti" value={osKeboYs} onChange={setOsKeboYs} indirim={osKeboYsIndirim} onIndirimChange={setOsKeboYsIndirim} disabled={isReadOnly}/>
                      <PlatformSatir label="Trendyol" value={osKeboTrendyol} onChange={setOsKeboTrendyol} indirim={osKeboTrendyolIndirim} onIndirimChange={setOsKeboTrendyolIndirim} disabled={isReadOnly}/>
                      <PlatformSatir label="Migros" value={osKeboMigros} onChange={setOsKeboMigros} disabled={isReadOnly}/>
                    </div>
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-red-700 bg-red-500/10 border border-red-500/25 px-2.5 py-1 rounded-full mb-2">🍗 Chick&apos;N Fride</span>
                    <div className="space-y-2">
                      <PlatformSatir label="Yemeksepeti" value={osCnfYs} onChange={setOsCnfYs} indirim={osCnfYsIndirim} onIndirimChange={setOsCnfYsIndirim} disabled={isReadOnly}/>
                      <PlatformSatir label="Trendyol" value={osCnfTrendyol} onChange={setOsCnfTrendyol} indirim={osCnfTrendyolIndirim} onIndirimChange={setOsCnfTrendyolIndirim} disabled={isReadOnly}/>
                      <PlatformSatir label="Migros Yemek" value={osCnfMigrosYemek} onChange={setOsCnfMigrosYemek} disabled={isReadOnly}/>
                    </div>
                  </div>
                </div>
              </div>
              {/* ── KAPIDA ÖDEME ── */}
              <div className="rounded-xl border border-purple-500/20 bg-[#ffffff] overflow-hidden">
                <div className="px-4 py-3 border-b border-purple-500/15 flex items-center justify-between bg-purple-500/[0.03]">
                  <span className="text-[13px] font-bold text-purple-700 flex items-center gap-2"><Home size={14}/>Kapıda Ödeme</span>
                  <div className="flex items-center gap-2">
                    <span title={ch.kapidaKasada ? "13.08.2026 öncesi: kendi kuryelerimizin topladığı para kasa sayımının içinde" : "Roadrunner'da kalır, haftalık mutabakatla mahsup edilir"}
                      className="text-[10px] font-semibold text-purple-700 bg-purple-500/15 border border-purple-500/25 px-2 py-0.5 rounded-full">
                      {ch.kapidaKasada ? "Kasa sayımında" : "Brüte ayrıca eklenir"}
                    </span>
                    <span className="text-sm font-black text-purple-700">₺{fmt(ch.tKapida)} <span className="text-gray-500 font-medium text-[11px]">· {ch.tKapidaPaket} paket</span></span>
                  </div>
                </div>
                <div className="p-3 space-y-4">
                  <div>
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-amber-700 bg-amber-500/10 border border-amber-500/25 px-2.5 py-1 rounded-full mb-2">🍔 Kebo</span>
                    <div className="space-y-2">
                      <PlatformSatir label="Yemeksepeti" value={koKeboYs} onChange={setKoKeboYs} indirim={koKeboYsIndirim} onIndirimChange={setKoKeboYsIndirim} disabled={isReadOnly}/>
                      <PlatformSatir label="Trendyol" value={koKeboTrendyol} onChange={setKoKeboTrendyol} indirim={koKeboTrendyolIndirim} onIndirimChange={setKoKeboTrendyolIndirim} disabled={isReadOnly}/>
                      <PlatformSatir label="Migros Yemek" value={koKeboMigrosYemek} onChange={setKoKeboMigrosYemek} disabled={isReadOnly}/>
                      <PlatformSatir label="Alo Paket" value={koKeboAlo} onChange={setKoKeboAlo} disabled={isReadOnly}/>
                    </div>
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-red-700 bg-red-500/10 border border-red-500/25 px-2.5 py-1 rounded-full mb-2">🍗 Chick&apos;N Fride</span>
                    <div className="space-y-2">
                      <PlatformSatir label="Yemeksepeti" value={koCnfYs} onChange={setKoCnfYs} indirim={koCnfYsIndirim} onIndirimChange={setKoCnfYsIndirim} disabled={isReadOnly}/>
                      <PlatformSatir label="Trendyol" value={koCnfTrendyol} onChange={setKoCnfTrendyol} indirim={koCnfTrendyolIndirim} onIndirimChange={setKoCnfTrendyolIndirim} disabled={isReadOnly}/>
                      <PlatformSatir label="Migros Yemek" value={koCnfMigrosYemek} onChange={setKoCnfMigrosYemek} disabled={isReadOnly}/>
                      <PlatformSatir label="Alo Paket" value={koCnfAlo} onChange={setKoCnfAlo} disabled={isReadOnly}/>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* ── KASA ── */}
            <div className="rounded-xl border border-emerald-500/20 bg-[#ffffff] overflow-hidden">
              <div className="px-4 py-3 border-b border-emerald-500/15 flex items-center justify-between bg-emerald-500/[0.03]">
                <span className="text-[13px] font-bold text-emerald-700 flex items-center gap-2">💰 Kasa</span>
                <span className="text-sm font-black text-emerald-700">₺{fmt(ch.tKasa)}</span>
              </div>
              <div className="p-3 grid grid-cols-2 md:grid-cols-4 gap-2.5">
                <CurrencyInput label="Nakit" value={kasaNakit} onChange={setKasaNakit} disabled={isReadOnly}/>
                <CurrencyInput label="Pos" value={kasaPos} onChange={setKasaPos} disabled={isReadOnly}/>
                <CurrencyInput label="Edenred" value={kasaEdenred} onChange={setKasaEdenred} disabled={isReadOnly}/>
                <CurrencyInput label="Metropol" value={kasaMetropol} onChange={setKasaMetropol} disabled={isReadOnly}/>
              </div>
              <div className="mx-3 mb-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3.5 py-2.5 flex items-center justify-between">
                <span className="text-[12px] text-red-700 font-semibold flex items-center gap-1.5"><TrendingDown size={13}/>Gider (salt okunur)</span>
                <span className="text-[15px] font-black text-red-700">₺{fmt(ch.tGider)}</span>
              </div>
              <p className="px-3.5 pb-3 text-[11px] text-gray-500 leading-relaxed">Gider için aşağıdaki <span className="text-gray-700 font-semibold">Giderler</span> bölümünü kullan — buraya doğrudan giriş yapılamaz, orada eklediğin her satır bu toplama otomatik yansır.</p>
            </div>
            {/* ── İNDİRİM ANALİZİ ── */}
            <div className={`rounded-xl border overflow-hidden ${ch.indirimUyari ? "border-red-500/40 bg-red-500/5" : "border-[#dde1e8] bg-[#ffffff]"}`}>
              <div className={`px-4 py-3 border-b flex items-center justify-between ${ch.indirimUyari ? "border-red-500/25 bg-red-500/[0.04]" : "border-[#dde1e8] bg-black/[0.03]"}`}>
                <span className={`text-[13px] font-bold flex items-center gap-2 ${ch.indirimUyari?"text-red-700":"text-gray-800"}`}>
                  <Percent size={14}/>İndirim Analizi
                </span>
                <span className={`text-sm font-black ${ch.indirimUyari?"text-red-700":"text-[#1a1f2e]"}`}>%{ch.indirimOrani.toFixed(1)}</span>
              </div>
              <div className="p-3.5 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[11px] text-gray-400 font-medium">Yemeksepeti</p>
                  <p className="text-[15px] font-black text-red-700">₺{fmt(ch.tIndirimYS)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 font-medium">Trendyol</p>
                  <p className="text-[15px] font-black text-red-700">₺{fmt(ch.tIndirimTrendyol)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 font-medium">Toplam</p>
                  <p className="text-[15px] font-black text-[#1a1f2e]">₺{fmt(ch.tIndirim)}</p>
                </div>
              </div>
              {ch.indirimUyari && (
                <div className="mx-3.5 mb-3.5 flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3.5 py-2.5">
                  <AlertTriangle size={14} className="text-red-600 shrink-0"/>
                  <p className="text-[12px] text-red-200">İndirim oranı platform cirosunun <span className="font-black">%15&apos;ini</span> geçti — kontrol et.</p>
                </div>
              )}
            </div>

            {/* PLATFORM ÖZET BANTI */}
            {platformOzetSatirlar.length > 0 && (
              <div className="rounded-xl border border-[#e2e5eb] bg-[#f7f8fa] px-4 py-3">
                <p className="text-[11px] text-gray-400 font-semibold mb-2.5 flex items-center gap-1.5">
                  <PieChart size={11}/> Platform Bazlı Toplam (Online + Kapıda) — Bilgi Amaçlı
                </p>
                <div className="flex flex-wrap gap-3">
                  {platformOzetSatirlar.map(p => (
                    <div key={p.label} className="flex items-center gap-2 bg-black/[0.04] border border-white/5 rounded-lg px-2.5 py-1.5">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor:p.color}}/>
                      <span className="text-[10px] text-gray-400">{p.label}</span>
                      <span className="text-[11px] font-bold text-[#1a1f2e]">₺{fmt(p.online+p.kapida)}</span>
                      {p.kapida > 0 && (
                        <span className="text-[9px] text-gray-600">
                          ({p.online > 0 ? `On:₺${fmt(p.online)} + ` : ""}Kpd:₺{fmt(p.kapida)})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ALT KISIM: Gider / İade / Kurye / Notlar */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">

              {/* Giderler */}
              <div className="rounded-xl border border-red-500/20 bg-[#ffffff] overflow-hidden">
                <div className="px-4 py-3 border-b border-red-500/15 flex flex-wrap items-center justify-between gap-2 bg-red-500/[0.03]">
                  <span className="text-[13px] font-bold text-red-700 flex items-center gap-2">💸 Giderler</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-red-700">₺{fmt(ch.tGider)}</span>
                    {!isReadOnly && (
                      <>
                        <button type="button" onClick={()=>giderEkle("normal")}
                          className="text-[11px] font-semibold text-gray-700 hover:text-red-700 bg-black/[0.04] hover:bg-red-500/10 border border-[#d8dde5] hover:border-red-500/30 px-2.5 py-1 rounded-lg transition-colors">
                          + Normal
                        </button>
                        <button type="button" onClick={()=>giderEkle("firma")}
                          className="text-[11px] font-semibold text-gray-700 hover:text-blue-700 bg-black/[0.04] hover:bg-blue-500/10 border border-[#d8dde5] hover:border-blue-500/30 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1">
                          <Building2 size={11}/> Firma
                        </button>
                        <button type="button" onClick={()=>giderEkle("personel")}
                          className="text-[11px] font-semibold text-gray-700 hover:text-teal-700 bg-black/[0.04] hover:bg-teal-500/10 border border-[#d8dde5] hover:border-teal-500/30 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1">
                          <Users2 size={11}/> Personel
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="p-3 space-y-2">
                  {giderler.map((item, idx) => (
                    <div key={item.id} className="space-y-1.5">
                      {item.tip === "firma" ? (
                        <div className="flex items-center gap-1.5 mb-1">
                          <Building2 size={11} className="text-blue-600"/>
                          <span className="text-[11px] font-semibold text-blue-700">Firma Ödemesi</span>
                        </div>
                      ) : item.tip === "personel" ? (
                        <div className="flex items-center gap-1.5 mb-1">
                          <Users2 size={11} className="text-teal-600"/>
                          <span className="text-[11px] font-semibold text-teal-700">Personel Tüketimi — kasadan fiş çıkar, otomatik avans olarak işlenir</span>
                        </div>
                      ) : null}

                      {item.tip === "firma" ? (
                        isReadOnly ? (
                          <div className="w-full bg-[#f7f8fa] border border-blue-500/20 text-blue-700 text-xs h-7 px-2.5 rounded-lg flex items-center gap-1.5">
                            <Building2 size={9}/> {item.firmaUnvan || item.aciklama}
                          </div>
                        ) : (
                          <div className="relative">
                            <Search size={9} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600"/>
                            <select
                              disabled={isReadOnly}
                              value={item.firmaId || ""}
                              onChange={e => {
                                const firma = cariListesi.find(c => c.id === e.target.value);
                                giderDegistir(item.id, firma
                                  ? { firmaId: firma.id, firmaUnvan: firma.unvan, aciklama: firma.unvan }
                                  : { firmaId: undefined, firmaUnvan: undefined, aciklama: "" });
                              }}
                              className="w-full bg-[#f7f8fa] border border-blue-500/20 text-[#1a1f2e] text-xs h-7 pl-6 pr-2 rounded-lg outline-none focus:border-blue-500/40 disabled:opacity-40 appearance-none"
                            >
                              <option value="">Firma seçiniz...</option>
                              {cariListesi.map(c => (
                                <option key={c.id} value={c.id} className="bg-[#ffffff]">
                                  {c.unvan} {c.cari_kodu ? `(${c.cari_kodu})` : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                        )
                      ) : item.tip === "personel" ? (
                        <div className="space-y-1.5">
                          <select disabled={isReadOnly} value={item.personelId || personelIdBul(item.personelIsim) || ""}
                            onChange={e => { const p = avansPersonelListesi.find(x => x.id === e.target.value); giderDegistir(item.id, { personelId: p?.id, personelIsim: p?.isim || "" }); }}
                            className="w-full bg-[#f7f8fa] border border-teal-500/20 text-[#1a1f2e] text-xs h-7 px-2.5 rounded-lg outline-none focus:border-teal-500/40 disabled:opacity-40 appearance-none">
                            <option value="">Personel seçiniz...</option>
                            {item.personelIsim && !personelIdBul(item.personelIsim) && <option value="">{item.personelIsim} (listede yok)</option>}
                            {avansPersonelListesi.map(p=>(<option key={p.id} value={p.id} className="bg-[#ffffff]">{p.isim}</option>))}
                          </select>
                          <input type="text" placeholder="Ne tüketti? (örn: 1 adet kola)" disabled={isReadOnly} value={item.aciklama}
                            onChange={e=>giderDegistir(item.id, { aciklama: e.target.value })}
                            className="w-full bg-[#f7f8fa] border border-[#e2e5eb] hover:border-[#d8dde5] focus:border-teal-500/40 text-[#1a1f2e] text-xs h-7 px-2.5 rounded-lg outline-none transition-all disabled:opacity-40 placeholder:text-gray-700"/>
                        </div>
                      ) : (
                        <AkilliGiderInput
                          value={item.aciklama}
                          onChange={v => giderDegistir(item.id, { aciklama: v })}
                          disabled={isReadOnly}
                          oneriListesi={giderOnerileri}
                        />
                      )}

                      <div className="flex gap-1.5">
                        <div className="relative flex-1">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-[13px] font-semibold">₺</span>
                          <input
                            type="text" inputMode="decimal" placeholder="0" disabled={isReadOnly} value={item.tutar}
                            onChange={e=>giderDegistir(item.id,{ tutar: e.target.value })}
                            className="w-full bg-[#f7f8fa] border border-[#dde1e8] text-[#1a1f2e] text-[14px] font-bold h-9 pl-7 pr-2 rounded-lg outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/15 disabled:opacity-40"
                          />
                        </div>
                        {!isReadOnly && giderler.length>1 && (
                          <button type="button" onClick={()=>giderSil(item.id)} className="text-gray-500 hover:text-red-600 px-1.5"><Trash2 size={13}/></button>
                        )}
                      </div>
                      {idx < giderler.length-1 && <div className="border-t border-[#e2e5eb] mt-1"/>}
                    </div>
                  ))}
                </div>
                {/* 02.09.2026: Platform indirimleri (Yemeksepeti + Trendyol, online + kapıda) burada
                    da salt okunur olarak özetleniyor — hesaplama İndirim Analizi kartındaki ch.tIndirim
                    değerinden geliyor, buradan ayrıca giriş yapılmaz. */}
                <div className="mx-3 mb-3 rounded-lg border border-orange-500/20 bg-orange-500/5 px-3.5 py-2.5 flex items-center justify-between">
                  <span className="text-[12px] text-orange-700 font-semibold flex items-center gap-1.5"><Percent size={13}/>Toplam Platform İndirimleri (salt okunur)</span>
                  <span className="text-[15px] font-black text-orange-700">₺{fmt(ch.tIndirim)}</span>
                </div>
              </div>

              {/* İade + Kurye + Notlar */}
              <div className="space-y-3">
                {/* Personel Kesintisi — kasayı/gideri etkilemez, sadece ay sonu maaştan düşülür */}
                <div className="rounded-xl border border-rose-500/15 bg-[#ffffff] overflow-hidden">
                  <div className="px-3 py-2 border-b border-rose-500/15 flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-rose-600 uppercase tracking-wider flex items-center gap-1.5"><Users2 size={11}/>Personel Kesintisi</span>
                    {!isReadOnly && (
                      <button type="button" onClick={()=>setKesintiSatirlari([...kesintiSatirlari,{id:Date.now(),personelIsim:"",tutar:"",aciklama:""}])}
                        className="text-[10px] text-gray-600 hover:text-rose-600 border border-[#e2e5eb] hover:border-rose-500/30 px-2 py-0.5 rounded transition-colors">+ Kesinti</button>
                    )}
                  </div>
                  <div className="p-3 space-y-2">
                    <p className="text-[9px] text-gray-600">Kasayı / gideri etkilemez (örn. eksik ürün gönderimi cezası) — sadece ay sonu maaştan düşülür.</p>
                    {kesintiSatirlari.length===0 && (
                      <p className="text-[10px] text-gray-600 text-center py-1">Bu raporda kesinti girilmedi.</p>
                    )}
                    {kesintiSatirlari.map(k=>(
                      <div key={k.id} className="space-y-1">
                        <div className="grid grid-cols-12 gap-1.5">
                          <select disabled={isReadOnly} value={k.personelId || personelIdBul(k.personelIsim) || ""}
                            onChange={e=>{ const p = avansPersonelListesi.find(x=>x.id===e.target.value); setKesintiSatirlari(kesintiSatirlari.map(x=>x.id===k.id?{...x,personelId:p?.id,personelIsim:p?.isim||""}:x)); }}
                            className="col-span-6 bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] h-7 text-xs rounded-lg px-2 outline-none focus:border-rose-500/40 disabled:opacity-40">
                            <option value="">Personel seç...</option>
                            {k.personelIsim && !personelIdBul(k.personelIsim) && <option value="">{k.personelIsim} (listede yok)</option>}
                            {avansPersonelListesi.map(p=>(<option key={p.id} value={p.id}>{p.isim}</option>))}
                          </select>
                          <div className="col-span-5 relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-600 text-[10px]">₺</span>
                            <input type="text" inputMode="decimal" placeholder="0" disabled={isReadOnly} value={k.tutar}
                              onChange={e=>setKesintiSatirlari(kesintiSatirlari.map(x=>x.id===k.id?{...x,tutar:paraGirdisi(e.target.value)}:x))}
                              className="w-full bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] text-xs font-bold h-7 pl-5 pr-2 rounded-lg outline-none focus:border-rose-500/40 disabled:opacity-40"/>
                          </div>
                          {!isReadOnly && <button type="button" onClick={()=>setKesintiSatirlari(kesintiSatirlari.filter(x=>x.id!==k.id))} className="col-span-1 text-gray-700 hover:text-red-600 flex items-center justify-center"><Trash2 size={11}/></button>}
                        </div>
                        <input type="text" placeholder="Kesinti sebebi (örn: eksik ürün gönderimi)" disabled={isReadOnly} value={k.aciklama}
                          onChange={e=>setKesintiSatirlari(kesintiSatirlari.map(x=>x.id===k.id?{...x,aciklama:e.target.value}:x))}
                          className="w-full bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] text-[11px] h-6 px-2 rounded-lg outline-none focus:border-rose-500/40 disabled:opacity-40 placeholder:text-gray-700"/>
                      </div>
                    ))}
                    <p className="text-[9px] text-gray-600">Kaydedince ilgili personelin profilindeki Kesinti geçmişine işlenir; ay sonu maaş hesabında oradan görünür.</p>
                  </div>
                </div>
                {/* İadeler */}
                <div className="rounded-xl border border-orange-500/15 bg-[#ffffff] overflow-hidden">
                  <div className="px-3 py-2 border-b border-orange-500/15 flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-orange-600 uppercase tracking-wider flex items-center gap-1.5"><RotateCcw size={11}/>İptal-İade Fişleri</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-orange-600">₺{fmt(ch.tIade)}</span>
                      {!isReadOnly && <button type="button" onClick={iadeEkle} className="text-[10px] text-gray-600 hover:text-orange-600 border border-[#e2e5eb] hover:border-orange-500/30 w-5 h-5 rounded flex items-center justify-center transition-colors">+</button>}
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    {iadeler.map((item,idx)=>(
                      <div key={item.id} className="space-y-1.5">
                        <input type="text" placeholder="İptal / iade fiş açıklaması..." disabled={isReadOnly} value={item.aciklama}
                          onChange={e=>iadeDegistir(item.id,"aciklama",e.target.value)}
                          className="w-full bg-[#f7f8fa] border border-[#e2e5eb] hover:border-[#d8dde5] focus:border-blue-500/40 text-[#1a1f2e] text-xs h-7 px-2.5 rounded-lg outline-none transition-all disabled:opacity-40 placeholder:text-gray-700"/>
                        <div className="flex gap-1">
                          <div className="relative flex-1">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-600 text-xs">₺</span>
                            <input type="text" placeholder="0" disabled={isReadOnly} value={item.tutar}
                              onChange={e=>iadeDegistir(item.id,"tutar",e.target.value)}
                              className="w-full bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] text-xs font-bold h-7 pl-5 pr-2 rounded-lg outline-none focus:border-blue-500/40 disabled:opacity-40"/>
                          </div>
                          {!isReadOnly && iadeler.length>1 && <button type="button" onClick={()=>iadeSil(item.id)} className="text-gray-700 hover:text-red-600 px-1"><Trash2 size={11}/></button>}
                        </div>
                        {idx < iadeler.length-1 && <div className="border-t border-[#e2e5eb] mt-1"/>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Kuryeler */}
                <div className="rounded-xl border border-amber-500/15 bg-[#ffffff] overflow-hidden">
                  <div className="px-3 py-2 border-b border-amber-500/15 flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider flex items-center gap-1.5"><Truck size={11}/>Kurye (Roadrunner)</span>
                    <div className="flex items-center gap-2">
                      {ch.kuryeFark===0
                        ? <span className="text-[10px] text-emerald-600 flex items-center gap-1"><CheckCircle2 size={10}/>Dengede</span>
                        : <span className="text-[10px] text-red-600 flex items-center gap-1"><AlertTriangle size={10}/>{ch.kuryeFark>0?`₺${fmt(ch.kuryeFark)} eksik`:`₺${fmt(Math.abs(ch.kuryeFark))} fazla`}</span>
                      }
                      {!isReadOnly && <button type="button" onClick={kuryeEkle} className="text-[10px] text-gray-600 hover:text-amber-600 border border-[#e2e5eb] hover:border-amber-500/30 px-2 py-0.5 rounded transition-colors">+ Havuz Kurye</button>}
                    </div>
                  </div>
                  <div className="p-3 space-y-3">
                    <p className="text-[10px] text-gray-600">Sabit kuryede (Roadrunner) günlük en az <span className="text-amber-600 font-bold">30 paket</span> garantisi var — altında kalınırsa ödemede 30 esas alınır. Havuz kuryede garanti yok.</p>
                    <div className="grid grid-cols-12 gap-1.5">
                      <div className="col-span-3 text-[9px] text-gray-600 uppercase tracking-wider">Kurye</div>
                      <div className="col-span-3 text-[9px] text-gray-600 uppercase tracking-wider text-center">Gerçek / Esas Paket</div>
                      <div className="col-span-3 text-[9px] text-amber-600 uppercase tracking-wider">Nakit</div>
                      <div className="col-span-3 text-[9px] text-blue-600 uppercase tracking-wider">Kredi/POS</div>
                    </div>
                    {ch.kuryelerHesap.map((k)=>{
                      const sabit = k.tip==="sabit";
                      return (
                        <div key={k.id} className="relative">
                          <div className="grid grid-cols-12 gap-1.5 items-center">
                            <div className="col-span-3">
                              {isReadOnly ? (
                                <div className="bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] h-7 text-xs rounded-lg px-2 flex items-center gap-1">
                                  {sabit && <Truck size={9} className="text-amber-700 shrink-0"/>}{k.isim || "—"}
                                </div>
                              ) : (
                                <div className="relative">
                                  {sabit && <Truck size={9} className="absolute left-2 top-1/2 -translate-y-1/2 text-amber-700"/>}
                                  <input type="text" placeholder={sabit?"Kurye adı":"Havuz kurye / firma"} disabled={isReadOnly} value={k.isim}
                                    onChange={e=>kuryeDegistir(k.id,"isim",e.target.value)}
                                    className={`w-full bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] h-7 text-xs rounded-lg ${sabit?"pl-6":"pl-2"} pr-2 outline-none focus:border-amber-500/40 disabled:opacity-40`}/>
                                </div>
                              )}
                            </div>
                            <div className="col-span-3">
                              <div className="flex items-center gap-1">
                                {isReadOnly ? (
                                  <div className="flex-1 bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] h-7 text-xs font-bold rounded-lg flex items-center justify-center">
                                    {k.gercekPaket}
                                  </div>
                                ) : (
                                  <input type="number" placeholder="0" disabled={isReadOnly} value={k.paketSayisi}
                                    onChange={e=>kuryeDegistir(k.id,"paketSayisi",e.target.value)}
                                    className="flex-1 w-0 bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] h-7 text-xs font-bold px-2 rounded-lg outline-none disabled:opacity-40 text-center"/>
                                )}
                                {sabit && (
                                  <span title="Ödemede esas alınan paket (garanti uygulandıysa)"
                                    className={`shrink-0 w-9 h-7 flex items-center justify-center text-[10px] font-black rounded-lg border ${k.garantiUygulandi ? "border-amber-500/40 bg-amber-500/10 text-amber-700" : "border-[#e2e5eb] text-gray-600"}`}>
                                    {k.uygulananPaket}
                                  </span>
                                )}
                              </div>
                              {sabit && k.garantiUygulandi && (
                                <p className="text-[9px] text-amber-700 mt-0.5">Garanti uygulandı (30)</p>
                              )}
                            </div>
                            <div className="col-span-3">
                              <div className={`relative rounded-lg border ${isReadOnly ? "border-amber-500/20 bg-amber-500/5" : "border-[#e2e5eb]"}`}>
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-amber-600 text-[10px] font-bold">₺</span>
                                {isReadOnly ? (
                                  <div className="h-7 pl-5 pr-2 flex items-center text-xs font-bold text-amber-700">
                                    {k.nakit ? fmt(Number(k.nakit)) : "0"}
                                  </div>
                                ) : (
                                  <input type="text" placeholder="0" disabled={isReadOnly} value={k.nakit}
                                    onChange={e=>kuryeDegistir(k.id,"nakit",e.target.value)}
                                    className="w-full bg-[#f7f8fa] text-[#1a1f2e] h-7 text-xs font-bold pl-5 pr-1 rounded-lg outline-none focus:border-amber-500/40 disabled:opacity-40"/>
                                )}
                              </div>
                            </div>
                            <div className="col-span-3">
                              <div className={`relative rounded-lg border ${isReadOnly ? "border-blue-500/20 bg-blue-500/5" : "border-[#e2e5eb]"}`}>
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-blue-600 text-[10px] font-bold">₺</span>
                                {isReadOnly ? (
                                  <div className="h-7 pl-5 pr-2 flex items-center text-xs font-bold text-blue-700">
                                    {k.pos ? fmt(Number(k.pos)) : "0"}
                                  </div>
                                ) : (
                                  <input type="text" placeholder="0" disabled={isReadOnly} value={k.pos}
                                    onChange={e=>kuryeDegistir(k.id,"pos",e.target.value)}
                                    className="w-full bg-[#f7f8fa] text-[#1a1f2e] h-7 text-xs font-bold pl-5 pr-1 rounded-lg outline-none focus:border-blue-500/40 disabled:opacity-40"/>
                                )}
                              </div>
                            </div>
                          </div>
                          {/* 02.09.2026: Roadrunner uzak (1.5x) ve 9km üzeri (2x) paketleri farklı
                              ücretlendiriyor — haftalık mutabakat hesabı Rapor Analiz'de bunları kullanır. */}
                          {(!isReadOnly || tv(k.uzakPaket)>0 || tv(k.paket9km)>0) && (
                            <div className="flex items-center gap-1.5 mt-1.5 pl-1">
                              <span className="text-[9px] text-orange-600 font-semibold shrink-0">Uzak (1.5x)</span>
                              {isReadOnly ? (
                                <span className="text-[11px] font-bold text-orange-700">{k.uzakPaket||0}</span>
                              ) : (
                                <input type="number" placeholder="0" disabled={isReadOnly} value={k.uzakPaket||""}
                                  onChange={e=>kuryeDegistir(k.id,"uzakPaket",e.target.value)}
                                  className="w-14 bg-[#f7f8fa] border border-orange-500/20 text-[#1a1f2e] h-6 text-[11px] font-bold px-1.5 rounded-lg outline-none focus:border-orange-500/40 disabled:opacity-40 text-center"/>
                              )}
                              <span className="text-[9px] text-red-600 font-semibold shrink-0 ml-2">9km+ (2x)</span>
                              {isReadOnly ? (
                                <span className="text-[11px] font-bold text-red-700">{k.paket9km||0}</span>
                              ) : (
                                <input type="number" placeholder="0" disabled={isReadOnly} value={k.paket9km||""}
                                  onChange={e=>kuryeDegistir(k.id,"paket9km",e.target.value)}
                                  className="w-14 bg-[#f7f8fa] border border-red-500/20 text-[#1a1f2e] h-6 text-[11px] font-bold px-1.5 rounded-lg outline-none focus:border-red-500/40 disabled:opacity-40 text-center"/>
                              )}
                            </div>
                          )}
                          {!isReadOnly && k.tip!=="sabit" && (
                            <button type="button" onClick={()=>kuryeSil(k.id)}
                              className="absolute -right-5 top-1/2 -translate-y-1/2 text-gray-700 hover:text-red-600 transition-colors">
                              <Trash2 size={11}/>
                            </button>
                          )}
                        </div>
                      );
                    })}
                    <div className="pt-1 border-t border-[#e2e5eb] flex items-center justify-between text-[10px]">
                      <span className="text-gray-600">Gerçek toplam: <span className="text-gray-700 font-bold">{ch.tKuryeGercekPaket} pkt</span></span>
                      <span className="text-gray-600">Ödemeye esas toplam: <span className="text-amber-600 font-bold">{ch.tKuryePaket} pkt</span></span>
                    </div>
                    {(ch.tKuryeUzakPaket>0 || ch.tKuryePaket9km>0) && (
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-gray-600">Uzak (1.5x): <span className="text-orange-700 font-bold">{ch.tKuryeUzakPaket} pkt</span></span>
                        <span className="text-gray-600">9km üzeri (2x): <span className="text-red-700 font-bold">{ch.tKuryePaket9km} pkt</span></span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Notlar */}
                <div className="rounded-xl border border-[#e2e5eb] bg-[#ffffff] overflow-hidden">
                  <div className="px-3 py-2 border-b border-[#e2e5eb]">
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5"><StickyNote size={11}/>Notlar</span>
                  </div>
                  <div className="p-3">
                    <textarea value={notlar} disabled={isReadOnly} onChange={e=>setNotlar(e.target.value)}
                      placeholder="Özel durumlar, hatırlatmalar..."
                      rows={2}
                      className="w-full bg-[#f7f8fa] border border-[#e2e5eb] hover:border-[#d8dde5] focus:border-blue-500/40 text-[#1a1f2e] text-xs px-3 py-2 rounded-lg outline-none transition-all resize-none disabled:opacity-40 placeholder:text-gray-700"/>
                  </div>
                </div>

              </div>
            </div>

            {/* ÖZET BANT */}
            <div className="rounded-xl border border-[#e2e5eb] bg-[#f7f8fa] px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 mt-1">
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <div>
                  <p className="text-[9px] text-gray-600 uppercase tracking-widest">Online</p>
                  <p className="text-sm font-black text-blue-600">₺{fmt(ch.tOnline)}</p>
                </div>
                {!ch.kapidaKasada && ch.tKapida>0 && (<>
                  <span className="text-gray-800 hidden sm:block">+</span>
                  <div>
                    <p className="text-[9px] text-gray-600 uppercase tracking-widest">Kapıda</p>
                    <p className="text-sm font-black text-purple-600">₺{fmt(ch.tKapida)}</p>
                  </div>
                </>)}
                <span className="text-gray-800 hidden sm:block">+</span>
                <div>
                  <p className="text-[9px] text-gray-600 uppercase tracking-widest">Kasa</p>
                  <p className="text-sm font-black text-emerald-600">₺{fmt(ch.tKasa)}</p>
                </div>
                <span className="text-gray-800 hidden sm:block">+</span>
                <div>
                  <p className="text-[9px] text-gray-600 uppercase tracking-widest">Gider</p>
                  <p className="text-sm font-black text-red-700">₺{fmt(ch.tGider)}</p>
                </div>
                <span className="text-gray-800 hidden sm:block">=</span>
                <div>
                  <p className="text-[9px] text-blue-600 uppercase tracking-widest font-bold">Brüt</p>
                  <p className="text-sm font-black text-blue-700">₺{fmt(ch.brutCiro)}</p>
                </div>
                <span className="text-gray-800 hidden sm:block">−</span>
                <div><p className="text-[9px] text-gray-600 uppercase tracking-widest">Gider</p><p className="text-sm font-black text-red-600">₺{fmt(ch.tGider)}</p></div>
                <span className="text-gray-800 hidden sm:block">−</span>
                <div><p className="text-[9px] text-gray-600 uppercase tracking-widest">İade</p><p className="text-sm font-black text-orange-600">₺{fmt(ch.tIade)}</p></div>
                {ch.tIndirim>0 && (<>
                  <span className="text-gray-800 hidden sm:block">−</span>
                  <div><p className="text-[9px] text-gray-600 uppercase tracking-widest">İndirim</p><p className="text-sm font-black text-orange-700">₺{fmt(ch.tIndirim)}</p></div>
                </>)}
                <span className="text-gray-800 hidden sm:block">=</span>
                <div><p className="text-[9px] text-emerald-700 uppercase tracking-widest font-bold">Net Ciro</p><p className="text-base font-black text-emerald-600">₺{fmt(ch.netCiro)}</p></div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={()=>{formuTemizle();setFormAcik(false);}}
                  className="text-xs font-semibold text-gray-500 hover:text-[#1a1f2e] border border-[#e2e5eb] hover:border-[#d8dde5] px-4 py-2 rounded-xl transition-colors">
                  İptal
                </button>
                {!isReadOnly && (!tarihHataVarMi || adminOnayliGecis) && !duplikaTarihHata && (
                  <button type="submit" disabled={!tarih||saving}
                    className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 px-6 py-2 rounded-xl flex items-center gap-2 transition-colors shadow-lg shadow-blue-900/30">
                    {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>}
                    {selectedRapor ? "Kaydet" : "Raporu Kaydet"}
                  </button>
                )}
              </div>
            </div>

          </div>
        )}
      </div>
    </form>
  );

  // ── Loading ──
  if (loading) return (
    <div className="h-screen bg-[#f4f5f7] flex flex-col items-center justify-center gap-3">
      <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"/>
      <span className="text-[10px] text-gray-600 uppercase tracking-[0.3em]">KEBO ERP Yükleniyor</span>
    </div>
  );

  // ── MAIN RENDER ──
  return (
    <div className="min-h-screen bg-[#f4f5f7] text-[#1a1f2e] font-sans antialiased">

      {/* NAV HEADER */}
      <div className="sticky top-0 z-40 border-b border-[#e2e5eb] bg-[#f4f5f7]/95 backdrop-blur-xl">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-900/40">
              <Layers className="h-4 w-4 text-white"/>
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-[#1a1f2e] leading-none">KEBO ERP</h1>
              <p className="text-[10px] text-gray-600 leading-none mt-0.5">Kasa Kapanış Sistemi</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {raporlar.length>0 && (
              <>
                <button onClick={()=>exportCSV(raporlar,secilenAy,secilenYil)}
                  className="hidden sm:flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-emerald-600 border border-[#e2e5eb] hover:border-emerald-500/30 px-3 py-2 rounded-xl transition-colors">
                  <FileDown size={13}/> CSV
                </button>
                <button onClick={()=>exportPDF(raporlar,secilenAy,secilenYil)}
                  className="hidden sm:flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-red-600 border border-[#e2e5eb] hover:border-red-500/30 px-3 py-2 rounded-xl transition-colors">
                  <FileDown size={13}/> PDF
                </button>
              </>
            )}
            <button onClick={()=>setAiAcik(!aiAcik)}
              className={`flex items-center gap-1.5 text-[11px] font-semibold border px-3 py-2 rounded-xl transition-colors ${
                aiAcik ? "text-purple-700 border-purple-500/40 bg-purple-500/10" : "text-gray-500 hover:text-purple-600 border-[#e2e5eb] hover:border-purple-500/30"
              }`}>
              <Sparkles size={13}/> AI Analiz
            </button>
            <button onClick={veriCek}
              className="p-2 text-gray-600 hover:text-[#1a1f2e] border border-[#e2e5eb] hover:border-[#d8dde5] rounded-xl transition-colors">
              <RefreshCw size={14}/>
            </button>
            {isAdmin && (
              <button onClick={()=>{setOnayModalTab("bekleyen");setOnayModalAcik(true);}}
                className={`relative flex items-center gap-1.5 text-[11px] font-semibold border px-3 py-2 rounded-xl transition-colors ${
                  onayBekleyenler.length>0 ? "text-amber-700 border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15" : "text-gray-500 hover:text-[#1a1f2e] border-[#e2e5eb] hover:border-[#d8dde5]"
                }`}>
                <AlertTriangle size={13}/> Onay Bekleyenler
                {onayBekleyenler.length>0 && (
                  <span className="ml-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-amber-500 text-[10px] font-black text-black">{onayBekleyenler.length}</span>
                )}
              </button>
            )}
            <button onClick={()=>{formuTemizle();setFormAcik(true);}}
              className="flex items-center gap-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl transition-colors shadow-lg shadow-blue-900/30">
              <PlusCircle size={14}/> Yeni Rapor
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* AI ANALİZ PANELI */}
        {aiAcik && (
          <div className="rounded-2xl border border-purple-500/20 bg-[#faf9ff] overflow-hidden">
            <div className="px-5 py-3 border-b border-purple-500/20 flex items-center gap-3">
              <div className="w-6 h-6 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5 text-purple-600"/>
              </div>
              <span className="text-sm font-semibold text-purple-700">AI Rapor Analizi</span>
              <span className="text-[10px] text-gray-600 bg-black/[0.04] border border-white/10 px-2 py-0.5 rounded-full">
                {AYLAR.find(m=>m.value===secilenAy)?.label} {secilenYil} · {raporlar.length} gün
              </span>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiSoru}
                  onChange={e=>setAiSoru(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&handleAiSoru()}
                  placeholder="Örnek: Bu ay en iyi günlerim hangileri? Giderlerim neden yüksek?"
                  className="flex-1 bg-[#f7f8fa] border border-purple-500/20 focus:border-purple-500/40 text-[#1a1f2e] text-sm px-4 py-2.5 rounded-xl outline-none transition-all placeholder:text-gray-600"
                />
                <button
                  onClick={()=>handleAiSoru()}
                  disabled={!aiSoru.trim() || aiYukleniyor || raporlar.length===0}
                  className="flex items-center gap-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-40 px-4 py-2 rounded-xl transition-colors"
                >
                  {aiYukleniyor ? <Loader2 size={13} className="animate-spin"/> : <Sparkles size={13}/>}
                  {aiYukleniyor ? "Analiz..." : "Sor"}
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  "Bu ay brüt ve net ciroya genel bakış",
                  "Hangi günler en düşük ciro?",
                  "Gider kalemleri analizi",
                  "Kurye performansı",
                  "Platform bazlı dağılım yorumu",
                ].map(s=>(
                  <button key={s} onClick={()=>handleAiSoru(s)}
                    disabled={aiYukleniyor || raporlar.length===0}
                    className="text-[10px] text-gray-500 hover:text-purple-700 border border-[#e2e5eb] hover:border-purple-500/30 disabled:opacity-40 px-2.5 py-1 rounded-lg transition-colors">
                    {s}
                  </button>
                ))}
              </div>

              {aiCevap && (
                <div className="bg-[#f7f8fa] border border-purple-500/10 rounded-xl p-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {aiCevap}
                </div>
              )}

              {raporlar.length===0 && (
                <p className="text-xs text-gray-600 text-center py-2">Bu dönemde rapor yok — önce veri girin.</p>
              )}
            </div>
          </div>
        )}

        {!formAcik && <EksikRaporBanner enSonRaporTarihi={enSonRaporTarihi} onEkle={()=>{formuTemizle();setFormAcik(true);}}/>}

        {formAcik && (
          <div className="kebo-anim-in rounded-2xl border border-[#e2e5eb] bg-[#ffffff] overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-[#e2e5eb] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/20 flex items-center justify-center">
                  <TrendingUp className="h-3.5 w-3.5 text-blue-600"/>
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[#1a1f2e]">
                    {selectedRapor ? (isEditMode ? "Raporu Düzenle" : "Rapor Detayı") : "Yeni Gün Sonu Raporu"}
                  </h2>
                  <p className="text-[13px] text-gray-500 font-medium">{tarih ? fmtTarih(tarih) : "Tarih seçilmedi"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedRapor && (
                  <button onClick={()=>setPrintRapor(selectedRapor)}
                    className="p-2 text-gray-600 hover:text-[#1a1f2e] border border-[#e2e5eb] hover:border-[#d8dde5] rounded-xl transition-colors">
                    <Printer size={14}/>
                  </button>
                )}
                <button onClick={()=>{formuTemizle();setFormAcik(false);}}
                  className="p-2 text-gray-600 hover:text-[#1a1f2e] border border-[#e2e5eb] hover:border-[#d8dde5] rounded-xl transition-colors">
                  <X size={14}/>
                </button>
              </div>
            </div>
            <div className="p-5">{renderForm()}</div>
          </div>
        )}

        {!formAcik && <DashboardPanel raporlar={raporlar}/>}

        {!formAcik && (
          <div className="rounded-2xl border border-[#e2e5eb] bg-[#ffffff] overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-[#e2e5eb] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-black/[0.04] border border-[#e2e5eb] flex items-center justify-center">
                  <FileText className="h-3.5 w-3.5 text-gray-400"/>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">Kapanış Arşivi</h3>
                  <p className="text-[10px] text-gray-600">
                    {AYLAR.find(m=>m.value===secilenAy)?.label} {secilenYil} · {raporlar.length} rapor
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {raporlar.length>0 && (
                  <div className="flex sm:hidden items-center gap-1">
                    <button onClick={()=>exportCSV(raporlar,secilenAy,secilenYil)} className="text-[10px] text-gray-600 hover:text-emerald-600 border border-[#e2e5eb] px-2.5 py-1.5 rounded-lg transition-colors">CSV</button>
                    <button onClick={()=>exportPDF(raporlar,secilenAy,secilenYil)} className="text-[10px] text-gray-600 hover:text-red-600 border border-[#e2e5eb] px-2.5 py-1.5 rounded-lg transition-colors">PDF</button>
                  </div>
                )}
                <div className="flex items-center gap-2 bg-[#f7f8fa] border border-[#e2e5eb] px-3 py-2 rounded-xl">
                  <Calendar size={12} className="text-gray-600"/>
                  <select value={secilenAy} onChange={e=>setSecilenAy(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-gray-700 outline-none cursor-pointer">
                    {AYLAR.map(m=><option key={m.value} value={m.value} className="bg-[#ffffff]">{m.label}</option>)}
                  </select>
                  <span className="text-gray-700">/</span>
                  <select value={secilenYil} onChange={e=>setSecilenYil(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-gray-700 outline-none cursor-pointer">
                    {["2024","2025","2026","2027"].map(y=><option key={y} value={y} className="bg-[#ffffff]">{y}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#e2e5eb] bg-[#f7f8fa]">
                    {["Tarih","Brüt Ciro","Net Ciro","Paket","Sepet Ort.","Gider+İade",""].map((h,i)=>(
                      <th key={i} className={`px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest ${
                        h==="Net Ciro"?"text-emerald-600":h==="Paket"?"text-amber-600":h==="Sepet Ort."?"text-purple-600":h==="Gider+İade"?"text-red-600":"text-gray-600"
                      }`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#0f1624]">
                  {raporlar.length===0 ? (
                    <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-600 text-xs uppercase tracking-widest">Bu dönemde rapor bulunmuyor</td></tr>
                  ) : raporlar.map((rapor)=>{
                    const o = raporOzeti(rapor);
                    const brutCiro = o.brut, net = o.net, paket = o.paket;
                    const ort = paket>0 ? o.platformCiro/paket : 0;
                    const gi = o.gider + o.iade;
                    return (
                      <tr key={rapor.id}
                        onClick={()=>{setSelectedRapor(rapor);raporuFormaYukle(rapor);setIsEditMode(false);setFormAcik(true);}}
                        className="hover:bg-black/[0.03] cursor-pointer transition-colors group">
                        <td className="px-4 py-3.5 font-semibold text-gray-700 group-hover:text-blue-600 transition-colors">
                          {fmtTarih(rapor.tarih)}
                          {(rapor.gider_aciklama?.includes("|| NOT:") || rapor.gider_aciklama?.startsWith("NOT:")) && <span className="ml-1.5 text-[9px] text-blue-700/60 bg-blue-500/10 px-1.5 py-0.5 rounded-full">Not</span>}
                        </td>
                        <td className="px-4 py-3.5 text-blue-600 font-semibold">₺{fmt(brutCiro)}</td>
                        <td className="px-4 py-3.5 text-emerald-600 font-black">₺{fmt(net)}</td>
                        <td className="px-4 py-3.5 text-amber-600 font-semibold">{paket}</td>
                        <td className="px-4 py-3.5 text-purple-600 font-bold">₺{fmt(ort)}</td>
                        <td className="px-4 py-3.5 text-red-600 font-medium">{gi>0?`-₺${fmt(gi)}`:"—"}</td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-[10px] text-gray-500 flex items-center gap-1"><Eye size={10}/> İncele</span>
                            <button onClick={e=>{e.stopPropagation();setPrintRapor(rapor);}}
                              className="p-1 text-gray-600 hover:text-gray-900 rounded transition-colors ml-1">
                              <Printer size={11}/>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {raporlar.length>0 && (
                  <tfoot>
                    <tr className="border-t-2 border-[#e2e5eb] bg-[#f7f8fa]">
                      <td className="px-4 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Dönem Toplamı</td>
                      <td className="px-4 py-3 text-blue-600 font-black">₺{fmt(tabloToplam.brut)}</td>
                      <td className="px-4 py-3 text-emerald-600 font-black text-sm">₺{fmt(tabloToplam.net)}</td>
                      <td className="px-4 py-3 text-amber-600 font-black">{tabloToplam.paket}</td>
                      <td className="px-4 py-3 text-purple-600 font-black">₺{fmt(tabloToplam.paketOrt)}</td>
                      <td className="px-4 py-3 text-red-600 font-black">-₺{fmt(tabloToplam.giderIade)}</td>
                      <td/>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between py-2">
          <p className="text-[10px] text-gray-700">KEBO ERP · Finansal Yönetim Sistemi</p>
          <p className="text-[10px] text-gray-700">{userEmail}</p>
        </div>
      </div>

      {printRapor && <PrintModal rapor={printRapor} onClose={()=>setPrintRapor(null)}/>}
      {onayModalAcik && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-[#ffffff] border border-[#e2e5eb] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e2e5eb]">
              <p className="text-sm font-black text-[#1a1f2e] flex items-center gap-2"><AlertTriangle size={15} className="text-amber-600"/> Rapor Değişiklik Talepleri</p>
              <button onClick={()=>setOnayModalAcik(false)} className="text-gray-600 hover:text-[#1a1f2e]"><X size={16}/></button>
            </div>
            <div className="flex gap-2 px-5 pt-3">
              <button onClick={()=>setOnayModalTab("bekleyen")}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${onayModalTab==="bekleyen"?"bg-amber-500/15 text-amber-700 border border-amber-500/30":"text-gray-500 hover:text-[#1a1f2e]"}`}>
                Bekleyen ({onayBekleyenler.length})
              </button>
              <button onClick={()=>setOnayModalTab("gecmis")}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${onayModalTab==="gecmis"?"bg-blue-500/15 text-blue-700 border border-blue-500/30":"text-gray-500 hover:text-[#1a1f2e]"}`}>
                Geçmiş ({onayGecmisi.length})
              </button>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto">
              {onayModalTab==="bekleyen" && (
                onayBekleyenler.length===0 ? (
                  <p className="text-xs text-gray-600 text-center py-8">Onay bekleyen değişiklik talebi yok.</p>
                ) : onayBekleyenler.map(talep => {
                  const farklar = talepFarklari(talep.eski_veri, talep.yeni_veri);
                  return (
                    <div key={talep.id} className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-[#1a1f2e]">{fmtTarih(talep.rapor_tarihi)} tarihli rapor</p>
                        <p className="text-[10px] text-gray-500">{talep.talep_eden} · {new Date(talep.talep_tarihi).toLocaleString("tr-TR")}</p>
                      </div>
                      <div className="space-y-1 mb-3">
                        {farklar.length===0 ? (
                          <p className="text-[11px] text-gray-600">Değişiklik tespit edilemedi.</p>
                        ) : farklar.map((f,i)=>(
                          <div key={i} className="flex items-center justify-between text-[11px] bg-black/20 rounded-lg px-2.5 py-1.5">
                            <span className="text-gray-400">{f.alan}</span>
                            <span className="flex items-center gap-1.5">
                              <span className="text-gray-600 line-through">{typeof f.eskiDeger==="number"?`₺${fmt(f.eskiDeger)}`:(f.eskiDeger ? String(f.eskiDeger) : "—")}</span>
                              <span className="text-gray-600">→</span>
                              <span className="text-emerald-600 font-semibold">{typeof f.yeniDeger==="number"?`₺${fmt(f.yeniDeger)}`:(f.yeniDeger ? String(f.yeniDeger) : "—")}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={()=>handleTalepReddet(talep)} disabled={onayIslemId===talep.id}
                          className="flex-1 text-xs font-bold text-red-600 border border-red-500/30 hover:bg-red-500/10 disabled:opacity-40 py-2 rounded-lg transition-colors">
                          Reddet
                        </button>
                        <button onClick={()=>handleTalepOnayla(talep)} disabled={onayIslemId===talep.id}
                          className="flex-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 py-2 rounded-lg transition-colors flex items-center justify-center gap-2">
                          {onayIslemId===talep.id?<Loader2 size={13} className="animate-spin"/>:null} Onayla
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
              {onayModalTab==="gecmis" && (
                onayGecmisi.length===0 ? (
                  <p className="text-xs text-gray-600 text-center py-8">Henüz bir geçmiş kaydı yok.</p>
                ) : onayGecmisi.map(talep => (
                  <div key={talep.id} className={`rounded-xl border p-3 text-[11px] ${talep.durum==="onaylandi"?"border-emerald-500/20 bg-emerald-500/5":"border-red-500/20 bg-red-500/5"}`}>
                    <p className="text-[#1a1f2e] font-semibold mb-1">{fmtTarih(talep.rapor_tarihi)} tarihli rapor</p>
                    <p className="text-gray-400">
                      <span className="font-semibold">{talep.talep_eden}</span> düzenleme yaptı ({new Date(talep.talep_tarihi).toLocaleString("tr-TR")})
                    </p>
                    <p className={talep.durum==="onaylandi"?"text-emerald-600":"text-red-600"}>
                      <span className="font-semibold">{talep.onaylayan}</span> {talep.durum==="onaylandi"?"onayladı":"reddetti"} ({talep.onay_tarihi ? new Date(talep.onay_tarihi).toLocaleString("tr-TR") : "—"})
                    </p>
                    {talep.durum==="reddedildi" && talep.red_sebebi && (
                      <p className="text-gray-500 mt-1">Sebep: {talep.red_sebebi}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
