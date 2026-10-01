"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useYetki } from "@/lib/useYetki";
import { jsonCevap } from "@/lib/gorsel";
import {
  YETKILER, YETKI_GRUPLARI, YETKI_SABLONLARI, ROLLER, TAM_YETKILI, MUDUR, PASIF,
  rolCoz, yetkilerCoz, rolEtiketi, type Rol, type YetkiAnahtari,
} from "@/lib/yetki";
import {
  ArrowLeft, Loader2, ShieldCheck, UserPlus, X, Check, RefreshCw, Info, Save, KeyRound,
} from "lucide-react";

interface Kullanici {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Rol | null;
  yetkiler: YetkiAnahtari[];
}

const ROZET: Record<string, string> = {
  [TAM_YETKILI]: "bg-blue-500/10 text-blue-300 border-blue-500/25",
  [MUDUR]: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
  [PASIF]: "bg-gray-100 text-gray-500 border-gray-200",
};

function RolRozeti({ rol }: { rol: Rol | null }) {
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md border ${rol ? ROZET[rol] : "bg-red-500/10 text-red-400 border-red-500/25"}`}>
      {rolEtiketi(rol)}
    </span>
  );
}

function rastgeleSifre(): string {
  const harfler = "ABCDEFGHJKLMNPRSTUVYZabcdefghijkmnprstuvyz23456789";
  const dizi = new Uint32Array(12);
  crypto.getRandomValues(dizi);
  return Array.from(dizi, n => harfler[n % harfler.length]).join("");
}

/** Rol seçimi + şablonlar + gruplanmış yetki kutuları (hem düzenleme hem ekleme için). */
function YetkiSecici({ rol, setRol, yetkiler, setYetkiler, rolKilitli }: {
  rol: Rol; setRol: (r: Rol) => void;
  yetkiler: YetkiAnahtari[]; setYetkiler: (y: YetkiAnahtari[]) => void;
  rolKilitli?: boolean;
}) {
  const hepsi = rol === TAM_YETKILI;
  const kapali = rol !== MUDUR;
  const degistir = (a: YetkiAnahtari, acik: boolean) =>
    setYetkiler(acik ? [...new Set([...yetkiler, a])] : yetkiler.filter(x => x !== a));

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Rol</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {ROLLER.map(r => (
            <button key={r.deger} type="button" disabled={rolKilitli && r.deger !== rol}
              onClick={() => setRol(r.deger)}
              className={`text-left rounded-xl border px-3 py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                rol === r.deger ? "border-blue-500 bg-blue-500/10" : "border-cizgi bg-kart hover:border-blue-500/25"}`}>
              <span className="text-[13px] font-semibold text-yazi flex items-center gap-1.5">
                {rol === r.deger && <Check size={13} className="text-blue-400" />}{r.etiket}
              </span>
              <span className="block text-[11px] text-gray-500 mt-0.5">{r.aciklama}</span>
            </button>
          ))}
        </div>
        {rolKilitli && <p className="text-[11px] text-gray-500 mt-1.5">Kendi hesabınızın rolünü değiştiremezsiniz.</p>}
      </div>

      {rol === MUDUR && (
        <div>
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Hazır şablonlar</p>
          <div className="flex flex-wrap gap-2">
            {YETKI_SABLONLARI.map(s => (
              <button key={s.ad} type="button" onClick={() => setYetkiler([...s.yetkiler])}
                className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                  s.yetkiler.length === 0 ? "border-cizgi text-gray-500 hover:bg-gray-50" : "border-blue-500/25 text-blue-300 bg-blue-500/10 hover:bg-blue-500/10"}`}>
                {s.ad}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {hepsi && <p className="text-[12px] text-blue-300 bg-blue-500/10 border border-blue-500/25 rounded-lg px-3 py-2">Tam Yetkili kullanıcı tüm alanlara erişir (hepsi dahil).</p>}
        {rol === PASIF && <p className="text-[12px] text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">Pasif kullanıcı giriş yapamaz ve hiçbir veriye erişemez.</p>}
        {YETKI_GRUPLARI.map(grup => (
          <div key={grup} className={`rounded-xl border border-cizgi bg-kart overflow-hidden ${kapali ? "opacity-60" : ""}`}>
            <p className="px-3 py-2 text-[11px] font-bold text-gray-500 uppercase tracking-wider bg-alan border-b border-cizgi">{grup}</p>
            <div className="divide-y divide-cizgi">
              {YETKILER.filter(y => y.grup === grup).map(y => {
                const secili = hepsi || (rol === MUDUR && yetkiler.includes(y.anahtar));
                return (
                  <label key={y.anahtar} className={`flex items-start gap-3 px-3 py-2.5 ${kapali ? "cursor-not-allowed" : "cursor-pointer hover:bg-alan"}`}>
                    <input type="checkbox" className="mt-0.5 w-4 h-4 accent-blue-600 shrink-0" disabled={kapali}
                      checked={secili} onChange={e => degistir(y.anahtar, e.target.checked)} />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-yazi">{y.etiket}</span>
                      <span className="block text-[11px] text-gray-500">{y.aciklama}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function YeniKullaniciModal({ onKapat, onEklendi }: { onKapat: () => void; onEklendi: () => void }) {
  const [adSoyad, setAdSoyad] = useState("");
  const [email, setEmail] = useState("");
  const [sifre, setSifre] = useState("");
  const [rol, setRol] = useState<Rol>(MUDUR);
  const [yetkiler, setYetkiler] = useState<YetkiAnahtari[]>(["rapor_gir"]);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const kaydet = async () => {
    setHata(null);
    if (!adSoyad.trim()) { setHata("Ad soyad girin."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setHata("Geçerli bir e-posta adresi girin."); return; }
    if (sifre.length < 8) { setHata("Geçici şifre en az 8 karakter olmalı."); return; }
    setKaydediliyor(true);
    try {
      const res = await fetch("/api/kullanici-ekle", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adSoyad, email, sifre, rol, yetkiler: rol === MUDUR ? yetkiler : [] }),
      });
      const { hata: h } = await jsonCevap(res);
      if (h) { setHata(h); return; }
      alert(`${adSoyad} eklendi.\n\nGiriş bilgilerini kendisine iletin:\nE-posta: ${email.trim().toLowerCase()}\nGeçici şifre: ${sifre}`);
      onEklendi();
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e));
    } finally {
      setKaydediliyor(false);
    }
  };

  const girdi = "w-full bg-alan border border-cizgi-guclu text-[13px] h-10 px-3 rounded-lg outline-none focus:border-altin/50";

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onKapat}>
      <div className="bg-zemin w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-kart border-b border-cizgi px-5 py-3.5 flex items-center justify-between">
          <h2 className="text-[15px] font-black flex items-center gap-2"><UserPlus size={16} className="text-blue-400" /> Yeni kullanıcı ekle</h2>
          <button onClick={onKapat} className="p-1.5 rounded-lg border border-cizgi text-gray-500 hover:text-yazi"><X size={14} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Ad soyad</span>
              <input className={girdi} value={adSoyad} onChange={e => setAdSoyad(e.target.value)} placeholder="Bekir Yılmaz" />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">E-posta</span>
              <input className={girdi} type="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} placeholder="bekir@kebo.com" />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Geçici şifre (en az 8 karakter)</span>
              <div className="flex gap-2">
                <input className={`${girdi} font-mono`} type="text" autoComplete="new-password" value={sifre} onChange={e => setSifre(e.target.value)} />
                <button type="button" onClick={() => setSifre(rastgeleSifre())}
                  className="shrink-0 flex items-center gap-1.5 text-[12px] font-semibold px-3 rounded-lg border border-cizgi bg-kart hover:border-blue-500/25">
                  <KeyRound size={13} /> Rastgele oluştur
                </button>
              </div>
            </label>
          </div>
          <YetkiSecici rol={rol} setRol={setRol} yetkiler={yetkiler} setYetkiler={setYetkiler} />
          {hata && <p className="text-[12px] text-red-300 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2 whitespace-pre-line">{hata}</p>}
        </div>
        <div className="sticky bottom-0 bg-kart border-t border-cizgi px-5 py-3 flex justify-end gap-2">
          <button onClick={onKapat} className="text-[13px] font-semibold px-4 py-2 rounded-xl border border-cizgi text-gray-600">Vazgeç</button>
          <button onClick={kaydet} disabled={kaydediliyor}
            className="text-[13px] font-bold px-5 py-2 rounded-xl kebo-btn-altin text-[#1a1408] hover:brightness-110 disabled:opacity-50 flex items-center gap-2">
            {kaydediliyor ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Kullanıcıyı ekle
          </button>
        </div>
      </div>
    </div>
  );
}

export default function YetkilerPage() {
  const yetki = useYetki();
  const [kullanicilar, setKullanicilar] = useState<Kullanici[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [seciliId, setSeciliId] = useState<string | null>(null);
  const [modalAcik, setModalAcik] = useState(false);

  // Düzenleme formu
  const [adSoyad, setAdSoyad] = useState("");
  const [rol, setRol] = useState<Rol>(MUDUR);
  const [yetkiler, setYetkiler] = useState<YetkiAnahtari[]>([]);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [mesaj, setMesaj] = useState<{ tur: "ok" | "hata"; metin: string } | null>(null);

  const yukle = useCallback(async () => {
    setYukleniyor(true); setHata(null);
    const { data, error } = await createClient().from("profiles")
      .select("id,email,full_name,role,yetkiler,created_at").order("created_at");
    if (error) setHata(error.message);
    setKullanicilar((data || []).map(k => ({
      id: k.id as string, email: k.email as string | null, full_name: k.full_name as string | null,
      role: rolCoz(k.role), yetkiler: yetkilerCoz(k.yetkiler),
    })));
    setYukleniyor(false);
  }, []);

  useEffect(() => {
    if (!yetki.tamYetkili) return;
    const t = setTimeout(yukle, 0);
    return () => clearTimeout(t);
  }, [yukle, yetki.tamYetkili]);

  const secili = useMemo(() => kullanicilar.find(k => k.id === seciliId) || null, [kullanicilar, seciliId]);
  const kendisi = !!secili && secili.id === yetki.userId;

  const sec = (k: Kullanici) => {
    setSeciliId(k.id);
    setAdSoyad(k.full_name || "");
    setRol(k.role || MUDUR);
    setYetkiler(k.yetkiler);
    setMesaj(null);
    // Telefonda panel listenin altında: panele kaydır.
    setTimeout(() => document.getElementById("yetki-paneli")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const degisti = !!secili && (
    (secili.full_name || "") !== adSoyad.trim() || secili.role !== rol ||
    (rol === MUDUR && [...secili.yetkiler].sort().join(",") !== [...yetkiler].sort().join(","))
  );

  const kaydet = async () => {
    if (!secili) return;
    setKaydediliyor(true); setMesaj(null);
    const { error } = await createClient().rpc("kullanici_yetki_guncelle", {
      p_id: secili.id, p_rol: rol, p_yetkiler: rol === MUDUR ? yetkiler : [], p_ad: adSoyad.trim() || null,
    });
    setKaydediliyor(false);
    if (error) { setMesaj({ tur: "hata", metin: "Kaydedilemedi: " + error.message }); return; }
    setMesaj({ tur: "ok", metin: "Kaydedildi. Kullanıcı sayfayı yenileyince geçerli olur." });
    await yukle();
  };

  if (yetki.yukleniyor) return <main className="p-5 text-sm text-gray-500">Yükleniyor...</main>;
  if (!yetki.tamYetkili) return <main className="p-5 text-sm text-gray-500">Bu sayfa sadece Tam Yetkili kullanıcılara açıktır.</main>;

  const yetkiSayisi = (k: Kullanici) =>
    k.role === TAM_YETKILI ? "Tüm yetkiler" : k.role === MUDUR ? `${k.yetkiler.length} yetki` : "Erişim yok";

  return (
    <main className="min-h-screen bg-zemin text-yazi p-4 sm:p-5 pb-24">
      <div className="pt-5 mb-5 flex flex-wrap items-center gap-3">
        <Link href="/ayarlar" className="p-2 rounded-xl border border-cizgi bg-kart text-gray-500 hover:text-yazi">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-black flex items-center gap-2"><ShieldCheck size={22} className="text-blue-400" /> Yetkilendirme</h1>
          <p className="text-[12px] text-gray-500">Kullanıcı ekleyin ve her kişinin hangi bölümlere erişeceğini seçin.</p>
        </div>
        <button onClick={yukle} className="p-2 rounded-xl border border-cizgi bg-kart text-gray-500 hover:text-yazi" title="Yenile">
          <RefreshCw size={15} />
        </button>
        <button onClick={() => setModalAcik(true)}
          className="flex items-center gap-2 text-[13px] font-bold px-4 py-2 rounded-xl kebo-btn-altin text-[#1a1408] hover:brightness-110">
          <UserPlus size={15} /> Yeni kullanıcı ekle
        </button>
      </div>

      <div className="mb-4 flex items-start gap-2 text-[12px] text-gray-600 bg-kart border border-cizgi rounded-xl px-3 py-2.5">
        <Info size={14} className="text-blue-400 shrink-0 mt-0.5" />
        <span>Değişiklikler kullanıcının bir sonraki sayfa açılışında geçerli olur (kullanıcı sayfayı yenileyince). Supabase&apos;den eklediğiniz bir kullanıcı burada görünmüyorsa profiles satırı yoktur.</span>
      </div>

      {hata && <p className="mb-4 text-[12px] text-red-300 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">Kullanıcılar okunamadı: {hata}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,380px)_1fr] gap-4 items-start">
        {/* LİSTE */}
        <div className="bg-kart border border-cizgi rounded-2xl overflow-hidden">
          {yukleniyor && kullanicilar.length === 0 ? (
            <div className="p-6 flex justify-center"><Loader2 className="animate-spin text-gray-400" /></div>
          ) : kullanicilar.length === 0 ? (
            <p className="p-5 text-[13px] text-gray-500">Kullanıcı bulunamadı.</p>
          ) : (
            <div className="divide-y divide-cizgi">
              {kullanicilar.map(k => (
                <button key={k.id} onClick={() => sec(k)}
                  className={`w-full text-left px-4 py-3 transition-colors ${seciliId === k.id ? "bg-blue-500/10" : "hover:bg-alan"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold truncate">{k.full_name || k.email?.split("@")[0] || "İsimsiz"}</span>
                    <RolRozeti rol={k.role} />
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="text-[11px] text-gray-500 truncate">{k.email || "—"}</span>
                    <span className="text-[11px] text-gray-500 shrink-0">{yetkiSayisi(k)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* DÜZENLEME PANELİ */}
        {secili ? (
          <div id="yetki-paneli" className="bg-kart border border-cizgi rounded-2xl scroll-mt-20">
            <div className="px-5 py-4 border-b border-cizgi flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-black truncate">{secili.full_name || secili.email}</p>
                <p className="text-[12px] text-gray-500 truncate">{secili.email}{kendisi ? " · sizsiniz" : ""}</p>
              </div>
              <button onClick={() => setSeciliId(null)} className="p-1.5 rounded-lg border border-cizgi text-gray-500 hover:text-yazi"><X size={14} /></button>
            </div>
            <div className="p-5 space-y-4">
              <label className="block space-y-1">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Ad soyad</span>
                <input value={adSoyad} onChange={e => setAdSoyad(e.target.value)}
                  className="w-full bg-alan border border-cizgi-guclu text-[13px] h-10 px-3 rounded-lg outline-none focus:border-altin/50" />
              </label>
              <YetkiSecici rol={rol} setRol={setRol} yetkiler={yetkiler} setYetkiler={setYetkiler} rolKilitli={kendisi} />
              {mesaj && (
                <p className={`text-[12px] rounded-lg px-3 py-2 border ${mesaj.tur === "ok" ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/25" : "text-red-300 bg-red-500/10 border-red-500/25"}`}>{mesaj.metin}</p>
              )}
            </div>
            <div className="px-5 py-3 border-t border-cizgi flex items-center justify-between gap-3">
              <span className="text-[11px] text-gray-500">Kullanıcı sayfayı yenileyince geçerli olur.</span>
              <button onClick={kaydet} disabled={!degisti || kaydediliyor}
                className="text-[13px] font-bold px-5 py-2 rounded-xl kebo-btn-altin text-[#1a1408] hover:brightness-110 disabled:opacity-40 flex items-center gap-2">
                {kaydediliyor ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Kaydet
              </button>
            </div>
          </div>
        ) : (
          <div className="hidden lg:flex bg-kart border border-dashed border-cizgi-guclu rounded-2xl p-8 items-center justify-center text-[13px] text-gray-500">
            Düzenlemek için soldan bir kullanıcı seçin.
          </div>
        )}
      </div>

      {modalAcik && (
        <YeniKullaniciModal onKapat={() => setModalAcik(false)}
          onEklendi={async () => { setModalAcik(false); await yukle(); }} />
      )}
    </main>
  );
}
