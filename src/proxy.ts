import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths that do not require authentication
  const isPublic = pathname === '/login' || 
                   pathname.startsWith('/api/auth') || 
                   pathname.startsWith('/api/health') ||
                   pathname.startsWith('/api/rack/scan') ||
                   pathname.startsWith('/_next') || 
                   pathname === '/favicon.ico';

  if (isPublic) {
    return NextResponse.next();
  }

  // Check auth token. The cookie name must match the one configured in auth.ts
  // (NextAuth v5 defaults to a secure-prefixed cookie in production).
  const isProduction = process.env.NODE_ENV === 'production';
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
    secureCookie: isProduction,
    cookieName: isProduction ? '__Secure-authjs.session-token' : 'authjs.session-token',
  });

  // Not logged in -> redirect to login
  if (!token) {
    const url = new URL('/login', request.url);
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  const role = token.role as string;

  // Protect Inbound page (Only Super Admin and Manager)
  if (pathname.startsWith('/inbound')) {
    if (role !== 'super-admin' && role !== 'manager') {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};