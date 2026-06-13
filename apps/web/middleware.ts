import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes that require authentication
const PROTECTED = new Set([
  "/dashboard",
  "/channels",
  "/signals",
  "/risk",
  "/billing",
  "/refer",
  "/settings",
  "/onboarding",
  "/admin",
]);

// Auth pages — authenticated users should be redirected away
const AUTH_PATHS = new Set(["/login", "/signup", "/forgot-password"]);

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — use getUser() not getSession() to avoid JWT spoofing
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Authenticated users at root go to dashboard; visitors see the landing page
  if (pathname === "/" && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Authenticated users don't need auth pages
  if (user && AUTH_PATHS.has(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Unauthenticated users cannot access protected pages
  if (!user && PROTECTED.has(pathname)) {
    const next = encodeURIComponent(pathname);
    return NextResponse.redirect(new URL(`/login?next=${next}`, request.url));
  }

  // Legacy ?ref=CODE capture → referral (credit) program, 60-day window
  // (VCH-REF-03). The /r/CODE and /ref/CODE routes are the canonical link types;
  // this keeps older ?ref= links working and stores the unified "source:code".
  const ref = request.nextUrl.searchParams.get("ref");
  if (ref && /^[A-Za-z0-9]{4,16}$/.test(ref)) {
    supabaseResponse.cookies.set("vouchfx_ref", `referral:${ref.toUpperCase()}`, {
      httpOnly: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 60, // 60 days
      sameSite: "lax",
    });
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
