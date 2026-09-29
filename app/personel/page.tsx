"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ChefHat, Bike, Sparkles, Store, Plus, ChevronDown,
  Users, Search, RefreshCw, Loader2, UserCheck, UserX,
  Phone, Calendar, ShieldCheck
} from "lucide-react";

interface Personel {
  id: string;
  isim: string;
  telefon?: string;
  departman?: string;
  maas?: number;
  ise_giris_tarihi?: string;
  isten_cikis_tarihi?: string;
  durum: "aktif" | "ayrildi";
}

const DEPARTMANLAR = [
  { key: "Mutfak", label: "Mutfak", icon: ChefHat },
  { key: "Banko", label: "Banko", icon: Store },
  { key: "Kurye", label: "Kurye", icon: Bike },
  { key: "Temizlik", label: "Temizlik", icon: Sparkles },
  { key: "Yönetim", label: "Yönetim", icon: ShieldCheck },
  { key: "Diğer", label: "Diğer", icon: Users },
];

const fmt = (v: number) => new Intl.NumberFormat("tr-TR").format(v);
const fmtTarih = (t?: string) => {
  if (!t) return null;
  const [y, m, d] = t.split("-");
  return `${d}.${m}.${y}`;
};
const calismaSuresi = (t?: string) => {
  if (!t) return null;
  const ay = Math.floor((Date.now() - new Date(t).getTime()) / (1000 * 60 * 60 * 24 * 30));
  if (ay < 1) return "Bu ay başladı";
  if (ay < 12) return `${ay} ay`;
  return `${Math.floor(ay / 12)} yıl ${ay % 12} ay`;
};

