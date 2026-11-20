import { describe, expect, it } from "vitest";
import { clientNonBranche } from "./fabrique";

describe("clientNonBranche (Unipile non branché)", () => {
  it("refuse chaque appel, sans rien envoyer à LinkedIn", async () => {
    const c = clientNonBranche();
    const appels = [
      c.envoyerMessage("chat", "Bonjour"),
      c.demarrerConversation("ACo1", "Bonjour"),
      c.inviter("ACo1", "note"),
      c.retirerInvitation("123"),
      c.lireProfil("jean"),
      c.lireConversation("chat"),
      c.lireListe("relations", 10),
      c.listerConversations(10),
      c.listerMessages("chat", 10),
    ];
    for (const r of await Promise.all(appels)) {
      expect(r).toEqual({ ok: false, erreur: { status: 503, type: "unipile_non_branche" } });
    }
  });
});
