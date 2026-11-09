import { describe, expect, it } from "vitest";
import { dateLog, exportNotionSchema, preparerImportNotion } from "./notion";

const contact = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  nom: `Prénom${id} Nom${id}`,
  prenom: `Prénom${id}`,
  role: "CEO",
  linkedin: `https://linkedin.com/in/${id}`,
  statut: "À contacter",
  signal: "Page Notion Publique",
  notes: null,
  requete: "kit presse",
  usageNotion: "Wiki interne",
  pageNotion: "https://acme.notion.site/Kit",
  entreprise: { nom: "Acme", angle: "Leur wiki est public", lot: "v6-apify" },
  ...extra,
});

const preparer = (contacts: unknown[], logs: unknown[] = []) =>
  preparerImportNotion(exportNotionSchema.parse({ version: 1, contacts, logs }));

describe("import Notion : règles de correspondance", () => {
  it("convertit un contact Page Notion Publique avec ses informations de liste", () => {
    const r = preparer([contact("alice")]);
    expect(r.prospects).toEqual([
      {
        linkedinUrl: "https://www.linkedin.com/in/alice",
        urlNormalisee: "linkedin.com/in/alice",
        publicIdentifier: "alice",
        prenom: "Prénomalice",
        nom: "Nomalice",
        poste: "CEO",
        entreprise: "Acme",
        listeOrigine: "Page Notion Publique",
        etape: "a_contacter",
        notes: "Angle d'approche : Leur wiki est public\n\nLot : v6-apify",
        details: { pageNotion: "https://acme.notion.site/Kit", requete: "kit presse", usageNotion: "Wiki interne" },
        lien: null,
      },
    ]);
  });

  it("ne garde pas les informations propres à Page Notion pour une autre liste", () => {
    const r = preparer([contact("lena", { signal: "LM" })]);
    expect(r.prospects[0]!.details).toEqual({});
    expect(r.prospects[0]!.listeOrigine).toBe("LM");
  });

  it("ignore À vérifier, Exclu, sans Signal, sans LinkedIn, statut inconnu et doublons", () => {
    const r = preparer([
      contact("anna", { statut: "À vérifier" }),
      contact("bert", { statut: "Exclu" }),
      contact("cleo", { signal: null }),
      contact("dora", { linkedin: "https://example.com/in/dora" }),
      contact("emil", { statut: "Statut bizarre" }),
      contact("fred"),
      contact("fred2", { linkedin: "https://www.linkedin.com/in/fred/" }),
    ]);
    expect(r.prospects.map((p) => p.urlNormalisee)).toEqual(["linkedin.com/in/fred"]);
    expect(r.ignores).toEqual({ aVerifier: 1, exclus: 1, sansSignal: 1, sansLinkedIn: 1, statutInconnu: 1, doublons: 1 });
  });

  it("traduit les statuts en étapes et en liens LinkedIn connus", () => {
    const r = preparer(
      [
        contact("inv", { statut: "Invitation en attente" }),
        contact("msg", { statut: "Contacté" }),
        contact("disc", { statut: "En discussion" }),
        contact("vide", { statut: null }),
      ],
      [
        { id: "l1", contactId: "inv", evenement: "Invitation envoyée", date: "2026-11-04" },
        { id: "l0", contactId: "inv", evenement: "Invitation envoyée", date: "2026-11-02" },
      ],
    );
    const par = Object.fromEntries(r.prospects.map((p) => [p.publicIdentifier, p]));
    expect(par.inv).toMatchObject({ etape: "invitation_envoyee", lien: { type: "invitation_envoyee", date: dateLog("2026-11-02") } });
    expect(par.msg).toMatchObject({ etape: "premier_message", lien: { type: "relation", date: null } });
    expect(par.disc).toMatchObject({ etape: "repondu", lien: { type: "relation", date: null } });
    expect(par.vide).toMatchObject({ etape: "a_contacter", lien: null });
  });

  it("transforme les logs en actions datées, seulement pour les contacts importés", () => {
    const r = preparer(
      [contact("anna", { statut: "Contacté" }), contact("xavi", { statut: "Exclu" })],
      [
        { id: "l1", contactId: "anna", evenement: "Invitation envoyée", date: "2026-10-29" },
        { id: "l2", contactId: "anna", evenement: "Message N°1 envoyé", date: "2026-11-03" },
        { id: "l3", contactId: "anna", evenement: "Message N°2 envoyé", date: "2026-11-05" },
        { id: "l4", contactId: "xavi", evenement: "Invitation envoyée", date: "2026-11-01" },
        { id: "l5", contactId: "anna", evenement: "Autre chose", date: "2026-11-01" },
      ],
    );
    expect(r.actions).toEqual([
      { logId: "l1", urlNormalisee: "linkedin.com/in/anna", type: "invitation", date: dateLog("2026-10-29") },
      { logId: "l2", urlNormalisee: "linkedin.com/in/anna", type: "message", date: dateLog("2026-11-03") },
      { logId: "l3", urlNormalisee: "linkedin.com/in/anna", type: "message", date: dateLog("2026-11-05") },
    ]);
  });

  it("date un log à midi heure de Paris", () => {
    expect(dateLog("2026-11-04").toISOString()).toBe("2026-11-04T11:00:00.000Z");
    expect(dateLog("2026-07-01").toISOString()).toBe("2026-07-01T10:00:00.000Z");
  });

  it("sépare prénom et nom quand le prénom manque", () => {
    const r = preparer([contact("zoe-l", { prenom: null, nom: "Victor Lugger" })]);
    expect(r.prospects[0]).toMatchObject({ prenom: "Victor", nom: "Lugger" });
  });

  it("refuse un export mal formé ou trop long", () => {
    expect(() => exportNotionSchema.parse({ version: 2, contacts: [], logs: [] })).toThrow();
    expect(() => exportNotionSchema.parse({ version: 1, contacts: [{ id: "" }], logs: [] })).toThrow();
    expect(() => exportNotionSchema.parse({ version: 1, contacts: [], logs: [{ id: "l", contactId: "c", evenement: "x", date: "04/11/2026" }] })).toThrow();
    expect(() => exportNotionSchema.parse({ version: 1, contacts: [contact("anna", { notes: "x".repeat(20_000) })], logs: [] })).toThrow();
  });

  it("borne les textes trop longs", () => {
    const r = preparer([contact("anna", { role: "r".repeat(1000), requete: "é".repeat(1500) })]);
    expect(r.prospects[0]!.poste).toHaveLength(300);
    expect(r.prospects[0]!.details.requete).toHaveLength(500);
  });
});
