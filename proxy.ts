import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { rolCoz, yoneticiSayfasiMi, MUDUR_ANA_SAYFA, TAM_YETKILI } from '@/lib/yetki'

// Next 16'da `middleware.ts` dosyası `proxy.ts` olarak yeniden adlandırıldı.
//
// Görevleri:
//  1) Giriş yapmamış kullanıcıyı /login'e yönlendirmek.
//  2) Rol kontrolü: Anasayfa, Kasa & Finans (Kasa, Cariler, Faturalar) ve
//     Rapor Analiz sadece "Tam Yetkili" rolüne açık. Müdür bu adreslere URL
//     yazarak gitse bile Kasa Raporu'na yönlendirilir. (Veriyi asıl koruyan
//     veritabanındaki RLS kurallarıdır; bu katman ekranları korur.)
//
// Rol, `profiles.role` alanından veritabanı trigger'ı ile kullanıcının
// app_metadata.rol alanına kopyalanır; getUser() bunu sunucudan taze okur,
// böylece her istekte ek sorgu gerekmez.

// Supabase soğuk başlangıçta cevap vermeyebilir; Vercel'in 504 hatasına düşmemek
// için kendi zaman aşımımızı koyuyoruz.
const AUTH_CHECK_TIMEOUT_MS = 6000

async function getUserSafely(
  supabase: SupabaseClient
): Promise<{ user: User | null; timedOut: boolean }> {
  const timeoutMarker = Symbol('auth-timeout')
  const timeoutPromise = new Promise<typeof timeoutMarker>((resolve) => {
    setTimeout(() => resolve(timeoutMarker), AUTH_CHECK_TIMEOUT_MS)
  })
  try {
    const authPromise: Promise<User | null> = supabase.auth.getUser().then((r) => r.data.user)
    const result = await Promise.race([authPromise, timeoutPromise])
    if (result === timeoutMarker) return { user: null, timedOut: true }
    return { user: result, timedOut: false }
  } catch (error) {
    console.error('[proxy] Supabase auth kontrolü başarısız oldu:', error)
    return { user: null, timedOut: true }
  }
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const yol = request.nextUrl.pathname
  const loginSayfasi = yol.startsWith('/login')
  const yonlendir = (hedef: string, params?: Record<string, string>) => {
    const url = request.nextUrl.clone()
    url.pathname = hedef
    url.search = ''
    Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v))
    return NextResponse.redirect(url)
  }

  const { user, timedOut } = await getUserSafely(supabase)

  if (timedOut) {
    // Supabase uyanıyor olabilir; kullanıcı birkaç saniye sonra tekrar deneyince geçer.
    return loginSayfasi ? supabaseResponse : yonlendir('/login', { retry: '1' })
  }

  if (!user) {
    return loginSayfasi ? supabaseResponse : yonlendir('/login')
  }

  let rol = rolCoz(user.app_metadata?.rol)
  if (!rol) {
    // Trigger henüz çalışmadıysa profil tablosundan oku.
    const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    rol = rolCoz(data?.role)
  }
  const anaSayfa = rol === TAM_YETKILI ? '/' : MUDUR_ANA_SAYFA

  if (loginSayfasi) return yonlendir(anaSayfa)

  if (yoneticiSayfasiMi(yol) && rol !== TAM_YETKILI) {
    return yonlendir(MUDUR_ANA_SAYFA)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Statik dosyalar, görseller ve api/ hariç her sayfa. API route'ları kendi
    // oturum kontrolünü yapar (bkz. lib/supabase/server.ts → oturumKontrol).
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
