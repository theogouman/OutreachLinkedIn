import { describe, expect, it } from "vitest";
import { estRoutePublique } from "./routes-publiques";

describe("estRoutePublique", () => {
  it("laisse passer la connexion, le worker, les webhooks et les fichiers PWA", () => {
    for (const c of ["/login", "/auth/callback", "/api/worker/tick", "/api/webhooks/unipile", "/manifest.webmanifest", "/sw.js"]) {
      expect(estRoutePublique(c), c).toBe(true);
    }
  });

  it("protège tout le reste", () => {
    for (const c of ["/", "/inbox", "/reglages", "/sw.js.map", "/manifest.webmanifest/x", "/login/x", "/api/autre"]) {
      expect(estRoutePublique(c), c).toBe(false);
    }
  });
});
