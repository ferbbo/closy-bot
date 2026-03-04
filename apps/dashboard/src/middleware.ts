import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/api', '/_next', '/favicon.ico'];

interface AuthMeBody {
  authenticated: boolean;
  merchant?: {
    status?: string;
  };
}

/** AC-10: Middleware redirect — onboarding → /onboarding, active → /dashboard */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip checking for public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    const cookie = request.cookies.get('session_id');

    const res = await fetch(`${apiUrl}/auth/me`, {
      headers: cookie ? { Cookie: `session_id=${cookie.value}` } : {},
    });

    if (!res.ok) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const body = (await res.json()) as AuthMeBody;
    const status = body.merchant?.status;

    // Merchant is still onboarding → force /onboarding (except already there)
    if (status === 'onboarding' && pathname !== '/onboarding') {
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }

    // Merchant is already active and tries to access /onboarding → send to dashboard
    if (status === 'active' && pathname === '/onboarding') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|auth).*)'],
};