function PersonelKart({ personel }: { personel: Personel }) {
  const initials = personel.isim
    .split(" ")
    .map(n => n[0])
    .slice(0, 2)
    .join("");

  return (
    <Link href={`/personel/${personel.id}`} className="block">
      <div className="group flex items-center justify-between gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.035] px-5 py-4 transition-all duration-300 hover:-translate-y-px hover:border-[#d9b866]/30 hover:bg-white/[0.055] hover:shadow-[0_12px_35px_rgba(0,0,0,0.22)]">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#d9b866]/20 bg-[#d9b866]/10 text-sm font-black text-[#e4c87a]">
            {initials}
          </div>

          <div className="min-w-0">
            <p className="truncate text-[14px] font-bold text-white transition-colors group-hover:text-[#e4c87a]">
              {personel.isim}
            </p>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
              {personel.telefon && (
                <span className="flex items-center gap-1.5 text-[11px] text-white/48">
                  <Phone size={11} />
                  {personel.telefon}
                </span>
              )}
              {personel.ise_giris_tarihi && (
                <span className="flex items-center gap-1.5 text-[11px] text-white/48">
                  <Calendar size={11} />
                  {calismaSuresi(personel.ise_giris_tarihi)}
                </span>
              )}
              {personel.durum === "ayrildi" && personel.isten_cikis_tarihi && (
                <span className="text-[11px] text-white/38">
                  Çıkış: {fmtTarih(personel.isten_cikis_tarihi)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {personel.maas ? (
            <p className="text-xs font-bold text-[#e4c87a]">₺{fmt(personel.maas)}</p>
          ) : null}

          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${
            personel.durum === "aktif"
              ? "border-[#d9b866]/20 bg-[#d9b866]/10 text-[#e4c87a]"
              : "border-white/10 bg-white/[0.04] text-white/45"
          }`}>
            {personel.durum === "aktif" ? "Aktif" : "Ayrıldı"}
          </span>
        </div>
      </div>
    </Link>
  );
}

function DepartmanBolum({
  dept, personeller, acik, onToggle,
}: {
  dept: typeof DEPARTMANLAR[0];
  personeller: Personel[];
  acik: boolean;
  onToggle: () => void;
}) {
  const Icon = dept.icon;

  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#111315]/80 shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors duration-300 hover:bg-white/[0.025]"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#d9b866]/15 bg-[#d9b866]/[0.07]">
            <Icon size={16} className="text-[#d9b866]" />
          </div>
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-white/85">{dept.label}</p>
            <p className="mt-0.5 text-[10px] text-white/35">
              {personeller.length === 1 ? "1 personel" : `${personeller.length} personel`}
            </p>
          </div>
        </div>

        <ChevronDown
          size={16}
          className={`text-white/35 transition-transform duration-300 ${acik ? "rotate-180 text-[#d9b866]" : ""}`}
        />
      </button>

      {acik && (
        <div className="border-t border-white/[0.06] px-4 pb-4">
          {personeller.length === 0 ? (
            <div className="py-8 text-center text-[10px] uppercase tracking-[0.18em] text-white/25">
              Bu departmanda personel yok
            </div>
          ) : (
            <div className="space-y-2 pt-3">
              {personeller.map(p => <PersonelKart key={p.id} personel={p} />)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PersonellerPageInner() {
  const supabase = createClient();
  const searchParams = useSearchParams();

  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"aktif" | "ayrildi">(
    searchParams.get("tab") === "ayrildi" ? "ayrildi" : "aktif"
  );
  const [aramaMetni, setAramaMetni] = useState("");
  const [acikBolumler, setAcikBolumler] = useState<Record<string, boolean>>({
    Mutfak: true, Banko: true, Kurye: true, Temizlik: false, Yönetim: false, Diğer: false,
  });

  const veriCek = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("personeller")
      .select("id,isim,telefon,departman,maas,ise_giris_tarihi,isten_cikis_tarihi,durum")
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
        return p.isim.toLowerCase().includes(q) ||
          p.departman?.toLowerCase().includes(q) ||
          p.telefon?.includes(q);
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
    <div className="flex min-h-screen items-center justify-center bg-[#090a0b]">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/10 border-t-[#d9b866]" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#090a0b] text-white antialiased">
      <div className="mx-auto w-full max-w-[1180px] px-5 pb-14 pt-7 lg:px-8">

        <header className="mb-7 flex flex-col gap-5 border-b border-white/[0.07] pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#d9b866]/20 bg-[#d9b866]/10 shadow-[0_8px_25px_rgba(0,0,0,0.18)]">
              <Users size={19} className="text-[#e4c87a]" />
            </div>
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#d9b866]">KEBO ERP</p>
              <h1 className="text-2xl font-black tracking-[-0.03em] text-white">Personeller</h1>
              <p className="mt-1 text-xs text-white/38">
                {aktifSayisi} aktif · {ayrilanSayisi} ayrılan
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={veriCek}
              aria-label="Personelleri yenile"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white/50 transition-all hover:border-[#d9b866]/25 hover:bg-white/[0.06] hover:text-[#e4c87a]"
            >
              <RefreshCw size={15} />
            </button>

            <Link
              href="/personel/yeni"
              className="flex h-10 items-center gap-2 rounded-xl border border-[#d9b866]/25 bg-[#d9b866] px-4 text-xs font-bold text-[#17130b] shadow-[0_8px_25px_rgba(217,184,102,0.14)] transition-all hover:-translate-y-px hover:bg-[#e4c87a]"
            >
              <Plus size={14} />
              Personel Ekle
            </Link>
          </div>
        </header>

        <div className="mb-5 flex flex-col gap-3 lg:flex-row">
          <div className="flex rounded-2xl border border-white/[0.07] bg-white/[0.025] p-1">
            <button
              onClick={() => setTab("aktif")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all duration-300 ${
                tab === "aktif"
                  ? "bg-[#d9b866] text-[#17130b] shadow-[0_5px_20px_rgba(217,184,102,0.12)]"
                  : "text-white/45 hover:text-white"
              }`}
            >
              <UserCheck size={13} />
              Aktif
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                tab === "aktif" ? "bg-black/10" : "bg-white/[0.06]"
              }`}>
                {aktifSayisi}
              </span>
            </button>

            <button
              onClick={() => setTab("ayrildi")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all duration-300 ${
                tab === "ayrildi"
                  ? "bg-white/10 text-white"
                  : "text-white/45 hover:text-white"
              }`}
            >
              <UserX size={13} />
              Ayrılanlar
              <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px]">
                {ayrilanSayisi}
              </span>
            </button>
          </div>

          <div className="relative flex-1">
            <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              value={aramaMetni}
              onChange={e => setAramaMetni(e.target.value)}
              placeholder="İsim, departman veya telefon ara..."
              className="h-[42px] w-full rounded-2xl border border-white/[0.08] bg-white/[0.035] pl-11 pr-4 text-xs text-white outline-none transition-all placeholder:text-white/25 focus:border-[#d9b866]/35 focus:bg-white/[0.05]"
            />
          </div>
        </div>

        {aramaMetni && (
          <div className="space-y-3">
            <p className="px-1 text-[10px] uppercase tracking-[0.18em] text-white/30">
              {filtreliPersoneller.length} sonuç
            </p>

            {filtreliPersoneller.length === 0 ? (
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] py-12 text-center text-xs text-white/30">
                Personel bulunamadı
              </div>
            ) : (
              filtreliPersoneller.map(p => <PersonelKart key={p.id} personel={p} />)
            )}
          </div>
        )}

        {!aramaMetni && (
          <div className="space-y-3">
            {DEPARTMANLAR.map(dept => (
              <DepartmanBolum
                key={dept.key}
                dept={dept}
                personeller={gruplar[dept.key] || []}
                acik={acikBolumler[dept.key]}
                onToggle={() => setAcikBolumler(prev => ({ ...prev, [dept.key]: !prev[dept.key] }))}
              />
            ))}
          </div>
        )}

        <p className="mt-7 text-center text-[10px] tracking-wide text-white/20">
          KEBO ERP · Toplam {personeller.length} personel kaydı
        </p>
      </div>
    </div>
  );
}

export default function PersonellerPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#090a0b]">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/10 border-t-[#d9b866]" />
      </div>
    }>
      <PersonellerPageInner />
    </Suspense>
  );
}
