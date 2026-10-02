// List's own texts: the 21 languages of the app, the same keys and holes in each, nothing empty,
// and the plugin's name never written into a text (it comes from the manifest, one place).
import { describe, expect, it } from "vitest";
import { LANGUAGES, makeT, problemsOf } from "../src/i18n.js";
import { STRINGS } from "../src/strings.js";

describe("List's catalogue", () => {
  it("speaks the 21 languages of the app, with the same keys and holes in each", () => {
    expect(Object.keys(STRINGS).sort()).toEqual([...LANGUAGES].sort());
    expect(Object.keys(STRINGS.en).length).toBeGreaterThan(20);
    expect(problemsOf(STRINGS)).toEqual([]);
  });

  it("takes the plugin's name from a hole, so renaming it is one change", () => {
    const t = makeT(STRINGS);
    expect(t("en", "silent", { app: "List" })).toContain("List");
    for (const lang of LANGUAGES) for (const text of Object.values(STRINGS[lang])) expect(text, lang).not.toMatch(/(?<![\p{L}\p{N}])List(?![\p{L}\p{N}])/u);
    expect(t("es", "empty")).toBe("Todavía no hay listas");
  });
});
