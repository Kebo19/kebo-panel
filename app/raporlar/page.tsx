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

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";



// ─── TYPES ────────────────────────────────────────────────────────────────────



interface KuryeRaporu {

  id: number; isim: string; nakit: string; pos: string; paketSayisi: string;

  tip?: "sabit" | "havuz" | "kendi"; // sabit = Roadrunner garantili kurye, havuz = garantisiz ek kurye, kendi = 14.08.2026 öncesi kendi personel kurye

}

interface PlatformGiris { tutar: string; paket: string; }

interface SatirRaporu {

  id: number; aciklama: string; tutar: string; tip?: "normal" | "firma" | "personel";

  firmaId?: string; firmaUnvan?: string; personelIsim?: string;

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



const FALLBACK_PERSONELLER = ["Ahmet Yılmaz","Mehmet Kaya","Can Demir","Ali Öztürk","Mustafa Şahin"];

// ── Yetki Sistemi ──
// Tam yetkili: raporları doğrudan düzenleyebilir, onay bekleyen değişiklikleri onaylayabilir/reddedebilir.
const TAM_YETKILILER = ["murat@kebo.com", "bulent@kebo.com"];
// Onaylı düzenleyici: mevcut raporlarda değişiklik yapabilir ama değişiklik önce onaya gider,
// tam yetkili biri onaylamadan rapor güncellenmez.
const ONAYLI_DUZENLEYICILER = ["ayse@kebo.com"];

interface DegisiklikTalebi {
  id: string; rapor_id: string; rapor_tarihi: string;
  talep_eden: string; talep_tarihi: string;
  eski_veri: any; yeni_veri: any;
  durum: "bekliyor" | "onaylandi" | "reddedildi";
  onaylayan?: string | null; onay_tarihi?: string | null; red_sebebi?: string | null;
}



const AYLAR = [

  {value:"01",label:"Ocak"},{value:"02",label:"Şubat"},{value:"03",label:"Mart"},

  {value:"04",label:"Nisan"},{value:"05",label:"Mayıs"},{value:"06",label:"Haziran"},

  {value:"07",label:"Temmuz"},{value:"08",label:"Ağustos"},{value:"09",label:"Eylül"},

  {value:"10",label:"Ekim"},{value:"11",label:"Kasım"},{value:"12",label:"Aralık"},

];



const PLATFORM_COLORS: Record<string,string> = {

  Yemeksepeti:"#FF6B35", Getir:"#8B5CF6", Trendyol:"#F97316", Migros:"#10B981", "Alo Paket":"#3B82F6", "Chick'N Fride":"#EF4444",

};



const VARSAYILAN_GIDER_ONERILERI = [

  "Benzin", "Market", "Temizlik", "Kira", "Elektrik", "Su", "İnternet",

  "Telefon", "Mutfak Malzemesi", "Ambalaj", "Avans", "Tamir", "Kargo",

];



// ─── HELPERS ──────────────────────────────────────────────────────────────────



const tv = (val: string | number): number => {

  if (!val) return 0;

  const s = val.toString().replace(/\./g,"").replace(/,/g,".");

  return parseFloat(s) || 0;

};

const fmt = (val: number): string => new Intl.NumberFormat("tr-TR").format(Math.round(val));

const fmtStr = (val: string): string => {

  const s = tv(val); if (s===0 && val==="") return "";

  return new Intl.NumberFormat("tr-TR").format(s);

};

const fmtTarih = (t: string) => { if(!t) return ""; const [y,m,d]=t.split("-"); return `${d}.${m}.${y}`; };



// ─── BRÜT/NET HESAPLAMA YARDIMCILARI ──────────────────────────────────────────

// Brüt Ciro = toplam_ciro (DB'de online + kasa + gider olarak kaydedilir)

// Geriye uyumluluk: eski raporlarda gider brüte dahil değilse de bu fonksiyon doğru sonuç verir.

const brutHesapla = (r: GunlukRapor): number => {

  const tO = (r.os_yemeksepeti||0)+(r.os_getir||0)+(r.os_trendyol||0)+(r.os_migros||0)+(r.os_chicknfride||0);

  const tKasa = (r.kasa_nakit||0)+(r.kasa_pos||0)+(r.kasa_edenred||0)+(r.kasa_metropol||0);

  const gider = r.gunluk_gider||0;

  // Yeni mantık: brüt = online + kasa + gider (gider kasadan çıktığı için brüte dahil)

  return tO + tKasa + gider;

};

const netHesapla = (r: GunlukRapor): number => {

  // Net = Brüt - Gider - İade = (online + kasa + gider) - gider - iade = online + kasa - iade

  const tO = (r.os_yemeksepeti||0)+(r.os_getir||0)+(r.os_trendyol||0)+(r.os_migros||0)+(r.os_chicknfride||0);

  const tKasa = (r.kasa_nakit||0)+(r.kasa_pos||0)+(r.kasa_edenred||0)+(r.kasa_metropol||0);

  return tO + tKasa - (r.iade_tutar||0);

};



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

    const bugun = new Date(); bugun.setHours(0,0,0,0);

    const [y,m,d] = enSonRaporTarihi.split("-").map(Number);

    const son = new Date(y,m-1,d);

    const list: string[] = [];

    const cur = new Date(son); cur.setDate(cur.getDate()+1);

    while (cur < bugun) {

      list.push(`${String(cur.getDate()).padStart(2,"0")}.${String(cur.getMonth()+1).padStart(2,"0")}.${cur.getFullYear()}`);

      cur.setDate(cur.getDate()+1);

    }

