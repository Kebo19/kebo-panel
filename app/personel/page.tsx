"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ChefHat, Bike, Sparkles, Store, Plus, ChevronDown,
  Users, Search, RefreshCw, Loader2, UserCheck, UserX,
  Phone, Wallet, Calendar, ShieldCheck
} from "lucide-react";

interface Personel {
  id: string; isim: string; telefon?: string; departman?: string; maas?: number;
  ise_giris_tarihi?: string; isten_cikis_tarihi?: string; durum: "aktif" | "ayrildi";
}

const DEPARTMANLAR = [
  { key: "Mutfak", label: "Mutfak", icon: ChefHat, color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20" },
  { key: "Banko", label: "Banko", icon: Store, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  { key: "Kurye", label: "Kurye", icon: Bike, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  { key: "Temizlik", label: "Temizlik", icon: Sparkles, color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20" },
  { key: "Yönetim", label: "Yönetim", icon: ShieldCheck, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  { key: "Diğer", label: "Diğer", icon: Users, color: "text-gray-400", bg: "bg-gray-500/10", border: "border-gray-500/20" },
];

const fmt = (v: number) => new Intl.NumberFormat("tr-TR").format(v);
const calismaSuresi = (t?: string) => {
  if (!t) return null;
  const ay = Math.floor((Date.now() - new Date(t).getTime()) / (1000 * 60 * 60 * 24 * 30));
  if (ay < 1) return "Bu ay başladı";
  if (ay < 12) return `${ay} ay`;
  return `${Math.floor(ay / 12)} yıl ${ay % 12} ay`;
};

function PersonelKart({ personel }: { personel: Personel }) {
  return (
    <Link href={`/personel/${personel.id}`}>
      <div className="bg-[#080b14] border border-[#1a2236] hover:border-[#2a3550] rounded-xl p-4 flex items-center justify-between gap-3 transition-colors group cursor-pointer">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 text-xs font-bold text-blue-400">
            {personel.isim.split(" ").map(n => n[0]).slice(0, 2).join("")}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors truncate">{personel.isim}</p>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              {personel.telefon && <span className="text-[11px] text-gray-600 flex items-center gap-1"><Phone size={9} />{personel.telefon}</span>}
              {personel.ise_giris_tarihi && <span className="text-[11px] text-gray-600 flex items-center gap-1"><Calendar size={9} />{calismaSuresi(personel.ise_giris_tarihi)}</span>}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          {personel.maas ? <p className="text-xs font-bold text-emerald-400">₺{fmt(personel.maas)}</p> : null}
          <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-lg ${personel.durum === "aktif" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
            {personel.durum === "aktif" ? "Aktif" : "Ayrıldı"}
          </span>
        </div>
      </div>
    </Link>
  );
}

function DepartmanBolum({ dept, personeller, acik, onToggle }: {
  dept: typeof DEPARTMANLAR[0]; personeller: Personel[]; acik: boolean; onToggle: () => void;
}) {
  const Icon = dept.icon;
  return (
    <div className={`rounded-2xl border overflow-hidden ${dept.border} bg-[#0c0f1a]`}>
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.02] transition-colors">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-xl ${dept.bg} flex items-center justify-center`}>
            <Icon size={15} className={dept.color} />
          </div>
          <p className={`text-xs font-bold ${dept.color} uppercase tracking-wider`}>{dept.label}</p>
          <span className="text-[11px] text-gray-600 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">{personeller.length} kişi</span>
        </div>
        <ChevronDown size={15} className={`text-gray-600 transition-transform duration-300 ${acik ? "rotate-180" : ""}`} />
      </button>
      {acik && (
        <div className="px-4 pb-4 space-y-2 border-t border-[#1a2236]">
          {personeller.length === 0
            ? <div className="py-6 text-center text-gray-600 text-xs uppercase tracking-widest">Bu departmanda personel yok</div>
            : <div className="pt-3 space-y-2">{personeller.map(p => <PersonelKart key={p.id} personel={p} />)}</div>
          }
        </div>
      )}
    </div>
  );
}

function PersonellerPageInner() {
  const supabase = createClient();
  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"aktif" | "ayrildi">("aktif");
  const [aramaMetni, setAramaMetni] = useState("");
  const [acikBolumler, setAcikBolumler] = useState<Record<string, boolean>>({
    Mutfak: true, Banko: true, Kurye: true, Temizlik: false, Yönetim: false, Diğer: false,
  });

  const veriCek = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("personeller")
      .select("id, isim, telefon, departman, maas, ise_giris_tarihi, isten_cikis_tarihi, durum")
      .order("isim");
    if (!error && data) setPersoneller(data as Personel[]);
    setLoading(false);
  }, []);

  useEffect(() => { veriCek(); }, [veriCek]);

  const filtreliPersoneller = useMemo(() => {
    return personeller.filter(p => {
      if (p.durum !== tab) return false;
      if (aramaMetni) {
        const q = aramaMetni.toLowerCase();
        return p.isim.toLowerCase().includes(q) || p.departman?.toLowerCase().includes(q) || p.telefon?.includes(q);
      }
      return true;
    });
  }, [personeller, tab, aramaMetni]);

  const gruplar = useMemo(() => {
    const map: Record<string, Personel[]> = {};
    DEPARTMANLAR.forEach(d => { map[d.key] = []; });
    filtreliPersoneller.forEach(p => {
      const dept = p.departman || "Diğer";
      if (!map[dept]) map[dept] = [];
      map[dept].push(p);
    });
    return map;
  }, [filtreliPersoneller]);

  const aktifSayisi = personeller.filter(p => p.durum === "aktif").length;
  const ayrilanSayisi = personeller.filter(p => p.durum === "ayrildi").length;

  if (loading) return (
    <div className="min-h-screen bg-[#060810] flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#060810] text-white font-sans antialiased">
      <div className="sticky top-0 z-40 border-b border-[#0f1624] bg-[#060810]/95 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-900/40">
              <Users className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-white leading-none">Personeller</h1>
              <p className="text-[10px] text-gray-600 leading-none mt-0.5">{aktifSayisi} aktif · {ayrilanSayisi} ayrılan</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={veriCek} className="p-2 text-gray-600 hover:text-white border border-[#1a2236] hover:border-[#2a3550] rounded-xl transition-colors">
              <RefreshCw size={14} />
            </button>
            <Link href="/personel/yeni"
              className="flex items-center gap-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl transition-colors shadow-lg shadow-blue-900/20">
              <Plus size={14} /> Personel Ekle
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-1 bg-[#0c0f1a] border border-[#1a2236] rounded-xl p-1">
            <button onClick={() => setTab("aktif")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-colors ${tab === "aktif" ? "bg-emerald-600 text-white" : "text-gray-500 hover:text-gray-300"}`}>
              <UserCheck size={13} /> Aktif
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tab === "aktif" ? "bg-white/20" : "bg-white/5"}`}>{aktifSayisi}</span>
            </button>
            <button onClick={() => setTab("ayrildi")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-colors ${tab === "ayrildi" ? "bg-red-600 text-white" : "text-gray-500 hover:text-gray-300"}`}>
              <UserX size={13} /> Ayrılanlar
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tab === "ayrildi" ? "bg-white/20" : "bg-white/5"}`}>{ayrilanSayisi}</span>
            </button>
          </div>
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
            <input value={aramaMetni} onChange={e => setAramaMetni(e.target.value)}
              placeholder="İsim, departman veya telefon ara..."
              className="w-full bg-[#0c0f1a] border border-[#1a2236] text-white text-xs h-9 pl-9 pr-3 rounded-xl outline-none focus:border-blue-500/40 placeholder:text-gray-700" />
          </div>
        </div>

        {aramaMetni ? (
          <div className="space-y-2">
            <p className="text-[10px] text-gray-600 uppercase tracking-widest px-1">{filtreliPersoneller.length} sonuç</p>
            {filtreliPersoneller.length === 0
              ? <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl py-10 text-center text-gray-600 text-xs uppercase tracking-widest">Personel bulunamadı</div>
              : filtreliPersoneller.map(p => <PersonelKart key={p.id} personel={p} />)
            }
          </div>
        ) : (
          <div className="space-y-3">
            {DEPARTMANLAR.map(dept => (
              <DepartmanBolum key={dept.key} dept={dept} personeller={gruplar[dept.key] || []}
                acik={acikBolumler[dept.key]}
                onToggle={() => setAcikBolumler(prev => ({ ...prev, [dept.key]: !prev[dept.key] }))} />
            ))}
          </div>
        )}

        <p className="text-center text-[10px] text-gray-700 py-2">KEBO ERP · Toplam {personeller.length} personel kaydı</p>
      </div>
    </div>
  );
}

export default function PersonellerPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#060810] flex items-center justify-center"><div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" /></div>}>
      <PersonellerPageInner />
    </Suspense>
  );
}