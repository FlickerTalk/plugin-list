// Icons are Ionicons (outline), never emoji. Those the app lends are drawn from `./icon/<name>.svg`;
// those it does not lend travel in the bundle as inline SVG, copied from the `ionicons` package. All
// of them are drawn through one function, `icon()`, so moving to `<ion-icon>` later is one change.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_ICONS, OWN_ICONS, icon } from "../src/icons.js";

/**
 * The icons the app serves to plugins: `ICONS` in `src-tauri/src/plugins.rs` of FlickerTalk/app,
 * branch `games-section`, commit c3df572.
 */
const SERVED_BY_APP = [
  "add-outline", "alarm-outline", "arrow-back-outline", "arrow-redo-outline", "arrow-undo-outline", "arrow-up-outline",
  "brush-outline", "calculator-outline", "chatbubble-outline", "checkmark-outline", "close-outline", "cloud-done-outline",
  "cloud-outline", "cloud-upload-outline", "color-palette-outline", "crop-outline", "document-text-outline", "download-outline",
  "ellipsis-horizontal-outline", "expand-outline", "eye-outline", "folder-open-outline", "folder-outline", "grid-outline",
  "hand-left-outline", "image-outline", "key-outline", "link-outline", "location-outline", "lock-closed-outline",
  "move-outline", "options-outline", "pause-outline", "pencil-outline", "play-outline", "refresh-outline",
  "remove-outline", "resize-outline", "save-outline", "search-outline", "send-outline", "square-outline",
  "text-outline", "time-outline", "trash-outline",
];

const source = readFileSync(join(import.meta.dirname, "..", "src", "index.js"), "utf8");
const used = [...new Set([...source.matchAll(/["']([a-z]+(?:-[a-z]+)*-outline)["']/g)].map((match) => match[1]))].sort();

describe("the icons", () => {
  it("that the plugin asks the app for are all served by the app", () => {
    for (const name of APP_ICONS) expect(SERVED_BY_APP, name).toContain(name);
  });

  it("of its own are the package's Ionicons byte for byte, safe, and not ones the app lends", () => {
    expect(Object.keys(OWN_ICONS).length).toBeGreaterThan(0);
    for (const [name, svg] of Object.entries(OWN_ICONS)) {
      expect(svg, name).toBe(readFileSync(join(import.meta.dirname, "..", "node_modules", "ionicons", "dist", "svg", `${name}.svg`), "utf8"));
      expect(svg, name).not.toMatch(/https:|<script|on[a-z]+=/i);
      expect(SERVED_BY_APP, name).not.toContain(name);
    }
  });

  it("cover every icon the view names, each either lent by the app or carried", () => {
    expect(used.length).toBeGreaterThan(5);
    for (const name of used) expect(APP_ICONS.includes(name) || name in OWN_ICONS, name).toBe(true);
    for (const name of ["sync-outline", "person-outline", "cloud-offline-outline", "alert-circle-outline", "download-outline"]) expect(used, name).toContain(name);
  });

  it("are drawn by one function: a mask for a lent one, inline SVG for a carried one, hidden unless labelled", () => {
    const lent = icon("trash-outline");
    expect(lent).toContain("./icon/trash-outline.svg");
    expect(lent).toContain('aria-hidden="true"');
    const carried = icon("sync-outline");
    expect(carried).toMatch(/^<svg /);
    expect(carried).toContain("currentColor");
    expect(carried).toContain('aria-hidden="true"');
    const labelled = icon("person-outline", { label: 'The "other" <one>' });
    expect(labelled).toContain('role="img"');
    expect(labelled).toContain('aria-label="The &quot;other&quot; &lt;one&gt;"');
    expect(labelled).not.toContain("aria-hidden");
    expect(() => icon("rocket-outline")).toThrow();
  });
});
