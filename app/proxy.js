import { NextResponse } from 'next/server'


export function proxy(request) {
  // Only runs on protected routes (see matcher below)
  const hasSession = request.cookies.getAll().some(
    c => c.name.startsWith('sb-') && c.name.includes('-auth-token')
  )

  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next({ request })
}

export const config = {
  matcher: [
    '/comando/:path*',
    '/meios/:path*',
    '/radio/:path*',
    '/alertas/:path*',
    '/relatorio/:path*',
    '/demo/:path*',
  ],
}
