"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Save, Loader2, User, Phone, Briefcase, Calendar, Shield, CreditCard } from "lucide-react";
import Link from "next/link";

const DEPARTMANLAR = ["Mutfak", "Banko", "Kurye", "Temizlik", "Yönetim", "Diğer"];

export default function YeniPersonelPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [ekleyen, setEkleyen] = useState("");

  const [form, setForm] = useState({
    isim: "",
    telefon: "",
    tc_kimlik: "",
    iban: "TR",
    departman: "Mutfak",
    maas: "",
    ise_giris_tarihi: new Date().toISOString().split("T")[0],
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setEkleyen(user.email.split("@")[0]);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.isim) { setHata("Lütfen personel adını giriniz."); return; }
    setLoading(true); setHata(null);

    const { error } = await supabase.from("personeller").insert([{
      isim: form.isim,
      telefon: form.telefon || null,
      tc_kimlik: form.tc_kimlik || null,
      iban: form.iban !== "TR" ? form.iban : null,
      departman: form.departman,
      maas: form.maas ? parseFloat(form.maas) : null,
      ise_giris_tarihi: form.ise_giris_tarihi || null,
      durum: "aktif",
      aktif: true,
      ekleyen_kullanici: ekleyen,
    }]);

    if (error) { setHata(`Kayıt hatası: ${error.message}`); setLoading(false); }
    else { router.push("/personel"); router.refresh(); }
  };

  return (
    <div className="min-h-screen bg-[#060810] text-white font-sans antialiased py-6">
      <div className="max-w-xl mx-auto px-4">

        <div className="flex items-center justify-between mb-6">
          <Link href="/personel" className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={14} /> Listeye Dön
          </Link>
          <h1 className="text-sm font-black tracking-tight text-white uppercase">Yeni Personel Ekle</h1>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-6 space-y-4">

          {hata && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded-xl">{hata}</div>}

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1"><User size={12} /> Adı Soyadı *</label>
            <input type="text" required value={form.isim} onChange={e => setForm({ ...form, isim: e.target.value })}
              placeholder="Ahmet Yılmaz"
              className="w-full bg-[#060810] border border-[#1a2236] text-white text-xs h-10 px-3 rounded-xl outline-none focus:border-blue-500/40" />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1"><Phone size={12} /> Telefon</label>
            <input type="text" value={form.telefon} onChange={e => setForm({ ...form, telefon: e.target.value.replace(/\D/g, "").slice(0, 11) })}
              placeholder="05xxxxxxxxx"
              className="w-full bg-[#060810] border border-[#1a2236] text-white text-xs h-10 px-3 rounded-xl outline-none focus:border-blue-500/40" />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1"><CreditCard size={12} /> TC Kimlik No</label>
            <input type="text" value={form.tc_kimlik} onChange={e => setForm({ ...form, tc_kimlik: e.target.value.replace(/\D/g, "").slice(0, 11) })}
              placeholder="11 haneli TC No"
              className="w-full bg-[#060810] border border-[#1a2236] text-white text-xs h-10 px-3 rounded-xl outline-none focus:border-blue-500/40 font-mono" />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1"><CreditCard size={12} /> IBAN</label>
            <input type="text" value={form.iban} maxLength={26}
              onChange={e => { const v = e.target.value.toUpperCase().replace("TR", "").replace(/[^0-9]/g, "").slice(0, 24); setForm({ ...form, iban: "TR" + v }); }}
              placeholder="TR"
              className="w-full bg-[#060810] border border-[#1a2236] text-white text-xs h-10 px-3 rounded-xl outline-none focus:border-blue-500/40 font-mono" />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1"><Briefcase size={12} /> Departman</label>
            <select value={form.departman} onChange={e => setForm({ ...form, departman: e.target.value })}
              className="w-full bg-[#060810] border border-[#1a2236] text-white text-xs h-10 px-3 rounded-xl outline-none focus:border-blue-500/40 appearance-none">
              {DEPARTMANLAR.map(d => <option key={d} value={d} className="bg-[#0c0f1a]">{d}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Aylık Maaş (₺)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-xs">₺</span>
              <input type="number" value={form.maas} onChange={e => setForm({ ...form, maas: e.target.value })}
                placeholder="0"
                className="w-full bg-[#060810] border border-[#1a2236] text-white text-xs h-10 pl-7 pr-3 rounded-xl outline-none focus:border-blue-500/40" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1"><Calendar size={12} /> İşe Giriş Tarihi</label>
            <input type="date" value={form.ise_giris_tarihi} onChange={e => setForm({ ...form, ise_giris_tarihi: e.target.value })}
              className="w-full bg-[#060810] border border-[#1a2236] text-white text-xs h-10 px-3 rounded-xl outline-none focus:border-blue-500/40" />
          </div>

          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 h-11 rounded-xl transition-colors shadow-lg">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Personeli Kaydet
          </button>
        </form>
      </div>
    </div>
  );
}