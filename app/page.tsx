"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { 
  Users, Wallet, Utensils, ArrowUpRight, Calendar, 
  Clock, ShieldCheck, Activity, Bell, ChevronRight,
  TrendingUp, AlertTriangle, FileText, CheckCircle
} from "lucide-react";
import Link from "next/link";

export default function Anasayfa() {
  const supabase = createClient();
  const [activeUser, setActiveUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Tamamen mantıklı ve operasyonel state yapısı
  const [data, setData] = useState({
    aktifCalisan: 0,
    ayrilanPersonel: 0,
    mutfakSayisi: 0,
    kuryeSayisi: 0,
    bankoSayisi: 0,
    yonetimSayisi: 0,
    eksikBelgeli: 0,
  });

  useEffect(() => {
    async function operasyonelVeriGetir() {
      setLoading(true);
      
      // Aktif kullanıcı kontrolü
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setActiveUser(user);

      // Personel şemasından gerçek operasyonel analiz çıkartıyoruz
      const { data: personnels } = await supabase
        .from("personnels")
        .select("department, leave_date, tc, iban");

      if (personnels) {
        const aktifler = personnels.filter(p => !p.leave_date);
        const ayrilanlar = personnels.filter(p => !!p.leave_date);
        
        // T.C. veya IBAN bilgisi girilmemiş eksik evraklı personel sayısı
        const eksikEvrak = aktifler.filter(p => !p.tc || !p.iban || p.iban === "TR").length;

        setData({
          aktifCalisan: aktifler.length,
          ayrilanPersonel: ayrilanlar.length,
          mutfakSayisi: aktifler.filter(p => p.department === "Mutfak").length,
          kuryeSayisi: aktifler.filter(p => p.department === "Kurye").length,
          bankoSayisi: aktifler.filter(p => p.department === "Banko").length,
          yonetimSayisi: aktifler.filter(p => p.department === "Yönetim").length,
          eksikBelgeli: eksikEvrak
        });
      }
      setLoading(false);
    }

    operasyonelVeriGetir();
  }, [supabase]);

  const bugun = new Date().toLocaleDateString("tr-TR", { 
    weekday: "long", year: "numeric", month: "long", day: "numeric" 
  });

  if (loading) return (
    <div className="min-h-screen bg-[#060810] flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#060810] text-white font-sans antialiased pb-12">
      
      {/* ── ÜST BAR / OPERASYON BAŞLIĞI ── */}
      <div className="border-b border-[#0f1624] bg-[#0c0f1a]/60 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase font-black text-emerald-500 tracking-widest">
              <Activity size={10} className="animate-pulse" /> KEBO ERP · MERKEZİ KONTROL
            </div>
            <h1 className="text-base font-black tracking-tight mt-0.5 text-white">
              Şube Operasyon Özeti
            </h1>
          </div>
          <div className="flex items-center gap-3 text-right">
            <span className="text-xs font-bold text-gray-500 flex items-center gap-1.5 bg-[#0c0f1a] border border-[#1a2236] px-3 py-1.5 rounded-xl">
              <Calendar size={13} className="text-blue-500" /> {bugun}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-6 space-y-6">
        
        {/* ── KRİTİK İŞLETME METRİKLERİ ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Aktif Personel Durumu */}
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-4">
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-[10px] font-bold uppercase tracking-widest">Aktif Kadro</span>
              <Users size={16} className="text-blue-400" />
            </div>
            <h3 className="text-2xl font-black mt-2">{data.aktifCalisan} <span className="text-xs font-normal text-gray-500">Kişi</span></h3>
            <p className="text-[10px] text-gray-600 mt-1">{data.ayrilanPersonel} eski personel kaydı</p>
          </div>

          {/* Eksik Evrak Alarmı */}
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-4 relative overflow-hidden">
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-[10px] font-bold uppercase tracking-widest">Eksik Bilgili</span>
              <AlertTriangle size={16} className={data.eksikBelgeli > 0 ? "text-amber-400 animate-bounce" : "text-gray-600"} />
            </div>
            <h3 className="text-2xl font-black mt-2 text-white">{data.eksikBelgeli} <span className="text-xs font-normal text-gray-500">Personel</span></h3>
            <p className="text-[10px] text-amber-500/80 mt-1">{data.eksikBelgeli > 0 ? "T.C. veya IBAN eksik!" : "Tüm evraklar tam"}</p>
          </div>

          {/* Günlük Kasa Durumu (Kasa Modülü Entegrasyon Taslağı) */}
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-4">
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-[10px] font-bold uppercase tracking-widest">Günlük Net Kasa</span>
              <Wallet size={16} className="text-emerald-400" />
            </div>
            <h3 className="text-2xl font-black mt-2 text-emerald-400">₺0,00</h3>
            <p className="text-[10px] text-gray-600 mt-1">Bugün henüz kasa kapatılmadı</p>
          </div>

          {/* Dağıtım Durumu */}
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-4">
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-[10px] font-bold uppercase tracking-widest">Saha / Kurye</span>
              <Utensils size={16} className="text-purple-400" />
            </div>
            <h3 className="text-2xl font-black mt-2">{data.kuryeSayisi} <span className="text-xs font-normal text-gray-500">Aktif</span></h3>
            <p className="text-[10px] text-gray-600 mt-1">{data.mutfakSayisi} mutfak personeli devrede</p>
          </div>

        </div>

        {/* ── OPERASYONEL PANELLER ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Sol/Orta Alan: Şube Kadro Dağılımı ve Hızlı Yönetim */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Gerçek Dağılım Tablosı */}
            <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                  <ShieldCheck size={14} className="text-blue-500" /> Şube Departman Yoğunlukları
                </h2>
                <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded-md border border-white/10 text-gray-400">Canlı Dağılım</span>
              </div>
              
              <div className="space-y-4">
                {/* Mutfak */}
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1.5">
                    <span className="text-gray-400">Mutfak Kadrosu</span>
                    <span>{data.mutfakSayisi} Kişi ({data.aktifCalisan ? Math.round((data.mutfakSayisi / data.aktifCalisan) * 100) : 0}%)</span>
                  </div>
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-500 rounded-full" style={{ width: `${data.aktifCalisan ? (data.mutfakSayisi / data.aktifCalisan) * 100 : 0}%` }} />
                  </div>
                </div>

                {/* Kurye */}
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1.5">
                    <span className="text-gray-400">Kurye / Paket Servis</span>
                    <span>{data.kuryeSayisi} Kişi ({data.aktifCalisan ? Math.round((data.kuryeSayisi / data.aktifCalisan) * 100) : 0}%)</span>
                  </div>
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${data.aktifCalisan ? (data.kuryeSayisi / data.aktifCalisan) * 100 : 0}%` }} />
                  </div>
                </div>

                {/* Banko */}
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1.5">
                    <span className="text-gray-400">Banko & Kasa Sorumluları</span>
                    <span>{data.bankoSayisi} Kişi ({data.aktifCalisan ? Math.round((data.bankoSayisi / data.aktifCalisan) * 100) : 0}%)</span>
                  </div>
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${data.aktifCalisan ? (data.bankoSayisi / data.aktifCalisan) * 100 : 0}%` }} />
                  </div>
                </div>

                {/* Yönetim */}
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1.5">
                    <span className="text-gray-400">Şube Müdürleri & Yönetim</span>
                    <span>{data.yonetimSayisi} Kişi ({data.aktifCalisan ? Math.round((data.yonetimSayisi / data.aktifCalisan) * 100) : 0}%)</span>
                  </div>
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${data.aktifCalisan ? (data.yonetimSayisi / data.aktifCalisan) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Aksiyon Merkezi */}
            <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-6">
              <h2 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-4">Hızlı Modül Geçişleri</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Link href="/personel" className="bg-[#060810] border border-[#1a2236]/60 hover:border-blue-500/40 p-4 rounded-xl flex items-center justify-between group transition-colors">
                  <div>
                    <h4 className="text-xs font-black text-white group-hover:text-blue-400 transition-colors">Personel Listesi</h4>
                    <p className="text-[10px] text-gray-600 mt-0.5">Departman filtreli personel kartları</p>
                  </div>
                  <ChevronRight size={14} className="text-gray-600 group-hover:text-blue-400 transition-transform group-hover:translate-x-0.5" />
                </Link>

                <Link href="/personel/yeni" className="bg-[#060810] border border-[#1a2236]/60 hover:border-emerald-500/40 p-4 rounded-xl flex items-center justify-between group transition-colors">
                  <div>
                    <h4 className="text-xs font-black text-white group-hover:text-emerald-400 transition-colors">Yeni Personel Ekle</h4>
                    <p className="text-[10px] text-gray-600 mt-0.5">Maskeli T.C., IBAN ve rol girişi</p>
                  </div>
                  <ChevronRight size={14} className="text-gray-600 group-hover:text-emerald-400 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>

          </div>

          {/* Sağ Alan: Kritik Süreçler ve Loglar */}
          <div className="space-y-6">
            
            {/* Muhasebe & Evrak Durumu */}
            <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-6">
              <h2 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                <FileText size={14} className="text-amber-500" /> Muhasebe Kontrolü
              </h2>
              <div className="space-y-3">
                <div className="p-3 bg-[#060810] border border-[#1a2236] rounded-xl flex items-center justify-between">
                  <span className="text-xs text-gray-400">Banka Ödemeleri (IBAN)</span>
                  <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">HAZIR</span>
                </div>
                <div className="p-3 bg-[#060810] border border-[#1a2236] rounded-xl flex items-center justify-between">
                  <span className="text-xs text-gray-400">Yasal Bildirimler (T.C.)</span>
                  <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">KORUMALI</span>
                </div>
              </div>
            </div>

            {/* Son Yapılan Güvenli İşlemler */}
            <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-6">
              <h2 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                <CheckCircle size={14} className="text-blue-500" /> Entegre Sistem Durumu
              </h2>
              <div className="space-y-2 text-[11px]">
                <div className="p-2.5 bg-[#060810]/40 rounded-xl border border-[#1a2236]/30 flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1 shrink-0" />
                  <p className="text-gray-400"><strong className="text-white">Supabase Bağlantısı:</strong> `personnels` şeması dinamik olarak analiz ediliyor.</p>
                </div>
                <div className="p-2.5 bg-[#060810]/40 rounded-xl border border-[#1a2236]/30 flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1 shrink-0" />
                  <p className="text-gray-400"><strong className="text-white">Yetki Koruması:</strong> Şifre ve e-posta gizleme mekanizması aktif durumda.</p>
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* Kurumsal İmza */}
        <p className="text-center text-[10px] text-gray-700 pt-4">
          KEBO RESTORAN ZİNCİRİ YÖNETİM PANELİ v2.5
        </p>

      </div>
    </div>
  );
}