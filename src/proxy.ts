import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths that do not require authentication
  const isPublic = pathname === '/login' || 
                    pathname.startsWith('/api/auth') || 
                    pathname.startsWith('/api/health') ||
                    pathname.startsWith('/api/env-check') ||
                    pathname.startsWith('/api/fix-password') ||
                    pathname.startsWith('/api/auth-debug') ||
                    pathname.startsWith('/api/auth-debug-callback') ||
                    pathname.startsWith('/api/rack/scan') ||
                    pathname.startsWith('/api/inbound/scan') ||
                    pathname.startsWith('/api/sku') ||
                    pathname.startsWith('/api/migrate') ||
                    pathname.startsWith('/inbound/scan') ||
                    pathname.startsWith('/_next') || 
                    pathname === '/favicon.ico';

  // Super Admin only paths (require auth + super-admin role)
  const isSuperAdminOnly = pathname.startsWith('/users') || 
                           pathname.startsWith('/api/users');

  if (isPublic) {
    return NextResponse.next();
  }

  // Check auth token. NextAuth v5 defaults to a secure-prefixed cookie in
  // production: `__Secure-authjs.session-token`.
  const isProduction = process.env.NODE_ENV === 'production';
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
    secureCookie: isProduction,
    cookieName: isProduction ? '__Secure-authjs.session-token' : 'authjs.session-token',
  });

  // Not logged in -> for API routes return 401 JSON (so the client can react),
  // for pages redirect to login.
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Sesi berakhir. Silakan login kembali.' },
        { status: 401 }
      );
    }
    const url = new URL('/login', request.url);
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  const role = token.role as string;

  // Super Admin only paths
  if (isSuperAdminOnly) {
    if (role !== 'super-admin') {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // Protect Inbound page (Only Super Admin and Manager). Scan pages are public (handled above).
  if (pathname.startsWith('/inbound') && !pathname.startsWith('/inbound/scan')) {
    if (role !== 'super-admin' && role !== 'manager') {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
