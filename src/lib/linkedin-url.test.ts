import { describe, expect, it } from "vitest";
import { identifiantVersProfil, normaliserUrlLinkedIn } from "./linkedin-url";

describe("normaliserUrlLinkedIn", () => {
  it.each([
    "https://www.linkedin.com/in/jane-doe",
    "https://www.linkedin.com/in/jane-doe/",
    "http://linkedin.com/in/Jane-Doe",
    "www.linkedin.com/in/jane-doe?utm_source=x#top",
    "https://fr.linkedin.com/in/jane-doe/details/experience/",
    "  https://m.linkedin.com/in/JANE-DOE  ",
  ])("%s → linkedin.com/in/jane-doe", (url) => {
    expect(normaliserUrlLinkedIn(url)).toEqual({ urlNormalisee: "linkedin.com/in/jane-doe", publicIdentifier: "jane-doe" });
  });

  it("décode les identifiants accentués", () => {
    expect(normaliserUrlLinkedIn("https://www.linkedin.com/in/h%C3%A9l%C3%A8ne-martin")?.publicIdentifier).toBe("hélène-martin");
  });

  it.each([
    "",
    null,
    42,
    "https://www.linkedin.com/company/acme",
    "https://www.linkedin.com/sales/lead/ACwAA,NAME",
    "https://evil.com/in/jane-doe",
    "https://linkedin.com.evil.com/in/jane-doe",
    "javascript:alert(1)",
    "ftp://linkedin.com/in/jane-doe",
    "https://www.linkedin.com/in/",
    "https://www.linkedin.com/in/a",
    "https://www.linkedin.com/in/%E0%A4%A",
    "https://www.linkedin.com/in/jane<script>",
    "=HYPERLINK(\"https://evil.com\")",
  ])("rejette %s", (url) => {
    expect(normaliserUrlLinkedIn(url)).toBeNull();
  });
});

describe("identifiantVersProfil", () => {
  it("construit la forme normalisée", () => {
    expect(identifiantVersProfil("John-Smith-123")?.urlNormalisee).toBe("linkedin.com/in/john-smith-123");
    expect(identifiantVersProfil("../etc")).toBeNull();
  });
});
