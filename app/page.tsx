"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import {
  Users, Wallet, TrendingUp, TrendingDown, ChevronRight, AlertTriangle, CheckCircle2,
  Bike, ChefHat, Store, Clock, BarChart3, Building2, CalendarClock, CalendarDays,
  Search, Maximize2, Minimize2, Receipt, Target, ShoppingBag, Undo2,
} from "lucide-react";
import { MENU } from "@/lib/menu";
import KeboLogo from "@/components/kabuk/KeboLogo";
import SayfaSimgesi from "@/components/kabuk/SayfaSimgesi";
import { aramayiAc } from "@/components/kabuk/KomutPaleti";
import { fmt, fmtK } from "@/lib/para";
import { bugun, ayBasi, aySonu, fmtTarih } from "@/lib/tarih";
import { donemOzeti, raporOzeti, type RaporVerisi } from "@/lib/hesap";
import { buAyinOdemeDonemi } from "@/lib/cari";
import { sabitGiderDurum, type SabitGiderDurum } from "@/lib/karZarar";
import { useYetki } from "@/lib/useYetki";
import { sayfaErisimi } from "@/lib/yetki";

interface BekleyenSabitGider { id: string; ad: string; tutar: number; degisken: boolean; gun: number; durum: SabitGiderDurum }


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
  const [seri, setSeri] = useState<{ tarih: string; brut: number; net: number }[]>([]);
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

      // Bu ayın günlük serisi (KPI kartlarındaki eğilim çizgisi ve son iki gün karşılaştırması)
      const seri = ((aylik || []) as RaporVerisi[])
        .slice().sort((a, b) => a.tarih.localeCompare(b.tarih))
        .map(r => { const o = raporOzeti(r); return { tarih: r.tarih, brut: o.brut, net: o.net }; });
      setSeri(seri);

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


  const simdi = new Date();
  const tarih = simdi.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" });
  const gun = simdi.toLocaleDateString("tr-TR", { weekday: "long", timeZone: "Europe/Istanbul" });
  const ad = ((yetki.adSoyad || kullanici).split(/\s+/)[0] || "").replace(/^./, c => c.toLocaleUpperCase("tr"));

  if (loading) return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-4">
        <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.6, repeat: Infinity }}>
          <KeboLogo boyut="buyuk" panelYazisi={false} />
        </motion.div>
        <p className="text-[10px] text-gray-500 uppercase tracking-[0.4em]">Yükleniyor</p>
      </motion.div>
    </div>
  );

  // Son iki rapor günü karşılaştırması
  const son = seri[seri.length - 1], onceki = seri[seri.length - 2];
  const degisim = (a?: number, b?: number) => (a != null && b != null && b > 0 ? ((a - b) / b) * 100 : null);

  const kpiler: Kpi[] = [
    { ad: "Aylık Brüt Ciro", deger: d.aylikCiro, renk: "#d9b866", simge: BarChart3, seri: seri.map(x => x.brut),
      yuzde: degisim(son?.brut, onceki?.brut), alt: onceki ? `Önceki gün: ₺${fmt(onceki.brut)}` : `${d.donemRapor} rapor` },
    { ad: "Aylık Net Ciro", deger: d.aylikNet, renk: "#60a5fa", simge: Wallet, seri: seri.map(x => x.net),
      yuzde: degisim(son?.net, onceki?.net), alt: onceki ? `Önceki gün: ₺${fmt(onceki.net)}` : `Ort. ${fmtK(d.gunOrt)}/gün` },
    { ad: "Aktif Kadro", deger: d.aktifPersonel, renk: "#c084fc", simge: Users, birim: " kişi",
      alt: `${d.kurye} kurye · ${d.mutfak} mutfak · ${d.banko} banko` },
    ...(cariOkundu ? [{ ad: "Cari Ödenecek", deger: d.cariOdenecek, renk: "#f87171", simge: Building2,
      alt: d.cariGeciken > 0 ? `${fmtK(d.cariGeciken)} gecikmiş` : `Vade: ${d.cariVade}`, uyari: d.cariGeciken > 0 }] : []),
  ];

  const kisayollar = [MENU.ust[1], MENU.finans[0], MENU.ust[2], MENU.ust[6]]
    .filter(m => acabilir(m.href))
    .map(m => ({ ...m, alt: m.href === "/personel" ? `${d.aktifPersonel} kişi` : m.aciklama }));

  return (
    <div className="min-h-screen text-yazi font-sans antialiased">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 sm:py-5">
        <motion.div variants={KAP} initial="gizli" animate="gorunur" className="space-y-4 sm:space-y-5">

          {/* ── ÜST ÇUBUK (masaüstü) ── */}
          <motion.div variants={OGE} className="hidden lg:flex items-center gap-3">
            <button onClick={aramayiAc}
              className="flex items-center gap-3 h-11 w-[420px] px-4 rounded-2xl border border-cizgi bg-kart/70 text-gray-500 hover:border-cizgi-guclu hover:text-gray-700 transition-colors text-sm">
              <Search className="h-4 w-4" /> <span className="flex-1 text-left">Menüde ara…</span>
              <span className="text-[11px] text-gray-500">(Ctrl + K)</span>
            </button>
            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center gap-3 h-11 px-4 rounded-2xl border border-cizgi bg-kart/70">
                <CalendarDays className="h-4 w-4 text-altin" />
                <div className="leading-tight">
                  <p className="text-[13px] font-semibold">{tarih}</p>
                  <p className="text-[10px] text-gray-500 capitalize">{gun}</p>
                </div>
              </div>
              <TamEkran />
            </div>
          </motion.div>

          {/* ── KARŞILAMA ── */}
          <motion.section variants={OGE} className="relative overflow-hidden rounded-[28px] border border-cizgi bg-kart min-h-[220px]">
            <Atmosfer />
            <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6 p-6 sm:p-8 lg:p-10">
              <div className="flex gap-5">
                <div className="hidden sm:flex flex-col items-center pt-1.5">
                  <span className="w-2 h-2 rounded-full bg-altin shadow-[0_0_10px_rgba(217,184,102,0.9)]" />
                  <motion.span initial={{ height: 0 }} animate={{ height: 72 }} transition={{ delay: 0.3, duration: 0.7 }} className="w-px bg-gradient-to-b from-altin to-altin/0" />
                  <span className="w-2 h-2 rounded-full bg-altin/60" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.45em] text-gray-600 mb-3">KEBO PANEL</p>
                  <h1 className="text-[34px] sm:text-5xl font-extrabold tracking-tight leading-[1.05]">
                    Hoş geldin, <span className="kebo-altin-yazi">{ad || "KEBO"}</span>
                  </h1>
                  <p className="text-gray-600 text-[15px] sm:text-base mt-3">Bugün işletmenin genel durumu aşağıda özetleniyor.</p>
                </div>
              </div>
              <RaporDurumu girildi={d.bugunRapor} ciro={d.bugunCiro} sonTarih={d.bugunTarih} acabilir={acabilir("/raporlar")} />
            </div>
          </motion.section>

          {/* ── KPI KARTLARI ── */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
            {kpiler.map(k => <KpiKarti key={k.ad} k={k} />)}
          </div>

          {/* ── BU AY ÖDENECEK SABİT GİDERLER ── */}
          {sabitGiderler && sabitGiderler.aktifSayi > 0 && (() => {
            const { bekleyen } = sabitGiderler;
            const geciken = bekleyen.filter(x => x.durum === "gecikti").length;
            const toplam = bekleyen.reduce((t, x) => t + (x.degisken ? 0 : x.tutar), 0);
            const degiskenVar = bekleyen.some(x => x.degisken);
            const kartSinifi = `block kebo-kart kebo-kart-hover p-4 sm:p-5 ${geciken > 0 ? "!border-red-500/30" : ""}`;
            const icerik = (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="kebo-simge w-10 h-10" style={{ color: geciken > 0 ? "#f87171" : "#f0a94b" }}><CalendarClock className="h-[18px] w-[18px]" /></div>
                    <div>
                      <p className="text-sm font-semibold">Bu ay ödenecek sabit giderler</p>
                      <p className="text-[12px] text-gray-500">
                        {bekleyen.length === 0 ? "Hepsi ödendi ✓" : <>{bekleyen.length} bekliyor{geciken > 0 && <span className="text-red-400 font-semibold"> · {geciken} gecikmiş</span>}</>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {bekleyen.length > 0 && <p className="text-xl font-bold">₺{fmt(toplam)}{degiskenVar && <span className="text-[11px] font-medium text-gray-500"> + değişken</span>}</p>}
                    {acabilir("/kasa") && <OkDaire />}
                  </div>
                </div>
                {bekleyen.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {bekleyen.map(x => (
                      <span key={x.id} className={`text-[11px] px-2.5 py-1 rounded-lg border ${x.durum === "gecikti" ? "bg-red-500/10 border-red-500/20 text-red-300" : "bg-white/[0.03] border-cizgi text-gray-700"}`}>
                        {x.ad} · {x.degisken ? "değişken" : `₺${fmt(x.tutar)}`} · {x.gun}&apos;i{x.durum === "gecikti" ? " (gecikti)" : ""}
                      </span>
                    ))}
                  </div>
                )}
              </>
            );
            return (
              <motion.div variants={OGE}>
                {acabilir("/kasa") ? <Link href="/kasa" className={`group ${kartSinifi}`}>{icerik}</Link> : <div className={kartSinifi}>{icerik}</div>}
              </motion.div>
            );
          })()}

          {/* ── SON RAPOR · BU AY · KADRO ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">

            <Panel baslik={d.bugunRapor ? "Bugün" : "Son Rapor"} ek={!d.bugunRapor && d.bugunTarih ? fmtTarih(d.bugunTarih) : undefined}
              simge={<HalkaSimge />} href={acabilir("/raporlar") ? "/raporlar" : undefined}>
              {d.bugunTarih ? (
                <div className="divide-y divide-cizgi">
                  {[
                    { l: "Brüt Ciro", v: `₺${fmt(d.bugunCiro)}`, c: "#60a5fa", s: Receipt },
                    { l: "Net Ciro", v: `₺${fmt(d.bugunNet)}`, c: "#34d399", s: Target },
                    { l: "Paket Sayısı", v: `${d.bugunPaket} adet`, c: "#fb923c", s: ShoppingBag },
                  ].map(i => (
                    <div key={i.l} className="flex items-center gap-3 py-3.5">
                      <div className="kebo-simge w-9 h-9 !rounded-[10px]" style={{ color: i.c }}><i.s className="h-4 w-4" /></div>
                      <span className="flex-1 text-sm text-gray-700">{i.l}</span>
                      <span className="text-xl font-bold tabular-nums" style={{ color: i.c }}>{i.v}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <AlertTriangle className="h-8 w-8 text-amber-400/40 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">Kasa kapanışı yapılmadı</p>
                  {acabilir("/raporlar") && (
                    <Link href="/raporlar" className="inline-flex items-center gap-1 mt-3 text-sm font-semibold text-altin hover:text-altin-acik">
                      Rapor ekle <ChevronRight size={14} />
                    </Link>
                  )}
                </div>
              )}
            </Panel>

            <Panel baslik="Bu Ay" ek={tarih.split(" ").slice(1).join(" ")} simge={<div className="kebo-simge w-9 h-9 !rounded-[10px]" style={{ color: "#34d399" }}><BarChart3 className="h-4 w-4" /></div>}>
              <div className="space-y-3.5">
                {[
                  { l: "Brüt Ciro", v: d.aylikCiro, c: "#d9b866", s: BarChart3 },
                  { l: "Net Ciro", v: d.aylikNet, c: "#60a5fa", s: TrendingUp },
                  { l: "Gider", v: d.aylikGider, c: "#fb923c", s: Wallet },
                  { l: "İade", v: d.aylikIade, c: "#f87171", s: Undo2 },
                ].map((i, n) => {
                  const pct = d.aylikCiro > 0 ? Math.min((i.v / d.aylikCiro) * 100, 100) : 0;
                  return (
                    <div key={i.l} className="flex items-center gap-3">
                      <i.s className="h-4 w-4 shrink-0" style={{ color: i.c }} />
                      <div className="flex-1">
                        <div className="flex justify-between mb-1.5">
                          <span className="text-[13px] text-gray-700">{i.l}</span>
                          <span className="text-[13px] font-bold tabular-nums">₺{fmt(i.v)}</span>
                        </div>
                        <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                          <motion.div className="h-full rounded-full" style={{ backgroundColor: i.c }}
                            initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: 0.4 + n * 0.08, duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2.5">
                {[
                  { l: "En Yüksek Gün", v: d.enYuksek, s: TrendingUp },
                  { l: "Günlük Ortalama", v: d.gunOrt, s: CalendarDays },
                ].map(i => (
                  <div key={i.l} className="flex items-center gap-2.5 rounded-xl border border-cizgi bg-white/[0.02] px-3 py-2.5">
                    <i.s className="h-4 w-4 text-gray-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[11px] text-gray-500">{i.l}</p>
                      <p className="text-[13px] font-bold tabular-nums">₺{fmt(i.v)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel baslik="Kadrolar" simge={<div className="kebo-simge w-9 h-9 !rounded-[10px]" style={{ color: "#c084fc" }}><Users className="h-4 w-4" /></div>}
              href={acabilir("/personel") ? "/personel" : undefined} hrefYazi="Tümünü gör">
              <div className="space-y-4">
                {[
                  { s: ChefHat, l: "Mutfak", v: d.mutfak, c: "#f0a94b" },
                  { s: Bike, l: "Kurye", v: d.kurye, c: "#34d399" },
                  { s: Store, l: "Banko", v: d.banko, c: "#60a5fa" },
                ].map((i, n) => {
                  const pct = d.aktifPersonel > 0 ? (i.v / d.aktifPersonel) * 100 : 0;
                  return (
                    <div key={i.l} className="flex items-center gap-3">
                      <div className="kebo-simge w-9 h-9 !rounded-[10px]" style={{ color: i.c }}><i.s className="h-4 w-4" /></div>
                      <div className="flex-1">
                        <div className="flex justify-between mb-1.5">
                          <span className="text-[13px] text-gray-700">{i.l}</span>
                          <span className="text-[13px] font-bold">{i.v}</span>
                        </div>
                        <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                          <motion.div className="h-full rounded-full" style={{ backgroundColor: i.c }}
                            initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: 0.5 + n * 0.08, duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {d.eksikBelge > 0 && (
                <Link href="/personel" className="group mt-5 flex items-center gap-3 rounded-xl border border-altin/30 bg-altin/[0.07] px-4 py-3 hover:bg-altin/[0.12] transition-colors">
                  <AlertTriangle className="h-5 w-5 text-altin shrink-0" />
                  <p className="flex-1 text-[13px] font-semibold text-altin-acik">{d.eksikBelge} personel belgesi eksik</p>
                  <ChevronRight className="h-4 w-4 text-altin transition-transform group-hover:translate-x-0.5" />
                </Link>
              )}
            </Panel>
          </div>

          {/* ── HIZLI ERİŞİM ── */}
          {kisayollar.length > 0 && (
            <motion.div variants={OGE}>
              <p className="text-base font-bold mb-3">Hızlı Erişim</p>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
                {kisayollar.map(m => (
                  <Link key={m.href} href={m.href} className="group relative overflow-hidden kebo-kart kebo-kart-hover p-4 sm:p-5 flex items-center gap-3 sm:gap-4 min-h-[96px]">
                    <m.icon className="pointer-events-none absolute -right-3 -bottom-4 h-24 w-24 opacity-[0.07] transition-all duration-500 group-hover:opacity-[0.14] group-hover:scale-110 group-hover:-rotate-6" style={{ color: m.renk }} strokeWidth={1.4} />
                    <SayfaSimgesi sayfa={m} boyut="buyuk" />
                    <div className="relative flex-1 min-w-0">
                      <p className="text-sm sm:text-[15px] font-bold truncate">{m.name}</p>
                      <p className="text-[12px] text-gray-500 truncate">{m.alt}</p>
                    </div>
                    <OkDaire />
                  </Link>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── ALT BİLGİ ── */}
          <motion.div variants={OGE} className="kebo-kart !rounded-2xl px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 bg-emerald-400 rounded-full kebo-nabiz" />
              <span className="text-[13px] font-semibold">KEBO Panel</span>
              <span className="text-[11px] text-gray-500">v3.1</span>
            </div>
            <span className="text-[11px] text-gray-500 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Sistem aktif</span>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

// ─── Parçalar ────────────────────────────────────────────────────────────────

const KAP: Variants = { gizli: {}, gorunur: { transition: { staggerChildren: 0.07 } } };
const OGE: Variants = {
  gizli: { opacity: 0, y: 16 },
  gorunur: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.2, 0.8, 0.2, 1] } },
};

interface Kpi {
  ad: string; deger: number; renk: string; simge: typeof Users; alt: string;
  seri?: number[]; yuzde?: number | null; birim?: string; uyari?: boolean;
}

function KpiKarti({ k }: { k: Kpi }) {
  return (
    <motion.div variants={OGE} className="group relative overflow-hidden kebo-kart kebo-kart-hover p-4 sm:p-5">
      <div className="pointer-events-none absolute -top-10 -right-10 w-32 h-32 rounded-full blur-2xl opacity-25 transition-opacity group-hover:opacity-40" style={{ backgroundColor: k.renk }} />
      <div className="relative flex items-start gap-3 sm:gap-4">
        <div className="kebo-simge w-11 h-11 sm:w-12 sm:h-12 !rounded-2xl" style={{ color: k.renk }}>
          <k.simge className="h-5 w-5" />
        </div>
        <div className="hidden sm:block flex-1" />
        {k.seri && k.seri.length > 1 && <Kivrim degerler={k.seri} renk={k.renk} />}
      </div>
      <p className="relative mt-3 text-[13px] text-gray-600">{k.ad}</p>
      <p className={`relative text-[22px] sm:text-[28px] font-extrabold tracking-tight tabular-nums leading-tight ${k.uyari ? "text-red-400" : ""}`}>
        <AnimatedNumber value={k.deger} prefix={k.birim ? "" : "₺"} suffix={k.birim ?? ""} />
      </p>
      <div className="relative mt-2 flex flex-wrap items-center gap-2">
        {k.yuzde != null && (
          <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${k.yuzde >= 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
            {k.yuzde >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}%{Math.abs(k.yuzde).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}
          </span>
        )}
        <span className={`text-[11px] truncate ${k.uyari ? "text-red-300" : "text-gray-500"}`}>{k.alt}</span>
      </div>
    </motion.div>
  );
}

/** Küçük eğilim çizgisi: soldan sağa çizilerek belirir */
function Kivrim({ degerler, renk }: { degerler: number[]; renk: string }) {
  const g = 96, y = 36;
  const min = Math.min(...degerler), max = Math.max(...degerler), aralik = max - min || 1;
  const nokta = degerler.map((v, i) => [(i / (degerler.length - 1)) * g, y - 4 - ((v - min) / aralik) * (y - 8)] as const);
  const yol = nokta.map(([px, py], i) => {
    if (i === 0) return `M${px},${py}`;
    const [ox, oy] = nokta[i - 1]; const cx = (ox + px) / 2;
    return `C${cx},${oy} ${cx},${py} ${px},${py}`;
  }).join(" ");
  const id = `kivrim-${renk.slice(1)}`;
  return (
    <svg width={g} height={y} viewBox={`0 0 ${g} ${y}`} className="relative overflow-visible shrink-0 ml-auto">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={renk} stopOpacity="0.35" />
          <stop offset="100%" stopColor={renk} stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path d={`${yol} L${g},${y} L0,${y} Z`} fill={`url(#${id})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9, duration: 0.6 }} />
      <motion.path d={yol} fill="none" stroke={renk} strokeWidth={2} strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.3, duration: 1.2, ease: "easeInOut" }}
        style={{ filter: `drop-shadow(0 0 6px ${renk}88)` }} />
    </svg>
  );
}

function Panel({ baslik, ek, simge, href, hrefYazi, children }: {
  baslik: string; ek?: string; simge: React.ReactNode; href?: string; hrefYazi?: string; children: React.ReactNode;
}) {
  return (
    <motion.section variants={OGE} className="kebo-kart p-4 sm:p-5">
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-cizgi">
        {simge}
        <h3 className="text-[17px] font-bold">{baslik}</h3>
        {ek && <span className="text-[12px] text-gray-500">{ek}</span>}
        {href && (
          hrefYazi
            ? <Link href={href} className="ml-auto text-[12px] text-gray-500 hover:text-altin transition-colors">{hrefYazi}</Link>
            : <Link href={href} className="ml-auto"><OkDaire /></Link>
        )}
      </div>
      {children}
    </motion.section>
  );
}

function OkDaire() {
  return (
    <span className="relative shrink-0 w-9 h-9 rounded-full border border-cizgi bg-white/[0.04] flex items-center justify-center text-gray-700 transition-all duration-300 group-hover:border-altin/40 group-hover:text-altin group-hover:bg-altin/10 hover:border-altin/40 hover:text-altin">
      <ChevronRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
    </span>
  );
}

function HalkaSimge() {
  return (
    <span className="relative w-9 h-9 rounded-full flex items-center justify-center bg-gradient-to-br from-altin-acik to-altin-koyu shadow-[0_0_18px_-4px_rgba(217,184,102,0.8)]">
      <span className="w-5 h-5 rounded-full border-[3px] border-[#1a1408]/80 flex items-center justify-center"><span className="w-1.5 h-1.5 rounded-full bg-[#1a1408]/80" /></span>
    </span>
  );
}

function RaporDurumu({ girildi, ciro, sonTarih, acabilir }: { girildi: boolean; ciro: number; sonTarih: string; acabilir: boolean }) {
  const icerik = (
    <>
      <div className={`kebo-simge w-12 h-12 !rounded-2xl ${girildi ? "" : "animate-pulse"}`} style={{ color: girildi ? "#34d399" : "#d9b866" }}>
        {girildi ? <CheckCircle2 className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-bold">{girildi ? "Bugünün raporu girildi" : "Bugünün raporu bekleniyor"}</p>
        <p className="text-[12px] text-gray-500">{girildi ? `₺${fmt(ciro)} brüt ciro` : sonTarih ? `Son rapor: ${fmtTarih(sonTarih)}` : "Henüz rapor yok"}</p>
      </div>
      {acabilir && <OkDaire />}
    </>
  );
  const sinif = "group relative flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.05] backdrop-blur-md px-4 py-4 lg:min-w-[340px] transition-colors hover:border-altin/30";
  return acabilir ? <Link href="/raporlar" className={sinif}>{icerik}</Link> : <div className={sinif}>{icerik}</div>;
}

/** Karşılama kartının ışıkları: yavaşça süzülen altın ışıklar + logo silüeti */
function Atmosfer() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_100%_0%,rgba(217,184,102,0.16),transparent_55%)]" />
      <motion.div className="absolute -top-24 right-[12%] w-[420px] h-[420px] rounded-full bg-altin/20 blur-[100px]"
        animate={{ x: [0, 40, 0], y: [0, 20, 0], opacity: [0.55, 0.85, 0.55] }} transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }} />
      <motion.div className="absolute -bottom-32 right-[35%] w-[320px] h-[320px] rounded-full bg-[#b5562f]/20 blur-[90px]"
        animate={{ x: [0, -30, 0], opacity: [0.4, 0.7, 0.4] }} transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }} />
      <motion.img src="/kebo-logo-altin.png" alt="" aria-hidden
        className="absolute right-[-40px] top-1/2 w-[460px] max-w-none -translate-y-1/2 opacity-[0.07] hidden sm:block"
        initial={{ opacity: 0, x: 40 }} animate={{ opacity: 0.07, x: 0 }} transition={{ delay: 0.2, duration: 1.2 }} />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(19,19,21,0.95)_0%,rgba(19,19,21,0.6)_45%,transparent_100%)]" />
    </div>
  );
}

function TamEkran() {
  const [tam, setTam] = useState(false);
  useEffect(() => {
    const d = () => setTam(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", d);
    return () => document.removeEventListener("fullscreenchange", d);
  }, []);
  return (
    <button aria-label="Tam ekran" title="Tam ekran"
      onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}
      className="w-11 h-11 rounded-2xl border border-cizgi bg-kart/70 flex items-center justify-center text-gray-600 hover:text-altin hover:border-altin/30 transition-colors">
      {tam ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
    </button>
  );
}
