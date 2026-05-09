import { NextResponse } from 'next/server';

const SESSION_COOKIE = 'nyx_session';
const PUBLIC_PATHS = ['/login'];

function base64urlDecode(value) {
  const normalized = String(value || '').replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function base64urlEncode(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function verifyToken(token) {
  const secret = process.env.AUTH_SECRET || process.env.API_KEY;

  if (!secret) {
    return false;
  }

  const [header, payload, signature] = String(token || '').split('.');

  if (!header || !payload || !signature) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const expected = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${header}.${payload}`)
  );

  if (base64urlEncode(expected) !== signature) {
    return false;
  }

  try {
    const decoded = JSON.parse(new TextDecoder().decode(base64urlDecode(payload)));
    return Number(decoded.exp || 0) * 1000 > Date.now() ? decoded : null;
  } catch {
    return null;
  }
}

function isPublicPath(pathname) {
  return PUBLIC_PATHS.includes(pathname)
    || pathname.startsWith('/_next')
    || pathname === '/favicon.ico'
    || pathname.startsWith('/branding/');
}

export async function middleware(request) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifyToken(token);
  const authenticated = Boolean(session);

  if (authenticated) {
    if (pathname === '/login') {
      return NextResponse.redirect(new URL('/', request.url));
    }

    const adminOnlyPaths = ['/alerts', '/users', '/audit', '/about'];
    const adminOnly = adminOnlyPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));

    if (adminOnly && session.role !== 'admin') {
      return NextResponse.redirect(new URL('/', request.url));
    }

    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const loginUrl = new URL('/login', request.url);
  const nextPath = `${pathname}${search}`;

  if (nextPath !== '/login') {
    loginUrl.searchParams.set('next', nextPath);
  }

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)']
};
