"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  FileText, PlusCircle, Loader2, TrendingUp, Wallet, CheckCircle2, Bike,
  Trash2, Monitor, Home, Edit3, Eye, AlertTriangle, BarChart3,
  Calendar, Lock, User, Clock, ShieldAlert, Check, X, ArrowUpRight,
  Layers, Bell, Printer, ChevronDown, ChevronUp, PieChart, Activity,
  RefreshCw, FileDown, StickyNote, RotateCcw, Save, TrendingDown
} from "lucide-react";

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
interface DuzenlemeTalebi {
  id: string;
  rapor_id: string;
  tarih: string;
  talep_eden: string;
  eski_veri: Partial<GunlukRapor>;
  yeni_veri: Partial<GunlukRapor>;
  durum: "Bekliyor" | "Onaylandı" | "Reddedildi";
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
  const w=120, h=36;
  const pts = values.map((v,i)=>`${(i/(values.length-1))*w},${h-(v/max)*(h-4)}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5"
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
    <div className="relative overflow-hidden rounded-2xl border border-red-500/20 bg-[#130a0a] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
      <div className="absolute inset-0 bg-gradient-to-r from-red-950/30 to-transparent pointer-events-none"/>
      <div className="relative flex items-start gap-4">
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 shrink-0">
          <Bell className="h-6 w-6 text-red-400 animate-pulse"/>
        </div>
        <div>
          <p className="text-base font-black text-red-400 uppercase tracking-widest">⚠️ {eksik.length} GÜNLÜK RAPOR EKSİK</p>
          <p className="text-sm text-gray-400 mt-1 font-semibold">
            {eksik.slice(0,4).join("   ·   ")}{eksik.length>4 ? `   ·   +${eksik.length-4} gün` : ""}
          </p>
        </div>
      </div>
      <button onClick={onEkle} className="relative shrink-0 text-xs font-black text-white bg-red-600 hover:bg-red-700 w-full md:w-auto h-11 rounded-xl transition-all shadow-lg active:scale-95 cursor-pointer">
        Hemen Rapor Ekle
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
              borderWidth:1.5, borderRadius:6, order:2
            },
            {
              label:"Net Ciro",
              data:net, type:"line",
              borderColor:"#10B981", borderWidth:3.5,
              borderDash:[5,3], pointRadius:net.map(v=>v>0?5:0),
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
            x:{ticks:{color:"#9ca3af",font:{size:12,weight:"bold"},maxRotation:45,autoSkip:true,maxTicksLimit:12},grid:{color:"rgba(255,255,255,0.03)"}},
            y:{ticks:{color:"#9ca3af",font:{size:12,weight:"bold"},callback:(v:number)=>`₺${(v/1000).toFixed(0)}K`},grid:{color:"rgba(255,255,255,0.04)"}}
          }
        }
      });
    };
    loadChart();
    return ()=>{ if(chartInstance.current){chartInstance.current.destroy();chartInstance.current=null;} };
  },[acik, sorted]);

  if (raporlar.length===0) return null;

  return (
    <div className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] overflow-hidden shadow-2xl w-full">
      <button onClick={()=>setAcik(!acik)}
        className="w-full flex items-center justify-between px-6 py-5 hover:bg-white/[0.02] transition-colors">
        <div className="flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Activity className="h-5 w-5 text-blue-400"/>
          </div>
          <span className="text-base font-black text-gray-200 tracking-tight">Dönem Analizi Verileri</span>
          <span className="text-xs text-gray-400 bg-white/5 border border-white/10 px-3 py-1 rounded-full font-black">{raporlar.length} Gün</span>
        </div>
        {acik ? <ChevronUp className="h-5 w-5 text-gray-400"/> : <ChevronDown className="h-5 w-5 text-gray-400"/>}
      </button>

      {acik && (
        <div className="border-t border-[#1a2236] p-4 sm:p-6 space-y-6">
          {/* Mobil Uyumlu Grid: grid-cols-1’den başlayıp büyük ekranda grid-cols-4 olur */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {label:"Günlük Ort. Brüt", value:`₺${fmt(gunlukOrt)}`, sub:"ortalama brüt şube cirosu", spark:trendValues, color:"#60A5FA"},
              {label:"Günlük Ort. Net", value:`₺${fmt(netTrend.reduce((s,v)=>s+v,0)/Math.max(netTrend.length,1))}`, sub:"ortalama net şube cirosu", spark:netTrend, color:"#34D399"},
              {label:"En Yüksek Gün", value:`₺${fmt(enYuksek?.toplam_ciro||0)}`, sub:enYuksek?fmtTarih(enYuksek.tarih):"—", spark:null, color:"#FBBF24"},
              {label:"Toplam Paket", value:`${fmt(toplamPaket)} Paket`, sub:"toplam paket servis adedi", spark:null, color:"#A78BFA"},
            ].map(card=>(
              <div key={card.label} className="bg-[#080b14] rounded-xl border border-[#1a2236] p-5 hover:border-[#243050] transition-colors">
                <p className="text-xs text-gray-500 uppercase tracking-widest font-black mb-2.5">{card.label}</p>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-2xl font-black tracking-tight" style={{color:card.color}}>{card.value}</p>
                    <p className="text-xs text-gray-500 mt-1.5 font-semibold">{card.sub}</p>
                  </div>
                  {card.spark && <Sparkline values={card.spark} color={card.color}/>}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
            <div className="xl:col-span-2 bg-[#080b14] rounded-xl border border-[#1a2236] p-5">
              <p className="text-xs text-gray-400 uppercase tracking-widest font-black mb-4 flex items-center gap-2">
                <PieChart className="h-4 w-4"/> Sipariş Kanalları Dağılım Listesi
              </p>
              <div className="space-y-4">
                {platformData.filter(d=>d.value>0).map(d=>{
                  const pct = totalPlatform>0 ? (d.value/totalPlatform)*100 : 0;
                  return (
                    <div key={d.label}>
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full" style={{backgroundColor:d.color}}/>
                          <span className="text-xs font-black text-gray-400">{d.label}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-black text-white">₺{fmt(d.value)}</span>
                          <span className="text-xs font-black text-gray-500 w-8 text-right">{Math.round(pct)}%</span>
                        </div>
                      </div>
                      <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{width:`${pct}%`, backgroundColor:d.color, opacity:0.85}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="xl:col-span-3 bg-[#080b14] rounded-xl border border-[#1a2236] p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-gray-400 uppercase tracking-widest font-black flex items-center gap-2">
                  <BarChart3 className="h-4 w-4"/> Ciro İlerleme Grafiği
                </p>
                <div className="flex items-center gap-4 text-xs font-black text-gray-500">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-500/60 inline-block"/>Brüt</span>
                  <span className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-emerald-500/60 inline-block"/>Net</span>
                </div>
              </div>
              <div className="relative" style={{height:"200px"}}>
                <canvas ref={chartRef} role="img" aria-label="Günlük brüt ve net ciro grafiği"/>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CURRENCY INPUT ───────────────────────────────────────────────────────────

function CurrencyInput({label, value, onChange, disabled=false}:
  {label:string, value:string, onChange:(v:string)=>void, disabled?:boolean}) {
  return (
    <div className="group w-full">
      <label className="block text-xs text-gray-400 uppercase tracking-wide font-black mb-2">{label}</label>
      <div className="relative w-full">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-black">₺</span>
        <input
          type="text" value={value} disabled={disabled}
          onChange={e=>onChange(fmtStr(e.target.value))}
          className="w-full bg-[#080b14] border border-[#1a2236] text-white text-base font-black h-11 pl-8 pr-4 rounded-xl outline-none"
          placeholder="0"
        />
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function RaporlarPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [raporlar, setRaporlar] = useState<GunlukRapor[]>([]);
  const [talepler, setTalepler] = useState<DuzenlemeTalebi[]>([]); 
  const [enSonRaporTarihi, setEnSonRaporTarihi] = useState<string|null>(null);
  const [mevcutTarihler, setMevcutTarihler] = useState<Set<string>>(new Set());
  const [personelListesi, setPersonelListesi] = useState<string[]>(FALLBACK_PERSONELLER);
  const [secilenAy, setSecilenAy] = useState(()=>String(new Date().getMonth()+1).padStart(2,"0"));
  const [secilenYil, setSecilenYil] = useState(()=>String(new Date().getFullYear()));

  const [formAcik, setFormAcik] = useState(false);
  const [selectedRapor, setSelectedRapor] = useState<GunlukRapor|null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [printRapor, setPrintRapor] = useState<GunlukRapor|null>(null);
  const [duplikaTarihHata, setDuplikaTarihHata] = useState(false);

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

  const renderSatirListesi = (
    items: SatirRaporu[],
    onAdd: ()=>void,
    onRemove: (id:number)=>void,
    onChange: (id:number,field:"aciklama"|"tutar",val:string)=>void,
    color: string,
    aciklamaPlaceholder: string,
    isReadOnly: boolean
  ) => (
    <div className="space-y-3 w-full">
      {items.map((item,idx)=>(
        <div key={item.id} className="flex flex-col sm:flex-row gap-3 items-start w-full bg-[#060810]/50 p-3 rounded-xl sm:p-0 sm:bg-transparent border border-[#1a2236] sm:border-none">
          <div className="w-full sm:col-span-3">
            {idx===0&&<label className="block text-xs text-gray-400 uppercase tracking-wide font-black mb-1.5">Gider Açıklaması</label>}
            <input type="text" placeholder={aciklamaPlaceholder} disabled={isReadOnly} value={item.aciklama}
              onChange={e=>onChange(item.id,"aciklama",e.target.value)}
              className="w-full bg-[#080b14] border border-[#1a2236] text-white text-sm h-10 px-3.5 rounded-xl outline-none font-bold"/>
          </div>
          <div className="w-full sm:col-span-2">
            {idx===0&&<label className="block text-xs text-gray-400 uppercase tracking-wide font-black mb-1.5">Tutar (₺)</label>}
            <div className="relative w-full">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-bold">₺</span>
              <input type="text" placeholder="0" disabled={isReadOnly} value={item.tutar}
                onChange={e=>onChange(item.id,"tutar",e.target.value)}
                className="w-full bg-[#080b14] border border-[#1a2236] text-white text-sm font-black h-10 pl-8 pr-3 rounded-xl outline-none"/>
            </div>
          </div>
          {!isReadOnly && items.length>1 && (
            <button type="button" onClick={()=>onRemove(item.id)}
              className="w-full sm:w-auto mt-2 sm:mt-7 py-2 text-center text-red-400 bg-red-500/10 sm:bg-transparent sm:p-2.5 rounded-xl transition-colors font-bold text-xs">
              Bu Satırı Kaldır
            </button>
          )}
        </div>
      ))}
      {!isReadOnly && (
        <button type="button" onClick={onAdd}
          className="mt-1 text-xs text-blue-400 font-black flex items-center gap-1.5 transition-colors bg-blue-500/5 border border-blue-500/10 w-full sm:w-auto h-9 justify-center rounded-xl">
          + Yeni Satır Masraf Ekle
        </button>
      )}
    </div>
  );

  const veriCek = useCallback(async () => {
    setLoading(true);
    const {data:{user}} = await supabase.auth.getUser();
    const mail = user?.email||""; setUserEmail(mail);
    const patronMu = mail==="murat@kebo.com"||mail==="bulent@kebo.com";
    setIsAdmin(patronMu);

    const {data:sonRapor} = await supabase.from("gunluk_raporlar").select("tarih").order("tarih",{ascending:false}).limit(1);
    setEnSonRaporTarihi(sonRapor?.[0]?.tarih??null);

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

    if (patronMu) {
      const { data: talepData } = await supabase.from("rapor_duzenleme_talepleri").select("*").eq("durum", "Bekliyor");
      if (talepData) setTalepler(talepData as DuzenlemeTalebi[]);
    }
    setLoading(false);
  }, [secilenAy, secilenYil, supabase]);

  useEffect(()=>{veriCek();},[veriCek]);

  const handleTalepOnayla = async (talep: DuzenlemeTalebi) => {
    const { error } = await supabase.from("gunluk_raporlar").update(talep.yeni_veri).eq("id", talep.rapor_id);
    if (!error) {
      await supabase.from("rapor_duzenleme_talepleri").update({ durum: "Onaylandı" }).eq("id", talep.id);
      veriCek();
    }
  };

  const handleRaporSil = async (rapor: GunlukRapor) => {
    if (!confirm(`${fmtTarih(rapor.tarih)} tarihli raporu silmek istiyor musunuz?`)) return;
    await supabase.from("platform_tahsilatlar").delete().eq("satis_tarihi", rapor.tarih).eq("durum", "bekliyor");
    const { error } = await supabase.from("gunluk_raporlar").delete().eq("id", rapor.id);
    if (error) { alert("Silme hatası: " + error.message); return; }
    formuTemizle(); setFormAcik(false); veriCek();
  };

  const formKilitli = !tarih || (tarihHataVarMi && !adminOnayliGecis) || duplikaTarihHata;
  const isReadOnly = !!(selectedRapor && !isEditMode);

  const tabloToplam = useMemo(()=>{
    let brut=0,net=0,paket=0,giderIade=0;
    raporlar.forEach(r=>{
      brut+=r.toplam_ciro||0; giderIade+=(r.gunluk_gider||0)+(r.iade_tutar||0); net+=(r.toplam_ciro||0)-(r.gunluk_gider||0)-(r.iade_tutar||0);
      paket+=r.kurye_raporlari?.reduce((s,k)=>s+(parseInt(k.paketSayisi)||0),0)||0;
    });
    return {brut,net,paket,giderIade};
  },[raporlar]);

  if (loading) return (
    <div className="h-screen bg-[#060810] flex items-center justify-center">
      <div className="w-12 h-12 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"/>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#060810] text-white font-sans antialiased text-sm w-full flex flex-col">

      {/* HEADER - RESPONSIVE YAPILDI */}
      <div className="sticky top-0 z-40 border-b border-[#0f1624] bg-[#060810]/95 backdrop-blur-xl py-4 px-4 sm:px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 w-full">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg"><Layers className="h-5 w-5 text-white"/></div>
          <div>
            <h1 className="text-base font-black text-white leading-none">KEBO PANEL</h1>
            <p className="text-xs text-gray-500 font-bold mt-1.5">{isAdmin ? "Yönetici Görünümü" : "Mağaza Müdürü Görünümü"}</p>
          </div>
        </div>
        <button onClick={()=>{formuTemizle();setFormAcik(true);}} className="text-xs font-black text-white bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-xl transition-all h-11 shadow-lg flex items-center justify-center gap-2 w-full sm:w-auto cursor-pointer">
          <PlusCircle size={16}/> Yeni Gün Raporu Gir
        </button>
      </div>

      {/* SİMETRİK MOBİL ÖLÇÜLENDİRME PANELİ */}
      <div className="max-w-[96%] mx-auto px-1 sm:px-4 py-6 space-y-6 flex-1 w-full">

        {/* DÜZENLEME TALEP ONAYLARI */}
        {isAdmin && talepler.length > 0 && (
          <div className="bg-[#0c0f1a] border-2 border-amber-500/30 rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xl w-full">
            <h2 className="text-sm font-black uppercase text-amber-400 tracking-wider flex items-center gap-2"><AlertTriangle size={16} /> Düzenleme Onay Talepleri ({talepler.length})</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {talepler.map((t) => (
                <div key={t.id} className="bg-[#060810] border border-[#1a2236] p-4 rounded-xl space-y-3">
                  <div className="flex justify-between font-bold text-xs text-gray-400"><span>{fmtTarih(t.tarih)} Raporu</span><span>{t.talep_eden}</span></div>
                  <div className="grid grid-cols-2 gap-4 text-xs font-bold">
                    <div className="bg-red-500/5 p-3 rounded-lg border border-red-500/10 text-gray-400"><p className="text-[10px] text-red-400 uppercase font-black mb-1">Eski</p><p>₺{fmt(t.eski_veri.toplam_ciro || 0)}</p></div>
                    <div className="bg-emerald-500/5 p-3 rounded-lg border border-emerald-500/10 text-white"><p className="text-[10px] text-emerald-400 uppercase font-black mb-1">İstenen</p><p>₺{fmt(t.yeni_veri.toplam_ciro || 0)}</p></div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => handleRequestReject(t.id)} className="flex-1 text-xs font-black text-red-400 py-2.5 rounded-xl bg-red-500/10">Reddet</button>
                    <button onClick={() => handleTalepOnayla(t)} className="flex-1 text-xs font-black text-white bg-emerald-600 py-2.5 rounded-xl">Onayla</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!formAcik && <EksikRaporBanner enSonRaporTarihi={enSonRaporTarihi} onEkle={()=>{formuTemizle();setFormAcik(true);}}/>}

        {/* ── RAPOR FORMU MOBİL ENTEGRASYONU ── */}
        {formAcik && (
          <div className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] overflow-hidden shadow-2xl w-full">
            <div className="px-5 py-4 border-b border-[#1a2236] flex items-center justify-between">
              <div>
                <h2 className="text-base font-black text-white">{selectedRapor ? (isEditMode ? "Raporu Düzenle" : "Rapor Detayı") : "Yeni Gün Sonu Raporu Girişi"}</h2>
              </div>
              <button onClick={()=>{formuTemizle();setFormAcik(false);}} className="p-2 text-gray-500 hover:text-white border border-[#1a2236] rounded-xl"><X size={16}/></button>
            </div>
            
            <div className="p-4 sm:p-6">
              <form onSubmit={handleRaporKaydet} className="space-y-5">
                
                {/* Metrikler Mobilde Alt Alta Sıralanır */}
                <div className="flex flex-col md:flex-row gap-4 items-stretch w-full">
                  <div className="w-full md:w-48">
                    <label className="block text-[11px] text-amber-400 font-bold uppercase tracking-widest mb-2">Rapor Tarihi</label>
                    <input type="date" value={tarih} disabled={isReadOnly} onChange={e=>handleTarihChange(e.target.value)} className="bg-[#080b14] text-white font-black text-center h-11 text-sm rounded-xl px-3 w-full border border-[#1a2236]" required/>
                  </div>
                  <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[{label:"Brüt Ciro", value:`₺${fmt(ch.brutCiro)}`, color:"text-blue-400"},{label:"Net Ciro",  value:`₺${fmt(ch.netCiro)}`,  color:"text-emerald-400"},{label:"Paket",     value:`${fmt(ch.tKuryePaket)} Pkt`, color:"text-amber-400"},{label:"Ort. Sepet",value:`₺${fmt(ch.paketOrt)}`, color:"text-purple-400"}].map(c=>(
                      <div key={c.label} className="rounded-xl border border-[#1a2236] bg-[#080b14] p-3"><p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">{c.label}</p><p className="text-sm font-black tracking-tight mt-1" style={{color:c.color}}>{c.value}</p></div>
                    ))}
                  </div>
                </div>

                {/* Grid Mobilde Tek Kolon (`grid-cols-1`) Olur */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full">
                  <div className="rounded-xl border border-blue-500/15 bg-[#080b14]/40 p-4 sm:p-5 space-y-4">
                    <p className="text-sm font-black text-blue-400 uppercase tracking-wider flex items-center gap-1.5"><Monitor size={14}/> 1. Online Ciro Girdileri</p>
                    <CurrencyInput label="Yemeksepeti (Online)" value={osYS} onChange={setOsYS} disabled={isReadOnly}/>
                    <CurrencyInput label="Getir (Online)" value={osGetir} onChange={setOsGetir} disabled={isReadOnly}/>
                    <CurrencyInput label="Trendyol (Online)" value={osTrendyol} onChange={setOsTrendyol} disabled={isReadOnly}/>
                    <CurrencyInput label="Migros (Online)" value={osMigros} onChange={setOsMigros} disabled={isReadOnly}/>
                  </div>

                  <div className="rounded-xl border border-purple-500/15 bg-[#080b14]/40 p-4 sm:p-5 space-y-4">
                    <p className="text-sm font-black text-purple-400 uppercase tracking-wider flex items-center gap-1.5"><Home size={14}/> 2. Kapıda Ödeme Girdileri</p>
                    <CurrencyInput label="Yemeksepeti (Kapıda)" value={koYS} onChange={setKoYS} disabled={isReadOnly}/>
                    <CurrencyInput label="Getir (Kapıda)" value={koGetir} onChange={setKoGetir} disabled={isReadOnly}/>
                    <CurrencyInput label="Trendyol (Kapıda)" value={koTrendyol} onChange={setKoTrendyol} disabled={isReadOnly}/>
                    <CurrencyInput label="Migros (Kapıda)" value={koMigros} onChange={setKoMigros} disabled={isReadOnly}/>
                    <CurrencyInput label="Alo Paket / Telefon" value={koAlo} onChange={setKoAlo} disabled={isReadOnly}/>
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-500/15 bg-[#080b14]/40 p-4 sm:p-5 space-y-4 w-full">
                  <p className="text-sm font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1.5"><Wallet size={14}/> 3. Fiziki Şube Kasası Girdileri</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <CurrencyInput label="Nakit Kasa" value={kasaNakit} onChange={setKasaNakit} disabled={isReadOnly}/>
                    <CurrencyInput label="POS Cihazı / Kart" value={kasaPos} onChange={setKasaPos} disabled={isReadOnly}/>
                    <CurrencyInput label="Edenred / Sodexo" value={kasaEdenred} onChange={setKasaEdenred} disabled={isReadOnly}/>
                  </div>
                </div>

                {/* Masraflar Listesi */}
                {(tarih || isReadOnly) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                    <div className="bg-[#080b14] p-4 rounded-xl border border-[#1a2236] w-full">{renderSatirListesi(giderler, giderEkle, giderSil, giderDegistir, "red", "Masraf harcama kalemi...", isReadOnly)}</div>
                    <div className="bg-[#080b14] p-4 rounded-xl border border-[#1a2236] w-full">{renderSatirListesi(iadeler, iadeEkle, iadeSil, iadeDegistir, "orange", "İptal / İade sebebi...", isReadOnly)}</div>
                  </div>
                )}

                {/* Kuryeler Mobilde Tam Kart Düzenine Geçer */}
                {(tarih || isReadOnly) && (
                  <div className="rounded-xl border border-amber-500/15 bg-[#0c0f1a] p-4 sm:p-5 space-y-4 w-full">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-amber-400 font-black uppercase flex items-center gap-1.5"><Bike size={14}/> 4. Kurye Mutabakatı</span>
                      {!isReadOnly && <button type="button" onClick={kuryeEkle} className="text-xs font-black text-gray-400 border border-[#1a2236] px-4 h-8 rounded-xl hover:text-amber-400 transition-colors">+ Kurye Ekle</button>}
                    </div>
                    {kuryeler.map((k)=>(
                      <div key={k.id} className="flex flex-col sm:flex-row gap-3 items-stretch w-full bg-[#060810]/40 p-4 rounded-xl border border-[#1a2236] sm:p-0 sm:border-none sm:bg-transparent">
                        <div className="w-full sm:flex-1">
                          <select disabled={isReadOnly} value={k.isim} onChange={e=>kuryeDegistir(k.id,"isim",e.target.value)} className="w-full bg-[#080b14] border border-[#1a2236] text-white h-10 text-sm font-bold rounded-xl px-3">
                            <option value="">Kurye Seç...</option>
                            {personelListesi.map((p,i)=>(<option key={i} value={p}>{p}</option>))}
                          </select>
                        </div>
                        <div className="w-full sm:w-24"><input type="number" placeholder="Paket" disabled={isReadOnly} value={k.paketSayisi} onChange={e=>kuryeDegistir(k.id,"paketSayisi",e.target.value)} className="w-full bg-[#080b14] border border-[#1a2236] text-white h-10 text-sm font-bold text-center rounded-xl"/></div>
                        <div className="w-full sm:flex-1 relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₺</span><input type="text" placeholder="Nakit" disabled={isReadOnly} value={k.nakit} onChange={e=>kuryeDegistir(k.id,"nakit",e.target.value)} className="w-full bg-[#080b14] border border-[#1a2236] text-white h-10 text-sm font-black pl-7 rounded-xl"/></div>
                        <div className="w-full sm:flex-1 relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₺</span><input type="text" placeholder="POS" disabled={isReadOnly} value={k.pos} onChange={e=>kuryeDegistir(k.id,"pos",e.target.value)} className="w-full bg-[#080b14] border border-[#1a2236] text-white h-10 text-sm font-black pl-7 rounded-xl"/></div>
                        {!isReadOnly && kuryeler.length>1 && (
                          <button type="button" onClick={()=>kuryeSil(k.id)} className="w-full sm:w-auto h-9 bg-red-500/10 text-red-400 font-bold text-xs rounded-xl flex items-center justify-center sm:bg-transparent">Kuryeyi Kaldır</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center pt-4 border-t border-[#1a2236] w-full gap-4">
                  <div className="text-sm font-black text-emerald-400 bg-emerald-500/5 px-4 py-2.5 rounded-xl border border-emerald-500/10 text-center sm:text-left">Net Şube Cirosu: ₺{fmt(ch.netCiro)}</div>
                  <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                    {selectedRapor && !isEditMode && (
                      <button type="button" onClick={()=>setIsEditMode(true)} className="text-xs font-black text-white bg-amber-600 h-11 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"><Edit3 size={14}/> Düzenle</button>
                    )}
                    <button type="button" onClick={()=>{formuTemizle();setFormAcik(false);}} className="text-xs font-bold text-gray-400 border border-[#1a2236] h-11 rounded-xl cursor-pointer">Kapat</button>
                    {!isReadOnly && (
                      <button type="submit" disabled={saving} className="text-xs font-black text-white bg-blue-600 hover:bg-blue-700 h-11 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-lg">
                        {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}
                        {isAdmin ? "Değişikliği Kaydet" : "Onay İstemi Gönder"}
                      </button>
                    )}
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── ❌ KURAL 1: DÖNEM ANALİZİ PANELİ MÜDÜRDE GÖRÜNMEZ ── */}
        {!formAcik && isAdmin === true && <DashboardPanel raporlar={raporlar}/>}

        {/* ── KAPANAN ARŞİV LİSTESİ MOBİL DUYARLI TABLO ── */}
        {!formAcik && (
          <div className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] overflow-hidden shadow-2xl w-full">
            <div className="px-5 py-4 border-b border-[#1a2236] flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 bg-[#0c0f1a]/50">
              <div>
                <h3 className="text-base font-black text-gray-200 uppercase tracking-tight">Kapanış Arşivi</h3>
                <p className="text-xs text-gray-500 mt-1 font-bold">{AYLAR.find(m=>m.value===secilenAy)?.label} {secilenYil}  ·  Mevcut Tüm Kayıtlar</p>
              </div>
              <div className="flex items-center gap-3 bg-[#080b14] border border-[#1a2236] px-4 py-2.5 rounded-xl font-bold justify-between sm:justify-start">
                <Calendar size={14} className="text-blue-500"/>
                <select value={secilenAy} onChange={e=>setSecilenAy(e.target.value)} className="bg-transparent text-xs text-gray-300 outline-none cursor-pointer">
                  {AYLAR.map(m=><option key={m.value} value={m.value} className="bg-[#0c0f1a]">{m.label}</option>)}
                </select>
                <select value={secilenYil} onChange={e=>setSecilenYil(e.target.value)} className="bg-transparent text-xs text-gray-300 outline-none cursor-pointer">
                  {["2024","2025","2026","2027"].map(y=><option key={y} value={y} className="bg-[#0c0f1a]">{y}</option>)}
                </select>
              </div>
            </div>

            {/* Mobilde sağa kaydırma çubuğu (`overflow-x-auto`) eklendi, tablo asla taşma yapmaz */}
            <div className="overflow-x-auto w-full">
              <table className="w-full text-sm text-left border-collapse min-w-[500px] sm:min-w-full">
                <thead>
                  <tr className="border-b border-[#1a2236] bg-[#080b14] text-gray-400 text-xs font-black uppercase tracking-wider">
                    <th className="p-4 sm:p-5">Rapor Tarihi</th>
                    <th className="p-4 sm:p-5 text-blue-400">Brüt Ciro</th>
                    <th className="p-4 sm:p-5 text-red-400">Gider+İade</th>
                    <th className="p-4 sm:p-5 text-amber-400">Paket Sayısı</th>
                    <th className="p-4 sm:p-5 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#0f1624]/60 font-black text-sm">
                  {raporlar.length===0 ? (
                    <tr><td colSpan={5} className="p-10 text-center text-gray-600 font-bold uppercase tracking-wider">Bu döneme ait kayıtlı ciro raporu bulunmuyor</td></tr>
                  ) : raporlar.map((rapor)=>{
                    const paket=rapor.kurye_raporlari?.reduce((s,k)=>s+(parseInt(k.paketSayisi)||0),0)||0;
                    const gi=(rapor.gunluk_gider||0)+(rapor.iade_tutar||0);

                    return (
                      <tr key={rapor.id} onClick={()=>{setSelectedRapor(rapor);raporuFormaYukle(rapor);setIsEditMode(false);setFormAcik(true);}} className="hover:bg-white/[0.025] cursor-pointer group transition-colors">
                        <td className="p-4 sm:p-5 font-black text-gray-200 group-hover:text-blue-400 transition-colors">{fmtTarih(rapor.tarih)}</td>
                        <td className="p-4 sm:p-5 font-mono font-black text-blue-400 text-sm sm:text-base">       ₺{fmt(rapor.toplam_ciro||0)}</td>
                        <td className="p-4 sm:p-5 font-mono font-black text-red-400 text-sm sm:text-base">        ₺{fmt(gi)}</td>
                        <td className="p-4 sm:p-5 font-mono font-black text-amber-500 text-sm sm:text-base">      {paket} Paket</td>
                        <td className="p-4 sm:p-5 text-right">
                          <button className="text-blue-400 font-black text-xs inline-flex items-center gap-1.5 bg-blue-500/5 px-3 py-1.5 rounded-lg border border-blue-500/10 cursor-pointer">
                            <Eye size={12}/> İncele
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* ── ❌ KURAL 2: TABLO EN ALTINDAKİ DÖNEM TOPLAMI SADECE PATRONLARDA GÖRÜNÜR ── */}
                {isAdmin === true && raporlar.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-[#1a2236] bg-[#080b14] font-black text-sm sm:text-base text-white">
                      <td className="p-4 sm:p-5 uppercase text-gray-500 text-xs">Dönem Toplamı</td>
                      <td className="p-4 sm:p-5 font-mono text-blue-400 text-base lg:text-lg"> ₺{fmt(tabloToplam.brut)}</td>
                      <td className="p-4 sm:p-5 font-mono text-red-400 text-base lg:text-lg">  -₺{fmt(tabloToplam.giderIade)}</td>
                      <td className="p-4 sm:p-5 font-mono text-amber-400 text-base lg:text-lg">{tabloToplam.paket} Pkt</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}