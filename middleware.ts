// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. STATİK DOSYALARI VE RESİMLERİ DOĞRUDAN PAS GEÇ (Hız için çok önemli)
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('favicon.ico') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // 2. Supabase'in tarayıcıda oluşturduğu auth çerezlerini kontrol et
  const cookies = request.cookies.getAll()
  const hasSession = cookies.some(c => c.name.includes('auth-token') || c.name.includes('sb-access-token'))

  // 3. Giriş yapmamışsa ve login sayfasında değilse login'e yönlendir
  if (!hasSession && pathname !== '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 4. Giriş yapmışsa ve login'e gitmeye çalışıyorsa ana sayfaya at
  if (hasSession && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!.*\\.).*)'],
}