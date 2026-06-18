"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  PlusCircle, Building2, Coins,
  Loader2, Trash2, FileDown, RefreshCw, Calendar,
  BarChart3, Wallet, X,
  TrendingUp, TrendingDown, Receipt, CreditCard, Banknote,
  Tag
} from "lucide-react";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface GunlukRapor {
  id: string; tarih: string;
  kasa_nakit: number; kasa_pos: number; kasa_edenred: number;
  gunluk_gider: number; gider_aciklama?: string; iade_tutar: number;
  toplam_ciro: number; ekleyen_kullanici: string;
}

interface ManuelIslem {
  id: string; created_at: string; tip: "gelir" | "gider" | "transfer";
  hesap: string; hedef_hesap?: string; kategori: string;
  tutar: number; aciklama: string; islem_tarihi: string; ekleyen_kullanici: string;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const HESAPLAR = ["Nakit", "TEB", "VakıfBank", "Enpara"];
const HESAP_LABEL: Record<string, string> = { Nakit: "Nakit Kasa", TEB: "TEB", VakıfBank: "VakıfBank", Enpara: "Enpara" };
const HESAP_COLOR: Record<string, string> = { Nakit: "#3B82F6", TEB: "#10B981", VakıfBank: "#F59E0B", Enpara: "#8B5CF6" };

const GIDER_KATEGORILERI = [
  { grup: "Personel", items: ["Personel Maaş", "Personel Avans", "SGK / Sigorta", "İkramiye"] },
  { grup: "Sabit Giderler", items: ["Kira", "Elektrik", "Su", "Doğalgaz", "İnternet / Telefon"] },
  { grup: "İşletme", items: ["Market / Malzeme", "Temizlik Malzemesi", "Ambalaj / Paket", "Bakım / Onarım"] },
  { grup: "Finans", items: ["Banka Komisyonu", "POS Komisyonu", "Kredi Taksidi"] },
  { grup: "Diğer", items: ["Yakıt / Ulaşım", "Pazarlama / Reklam", "Kargo / Kurye", "Diğer Gider"] },
];
const TUM_GIDER_KATS = GIDER_KATEGORILERI.flatMap(g => g.items);

const GELIR_KATEGORILERI = ["Ortak Sermaye", "Kredi", "Diğer Gelir"];

const AYLAR = [
  {v:"01",l:"Ocak"},{v:"02",l:"Şubat"},{v:"03",l:"Mart"},{v:"04",l:"Nisan"},
  {v:"05",l:"Mayıs"},{v:"06",l:"Haziran"},{v:"07",l:"Temmuz"},{v:"08",l:"Ağustos"},
  {v:"09",l:"Eylül"},{v:"10",l:"Ekim"},{v:"11",l:"Kasım"},{v:"12",l:"Aralık"},
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const fmt2 = (v: number) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const fmt0 = (v: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(v);
const fmtK = (v: number) => v >= 1000000 ? `₺${(v/1000000).toFixed(1)}M` : v >= 1000 ? `₺${(v/1000).toFixed(0)}K` : `₺${fmt0(v)}`;
const fmtTarih = (t: string) => { if (!t) return "—"; const [y,m,d] = t.split("-"); return `${d}.${m}.${y}`; };

function Sparkline({ values, color="#3B82F6" }: { values: number[]; color?: string }) {
  if (values.filter(v => v > 0).length < 2) return null;
  const max = Math.max(...values, 1), w = 72, h = 24;
  const pts = values.map((v,i) => `${(i/(values.length-1))*w},${h-(v/max)*(h-3)}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={0.85}/>
    </svg>
  );
}

function exportCSV(raporlar: GunlukRapor[], manuel: ManuelIslem[], ay: string, yil: string) {
  const ayL = AYLAR.find(m => m.v === ay)?.l || ay;
  const rows = [
    "Tarih,Tip,Hesap,Kategori,Tutar,Açıklama",
    ...raporlar.map(r => [fmtTarih(r.tarih),"Rapor","Nakit","Nakit Ciro",r.kasa_nakit,""].join(",")),
    ...manuel.map(i => [fmtTarih(i.islem_tarihi),i.tip,i.hesap,i.kategori,i.tutar,i.aciklama].join(",")),
  ].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\uFEFF"+rows], {type:"text/csv;charset=utf-8;"}));
  a.download = `KEBO_Kasa_${ayL}_${yil}.csv`; a.click();
}

// ─── HESAP BADGE ──────────────────────────────────────────────────────────────

function HesapBadge({ hesap }: { hesap: string }) {
  const color = HESAP_COLOR[hesap] || "#888";
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg"
      style={{ backgroundColor: color + "18", color }}>
      {hesap === "Nakit" ? <Banknote size={10}/> : <CreditCard size={10}/>}
      {HESAP_LABEL[hesap] || hesap}
    </span>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function KasaPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [raporlar, setRaporlar] = useState<GunlukRapor[]>([]);
  const [manuelIslemler, setManuelIslemler] = useState<ManuelIslem[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string|null>(null);
  const [aktifSekme, setAktifSekme] = useState<"genel"|"giderler"|"islemler">("genel");

  const [secilenAy, setSecilenAy] = useState(() => String(new Date().getMonth()+1).padStart(2,"0"));
  const [secilenYil, setSecilenYil] = useState(() => String(new Date().getFullYear()));
  const [aramaMetni, setAramaMetni] = useState("");
  const [tipFiltre, setTipFiltre] = useState<"hepsi"|"gelir"|"gider"|"transfer">("hepsi");
  const [katFiltre, setKatFiltre] = useState("hepsi");

  // Gider formu
  const [giderFormAcik, setGiderFormAcik] = useState(false);
  const [gKategori, setGKategori] = useState(TUM_GIDER_KATS[0]);
  const [gHesap, setGHesap] = useState("Nakit");
  const [gTutar, setGTutar] = useState("");
  const [gAciklama, setGAciklama] = useState("");
  const [gTarih, setGTarih] = useState(() => new Date().toISOString().split("T")[0]);
  const [gPersonel, setGPersonel] = useState("");

  // Gelir/Transfer formu
  const [islemFormAcik, setIslemFormAcik] = useState(false);
  const [islemTipi, setIslemTipi] = useState<"gelir"|"transfer">("gelir");
  const [iHesap, setIHesap] = useState("Nakit");
  const [iHedef, setIHedef] = useState("TEB");
  const [iKategori, setIKategori] = useState(GELIR_KATEGORILERI[0]);
  const [iTutar, setITutar] = useState("");
  const [iAciklama, setIAciklama] = useState("");
  const [iTarih, setITarih] = useState(() => new Date().toISOString().split("T")[0]);

  // ── Veri çek ──
  const veriCek = useCallback(async () => {
    setLoading(true);
    const { data: r } = await supabase.from("gunluk_raporlar")
      .select("id,tarih,kasa_nakit,kasa_pos,kasa_edenred,gunluk_gider,gider_aciklama,iade_tutar,toplam_ciro,ekleyen_kullanici")
      .order("tarih",{ascending:false});
    if (r) setRaporlar(r as GunlukRapor[]);
    const { data: m } = await supabase.from("kasa_manuel_islemler").select("*").order("islem_tarihi",{ascending:false});
    if (m) setManuelIslemler(m as ManuelIslem[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { veriCek(); }, [veriCek]);

  // ── Filtreler ──
  const filtreliRaporlar = useMemo(() => raporlar.filter(r => {
    const [y,m]=r.tarih.split("-"); return m===secilenAy&&y===secilenYil;
  }), [raporlar,secilenAy,secilenYil]);

  const tumGiderler = useMemo(() => manuelIslemler.filter(i => i.tip === "gider"), [manuelIslemler]);

  const filtreliGiderler = useMemo(() => tumGiderler.filter(i => {
    const [y,m] = i.islem_tarihi.split("-");
    if (m!==secilenAy||y!==secilenYil) return false;
    if (katFiltre!=="hepsi"&&i.kategori!==katFiltre) return false;
    if (aramaMetni) { const q=aramaMetni.toLowerCase(); if(!i.kategori.toLowerCase().includes(q)&&!i.aciklama?.toLowerCase().includes(q)&&!i.hesap.toLowerCase().includes(q)) return false; }
    return true;
  }), [tumGiderler,secilenAy,secilenYil,katFiltre,aramaMetni]);

  const filtreliIslemler = useMemo(() => manuelIslemler.filter(i => {
    const [y,m] = i.islem_tarihi.split("-");
    if (m!==secilenAy||y!==secilenYil) return false;
    if (tipFiltre!=="hepsi"&&i.tip!==tipFiltre) return false;
    if (aramaMetni) { const q=aramaMetni.toLowerCase(); if(!i.kategori.toLowerCase().includes(q)&&!i.aciklama?.toLowerCase().includes(q)) return false; }
    return true;
  }), [manuelIslemler,secilenAy,secilenYil,tipFiltre,aramaMetni]);

  // ── Bakiyeler ──
  const bakiyeler = useMemo(() => {
    let nakit=0, teb=0, vakif=0, enpara=0, manuelNakit=0, toplamGelir=0, toplamGider=0;
    raporlar.forEach(r => {
      nakit += r.kasa_nakit||0;
      toplamGelir += (r.kasa_nakit||0) + (r.kasa_pos||0) + (r.kasa_edenred||0);
      toplamGider += (r.gunluk_gider||0) + (r.iade_tutar||0);
    });
    manuelIslemler.forEach(i => {
      const m=Number(i.tutar);
      if(i.tip==="gelir"){toplamGelir+=m;if(i.hesap==="TEB")teb+=m;if(i.hesap==="VakıfBank")vakif+=m;if(i.hesap==="Enpara")enpara+=m;if(i.hesap==="Nakit")manuelNakit+=m;}
      else if(i.tip==="gider"){toplamGider+=m;if(i.hesap==="TEB")teb-=m;if(i.hesap==="VakıfBank")vakif-=m;if(i.hesap==="Enpara")enpara-=m;if(i.hesap==="Nakit")manuelNakit-=m;}
      else if(i.tip==="transfer"){if(i.hesap==="TEB")teb-=m;if(i.hesap==="VakıfBank")vakif-=m;if(i.hesap==="Enpara")enpara-=m;if(i.hesap==="Nakit")manuelNakit-=m;if(i.hedef_hesap==="TEB")teb+=m;if(i.hedef_hesap==="VakıfBank")vakif+=m;if(i.hedef_hesap==="Enpara")enpara+=m;if(i.hedef_hesap==="Nakit")manuelNakit+=m;}
    });
    return {Nakit:nakit+manuelNakit,TEB:teb,VakıfBank:vakif,Enpara:enpara,toplamGelir,toplamGider};
  }, [raporlar,manuelIslemler]);

  // ── Dönem özeti ──
  const donemOzeti = useMemo(() => {
    let nakitToplam=0, posToplam=0, edenredToplam=0, giderToplam=0;
    const gunlukNakit: Record<number,number> = {};
    filtreliRaporlar.forEach(r => {
      nakitToplam+=r.kasa_nakit||0; posToplam+=r.kasa_pos||0; edenredToplam+=r.kasa_edenred||0;
      giderToplam+=(r.gunluk_gider||0)+(r.iade_tutar||0);
      const g=parseInt(r.tarih.split("-")[2]);
      gunlukNakit[g]=(gunlukNakit[g]||0)+(r.kasa_nakit||0);
    });
    const manuelGider=filtreliGiderler.reduce((s,i)=>s+i.tutar,0);
    const sparkData=Array.from({length:30},(_,i)=>gunlukNakit[i+1]||0);
    return {nakitToplam,posToplam,edenredToplam,giderToplam,manuelGider,sparkData};
  }, [filtreliRaporlar,filtreliGiderler]);

  // ── Gider kategori dağılımı ──
  const kategoriDagilim = useMemo(() => {
    const map: Record<string,number> = {};
    filtreliRaporlar.forEach(r => {
      r.gider_aciklama?.split(" | ").forEach(g => {
        const idx=g.lastIndexOf(": ₺");
        const kat=idx>-1?g.substring(0,idx):g;
        const t=idx>-1?parseFloat(g.substring(idx+3).replace(/\./g,"").replace(",","."))||0:0;
        if(kat&&t>0) map[kat]=(map[kat]||0)+t;
      });
    });
    filtreliGiderler.forEach(i=>{map[i.kategori]=(map[i.kategori]||0)+i.tutar;});
    return Object.entries(map).sort((a,b)=>b[1]-a[1]);
  }, [filtreliRaporlar,filtreliGiderler]);

  // ── Hesap bazlı gider toplamı ──
  const hesapBaziGider = useMemo(() => {
    const map: Record<string,number> = {};
    filtreliGiderler.forEach(i => { map[i.hesap]=(map[i.hesap]||0)+i.tutar; });
    return map;
  }, [filtreliGiderler]);

  // ── Gider kaydet ──
  const handleGiderEkle = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = parseFloat(gTutar.replace(/\./g,"").replace(",","."));
    if (!t||t<=0) { alert("Geçerli tutar girin!"); return; }
    setSaving(true);
    try {
      const {data:{user}} = await supabase.auth.getUser();
      const ekleyen = user?.email?.split("@")[0]||"Bilinmiyor";
      const aciklamaFull = [gAciklama, gPersonel ? `👤 ${gPersonel}` : ""].filter(Boolean).join(" — ");
      const { error } = await supabase.from("kasa_manuel_islemler").insert([{
        tip: "gider", hesap: gHesap, kategori: gKategori,
        tutar: t, aciklama: aciklamaFull,
        islem_tarihi: gTarih, ekleyen_kullanici: ekleyen,
      }]);
      if (error) { alert("Hata: "+error.message); return; }
      setGiderFormAcik(false);
      setGTutar(""); setGAciklama(""); setGPersonel("");
      veriCek();
    } finally { setSaving(false); }
  };

  // ── Gelir/Transfer kaydet ──
  const handleIslemEkle = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = parseFloat(iTutar.replace(/\./g,"").replace(",","."));
    if (!t||t<=0) { alert("Geçerli tutar girin!"); return; }
    if (islemTipi==="transfer"&&iHesap===iHedef) { alert("Hesaplar aynı olamaz!"); return; }
    setSaving(true);
    try {
      const {data:{user}} = await supabase.auth.getUser();
      const ekleyen = user?.email?.split("@")[0]||"Bilinmiyor";
      const { error } = await supabase.from("kasa_manuel_islemler").insert([{
        tip: islemTipi, hesap: iHesap,
        hedef_hesap: islemTipi==="transfer"?iHedef:null,
        kategori: islemTipi==="transfer"?`${iHesap} → ${iHedef}`:iKategori,
        tutar: t, aciklama: iAciklama,
        islem_tarihi: iTarih, ekleyen_kullanici: ekleyen,
      }]);
      if (error) { alert("Hata: "+error.message); return; }
      setIslemFormAcik(false);
      setITutar(""); setIAciklama("");
      veriCek();
    } finally { setSaving(false); }
  };

  const handleSil = async () => {
    if (!deleteTarget) return;
    await supabase.from("kasa_manuel_islemler").delete().eq("id",deleteTarget);
    setDeleteTarget(null); veriCek();
  };

  if (loading) return (
    <div className="h-screen bg-[#060810] flex flex-col items-center justify-center gap-3">
      <div className="w-10 h-10 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"/>
      <span className="text-[10px] text-gray-600 uppercase tracking-[0.3em]">Yükleniyor</span>
    </div>
  );

  const toplam = bakiyeler.Nakit+bakiyeler.TEB+bakiyeler.VakıfBank+bakiyeler.Enpara;
  const netKar = bakiyeler.toplamGelir - bakiyeler.toplamGider;
  const ayLabel = AYLAR.find(m=>m.v===secilenAy)?.l;
  const donemGiderToplam = filtreliGiderler.reduce((s,i)=>s+i.tutar,0) + donemOzeti.giderToplam;

  const inputCls = "w-full bg-[#080b14] border border-[#1a2236] focus:border-blue-500/40 text-white text-xs h-10 px-3 rounded-xl outline-none transition-colors placeholder:text-gray-700";

  return (
    <div className="min-h-screen bg-[#060810] text-white font-sans antialiased">

      {/* ── HEADER ── */}
      <div className="sticky top-0 z-40 border-b border-[#0f1624] bg-[#060810]/96 backdrop-blur-xl">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-900/40">
              <Wallet className="h-4 w-4 text-white"/>
            </div>
            <div>
              <h1 className="text-sm font-black text-white leading-none">Kasa & Finans</h1>
              <p className="text-[10px] text-gray-600 mt-0.5 leading-none">Bakiyeler · Giderler · İşlemler</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-[#0c0f1a] border border-[#1a2236] px-3 py-1.5 rounded-xl">
              <Calendar size={11} className="text-gray-600"/>
              <select value={secilenAy} onChange={e=>setSecilenAy(e.target.value)} className="bg-transparent text-xs font-semibold text-gray-300 outline-none cursor-pointer">
                {AYLAR.map(m=><option key={m.v} value={m.v} className="bg-[#0c0f1a]">{m.l}</option>)}
              </select>
              <span className="text-gray-700">/</span>
              <select value={secilenYil} onChange={e=>setSecilenYil(e.target.value)} className="bg-transparent text-xs font-semibold text-gray-300 outline-none cursor-pointer">
                {["2024","2025","2026","2027"].map(y=><option key={y} value={y} className="bg-[#0c0f1a]">{y}</option>)}
              </select>
            </div>
            <button onClick={()=>exportCSV(filtreliRaporlar,manuelIslemler,secilenAy,secilenYil)}
              className="hidden sm:flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-emerald-400 border border-[#1a2236] hover:border-emerald-500/30 px-3 py-2 rounded-xl transition-colors">
              <FileDown size={13}/> CSV
            </button>
            <button onClick={veriCek} className="p-2 text-gray-600 hover:text-white border border-[#1a2236] rounded-xl transition-colors">
              <RefreshCw size={14}/>
            </button>
            <button onClick={()=>setGiderFormAcik(true)}
              className="flex items-center gap-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-3 py-2 rounded-xl transition-colors shadow-lg shadow-red-900/20">
              <TrendingDown size={13}/> Gider Ekle
            </button>
            <button onClick={()=>setIslemFormAcik(true)}
              className="flex items-center gap-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-2 rounded-xl transition-colors shadow-lg shadow-emerald-900/20">
              <PlusCircle size={13}/> İşlem
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-5 space-y-5">

        {/* ── HESAP BAKİYE KARTLARI ── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {HESAPLAR.map(h => {
            const bakiye = bakiyeler[h as keyof typeof bakiyeler] as number;
            const color = HESAP_COLOR[h];
            const sparkVals = h==="Nakit" ? donemOzeti.sparkData : Array(14).fill(0);
            return (
              <div key={h} className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] p-4 hover:border-[#243050] transition-colors group relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 blur-2xl rounded-full opacity-20 group-hover:opacity-40 transition-all" style={{backgroundColor:color}}/>
                <div className="relative">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-semibold uppercase tracking-widest" style={{color}}>{HESAP_LABEL[h]}</span>
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{backgroundColor:color+"18"}}>
                      {h==="Nakit"?<Coins size={11} style={{color}}/>:<Building2 size={11} style={{color}}/>}
                    </div>
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <p className="text-lg font-black tracking-tight" style={{color}}>₺{fmt2(bakiye)}</p>
                      <p className="text-[9px] text-gray-600 mt-0.5">{h==="Nakit"?"raporlardan":"manuel işlemler"}</p>
                    </div>
                    <Sparkline values={sparkVals.filter(v=>v>0)} color={color}/>
                  </div>
                </div>
              </div>
            );
          })}
          {/* Toplam */}
          <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/8 to-[#0c0f1a] p-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 blur-2xl rounded-full"/>
            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">Toplam</span>
                <div className="w-6 h-6 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                  <TrendingUp size={11} className="text-emerald-400"/>
                </div>
              </div>
              <p className="text-xl font-black text-emerald-400 tracking-tight">₺{fmt2(toplam)}</p>
              <p className="text-[9px] text-gray-600 mt-0.5">tüm hesaplar</p>
            </div>
          </div>
        </div>

        {/* ── SEKME NAVİGASYONU ── */}
        <div className="flex gap-1 bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-1">
          {[
            {key:"genel", label:"Genel Bakış", icon:<BarChart3 size={13}/> },
            {key:"giderler", label:"Giderler", icon:<TrendingDown size={13}/>, badge: filtreliGiderler.length },
            {key:"islemler", label:"Tüm İşlemler", icon:<Receipt size={13}/> },
          ].map(s => (
            <button key={s.key} onClick={()=>setAktifSekme(s.key as "genel"|"giderler"|"islemler")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition-all ${
                aktifSekme===s.key ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"
              }`}>
              {s.icon} {s.label}
              {s.badge ? <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${aktifSekme===s.key?"bg-white/20":"bg-white/5"}`}>{s.badge}</span> : null}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════ */}
        {/* SEKME 1: GENEL BAKIŞ                                  */}
        {/* ══════════════════════════════════════════════════════ */}
        {aktifSekme === "genel" && (
          <div className="space-y-5">
            {/* Net kâr + dönem */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-5 flex flex-col justify-between">
                <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mb-4">Finansal Durum</p>
                <div className="space-y-3">
                  {[
                    {l:"Toplam Gelir", v:bakiyeler.toplamGelir, c:"text-emerald-400", icon:<TrendingUp size={12}/>},
                    {l:"Toplam Gider", v:bakiyeler.toplamGider, c:"text-red-400", icon:<TrendingDown size={12}/>},
                  ].map(i=>(
                    <div key={i.l} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-gray-500"><span className={i.c}>{i.icon}</span><span className="text-xs">{i.l}</span></div>
                      <span className={`text-sm font-black ${i.c}`}>{fmtK(i.v)}</span>
                    </div>
                  ))}
                  <div className="border-t border-[#1a2236] pt-3 flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Net Kâr</span>
                    <span className={`text-lg font-black ${netKar>=0?"text-blue-400":"text-red-400"}`}>{fmtK(Math.abs(netKar))}</span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2 bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="h-4 w-4 text-blue-400"/>
                  <span className="text-sm font-semibold text-gray-200">Dönem — {ayLabel} {secilenYil}</span>
                  <span className="text-[10px] text-gray-600 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">{filtreliRaporlar.length} rapor</span>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
                  {[
                    {l:"Nakit",v:donemOzeti.nakitToplam,c:"text-blue-400",bg:"bg-blue-500/5 border-blue-500/10"},
                    {l:"POS",v:donemOzeti.posToplam,c:"text-purple-400",bg:"bg-purple-500/5 border-purple-500/10"},
                    {l:"Edenred",v:donemOzeti.edenredToplam,c:"text-amber-400",bg:"bg-amber-500/5 border-amber-500/10"},
                    {l:"Gider+İade",v:donemGiderToplam,c:"text-red-400",bg:"bg-red-500/5 border-red-500/10"},
                  ].map(c=>(
                    <div key={c.l} className={`rounded-xl border ${c.bg} px-3 py-2.5`}>
                      <p className="text-[9px] text-gray-600 uppercase tracking-widest">{c.l}</p>
                      <p className={`text-sm font-black mt-0.5 ${c.c}`}>{fmtK(c.v)}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-gray-600 mb-1.5">Günlük nakit trendi</p>
                <div className="flex items-end gap-0.5 h-12">
                  {donemOzeti.sparkData.map((v,i)=>{
                    const max=Math.max(...donemOzeti.sparkData,1);
                    return <div key={i} className="flex-1 rounded-t-sm" style={{height:`${Math.max((v/max)*44,v>0?3:0)}px`,backgroundColor:v>0?"#3B82F6":"#1a2236",opacity:v>0?0.7:0.2}} title={`${i+1} ${ayLabel}: ₺${fmt2(v)}`}/>;
                  })}
                </div>
              </div>
            </div>

            {/* Gider dağılımı */}
            {kategoriDagilim.length > 0 && (
              <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Gider Dağılımı — {ayLabel}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {kategoriDagilim.slice(0,6).map(([kat,val])=>{
                    const maxVal=kategoriDagilim[0][1];
                    return (
                      <div key={kat}>
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-[11px] text-gray-400 truncate max-w-[160px]">{kat}</span>
                          <span className="text-[11px] font-bold text-white ml-2">{fmtK(val)}</span>
                        </div>
                        <div className="h-1.5 bg-[#1a2236] rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-red-500/60" style={{width:`${(val/maxVal)*100}%`}}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Günlük rapor tablosu */}
            <div className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#1a2236]">
                <h3 className="text-sm font-semibold text-gray-200">Günlük Rapor Kasa Özeti</h3>
                <p className="text-[10px] text-gray-600 mt-0.5">{ayLabel} {secilenYil} · rapor kaynaklı veriler</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#080b14] border-b border-[#1a2236]">
                      {["Tarih","Nakit","POS","Edenred","Gider","İade","Net","Giren"].map((h,i)=>(
                        <th key={i} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-gray-600">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#0f1624]">
                    {filtreliRaporlar.length===0 ? (
                      <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-600 text-xs uppercase tracking-widest">Bu dönemde rapor yok</td></tr>
                    ) : filtreliRaporlar.map(r=>{
                      const net=(r.kasa_nakit||0)+(r.kasa_pos||0)+(r.kasa_edenred||0)-(r.gunluk_gider||0)-(r.iade_tutar||0);
                      return (
                        <tr key={r.id} className="hover:bg-white/[0.015] transition-colors">
                          <td className="px-4 py-3 font-semibold text-gray-300">{fmtTarih(r.tarih)}</td>
                          <td className="px-4 py-3 text-blue-400 font-bold">₺{fmt2(r.kasa_nakit||0)}</td>
                          <td className="px-4 py-3 text-purple-400 font-bold">₺{fmt2(r.kasa_pos||0)}</td>
                          <td className="px-4 py-3 text-amber-400">₺{fmt2(r.kasa_edenred||0)}</td>
                          <td className="px-4 py-3 text-red-400">{(r.gunluk_gider||0)>0?`-₺${fmt2(r.gunluk_gider)}`:"—"}</td>
                          <td className="px-4 py-3 text-orange-400">{(r.iade_tutar||0)>0?`-₺${fmt2(r.iade_tutar)}`:"—"}</td>
                          <td className={`px-4 py-3 font-black ${net>=0?"text-emerald-400":"text-red-400"}`}>₺{fmt2(net)}</td>
                          <td className="px-4 py-3 text-gray-600 text-[10px]">{r.ekleyen_kullanici}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {filtreliRaporlar.length>0&&(
                    <tfoot>
                      <tr className="border-t-2 border-[#1a2236] bg-[#080b14] font-black">
                        <td className="px-4 py-3 text-[10px] text-gray-600 uppercase">Dönem Toplamı</td>
                        <td className="px-4 py-3 text-blue-400">₺{fmt2(donemOzeti.nakitToplam)}</td>
                        <td className="px-4 py-3 text-purple-400">₺{fmt2(donemOzeti.posToplam)}</td>
                        <td className="px-4 py-3 text-amber-400">₺{fmt2(donemOzeti.edenredToplam)}</td>
                        <td className="px-4 py-3 text-red-400">-₺{fmt2(donemOzeti.giderToplam)}</td>
                        <td className="px-4 py-3 text-orange-400">-₺{fmt2(filtreliRaporlar.reduce((s,r)=>s+(r.iade_tutar||0),0))}</td>
                        <td className="px-4 py-3 text-emerald-400">₺{fmt2(donemOzeti.nakitToplam+donemOzeti.posToplam+donemOzeti.edenredToplam-donemOzeti.giderToplam)}</td>
                        <td/>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* SEKME 2: GİDERLER                                     */}
        {/* ══════════════════════════════════════════════════════ */}
        {aktifSekme === "giderler" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-[#0c0f1a] border border-red-500/20 rounded-2xl p-4">
                <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mb-2">Dönem Gideri</p>
                <p className="text-xl font-black text-red-400">₺{fmt2(donemGiderToplam)}</p>
                <p className="text-[10px] text-gray-600 mt-1">{ayLabel} {secilenYil}</p>
              </div>
              <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-4">
                <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mb-2">Manuel Gider</p>
                <p className="text-xl font-black text-orange-400">₺{fmt2(filtreliGiderler.reduce((s,i)=>s+i.tutar,0))}</p>
                <p className="text-[10px] text-gray-600 mt-1">{filtreliGiderler.length} kayıt</p>
              </div>
              {HESAPLAR.filter(h=>hesapBaziGider[h]>0).slice(0,2).map(h=>(
                <div key={h} className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-4">
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mb-2">{HESAP_LABEL[h]}&apos;dan</p>
                  <p className="text-xl font-black" style={{color:HESAP_COLOR[h]}}>₺{fmt2(hesapBaziGider[h])}</p>
                  <p className="text-[10px] text-gray-600 mt-1">ödeme çıktı</p>
                </div>
              ))}
            </div>

            {/* Filtreler */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="flex items-center gap-1.5 bg-[#0c0f1a] border border-[#1a2236] rounded-xl px-3 py-1.5">
                <Tag size={11} className="text-gray-600"/>
                <select value={katFiltre} onChange={e=>setKatFiltre(e.target.value)} className="bg-transparent text-xs text-gray-300 outline-none cursor-pointer">
                  <option value="hepsi" className="bg-[#0c0f1a]">Tüm Kategoriler</option>
                  {TUM_GIDER_KATS.map(k=><option key={k} value={k} className="bg-[#0c0f1a]">{k}</option>)}
                </select>
              </div>
            </div>

            {/* Gider listesi */}
            <div className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#080b14] border-b border-[#1a2236]">
                      {["Tarih","Kategori","Hesap","Açıklama","Tutar",""].map((h,i)=>(
                        <th key={i} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-gray-600">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#0f1624]">
                    {filtreliGiderler.length===0 ? (
                      <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-600 uppercase tracking-widest">Bu dönemde gider yok</td></tr>
                    ) : filtreliGiderler.map(i=>(
                      <tr key={i.id} className="hover:bg-white/[0.015] transition-colors">
                        <td className="px-4 py-3 text-gray-400">{fmtTarih(i.islem_tarihi)}</td>
                        <td className="px-4 py-3 text-white font-semibold">{i.kategori}</td>
                        <td className="px-4 py-3"><HesapBadge hesap={i.hesap}/></td>
                        <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{i.aciklama||"—"}</td>
                        <td className="px-4 py-3 text-red-400 font-black">-₺{fmt2(i.tutar)}</td>
                        <td className="px-4 py-3">
                          <button onClick={()=>setDeleteTarget(i.id)} className="text-gray-700 hover:text-red-400 transition-colors p-1">
                            <Trash2 size={13}/>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* SEKME 3: TÜM İŞLEMLER                                */}
        {/* ══════════════════════════════════════════════════════ */}
        {aktifSekme === "islemler" && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center">
              {(["hepsi","gelir","gider","transfer"] as const).map(t=>(
                <button key={t} onClick={()=>setTipFiltre(t)}
                  className={`text-xs font-bold px-4 py-2 rounded-xl transition-colors capitalize ${
                    tipFiltre===t
                      ? t==="gelir"?"bg-emerald-600 text-white":t==="gider"?"bg-red-600 text-white":t==="transfer"?"bg-blue-600 text-white":"bg-white/10 text-white"
                      : "bg-white/5 text-gray-500 hover:text-white"
                  }`}>
                  {t==="hepsi"?"Tümü":t==="gelir"?"Gelir":t==="gider"?"Gider":"Transfer"}
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-[#1a2236] bg-[#0c0f1a] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#080b14] border-b border-[#1a2236]">
                      {["Tarih","Tip","Hesap","Kategori","Açıklama","Tutar",""].map((h,i)=>(
                        <th key={i} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-gray-600">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#0f1624]">
                    {filtreliIslemler.length===0 ? (
                      <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-600 uppercase tracking-widest">Bu dönemde işlem yok</td></tr>
                    ) : filtreliIslemler.map(i=>(
                      <tr key={i.id} className="hover:bg-white/[0.015] transition-colors">
                        <td className="px-4 py-3 text-gray-400">{fmtTarih(i.islem_tarihi)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${
                            i.tip==="gelir"?"bg-emerald-500/10 text-emerald-400":
                            i.tip==="gider"?"bg-red-500/10 text-red-400":"bg-blue-500/10 text-blue-400"
                          }`}>{i.tip==="gelir"?"Gelir":i.tip==="gider"?"Gider":"Transfer"}</span>
                        </td>
                        <td className="px-4 py-3"><HesapBadge hesap={i.hesap}/></td>
                        <td className="px-4 py-3 text-white">{i.kategori}</td>
                        <td className="px-4 py-3 text-gray-500 max-w-[180px] truncate">{i.aciklama||"—"}</td>
                        <td className={`px-4 py-3 font-black ${i.tip==="gelir"?"text-emerald-400":i.tip==="gider"?"text-red-400":"text-blue-400"}`}>
                          {i.tip==="gider"?"-":""}₺{fmt2(i.tutar)}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={()=>setDeleteTarget(i.id)} className="text-gray-700 hover:text-red-400 transition-colors p-1">
                            <Trash2 size={13}/>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── SİLME ONAYI ── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-6 max-w-sm w-full">
            <p className="text-sm font-bold text-white mb-2">İşlemi Sil</p>
            <p className="text-xs text-gray-500 mb-5">Bu işlem kalıcı olarak silinecek. Emin misiniz?</p>
            <div className="flex gap-2">
              <button onClick={()=>setDeleteTarget(null)} className="flex-1 text-xs font-semibold text-gray-500 border border-[#1a2236] py-2.5 rounded-xl hover:text-white transition-colors">İptal</button>
              <button onClick={handleSil} className="flex-1 text-xs font-bold text-white bg-red-600 hover:bg-red-700 py-2.5 rounded-xl transition-colors">Sil</button>
            </div>
          </div>
        </div>
      )}

      {/* ── GİDER FORMU ── */}
      {giderFormAcik && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a2236]">
              <p className="text-sm font-black text-white">Gider Ekle</p>
              <button onClick={()=>setGiderFormAcik(false)} className="text-gray-600 hover:text-white"><X size={16}/></button>
            </div>
            <form onSubmit={handleGiderEkle} className="p-5 space-y-3">
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Kategori</p>
                <select value={gKategori} onChange={e=>setGKategori(e.target.value)} className={inputCls}>
                  {GIDER_KATEGORILERI.map(g=>(
                    <optgroup key={g.grup} label={g.grup}>
                      {g.items.map(it=><option key={it} value={it} className="bg-[#0c0f1a]">{it}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Hesap</p>
                  <select value={gHesap} onChange={e=>setGHesap(e.target.value)} className={inputCls}>
                    {HESAPLAR.map(h=><option key={h} value={h} className="bg-[#0c0f1a]">{HESAP_LABEL[h]}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Tarih</p>
                  <input type="date" value={gTarih} onChange={e=>setGTarih(e.target.value)} className={inputCls}/>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Tutar (₺) *</p>
                <input type="number" value={gTutar} onChange={e=>setGTutar(e.target.value)} placeholder="0.00" step="0.01" className={inputCls}/>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Açıklama</p>
                <input value={gAciklama} onChange={e=>setGAciklama(e.target.value)} placeholder="Opsiyonel..." className={inputCls}/>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Personel</p>
                <input value={gPersonel} onChange={e=>setGPersonel(e.target.value)} placeholder="Opsiyonel..." className={inputCls}/>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={()=>setGiderFormAcik(false)} className="flex-1 text-xs font-semibold text-gray-500 border border-[#1a2236] py-2.5 rounded-xl hover:text-white transition-colors">İptal</button>
                <button type="submit" disabled={saving} className="flex-1 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                  {saving?<Loader2 size={13} className="animate-spin"/>:null} Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── GELİR/TRANSFER FORMU ── */}
      {islemFormAcik && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a2236]">
              <p className="text-sm font-black text-white">İşlem Ekle</p>
              <button onClick={()=>setIslemFormAcik(false)} className="text-gray-600 hover:text-white"><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex gap-2">
                {(["gelir","transfer"] as const).map(t=>(
                  <button key={t} onClick={()=>setIslemTipi(t)}
                    className={`flex-1 text-xs font-bold py-2.5 rounded-xl transition-colors capitalize ${
                      islemTipi===t
                        ? t==="gelir"?"bg-emerald-600 text-white":"bg-blue-600 text-white"
                        : "bg-white/5 text-gray-500 hover:text-white"
                    }`}>
                    {t==="gelir"?"Gelir":"Transfer"}
                  </button>
                ))}
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Kaynak Hesap</p>
                <select value={iHesap} onChange={e=>setIHesap(e.target.value)} className={inputCls}>
                  {HESAPLAR.map(h=><option key={h} value={h} className="bg-[#0c0f1a]">{HESAP_LABEL[h]}</option>)}
                </select>
              </div>
              {islemTipi==="transfer" && (
                <div>
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Hedef Hesap</p>
                  <select value={iHedef} onChange={e=>setIHedef(e.target.value)} className={inputCls}>
                    {HESAPLAR.filter(h=>h!==iHesap).map(h=><option key={h} value={h} className="bg-[#0c0f1a]">{HESAP_LABEL[h]}</option>)}
                  </select>
                </div>
              )}
              {islemTipi==="gelir" && (
                <div>
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Kategori</p>
                  <select value={iKategori} onChange={e=>setIKategori(e.target.value)} className={inputCls}>
                    {GELIR_KATEGORILERI.map(k=><option key={k} value={k} className="bg-[#0c0f1a]">{k}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Tutar (₺) *</p>
                  <input type="number" value={iTutar} onChange={e=>setITutar(e.target.value)} placeholder="0.00" step="0.01" className={inputCls}/>
                </div>
                <div>
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Tarih</p>
                  <input type="date" value={iTarih} onChange={e=>setITarih(e.target.value)} className={inputCls}/>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Açıklama</p>
                <input value={iAciklama} onChange={e=>setIAciklama(e.target.value)} placeholder="Opsiyonel..." className={inputCls}/>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={()=>setIslemFormAcik(false)} className="flex-1 text-xs font-semibold text-gray-500 border border-[#1a2236] py-2.5 rounded-xl hover:text-white transition-colors">İptal</button>
                <button onClick={handleIslemEkle as any} disabled={saving} className="flex-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                  {saving?<Loader2 size={13} className="animate-spin"/>:null} Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
