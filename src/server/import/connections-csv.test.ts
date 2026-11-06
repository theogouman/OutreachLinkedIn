import { describe, expect, it } from "vitest";
import { ErreurImport, lireConnectionsCsv, lireDateLinkedIn, TAILLE_MAX_OCTETS } from "./connections-csv";

const ARCHIVE = `Notes:
"When exporting your connection data, you may notice that some of the email addresses are missing."

First Name,Last Name,URL,Email Address,Company,Position,Connected On
Jane,Doe,https://www.linkedin.com/in/jane-doe,jane@example.com,Acme,CEO,06 Nov 2026
"=HYPERLINK(""x"")",Evil,https://evil.com/in/x,,Evil,,01 Jan 2026
Bob,"Martin, Jr",https://www.linkedin.com/in/bob-martin/,,"Société ""A""",CTO,15 Feb 2025
Jane,Doe,https://www.linkedin.com/in/Jane-Doe/,,Acme,CEO,06 Nov 2026
`;

describe("lireConnectionsCsv", () => {
  it("saute les notes, lit l'en-tête et normalise les URL", () => {
    const r = lireConnectionsCsv(ARCHIVE);
    expect(r.relations).toEqual([
      { urlNormalisee: "linkedin.com/in/jane-doe", date: new Date("2026-11-06T00:00:00Z") },
      { urlNormalisee: "linkedin.com/in/bob-martin", date: new Date("2025-02-15T00:00:00Z") },
    ]);
    expect(r.lignesLues).toBe(4);
    expect(r.lignesRejetees).toBe(1);
  });

  it("ne conserve ni nom ni email", () => {
    const r = lireConnectionsCsv(ARCHIVE);
    expect(JSON.stringify(r)).not.toMatch(/jane@example.com|Acme|Jane/);
  });

  it("gère le BOM et les fins de ligne Windows", () => {
    const r = lireConnectionsCsv("﻿" + ARCHIVE.replace(/\n/g, "\r\n"));
    expect(r.relations).toHaveLength(2);
  });

  it("refuse un fichier qui n'est pas l'archive", () => {
    expect(() => lireConnectionsCsv("nom,prenom\na,b")).toThrow(ErreurImport);
  });

  it("refuse un fichier trop volumineux", () => {
    expect(() => lireConnectionsCsv("x".repeat(TAILLE_MAX_OCTETS + 1))).toThrow(/trop volumineux/);
  });
});

describe("lireDateLinkedIn", () => {
  it.each([
    ["06 Nov 2026", "2026-11-06T00:00:00.000Z"],
    ["1 Jan 2020", "2020-01-01T00:00:00.000Z"],
  ])("%s", (v, iso) => {
    expect(lireDateLinkedIn(v)?.toISOString()).toBe(iso);
  });
  it.each(["", "31 Feb 2026", "2026-11-06", "06 Foo 2026", undefined])("rejette %s", (v) => {
    expect(lireDateLinkedIn(v)).toBeNull();
  });
});
