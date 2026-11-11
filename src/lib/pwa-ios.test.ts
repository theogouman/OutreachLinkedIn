import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APPAREILS_IOS, SPLASH_IOS } from "./pwa-ios";

const racine = join(__dirname, "..", "..");
const dimensionsPng = (fichier: string) => {
  const b = readFileSync(join(racine, "public", fichier));
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

describe("splash screens iOS", () => {
  it("fournit une image à la résolution physique exacte de chaque appareil", () => {
    APPAREILS_IOS.forEach(([l, h, d], i) => {
      expect(dimensionsPng(SPLASH_IOS[i]!.href)).toEqual([l * d, h * d]);
    });
  });

  it("garde le générateur synchronisé avec la liste des appareils", () => {
    const script = readFileSync(join(racine, "scripts/generer-splash-ios.mjs"), "utf8");
    for (const [l, h, d] of APPAREILS_IOS) expect(script).toContain(`[${l}, ${h}, ${d}]`);
  });

  it("fournit les icônes déclarées, aux bonnes tailles", () => {
    expect(dimensionsPng("/icons/apple-touch-icon.png")).toEqual([180, 180]);
    expect(dimensionsPng("/icons/icon-192.png")).toEqual([192, 192]);
    expect(dimensionsPng("/icons/icon-512.png")).toEqual([512, 512]);
    expect(dimensionsPng("/icons/icon-512-maskable.png")).toEqual([512, 512]);
  });
});