    setEksik(list);

  }, [enSonRaporTarihi]);

  if (eksik.length===0) return null;

  return (

    <div className="relative overflow-hidden rounded-2xl border border-red-500/20 bg-[#130a0a] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">

      <div className="absolute inset-0 bg-gradient-to-r from-red-950/30 to-transparent pointer-events-none"/>

      <div className="relative flex items-start gap-3">

        <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 shrink-0">

          <Bell className="h-4 w-4 text-red-400 animate-pulse"/>

        </div>

        <div>

          <p className="text-xs font-bold text-red-400 uppercase tracking-widest">{eksik.length} Günlük Rapor Eksik</p>

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

  const chartRef = useRef<HTMLCanvasElement>(null);

  const chartInstance = useRef<any>(null);



  const sorted = useMemo(()=>[...raporlar].sort((a,b)=>a.tarih.localeCompare(b.tarih)), [raporlar]);



  const platformData = useMemo(()=>{

    const t={Yemeksepeti:0,Getir:0,Trendyol:0,Migros:0,"Alo Paket":0,"Chick'N Fride":0};

    raporlar.forEach(r=>{

      t.Yemeksepeti+=(r.os_yemeksepeti||0)+(r.ko_yemeksepeti||0);

      t.Getir+=(r.os_getir||0)+(r.ko_getir||0);

      t.Trendyol+=(r.os_trendyol||0)+(r.ko_trendyol||0);

      t.Migros+=(r.os_migros||0)+(r.ko_migros||0);

      t["Alo Paket"]+=(r.ko_alo_paket||0);

    });

    return Object.entries(t).map(([label,value])=>({label,value,color:PLATFORM_COLORS[label]}));

  },[raporlar]);



  const totalPlatform = platformData.reduce((s,d)=>s+d.value,0);

  const trendValues = sorted.slice(-14).map(r => brutHesapla(r));

  const netTrend    = sorted.slice(-14).map(r => netHesapla(r));

  const gunlukOrt   = raporlar.length>0 ? Math.round(raporlar.reduce((s,r)=>s+brutHesapla(r),0)/raporlar.length) : 0;

  const enYuksek    = raporlar.reduce((b,r)=>brutHesapla(r)>brutHesapla(b)?r:b, raporlar[0]);

  const toplamPaket = raporlar.reduce((s,r)=>s+(r.kurye_raporlari?.reduce((ks,k)=>ks+(parseInt(k.paketSayisi)||0),0)||0),0);



  // Trend bug fix: her rapor değişiminde chart'ı yeniden çiz

  const chartKey = useMemo(

    () => sorted.map(r => `${r.id}:${r.toplam_ciro}:${r.gunluk_gider}:${r.iade_tutar}`).join(","),

    [sorted]

  );



  useEffect(()=>{

    if (!acik || !chartRef.current || sorted.length===0) return;



    // Önceki chart'ı her durumda yok et (rapor düzenleme bug fix)

    if (chartInstance.current) {

      chartInstance.current.destroy();

      chartInstance.current = null;

    }



    const loadChart = async () => {

      // @ts-ignore

      if (!window.Chart) {

        await new Promise<void>(resolve=>{

          const s = document.createElement("script");

          s.src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";

          s.onload=()=>resolve(); document.head.appendChild(s);

        });

      }

      if (!chartRef.current) return;

      if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current=null; }



      const labels = sorted.map(r=>fmtTarih(r.tarih).substring(0,5));

      const brut = sorted.map(r => brutHesapla(r));

      const net  = sorted.map(r => netHesapla(r));



      // @ts-ignore

      chartInstance.current = new window.Chart(chartRef.current, {

        type:"bar",

        data:{

          labels,

          datasets:[

            {

              label:"Brüt Ciro",

              data:brut,

              backgroundColor:brut.map(v=>v===0?"rgba(239,68,68,0.15)":"rgba(59,130,246,0.5)"),

              borderColor:brut.map(v=>v===0?"#EF4444":"#3B82F6"),

              borderWidth:1, borderRadius:4, order:2

            },

            {

              label:"Net Ciro",

              data:net, type:"line",

              borderColor:"#10B981", borderWidth:2,

              borderDash:[5,3], pointRadius:net.map(v=>v>0?3:0),

              pointBackgroundColor:"#10B981", fill:false, tension:0.3, order:1

            }

          ]

        },

        options:{

          responsive:true, maintainAspectRatio:false,

          plugins:{

            legend:{display:false},

            tooltip:{

              backgroundColor:"#0f1623", borderColor:"#1e2a3a", borderWidth:1,

              titleColor:"#94a3b8", bodyColor:"#e2e8f0",

              callbacks:{label:(ctx:any)=>ctx.parsed.y===0?`${ctx.dataset.label}: Rapor yok`:`${ctx.dataset.label}: ₺${fmt(ctx.parsed.y)}`}

            }

          },

          scales:{

            x:{ticks:{color:"#4b5563",font:{size:10},maxRotation:45,autoSkip:true,maxTicksLimit:12},grid:{color:"rgba(255,255,255,0.03)"}},

            y:{ticks:{color:"#4b5563",font:{size:10},callback:(v:number)=>`₺${(v/1000).toFixed(0)}K`},grid:{color:"rgba(255,255,255,0.04)"}}

          }

        }

      });

    };

    loadChart();

    return ()=>{ if(chartInstance.current){chartInstance.current.destroy();chartInstance.current=null;} };

  // eslint-disable-next-line react-hooks/exhaustive-deps

  },[acik, chartKey]);



  if (raporlar.length===0) return null;



  return (

    <div className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] overflow-hidden shadow-2xl">

      <button onClick={()=>setAcik(!acik)}

        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors">

        <div className="flex items-center gap-3">

          <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">

            <Activity className="h-3.5 w-3.5 text-blue-400"/>

          </div>

          <span className="text-sm font-semibold text-gray-200 tracking-tight">Dönem Analizi</span>

          <span className="text-[10px] text-gray-600 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">{raporlar.length} gün</span>

        </div>

        {acik ? <ChevronUp className="h-4 w-4 text-gray-600"/> : <ChevronDown className="h-4 w-4 text-gray-600"/>}

      </button>



      {acik && (

        <div className="border-t border-[#1a2236] p-5 space-y-5">

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

            {[

              {label:"Günlük Ort. Brüt", value:`₺${fmt(gunlukOrt)}`, sub:"brüt ciro", spark:trendValues, color:"#60A5FA"},

              {label:"Günlük Ort. Net",  value:`₺${fmt(netTrend.reduce((s,v)=>s+v,0)/Math.max(netTrend.length,1))}`, sub:"net ciro", spark:netTrend, color:"#34D399"},

              {label:"En Yüksek Gün",    value:`₺${fmt(enYuksek?brutHesapla(enYuksek):0)}`, sub:enYuksek?fmtTarih(enYuksek.tarih):"—", spark:null, color:"#FBBF24"},

              {label:"Toplam Paket",     value:fmt(toplamPaket), sub:"adet dağıtım", spark:null, color:"#A78BFA"},

            ].map(card=>(

              <div key={card.label} className="bg-[#080b14] rounded-xl border border-[#1a2236] p-4 hover:border-[#243050] transition-colors">

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

            <div className="xl:col-span-2 bg-[#080b14] rounded-xl border border-[#1a2236] p-4">

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

                          <span className="text-[11px] text-gray-400">{d.label}</span>

                        </div>

                        <div className="flex items-center gap-2">

                          <span className="text-[11px] font-bold text-white">₺{fmt(d.value)}</span>

                          <span className="text-[10px] text-gray-600 w-7 text-right">{Math.round(pct)}%</span>

                        </div>

                      </div>

                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">

                        <div className="h-full rounded-full transition-all duration-700"

                          style={{width:`${pct}%`, backgroundColor:d.color, opacity:0.7}}/>

                      </div>

                    </div>

                  );

                })}

              </div>

            </div>



            <div className="xl:col-span-3 bg-[#080b14] rounded-xl border border-[#1a2236] p-4">

              <div className="flex items-center justify-between mb-3">

                <p className="text-[10px] text-gray-600 uppercase tracking-widest font-medium flex items-center gap-1.5">

                  <BarChart3 className="h-3 w-3"/> Günlük Ciro Trendi

                </p>

                <div className="flex items-center gap-3 text-[10px] text-gray-600">

                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500/60 inline-block"/>Brüt</span>

                  <span className="flex items-center gap-1"><span className="w-4 border-t-2 border-dashed border-emerald-500/60 inline-block"/>Net</span>

                </div>

              </div>

              <div className="relative" style={{height:"160px"}}>

                <canvas ref={chartRef} role="img" aria-label="Günlük brüt ve net ciro grafiği"/>

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

  const tO=(rapor.os_yemeksepeti||0)+(rapor.os_getir||0)+(rapor.os_trendyol||0)+(rapor.os_migros||0)+(rapor.os_chicknfride||0);

  const tK=(rapor.ko_yemeksepeti||0)+(rapor.ko_getir||0)+(rapor.ko_trendyol||0)+(rapor.ko_migros||0)+(rapor.ko_alo_paket||0)+(rapor.ko_chicknfride||0);

  const tKasa=(rapor.kasa_nakit||0)+(rapor.kasa_pos||0)+(rapor.kasa_edenred||0)+(rapor.kasa_metropol||0);

  // Yeni (Kebo/Chick'N Fride marka bazlı) yapıyla girilmiş mi? — eski raporlarda bu alanlar 0/undefined olur.
  const yeniYapiVarMi = !!((rapor.os_kebo_ys||rapor.os_kebo_trendyol||rapor.os_kebo_migros||rapor.os_cnf_ys||rapor.os_cnf_trendyol||rapor.os_cnf_migros_yemek||
    rapor.ko_kebo_ys||rapor.ko_kebo_trendyol||rapor.ko_kebo_migros_yemek||rapor.ko_cnf_ys||rapor.ko_cnf_trendyol||rapor.ko_cnf_migros_yemek));

  const tIndirimPT = (rapor.os_kebo_ys_indirim||0)+(rapor.os_cnf_ys_indirim||0)+(rapor.ko_kebo_ys_indirim||0)+(rapor.ko_cnf_ys_indirim||0);
  const tIndirimTY = (rapor.os_kebo_trendyol_indirim||0)+(rapor.os_cnf_trendyol_indirim||0)+(rapor.ko_kebo_trendyol_indirim||0)+(rapor.ko_cnf_trendyol_indirim||0);

  const brutCiro = brutHesapla(rapor);

  const net = netHesapla(rapor);

  const toplamPaket=rapor.kurye_raporlari?.reduce((s,k)=>s+(parseInt(k.paketSayisi)||0),0)||0;



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

            {rapor.os_yemeksepeti>0&&<div className="row"><span>Yemeksepeti</span><span>₺{fmt(rapor.os_yemeksepeti)}</span></div>}

            {rapor.os_getir>0&&<div className="row"><span>Getir</span><span>₺{fmt(rapor.os_getir)}</span></div>}

            {rapor.os_trendyol>0&&<div className="row"><span>Trendyol</span><span>₺{fmt(rapor.os_trendyol)}</span></div>}

            {rapor.os_migros>0&&<div className="row"><span>Migros</span><span>₺{fmt(rapor.os_migros)}</span></div>}

            {rapor.os_chicknfride>0&&<div className="row"><span>Chick'N Fride</span><span>₺{fmt(rapor.os_chicknfride)}</span></div>}

            <div className="row bold"><span>Online Toplam</span><span>₺{fmt(tO)}</span></div>

            <hr className="divider"/>

            <div className="section-title">Kapıda Ödeme (Bilgi)</div>

            {rapor.ko_yemeksepeti>0&&<div className="row"><span>YS Kapıda</span><span>₺{fmt(rapor.ko_yemeksepeti)}</span></div>}

            {rapor.ko_getir>0&&<div className="row"><span>Getir Kapıda</span><span>₺{fmt(rapor.ko_getir)}</span></div>}

            {rapor.ko_trendyol>0&&<div className="row"><span>Trendyol Kapıda</span><span>₺{fmt(rapor.ko_trendyol)}</span></div>}

            {rapor.ko_migros>0&&<div className="row"><span>Migros Kapıda</span><span>₺{fmt(rapor.ko_migros)}</span></div>}

            {rapor.ko_alo_paket>0&&<div className="row"><span>Alo Paket</span><span>₺{fmt(rapor.ko_alo_paket)}</span></div>}

            {rapor.ko_chicknfride>0&&<div className="row"><span>Chick'N Fride Kapıda</span><span>₺{fmt(rapor.ko_chicknfride)}</span></div>}

            <div className="row"><span style={{color:"#888",fontSize:"10px"}}>↳ Kapıda tahsilatlar fiziki kasaya dahil</span><span>₺{fmt(tK)}</span></div>

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
                <div className="section-title">Marka Detayı (Kebo / Chick'N Fride)</div>
                <div className="row"><span style={{fontWeight:700}}>Kebo</span><span></span></div>
                {(rapor.os_kebo_ys||rapor.ko_kebo_ys)>0&&<div className="row"><span>· Yemeksepeti ({(rapor.os_kebo_ys_paket||0)+(rapor.ko_kebo_ys_paket||0)} pkt)</span><span>₺{fmt((rapor.os_kebo_ys||0)+(rapor.ko_kebo_ys||0))}</span></div>}
                {(rapor.os_kebo_trendyol||rapor.ko_kebo_trendyol)>0&&<div className="row"><span>· Trendyol ({(rapor.os_kebo_trendyol_paket||0)+(rapor.ko_kebo_trendyol_paket||0)} pkt)</span><span>₺{fmt((rapor.os_kebo_trendyol||0)+(rapor.ko_kebo_trendyol||0))}</span></div>}
                {(rapor.os_kebo_migros||rapor.ko_kebo_migros_yemek)>0&&<div className="row"><span>· Migros ({(rapor.os_kebo_migros_paket||0)+(rapor.ko_kebo_migros_yemek_paket||0)} pkt)</span><span>₺{fmt((rapor.os_kebo_migros||0)+(rapor.ko_kebo_migros_yemek||0))}</span></div>}
                {rapor.ko_kebo_alo>0&&<div className="row"><span>· Alo Paket ({rapor.ko_kebo_alo_paket||0} pkt)</span><span>₺{fmt(rapor.ko_kebo_alo)}</span></div>}
                <div className="row"><span style={{fontWeight:700,marginTop:"4px"}}>Chick'N Fride</span><span></span></div>
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

            {rapor.gunluk_gider>0&&<div className="row"><span>(+) Giderler (brüte dahil)</span><span>₺{fmt(rapor.gunluk_gider)}</span></div>}

            <div className="row bold" style={{fontSize:"13px"}}><span>BRÜT CİRO</span><span>₺{fmt(brutCiro)}</span></div>

            {rapor.gunluk_gider>0&&<div className="row"><span>(-) Giderler</span><span>-₺{fmt(rapor.gunluk_gider)}</span></div>}

            {rapor.iade_tutar>0&&<div className="row"><span>(-) İadeler</span><span>-₺{fmt(rapor.iade_tutar)}</span></div>}

            <div className="row net"><span>✦ NET CİRO</span><span>₺{fmt(net)}</span></div>

            {rapor.kurye_raporlari && rapor.kurye_raporlari.length>0&&<>

              <hr className="divider"/>

              <div className="section-title">Kurye Mutabakatı ({toplamPaket} Paket)</div>

              {rapor.kurye_raporlari.map((k,i)=>(

                <div key={i} className="row">

                  <span>{k.isim||"—"} · {k.paketSayisi} pkt</span>

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

  const headers = ["Tarih","Brüt Ciro","Net Ciro","Online Toplam","Kapıda Toplam","Kasa Toplam","Gider","İade","Toplam Paket","Raporu Giren"];

  const rows = raporlar.map(r=>{

    const tO=(r.os_yemeksepeti||0)+(r.os_getir||0)+(r.os_trendyol||0)+(r.os_migros||0)+(r.os_chicknfride||0);

    const tKasa=(r.kasa_nakit||0)+(r.kasa_pos||0)+(r.kasa_edenred||0);

    const tK=(r.ko_yemeksepeti||0)+(r.ko_getir||0)+(r.ko_trendyol||0)+(r.ko_migros||0)+(r.ko_alo_paket||0)+(r.ko_chicknfride||0);

    const brutCiro = brutHesapla(r);

    const net = netHesapla(r);

    const paket=r.kurye_raporlari?.reduce((s,k)=>s+(parseInt(k.paketSayisi)||0),0)||0;

    return [fmtTarih(r.tarih),brutCiro,net,tO,tK,tKasa,r.gunluk_gider||0,r.iade_tutar||0,paket,r.ekleyen_kullanici].join(",");

  });

  const csv = [headers.join(","), ...rows].join("\n");

  const blob = new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a"); a.href=url;

  a.download=`KEBO_Rapor_${ayLabel}_${yil}.csv`; a.click();

  URL.revokeObjectURL(url);

}



// ─── PDF EXPORT ───────────────────────────────────────────────────────────────



function exportPDF(raporlar: GunlukRapor[], ay: string, yil: string) {

  const ayLabel = ["","Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"][parseInt(ay)];

  const rows = raporlar.map(r=>{

    const tO=(r.os_yemeksepeti||0)+(r.os_getir||0)+(r.os_trendyol||0)+(r.os_migros||0)+(r.os_chicknfride||0);

    const brutCiro = brutHesapla(r);

    const net = netHesapla(r);

    const paket=r.kurye_raporlari?.reduce((s,k)=>s+(parseInt(k.paketSayisi)||0),0)||0;

    return `<tr><td>${fmtTarih(r.tarih)}</td><td>₺${fmt(brutCiro)}</td><td style="color:#16a34a;font-weight:700">₺${fmt(net)}</td>

      <td>₺${fmt(tO)}</td><td style="color:#dc2626">-₺${fmt((r.gunluk_gider||0)+(r.iade_tutar||0))}</td><td>${paket}</td><td>${r.ekleyen_kullanici}</td></tr>`;

  }).join("");

  const toplam = raporlar.reduce((s,r)=>s+brutHesapla(r),0);

  const toplamNet = raporlar.reduce((s,r)=>s+netHesapla(r),0);

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

  <table><thead><tr><th>Tarih</th><th>Brüt Ciro</th><th>Net Ciro</th><th>Online Toplam</th><th>Gider+İade</th><th>Paket</th><th>Giren</th></tr></thead>

  <tbody>${rows}</tbody>

  <tfoot><tr><td>DÖNEM TOPLAMI</td><td>₺${fmt(toplam)}</td><td>₺${fmt(toplamNet)}</td><td>—</td><td>—</td><td>—</td><td></td></tr></tfoot>

  </table>

  <div class="footer">KEBO ERP Finansal Yönetim Sistemi · Gizli ve Yetkili Kullanım İçindir</div>

  </body></html>`);

  w.document.close(); w.focus(); setTimeout(()=>{w.print();w.close();},500);

}



// ─── CURRENCY INPUT ───────────────────────────────────────────────────────────



function CurrencyInput({label, value, onChange, disabled=false, accent="gray"}:

  {label:string, value:string, onChange:(v:string)=>void, disabled?:boolean, accent?:string}) {

  return (

    <div className="group">

      <label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">{label}</label>

      <div className="relative">

        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-xs font-medium">₺</span>

        <input

          type="text" value={value} disabled={disabled}

          onChange={e=>onChange(fmtStr(e.target.value))}

          className="w-full bg-[#080b14] border border-[#1a2236] hover:border-[#243050] focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 text-white text-sm font-bold h-9 pl-7 pr-3 rounded-xl outline-none transition-all disabled:opacity-40 disabled:cursor-not-allowed placeholder:text-gray-700"

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
const ROADRUNNER_GECIS_GUNU = "2026-08-13";
const ROADRUNNER_TAM_BASLANGIC = "2026-08-14";

function kuryeYapisiHesapla(tarihStr: string): KuryeRaporu[] {
  if (!tarihStr || tarihStr < ROADRUNNER_GECIS_GUNU) {
    return [{id:Date.now(),isim:"",nakit:"",pos:"",paketSayisi:"",tip:"kendi"}];
  }
  if (tarihStr === ROADRUNNER_GECIS_GUNU) {
    return [
      {id:Date.now(),isim:"",nakit:"",pos:"",paketSayisi:"",tip:"kendi"},
      {id:Date.now()+1,isim:"Havuz Kurye",nakit:"",pos:"",paketSayisi:"",tip:"havuz"},
    ];
  }
  return [
    {id:1,isim:"Kurye 1",nakit:"",pos:"",paketSayisi:"",tip:"sabit"},
    {id:2,isim:"Kurye 2",nakit:"",pos:"",paketSayisi:"",tip:"sabit"},
    {id:3,isim:"Havuz Kurye",nakit:"",pos:"",paketSayisi:"",tip:"havuz"},
  ];
}

// ─── PLATFORM SATIRI (tutar + paket sayısı + opsiyonel indirim) ───────────────

function PlatformSatir({label, value, onChange, indirim, onIndirimChange, disabled=false}:
  {label:string, value:PlatformGiris, onChange:(v:PlatformGiris)=>void,
   indirim?:string, onIndirimChange?:(v:string)=>void, disabled?:boolean}) {
  return (
    <div className="rounded-lg border border-[#1a2236] bg-[#080b14] p-2">
      <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold mb-1.5">{label}</p>
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600 text-[11px] font-medium">₺</span>
          <input type="text" value={value.tutar} disabled={disabled}
            onChange={e=>onChange({...value, tutar: fmtStr(e.target.value)})}
            placeholder="0"
            className="w-full bg-[#0c0f1a] border border-[#1a2236] hover:border-[#243050] focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 text-white text-xs font-bold h-8 pl-6 pr-2 rounded-lg outline-none transition-all disabled:opacity-40 disabled:cursor-not-allowed placeholder:text-gray-700"/>
        </div>
        <div className="relative w-[64px] shrink-0">
          <Package size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-600"/>
          <input type="number" value={value.paket} disabled={disabled}
            onChange={e=>onChange({...value, paket: e.target.value})}
            placeholder="0"
            title="Paket sayısı"
            className="w-full bg-[#0c0f1a] border border-[#1a2236] hover:border-[#243050] focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 text-amber-300 text-xs font-bold h-8 pl-6 pr-1.5 rounded-lg outline-none transition-all disabled:opacity-40 disabled:cursor-not-allowed placeholder:text-gray-700"/>
        </div>
      </div>
      {onIndirimChange && (
        <div className="relative mt-1.5">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-red-500/70 text-[10px] font-medium">-₺</span>
          <input type="text" value={indirim||""} disabled={disabled}
            onChange={e=>onIndirimChange(fmtStr(e.target.value))}
            placeholder="İndirim"
            className="w-full bg-[#0c0f1a] border border-red-500/10 hover:border-red-500/25 focus:border-red-500/40 focus:ring-1 focus:ring-red-500/15 text-red-300 text-[11px] font-semibold h-7 pl-6 pr-2 rounded-lg outline-none transition-all disabled:opacity-40 disabled:cursor-not-allowed placeholder:text-gray-700"/>
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

        className="w-full bg-[#080b14] border border-[#1a2236] hover:border-[#243050] focus:border-blue-500/40 text-white text-xs h-7 px-2.5 rounded-lg outline-none transition-all disabled:opacity-40 placeholder:text-gray-700"

      />

      {acik && !disabled && filtreli.length > 0 && (

        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[#0d1120] border border-[#1a2236] rounded-xl shadow-2xl overflow-hidden">

          {filtreli.map((o, i) => (

            <button

              key={i}

              type="button"

              onMouseDown={() => { onChange(o); setAcik(false); setArama(""); }}

              className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-blue-500/10 hover:text-white transition-colors flex items-center gap-2"

            >

              <Sparkles size={9} className="text-blue-500/50 shrink-0"/>

              {o}

            </button>

          ))}

          <div className="border-t border-[#1a2236] px-3 py-1 text-[10px] text-gray-700">

            Diğer: istediğinizi yazabilirsiniz

          </div>

        </div>

      )}

    </div>

  );

}



// ─── MAIN PAGE ────────────────────────────────────────────────────────────────



export default function RaporlarPage() {

  const supabase = createClient();



  // ── Auth & Data ──

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);

  const [isOnayliDuzenleyici, setIsOnayliDuzenleyici] = useState(false);

  const [userEmail, setUserEmail] = useState("");

  const [onayBekleyenler, setOnayBekleyenler] = useState<DegisiklikTalebi[]>([]);

  const [onayGecmisi, setOnayGecmisi] = useState<DegisiklikTalebi[]>([]);

  const [onayModalAcik, setOnayModalAcik] = useState(false);

  const [onayModalTab, setOnayModalTab] = useState<"bekleyen"|"gecmis">("bekleyen");

  const [onayIslemId, setOnayIslemId] = useState<string|null>(null);

  const [raporlar, setRaporlar] = useState<GunlukRapor[]>([]);

  const [enSonRaporTarihi, setEnSonRaporTarihi] = useState<string|null>(null);

  const [mevcutTarihler, setMevcutTarihler] = useState<Set<string>>(new Set());

  const [personelListesi, setPersonelListesi] = useState<string[]>(FALLBACK_PERSONELLER);

  const [cariListesi, setCariListesi] = useState<Cari[]>([]);

  const [secilenAy, setSecilenAy] = useState(()=>String(new Date().getMonth()+1).padStart(2,"0"));

  const [secilenYil, setSecilenYil] = useState(()=>String(new Date().getFullYear()));



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

  const [giderler, setGiderler] = useState<SatirRaporu[]>([{id:Date.now(),aciklama:"",tutar:"",tip:"normal"}]);

  const [iadeler, setIadeler] = useState<SatirRaporu[]>([{id:Date.now(),aciklama:"",tutar:""}]); // İptal-İade Fişleri

  const [kuryeler, setKuryeler] = useState<KuryeRaporu[]>([
    {id:1,isim:"Kurye 1",nakit:"",pos:"",paketSayisi:"",tip:"sabit"},
    {id:2,isim:"Kurye 2",nakit:"",pos:"",paketSayisi:"",tip:"sabit"},
    {id:3,isim:"Havuz Kurye",nakit:"",pos:"",paketSayisi:"",tip:"havuz"},
  ]);

  const [notlar, setNotlar] = useState("");

  // Personel Avans / Yemek Kesintisi hızlı giriş (Giderler bölümünden) — tüm aktif personeli listeler
  const [avansPersonelListesi, setAvansPersonelListesi] = useState<string[]>([]);
  // Not: Personel Avans artık ayrı bir state değil — Giderler listesinde tip:"personel" olan satırlar bu işi görüyor.
  const [kesintiSatirlari, setKesintiSatirlari] = useState<{id:number; personelIsim:string; tutar:string; aciklama:string}[]>([]);

  // ── Fişten Doldur (AI tarama) ──
  const [taramaYukleniyor, setTaramaYukleniyor] = useState(false);
  const [taramaHata, setTaramaHata] = useState("");
  const [taramaBelirsizAlanlar, setTaramaBelirsizAlanlar] = useState<string[]>([]);
  const dosyaInputRef = useRef<HTMLInputElement>(null);



  // ── Data Fetch ──

  const veriCek = useCallback(async () => {

    setLoading(true);

    const {data:{user}} = await supabase.auth.getUser();

    const mail = user?.email||""; setUserEmail(mail);

    const mailAdmin = TAM_YETKILILER.includes(mail);

    setIsAdmin(mailAdmin);

    setIsOnayliDuzenleyici(ONAYLI_DUZENLEYICILER.includes(mail));

    if (mailAdmin) {

      const { data: talepler } = await supabase.from("rapor_degisiklik_talepleri")

        .select("*").order("talep_tarihi", { ascending: false });

      if (talepler) {

        setOnayBekleyenler((talepler as DegisiklikTalebi[]).filter(t => t.durum === "bekliyor"));

        setOnayGecmisi((talepler as DegisiklikTalebi[]).filter(t => t.durum !== "bekliyor"));

      }

    }



    const {data:sonRapor} = await supabase.from("gunluk_raporlar").select("tarih").order("tarih",{ascending:false}).limit(1);

    setEnSonRaporTarihi(sonRapor?.[0]?.tarih??null);



    const {data:tumTarihler} = await supabase.from("gunluk_raporlar").select("tarih");

    setMevcutTarihler(new Set((tumTarihler||[]).map((r:any)=>r.tarih)));



    const {data:personelData} = await supabase.from("personeller").select("isim").eq("durum","aktif").eq("departman","Kurye").order("isim");

    if (personelData?.length) setPersonelListesi(personelData.map((p:any)=>p.isim));

    // Avans/Kesinti hızlı girişi için tüm aktif personel (departman farketmeksizin)
    const {data:tumPersonelData} = await supabase.from("personeller").select("isim").eq("durum","aktif").order("isim");

    if (tumPersonelData?.length) setAvansPersonelListesi(tumPersonelData.map((p:any)=>p.isim));



    const {data:cariData} = await supabase.from("cariler").select("id, unvan, cari_kodu").order("unvan");

    if (cariData?.length) setCariListesi(cariData as Cari[]);



    const ayNum=parseInt(secilenAy), yilNum=parseInt(secilenYil);

    const ayinSonGunu = new Date(yilNum, ayNum, 0).getDate();

    const {data,error} = await supabase.from("gunluk_raporlar").select("*")

      .gte("tarih", `${secilenYil}-${secilenAy}-01`)

      .lte("tarih", `${secilenYil}-${secilenAy}-${String(ayinSonGunu).padStart(2,"0")}`)

      .order("tarih",{ascending:false});

    if (!error&&data) {

      const rList = data as GunlukRapor[];

      setRaporlar(rList);

      const gecmisGiderler = new Set<string>(VARSAYILAN_GIDER_ONERILERI);

      rList.forEach(r => {

        if (r.gider_aciklama) {

          const sade = r.gider_aciklama.split(" || NOT:")[0];

          sade.split(" | ").forEach(g => {

            const kolonIdx = g.lastIndexOf(": ₺");

            const aciklama = kolonIdx > -1 ? g.substring(0, kolonIdx).trim() : g.trim();

            if (aciklama && aciklama !== "Belirtilmemiş" && !aciklama.startsWith("NOT:") && !aciklama.startsWith("[Firma]")) {

              gecmisGiderler.add(aciklama);

            }

          });

        }

      });

      setGiderOnerileri([...gecmisGiderler]);

    }

    setLoading(false);

  }, [secilenAy, secilenYil]);



  useEffect(()=>{veriCek();},[veriCek]);



  // ── Helpers ──

  const siradakiTarih = (): string|null => {

    if (!enSonRaporTarihi) return null;

    const [y,m,d]=enSonRaporTarihi.split("-").map(Number);

    const dt=new Date(y,m-1,d); dt.setDate(dt.getDate()+1);

    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;

  };



  const handleTarihChange = (val: string) => {

    setTarih(val); setAdminOnayliGecis(false); setDuplikaTarihHata(false);

    // Yeni rapor eklerken (düzenleme değil) seçilen tarihe göre doğru kurye yapısını (kendi/geçiş/Roadrunner) otomatik kur.
    if (!selectedRapor) setKuryeler(kuryeYapisiHesapla(val));

    if (!val||selectedRapor||!enSonRaporTarihi) { setTarihHataVarMi(false); return; }

    if (mevcutTarihler.has(val)) { setDuplikaTarihHata(true); setTarihHataVarMi(false); return; }

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

    setGiderler([{id:Date.now(),aciklama:"",tutar:"",tip:"normal"}]);

    setIadeler([{id:Date.now(),aciklama:"",tutar:""}]);

    setKesintiSatirlari([]);

    setTarih("");setTarihHataVarMi(false);setAdminOnayliGecis(false);setDuplikaTarihHata(false);

    setKuryeler([
      {id:1,isim:"Kurye 1",nakit:"",pos:"",paketSayisi:"",tip:"sabit"},
      {id:2,isim:"Kurye 2",nakit:"",pos:"",paketSayisi:"",tip:"sabit"},
      {id:3,isim:"Havuz Kurye",nakit:"",pos:"",paketSayisi:"",tip:"havuz"},
    ]);

    setNotlar("");setSelectedRapor(null);setIsEditMode(false);

  };



  // ── Rapor Sil ──

  const handleRaporSil = async (rapor: GunlukRapor) => {

    if (!confirm(`${fmtTarih(rapor.tarih)} tarihli raporu ve ilgili platform kayıtlarını silmek istiyor musunuz?`)) return;

    await supabase.from("platform_tahsilatlar").delete().eq("satis_tarihi", rapor.tarih).eq("durum", "bekliyor");

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

      const { error: guncelleError } = await supabase.from("gunluk_raporlar")

        .update(talep.yeni_veri).eq("id", talep.rapor_id);

      if (guncelleError) { alert("Rapor güncellenirken hata: " + guncelleError.message); return; }

      const { error: talepError } = await supabase.from("rapor_degisiklik_talepleri")

        .update({ durum: "onaylandi", onaylayan: userEmail, onay_tarihi: new Date().toISOString() })

        .eq("id", talep.id);

      if (talepError) { alert("Talep güncellenirken hata: " + talepError.message); return; }

      veriCek();

    } finally {

      setOnayIslemId(null);

    }

  };



  const handleTalepReddet = async (talep: DegisiklikTalebi) => {

    if (!isAdmin) return;

    const sebep = prompt("Reddetme sebebi (opsiyonel):") || "";

    if (!confirm(`${fmtTarih(talep.rapor_tarihi)} tarihli değişiklik talebini reddetmek istediğinize emin misiniz?`)) return;

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

  const talepFarklari = (eski: any, yeni: any) => {

    const ALAN_ETIKET: Record<string,string> = {

      os_yemeksepeti:"Yemeksepeti (Online)", os_getir:"Getir (Online)", os_trendyol:"Trendyol (Online)",

      os_migros:"Migros (Online)", os_chicknfride:"Chick'N Fride (Online)",

      ko_yemeksepeti:"Yemeksepeti (Kapıda)", ko_getir:"Getir (Kapıda)", ko_trendyol:"Trendyol (Kapıda)",

      ko_migros:"Migros (Kapıda)", ko_alo_paket:"Alo Paket", ko_chicknfride:"Chick'N Fride (Kapıda)",

      kasa_nakit:"Kasa Nakit", kasa_pos:"Kasa POS", kasa_edenred:"Kasa Edenred",

      gunluk_gider:"Günlük Gider", iade_tutar:"İade Tutarı", toplam_ciro:"Toplam Ciro",

      gider_aciklama:"Gider Açıklaması", iade_aciklama:"İade Açıklaması",

    };

    const farklar: { alan:string; eskiDeger:any; yeniDeger:any }[] = [];

    Object.keys(ALAN_ETIKET).forEach(k => {

      const eskiVal = eski?.[k]; const yeniVal = yeni?.[k];

      if (JSON.stringify(eskiVal) !== JSON.stringify(yeniVal)) {

        farklar.push({ alan: ALAN_ETIKET[k], eskiDeger: eskiVal, yeniDeger: yeniVal });

      }

    });

    return farklar;

  };



  const raporuFormaYukle = (r: GunlukRapor) => {

    setTarih(r.tarih); setTarihHataVarMi(false); setAdminOnayliGecis(false); setDuplikaTarihHata(false);

    setOsKeboYs({tutar:fmt(r.os_kebo_ys), paket:String(r.os_kebo_ys_paket||"")}); setOsKeboYsIndirim(fmt(r.os_kebo_ys_indirim));
    setOsKeboTrendyol({tutar:fmt(r.os_kebo_trendyol), paket:String(r.os_kebo_trendyol_paket||"")}); setOsKeboTrendyolIndirim(fmt(r.os_kebo_trendyol_indirim));
    setOsKeboMigros({tutar:fmt(r.os_kebo_migros), paket:String(r.os_kebo_migros_paket||"")});

    setOsCnfYs({tutar:fmt(r.os_cnf_ys), paket:String(r.os_cnf_ys_paket||"")}); setOsCnfYsIndirim(fmt(r.os_cnf_ys_indirim));
    setOsCnfTrendyol({tutar:fmt(r.os_cnf_trendyol), paket:String(r.os_cnf_trendyol_paket||"")}); setOsCnfTrendyolIndirim(fmt(r.os_cnf_trendyol_indirim));
    setOsCnfMigrosYemek({tutar:fmt(r.os_cnf_migros_yemek), paket:String(r.os_cnf_migros_yemek_paket||"")});

    setKoKeboYs({tutar:fmt(r.ko_kebo_ys), paket:String(r.ko_kebo_ys_paket||"")}); setKoKeboYsIndirim(fmt(r.ko_kebo_ys_indirim));
    setKoKeboTrendyol({tutar:fmt(r.ko_kebo_trendyol), paket:String(r.ko_kebo_trendyol_paket||"")}); setKoKeboTrendyolIndirim(fmt(r.ko_kebo_trendyol_indirim));
    setKoKeboMigrosYemek({tutar:fmt(r.ko_kebo_migros_yemek), paket:String(r.ko_kebo_migros_yemek_paket||"")});
    setKoKeboAlo({tutar:fmt(r.ko_kebo_alo), paket:String(r.ko_kebo_alo_paket||"")});

    setKoCnfYs({tutar:fmt(r.ko_cnf_ys), paket:String(r.ko_cnf_ys_paket||"")}); setKoCnfYsIndirim(fmt(r.ko_cnf_ys_indirim));
    setKoCnfTrendyol({tutar:fmt(r.ko_cnf_trendyol), paket:String(r.ko_cnf_trendyol_paket||"")}); setKoCnfTrendyolIndirim(fmt(r.ko_cnf_trendyol_indirim));
    setKoCnfMigrosYemek({tutar:fmt(r.ko_cnf_migros_yemek), paket:String(r.ko_cnf_migros_yemek_paket||"")});
    setKoCnfAlo({tutar:fmt(r.ko_cnf_alo), paket:String(r.ko_cnf_alo_paket||"")});

    setKasaNakit(fmt(r.kasa_nakit)); setKasaPos(fmt(r.kasa_pos)); setKasaEdenred(fmt(r.kasa_edenred)); setKasaMetropol(fmt(r.kasa_metropol));

    setKuryeler(r.kurye_raporlari?.length

      ? r.kurye_raporlari.map(k=>({...k,nakit:fmt(Number(k.nakit)),pos:fmt(Number(k.pos))}))

      : [{id:Date.now(),isim:"",nakit:"",pos:"",paketSayisi:""}]);

    const giderAciklamaHam = r.gider_aciklama || "";

    const notAyraci = giderAciklamaHam.indexOf(" || NOT: ");

    const sadeceGider = notAyraci > -1 ? giderAciklamaHam.substring(0, notAyraci) : giderAciklamaHam;

    const yukluNot = notAyraci > -1 ? giderAciklamaHam.substring(notAyraci + 9) : "";

    setNotlar(yukluNot);

    setGiderler(sadeceGider

      ? sadeceGider.split(" | ").map((g,i)=>{

          const colonIdx=g.lastIndexOf(": ₺");

          const aciklama = colonIdx>-1?g.substring(0,colonIdx):"";

          const tutar = colonIdx>-1?g.substring(colonIdx+3):"";

          // Firma ödemesi tespit et (önek "[Firma] " ile başlıyorsa)

          const firmaPrefix = "[Firma] ";

          if (aciklama.startsWith(firmaPrefix)) {

            const unvan = aciklama.substring(firmaPrefix.length);

            const firma = cariListesi.find(c => c.unvan === unvan);

            return {

              id: Date.now()+i,

              aciklama: unvan,

              tutar,

              tip: "firma" as const,

              firmaId: firma?.id,

              firmaUnvan: unvan,

            };

          }

          // Personel avans tespiti (önek "[Personel Avans] Ad — açıklama" biçiminde)
          const personelPrefix = "[Personel Avans] ";
          if (aciklama.startsWith(personelPrefix)) {
            const govde = aciklama.substring(personelPrefix.length);
            const ayrimIdx = govde.indexOf(" — ");
            const personelIsim = ayrimIdx>-1 ? govde.substring(0, ayrimIdx) : govde;
            const detay = ayrimIdx>-1 ? govde.substring(ayrimIdx+3) : "";
            return {
              id: Date.now()+i,
              aciklama: detay,
              tutar,
              tip: "personel" as const,
              personelIsim,
            };
          }

          return {

            id: Date.now()+i,

            aciklama,

            tutar,

            tip: "normal" as const,

          };

        })

      : [{id:Date.now(),aciklama:"",tutar:"",tip:"normal" as const}]);

    setIadeler(r.iade_aciklama

      ? r.iade_aciklama.split(" | ").map((g,i)=>{

          const colonIdx=g.lastIndexOf(": ₺");

          return {id:Date.now()+i+1000, aciklama:colonIdx>-1?g.substring(0,colonIdx):"", tutar:colonIdx>-1?g.substring(colonIdx+3):""};

        })

      : [{id:Date.now()+1000,aciklama:"",tutar:""}]);

  };



  // ── Live calculations ──

  // BRÜT CİRO = Online + Fiziki Kasa + Gider

  // (gider kasadan çıktığı için zaten kasaya girmiş para olarak brüte dahil)

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

    // ── İndirim Analizi (Yemeksepeti + Trendyol, Kebo + CNF, online + kapıda) ──
    const tIndirimYS = tv(osKeboYsIndirim)+tv(osCnfYsIndirim)+tv(koKeboYsIndirim)+tv(koCnfYsIndirim);
    const tIndirimTrendyol = tv(osKeboTrendyolIndirim)+tv(osCnfTrendyolIndirim)+tv(koKeboTrendyolIndirim)+tv(koCnfTrendyolIndirim);
    const tIndirim = tIndirimYS + tIndirimTrendyol;
    const paketCiroToplami = tOnline + tKapida; // indirim oranı, platformlardaki brüt paket cirosuna göre
    const indirimOrani = paketCiroToplami>0 ? (tIndirim/paketCiroToplami)*100 : 0;
    const indirimUyari = indirimOrani > 15;

    // ── Kasa ──
    const tKasa=tv(kasaNakit)+tv(kasaPos)+tv(kasaEdenred)+tv(kasaMetropol);

    const tGider=giderler.reduce((a,g)=>a+tv(g.tutar),0);

    const tIade=iadeler.reduce((a,i)=>a+tv(i.tutar),0);

    const brutCiro = tOnline + tKasa + tGider;

    const netCiro  = brutCiro - tGider - tIade; // matematiksel: tOnline + tKasa - tIade

    // ── Kuryeler: SADECE tip==="sabit" (Roadrunner, 14.08.2026+) olan satırlarda min. 30 paket garantisi var.
    // "havuz" ve "kendi" (14.08.2026 öncesi kendi personel kurye / geçiş günü) satırlarında garanti yok.
    const KURYE_GARANTI = 30;
    const kuryelerHesap = kuryeler.map(k=>{
      const gercek = parseInt(k.paketSayisi)||0;
      const uygulanan = k.tip==="sabit" ? Math.max(gercek, KURYE_GARANTI) : gercek;
      return { ...k, gercekPaket:gercek, uygulananPaket:uygulanan, garantiUygulandi: k.tip==="sabit" && gercek<KURYE_GARANTI };
    });
    const tKuryePaket=kuryelerHesap.reduce((a,k)=>a+k.uygulananPaket,0);
    const tKuryeGercekPaket=kuryelerHesap.reduce((a,k)=>a+k.gercekPaket,0);
    const tKuryeTahsilat=kuryeler.reduce((a,k)=>a+tv(k.nakit)+tv(k.pos),0);

    const paketOrt=(tOnline+tKapida)>0&&tKuryePaket>0?Math.round((tOnline+tKapida)/tKuryePaket):0;

    const kuryeFark=tKapida-tKuryeTahsilat;

    return {tOnline,tOnlineKebo,tOnlineCnf,tOnlinePaket,tKapida,tKapidaKebo,tKapidaCnf,tKapidaPaket,
      tIndirimYS,tIndirimTrendyol,tIndirim,indirimOrani,indirimUyari,
      tKasa,brutCiro,tGider,tIade,netCiro,kuryelerHesap,tKuryePaket,tKuryeGercekPaket,tKuryeTahsilat,paketOrt,kuryeFark};

  },[osKeboYs,osKeboYsIndirim,osKeboTrendyol,osKeboTrendyolIndirim,osKeboMigros,
     osCnfYs,osCnfYsIndirim,osCnfTrendyol,osCnfTrendyolIndirim,osCnfMigrosYemek,
     koKeboYs,koKeboYsIndirim,koKeboTrendyol,koKeboTrendyolIndirim,koKeboMigrosYemek,koKeboAlo,
     koCnfYs,koCnfYsIndirim,koCnfTrendyol,koCnfTrendyolIndirim,koCnfMigrosYemek,koCnfAlo,
     kasaNakit,kasaPos,kasaEdenred,kasaMetropol,giderler,iadeler,kuryeler]);



  // ── Table totals ──

  const tabloToplam = useMemo(()=>{

    let brut=0,net=0,paket=0,giderIade=0,paketCiro=0;

    raporlar.forEach(r=>{

      brut += brutHesapla(r);

      net  += netHesapla(r);

      giderIade+=(r.gunluk_gider||0)+(r.iade_tutar||0);

      paket+=r.kurye_raporlari?.reduce((s,k)=>s+(parseInt(k.paketSayisi)||0),0)||0;

      paketCiro+=(r.os_yemeksepeti||0)+(r.os_getir||0)+(r.os_trendyol||0)+(r.os_migros||0)+(r.os_chicknfride||0)+(r.ko_yemeksepeti||0)+(r.ko_getir||0)+(r.ko_trendyol||0)+(r.ko_migros||0)+(r.ko_alo_paket||0)+(r.ko_chicknfride||0);

    });

    return {brut,net,paket,giderIade,paketOrt:paket>0?Math.round(paketCiro/paket):0};

  },[raporlar]);



  // ── Handlers ──

  const giderEkle = (tip: "normal"|"firma"|"personel" = "normal") =>

    setGiderler([...giderler,{id:Date.now(),aciklama:tip==="personel"?"Personel tüketim (yemek/içecek)":"",tutar:"",tip}]);

  const giderSil = (id:number)=>setGiderler(giderler.filter(g=>g.id!==id));

  const giderDegistir = (id:number,field:"aciklama"|"tutar"|"firmaId"|"firmaUnvan"|"personelIsim",val:string)=>

    setGiderler(giderler.map(g=>g.id===id?{...g,[field]:field==="tutar"?fmtStr(val):val}:g));



  const iadeEkle = ()=>setIadeler([...iadeler,{id:Date.now(),aciklama:"",tutar:""}]);

  const iadeSil = (id:number)=>setIadeler(iadeler.filter(i=>i.id!==id));

  const iadeDegistir = (id:number,field:"aciklama"|"tutar",val:string)=>

    setIadeler(iadeler.map(i=>i.id===id?{...i,[field]:field==="tutar"?fmtStr(val):val}:i));



  const kuryeEkle = ()=>setKuryeler([...kuryeler,{id:Date.now(),isim:"",nakit:"",pos:"",paketSayisi:"",tip:"havuz"}]);

  const kuryeSil = (id:number)=>setKuryeler(kuryeler.filter(k=>k.id!==id));

  const kuryeDegistir = (id:number,field:keyof KuryeRaporu,val:string)=>{

    const v=(field==="nakit"||field==="pos")?fmtStr(val):val;

    setKuryeler(kuryeler.map(k=>k.id===id?{...k,[field]:v}:k));

  };

  // ── Fişten Doldur: kağıt raporu fotoğraflayıp/yükleyip AI'ye okutma ──
  const nToStr = (n:number|undefined) => (n && n>0) ? fmt(n) : "";

  const handleFisTara = async (file: File) => {
    if (!file) return;
    setTaramaYukleniyor(true); setTaramaHata(""); setTaramaBelirsizAlanlar([]);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await fetch("/api/rapor-tara", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType: file.type || "image/jpeg" }),
      });
      const veri = await response.json();
      if (!response.ok || veri.error) {
        setTaramaHata(veri.error || "Fiş okunamadı, tekrar deneyin."); return;
      }

      // Tarih (sadece yeni rapor eklerken, düzenleme modunda tarihi ezme)
      if (veri.tarih && !selectedRapor) handleTarihChange(veri.tarih);

      const pg = (o:any): PlatformGiris => ({ tutar: nToStr(o?.tutar), paket: o?.paket ? String(o.paket) : "" });

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

      const yeniGiderler: SatirRaporu[] = [];
      (veri.giderler||[]).forEach((g:any,i:number) => {
        if (g.tutar || g.aciklama) yeniGiderler.push({ id: Date.now()+i, aciklama: g.aciklama||"", tutar: nToStr(g.tutar), tip: "normal" });
      });
      (veri.avanslar||[]).forEach((a:any,i:number) => {
        if (a.tutar || a.personel) yeniGiderler.push({ id: Date.now()+100+i, aciklama: a.aciklama||"", tutar: nToStr(a.tutar), tip: "personel", personelIsim: a.personel||"" });
      });
      if (yeniGiderler.length) setGiderler(yeniGiderler);

      const yeniKesintiler = (veri.kesintiler||[]).filter((k:any)=>k.tutar||k.personel)
        .map((k:any,i:number)=>({ id: Date.now()+200+i, personelIsim: k.personel||"", tutar: nToStr(k.tutar), aciklama: k.aciklama||"" }));
      if (yeniKesintiler.length) setKesintiSatirlari(yeniKesintiler);

      const yeniIadeler = (veri.iadeler||[]).filter((i:any)=>i.tutar||i.aciklama)
        .map((i:any,idx:number)=>({ id: Date.now()+300+idx, aciklama: i.aciklama||"", tutar: nToStr(i.tutar) }));
      if (yeniIadeler.length) setIadeler(yeniIadeler);

      const sabitler = (veri.kuryeSabit||[]);
      const havuzlar = (veri.kuryeHavuz||[]).filter((k:any)=>k.isim||k.paket||k.tutar);
      const yeniKuryeler: KuryeRaporu[] = [
        { id:1, isim: sabitler[0]?.isim||"Kurye 1", nakit: nToStr(sabitler[0]?.nakit), pos: nToStr(sabitler[0]?.pos), paketSayisi: sabitler[0]?.paket?String(sabitler[0].paket):"", tip:"sabit" },
        { id:2, isim: sabitler[1]?.isim||"Kurye 2", nakit: nToStr(sabitler[1]?.nakit), pos: nToStr(sabitler[1]?.pos), paketSayisi: sabitler[1]?.paket?String(sabitler[1].paket):"", tip:"sabit" },
        ...havuzlar.map((k:any,i:number)=>({ id: Date.now()+400+i, isim: k.isim||"Havuz Kurye", nakit: nToStr(k.nakit), pos: nToStr(k.pos), paketSayisi: k.paket?String(k.paket):"", tip:"havuz" as const })),
      ];
      setKuryeler(yeniKuryeler);

      if (veri.notlar) setNotlar(veri.notlar);

      setTaramaBelirsizAlanlar(veri.belirsiz_alanlar || []);
    } catch (err:any) {
      setTaramaHata("Bağlantı hatası: " + err.message);
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

      const ozet = raporlar.slice(0, 30).map(r => {

        const brutCiro = brutHesapla(r);

        const net = netHesapla(r);

        const paket = r.kurye_raporlari?.reduce((s,k)=>s+(parseInt(k.paketSayisi)||0),0)||0;

        return `${fmtTarih(r.tarih)}: Brüt=₺${fmt(brutCiro)} Net=₺${fmt(net)} Gider=₺${fmt(r.gunluk_gider||0)} İade=₺${fmt(r.iade_tutar||0)} Paket=${paket}`;

      }).join("\n");



      const toplamBrut = raporlar.reduce((s,r)=>s+brutHesapla(r),0);

      const toplamNet  = raporlar.reduce((s,r)=>s+netHesapla(r),0);

      const toplamGider= raporlar.reduce((s,r)=>s+(r.gunluk_gider||0),0);



      // /api/chat endpoint'ine istek (proje içi route — CORS sorunsuz, API key güvende)

      const response = await fetch("/api/chat", {

        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({

          model: "claude-3-5-sonnet-20240620",

          max_tokens: 1024,

          system: `Sen KEBO ERP finansal analiz asistanısın. Restoran/yemek dağıtım işletmesinin günlük kasa raporlarını analiz ediyorsun.



ÖNEMLİ KAVRAMLAR:

- Brüt Ciro = Online Satış + Fiziki Kasa + Gider (gider kasadan çıktığı için brüte dahil)

- Net Ciro = Brüt - Gider - İade

- Kapıda ödemeler fiziki kasaya zaten dahil



CEVAP STİLİ: Kısa, net, Türkçe. Sayıları ₺ ile göster. Madde madde yazabilirsin. Emoji kullanmaktan çekinme.`,

          messages: [{

            role: "user",

            content: `Dönem: ${AYLAR.find(m=>m.value===secilenAy)?.label} ${secilenYil} (${raporlar.length} gün)

Toplam Brüt: ₺${fmt(toplamBrut)}

Toplam Net: ₺${fmt(toplamNet)}

Toplam Gider: ₺${fmt(toplamGider)}



Günlük Detay:

${ozet}



Soru: ${soruFinal}`

          }]

        })

      });



      if (!response.ok) {

        const errText = await response.text();

        setAiCevap(`API hatası (${response.status}): ${errText.substring(0, 200)}`);

        return;

      }



      const data = await response.json();

      // /api/chat Anthropic'in cevabını olduğu gibi dönüyor

      const cevap = data.content?.map((c: any) => c.text || "").join("") || data.error || "Cevap alınamadı.";

      setAiCevap(typeof cevap === "string" ? cevap : JSON.stringify(cevap));

    } catch (err: any) {

      setAiCevap(`Bağlantı hatası: ${err.message}`);

    } finally {

      setAiYukleniyor(false);

    }

  };



  // ── Save ──

  const handleRaporKaydet = async (e: React.FormEvent) => {

    e.preventDefault();

    if (duplikaTarihHata) { alert(`${fmtTarih(tarih)} tarihli rapor zaten mevcut!`); return; }

    if (!selectedRapor && !adminOnayliGecis && tarihHataVarMi) { alert("Rapor tarihi sırası hatalı."); return; }

    if (ch.brutCiro<=0) { alert("Lütfen en az bir ciro kalemi girin!"); return; }

    setSaving(true);

    try {

      const ekleyen=userEmail.split("@")[0]||"Bilinmiyor";



      const birlesikGider = giderler

        .filter(g=>g.tutar||g.aciklama)

        .map(g=>{

          const ad = g.tip==="firma" && g.firmaUnvan ? `[Firma] ${g.firmaUnvan}`
            : g.tip==="personel" && g.personelIsim ? `[Personel Avans] ${g.personelIsim} — ${g.aciklama||"Belirtilmemiş"}`
            : (g.aciklama||"Belirtilmemiş");

          return `${ad}: ₺${g.tutar}`;

        })

        .join(" | ");

      const birlesikIade = iadeler.filter(i=>i.tutar||i.aciklama).map(i=>`${i.aciklama||"Belirtilmemiş"}: ₺${i.tutar}`).join(" | ");

      const giderAciklamaFinal = notlar ? (birlesikGider ? `${birlesikGider} || NOT: ${notlar}` : `NOT: ${notlar}`) : birlesikGider;

      const temizKuryeler = kuryeler.map(k=>({...k,nakit:tv(k.nakit).toString(),pos:tv(k.pos).toString()}));



      const raporData = {

        tarih,

        // Legacy alanlar: eski rapor-analiz / dashboard ekranları bozulmasın diye
        // marka bazlı yeni alanların toplamıyla dolduruluyor (Getir artık formda yok -> 0).
        os_yemeksepeti:tv(osKeboYs.tutar)+tv(osCnfYs.tutar), os_getir:0,
        os_trendyol:tv(osKeboTrendyol.tutar)+tv(osCnfTrendyol.tutar),
        os_migros:tv(osKeboMigros.tutar)+tv(osCnfMigrosYemek.tutar), os_chicknfride:ch.tOnlineCnf,

        ko_yemeksepeti:tv(koKeboYs.tutar)+tv(koCnfYs.tutar), ko_getir:0,
        ko_trendyol:tv(koKeboTrendyol.tutar)+tv(koCnfTrendyol.tutar),
        ko_migros:tv(koKeboMigrosYemek.tutar)+tv(koCnfMigrosYemek.tutar),
        ko_alo_paket:tv(koKeboAlo.tutar)+tv(koCnfAlo.tutar), ko_chicknfride:ch.tKapidaCnf,

        // Online — Kebo
        os_kebo_ys:tv(osKeboYs.tutar), os_kebo_ys_paket:parseInt(osKeboYs.paket)||0, os_kebo_ys_indirim:tv(osKeboYsIndirim),
        os_kebo_trendyol:tv(osKeboTrendyol.tutar), os_kebo_trendyol_paket:parseInt(osKeboTrendyol.paket)||0, os_kebo_trendyol_indirim:tv(osKeboTrendyolIndirim),
        os_kebo_migros:tv(osKeboMigros.tutar), os_kebo_migros_paket:parseInt(osKeboMigros.paket)||0,

        // Online — Chick'N Fride
        os_cnf_ys:tv(osCnfYs.tutar), os_cnf_ys_paket:parseInt(osCnfYs.paket)||0, os_cnf_ys_indirim:tv(osCnfYsIndirim),
        os_cnf_trendyol:tv(osCnfTrendyol.tutar), os_cnf_trendyol_paket:parseInt(osCnfTrendyol.paket)||0, os_cnf_trendyol_indirim:tv(osCnfTrendyolIndirim),
        os_cnf_migros_yemek:tv(osCnfMigrosYemek.tutar), os_cnf_migros_yemek_paket:parseInt(osCnfMigrosYemek.paket)||0,

        // Kapıda Ödeme — Kebo
        ko_kebo_ys:tv(koKeboYs.tutar), ko_kebo_ys_paket:parseInt(koKeboYs.paket)||0, ko_kebo_ys_indirim:tv(koKeboYsIndirim),
        ko_kebo_trendyol:tv(koKeboTrendyol.tutar), ko_kebo_trendyol_paket:parseInt(koKeboTrendyol.paket)||0, ko_kebo_trendyol_indirim:tv(koKeboTrendyolIndirim),
        ko_kebo_migros_yemek:tv(koKeboMigrosYemek.tutar), ko_kebo_migros_yemek_paket:parseInt(koKeboMigrosYemek.paket)||0,
        ko_kebo_alo:tv(koKeboAlo.tutar), ko_kebo_alo_paket:parseInt(koKeboAlo.paket)||0,

        // Kapıda Ödeme — Chick'N Fride
        ko_cnf_ys:tv(koCnfYs.tutar), ko_cnf_ys_paket:parseInt(koCnfYs.paket)||0, ko_cnf_ys_indirim:tv(koCnfYsIndirim),
        ko_cnf_trendyol:tv(koCnfTrendyol.tutar), ko_cnf_trendyol_paket:parseInt(koCnfTrendyol.paket)||0, ko_cnf_trendyol_indirim:tv(koCnfTrendyolIndirim),
        ko_cnf_migros_yemek:tv(koCnfMigrosYemek.tutar), ko_cnf_migros_yemek_paket:parseInt(koCnfMigrosYemek.paket)||0,
        ko_cnf_alo:tv(koCnfAlo.tutar), ko_cnf_alo_paket:parseInt(koCnfAlo.paket)||0,

        kasa_nakit:tv(kasaNakit), kasa_pos:tv(kasaPos), kasa_edenred:tv(kasaEdenred), kasa_metropol:tv(kasaMetropol),

        gunluk_gider:ch.tGider, gider_aciklama:giderAciklamaFinal,

        iade_tutar:ch.tIade, iade_aciklama:birlesikIade,

        kurye_raporlari:temizKuryeler,

        toplam_ciro:ch.brutCiro, // Artık brüt: Online + Kasa + Gider

        ekleyen_kullanici:selectedRapor?`${selectedRapor.ekleyen_kullanici} | Düz:${ekleyen}`:ekleyen,

      };

      // Onaylı düzenleyici (ör. Ayşe) mevcut bir raporu düzenliyorsa:
      // rapor doğrudan güncellenmez, tam yetkili birinin onayına gönderilir.
      if (selectedRapor && !isAdmin && isOnayliDuzenleyici) {

        const { error: talepError } = await supabase.from("rapor_degisiklik_talepleri").insert([{

          rapor_id: selectedRapor.id,

          rapor_tarihi: selectedRapor.tarih,

          talep_eden: userEmail,

          eski_veri: selectedRapor,

          yeni_veri: raporData,

          durum: "bekliyor",

        }]);

        if (talepError) { alert("Talep gönderilirken hata: "+talepError.message); return; }

        alert(`${fmtTarih(selectedRapor.tarih)} tarihli rapor için değişiklik talebiniz onaya gönderildi. Murat veya Bülent onayladığında rapor güncellenecek.`);

        formuTemizle(); setFormAcik(false); veriCek();

        return;

      }

      let error;

      if (selectedRapor) {

        error=(await supabase.from("gunluk_raporlar").update(raporData).eq("id",selectedRapor.id)).error;

      } else {

        error=(await supabase.from("gunluk_raporlar").insert([raporData])).error;

      }

      if (error) { alert("Hata: "+error.message); return; }



      // Platform Tahsilat Takibi

      const PLATFORM_GECIKME: Record<string, number> = {

        "Yemeksepeti (Kebo)": 14, "Yemeksepeti (Chick'N Fride)": 14,
        "Trendyol (Kebo)": 14, "Trendyol (Chick'N Fride)": 14,
        "Migros (Kebo)": 15, "Migros Yemek (Chick'N Fride)": 15,
        "Alo Paket (Kebo)": 2, "Alo Paket (Chick'N Fride)": 2,

      };

      // Marka bazlı ayrım korunuyor — her marka platformda ayrı hesap/tahsilat olarak takip edilir.
      const platformSatislar = [

        { platform: "Yemeksepeti (Kebo)",           tutar: tv(osKeboYs.tutar) + tv(koKeboYs.tutar) },
        { platform: "Yemeksepeti (Chick'N Fride)",  tutar: tv(osCnfYs.tutar) + tv(koCnfYs.tutar) },
        { platform: "Trendyol (Kebo)",               tutar: tv(osKeboTrendyol.tutar) + tv(koKeboTrendyol.tutar) },
        { platform: "Trendyol (Chick'N Fride)",     tutar: tv(osCnfTrendyol.tutar) + tv(koCnfTrendyol.tutar) },
        { platform: "Migros (Kebo)",                 tutar: tv(osKeboMigros.tutar) + tv(koKeboMigrosYemek.tutar) },
        { platform: "Migros Yemek (Chick'N Fride)", tutar: tv(osCnfMigrosYemek.tutar) + tv(koCnfMigrosYemek.tutar) },
        { platform: "Alo Paket (Kebo)",              tutar: tv(koKeboAlo.tutar) },
        { platform: "Alo Paket (Chick'N Fride)",    tutar: tv(koCnfAlo.tutar) },

      ];

      const { data: mevcutPT } = await supabase

        .from("platform_tahsilatlar")

        .select("id, platform, durum, gunluk_tahsilatlar, gerceklesen_tutar, kesinti_tutari, gerceklesen_odeme_tarihi")

        .eq("satis_tarihi", tarih);



      for (const p of platformSatislar) {

        const mevcut = mevcutPT?.find(m => m.platform === p.platform);

        const gecikme = PLATFORM_GECIKME[p.platform] || 7;

        const beklenenDt = new Date(tarih + "T12:00:00");

        beklenenDt.setDate(beklenenDt.getDate() + gecikme);

        const beklenenTarihStr = beklenenDt.toISOString().split("T")[0];

        if (p.tutar > 0) {

          if (mevcut) {

            await supabase.from("platform_tahsilatlar").update({

              satis_tutari: p.tutar,

              beklenen_odeme_tarihi: beklenenTarihStr,

              aciklama: `Günlük rapor — ${fmtTarih(tarih)}`,

            }).eq("id", mevcut.id);

          } else {

            await supabase.from("platform_tahsilatlar").insert([{

              platform: p.platform, satis_tarihi: tarih, satis_tutari: p.tutar,

              beklenen_odeme_tarihi: beklenenTarihStr, durum: "bekliyor",

              aciklama: `Günlük rapor — ${fmtTarih(tarih)}`, ekleyen_kullanici: ekleyen,

            }]);

          }

        } else if (mevcut && (mevcut.durum === "bekliyor")) {

          await supabase.from("platform_tahsilatlar").delete().eq("id", mevcut.id);

        }

      }

      // Personel Avans — Giderler listesindeki tip:"personel" satırları (kasadan fiş çıkan personel tüketimi)
      // otomatik olarak ilgili personelin avans geçmişine işlenir. Kasa/gider toplamına zaten dahil (giderler dizisinde).
      // NOT: rapor düzenlenip tekrar kaydedilirse çift kayıt oluşmasın diye, bu rapora ait
      // önceki otomatik avans/kesinti kayıtları (aynı tarih + işaretli odeme_yontemi/aciklama) önce silinir.
      await supabase.from("avanslar").delete().eq("tarih", tarih).eq("odeme_yontemi", "Ürün / Fiş (Kasa Gideri)");
      for (const g of giderler) {
        if (g.tip !== "personel" || !g.personelIsim || !tv(g.tutar)) continue;
        await supabase.from("avanslar").insert({
          personel_isim: g.personelIsim, tutar: tv(g.tutar), tarih,
          odeme_yontemi: "Ürün / Fiş (Kasa Gideri)", kasa_kaynagi: "Nakit Kasa",
          aciklama: g.aciklama || `Personel tüketim — ${fmtTarih(tarih)}`,
        });
      }
      // Personel Kesintisi — kasayı etkilemez, sadece ay sonu maaş hesabında düşülür.
      // "[Rapor] " öneki bu kaydın günlük rapordan geldiğini işaretler; düzenlemede aynı tarihli
      // işaretli eski kayıtlar silinip güncel haliyle yeniden eklenir (çift kayıt olmasın diye).
      await supabase.from("kesintiler").delete().eq("tarih", tarih).like("aciklama", "[Rapor]%");
      for (const k of kesintiSatirlari) {
        if (!k.personelIsim || !tv(k.tutar)) continue;
        await supabase.from("kesintiler").insert({
          personel_isim: k.personelIsim, tutar: tv(k.tutar), tarih,
          aciklama: `[Rapor] ${k.aciklama || fmtTarih(tarih)}`,
        });
      }

      formuTemizle(); setFormAcik(false); veriCek();

    } catch(err:any) { alert("Hata: "+err.message); }

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

            <span className="flex items-center gap-1.5"><User size={11} className="text-blue-400"/>{selectedRapor.ekleyen_kullanici}</span>

            {selectedRapor.created_at && <span className="flex items-center gap-1.5"><Clock size={11} className="text-blue-400"/>{new Date(selectedRapor.created_at).toLocaleString("tr-TR")}</span>}

          </div>

          {!isEditMode && (isAdmin || isOnayliDuzenleyici) && (

            <div className="flex items-center gap-2">

              <button type="button" onClick={()=>setIsEditMode(true)}

                className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3 py-1.5 rounded-lg hover:bg-amber-400/15 transition-colors">

                <Edit3 size={12}/> Düzenle

              </button>

              {isAdmin && (

              <button type="button" onClick={()=>selectedRapor && handleRaporSil(selectedRapor)}

                className="flex items-center gap-1.5 text-xs font-semibold text-red-400 bg-red-400/10 border border-red-400/20 px-3 py-1.5 rounded-lg hover:bg-red-400/15 transition-colors">

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
              {taramaYukleniyor ? <Loader2 size={14} className="text-indigo-400 animate-spin"/> : <Camera size={14} className="text-indigo-400"/>}
            </div>
            <div>
              <p className="text-xs font-bold text-indigo-300">Fişten Doldur</p>
              <p className="text-[10px] text-gray-500">Kağıt raporun fotoğrafını yükle, AI okuyup formu doldursun</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input ref={dosyaInputRef} type="file" accept="image/*" capture="environment" className="hidden"
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
          <AlertTriangle size={13} className="text-red-400 shrink-0"/>
          <p className="text-xs text-red-300">{taramaHata}</p>
        </div>
      )}
      {taramaBelirsizAlanlar.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5">
          <p className="text-xs font-bold text-amber-400 flex items-center gap-1.5 mb-1"><AlertTriangle size={12}/> AI bazı alanlardan emin olamadı — lütfen kontrol et:</p>
          <p className="text-[11px] text-amber-200/80">{taramaBelirsizAlanlar.join(", ")}</p>
        </div>
      )}

      {/* TARİH + CANLI METRİKLER */}

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-center">

        <div className="sm:col-span-1">

          <label className="block text-[10px] text-amber-400 uppercase tracking-widest font-medium mb-1">Rapor Tarihi</label>

          <div className="flex flex-col gap-1">

            <input type="date" value={tarih} disabled={isReadOnly}

              onChange={e=>handleTarihChange(e.target.value)}

              min={!isAdmin&&!selectedRapor&&beklenenTarih?beklenenTarih:undefined}

              max={!isAdmin&&!selectedRapor&&beklenenTarih?beklenenTarih:undefined}

              className={`bg-[#080b14] text-white font-bold text-center h-9 text-xs rounded-xl px-3 w-full outline-none focus:ring-1 transition-all border ${

                duplikaTarihHata ? "border-orange-500 text-orange-400"

                : tarihHataVarMi&&!adminOnayliGecis ? "border-red-500 text-red-400"

                : "border-[#1a2236] focus:border-amber-500/50"

              }`} required/>

            {duplikaTarihHata && <p className="text-[10px] text-orange-400 flex items-center gap-1"><AlertTriangle size={9}/> Bu tarih mevcut</p>}

            {enSonRaporTarihi && <p className="text-[9px] text-gray-700">Son: {fmtTarih(enSonRaporTarihi)}</p>}

          </div>

        </div>

        {[

          {label:"Brüt Ciro", value:`₺${fmt(ch.brutCiro)}`, color:"text-blue-400", border:"border-blue-500/10 bg-blue-500/5"},

          {label:"Net Ciro",  value:`₺${fmt(ch.netCiro)}`,  color:"text-emerald-400", border:"border-emerald-500/10 bg-emerald-500/5"},

          {label:"Paket",     value:`${fmt(ch.tKuryePaket)}`, color:"text-amber-400", border:"border-amber-500/10 bg-amber-500/5"},

          {label:"Ort. Sepet",value:`₺${fmt(ch.paketOrt)}`, color:"text-purple-400", border:"border-purple-500/10 bg-purple-500/5"},

        ].map(c=>(

          <div key={c.label} className={`rounded-xl border ${c.border} px-3 py-2`}>

            <p className="text-[9px] text-gray-600 uppercase tracking-widest">{c.label}</p>

            <p className={`text-sm font-black tracking-tight ${c.color}`}>{c.value}</p>

          </div>

        ))}

      </div>



      {/* Admin skip onayı */}

      {tarihHataVarMi && isAdmin && !adminOnayliGecis && !isReadOnly && (

        <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">

          <p className="text-xs text-amber-400 flex items-center gap-2">

            <AlertTriangle size={12}/>

            <strong className="text-white">{beklenenTarih?fmtTarih(beklenenTarih):""}</strong> eklenmeden devam edilsin mi?

          </p>

          <div className="flex gap-2">

            <button type="button" onClick={()=>setAdminOnayliGecis(true)} className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg flex items-center gap-1"><Check size={11}/> Evet</button>

            <button type="button" onClick={()=>{setTarih("");setTarihHataVarMi(false);}} className="text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg flex items-center gap-1"><X size={11}/> Hayır</button>

          </div>

        </div>

      )}



      {/* Non-admin blocker */}

      {tarihHataVarMi && !isAdmin && !isReadOnly && (

        <div className="rounded-xl border border-red-500/20 bg-[#130a0a] p-6 text-center">

          <ShieldAlert className="h-10 w-10 text-red-500 mx-auto mb-3 animate-bounce"/>

          <p className="text-sm font-black text-white mb-1 uppercase">Gün Atlayamazsınız</p>

          <p className="text-gray-500 text-xs mb-4">

            Sıradaki gün: <strong className="text-red-400">{beklenenTarih?fmtTarih(beklenenTarih):""}</strong>

          </p>

          <button type="button" onClick={()=>setTarih("")} className="text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-6 py-2 rounded-xl transition-colors">Tarihi Düzelt</button>

        </div>

      )}



      <div className={`transition-all duration-200 ${formKilitli&&!isReadOnly?"opacity-20 pointer-events-none blur-sm select-none":""}`}>



        {!tarih && !isReadOnly && (

          <div className="flex items-center justify-center gap-2 py-8 text-gray-600 text-xs border border-dashed border-[#1a2236] rounded-xl">

            <Lock size={12} className="text-amber-500"/> Tarih seçilince form aktif olur

          </div>

        )}



        {(tarih || isReadOnly) && (

          <div className="space-y-3">



            {/* CİRO GİRİŞLERİ: Online / Kapıda Ödeme (Kebo + Chick'N Fride) + Kasa */}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

              {/* ── ONLINE ── */}
              <div className="rounded-xl border border-blue-500/15 bg-[#0c0f1a] overflow-hidden">
                <div className="px-3 py-2 border-b border-blue-500/15 flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider flex items-center gap-1.5"><Monitor size={11}/>Online</span>
                  <span className="text-xs font-black text-blue-400">₺{fmt(ch.tOnline)} <span className="text-gray-600 font-normal">· {ch.tOnlinePaket} pkt</span></span>
                </div>
                <div className="p-3 space-y-3">
                  <div>
                    <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-1.5">Kebo</p>
                    <div className="space-y-1.5">
                      <PlatformSatir label="Yemeksepeti" value={osKeboYs} onChange={setOsKeboYs} indirim={osKeboYsIndirim} onIndirimChange={setOsKeboYsIndirim} disabled={isReadOnly}/>
                      <PlatformSatir label="Trendyol" value={osKeboTrendyol} onChange={setOsKeboTrendyol} indirim={osKeboTrendyolIndirim} onIndirimChange={setOsKeboTrendyolIndirim} disabled={isReadOnly}/>
                      <PlatformSatir label="Migros" value={osKeboMigros} onChange={setOsKeboMigros} disabled={isReadOnly}/>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1.5">Chick'N Fride</p>
                    <div className="space-y-1.5">
                      <PlatformSatir label="Yemeksepeti" value={osCnfYs} onChange={setOsCnfYs} indirim={osCnfYsIndirim} onIndirimChange={setOsCnfYsIndirim} disabled={isReadOnly}/>
                      <PlatformSatir label="Trendyol" value={osCnfTrendyol} onChange={setOsCnfTrendyol} indirim={osCnfTrendyolIndirim} onIndirimChange={setOsCnfTrendyolIndirim} disabled={isReadOnly}/>
                      <PlatformSatir label="Migros Yemek" value={osCnfMigrosYemek} onChange={setOsCnfMigrosYemek} disabled={isReadOnly}/>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── KAPIDA ÖDEME ── */}
              <div className="rounded-xl border border-purple-500/15 bg-[#0c0f1a] overflow-hidden">
                <div className="px-3 py-2 border-b border-purple-500/15 flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider flex items-center gap-1.5"><Home size={11}/>Kapıda Ödeme</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-purple-600 bg-purple-500/10 px-1.5 py-0.5 rounded-full">Kasaya dahil</span>
                    <span className="text-xs font-black text-purple-400">₺{fmt(ch.tKapida)} <span className="text-gray-600 font-normal">· {ch.tKapidaPaket} pkt</span></span>
                  </div>
                </div>
                <div className="p-3 space-y-3">
                  <div>
                    <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-1.5">Kebo</p>
                    <div className="space-y-1.5">
                      <PlatformSatir label="Yemeksepeti" value={koKeboYs} onChange={setKoKeboYs} indirim={koKeboYsIndirim} onIndirimChange={setKoKeboYsIndirim} disabled={isReadOnly}/>
                      <PlatformSatir label="Trendyol" value={koKeboTrendyol} onChange={setKoKeboTrendyol} indirim={koKeboTrendyolIndirim} onIndirimChange={setKoKeboTrendyolIndirim} disabled={isReadOnly}/>
                      <PlatformSatir label="Migros Yemek" value={koKeboMigrosYemek} onChange={setKoKeboMigrosYemek} disabled={isReadOnly}/>
                      <PlatformSatir label="Alo Paket" value={koKeboAlo} onChange={setKoKeboAlo} disabled={isReadOnly}/>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1.5">Chick'N Fride</p>
                    <div className="space-y-1.5">
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
            <div className="rounded-xl border border-emerald-500/15 bg-[#0c0f1a] overflow-hidden">
              <div className="px-3 py-2 border-b border-emerald-500/15 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5"><Wallet size={11}/>Kasa</span>
                <span className="text-xs font-black text-emerald-400">₺{fmt(ch.tKasa)}</span>
              </div>
              <div className="p-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                <CurrencyInput label="Nakit" value={kasaNakit} onChange={setKasaNakit} disabled={isReadOnly}/>
                <CurrencyInput label="Pos" value={kasaPos} onChange={setKasaPos} disabled={isReadOnly}/>
                <CurrencyInput label="Edenred" value={kasaEdenred} onChange={setKasaEdenred} disabled={isReadOnly}/>
                <CurrencyInput label="Metropol" value={kasaMetropol} onChange={setKasaMetropol} disabled={isReadOnly}/>
              </div>
              <div className="mx-3 mb-3 rounded-lg border border-red-500/15 bg-red-500/5 px-3 py-2 flex items-center justify-between">
                <span className="text-[10px] text-red-400 uppercase tracking-wide font-medium flex items-center gap-1.5"><TrendingDown size={11}/>Gider (salt okunur)</span>
                <span className="text-sm font-black text-red-400">₺{fmt(ch.tGider)}</span>
              </div>
              <p className="px-3 pb-2.5 text-[10px] text-gray-600">Gider için aşağıdaki <span className="text-gray-400 font-semibold">Giderler</span> bölümünü kullan — buraya doğrudan giriş yapılamaz, orada eklediğin her satır bu toplama otomatik yansır.</p>
            </div>

            {/* ── İNDİRİM ANALİZİ ── */}
            <div className={`rounded-xl border overflow-hidden ${ch.indirimUyari ? "border-red-500/40 bg-red-500/5" : "border-[#1a2236] bg-[#0c0f1a]"}`}>
              <div className="px-3 py-2 border-b border-[#1a2236] flex items-center justify-between">
                <span className={`text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5 ${ch.indirimUyari?"text-red-400":"text-gray-400"}`}>
                  <Percent size={11}/>İndirim Analizi
                </span>
                <span className={`text-xs font-black ${ch.indirimUyari?"text-red-400":"text-white"}`}>%{ch.indirimOrani.toFixed(1)}</span>
              </div>
              <div className="p-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[9px] text-gray-600 uppercase tracking-widest">Yemeksepeti İndirim</p>
                  <p className="text-sm font-black text-red-400">₺{fmt(ch.tIndirimYS)}</p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-600 uppercase tracking-widest">Trendyol İndirim</p>
                  <p className="text-sm font-black text-red-400">₺{fmt(ch.tIndirimTrendyol)}</p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-600 uppercase tracking-widest">Toplam İndirim</p>
                  <p className="text-sm font-black text-white">₺{fmt(ch.tIndirim)}</p>
                </div>
              </div>
              {ch.indirimUyari && (
                <div className="mx-3 mb-3 flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  <AlertTriangle size={13} className="text-red-400 shrink-0"/>
                  <p className="text-[11px] text-red-300">İndirim oranı platform cirosunun <span className="font-black">%15'ini</span> geçti — kontrol et.</p>
                </div>
              )}
            </div>



            {/* PLATFORM ÖZET BANTI */}

            {platformOzetSatirlar.length > 0 && (

              <div className="rounded-xl border border-[#1a2236] bg-[#080b14] px-4 py-3">

                <p className="text-[9px] text-gray-600 uppercase tracking-widest font-semibold mb-2 flex items-center gap-1.5">

                  <PieChart size={9}/> Platform Bazlı Toplam (Online + Kapıda) — Bilgi Amaçlı

                </p>

                <div className="flex flex-wrap gap-3">

                  {platformOzetSatirlar.map(p => (

                    <div key={p.label} className="flex items-center gap-2 bg-white/[0.03] border border-white/5 rounded-lg px-2.5 py-1.5">

                      <div className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor:p.color}}/>

                      <span className="text-[10px] text-gray-400">{p.label}</span>

                      <span className="text-[11px] font-bold text-white">₺{fmt(p.online+p.kapida)}</span>

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

              <div className="rounded-xl border border-red-500/15 bg-[#0c0f1a] overflow-hidden">

                <div className="px-3 py-2 border-b border-red-500/15 flex items-center justify-between">

                  <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wider flex items-center gap-1.5"><TrendingDown size={11}/>Giderler</span>

                  <div className="flex items-center gap-1.5">

                    <span className="text-xs font-black text-red-400">₺{fmt(ch.tGider)}</span>

                    {!isReadOnly && (

                      <>

                        <button type="button" onClick={()=>giderEkle("normal")}

                          className="text-[10px] text-gray-600 hover:text-red-400 border border-[#1a2236] hover:border-red-500/30 px-2 py-0.5 rounded transition-colors">

                          + Normal

                        </button>

                        <button type="button" onClick={()=>giderEkle("firma")}

                          className="text-[10px] text-gray-600 hover:text-blue-400 border border-[#1a2236] hover:border-blue-500/30 px-2 py-0.5 rounded transition-colors flex items-center gap-1">

                          <Building2 size={9}/> Firma

                        </button>

                        <button type="button" onClick={()=>giderEkle("personel")}

                          className="text-[10px] text-gray-600 hover:text-teal-400 border border-[#1a2236] hover:border-teal-500/30 px-2 py-0.5 rounded transition-colors flex items-center gap-1">

                          <Users2 size={9}/> Personel

                        </button>

                      </>

                    )}

                  </div>

                </div>

                <div className="p-3 space-y-2">

                  {giderler.map((item, idx) => (

                    <div key={item.id} className="space-y-1.5">

                      {item.tip === "firma" ? (

                        <div className="flex items-center gap-1 mb-1">

                          <Building2 size={9} className="text-blue-400"/>

                          <span className="text-[9px] text-blue-400 uppercase tracking-wider">Firma Ödemesi</span>

                        </div>

                      ) : item.tip === "personel" ? (

                        <div className="flex items-center gap-1 mb-1">

                          <Users2 size={9} className="text-teal-400"/>

                          <span className="text-[9px] text-teal-400 uppercase tracking-wider">Personel Tüketimi — kasadan fiş çıkar, otomatik avans olarak işlenir</span>

                        </div>

                      ) : null}



                      {item.tip === "firma" ? (

                        isReadOnly ? (

                          <div className="w-full bg-[#080b14] border border-blue-500/20 text-blue-300 text-xs h-7 px-2.5 rounded-lg flex items-center gap-1.5">

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

                                if (firma) {

                                  giderDegistir(item.id, "firmaId", firma.id);

                                  giderDegistir(item.id, "firmaUnvan", firma.unvan);

                                  giderDegistir(item.id, "aciklama", firma.unvan);

                                }

                              }}

                              className="w-full bg-[#080b14] border border-blue-500/20 text-white text-xs h-7 pl-6 pr-2 rounded-lg outline-none focus:border-blue-500/40 disabled:opacity-40 appearance-none"

                            >

                              <option value="">Firma seçiniz...</option>

                              {cariListesi.map(c => (

                                <option key={c.id} value={c.id} className="bg-[#0c0f1a]">

                                  {c.unvan} {c.cari_kodu ? `(${c.cari_kodu})` : ""}

                                </option>

                              ))}

                            </select>

                          </div>

                        )

                      ) : item.tip === "personel" ? (
                        <div className="space-y-1.5">
                          <select disabled={isReadOnly} value={item.personelIsim || ""}
                            onChange={e => giderDegistir(item.id, "personelIsim", e.target.value)}
                            className="w-full bg-[#080b14] border border-teal-500/20 text-white text-xs h-7 px-2.5 rounded-lg outline-none focus:border-teal-500/40 disabled:opacity-40 appearance-none">
                            <option value="">Personel seçiniz...</option>
                            {avansPersonelListesi.map((p,i)=>(<option key={i} value={p} className="bg-[#0c0f1a]">{p}</option>))}
                          </select>
                          <input type="text" placeholder="Ne tüketti? (örn: 1 adet kola)" disabled={isReadOnly} value={item.aciklama}
                            onChange={e=>giderDegistir(item.id, "aciklama", e.target.value)}
                            className="w-full bg-[#080b14] border border-[#1a2236] hover:border-[#243050] focus:border-teal-500/40 text-white text-xs h-7 px-2.5 rounded-lg outline-none transition-all disabled:opacity-40 placeholder:text-gray-700"/>
                        </div>
                      ) : (

                        <AkilliGiderInput

                          value={item.aciklama}

                          onChange={v => giderDegistir(item.id, "aciklama", v)}

                          disabled={isReadOnly}

                          oneriListesi={giderOnerileri}

                        />

                      )}



                      <div className="flex gap-1">

                        <div className="relative flex-1">

                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-600 text-xs">₺</span>

                          <input

                            type="text" placeholder="0" disabled={isReadOnly} value={item.tutar}

                            onChange={e=>giderDegistir(item.id,"tutar",e.target.value)}

                            className="w-full bg-[#080b14] border border-[#1a2236] text-white text-xs font-bold h-7 pl-5 pr-2 rounded-lg outline-none focus:border-blue-500/40 disabled:opacity-40"

                          />

                        </div>

                        {!isReadOnly && giderler.length>1 && (

                          <button type="button" onClick={()=>giderSil(item.id)} className="text-gray-700 hover:text-red-400 px-1"><Trash2 size={11}/></button>

                        )}

                      </div>

                      {idx < giderler.length-1 && <div className="border-t border-[#1a2236] mt-1"/>}

                    </div>

                  ))}

                </div>

              </div>



              {/* İade + Kurye + Notlar */}

              <div className="space-y-3">

                {/* Personel Kesintisi — kasayı/gideri etkilemez, sadece ay sonu maaştan düşülür */}
                <div className="rounded-xl border border-rose-500/15 bg-[#0c0f1a] overflow-hidden">
                  <div className="px-3 py-2 border-b border-rose-500/15 flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-rose-400 uppercase tracking-wider flex items-center gap-1.5"><Users2 size={11}/>Personel Kesintisi</span>
                    {!isReadOnly && (
                      <button type="button" onClick={()=>setKesintiSatirlari([...kesintiSatirlari,{id:Date.now(),personelIsim:"",tutar:"",aciklama:""}])}
                        className="text-[10px] text-gray-600 hover:text-rose-400 border border-[#1a2236] hover:border-rose-500/30 px-2 py-0.5 rounded transition-colors">+ Kesinti</button>
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
                          <select disabled={isReadOnly} value={k.personelIsim}
                            onChange={e=>setKesintiSatirlari(kesintiSatirlari.map(x=>x.id===k.id?{...x,personelIsim:e.target.value}:x))}
                            className="col-span-6 bg-[#080b14] border border-[#1a2236] text-white h-7 text-xs rounded-lg px-2 outline-none focus:border-rose-500/40 disabled:opacity-40">
                            <option value="">Personel seç...</option>
                            {avansPersonelListesi.map((p,i)=>(<option key={i} value={p}>{p}</option>))}
                          </select>
                          <div className="col-span-5 relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-600 text-[10px]">₺</span>
                            <input type="text" placeholder="0" disabled={isReadOnly} value={k.tutar}
                              onChange={e=>setKesintiSatirlari(kesintiSatirlari.map(x=>x.id===k.id?{...x,tutar:fmtStr(e.target.value)}:x))}
                              className="w-full bg-[#080b14] border border-[#1a2236] text-white text-xs font-bold h-7 pl-5 pr-2 rounded-lg outline-none focus:border-rose-500/40 disabled:opacity-40"/>
                          </div>
                          {!isReadOnly && <button type="button" onClick={()=>setKesintiSatirlari(kesintiSatirlari.filter(x=>x.id!==k.id))} className="col-span-1 text-gray-700 hover:text-red-400 flex items-center justify-center"><Trash2 size={11}/></button>}
                        </div>
                        <input type="text" placeholder="Kesinti sebebi (örn: eksik ürün gönderimi)" disabled={isReadOnly} value={k.aciklama}
                          onChange={e=>setKesintiSatirlari(kesintiSatirlari.map(x=>x.id===k.id?{...x,aciklama:e.target.value}:x))}
                          className="w-full bg-[#080b14] border border-[#1a2236] text-white text-[11px] h-6 px-2 rounded-lg outline-none focus:border-rose-500/40 disabled:opacity-40 placeholder:text-gray-700"/>
                      </div>
                    ))}
                    <p className="text-[9px] text-gray-600">Kaydedince ilgili personelin profilindeki Kesinti geçmişine işlenir; ay sonu maaş hesabında oradan görünür.</p>
                  </div>
                </div>

                {/* İadeler */}

                <div className="rounded-xl border border-orange-500/15 bg-[#0c0f1a] overflow-hidden">

                  <div className="px-3 py-2 border-b border-orange-500/15 flex items-center justify-between">

                    <span className="text-[10px] font-semibold text-orange-400 uppercase tracking-wider flex items-center gap-1.5"><RotateCcw size={11}/>İptal-İade Fişleri</span>

                    <div className="flex items-center gap-1.5">

                      <span className="text-xs font-black text-orange-400">₺{fmt(ch.tIade)}</span>

                      {!isReadOnly && <button type="button" onClick={iadeEkle} className="text-[10px] text-gray-600 hover:text-orange-400 border border-[#1a2236] hover:border-orange-500/30 w-5 h-5 rounded flex items-center justify-center transition-colors">+</button>}

                    </div>

                  </div>

                  <div className="p-3 space-y-2">

                    {iadeler.map((item,idx)=>(

                      <div key={item.id} className="space-y-1.5">

                        <input type="text" placeholder="İptal / iade fiş açıklaması..." disabled={isReadOnly} value={item.aciklama}

                          onChange={e=>iadeDegistir(item.id,"aciklama",e.target.value)}

                          className="w-full bg-[#080b14] border border-[#1a2236] hover:border-[#243050] focus:border-blue-500/40 text-white text-xs h-7 px-2.5 rounded-lg outline-none transition-all disabled:opacity-40 placeholder:text-gray-700"/>

                        <div className="flex gap-1">

                          <div className="relative flex-1">

                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-600 text-xs">₺</span>

                            <input type="text" placeholder="0" disabled={isReadOnly} value={item.tutar}

                              onChange={e=>iadeDegistir(item.id,"tutar",e.target.value)}

                              className="w-full bg-[#080b14] border border-[#1a2236] text-white text-xs font-bold h-7 pl-5 pr-2 rounded-lg outline-none focus:border-blue-500/40 disabled:opacity-40"/>

                          </div>

                          {!isReadOnly && iadeler.length>1 && <button type="button" onClick={()=>iadeSil(item.id)} className="text-gray-700 hover:text-red-400 px-1"><Trash2 size={11}/></button>}

                        </div>

                        {idx < iadeler.length-1 && <div className="border-t border-[#1a2236] mt-1"/>}

                      </div>

                    ))}

                  </div>

                </div>



                {/* Kuryeler */}

                <div className="rounded-xl border border-amber-500/15 bg-[#0c0f1a] overflow-hidden">

                  <div className="px-3 py-2 border-b border-amber-500/15 flex items-center justify-between">

                    <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5"><Truck size={11}/>Kurye (Roadrunner)</span>

                    <div className="flex items-center gap-2">

                      {ch.kuryeFark===0

                        ? <span className="text-[10px] text-emerald-400 flex items-center gap-1"><CheckCircle2 size={10}/>Dengede</span>

                        : <span className="text-[10px] text-red-400 flex items-center gap-1"><AlertTriangle size={10}/>{ch.kuryeFark>0?`₺${fmt(ch.kuryeFark)} eksik`:`₺${fmt(Math.abs(ch.kuryeFark))} fazla`}</span>

                      }

                      {!isReadOnly && <button type="button" onClick={kuryeEkle} className="text-[10px] text-gray-600 hover:text-amber-400 border border-[#1a2236] hover:border-amber-500/30 px-2 py-0.5 rounded transition-colors">+ Havuz Kurye</button>}

                    </div>

                  </div>

                  <div className="p-3 space-y-3">

                    <p className="text-[10px] text-gray-600">Sabit kuryede (Roadrunner) günlük en az <span className="text-amber-400 font-bold">30 paket</span> garantisi var — altında kalınırsa ödemede 30 esas alınır. Havuz kuryede garanti yok.</p>

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

                                <div className="bg-[#080b14] border border-[#1a2236] text-white h-7 text-xs rounded-lg px-2 flex items-center gap-1">

                                  {sabit && <Truck size={9} className="text-amber-500 shrink-0"/>}{k.isim || "—"}

                                </div>

                              ) : (

                                <div className="relative">

                                  {sabit && <Truck size={9} className="absolute left-2 top-1/2 -translate-y-1/2 text-amber-500"/>}

                                  <input type="text" placeholder={sabit?"Kurye adı":"Havuz kurye / firma"} disabled={isReadOnly} value={k.isim}

                                    onChange={e=>kuryeDegistir(k.id,"isim",e.target.value)}

                                    className={`w-full bg-[#080b14] border border-[#1a2236] text-white h-7 text-xs rounded-lg ${sabit?"pl-6":"pl-2"} pr-2 outline-none focus:border-amber-500/40 disabled:opacity-40`}/>

                                </div>

                              )}

                            </div>

                            <div className="col-span-3">

                              <div className="flex items-center gap-1">

                                {isReadOnly ? (

                                  <div className="flex-1 bg-[#080b14] border border-[#1a2236] text-white h-7 text-xs font-bold rounded-lg flex items-center justify-center">

                                    {k.gercekPaket}

                                  </div>

                                ) : (

                                  <input type="number" placeholder="0" disabled={isReadOnly} value={k.paketSayisi}

                                    onChange={e=>kuryeDegistir(k.id,"paketSayisi",e.target.value)}

                                    className="flex-1 w-0 bg-[#080b14] border border-[#1a2236] text-white h-7 text-xs font-bold px-2 rounded-lg outline-none disabled:opacity-40 text-center"/>

                                )}

                                {sabit && (

                                  <span title="Ödemede esas alınan paket (garanti uygulandıysa)"

                                    className={`shrink-0 w-9 h-7 flex items-center justify-center text-[10px] font-black rounded-lg border ${k.garantiUygulandi ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-[#1a2236] text-gray-600"}`}>

                                    {k.uygulananPaket}

                                  </span>

                                )}

                              </div>

                              {sabit && k.garantiUygulandi && (

                                <p className="text-[9px] text-amber-500 mt-0.5">Garanti uygulandı (30)</p>

                              )}

                            </div>

                            <div className="col-span-3">

                              <div className={`relative rounded-lg border ${isReadOnly ? "border-amber-500/20 bg-amber-500/5" : "border-[#1a2236]"}`}>

                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-amber-600 text-[10px] font-bold">₺</span>

                                {isReadOnly ? (

                                  <div className="h-7 pl-5 pr-2 flex items-center text-xs font-bold text-amber-300">

                                    {k.nakit ? fmt(Number(k.nakit)) : "0"}

                                  </div>

                                ) : (

                                  <input type="text" placeholder="0" disabled={isReadOnly} value={k.nakit}

                                    onChange={e=>kuryeDegistir(k.id,"nakit",e.target.value)}

                                    className="w-full bg-[#080b14] text-white h-7 text-xs font-bold pl-5 pr-1 rounded-lg outline-none focus:border-amber-500/40 disabled:opacity-40"/>

                                )}

                              </div>

                            </div>

                            <div className="col-span-3">

                              <div className={`relative rounded-lg border ${isReadOnly ? "border-blue-500/20 bg-blue-500/5" : "border-[#1a2236]"}`}>

                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-blue-600 text-[10px] font-bold">₺</span>

                                {isReadOnly ? (

                                  <div className="h-7 pl-5 pr-2 flex items-center text-xs font-bold text-blue-300">

                                    {k.pos ? fmt(Number(k.pos)) : "0"}

                                  </div>

                                ) : (

                                  <input type="text" placeholder="0" disabled={isReadOnly} value={k.pos}

                                    onChange={e=>kuryeDegistir(k.id,"pos",e.target.value)}

                                    className="w-full bg-[#080b14] text-white h-7 text-xs font-bold pl-5 pr-1 rounded-lg outline-none focus:border-blue-500/40 disabled:opacity-40"/>

                                )}

                              </div>

                            </div>

                          </div>

                          {!isReadOnly && k.tip!=="sabit" && (

                            <button type="button" onClick={()=>kuryeSil(k.id)}

                              className="absolute -right-5 top-1/2 -translate-y-1/2 text-gray-700 hover:text-red-400 transition-colors">

                              <Trash2 size={11}/>

                            </button>

                          )}

                        </div>

                      );

                    })}

                    <div className="pt-1 border-t border-[#1a2236] flex items-center justify-between text-[10px]">

                      <span className="text-gray-600">Gerçek toplam: <span className="text-gray-300 font-bold">{ch.tKuryeGercekPaket} pkt</span></span>

                      <span className="text-gray-600">Ödemeye esas toplam: <span className="text-amber-400 font-bold">{ch.tKuryePaket} pkt</span></span>

                    </div>

                  </div>

                </div>



                {/* Notlar */}

                <div className="rounded-xl border border-[#1a2236] bg-[#0c0f1a] overflow-hidden">

                  <div className="px-3 py-2 border-b border-[#1a2236]">

                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5"><StickyNote size={11}/>Notlar</span>

                  </div>

                  <div className="p-3">

                    <textarea value={notlar} disabled={isReadOnly} onChange={e=>setNotlar(e.target.value)}

                      placeholder="Özel durumlar, hatırlatmalar..."

                      rows={2}

                      className="w-full bg-[#080b14] border border-[#1a2236] hover:border-[#243050] focus:border-blue-500/40 text-white text-xs px-3 py-2 rounded-lg outline-none transition-all resize-none disabled:opacity-40 placeholder:text-gray-700"/>

                  </div>

                </div>



              </div>

            </div>



            {/* ÖZET BANT */}

            <div className="rounded-xl border border-[#1a2236] bg-[#080b14] px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 mt-1">

              <div className="flex flex-wrap items-center gap-4 text-xs">

                <div>

                  <p className="text-[9px] text-gray-600 uppercase tracking-widest">Online</p>

                  <p className="text-sm font-black text-blue-400">₺{fmt(ch.tOnline)}</p>

                </div>

                <span className="text-gray-800 hidden sm:block">+</span>

                <div>

                  <p className="text-[9px] text-gray-600 uppercase tracking-widest">Kasa</p>

                  <p className="text-sm font-black text-emerald-400">₺{fmt(ch.tKasa)}</p>

                </div>

                <span className="text-gray-800 hidden sm:block">+</span>

                <div>

                  <p className="text-[9px] text-gray-600 uppercase tracking-widest">Gider</p>

                  <p className="text-sm font-black text-red-300">₺{fmt(ch.tGider)}</p>

                </div>

                <span className="text-gray-800 hidden sm:block">=</span>

                <div>

                  <p className="text-[9px] text-blue-600 uppercase tracking-widest font-bold">Brüt</p>

                  <p className="text-sm font-black text-blue-300">₺{fmt(ch.brutCiro)}</p>

                </div>

                <span className="text-gray-800 hidden sm:block">−</span>

                <div><p className="text-[9px] text-gray-600 uppercase tracking-widest">Gider</p><p className="text-sm font-black text-red-400">₺{fmt(ch.tGider)}</p></div>

                <span className="text-gray-800 hidden sm:block">−</span>

                <div><p className="text-[9px] text-gray-600 uppercase tracking-widest">İade</p><p className="text-sm font-black text-orange-400">₺{fmt(ch.tIade)}</p></div>

                <span className="text-gray-800 hidden sm:block">=</span>

                <div><p className="text-[9px] text-emerald-700 uppercase tracking-widest font-bold">Net Ciro</p><p className="text-base font-black text-emerald-400">₺{fmt(ch.netCiro)}</p></div>

              </div>

              <div className="flex items-center gap-2">

                <button type="button" onClick={()=>{formuTemizle();setFormAcik(false);}}

                  className="text-xs font-semibold text-gray-500 hover:text-white border border-[#1a2236] hover:border-[#2a3550] px-4 py-2 rounded-xl transition-colors">

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

    <div className="h-screen bg-[#060810] flex flex-col items-center justify-center gap-3">

      <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"/>

      <span className="text-[10px] text-gray-600 uppercase tracking-[0.3em]">KEBO ERP Yükleniyor</span>

    </div>

  );



  // ── MAIN RENDER ──

  return (

    <div className="min-h-screen bg-[#060810] text-white font-sans antialiased">



      {/* NAV HEADER */}

      <div className="sticky top-0 z-40 border-b border-[#0f1624] bg-[#060810]/95 backdrop-blur-xl">

        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">

          <div className="flex items-center gap-3">

            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-900/40">

              <Layers className="h-4 w-4 text-white"/>

            </div>

            <div>

              <h1 className="text-sm font-black tracking-tight text-white leading-none">KEBO ERP</h1>

              <p className="text-[10px] text-gray-600 leading-none mt-0.5">Kasa Kapanış Sistemi</p>

            </div>

          </div>

          <div className="flex items-center gap-2">

            {raporlar.length>0 && (

              <>

                <button onClick={()=>exportCSV(raporlar,secilenAy,secilenYil)}

                  className="hidden sm:flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-emerald-400 border border-[#1a2236] hover:border-emerald-500/30 px-3 py-2 rounded-xl transition-colors">

                  <FileDown size={13}/> CSV

                </button>

                <button onClick={()=>exportPDF(raporlar,secilenAy,secilenYil)}

                  className="hidden sm:flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-red-400 border border-[#1a2236] hover:border-red-500/30 px-3 py-2 rounded-xl transition-colors">

                  <FileDown size={13}/> PDF

                </button>

              </>

            )}

            <button onClick={()=>setAiAcik(!aiAcik)}

              className={`flex items-center gap-1.5 text-[11px] font-semibold border px-3 py-2 rounded-xl transition-colors ${

                aiAcik ? "text-purple-300 border-purple-500/40 bg-purple-500/10" : "text-gray-500 hover:text-purple-400 border-[#1a2236] hover:border-purple-500/30"

              }`}>

              <Sparkles size={13}/> AI Analiz

            </button>

            <button onClick={veriCek}

              className="p-2 text-gray-600 hover:text-white border border-[#1a2236] hover:border-[#2a3550] rounded-xl transition-colors">

              <RefreshCw size={14}/>

            </button>

            {isAdmin && (

              <button onClick={()=>{setOnayModalTab("bekleyen");setOnayModalAcik(true);}}

                className={`relative flex items-center gap-1.5 text-[11px] font-semibold border px-3 py-2 rounded-xl transition-colors ${

                  onayBekleyenler.length>0 ? "text-amber-300 border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15" : "text-gray-500 hover:text-white border-[#1a2236] hover:border-[#2a3550]"

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

          <div className="rounded-2xl border border-purple-500/20 bg-[#0d0a1a] overflow-hidden">

            <div className="px-5 py-3 border-b border-purple-500/20 flex items-center gap-3">

              <div className="w-6 h-6 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">

                <Sparkles className="h-3.5 w-3.5 text-purple-400"/>

              </div>

              <span className="text-sm font-semibold text-purple-300">AI Rapor Analizi</span>

              <span className="text-[10px] text-gray-600 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">

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

                  className="flex-1 bg-[#080b14] border border-purple-500/20 focus:border-purple-500/40 text-white text-sm px-4 py-2.5 rounded-xl outline-none transition-all placeholder:text-gray-600"

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

                    className="text-[10px] text-gray-500 hover:text-purple-300 border border-[#1a2236] hover:border-purple-500/30 disabled:opacity-40 px-2.5 py-1 rounded-lg transition-colors">

                    {s}

                  </button>

                ))}

              </div>



              {aiCevap && (

                <div className="bg-[#080b14] border border-purple-500/10 rounded-xl p-4 text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">

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

          <div className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] overflow-hidden shadow-2xl">

            <div className="px-5 py-4 border-b border-[#1a2236] flex items-center justify-between">

              <div className="flex items-center gap-3">

                <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/20 flex items-center justify-center">

                  <TrendingUp className="h-3.5 w-3.5 text-blue-400"/>

                </div>

                <div>

                  <h2 className="text-sm font-bold text-white">

                    {selectedRapor ? (isEditMode ? "Raporu Düzenle" : "Rapor Detayı") : "Yeni Gün Sonu Raporu"}

                  </h2>

                  <p className="text-[10px] text-gray-600">{tarih ? fmtTarih(tarih) : "Tarih seçilmedi"}</p>

                </div>

              </div>

              <div className="flex items-center gap-2">

                {selectedRapor && (

                  <button onClick={()=>setPrintRapor(selectedRapor)}

                    className="p-2 text-gray-600 hover:text-white border border-[#1a2236] hover:border-[#2a3550] rounded-xl transition-colors">

                    <Printer size={14}/>

                  </button>

                )}

                <button onClick={()=>{formuTemizle();setFormAcik(false);}}

                  className="p-2 text-gray-600 hover:text-white border border-[#1a2236] hover:border-[#2a3550] rounded-xl transition-colors">

                  <X size={14}/>

                </button>

              </div>

            </div>

            <div className="p-5">{renderForm()}</div>

          </div>

        )}



        {!formAcik && <DashboardPanel raporlar={raporlar}/>}



        {!formAcik && (

          <div className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] overflow-hidden shadow-xl">

            <div className="px-5 py-4 border-b border-[#1a2236] flex flex-col sm:flex-row sm:items-center justify-between gap-3">

              <div className="flex items-center gap-3">

                <div className="w-7 h-7 rounded-lg bg-white/5 border border-[#1a2236] flex items-center justify-center">

                  <FileText className="h-3.5 w-3.5 text-gray-400"/>

                </div>

                <div>

                  <h3 className="text-sm font-semibold text-gray-200">Kapanış Arşivi</h3>

                  <p className="text-[10px] text-gray-600">

                    {AYLAR.find(m=>m.value===secilenAy)?.label} {secilenYil} · {raporlar.length} rapor

                  </p>

                </div>

              </div>

              <div className="flex items-center gap-3">

                {raporlar.length>0 && (

                  <div className="flex sm:hidden items-center gap-1">

                    <button onClick={()=>exportCSV(raporlar,secilenAy,secilenYil)} className="text-[10px] text-gray-600 hover:text-emerald-400 border border-[#1a2236] px-2.5 py-1.5 rounded-lg transition-colors">CSV</button>

                    <button onClick={()=>exportPDF(raporlar,secilenAy,secilenYil)} className="text-[10px] text-gray-600 hover:text-red-400 border border-[#1a2236] px-2.5 py-1.5 rounded-lg transition-colors">PDF</button>

                  </div>

                )}

                <div className="flex items-center gap-2 bg-[#080b14] border border-[#1a2236] px-3 py-2 rounded-xl">

                  <Calendar size={12} className="text-gray-600"/>

                  <select value={secilenAy} onChange={e=>setSecilenAy(e.target.value)}

                    className="bg-transparent text-xs font-semibold text-gray-300 outline-none cursor-pointer">

                    {AYLAR.map(m=><option key={m.value} value={m.value} className="bg-[#0c0f1a]">{m.label}</option>)}

                  </select>

                  <span className="text-gray-700">/</span>

                  <select value={secilenYil} onChange={e=>setSecilenYil(e.target.value)}

                    className="bg-transparent text-xs font-semibold text-gray-300 outline-none cursor-pointer">

                    {["2024","2025","2026","2027"].map(y=><option key={y} value={y} className="bg-[#0c0f1a]">{y}</option>)}

                  </select>

                </div>

              </div>

            </div>



            <div className="overflow-x-auto">

              <table className="w-full text-xs">

                <thead>

                  <tr className="border-b border-[#1a2236] bg-[#080b14]">

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

                    const tO=(rapor.os_yemeksepeti||0)+(rapor.os_getir||0)+(rapor.os_trendyol||0)+(rapor.os_migros||0)+(rapor.os_chicknfride||0);

                    const tK=(rapor.ko_yemeksepeti||0)+(rapor.ko_getir||0)+(rapor.ko_trendyol||0)+(rapor.ko_migros||0)+(rapor.ko_alo_paket||0)+(rapor.ko_chicknfride||0);

                    const brutCiro = brutHesapla(rapor);

                    const net = netHesapla(rapor);

                    const paket=rapor.kurye_raporlari?.reduce((s,k)=>s+(parseInt(k.paketSayisi)||0),0)||0;

                    const ort=paket>0?Math.round((tO+tK)/paket):0;

                    const gi=(rapor.gunluk_gider||0)+(rapor.iade_tutar||0);

                    return (

                      <tr key={rapor.id}

                        onClick={()=>{setSelectedRapor(rapor);raporuFormaYukle(rapor);setIsEditMode(false);setFormAcik(true);}}

                        className="hover:bg-white/[0.02] cursor-pointer transition-colors group">

                        <td className="px-4 py-3.5 font-semibold text-gray-300 group-hover:text-blue-400 transition-colors">

                          {new Date(rapor.tarih+"T12:00:00").toLocaleDateString("tr-TR")}

                          {rapor.gider_aciklama?.includes("|| NOT:") && <span className="ml-1.5 text-[9px] text-blue-500/60 bg-blue-500/10 px-1.5 py-0.5 rounded-full">Not</span>}

                        </td>

                        <td className="px-4 py-3.5 text-blue-400 font-semibold">₺{fmt(brutCiro)}</td>

                        <td className="px-4 py-3.5 text-emerald-400 font-black">₺{fmt(net)}</td>

                        <td className="px-4 py-3.5 text-amber-400 font-semibold">{paket}</td>

                        <td className="px-4 py-3.5 text-purple-400 font-bold">₺{fmt(ort)}</td>

                        <td className="px-4 py-3.5 text-red-400 font-medium">{gi>0?`-₺${fmt(gi)}`:"—"}</td>

                        <td className="px-4 py-3.5">

                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">

                            <span className="text-[10px] text-gray-500 flex items-center gap-1"><Eye size={10}/> İncele</span>

                            <button onClick={e=>{e.stopPropagation();setPrintRapor(rapor);}}

                              className="p-1 text-gray-600 hover:text-gray-300 rounded transition-colors ml-1">

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

                    <tr className="border-t-2 border-[#1a2236] bg-[#080b14]">

                      <td className="px-4 py-3 text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Dönem Toplamı</td>

                      <td className="px-4 py-3 text-blue-400 font-black">₺{fmt(tabloToplam.brut)}</td>

                      <td className="px-4 py-3 text-emerald-400 font-black text-sm">₺{fmt(tabloToplam.net)}</td>

                      <td className="px-4 py-3 text-amber-400 font-black">{tabloToplam.paket}</td>

                      <td className="px-4 py-3 text-purple-400 font-black">₺{fmt(tabloToplam.paketOrt)}</td>

                      <td className="px-4 py-3 text-red-400 font-black">-₺{fmt(tabloToplam.giderIade)}</td>

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

          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">

            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a2236]">

              <p className="text-sm font-black text-white flex items-center gap-2"><AlertTriangle size={15} className="text-amber-400"/> Rapor Değişiklik Talepleri</p>

              <button onClick={()=>setOnayModalAcik(false)} className="text-gray-600 hover:text-white"><X size={16}/></button>

            </div>

            <div className="flex gap-2 px-5 pt-3">

              <button onClick={()=>setOnayModalTab("bekleyen")}

                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${onayModalTab==="bekleyen"?"bg-amber-500/15 text-amber-300 border border-amber-500/30":"text-gray-500 hover:text-white"}`}>

                Bekleyen ({onayBekleyenler.length})

              </button>

              <button onClick={()=>setOnayModalTab("gecmis")}

                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${onayModalTab==="gecmis"?"bg-blue-500/15 text-blue-300 border border-blue-500/30":"text-gray-500 hover:text-white"}`}>

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

                        <p className="text-xs font-bold text-white">{fmtTarih(talep.rapor_tarihi)} tarihli rapor</p>

                        <p className="text-[10px] text-gray-500">{talep.talep_eden} · {new Date(talep.talep_tarihi).toLocaleString("tr-TR")}</p>

                      </div>

                      <div className="space-y-1 mb-3">

                        {farklar.length===0 ? (

                          <p className="text-[11px] text-gray-600">Değişiklik tespit edilemedi.</p>

                        ) : farklar.map((f,i)=>(

                          <div key={i} className="flex items-center justify-between text-[11px] bg-black/20 rounded-lg px-2.5 py-1.5">

                            <span className="text-gray-400">{f.alan}</span>

                            <span className="flex items-center gap-1.5">

                              <span className="text-gray-600 line-through">{typeof f.eskiDeger==="number"?`₺${fmt(f.eskiDeger)}`:(f.eskiDeger||"—")}</span>

                              <span className="text-gray-600">→</span>

                              <span className="text-emerald-400 font-semibold">{typeof f.yeniDeger==="number"?`₺${fmt(f.yeniDeger)}`:(f.yeniDeger||"—")}</span>

                            </span>

                          </div>

                        ))}

                      </div>

                      <div className="flex gap-2">

                        <button onClick={()=>handleTalepReddet(talep)} disabled={onayIslemId===talep.id}

                          className="flex-1 text-xs font-bold text-red-400 border border-red-500/30 hover:bg-red-500/10 disabled:opacity-40 py-2 rounded-lg transition-colors">

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

                    <p className="text-white font-semibold mb-1">{fmtTarih(talep.rapor_tarihi)} tarihli rapor</p>

                    <p className="text-gray-400">

                      <span className="font-semibold">{talep.talep_eden}</span> düzenleme yaptı ({new Date(talep.talep_tarihi).toLocaleString("tr-TR")})

                    </p>

                    <p className={talep.durum==="onaylandi"?"text-emerald-400":"text-red-400"}>

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
