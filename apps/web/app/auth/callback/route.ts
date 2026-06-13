import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { bindReferral } from "@/lib/referral";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Bind referral attribution from the cookie (VCH-REF-03). The cookie
      // value is "<source>:<CODE>" (source = affiliate|referral). Legacy values
      // without a prefix are treated as the referral (credit) program.
      try {
        const cookieStore = await cookies();
        const raw = cookieStore.get("vouchfx_ref")?.value;
        if (raw) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const [maybeSource, maybeCode] = raw.includes(":") ? raw.split(":") : ["referral", raw];
            const source = maybeSource === "affiliate" ? "affiliate" : "referral";
            const serviceDb = createServiceClient();
            // Cookie-bound: not explicit, so it never overrides an existing slot.
            await bindReferral(serviceDb, user.id, (maybeCode ?? "").trim(), source, false);
            const response = NextResponse.redirect(`${origin}${next}`);
            response.cookies.delete("vouchfx_ref");
            return response;
          }
        }
      } catch {
        // Referral binding failure must never block sign-in
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth-callback-failed`);
}
