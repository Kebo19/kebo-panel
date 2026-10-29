"use client";

// Kasa raporu Kurye adımı: "Roket'ten çek". Panel bir istek yazar; Roket robotunun kurulu olduğu
// bilgisayarlardan (dükkân, ev) açık olanı 10 saniye içinde alır, o günün Paket Raporu'nu Roket'ten
// çekip panele yazar. İstek bitince kurye satırları kendiliğinden dolar.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DownloadCloud, Loader2, Monitor, RefreshCw } from "lucide-react";
import type { RoketGun } from "@/lib/roket";

interface Talep { id: string; durum: "bekliyor" | "calisiyor" | "bitti" | "hata"; mesaj: string | null; bilgisayar: string | null }

const AKTIF = ["bekliyor", "calisiyor"];

export default function RoketCek({ tarih, roketGun, onYuklendi, onDoldur }: {
  tarih: string;
  roketGun: RoketGun | null;
  /** Robot yeni veriyi yazınca çağrılır (sayfa kurye satırlarını doldurur). */
  onYuklendi: (g: RoketGun | null) => void;
  /** Panelde zaten olan veriyle doldur. */
  onDoldur: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [talep, setTalep] = useState<Talep | null>(null);
  const [pcler, setPcler] = useState<string[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const izlenen = useRef<string | null>(null);
  const yuklendiRef = useRef(onYuklendi);
  useEffect(() => { yuklendiRef.current = onYuklendi; }, [onYuklendi]);

  const pcYukle = useCallback(async () => {
    const { data } = await supabase.from("roket_pc_durum").select("bilgisayar, son_gorulme")
      .gte("son_gorulme", new Date(Date.now() - 3 * 60000).toISOString());
    setPcler((data || []).map(d => d.bilgisayar as string));
  }, [supabase]);

  // Tarih değişince: o gün için süren bir istek varsa izlemeye devam et
  useEffect(() => {
    let iptal = false;
    setTalep(null); setHata(null); izlenen.current = null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih)) return;
    pcYukle();
    supabase.from("roket_talepler").select("id, durum, mesaj, bilgisayar").eq("tarih", tarih)
      .order("istendi", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => {
        if (iptal || !data) return;
        const t = data as Talep;
        if (AKTIF.includes(t.durum)) { izlenen.current = t.id; setTalep(t); }
      });
    return () => { iptal = true; };
  }, [tarih, supabase, pcYukle]);

  const aktif = !!talep && AKTIF.includes(talep.durum);
  const talepId = talep?.id;
  useEffect(() => {
    if (!aktif || !talepId) return;
    const id = talepId;
    const t = setInterval(async () => {
      const { data } = await supabase.from("roket_talepler").select("id, durum, mesaj, bilgisayar").eq("id", id).maybeSingle();
      if (!data || izlenen.current !== id) return;
      const yeni = data as Talep;
      setTalep(yeni);
      if (yeni.durum === "bitti") {
        const { data: g } = await supabase.from("roket_gunluk").select("veri").eq("tarih", tarih).maybeSingle();
        yuklendiRef.current(g ? (g.veri as RoketGun) : null);
      }
      if (!AKTIF.includes(yeni.durum)) pcYukle();
    }, 3000);
    return () => clearInterval(t);
  }, [aktif, talepId, tarih, supabase, pcYukle]);

  const cek = async () => {
    setGonderiliyor(true); setHata(null);
    const { data, error } = await supabase.rpc("roket_talep_olustur", { p_tarih: tarih });
    setGonderiliyor(false);
    if (error) { setHata(error.message); return; }
    izlenen.current = data as string;
    setTalep({ id: data as string, durum: "bekliyor", mesaj: null, bilgisayar: null });
    pcYukle();
  };

  const pcAcik = (pcler?.length || 0) > 0;
  const sonuc = talep && !aktif ? talep : null;

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 space-y-1.5 text-[12px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-amber-200">
          {roketGun ? <>Roket&apos;te bu gün: <b>{roketGun.toplamPaket} paket</b>, {roketGun.kuryeler.length} kurye</> : "Bu günün Roket verisi henüz panelde yok."}
        </span>
        <div className="flex items-center gap-2">
          {roketGun && !aktif && (
            <button type="button" onClick={onDoldur}
              className="text-[12px] font-bold px-3 py-1.5 rounded-lg kebo-btn-altin text-[#1a1408] hover:brightness-110">Roket&apos;ten doldur</button>
          )}
          <button type="button" onClick={cek} disabled={aktif || gonderiliyor}
            className={roketGun
              ? "text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-amber-500/40 text-amber-200 hover:bg-amber-500/10 disabled:opacity-60 flex items-center gap-1.5"
              : "text-[12px] font-bold px-3 py-1.5 rounded-lg kebo-btn-altin text-[#1a1408] hover:brightness-110 disabled:opacity-60 flex items-center gap-1.5"}>
            {aktif || gonderiliyor ? <Loader2 size={12} className="animate-spin" /> : roketGun ? <RefreshCw size={12} /> : <DownloadCloud size={12} />}
            {aktif ? (talep!.durum === "calisiyor" ? "Roket'ten çekiliyor…" : "Robot bekleniyor…") : roketGun ? "Yeniden çek" : "Roket'ten çek"}
          </button>
        </div>
      </div>
      {aktif && (
        <p className="text-sky-300">
          {talep!.durum === "calisiyor"
            ? `${talep!.bilgisayar || "Bilgisayar"} Roket'ten bu günün raporunu indiriyor (yaklaşık 1 dakika). Bitince kuryeler kendiliğinden dolar.`
            : pcAcik ? "İstek gönderildi; robot birkaç saniye içinde başlayacak."
              : "İstek gönderildi. Robotun açık olduğu bilgisayar görünmüyor; dükkân ya da ev bilgisayarı açılınca çalışır (30 dakika bekler)."}
        </p>
      )}
      {sonuc && <p className={sonuc.durum === "hata" ? "text-red-400" : "text-emerald-300"}>{sonuc.mesaj}</p>}
      {hata && <p className="text-red-400">{hata}</p>}
      {pcler && !aktif && (
        <p className="text-[10px] text-gray-500 flex items-center gap-1">
          <Monitor size={10} className={pcAcik ? "text-emerald-400" : "text-gray-600"} />
          {pcAcik ? `Robot açık: ${pcler.join(", ")}` : "Şu an robotu açık bilgisayar yok (dükkân/ev bilgisayarında kurulu olmalı)."}
        </p>
      )}
    </div>
  );
}
