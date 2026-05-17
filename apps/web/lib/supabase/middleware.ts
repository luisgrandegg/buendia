import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

type CookieSet = { name: string; value: string; options: CookieOptions };

const PUBLIC_PATHS = ["/signin", "/signup", "/auth", "/docs", "/landing"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieSet[]) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user) {
    // Signed-out visitors land on the marketing page when they hit `/`,
    // and on /signin (with a `next=` redirect target) for any other
    // authenticated route.
    if (pathname === "/") {
      const landingUrl = request.nextUrl.clone();
      landingUrl.pathname = "/landing";
      return NextResponse.redirect(landingUrl);
    }
    if (!isPublicPath(pathname)) {
      const signInUrl = request.nextUrl.clone();
      signInUrl.pathname = "/signin";
      signInUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(signInUrl);
    }
  } else if (pathname === "/landing") {
    // Signed-in visitors don't need the marketing page; send them to
    // the dashboard.
    const home = request.nextUrl.clone();
    home.pathname = "/";
    return NextResponse.redirect(home);
  }

  return response;
}
