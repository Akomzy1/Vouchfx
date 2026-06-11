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
      // Bind referral attribution from cookie (VCH-REF-03)
      try {
        const cookieStore = await cookies();
        const refCode = cookieStore.get("vouchfx_ref")?.value;
        if (refCode) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const serviceDb = createServiceClient();
            await bindReferral(serviceDb, user.id, refCode);
            // Clear the cookie — attribution is now bound in DB
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
