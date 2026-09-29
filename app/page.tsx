"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import {
  Users, Wallet, TrendingUp,
  ChevronRight, AlertTriangle, CheckCircle2,
  FileText, Bike, ChefHat, Store, Clock,
  BarChart3, Calendar, Building2, CalendarClock
} from "lucide-react";
import { fmt, fmtK } from "@/lib/para";
import { bugun, ayBasi, aySonu, fmtTarih } from "@/lib/tarih";
import { donemOzeti, raporOzeti, type RaporVerisi } from "@/lib/hesap";
import { buAyinOdemeDonemi } from "@/lib/cari";
import { sabitGiderDurum, type SabitGiderDurum } from "@/lib/karZarar";
import { useYetki } from "@/lib/useYetki";
import { sayfaErisimi } from "@/lib/yetki";

interface BekleyenSabitGider { id: string; ad: string; tutar: number; degisken: boolean; gun: number; durum: SabitGiderDurum }

// Tailwind sınıfları derleme anında taranır; `bg-${renk}-500` gibi dinamik sınıflar
// üretilmez. Bu yüzden her renk için sınıflar burada açıkça yazılı.
const RENK = {
  blue:    { yazi: "text-[#d7b46a]",    zemin: "bg-blue-500/10",    zeminHover: "group-hover:bg-blue-500/20",    kenar: "hover:border-[#d7b46a]/30",    parilti: "bg-blue-500/5" },
  emerald: { yazi: "text-emerald-600", zemin: "bg-emerald-500/10", zeminHover: "group-hover:bg-emerald-500/20", kenar: "hover:border-emerald-500/30", parilti: "bg-emerald-500/5" },
  purple:  { yazi: "text-purple-600",  zemin: "bg-purple-500/10",  zeminHover: "group-hover:bg-purple-500/20",  kenar: "hover:border-purple-500/30",  parilti: "bg-purple-500/5" },
  amber:   { yazi: "text-amber-600",   zemin: "bg-amber-500/10",   zeminHover: "group-hover:bg-amber-500/20",   kenar: "hover:border-amber-500/30",   parilti: "bg-amber-500/5" },
  red:     { yazi: "text-red-600",     zemin: "bg-red-500/10",     zeminHover: "group-hover:bg-red-500/20",     kenar: "hover:border-red-500/30",     parilti: "bg-red-500/5" },
} as const;
type Renk = keyof typeof RENK;

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
  // Anasayfa "anasayfa" yetkisi ister (proxy.ts). Bu yetki RLS'te faturalar, sabit
  // giderler ve kasa hareketlerini okumayı da açar; kartlar okunabilen veriye göre
  // gösterilir, bağlantılar ise sadece kullanıcının açabildiği sayfalara verilir.
  const yetki = useYetki();
  const acabilir = (yol: string) => !yetki.yukleniyor && sayfaErisimi(yetki.rol, yetki.yetkiler, yol);
  const [cariOkundu, setCariOkundu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [kullanici, setKullanici] = useState("");
  const [sabitGiderler, setSabitGiderler] = useState<{ bekleyen: BekleyenSabitGider[]; aktifSayi: number } | null>(null);
  const [d, setD] = useState({
    aktifPersonel: 0, kurye: 0, mutfak: 0, banko: 0, eksikBelge: 0,
    bugunRapor: false, bugunCiro: 0, bugunNet: 0, bugunPaket: 0, bugunTarih: "",
    aylikCiro: 0, aylikNet: 0, aylikIade: 0, aylikGider: 0, donemRapor: 0,
    enYuksek: 0, gunOrt: 0,
    cariOdenecek: 0, cariGeciken: 0, cariVade: "",
  });

  useEffect(() => {
    const supabase = createClient();
    const run = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) setKullanici(user.email.split("@")[0]);

      const bugunStr = bugun();
      const donem = buAyinOdemeDonemi();
      const [{ data: personeller }, { data: bugunData }, { data: aylik }, { data: odenecek, error: odenecekHata }, { data: belgeEksik }] = await Promise.all([
        supabase.from("personeller").select("departman,durum"),
        supabase.from("gunluk_raporlar").select("*").eq("tarih", bugunStr).maybeSingle(),
        supabase.from("gunluk_raporlar").select("*").gte("tarih", ayBasi(bugunStr)).lte("tarih", aySonu(bugunStr.slice(0, 4), bugunStr.slice(5, 7))),
        supabase.from("faturalar").select("toplam_tutar,fatura_tarihi,durum").neq("durum", "odendi").lte("fatura_tarihi", donem.donemBit),
        // TC/IBAN personel_hassas'ta (personel_hassas yetkisi okur); eksik sayısı herkese rpc ile gelir.
        supabase.rpc("personel_belge_eksik_sayisi"),
      ]);

      // Bu ay ödenecek sabit giderler (RLS: kasa | anasayfa | kar_zarar; hata olursa kart gösterilmez)
      const [{ data: sabitler, error: sabitHata }, { data: sabitOdemeler }] = await Promise.all([
        supabase.from("sabit_giderler").select("id,ad,tutar,degisken,gun").eq("aktif", true).order("gun"),
        supabase.from("kasa_manuel_islemler").select("kaynak_id,islem_tarihi").eq("kaynak", "sabit_gider")
          .gte("islem_tarihi", ayBasi(bugunStr)).lte("islem_tarihi", aySonu(bugunStr.slice(0, 4), bugunStr.slice(5, 7))),
      ]);
      if (!sabitHata && sabitler) {
        const odenen = new Map((sabitOdemeler || []).map(o => [o.kaynak_id as string, o.islem_tarihi as string]));
        const bekleyen = sabitler
          .map(x => ({ id: x.id, ad: x.ad, tutar: Number(x.tutar) || 0, degisken: !!x.degisken, gun: x.gun, durum: sabitGiderDurum(x.gun, bugunStr, odenen.get(x.id)) }))
          .filter(x => x.durum !== "odendi");
        setSabitGiderler({ bekleyen, aktifSayi: sabitler.length });
      }

      let aktifPersonel = 0, kurye = 0, mutfak = 0, banko = 0;
      const eksikBelge = Number(belgeEksik) || 0;
      if (personeller) {
        const aktif = personeller.filter(p => p.durum === "aktif");
        aktifPersonel = aktif.length;
        kurye = aktif.filter(p => p.departman === "Kurye").length;
        mutfak = aktif.filter(p => p.departman === "Mutfak").length;
        banko = aktif.filter(p => p.departman === "Banko").length;
      }

      // Bugünün raporu genelde gün sonunda girilir; yoksa en son girilen raporu gösteririz.
      let gunRapor = bugunData as RaporVerisi | null;
      if (!gunRapor) {
        const { data: son } = await supabase.from("gunluk_raporlar").select("*").order("tarih", { ascending: false }).limit(1).maybeSingle();
        gunRapor = son as RaporVerisi | null;
      }
      const g = gunRapor ? raporOzeti(gunRapor) : null;
      const ay = donemOzeti((aylik || []) as RaporVerisi[]);

      // Cari: bu ödeme dönemine kadar kesilmiş, ödenmemiş faturalar
      setCariOkundu(!odenecekHata);
      let cariOdenecek = 0, cariGeciken = 0;
      (odenecek || []).forEach(f => {
        cariOdenecek += Number(f.toplam_tutar) || 0;
        if (f.fatura_tarihi < donem.donemBas) cariGeciken += Number(f.toplam_tutar) || 0;
      });

      setD({
        aktifPersonel, kurye, mutfak, banko, eksikBelge,
        bugunRapor: !!bugunData, bugunTarih: gunRapor?.tarih || "",
        bugunCiro: g?.brut || 0, bugunNet: g?.net || 0, bugunPaket: g?.paket || 0,
        aylikCiro: ay.brut, aylikNet: ay.net, aylikIade: ay.iade, aylikGider: ay.gider, donemRapor: ay.gunSayisi,
        enYuksek: ay.enYuksekBrut, gunOrt: ay.gunSayisi > 0 ? Math.round(ay.brut / ay.gunSayisi) : 0,
        cariOdenecek, cariGeciken, cariVade: donem.vadeStr,
      });
      setLoading(false);
    };
    run();
  }, []);

  const tarih = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" });
  const gun = new Date().toLocaleDateString("tr-TR", { weekday: "long", timeZone: "Europe/Istanbul" });

  if (loading) return (
    <div className="min-h-screen bg-[#0b0d0f] flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-12 h-12 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mx-auto" />
        <p className="text-[10px] text-gray-700 uppercase tracking-[0.3em]">Yükleniyor</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0b0d0f] text-[#f4f0e8] font-sans antialiased">

      {/* ── HERO ── */}
      <div className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/3 w-80 h-40 bg-[#d7b46a]/8 blur-[80px] rounded-full" />
          <div className="absolute top-0 right-1/4 w-60 h-32 bg-purple-600/6 blur-[60px] rounded-full" />
        </div>
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[10px] text-emerald-700 uppercase tracking-[0.3em] font-bold">Sistem Aktif</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
                Hoş geldin, <span className="text-[#d7b46a] capitalize">{kullanici}</span>
              </h1>
              <p className="text-[#858c95] text-sm mt-2 flex items-center gap-2">
                <Calendar size={13} className="text-[#d7b46a]/60" /> {gun}, {tarih}
              </p>
            </div>
            <div className={`flex items-center gap-3 px-5 py-3 rounded-2xl border ${d.bugunRapor ? "bg-emerald-500/8 border-emerald-500/20" : "bg-amber-500/8 border-amber-500/20"}`}>
              {d.bugunRapor ? (
                <><CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  <div><p className="text-xs font-bold text-emerald-600">Bugün Rapor Girildi</p>
                    <p className="text-[10px] text-[#858c95]">₺{fmt(d.bugunCiro)} brüt ciro</p></div></>
              ) : (
                <><AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 animate-pulse" />
                  <div><p className="text-xs font-bold text-amber-600">Bugünün Raporu Bekleniyor</p>
                    <p className="text-[10px] text-[#858c95]">{d.bugunTarih ? `Son rapor: ${fmtTarih(d.bugunTarih)}` : "Henüz rapor yok"}</p></div></>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* ── 4 KPI KART ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {([
            { label: "Aylık Brüt", value: d.aylikCiro, color: "blue", icon: <BarChart3 size={13} />, sub: `${d.donemRapor} rapor` },
            { label: "Aylık Net", value: d.aylikNet, color: "emerald", icon: <TrendingUp size={13} />, sub: `Ort. ${fmtK(d.gunOrt)}/gün brüt` },
            { label: "Aktif Kadro", value: d.aktifPersonel, color: "purple", icon: <Users size={13} />, sub: `${d.kurye} kurye · ${d.mutfak} mutfak`, noTL: true },
            ...(cariOkundu ? [{ label: "Cari Ödenecek", value: d.cariOdenecek, color: d.cariGeciken > 0 ? "red" : "amber", icon: <Building2 size={13} />, sub: d.cariGeciken > 0 ? `⚠ ${fmtK(d.cariGeciken)} gecikmiş` : `Vade: ${d.cariVade}` }] : []),
          ] as { label: string; value: number; color: Renk; icon: React.ReactNode; sub: string; noTL?: boolean }[]).map(c => (
            <div key={c.label} className="bg-[#111417] border border-white/10 rounded-2xl p-4 relative overflow-hidden group transition-all">
              <div className={`absolute top-0 right-0 w-20 h-20 ${RENK[c.color].parilti} blur-xl rounded-full transition-all`} />
              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] text-[#8f969f] uppercase tracking-widest font-semibold">{c.label}</span>
                  <div className={`w-7 h-7 rounded-xl ${RENK[c.color].zemin} flex items-center justify-center ${RENK[c.color].yazi}`}>{c.icon}</div>
                </div>
                <p className={`text-2xl font-black ${RENK[c.color].yazi}`}>
                  <AnimatedNumber value={c.value} prefix={c.noTL ? "" : "₺"} suffix={c.noTL ? " kişi" : ""} />
                </p>
                <p className={`text-[10px] mt-1 ${c.color === "red" ? "text-red-600" : "text-[#8f969f]"}`}>{c.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── BU AY ÖDENECEK SABİT GİDERLER ── */}
        {sabitGiderler && sabitGiderler.aktifSayi > 0 && (() => {
          const { bekleyen } = sabitGiderler;
          const geciken = bekleyen.filter(x => x.durum === "gecikti").length;
          const toplam = bekleyen.reduce((t, x) => t + (x.degisken ? 0 : x.tutar), 0);
          const degiskenVar = bekleyen.some(x => x.degisken);
          const kartSinifi = `block bg-[#111417] border rounded-2xl p-4 transition-all hover:border-[#d7b46a]/30 ${geciken > 0 ? "border-red-500/30" : "border-white/10"}`;
          const icerik = (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${geciken > 0 ? "bg-red-500/10 text-red-600" : "bg-amber-500/10 text-amber-600"}`}><CalendarClock size={13} /></div>
                  <div>
                    <p className="text-[10px] text-[#8f969f] uppercase tracking-widest font-semibold">Bu ay ödenecek sabit giderler</p>
                    <p className="text-[11px] text-[#858c95]">
                      {bekleyen.length === 0 ? "Hepsi ödendi ✓" : <>{bekleyen.length} bekliyor{geciken > 0 && <span className="text-red-600 font-semibold"> · {geciken} gecikmiş</span>}</>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {bekleyen.length > 0 && <p className="text-lg font-black text-[#f4f0e8]">₺{fmt(toplam)}{degiskenVar && <span className="text-[10px] font-medium text-[#858c95]"> + değişken</span>}</p>}
                  {acabilir("/kasa") && <ChevronRight size={14} className="text-[#737b84]" />}
                </div>
              </div>
              {bekleyen.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {bekleyen.map(x => (
                    <span key={x.id} className={`text-[11px] px-2 py-1 rounded-lg ${x.durum === "gecikti" ? "bg-red-500/10 text-red-700" : "bg-black/[0.04] text-gray-700"}`}>
                      {x.ad} · {x.degisken ? "değişken" : `₺${fmt(x.tutar)}`} · {x.gun}&apos;i{x.durum === "gecikti" ? " (gecikti)" : ""}
                    </span>
                  ))}
                </div>
              )}
            </>
          );
          return acabilir("/kasa")
            ? <Link href="/kasa" className={kartSinifi}>{icerik}</Link>
            : <div className={kartSinifi}>{icerik}</div>;
        })()}

        {/* ── ORTA: Bugün + Aylık + Kadro ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Bugün */}
          <div className="bg-[#111417] border border-white/10 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center"><Clock size={12} className="text-[#d7b46a]" /></div>
              <h3 className="text-xs font-bold text-[#858c95] uppercase tracking-widest">{d.bugunRapor ? "Bugün" : "Son Rapor"}</h3>
              {!d.bugunRapor && d.bugunTarih && <span className="text-[10px] text-[#858c95]">{fmtTarih(d.bugunTarih)}</span>}
            </div>
            {d.bugunTarih ? (
              <div className="space-y-3">
                {[
                  { l: "Brüt Ciro", v: `₺${fmt(d.bugunCiro)}`, c: "text-[#d7b46a]" },
                  { l: "Net Ciro", v: `₺${fmt(d.bugunNet)}`, c: "text-emerald-600" },
                  { l: "Paket", v: `${d.bugunPaket} adet`, c: "text-amber-600" },
                ].map(i => (
                  <div key={i.l} className="flex justify-between items-center py-2 border-b border-white/10 last:border-0">
                    <span className="text-xs text-[#858c95]">{i.l}</span>
                    <span className={`text-sm font-black ${i.c}`}>{i.v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center">
                <AlertTriangle className="h-8 w-8 text-amber-700/30 mx-auto mb-2" />
                <p className="text-xs text-[#8f969f]">Kasa kapanışı yapılmadı</p>
                {acabilir("/raporlar") && (
                  <Link href="/raporlar" className="inline-flex items-center gap-1 mt-3 text-xs font-bold text-[#d7b46a] hover:text-[#d7b46a]">
                    Rapor Ekle <ChevronRight size={12} />
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Aylık trend */}
          <div className="bg-[#111417] border border-white/10 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center"><BarChart3 size={12} className="text-emerald-600" /></div>
              <h3 className="text-xs font-bold text-[#858c95] uppercase tracking-widest">Bu Ay</h3>
            </div>
            <div className="space-y-3">
              {[
                { l: "Brüt Ciro", v: d.aylikCiro, c: "#3B82F6" },
                { l: "Net Ciro", v: d.aylikNet, c: "#10B981" },
                { l: "Gider", v: d.aylikGider, c: "#F97316" },
                { l: "İade", v: d.aylikIade, c: "#EF4444" },
              ].map(i => {
                const pct = d.aylikCiro > 0 ? Math.min((i.v / d.aylikCiro) * 100, 100) : 0;
                return (
                  <div key={i.l}>
                    <div className="flex justify-between mb-1.5">
                      <span className="text-[11px] text-[#858c95]">{i.l}</span>
                      <span className="text-[11px] font-bold text-[#f4f0e8]">{fmtK(i.v)}</span>
                    </div>
                    <div className="h-1.5 bg-black/[0.04] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: i.c, opacity: 0.8 }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-3 border-t border-white/10 grid grid-cols-2 gap-2 text-center">
              <div>
                <p className="text-[10px] text-[#8f969f]">En Yüksek</p>
                <p className="text-xs font-black text-[#f4f0e8] mt-0.5">{fmtK(d.enYuksek)}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#8f969f]">Günlük Ort.</p>
                <p className="text-xs font-black text-[#f4f0e8] mt-0.5">{fmtK(d.gunOrt)}</p>
              </div>
            </div>
          </div>

          {/* Kadro */}
          <div className="bg-[#111417] border border-white/10 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-lg bg-purple-500/10 flex items-center justify-center"><Users size={12} className="text-purple-600" /></div>
              <h3 className="text-xs font-bold text-[#858c95] uppercase tracking-widest">Kadro</h3>
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
                        <span className="text-[11px] text-[#737b84]">{i.l}</span>
                        <span className="text-[11px] font-bold text-[#f4f0e8]">{i.v}</span>
                      </div>
                      <div className="h-1 bg-black/[0.04] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: i.c, opacity: 0.7 }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {d.eksikBelge > 0 && (
              <div className="mt-4 p-3 bg-amber-500/8 border border-amber-500/20 rounded-xl flex items-center gap-2">
                <AlertTriangle size={12} className="text-amber-600 shrink-0" />
                <p className="text-[11px] text-amber-600"><strong>{d.eksikBelge}</strong> personel belgesi eksik</p>
              </div>
            )}
          </div>
        </div>

        {/* ── HIZLI ERİŞİM ── */}
        <div>
          <p className="text-[10px] text-[#8f969f] uppercase tracking-widest font-semibold mb-3">Hızlı Erişim</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([
              { href: "/raporlar", icon: FileText, label: "Kasa Raporu", sub: "Gün sonu girişi", color: "blue" },
              { href: "/kasa", icon: Wallet, label: "Kasa", sub: "Bakiye & işlemler", color: "emerald" },
              { href: "/rapor-analiz", icon: BarChart3, label: "Rapor Analizi", sub: "Dönem & Roadrunner", color: "purple" },
              { href: "/personel", icon: Users, label: "Personeller", sub: `${d.aktifPersonel} kişi`, color: "amber" },
            ] as { href: string; icon: typeof FileText; label: string; sub: string; color: Renk }[]).filter(item => acabilir(item.href)).map(item => (
              <Link key={item.href} href={item.href}
                className={`group bg-[#111417] border border-white/10 ${RENK[item.color].kenar} rounded-2xl p-4 transition-all`}>
                <div className={`w-9 h-9 rounded-xl ${RENK[item.color].zemin} flex items-center justify-center mb-3 ${RENK[item.color].zeminHover} transition-all`}>
                  <item.icon size={16} className={RENK[item.color].yazi} />
                </div>
                <p className="text-sm font-bold text-[#f4f0e8]">{item.label}</p>
                <p className="text-[10px] text-[#8f969f] mt-0.5">{item.sub}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div className="bg-[#111417] border border-white/10 rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-xs text-[#858c95]">KEBO ERP</span>
          </div>
          <div className="flex items-center gap-4 text-[10px] text-gray-700">
            <span>v3.0</span>
          </div>
        </div>

      </div>
    </div>
  );
}
