"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import {
  Users, Wallet, TrendingUp, ArrowUpRight,
  ChevronRight, AlertTriangle, CheckCircle2,
  FileText, Bike, ChefHat, Store, Clock,
  BarChart3, Calendar
} from "lucide-react";

const fmt = (v: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(v);
const fmtK = (v: number) => {
  if (v >= 1000000) return `₺${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `₺${(v / 1000).toFixed(0)}K`;
  return `₺${fmt(v)}`;
};

function AnimatedNumber({ value, prefix = "", suffix = "" }: { value: number; prefix?: string; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const start = prev.current, end = value, startTime = performance.now();
    const animate = (now: number) => {
      const p = Math.min((now - startTime) / 1200, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(start + (end - start) * e));
      if (p < 1) requestAnimationFrame(animate); else prev.current = end;
    };
    requestAnimationFrame(animate);
  }, [value]);
  return <span>{prefix}{fmt(display)}{suffix}</span>;
}

export default function Anasayfa() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [kullanici, setKullanici] = useState("");
  const [d, setD] = useState({
    aktifPersonel: 0, kurye: 0, mutfak: 0, banko: 0, eksikBelge: 0,
    bugunRapor: false, bugunCiro: 0, bugunNet: 0, bugunPaket: 0,
    aylikCiro: 0, aylikNet: 0, aylikGider: 0, donemRapor: 0,
    enYuksek: 0, gunOrt: 0,
    bekleyenTutar: 0, bekleyenAdet: 0, gecikmisTutar: 0,
  });

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) setKullanici(user.email.split("@")[0]);

      const { data: personeller } = await supabase.from("personeller").select("departman,durum,tc_kimlik,iban");
      let aktifPersonel = 0, kurye = 0, mutfak = 0, banko = 0, eksikBelge = 0;
      if (personeller) {
        const aktif = personeller.filter(p => p.durum === "aktif");
        aktifPersonel = aktif.length;
        kurye = aktif.filter(p => p.departman === "Kurye").length;
        mutfak = aktif.filter(p => p.departman === "Mutfak").length;
        banko = aktif.filter(p => p.departman === "Banko").length;
        eksikBelge = aktif.filter(p => !p.tc_kimlik || !p.iban).length;
      }

      const today = new Date().toISOString().split("T")[0];
      const { data: bugunData } = await supabase.from("gunluk_raporlar")
        .select("toplam_ciro,gunluk_gider,iade_tutar,kurye_raporlari").eq("tarih", today).single();
      const bugunCiro = bugunData?.toplam_ciro || 0;
      const bugunNet = bugunCiro - (bugunData?.gunluk_gider || 0) - (bugunData?.iade_tutar || 0);
      const bugunPaket = bugunData?.kurye_raporlari?.reduce((s: number, k: any) => s + (parseInt(k.paketSayisi) || 0), 0) || 0;

      const ay = String(new Date().getMonth() + 1).padStart(2, "0");
      const yil = String(new Date().getFullYear());
      const sonGun = new Date(parseInt(yil), parseInt(ay), 0).getDate();
      const { data: aylik } = await supabase.from("gunluk_raporlar").select("toplam_ciro,gunluk_gider,iade_tutar")
        .gte("tarih", `${yil}-${ay}-01`).lte("tarih", `${yil}-${ay}-${String(sonGun).padStart(2, "0")}`);

      let aylikCiro = 0, aylikGider = 0, enYuksek = 0;
      aylik?.forEach(r => {
        aylikCiro += r.toplam_ciro || 0;
        aylikGider += (r.gunluk_gider || 0) + (r.iade_tutar || 0);
        if ((r.toplam_ciro || 0) > enYuksek) enYuksek = r.toplam_ciro || 0;
      });
      const donemRapor = aylik?.length || 0;
      const aylikNet = aylikCiro - aylikGider;
      const gunOrt = donemRapor > 0 ? Math.round(aylikCiro / donemRapor) : 0;

      const { data: tahsilatlar } = await supabase.from("platform_tahsilatlar").select("satis_tutari,beklenen_odeme_tarihi,durum");
      let bekleyenTutar = 0, bekleyenAdet = 0, gecikmisTutar = 0;
      const bugun = new Date();
      tahsilatlar?.forEach(t => {
        if (t.durum !== "tamamlandi") {
          bekleyenAdet++; bekleyenTutar += t.satis_tutari || 0;
          if (new Date(t.beklenen_odeme_tarihi) < bugun) gecikmisTutar += t.satis_tutari || 0;
        }
      });

      setD({ aktifPersonel, kurye, mutfak, banko, eksikBelge, bugunRapor: !!bugunData, bugunCiro, bugunNet, bugunPaket, aylikCiro, aylikNet, aylikGider, donemRapor, enYuksek, gunOrt, bekleyenTutar, bekleyenAdet, gecikmisTutar });
      setLoading(false);
    };
    run();
  }, []);

  const tarih = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const gun = new Date().toLocaleDateString("tr-TR", { weekday: "long" });

  if (loading) return (
    <div className="min-h-screen bg-[#060810] flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-12 h-12 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mx-auto" />
        <p className="text-[10px] text-gray-700 uppercase tracking-[0.3em]">Yükleniyor</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#060810] text-white font-sans antialiased">

      {/* ── HERO ── */}
      <div className="relative overflow-hidden border-b border-[#0f1624]">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/3 w-80 h-40 bg-blue-600/8 blur-[80px] rounded-full" />
          <div className="absolute top-0 right-1/4 w-60 h-32 bg-purple-600/6 blur-[60px] rounded-full" />
        </div>
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[10px] text-emerald-500 uppercase tracking-[0.3em] font-bold">Sistem Aktif</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
                Hoş geldin, <span className="text-blue-400 capitalize">{kullanici}</span>
              </h1>
              <p className="text-gray-500 text-sm mt-2 flex items-center gap-2">
                <Calendar size={13} className="text-blue-500/60" /> {gun}, {tarih}
              </p>
            </div>
            <div className={`flex items-center gap-3 px-5 py-3 rounded-2xl border ${d.bugunRapor ? "bg-emerald-500/8 border-emerald-500/20" : "bg-amber-500/8 border-amber-500/20"}`}>
              {d.bugunRapor ? (
                <><CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                  <div><p className="text-xs font-bold text-emerald-400">Bugün Rapor Girildi</p>
                    <p className="text-[10px] text-gray-500">₺{fmt(d.bugunCiro)} brüt ciro</p></div></>
              ) : (
                <><AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 animate-pulse" />
                  <div><p className="text-xs font-bold text-amber-400">Rapor Bekleniyor</p>
                    <p className="text-[10px] text-gray-500">Kasa henüz kapatılmadı</p></div></>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* ── 4 KPI KART ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Aylık Brüt", value: d.aylikCiro, color: "blue", icon: <BarChart3 size={13} />, sub: `${d.donemRapor} rapor` },
            { label: "Aylık Net", value: d.aylikNet, color: "emerald", icon: <TrendingUp size={13} />, sub: `Ort. ${fmtK(d.gunOrt)}/gün` },
            { label: "Aktif Kadro", value: d.aktifPersonel, color: "purple", icon: <Users size={13} />, sub: `${d.kurye} kurye · ${d.mutfak} mutfak`, noTL: true },
            { label: "Bekleyen Tahsilat", value: d.bekleyenTutar, color: d.gecikmisTutar > 0 ? "red" : "amber", icon: <Wallet size={13} />, sub: d.gecikmisTutar > 0 ? `⚠ ${fmtK(d.gecikmisTutar)} gecikmiş` : `${d.bekleyenAdet} işlem` },
          ].map(c => (
            <div key={c.label} className={`bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-4 relative overflow-hidden group hover:border-${c.color}-500/20 transition-all`}>
              <div className={`absolute top-0 right-0 w-20 h-20 bg-${c.color}-500/5 blur-xl rounded-full group-hover:bg-${c.color}-500/10 transition-all`} />
              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold">{c.label}</span>
                  <div className={`w-7 h-7 rounded-xl bg-${c.color}-500/10 flex items-center justify-center text-${c.color}-400`}>{c.icon}</div>
                </div>
                <p className={`text-2xl font-black text-${c.color}-400`}>
                  <AnimatedNumber value={c.value} prefix={c.noTL ? "" : "₺"} suffix={c.noTL ? " kişi" : ""} />
                </p>
                <p className={`text-[10px] mt-1 ${c.color === "red" ? "text-red-400" : "text-gray-600"}`}>{c.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── ORTA: Bugün + Aylık + Kadro ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Bugün */}
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center"><Clock size={12} className="text-blue-400" /></div>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Bugün</h3>
            </div>
            {d.bugunRapor ? (
              <div className="space-y-3">
                {[
                  { l: "Brüt Ciro", v: `₺${fmt(d.bugunCiro)}`, c: "text-blue-400" },
                  { l: "Net Ciro", v: `₺${fmt(d.bugunNet)}`, c: "text-emerald-400" },
                  { l: "Paket", v: `${d.bugunPaket} adet`, c: "text-amber-400" },
                ].map(i => (
                  <div key={i.l} className="flex justify-between items-center py-2 border-b border-[#1a2236] last:border-0">
                    <span className="text-xs text-gray-500">{i.l}</span>
                    <span className={`text-sm font-black ${i.c}`}>{i.v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center">
                <AlertTriangle className="h-8 w-8 text-amber-500/30 mx-auto mb-2" />
                <p className="text-xs text-gray-600">Kasa kapanışı yapılmadı</p>
                <Link href="/raporlar" className="inline-flex items-center gap-1 mt-3 text-xs font-bold text-blue-400 hover:text-blue-300">
                  Rapor Ekle <ChevronRight size={12} />
                </Link>
              </div>
            )}
          </div>

          {/* Aylık trend */}
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center"><BarChart3 size={12} className="text-emerald-400" /></div>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Bu Ay</h3>
            </div>
            <div className="space-y-3">
              {[
                { l: "Brüt Ciro", v: d.aylikCiro, c: "#3B82F6" },
                { l: "Net Kâr", v: d.aylikNet, c: "#10B981" },
                { l: "Gider", v: d.aylikGider, c: "#EF4444" },
              ].map(i => {
                const pct = d.aylikCiro > 0 ? Math.min((i.v / d.aylikCiro) * 100, 100) : 0;
                return (
                  <div key={i.l}>
                    <div className="flex justify-between mb-1.5">
                      <span className="text-[11px] text-gray-500">{i.l}</span>
                      <span className="text-[11px] font-bold text-white">{fmtK(i.v)}</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: i.c, opacity: 0.8 }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-3 border-t border-[#1a2236] grid grid-cols-2 gap-2 text-center">
              <div>
                <p className="text-[10px] text-gray-600">En Yüksek</p>
                <p className="text-xs font-black text-white mt-0.5">{fmtK(d.enYuksek)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-600">Günlük Ort.</p>
                <p className="text-xs font-black text-white mt-0.5">{fmtK(d.gunOrt)}</p>
              </div>
            </div>
          </div>

          {/* Kadro */}
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-lg bg-purple-500/10 flex items-center justify-center"><Users size={12} className="text-purple-400" /></div>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Kadro</h3>
            </div>
            <div className="space-y-3">
              {[
                { icon: ChefHat, l: "Mutfak", v: d.mutfak, c: "#F97316" },
                { icon: Bike, l: "Kurye", v: d.kurye, c: "#10B981" },
                { icon: Store, l: "Banko", v: d.banko, c: "#3B82F6" },
              ].map(i => {
                const pct = d.aktifPersonel > 0 ? (i.v / d.aktifPersonel) * 100 : 0;
                return (
                  <div key={i.l} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: i.c + "18" }}>
                      <i.icon size={13} style={{ color: i.c }} />
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between mb-1">
                        <span className="text-[11px] text-gray-400">{i.l}</span>
                        <span className="text-[11px] font-bold text-white">{i.v}</span>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: i.c, opacity: 0.7 }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {d.eksikBelge > 0 && (
              <div className="mt-4 p-3 bg-amber-500/8 border border-amber-500/20 rounded-xl flex items-center gap-2">
                <AlertTriangle size={12} className="text-amber-400 shrink-0" />
                <p className="text-[11px] text-amber-400"><strong>{d.eksikBelge}</strong> personel belgesi eksik</p>
              </div>
            )}
          </div>
        </div>

        {/* ── HIZLI ERİŞİM ── */}
        <div>
          <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold mb-3">Hızlı Erişim</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { href: "/raporlar", icon: FileText, label: "Kasa Raporu", sub: "Gün sonu girişi", color: "blue" },
              { href: "/kasa", icon: Wallet, label: "Kasa", sub: "Bakiye & işlemler", color: "emerald" },
              { href: "/platform-takip", icon: TrendingUp, label: "Platform Takip", sub: "Tahsilat durumu", color: "purple" },
              { href: "/personel", icon: Users, label: "Personeller", sub: `${d.aktifPersonel} kişi`, color: "amber" },
            ].map(item => (
              <Link key={item.href} href={item.href}
                className={`group bg-[#0c0f1a] border border-[#1a2236] hover:border-${item.color}-500/30 rounded-2xl p-4 transition-all`}>
                <div className={`w-9 h-9 rounded-xl bg-${item.color}-500/10 flex items-center justify-center mb-3 group-hover:bg-${item.color}-500/20 transition-all`}>
                  <item.icon size={16} className={`text-${item.color}-400`} />
                </div>
                <p className="text-sm font-bold text-white">{item.label}</p>
                <p className="text-[10px] text-gray-600 mt-0.5">{item.sub}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-xs text-gray-500">KEBO ERP — Tüm sistemler çalışıyor</span>
          </div>
          <div className="flex items-center gap-4 text-[10px] text-gray-700">
            <span>Supabase ✓</span><span>Vercel ✓</span><span>v2.6</span>
          </div>
        </div>

      </div>
    </div>
  );
}
