"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  FileText, PlusCircle, Loader2, TrendingUp, Wallet, CheckCircle2, Bike,
  XCircle, Trash2, Monitor, Home, Edit3, Eye, AlertTriangle, BarChart3,
  Calendar, Lock, User, Clock, ShieldAlert, Check, X, ArrowUpRight,
  Layers, Bell, Printer, ChevronDown, ChevronUp, PieChart, Activity,
  RefreshCw, Download, FileDown, StickyNote, DollarSign, Package,
  RotateCcw, Save, Slash, TrendingDown, Hash
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface KuryeRaporu {
  id: number; isim: string; nakit: string; pos: string; paketSayisi: string;
}
interface SatirRaporu {
  id: number; aciklama: string; tutar: string;
}
interface GunlukRapor {
  id: string; tarih: string;
  os_yemeksepeti: number; os_getir: number; os_trendyol: number; os_migros: number;
  ko_yemeksepeti: number; ko_getir: number; ko_trendyol: number; ko_migros: number; ko_alo_paket: number;
  kasa_nakit: number; kasa_pos: number; kasa_edenred: number;
  gunluk_gider: number; gider_aciklama?: string;
  iade_tutar: number; iade_aciklama?: string;
  kurye_raporlari?: KuryeRaporu[];
  toplam_ciro: number; ekleyen_kullanici: string; created_at?: string;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const FALLBACK_PERSONELLER = ["Ahmet Yılmaz","Mehmet Kaya","Can Demir","Ali Öztürk","Mustafa Şahin"];

const AYLAR = [
  {value:"01",label:"Ocak"},{value:"02",label:"Şubat"},{value:"03",label:"Mart"},
  {value:"04",label:"Nisan"},{value:"05",label:"Mayıs"},{value:"06",label:"Haziran"},
  {value:"07",label:"Temmuz"},{value:"08",label:"Ağustos"},{value:"09",label:"Eylül"},
  {value:"10",label:"Ekim"},{value:"11",label:"Kasım"},{value:"12",label:"Aralık"},
];

const PLATFORM_COLORS: Record<string,string> = {
  Yemeksepeti:"#FF6B35", Getir:"#8B5CF6", Trendyol:"#F97316", Migros:"#10B981", "Alo Paket":"#3B82F6",
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const tv = (val: string | number): number => {
  if (!val) return 0;
  return parseFloat(val.toString().replace(/\./g,"").replace(/,/g,"")) || 0;
};
const fmt = (val: number): string => new Intl.NumberFormat("tr-TR").format(Math.round(val));
const fmtStr = (val: string): string => {
  const s = tv(val); if (s===0 && val==="") return "";
  return new Intl.NumberFormat("tr-TR").format(s);
};
const fmtTarih = (t: string) => { if(!t) return ""; const [y,m,d]=t.split("-"); return `${d}.${m}.${y}`; };

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
    const t={Yemeksepeti:0,Getir:0,Trendyol:0,Migros:0,"Alo Paket":0};
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
  const trendValues = sorted.slice(-14).map(r=>r.toplam_ciro||0);
  const netTrend = sorted.slice(-14).map(r=>(r.toplam_ciro||0)-(r.gunluk_gider||0)-(r.iade_tutar||0));
  const gunlukOrt = raporlar.length>0 ? Math.round(raporlar.reduce((s,r)=>s+(r.toplam_ciro||0),0)/raporlar.length) : 0;
  const enYuksek = raporlar.reduce((b,r)=>r.toplam_ciro>(b?.toplam_ciro||0)?r:b, raporlar[0]);
  const toplamPaket = raporlar.reduce((s,r)=>s+(r.kurye_raporlari?.reduce((ks,k)=>ks+(parseInt(k.paketSayisi)||0),0)||0),0);

  // Chart.js günlük ciro grafiği
  useEffect(()=>{
    if (!acik || !chartRef.current || sorted.length===0) return;
    const loadChart = async () => {
      // @ts-ignore
      if (!window.Chart) {
        await new Promise<void>(resolve=>{
          const s = document.createElement("script");
          s.src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";
          s.onload=()=>resolve(); document.head.appendChild(s);
        });
      }
      if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current=null; }
      const labels = sorted.map(r=>fmtTarih(r.tarih).substring(0,5));
      const brut = sorted.map(r=>r.toplam_ciro||0);
      const net = sorted.map(r=>(r.toplam_ciro||0)-(r.gunluk_gider||0)-(r.iade_tutar||0));
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
  },[acik, sorted]);

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
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {label:"Günlük Ort. Brüt", value:`₺${fmt(gunlukOrt)}`, sub:"brüt ciro", spark:trendValues, color:"#60A5FA"},
              {label:"Günlük Ort. Net", value:`₺${fmt(netTrend.reduce((s,v)=>s+v,0)/Math.max(netTrend.length,1))}`, sub:"net ciro", spark:netTrend, color:"#34D399"},
              {label:"En Yüksek Gün", value:`₺${fmt(enYuksek?.toplam_ciro||0)}`, sub:enYuksek?fmtTarih(enYuksek.tarih):"—", spark:null, color:"#FBBF24"},
              {label:"Toplam Paket", value:fmt(toplamPaket), sub:"adet dağıtım", spark:null, color:"#A78BFA"},
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

          {/* Platform dağılımı + Günlük ciro grafiği */}
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
            {/* Platform */}
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

            {/* Günlük ciro grafiği */}
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
  const tO=(rapor.os_yemeksepeti||0)+(rapor.os_getir||0)+(rapor.os_trendyol||0)+(rapor.os_migros||0);
  const tK=(rapor.ko_yemeksepeti||0)+(rapor.ko_getir||0)+(rapor.ko_trendyol||0)+(rapor.ko_migros||0)+(rapor.ko_alo_paket||0);
  const tKasa=(rapor.kasa_nakit||0)+(rapor.kasa_pos||0)+(rapor.kasa_edenred||0);
  const net=(rapor.toplam_ciro||0)-(rapor.gunluk_gider||0)-(rapor.iade_tutar||0);
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
            <div className="row bold"><span>Online Toplam</span><span>₺{fmt(tO)}</span></div>
            <hr className="divider"/>
            <div className="section-title">Kapıda Ödeme</div>
            {rapor.ko_yemeksepeti>0&&<div className="row"><span>YS Kapıda</span><span>₺{fmt(rapor.ko_yemeksepeti)}</span></div>}
            {rapor.ko_getir>0&&<div className="row"><span>Getir Kapıda</span><span>₺{fmt(rapor.ko_getir)}</span></div>}
            {rapor.ko_trendyol>0&&<div className="row"><span>Trendyol Kapıda</span><span>₺{fmt(rapor.ko_trendyol)}</span></div>}
            {rapor.ko_migros>0&&<div className="row"><span>Migros Kapıda</span><span>₺{fmt(rapor.ko_migros)}</span></div>}
            {rapor.ko_alo_paket>0&&<div className="row"><span>Alo Paket</span><span>₺{fmt(rapor.ko_alo_paket)}</span></div>}
            <div className="row bold"><span>Kapıda Toplam</span><span>₺{fmt(tK)}</span></div>
            <hr className="divider"/>
            <div className="section-title">Fiziki Kasa</div>
            {rapor.kasa_nakit>0&&<div className="row"><span>Nakit</span><span>₺{fmt(rapor.kasa_nakit)}</span></div>}
            {rapor.kasa_pos>0&&<div className="row"><span>POS / K.Kartı</span><span>₺{fmt(rapor.kasa_pos)}</span></div>}
            {rapor.kasa_edenred>0&&<div className="row"><span>Edenred / Sodexo</span><span>₺{fmt(rapor.kasa_edenred)}</span></div>}
            <div className="row bold"><span>Kasa Toplam</span><span>₺{fmt(tKasa)}</span></div>
            <hr className="divider"/>
            <div className="row bold" style={{fontSize:"13px"}}><span>BRÜT CİRO</span><span>₺{fmt(rapor.toplam_ciro)}</span></div>
            {rapor.gunluk_gider>0&&<div className="row"><span>(-) Giderler</span><span>-₺{fmt(rapor.gunluk_gider)}</span></div>}
            {rapor.iade_tutar>0&&<div className="row"><span>(-) İadeler</span><span>-₺{fmt(rapor.iade_tutar)}</span></div>}
            <div className="row net"><span>✦ NET CİRO</span><span>₺{fmt(net)}</span></div>
            {rapor.kurye_raporlari && rapor.kurye_raporlari.length>0&&<>
              <hr className="divider"/>
              <div className="section-title">Kurye Mutabakatı ({toplamPaket} Paket)</div>
              {rapor.kurye_raporlari.map((k,i)=>(
                <div key={i} className="row"><span>{k.isim||"—"}</span>
                  <span>{k.paketSayisi} pkt · Nakit:₺{fmt(Number(k.nakit))} · POS:₺{fmt(Number(k.pos))}</span>
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
    const tO=(r.os_yemeksepeti||0)+(r.os_getir||0)+(r.os_trendyol||0)+(r.os_migros||0);
    const tK=(r.ko_yemeksepeti||0)+(r.ko_getir||0)+(r.ko_trendyol||0)+(r.ko_migros||0)+(r.ko_alo_paket||0);
    const tKasa=(r.kasa_nakit||0)+(r.kasa_pos||0)+(r.kasa_edenred||0);
    const net=(r.toplam_ciro||0)-(r.gunluk_gider||0)-(r.iade_tutar||0);
    const paket=r.kurye_raporlari?.reduce((s,k)=>s+(parseInt(k.paketSayisi)||0),0)||0;
    return [fmtTarih(r.tarih),r.toplam_ciro,net,tO,tK,tKasa,r.gunluk_gider||0,r.iade_tutar||0,paket,r.ekleyen_kullanici].join(",");
  });
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url;
  a.download=`KEBO_Rapor_${ayLabel}_${yil}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ─── PDF EXPORT (via print) ───────────────────────────────────────────────────

function exportPDF(raporlar: GunlukRapor[], ay: string, yil: string) {
  const ayLabel = ["","Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"][parseInt(ay)];
  const rows = raporlar.map(r=>{
    const net=(r.toplam_ciro||0)-(r.gunluk_gider||0)-(r.iade_tutar||0);
    const tO=(r.os_yemeksepeti||0)+(r.os_getir||0)+(r.os_trendyol||0)+(r.os_migros||0);
    const tK=(r.ko_yemeksepeti||0)+(r.ko_getir||0)+(r.ko_trendyol||0)+(r.ko_migros||0)+(r.ko_alo_paket||0);
    const paket=r.kurye_raporlari?.reduce((s,k)=>s+(parseInt(k.paketSayisi)||0),0)||0;
    return `<tr><td>${fmtTarih(r.tarih)}</td><td>₺${fmt(r.toplam_ciro)}</td><td style="color:#16a34a;font-weight:700">₺${fmt(net)}</td>
      <td>₺${fmt(tO+tK)}</td><td style="color:#dc2626">-₺${fmt((r.gunluk_gider||0)+(r.iade_tutar||0))}</td><td>${paket}</td><td>${r.ekleyen_kullanici}</td></tr>`;
  }).join("");
  const toplam = raporlar.reduce((s,r)=>s+(r.toplam_ciro||0),0);
  const toplamNet = raporlar.reduce((s,r)=>s+(r.toplam_ciro||0)-(r.gunluk_gider||0)-(r.iade_tutar||0),0);
  const w=window.open("","_blank"); if(!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>KEBO ERP — ${ayLabel} ${yil}</title>
  <style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:system-ui,sans-serif;font-size:11px;color:#111;background:#fff;padding:32px;}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #0c1a3a;}
  .logo{font-size:28px;font-weight:900;letter-spacing:3px;color:#0c1a3a;}
  .logo span{color:#3B82F6;}
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
  <table><thead><tr><th>Tarih</th><th>Brüt Ciro</th><th>Net Ciro</th><th>Platform Ciro</th><th>Gider+İade</th><th>Paket</th><th>Giren</th></tr></thead>
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

// ─── SECTION CARD ─────────────────────────────────────────────────────────────

function SectionCard({title, icon, color="blue", total, totalColor="blue", children, action}:
  {title:string, icon:React.ReactNode, color?:string, total?:string, totalColor?:string, children:React.ReactNode, action?:React.ReactNode}) {
  const borderMap: Record<string,string> = {
    blue:"border-blue-500/20", purple:"border-purple-500/20", emerald:"border-emerald-500/20",
    red:"border-red-500/20", orange:"border-orange-500/20", amber:"border-amber-500/20",
  };
  const bgMap: Record<string,string> = {
    blue:"bg-blue-500/10", purple:"bg-purple-500/10", emerald:"bg-emerald-500/10",
    red:"bg-red-500/10", orange:"bg-orange-500/10", amber:"bg-amber-500/10",
  };
  const textMap: Record<string,string> = {
    blue:"text-blue-400", purple:"text-purple-400", emerald:"text-emerald-400",
    red:"text-red-400", orange:"text-orange-400", amber:"text-amber-400",
  };
  return (
    <div className={`rounded-2xl border bg-[#0c0f1a] overflow-hidden ${borderMap[color]||"border-[#1a2236]"}`}>
      <div className={`px-4 py-3 border-b ${borderMap[color]||"border-[#1a2236]"} flex items-center justify-between`}>
        <div className="flex items-center gap-2.5">
          <div className={`w-6 h-6 rounded-lg ${bgMap[color]} flex items-center justify-center`}>
            <span className={textMap[color]}>{icon}</span>
          </div>
          <span className={`text-xs font-semibold ${textMap[color]} uppercase tracking-wider`}>{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {action}
          {total && (
            <span className={`text-sm font-black ${textMap[totalColor||color]}`}>{total}</span>
          )}
        </div>
      </div>
      <div className="p-4">{children}</div>
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
  const [userEmail, setUserEmail] = useState("");
  const [raporlar, setRaporlar] = useState<GunlukRapor[]>([]);
  const [enSonRaporTarihi, setEnSonRaporTarihi] = useState<string|null>(null);
  const [mevcutTarihler, setMevcutTarihler] = useState<Set<string>>(new Set());
  const [personelListesi, setPersonelListesi] = useState<string[]>(FALLBACK_PERSONELLER);
  const [secilenAy, setSecilenAy] = useState(()=>String(new Date().getMonth()+1).padStart(2,"0"));
  const [secilenYil, setSecilenYil] = useState(()=>String(new Date().getFullYear()));

  // ── UI State ──
  const [formAcik, setFormAcik] = useState(false);
  const [selectedRapor, setSelectedRapor] = useState<GunlukRapor|null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [printRapor, setPrintRapor] = useState<GunlukRapor|null>(null);
  const [duplikaTarihHata, setDuplikaTarihHata] = useState(false);

  // ── Form Fields ──
  const [tarih, setTarih] = useState("");
  const [tarihHataVarMi, setTarihHataVarMi] = useState(false);
  const [adminOnayliGecis, setAdminOnayliGecis] = useState(false);
  const [osYS, setOsYS] = useState(""); const [osGetir, setOsGetir] = useState("");
  const [osTrendyol, setOsTrendyol] = useState(""); const [osMigros, setOsMigros] = useState("");
  const [koYS, setKoYS] = useState(""); const [koGetir, setKoGetir] = useState("");
  const [koTrendyol, setKoTrendyol] = useState(""); const [koMigros, setKoMigros] = useState("");
  const [koAlo, setKoAlo] = useState("");
  const [kasaNakit, setKasaNakit] = useState(""); const [kasaPos, setKasaPos] = useState("");
  const [kasaEdenred, setKasaEdenred] = useState("");
  const [giderler, setGiderler] = useState<SatirRaporu[]>([{id:Date.now(),aciklama:"",tutar:""}]);
  const [iadeler, setIadeler] = useState<SatirRaporu[]>([{id:Date.now(),aciklama:"",tutar:""}]);
  const [kuryeler, setKuryeler] = useState<KuryeRaporu[]>([{id:Date.now(),isim:"",nakit:"",pos:"",paketSayisi:""}]);
  const [notlar, setNotlar] = useState("");

  // ── Data Fetch ──
  const veriCek = useCallback(async () => {
    setLoading(true);
    const {data:{user}} = await supabase.auth.getUser();
    const mail = user?.email||""; setUserEmail(mail);
    setIsAdmin(mail==="murat@kebo.com"||mail==="bulent@kebo.com");

    const {data:sonRapor} = await supabase.from("gunluk_raporlar").select("tarih").order("tarih",{ascending:false}).limit(1);
    setEnSonRaporTarihi(sonRapor?.[0]?.tarih??null);

    // Tüm mevcut tarihleri çek (duplicate kontrolü için)
    const {data:tumTarihler} = await supabase.from("gunluk_raporlar").select("tarih");
    setMevcutTarihler(new Set((tumTarihler||[]).map((r:any)=>r.tarih)));

    const {data:personelData} = await supabase.from("personeller").select("isim").eq("aktif",true).order("isim");
    if (personelData?.length) setPersonelListesi(personelData.map((p:any)=>p.isim));

    const ayNum=parseInt(secilenAy), yilNum=parseInt(secilenYil);
    const ayinSonGunu = new Date(yilNum, ayNum, 0).getDate();
    const {data,error} = await supabase.from("gunluk_raporlar").select("*")
      .gte("tarih", `${secilenYil}-${secilenAy}-01`)
      .lte("tarih", `${secilenYil}-${secilenAy}-${String(ayinSonGunu).padStart(2,"0")}`)
      .order("tarih",{ascending:false});
    if (!error&&data) setRaporlar(data as GunlukRapor[]);
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
    if (!val||selectedRapor||!enSonRaporTarihi) { setTarihHataVarMi(false); return; }

    // Duplicate kontrolü — aynı tarih zaten var mı?
    if (mevcutTarihler.has(val)) { setDuplikaTarihHata(true); setTarihHataVarMi(false); return; }

    const dogruTarih = siradakiTarih();
    setTarihHataVarMi(!!dogruTarih && val!==dogruTarih);
  };

  const formuTemizle = () => {
    setOsYS("");setOsGetir("");setOsTrendyol("");setOsMigros("");
    setKoYS("");setKoGetir("");setKoTrendyol("");setKoMigros("");setKoAlo("");
    setKasaNakit("");setKasaPos("");setKasaEdenred("");
    setGiderler([{id:Date.now(),aciklama:"",tutar:""}]);
    setIadeler([{id:Date.now(),aciklama:"",tutar:""}]);
    setTarih("");setTarihHataVarMi(false);setAdminOnayliGecis(false);setDuplikaTarihHata(false);
    setKuryeler([{id:Date.now(),isim:"",nakit:"",pos:"",paketSayisi:""}]);
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

  const raporuFormaYukle = (r: GunlukRapor) => {
    setTarih(r.tarih); setTarihHataVarMi(false); setAdminOnayliGecis(false); setDuplikaTarihHata(false);
    setOsYS(fmt(r.os_yemeksepeti)); setOsGetir(fmt(r.os_getir));
    setOsTrendyol(fmt(r.os_trendyol)); setOsMigros(fmt(r.os_migros));
    setKoYS(fmt(r.ko_yemeksepeti)); setKoGetir(fmt(r.ko_getir));
    setKoTrendyol(fmt(r.ko_trendyol)); setKoMigros(fmt(r.ko_migros)); setKoAlo(fmt(r.ko_alo_paket));
    setKasaNakit(fmt(r.kasa_nakit)); setKasaPos(fmt(r.kasa_pos)); setKasaEdenred(fmt(r.kasa_edenred));
    // setNotlar yukluNot ile zaten set edildi (yukarıda)
    setKuryeler(r.kurye_raporlari?.length
      ? r.kurye_raporlari.map(k=>({...k,nakit:fmt(Number(k.nakit)),pos:fmt(Number(k.pos))}))
      : [{id:Date.now(),isim:"",nakit:"",pos:"",paketSayisi:""}]);
    // Giderler parse — NOT: kısmını ayır
    const giderAciklamaHam = r.gider_aciklama || "";
    const notAyraci = giderAciklamaHam.indexOf(" || NOT: ");
    const sadeceGider = notAyraci > -1 ? giderAciklamaHam.substring(0, notAyraci) : giderAciklamaHam;
    const yukluNot = notAyraci > -1 ? giderAciklamaHam.substring(notAyraci + 9) : "";
    setNotlar(yukluNot);
    setGiderler(sadeceGider
      ? sadeceGider.split(" | ").map((g,i)=>{
          const colonIdx=g.lastIndexOf(": ₺");
          return {id:Date.now()+i, aciklama:colonIdx>-1?g.substring(0,colonIdx):"", tutar:colonIdx>-1?g.substring(colonIdx+3):""};
        })
      : [{id:Date.now(),aciklama:"",tutar:""}]);
    // İadeler parse
    setIadeler(r.iade_aciklama
      ? r.iade_aciklama.split(" | ").map((g,i)=>{
          const colonIdx=g.lastIndexOf(": ₺");
          return {id:Date.now()+i+1000, aciklama:colonIdx>-1?g.substring(0,colonIdx):"", tutar:colonIdx>-1?g.substring(colonIdx+3):""};
        })
      : [{id:Date.now()+1000,aciklama:"",tutar:""}]);
  };

  // ── Live calculations ──
  const ch = useMemo(()=>{
    const tOnline=tv(osYS)+tv(osGetir)+tv(osTrendyol)+tv(osMigros);
    const tKapida=tv(koYS)+tv(koGetir)+tv(koTrendyol)+tv(koMigros)+tv(koAlo);
    const tKasa=tv(kasaNakit)+tv(kasaPos)+tv(kasaEdenred);
    const brutCiro=tOnline+tKapida+tKasa;
    const tGider=giderler.reduce((a,g)=>a+tv(g.tutar),0);
    const tIade=iadeler.reduce((a,i)=>a+tv(i.tutar),0);
    const netCiro=brutCiro-tGider-tIade;
    const tKuryePaket=kuryeler.reduce((a,k)=>a+(parseInt(k.paketSayisi)||0),0);
    const tKuryeTahsilat=kuryeler.reduce((a,k)=>a+tv(k.nakit)+tv(k.pos),0);
    const paketOrt=tKuryePaket>0?Math.round((tOnline+tKapida)/tKuryePaket):0;
    const kuryeFark=tKapida-tKuryeTahsilat;
    return {tOnline,tKapida,tKasa,brutCiro,tGider,tIade,netCiro,tKuryePaket,tKuryeTahsilat,paketOrt,kuryeFark};
  },[osYS,osGetir,osTrendyol,osMigros,koYS,koGetir,koTrendyol,koMigros,koAlo,kasaNakit,kasaPos,kasaEdenred,giderler,iadeler,kuryeler]);

  // ── Table totals ──
  const tabloToplam = useMemo(()=>{
    let brut=0,net=0,paket=0,giderIade=0,paketCiro=0;
    raporlar.forEach(r=>{
      brut+=r.toplam_ciro||0;
      giderIade+=(r.gunluk_gider||0)+(r.iade_tutar||0);
      net+=(r.toplam_ciro||0)-(r.gunluk_gider||0)-(r.iade_tutar||0);
      paket+=r.kurye_raporlari?.reduce((s,k)=>s+(parseInt(k.paketSayisi)||0),0)||0;
      paketCiro+=(r.os_yemeksepeti||0)+(r.os_getir||0)+(r.os_trendyol||0)+(r.os_migros||0)+(r.ko_yemeksepeti||0)+(r.ko_getir||0)+(r.ko_trendyol||0)+(r.ko_migros||0)+(r.ko_alo_paket||0);
    });
    return {brut,net,paket,giderIade,paketOrt:paket>0?Math.round(paketCiro/paket):0};
  },[raporlar]);

  // ── Handlers ──
  const giderEkle = ()=>setGiderler([...giderler,{id:Date.now(),aciklama:"",tutar:""}]);
  const giderSil = (id:number)=>setGiderler(giderler.filter(g=>g.id!==id));
  const giderDegistir = (id:number,field:"aciklama"|"tutar",val:string)=>
    setGiderler(giderler.map(g=>g.id===id?{...g,[field]:field==="tutar"?fmtStr(val):val}:g));

  const iadeEkle = ()=>setIadeler([...iadeler,{id:Date.now(),aciklama:"",tutar:""}]);
  const iadeSil = (id:number)=>setIadeler(iadeler.filter(i=>i.id!==id));
  const iadeDegistir = (id:number,field:"aciklama"|"tutar",val:string)=>
    setIadeler(iadeler.map(i=>i.id===id?{...i,[field]:field==="tutar"?fmtStr(val):val}:i));

  const kuryeEkle = ()=>setKuryeler([...kuryeler,{id:Date.now(),isim:"",nakit:"",pos:"",paketSayisi:""}]);
  const kuryeSil = (id:number)=>setKuryeler(kuryeler.filter(k=>k.id!==id));
  const kuryeDegistir = (id:number,field:keyof KuryeRaporu,val:string)=>{
    const v=(field==="nakit"||field==="pos")?fmtStr(val):val;
    setKuryeler(kuryeler.map(k=>k.id===id?{...k,[field]:v}:k));
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
      const birlesikGider = giderler.filter(g=>g.tutar||g.aciklama).map(g=>`${g.aciklama||"Belirtilmemiş"}: ₺${g.tutar}`).join(" | ");
      const birlesikIade = iadeler.filter(i=>i.tutar||i.aciklama).map(i=>`${i.aciklama||"Belirtilmemiş"}: ₺${i.tutar}`).join(" | ");
      // Notlar gider_aciklama'nın sonuna eklenir (notlar kolonu yoksa veri kaybolmaz)
      const giderAciklamaFinal = notlar ? (birlesikGider ? `${birlesikGider} || NOT: ${notlar}` : `NOT: ${notlar}`) : birlesikGider;
      const temizKuryeler = kuryeler.map(k=>({...k,nakit:tv(k.nakit).toString(),pos:tv(k.pos).toString()}));
      const raporData = {
        tarih,
        os_yemeksepeti:tv(osYS), os_getir:tv(osGetir), os_trendyol:tv(osTrendyol), os_migros:tv(osMigros),
        ko_yemeksepeti:tv(koYS), ko_getir:tv(koGetir), ko_trendyol:tv(koTrendyol), ko_migros:tv(koMigros), ko_alo_paket:tv(koAlo),
        kasa_nakit:tv(kasaNakit), kasa_pos:tv(kasaPos), kasa_edenred:tv(kasaEdenred),
        gunluk_gider:ch.tGider, gider_aciklama:giderAciklamaFinal,
        iade_tutar:ch.tIade, iade_aciklama:birlesikIade,
        kurye_raporlari:temizKuryeler,
        toplam_ciro:ch.brutCiro,
        ekleyen_kullanici:selectedRapor?`${selectedRapor.ekleyen_kullanici} | Düz:${ekleyen}`:ekleyen,
      };
      let error;
      if (selectedRapor) {
        error=(await supabase.from("gunluk_raporlar").update(raporData).eq("id",selectedRapor.id)).error;
      } else {
        error=(await supabase.from("gunluk_raporlar").insert([raporData])).error;
      }
      if (error) { alert("Hata: "+error.message); return; }

      // Not: Kasa bakiyesi artık doğrudan gunluk_raporlar tablosundan okunuyor.
      // kasa_hareketleri tablosuna ayrı kayıt açılmıyor.

      // ── Platform Tahsilat Takibi — Upsert (ekle + düzenleme + silme senkron) ──
      const PLATFORM_GECIKME: Record<string, number> = {
        "Yemeksepeti": 14, "Getir": 7, "Trendyol": 14, "Migros": 15, "Alo Paket": 2,
      };

      // Bu güne ait tüm platform tutarlarını hesapla
      const platformSatislar = [
        { platform: "Yemeksepeti", tutar: tv(osYS) + tv(koYS) },
        { platform: "Getir",       tutar: tv(osGetir) + tv(koGetir) },
        { platform: "Trendyol",    tutar: tv(osTrendyol) + tv(koTrendyol) },
        { platform: "Migros",      tutar: tv(osMigros) + tv(koMigros) },
        { platform: "Alo Paket",   tutar: tv(koAlo) },
      ];

      // Bu güne ait mevcut platform_tahsilatlar kayıtlarını çek
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
            // Mevcut kayıt var → sadece satis_tutari ve beklenen_tarih güncelle
            // (tahsilat verileri — durum, gunluk_tahsilatlar — dokunma)
            await supabase.from("platform_tahsilatlar").update({
              satis_tutari: p.tutar,
              beklenen_odeme_tarihi: beklenenTarihStr,
              aciklama: `Günlük rapor — ${fmtTarih(tarih)}`,
            }).eq("id", mevcut.id);
          } else {
            // Yeni kayıt ekle
            await supabase.from("platform_tahsilatlar").insert([{
              platform: p.platform,
              satis_tarihi: tarih,
              satis_tutari: p.tutar,
              beklenen_odeme_tarihi: beklenenTarihStr,
              durum: "bekliyor",
              aciklama: `Günlük rapor — ${fmtTarih(tarih)}`,
              ekleyen_kullanici: ekleyen,
            }]);
          }
        } else if (mevcut && (mevcut.durum === "bekliyor")) {
          // Tutar sıfırlandı ve henüz tahsilat yapılmamış → kaydı sil
          await supabase.from("platform_tahsilatlar").delete().eq("id", mevcut.id);
        }
        // Not: Tutar 0 olsa bile tahsilat yapılmışsa (kismen/tamamlandi) kaydı silmiyoruz
      }

      formuTemizle(); setFormAcik(false); veriCek();
    } catch(err:any) { alert("Hata: "+err.message); }
    finally { setSaving(false); }
  };

  // ── Derived ──
  const beklenenTarih = siradakiTarih();
  const formKilitli = !tarih || (tarihHataVarMi && !adminOnayliGecis) || duplikaTarihHata;
  const isReadOnly = !!(selectedRapor && !isEditMode);

  // ─── FORM ───────────────────────────────────────────────────────────────────

  const renderSatirListesi = (
    items: SatirRaporu[],
    onAdd: ()=>void,
    onRemove: (id:number)=>void,
    onChange: (id:number,field:"aciklama"|"tutar",val:string)=>void,
    color: string,
    aciklamaPlaceholder: string,
    isReadOnly: boolean
  ) => (
    <div className="space-y-2">
      {items.map((item,idx)=>(
        <div key={item.id} className="flex gap-2 items-start">
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-5 gap-2">
            {/* Önce açıklama */}
            <div className="sm:col-span-3">
              {idx===0&&<label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Açıklama</label>}
              <input type="text" placeholder={aciklamaPlaceholder} disabled={isReadOnly} value={item.aciklama}
                onChange={e=>onChange(item.id,"aciklama",e.target.value)}
                className="w-full bg-[#080b14] border border-[#1a2236] hover:border-[#243050] focus:border-blue-500/50 text-white text-sm h-9 px-3 rounded-xl outline-none transition-all disabled:opacity-40 placeholder:text-gray-700"/>
            </div>
            {/* Sonra tutar */}
            <div className="sm:col-span-2">
              {idx===0&&<label className="block text-[10px] text-gray-600 uppercase tracking-wide font-medium mb-1">Tutar</label>}
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-xs">₺</span>
                <input type="text" placeholder="0" disabled={isReadOnly} value={item.tutar}
                  onChange={e=>onChange(item.id,"tutar",e.target.value)}
                  className="w-full bg-[#080b14] border border-[#1a2236] hover:border-[#243050] focus:border-blue-500/50 text-white text-sm font-bold h-9 pl-7 pr-3 rounded-xl outline-none transition-all disabled:opacity-40"/>
              </div>
            </div>
          </div>
          {!isReadOnly && items.length>1 && (
            <button type="button" onClick={()=>onRemove(item.id)}
              className={`mt-${idx===0?"6":"0"} p-2 text-gray-700 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors`}>
              <Trash2 size={13}/>
            </button>
          )}
        </div>
      ))}
      {!isReadOnly && (
        <button type="button" onClick={onAdd}
          className="mt-1 text-[11px] text-gray-600 hover:text-blue-400 flex items-center gap-1.5 transition-colors">
          <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-xs">+</span>
          Satır Ekle
        </button>
      )}
    </div>
  );

  const renderForm = () => (
    <form onSubmit={handleRaporKaydet} className="space-y-3">

      {/* META BAR */}
      {selectedRapor && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-3 text-[11px] text-gray-600">
            <span className="flex items-center gap-1.5"><User size={11} className="text-blue-400"/>{selectedRapor.ekleyen_kullanici}</span>
            {selectedRapor.created_at && <span className="flex items-center gap-1.5"><Clock size={11} className="text-blue-400"/>{new Date(selectedRapor.created_at).toLocaleString("tr-TR")}</span>}
          </div>
          {!isEditMode && isAdmin && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={()=>setIsEditMode(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3 py-1.5 rounded-lg hover:bg-amber-400/15 transition-colors">
                <Edit3 size={12}/> Düzenle
              </button>
              <button type="button" onClick={()=>selectedRapor && handleRaporSil(selectedRapor)}
                className="flex items-center gap-1.5 text-xs font-semibold text-red-400 bg-red-400/10 border border-red-400/20 px-3 py-1.5 rounded-lg hover:bg-red-400/15 transition-colors">
                <Trash2 size={12}/> Sil
              </button>
            </div>
          )}
        </div>
      )}

      {/* TARİH + CANLI METRİKLER — tek satır */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-center">
        {/* Tarih */}
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
        {/* 4 metrik */}
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

      {/* FORM BODY — 2 kolon layout */}
      <div className={`transition-all duration-200 ${formKilitli&&!isReadOnly?"opacity-20 pointer-events-none blur-sm select-none":""}`}>

        {!tarih && !isReadOnly && (
          <div className="flex items-center justify-center gap-2 py-8 text-gray-600 text-xs border border-dashed border-[#1a2236] rounded-xl">
            <Lock size={12} className="text-amber-500"/> Tarih seçilince form aktif olur
          </div>
        )}

        {(tarih || isReadOnly) && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">

            {/* ─── SOL KOLON: CİRO GİRİŞLERİ ─── */}
            <div className="space-y-3">

              {/* Online + Kapıda yan yana */}
              <div className="grid grid-cols-2 gap-3">
                {/* Online */}
                <div className="rounded-xl border border-blue-500/15 bg-[#0c0f1a] overflow-hidden">
                  <div className="px-3 py-2 border-b border-blue-500/15 flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider flex items-center gap-1.5"><Monitor size={11}/>Online</span>
                    <span className="text-xs font-black text-blue-400">₺{fmt(ch.tOnline)}</span>
                  </div>
                  <div className="p-3 space-y-2">
                    <CurrencyInput label="Yemeksepeti" value={osYS} onChange={setOsYS} disabled={isReadOnly}/>
                    <CurrencyInput label="Getir" value={osGetir} onChange={setOsGetir} disabled={isReadOnly}/>
                    <CurrencyInput label="Trendyol" value={osTrendyol} onChange={setOsTrendyol} disabled={isReadOnly}/>
                    <CurrencyInput label="Migros" value={osMigros} onChange={setOsMigros} disabled={isReadOnly}/>
                  </div>
                </div>

                {/* Kapıda */}
                <div className="rounded-xl border border-purple-500/15 bg-[#0c0f1a] overflow-hidden">
                  <div className="px-3 py-2 border-b border-purple-500/15 flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider flex items-center gap-1.5"><Home size={11}/>Kapıda</span>
                    <span className="text-xs font-black text-purple-400">₺{fmt(ch.tKapida)}</span>
                  </div>
                  <div className="p-3 space-y-2">
                    <CurrencyInput label="YS Kapıda" value={koYS} onChange={setKoYS} disabled={isReadOnly}/>
                    <CurrencyInput label="Getir Kapıda" value={koGetir} onChange={setKoGetir} disabled={isReadOnly}/>
                    <CurrencyInput label="Trendyol" value={koTrendyol} onChange={setKoTrendyol} disabled={isReadOnly}/>
                    <CurrencyInput label="Migros" value={koMigros} onChange={setKoMigros} disabled={isReadOnly}/>
                    <CurrencyInput label="Alo Paket" value={koAlo} onChange={setKoAlo} disabled={isReadOnly}/>
                  </div>
                </div>
              </div>

              {/* Kasa */}
              <div className="rounded-xl border border-emerald-500/15 bg-[#0c0f1a] overflow-hidden">
                <div className="px-3 py-2 border-b border-emerald-500/15 flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5"><Wallet size={11}/>Fiziki Kasa</span>
                  <span className="text-xs font-black text-emerald-400">₺{fmt(ch.tKasa)}</span>
                </div>
                <div className="p-3 grid grid-cols-3 gap-2">
                  <CurrencyInput label="Nakit" value={kasaNakit} onChange={setKasaNakit} disabled={isReadOnly}/>
                  <CurrencyInput label="POS / Kart" value={kasaPos} onChange={setKasaPos} disabled={isReadOnly}/>
                  <CurrencyInput label="Edenred" value={kasaEdenred} onChange={setKasaEdenred} disabled={isReadOnly}/>
                </div>
              </div>

            </div>

            {/* ─── SAĞ KOLON: GİDER / İADE / KURYE / NOTLAR ─── */}
            <div className="space-y-3">

              {/* Gider + İade yan yana */}
              <div className="grid grid-cols-2 gap-3">
                {/* Giderler */}
                <div className="rounded-xl border border-red-500/15 bg-[#0c0f1a] overflow-hidden">
                  <div className="px-3 py-2 border-b border-red-500/15 flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wider flex items-center gap-1.5"><TrendingDown size={11}/>Giderler</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-red-400">₺{fmt(ch.tGider)}</span>
                      {!isReadOnly && <button type="button" onClick={giderEkle} className="text-[10px] text-gray-600 hover:text-red-400 border border-[#1a2236] hover:border-red-500/30 w-5 h-5 rounded flex items-center justify-center transition-colors">+</button>}
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    {giderler.map((item,idx)=>(
                      <div key={item.id} className="space-y-1.5">
                        <input type="text" placeholder="Açıklama..." disabled={isReadOnly} value={item.aciklama}
                          onChange={e=>giderDegistir(item.id,"aciklama",e.target.value)}
                          className="w-full bg-[#080b14] border border-[#1a2236] hover:border-[#243050] focus:border-blue-500/40 text-white text-xs h-7 px-2.5 rounded-lg outline-none transition-all disabled:opacity-40 placeholder:text-gray-700"/>
                        <div className="flex gap-1">
                          <div className="relative flex-1">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-600 text-xs">₺</span>
                            <input type="text" placeholder="0" disabled={isReadOnly} value={item.tutar}
                              onChange={e=>giderDegistir(item.id,"tutar",e.target.value)}
                              className="w-full bg-[#080b14] border border-[#1a2236] text-white text-xs font-bold h-7 pl-5 pr-2 rounded-lg outline-none focus:border-blue-500/40 disabled:opacity-40"/>
                          </div>
                          {!isReadOnly && giderler.length>1 && <button type="button" onClick={()=>giderSil(item.id)} className="text-gray-700 hover:text-red-400 px-1"><Trash2 size={11}/></button>}
                        </div>
                        {idx < giderler.length-1 && <div className="border-t border-[#1a2236] mt-1"/>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* İadeler */}
                <div className="rounded-xl border border-orange-500/15 bg-[#0c0f1a] overflow-hidden">
                  <div className="px-3 py-2 border-b border-orange-500/15 flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-orange-400 uppercase tracking-wider flex items-center gap-1.5"><RotateCcw size={11}/>İade</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-orange-400">₺{fmt(ch.tIade)}</span>
                      {!isReadOnly && <button type="button" onClick={iadeEkle} className="text-[10px] text-gray-600 hover:text-orange-400 border border-[#1a2236] hover:border-orange-500/30 w-5 h-5 rounded flex items-center justify-center transition-colors">+</button>}
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    {iadeler.map((item,idx)=>(
                      <div key={item.id} className="space-y-1.5">
                        <input type="text" placeholder="İptal sebebi..." disabled={isReadOnly} value={item.aciklama}
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
              </div>

              {/* Kuryeler */}
              <div className="rounded-xl border border-amber-500/15 bg-[#0c0f1a] overflow-hidden">
                <div className="px-3 py-2 border-b border-amber-500/15 flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5"><Bike size={11}/>Kurye Mutabakatı</span>
                  <div className="flex items-center gap-2">
                    {ch.kuryeFark===0
                      ? <span className="text-[10px] text-emerald-400 flex items-center gap-1"><CheckCircle2 size={10}/>Dengede</span>
                      : <span className="text-[10px] text-red-400 flex items-center gap-1"><AlertTriangle size={10}/>{ch.kuryeFark>0?`₺${fmt(ch.kuryeFark)} eksik`:`₺${fmt(Math.abs(ch.kuryeFark))} fazla`}</span>
                    }
                    {!isReadOnly && <button type="button" onClick={kuryeEkle} className="text-[10px] text-gray-600 hover:text-amber-400 border border-[#1a2236] hover:border-amber-500/30 px-2 py-0.5 rounded transition-colors">+ Kurye</button>}
                  </div>
                </div>
                <div className="p-3 space-y-2">
                  {kuryeler.map((k)=>{
                    const secilenler=kuryeler.filter(x=>x.id!==k.id&&x.isim).map(x=>x.isim);
                    return (
                      <div key={k.id} className="grid grid-cols-12 gap-1.5 items-center">
                        <div className="col-span-4">
                          <select disabled={isReadOnly} value={k.isim} onChange={e=>kuryeDegistir(k.id,"isim",e.target.value)}
                            className="w-full bg-[#080b14] border border-[#1a2236] text-white h-7 text-xs rounded-lg px-2 outline-none focus:border-blue-500/40 disabled:opacity-40">
                            <option value="">Seçiniz...</option>
                            {personelListesi.map((p,i)=>(
                              <option key={i} value={p} disabled={secilenler.includes(p)}>{p}{secilenler.includes(p)?" ✓":""}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <input type="number" placeholder="Pkt" disabled={isReadOnly} value={k.paketSayisi}
                            onChange={e=>kuryeDegistir(k.id,"paketSayisi",e.target.value)}
                            className="w-full bg-[#080b14] border border-[#1a2236] text-white h-7 text-xs font-bold px-2 rounded-lg outline-none disabled:opacity-40 text-center"/>
                        </div>
                        <div className="col-span-3 relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-600 text-xs">₺</span>
                          <input type="text" placeholder="Nakit" disabled={isReadOnly} value={k.nakit}
                            onChange={e=>kuryeDegistir(k.id,"nakit",e.target.value)}
                            className="w-full bg-[#080b14] border border-[#1a2236] text-white h-7 text-xs font-bold pl-5 pr-1 rounded-lg outline-none disabled:opacity-40"/>
                        </div>
                        <div className="col-span-3 relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-600 text-xs">₺</span>
                          <input type="text" placeholder="POS" disabled={isReadOnly} value={k.pos}
                            onChange={e=>kuryeDegistir(k.id,"pos",e.target.value)}
                            className="w-full bg-[#080b14] border border-[#1a2236] text-white h-7 text-xs font-bold pl-5 pr-1 rounded-lg outline-none disabled:opacity-40"/>
                          {!isReadOnly && kuryeler.length>1 && (
                            <button type="button" onClick={()=>kuryeSil(k.id)} className="absolute -right-4 top-1/2 -translate-y-1/2 text-gray-700 hover:text-red-400"><Trash2 size={11}/></button>
                          )}
                        </div>
                      </div>
                    );
                  })}
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
        )}

        {/* ÖZET BANT */}
        {(tarih || isReadOnly) && (
          <div className="rounded-xl border border-[#1a2236] bg-[#080b14] px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 mt-1">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div><p className="text-[9px] text-gray-600 uppercase tracking-widest">Brüt</p><p className="text-sm font-black text-blue-400">₺{fmt(ch.brutCiro)}</p></div>
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

      {/* ── NAV HEADER ── */}
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
            {/* Export butonları */}
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
            <button onClick={veriCek}
              className="p-2 text-gray-600 hover:text-white border border-[#1a2236] hover:border-[#2a3550] rounded-xl transition-colors">
              <RefreshCw size={14}/>
            </button>
            <button onClick={()=>{formuTemizle();setFormAcik(true);}}
              className="flex items-center gap-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl transition-colors shadow-lg shadow-blue-900/30">
              <PlusCircle size={14}/> Yeni Rapor
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* ── EKSIK RAPOR ── */}
        {!formAcik && <EksikRaporBanner enSonRaporTarihi={enSonRaporTarihi} onEkle={()=>{formuTemizle();setFormAcik(true);}}/>}

        {/* ── FORM (YENİ / DÜZENLE) ── */}
        {formAcik && (
          <div className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] overflow-hidden shadow-2xl">
            {/* Form header */}
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

        {/* ── DASHBOARD + ARŞİV: form açıkken gizle ── */}
        {!formAcik && <DashboardPanel raporlar={raporlar}/>}

        {/* ── ARŞİV TABLOSU ── */}
        {!formAcik && <div className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] overflow-hidden shadow-xl">
          {/* Tablo header */}
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
              {/* Mobil export */}
              {raporlar.length>0 && (
                <div className="flex sm:hidden items-center gap-1">
                  <button onClick={()=>exportCSV(raporlar,secilenAy,secilenYil)} className="text-[10px] text-gray-600 hover:text-emerald-400 border border-[#1a2236] px-2.5 py-1.5 rounded-lg transition-colors">CSV</button>
                  <button onClick={()=>exportPDF(raporlar,secilenAy,secilenYil)} className="text-[10px] text-gray-600 hover:text-red-400 border border-[#1a2236] px-2.5 py-1.5 rounded-lg transition-colors">PDF</button>
                </div>
              )}
              {/* Dönem filtresi */}
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

          {/* Tablo */}
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
                ) : raporlar.map((rapor,idx)=>{
                  const tO=(rapor.os_yemeksepeti||0)+(rapor.os_getir||0)+(rapor.os_trendyol||0)+(rapor.os_migros||0);
                  const tK=(rapor.ko_yemeksepeti||0)+(rapor.ko_getir||0)+(rapor.ko_trendyol||0)+(rapor.ko_migros||0)+(rapor.ko_alo_paket||0);
                  const paket=rapor.kurye_raporlari?.reduce((s,k)=>s+(parseInt(k.paketSayisi)||0),0)||0;
                  const net=(rapor.toplam_ciro||0)-(rapor.gunluk_gider||0)-(rapor.iade_tutar||0);
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
                      <td className="px-4 py-3.5 text-gray-400 font-semibold">₺{fmt(rapor.toplam_ciro||0)}</td>
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
        </div>}

        {/* Footer */}
        <div className="flex items-center justify-between py-2">
          <p className="text-[10px] text-gray-700">KEBO ERP · Finansal Yönetim Sistemi</p>
          <p className="text-[10px] text-gray-700">{userEmail}</p>
        </div>
      </div>

      {/* ── PRINT MODAL ── */}
      {printRapor && <PrintModal rapor={printRapor} onClose={()=>setPrintRapor(null)}/>}
    </div>
  );
}
