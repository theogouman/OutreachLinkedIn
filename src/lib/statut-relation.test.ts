import { describe, expect, it } from "vitest";
import { calculerStatutRelation } from "./statut-relation";

describe("calculerStatutRelation", () => {
  it.each([
    [[], "a_inviter"],
    [["invitation_recue"], "invitation_recue"],
    [["invitation_envoyee"], "en_attente"],
    [["relation"], "en_relation"],
    [["invitation_envoyee", "relation"], "en_relation"],
    [["invitation_recue", "invitation_envoyee"], "en_attente"],
  ] as const)("%o → %s", (liens, attendu) => {
    expect(calculerStatutRelation(liens)).toBe(attendu);
  });
});
