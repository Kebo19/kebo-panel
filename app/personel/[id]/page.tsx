"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { 
  ArrowLeft, User, Briefcase, Calendar, Mail, 
  Shield, CreditCard, IdCard, Loader2, Trash2, AlertCircle, Edit2 
} from "lucide-react";
import Link from "next/link";

interface PersonelDetay {
  id: string;
  full_name: string;
  department?: string;
  tc?: string;
  iban?: string;
  birth_date?: string;
  start_date?: string;
  leave_date?: string;
  email?: string;
  role?: string;
}

export default function PersonelDetayPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  
  const [personel, setPersonel] = useState<PersonelDetay | null>(null);
  const [loading, setLoading] = useState(true);
  const [silLoading, setSilLoading] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const id = params?.id as string;

  // 1. ADIM: Yetki Kontrolü
  useEffect(() => {
    const yetkiKontrol = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email === 'murat@kebo.com' || user?.email === 'bulent@kebo.com') {
        setIsAdmin(true);
      }
    };
    yetkiKontrol();
  }, [supabase]);

  // 2. ADIM: Personel verilerini çek
  const personelGetir = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setHata(null);

    const { data, error } = await supabase
      .from("personnels")
      .select("id, full_name, department, tc, iban, birth_date, start_date, leave_date, email, role")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Personel detay hatası:", error.message);
      setHata("Personel bilgileri yüklenirken bir hata oluştu veya personel bulunamadı.");
    } else if (data) {
      setPersonel(data as PersonelDetay);
    }
    setLoading(false);
  }, [id, supabase]);

  useEffect(() => {
    personelGetir();
  }, [personelGetir]);

  // 3. ADIM: Tıklama anında kesin yönlendirme sağlayan fonksiyon
  const handleDuzenleClick = () => {
    if (!id) return;
    // Link yerine doğrudan router ile sayfayı gitmeye zorluyoruz
    router.push(`/personel/${id}/duzenle`);
  };

  // 4. ADIM: Silme fonksiyonu
  const personelSil = async () => {
    if (!isAdmin) {
      alert("Bu işlem için yetkiniz yetersiz. Sadece yöneticiler (patronlar) silebilir.");
      return;
    }

    if (!id || !window.confirm("Bu personeli silmek istediğinize emin misiniz?")) return;
    
    setSilLoading(true);
    const { error } = await supabase
      .from("personnels")
      .delete()
      .eq("id", id);

    if (error) {
      alert(`Silme hatası: ${error.message}`);
      setSilLoading(false);
    } else {
      router.push("/personel");
      router.refresh();
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#060810] flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );

  if (hata || !personel) return (
    <div className="min-h-screen bg-[#060810] text-white flex flex-col items-center justify-center p-4">
      <AlertCircle className="text-red-500 mb-2" size={32} />
      <p className="text-sm text-gray-400 max-w-md text-center">{hata || "Personel bulunamadı."}</p>
      <Link href="/personel" className="mt-4 flex items-center gap-2 text-xs text-blue-400 hover:underline">
        <ArrowLeft size={14} /> Listeye Geri Dön
      </Link>
    </div>
  );

  const fmtTarih = (t?: string) => {
    if (!t) return "-";
    const [y, m, d] = t.split("-");
    return `${d}.${m}.${y}`;
  };

  return (
    <div className="min-h-screen bg-[#060810] text-white font-sans antialiased py-6">
      <div className="max-w-xl mx-auto px-4">
        
        {/* Üst Navigasyon ve Butonlar */}
        <div className="flex items-center justify-between mb-6">
          <Link href="/personel" className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={14} /> Listeye Dön
          </Link>
          
          <div className="flex items-center gap-2">
            {/* Düzenle Butonu: onClick olayına bağlandı, artık kesin tetiklenir */}
            {isAdmin && (
              <button 
                onClick={handleDuzenleClick}
                className="flex items-center gap-1.5 text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/10 px-3 py-1.5 rounded-xl cursor-pointer"
              >
                <Edit2 size={12} />
                Düzenle
              </button>
            )}

            {/* Silme Butonu */}
            {isAdmin && (
              <button 
                onClick={personelSil}
                disabled={silLoading}
                className="flex items-center gap-1.5 text-xs font-bold text-red-400 hover:text-red-300 transition-colors bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 px-3 py-1.5 rounded-xl cursor-pointer"
              >
                {silLoading ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Personeli Sil
              </button>
            )}
          </div>
        </div>

        {/* Profil Kartı */}
        <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-6 space-y-6">
          
          <div className="flex items-center gap-4 border-b border-[#1a2236] pb-5">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-sm font-black text-blue-400">
              {personel.full_name ? personel.full_name.split(" ").map(n => n[0]).slice(0, 2).join("") : "P"}
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight">{personel.full_name}</h1>
              <span className="inline-block text-[10px] font-bold px-2 py-0.5 mt-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/10 uppercase">
                {personel.department || "Departman Belirtilmemiş"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 text-xs">
            <div className="bg-[#060810] p-3 rounded-xl border border-[#1a2236]/60 flex items-center justify-between">
              <span className="text-gray-500 flex items-center gap-2"><IdCard size={14} /> T.C. Kimlik No</span>
              <span className="font-medium text-gray-200">{personel.tc || "-"}</span>
            </div>

            <div className="bg-[#060810] p-3 rounded-xl border border-[#1a2236]/60 flex items-center justify-between">
              <span className="text-gray-500 flex items-center gap-2"><Calendar size={14} /> İşe Giriş Tarihi</span>
              <span className="font-medium text-gray-200">{fmtTarih(personel.start_date)}</span>
            </div>

            <div className="bg-[#060810] p-3 rounded-xl border border-[#1a2236]/60 flex items-center justify-between">
              <span className="text-gray-500 flex items-center gap-2"><User size={14} /> Çalışma Durumu</span>
              <span className={`font-bold px-2 py-0.5 rounded-md text-[10px] ${
                !personel.leave_date ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
              }`}>
                {!personel.leave_date ? "AKTİF" : `AYRILDI (${fmtTarih(personel.leave_date)})`}
              </span>
            </div>

            <div className="bg-[#060810] p-3 rounded-xl border border-[#1a2236]/60 flex flex-col gap-1.5">
              <span className="text-gray-500 flex items-center gap-2"><CreditCard size={14} /> IBAN Numarası</span>
              <span className="font-mono text-gray-300 bg-black/20 p-2 rounded-lg border border-white/5 select-all text-center tracking-wider">
                {personel.iban || "Belirtilmemiş"}
              </span>
            </div>

            <div className="bg-[#060810] p-3 rounded-xl border border-[#1a2236]/60 flex items-center justify-between">
              <span className="text-gray-500 flex items-center gap-2"><Mail size={14} /> E-posta</span>
              <span className="font-medium text-gray-200">{personel.email || "-"}</span>
            </div>

            <div className="bg-[#060810] p-3 rounded-xl border border-[#1a2236]/60 flex items-center justify-between">
              <span className="text-gray-500 flex items-center gap-2"><Shield size={14} /> Yetki Rolü</span>
              <span className="font-medium text-blue-400 uppercase tracking-wider text-[11px] font-bold">
                {personel.role || "personel"}
              </span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}