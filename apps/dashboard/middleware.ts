import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const allowInsecureHttp = process.env.ALLOW_INSECURE_HTTP === 'true';
const authHeaderName = process.env.DASHBOARD_AUTH_HEADER ?? 'x-wa-user';
const roleHeaderName = process.env.DASHBOARD_ROLE_HEADER ?? 'x-wa-role';
const allowedRoles = (process.env.DASHBOARD_ALLOWED_ROLES ?? 'admin')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const publicRoutes = ['/health'];

const isSecureRequest = (request: NextRequest) => {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedProto) {
    return forwardedProto.split(',')[0]?.trim() === 'https';
  }
  return request.nextUrl.protocol === 'https:';
};

export const middleware = (request: NextRequest) => {
  const pathname = request.nextUrl.pathname;

  if (publicRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && !allowInsecureHttp && !isSecureRequest(request)) {
    const url = request.nextUrl.clone();
    url.protocol = 'https:';
    return NextResponse.redirect(url);
  }

  const adminUser = request.headers.get(authHeaderName);
  if (!adminUser) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const adminRole = request.headers.get(roleHeaderName);
  if (!adminRole || !allowedRoles.includes(adminRole)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  return NextResponse.next();
};

export const config = {
  matcher: ['/((?!_next|favicon.ico|robots.txt).*)'],
};
