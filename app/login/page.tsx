"use client";

import { motion } from "framer-motion";
import KeboLogo from "@/components/kabuk/KeboLogo";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { rolCoz, yetkilerCoz, anaSayfaBul, TAM_YETKILI, MUDUR } from "@/lib/yetki";
import { yetkiOnbelleginiTemizle } from "@/lib/useYetki";
import { Loader2, Lock, Mail, Eye, EyeOff, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const PASIF_MESAJ = "Hesabınız pasif ya da henüz yetki verilmemiş. Lütfen yöneticinize başvurun.";

  useEffect(() => {
    // proxy.ts pasif kullanıcıyı /login?pasif=1'e gönderir.
    if (new URLSearchParams(window.location.search).get("pasif") === "1") setError(PASIF_MESAJ);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.session) {
        yetkiOnbelleginiTemizle();
        const { data: profil } = await supabase.from("profiles").select("role, yetkiler").eq("id", data.session.user.id).maybeSingle();
        const rol = rolCoz(profil?.role);
        if (rol !== TAM_YETKILI && rol !== MUDUR) {
          await supabase.auth.signOut();
          setError(PASIF_MESAJ);
          return;
        }
        router.push(anaSayfaBul(rol, yetkilerCoz(profil?.yetkiler)));
        router.refresh();
      }
    } catch {
      setError("E-posta veya şifre hatalı. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zemin flex items-center justify-center p-4 font-sans antialiased">

      {/* Arka plan efekti */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div className="absolute top-[18%] left-1/2 -translate-x-1/2 w-[640px] h-[360px] bg-altin/10 blur-[120px] rounded-full"
          animate={{ opacity: [0.6, 1, 0.6], scale: [1, 1.08, 1] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[200px] bg-[#b5562f]/10 blur-[90px] rounded-full" />
        {/* Grid */}
        <div className="absolute inset-0"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }} />
      </div>

      <div className="relative w-full max-w-sm">

        {/* Logo & Başlık */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
          className="text-center mb-8">
          <KeboLogo boyut="buyuk" className="justify-center mb-7" />
          <h1 className="text-[22px] font-bold text-yazi tracking-tight">Yönetim paneline giriş</h1>
          <p className="text-gray-600 text-sm mt-1.5">Devam etmek için hesabınızla oturum açın.</p>
        </motion.div>

        {/* Kart */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
          className="kebo-kart !rounded-[24px] overflow-hidden">

          {/* Üst şerit */}
          <div className="h-px bg-gradient-to-r from-transparent via-altin/60 to-transparent" />

          <div className="p-7">
            <form onSubmit={handleLogin} className="space-y-4">

              {/* E-posta */}
              <div>
                <label className="block text-[12px] text-gray-700 font-medium mb-2">
                  E-posta
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-600" />
                  <input
                    type="email"
                    placeholder="ornek@kebo.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="w-full bg-alan border border-cizgi hover:border-cizgi-guclu focus:border-altin/50 focus:ring-1 focus:ring-altin/40 text-yazi text-sm h-11 pl-10 pr-4 rounded-xl outline-none transition-all placeholder:text-gray-400"
                  />
                </div>
              </div>

              {/* Şifre */}
              <div>
                <label className="block text-[12px] text-gray-700 font-medium mb-2">
                  Şifre
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-600" />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full bg-alan border border-cizgi hover:border-cizgi-guclu focus:border-altin/50 focus:ring-1 focus:ring-altin/40 text-yazi text-sm h-11 pl-10 pr-11 rounded-xl outline-none transition-all placeholder:text-gray-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors p-0.5"
                    tabIndex={-1}
                  >
                    {showPassword
                      ? <EyeOff className="h-4 w-4" />
                      : <Eye className="h-4 w-4" />
                    }
                  </button>
                </div>
              </div>

              {/* Hata mesajı */}
              {error && (
                <div className="flex items-center gap-2.5 bg-red-500/8 border border-red-500/20 text-red-400 text-xs px-4 py-3 rounded-xl">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Giriş butonu */}
              <button
                type="submit"
                disabled={loading || !email || !password}
                className="w-full h-11 mt-2 kebo-btn-altin hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed text-[#1a1408] text-sm font-bold rounded-xl transition-all shadow-lg shadow-altin/20 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Giriş yapılıyor...
                  </>
                ) : (
                  "Giriş Yap"
                )}
              </button>

            </form>
          </div>
        </motion.div>

        {/* Alt not */}
        <p className="text-center text-[11px] text-gray-500 mt-6">
          Erişim sorununuz varsa yöneticinizle iletişime geçin.
        </p>

      </div>
    </div>
  );
}
