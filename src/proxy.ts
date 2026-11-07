import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/lib/env";
import { estRoutePublique } from "@/lib/routes-publiques";


/**
 * Rafraîchit la session Supabase à chaque navigation et renvoie vers /login
 * sans session. L'autorisation fine (liste d'adresses) est vérifiée côté serveur
 * par exigerUtilisateur() et par la RLS.
 */
export async function proxy(request: NextRequest) {
  const env = getPublicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        // En-têtes anti-cache fournis par Supabase : empêchent un CDN de mettre la session en cache.
        for (const [cle, valeur] of Object.entries(headers ?? {})) response.headers.set(cle, valeur);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const chemin = request.nextUrl.pathname;
  if (!data?.claims && !estRoutePublique(chemin)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (chemin !== "/") url.searchParams.set("retour", chemin);
    const redirection = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirection.cookies.set(cookie);
    for (const h of ["cache-control", "expires", "pragma"]) {
      const v = response.headers.get(h);
      if (v) redirection.headers.set(h, v);
    }
    return redirection;
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
