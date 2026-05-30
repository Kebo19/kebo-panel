"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Save, Loader2, User, Briefcase, Calendar, IdCard, CreditCard, Mail, Lock, Shield, Phone, UserX } from "lucide-react";
import Link from "next/link";

const DEPARTMANLAR = ["Mutfak", "Banko", "Kurye", "Temizlik", "Yönetim", "Diğer"];
const PATRONLAR = ["murat@kebo.com", "bulent@kebo.com"];

export default function PersonelDuzenlePage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const id = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [isPatron, setIsPatron] = useState(false);

  const [form, setForm] = useState({
    full_name: "",
    department: "Mutfak",
    tc: "",
    iban: "TR",
    birth_date: "",
    start_date: "",
    leave_date: "", // İşten Çıkış Tarihi alanı eklendi
    email: "",
    password: "",
    role: "personel",
    telefon: ""
  });

  const personelGetir = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    // Giriş yapan kullanıcının patron yetkisini kontrol ediyoruz
    const { data: { user } } = await supabase.auth.getUser();
    const patronMu = user && user.email && PATRONLAR.includes(user.email.toLowerCase()) ? true : false;
    setIsPatron(patronMu);

    const { data, error } = await supabase
      .from("personnels")
      .select("full_name, department, tc, iban, birth_date, start_date, leave_date, email, password, role")
      .eq("id", id)
      .single();

    if (!error && data) {
      let mevcutIban = data.iban || "TR";
      if (!mevcutIban.startsWith("TR")) mevcutIban = "TR" + mevcutIban;

      setForm({
        full_name: data.full_name || "",
        department: data.department || "Mutfak",
        tc: data.tc || "",
        iban: mevcutIban,
        birth_date: data.birth_date || "",
        start_date: data.start_date || "",
        leave_date: data.leave_date || "", 
        email: data.email || "",
        password: data.password || "",
        role: data.role || "personel",
        telefon: ""
      });
    } else if (error) {
      setHata(`Veri yükleme hatası: ${error.message}`);
    }
    setLoading(false);
  }, [id, supabase]);

  useEffect(() => {
    personelGetir();
  }, [personelGetir]);

  const handleTcChange = (val: string) => {
    const sadeceRakam = val.replace(/\D/g, "");
    if (sadeceRakam.length <= 11) {
      setForm({ ...form, tc: sadeceRakam });
    }
  };

  const handleTelefonChange = (val: string) => {
    const sadeceRakam = val.replace(/\D/g, "");
    if (sadeceRakam.length <= 11) {
      setForm({ ...form, telefon: sadeceRakam });
    }
  };

  const handleIbanChange = (val: string) => {
    const temizGirdi = val.toUpperCase().replace("TR", "").replace(/[^0-9]/g, "");
    if (temizGirdi.length <= 24) {
      setForm({ ...form, iban: "TR" + temizGirdi });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name) {
      setHata("Lütfen personel adını ve soyadını giriniz.");
      return;
    }

    setSaveLoading(true);
    setHata(null);

    // Güncellenecek temel alanlar
    const guncelVeri: any = {
      full_name: form.full_name,
      department: form.department,
      tc: form.tc || null,
      iban: form.iban || null,
      birth_date: form.birth_date || null,
      start_date: form.start_date || null,
      leave_date: form.leave_date || null, // Boş bırakılırsa null gider, aktif kalır
      role: form.role
    };

    // Sadece patron ise e-posta ve şifre güncellenmesine izin ver
    if (isPatron) {
      guncelVeri.email = form.email || null;
      guncelVeri.password = form.password || null;
    }

    const { error } = await supabase
      .from("personnels")
      .update(guncelVeri)
      .eq("id", id);

    if (error) {
      setHata(`Güncelleme hatası: ${error.message}`);
      setSaveLoading(false);
    } else {
      router.push(`/personel/${id}`);
      router.refresh();
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#060810] flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#060810] text-white font-sans antialiased py-6">
      <div className="max-w-xl mx-auto px-4">
        
        <div className="flex items-center justify-between mb-6">
          <Link href={`/personel/${id}`} className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={14} /> Detaya Dön
          </Link>
          <h1 className="text-sm font-black tracking-tight text-white uppercase">Personel Düzenle</h1>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-6 space-y-4">
          
          {hata && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded-xl">
              {hata}
            </div>
          )}

          {/* Adı Soyadı */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <User size={12} /> Personel Adı Soyadı *
            </label>
            <input
              type="text"
              required
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="w-full bg-[#060810] border border-[#1a2236] text-white text-xs h-10 px-3 rounded-xl outline-none focus:border-blue-500/40"
            />
          </div>

          {/* Telefon */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <Phone size={12} /> Telefon Numarası (Maks 11 Hane)
            </label>
            <input
              type="text"
              value={form.telefon}
              onChange={(e) => handleTelefonChange(e.target.value)}
              className="w-full bg-[#060810] border border-[#1a2236] text-white text-xs h-10 px-3 rounded-xl outline-none focus:border-blue-500/40 font-mono"
            />
          </div>

          {/* T.C. Kimlik */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <IdCard size={12} /> T.C. Kimlik Numarası (11 Hane)
            </label>
            <input
              type="text"
              value={form.tc}
              onChange={(e) => handleTcChange(e.target.value)}
              className="w-full bg-[#060810] border border-[#1a2236] text-white text-xs h-10 px-3 rounded-xl outline-none focus:border-blue-500/40 font-mono"
            />
          </div>

          {/* IBAN */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <CreditCard size={12} /> IBAN Numarası (TR + 24 Hane)
            </label>
            <input
              type="text"
              maxLength={26}
              value={form.iban}
              onChange={(e) => handleIbanChange(e.target.value)}
              className="w-full bg-[#060810] border border-[#1a2236] text-white text-xs h-10 px-3 rounded-xl outline-none focus:border-blue-500/40 font-mono tracking-wider"
            />
          </div>

          {/* Departman */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <Briefcase size={12} /> Departman
            </label>
            <select
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
              className="w-full bg-[#060810] border border-[#1a2236] text-white text-xs h-10 px-3 rounded-xl outline-none focus:border-blue-500/40 appearance-none"
            >
              {DEPARTMANLAR.map((d) => (
                <option key={d} value={d} className="bg-[#0c0f1a]">{d}</option>
              ))}
            </select>
          </div>

          {/* İşe Giriş Tarihi */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <Calendar size={12} /> İşe Giriş Tarihi
            </label>
            <input
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              className="w-full bg-[#060810] border border-[#1a2236] text-white text-xs h-10 px-3 rounded-xl outline-none focus:border-blue-500/40"
            />
          </div>

          {/* İŞTEN ÇIKIŞ TARİHİ (Tüm roller görebilir ve ekleyebilir) */}
          <div className="space-y-1.5 border-t border-red-500/20 pt-4 bg-red-500/5 p-3 rounded-xl border">
            <label className="text-[11px] font-bold text-red-400 uppercase tracking-wider flex items-center gap-1">
              <UserX size={12} /> İşten Çıkış Tarihi (Girilirse ayrılanlara taşınır)
            </label>
            <input
              type="date"
              value={form.leave_date}
              onChange={(e) => setForm({ ...form, leave_date: e.target.value })}
              className="w-full bg-[#060810] border border-red-500/20 text-white text-xs h-10 px-3 rounded-xl outline-none focus:border-red-500/40"
            />
          </div>

          {/* Sadece Patronlar Görebilir: E-posta ve Şifre */}
          {isPatron && (
            <>
              <div className="space-y-1.5 border-t border-[#1a2236] pt-4">
                <label className="text-[11px] font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1">
                  <Mail size={12} /> E-posta Adresi (Sadece Patron Görür)
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full bg-[#060810] border border-[#1a2236] text-white text-xs h-10 px-3 rounded-xl outline-none focus:border-blue-500/40"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1">
                  <Lock size={12} /> Giriş Şifresi (Sadece Patron Görür)
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full bg-[#060810] border border-[#1a2236] text-white text-xs h-10 px-3 rounded-xl outline-none focus:border-blue-500/40"
                />
              </div>
            </>
          )}

          {/* Yetki Rolü */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
              <Shield size={12} /> Sistem Rolü / Yetki
            </label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full bg-[#060810] border border-[#1a2236] text-white text-xs h-10 px-3 rounded-xl outline-none focus:border-blue-500/40 appearance-none"
            >
              <option value="personel" className="bg-[#0c0f1a]">Personel</option>
              <option value="mudur" className="bg-[#0c0f1a]">Müdür</option>
              <option value="yonetici" className="bg-[#0c0f1a]">Yönetici / Admin (Patron)</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={saveLoading}
            className="w-full flex items-center justify-center gap-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 h-11 rounded-xl transition-colors shadow-lg cursor-pointer"
          >
            {saveLoading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Değişiklikleri Kaydet
          </button>
        </form>
      </div>
    </div>
  );
}