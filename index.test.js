// The plugin as the user sees it (plan-plugins-nuevos §7), against the fake core: several lists,
// add, tick, edit, remove; kept on every change; 📤; the 21 languages; and two phones in one
// conversation going live, losing each other and meeting again.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FORMAT } from "./src/index.js";
import { HELLO, UPDATE, VERSION, decode, encode } from "./src/live.js";
import { List, bodyKey, metaKey } from "./src/model.js";
import { connect, fakeCore } from "./test/fake-core.js";

const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "module.json"), "utf8"));

const flush = async () => {
  for (let at = 0; at < 60; at += 1) await Promise.resolve();
};

/** One phone with the plugin open: `live` when opened from a conversation with it granted. */
async function phone(core, opening = { live: true }) {
  globalThis.ft = core.ft;
  const element = document.createElement("ft-list");
  document.body.append(element);
  await core.open(opening);
  await flush();
  return element;
}

const inside = (element) => element.shadowRoot;
const settle = async (...elements) => {
  await flush();
  for (const element of elements) await element.keeper.settled();
  await flush();
};
async function press(element, act, extra = "") {
  const button = inside(element).querySelector(`[data-act="${act}"]${extra}`);
  if (!button) throw new Error(`no button ${act}${extra}`);
  button.click();
  await settle(element);
}
async function fill(element, form, value) {
  const node = inside(element).querySelector(`form[data-form="${form}"]`);
  if (!node) throw new Error(`no form ${form}`);
  node.querySelector("input").value = value;
  node.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await settle(element);
}
const rows = (element) => [...inside(element).querySelectorAll("[data-item]")].map((row) => `${row.dataset.done === "true" ? "☑" : "☐"} ${row.querySelector(".text").textContent}`);
const statusOf = (element) => inside(element).querySelector("[data-status]")?.textContent ?? "";
const itemId = (element, text) => [...inside(element).querySelectorAll("[data-item]")].find((row) => row.querySelector(".text").textContent === text)?.dataset.item;

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("the manifest and the catalogue", () => {
  it("asks for live and to propose a text, nothing more, on core 1.1.0", () => {
    expect(manifest).toEqual({
      id: "com.flickertalk.list",
      name: "List",
      version: "1.0.0",
      minCoreVersion: "1.1.0",
      components: ["ft-list"],
      permissions: { live: true, send: "propose" },
      summary: expect.any(String),
    });
    expect(manifest.summary.length).toBeLessThanOrEqual(200);
    expect(FORMAT).toBe("ftlist");
  });
});

describe("one phone", () => {
  it("makes lists, adds, ticks, edits and removes items, and keeps them on every change", async () => {
    const core = fakeCore();
    const element = await phone(core, { live: false });
    expect(inside(element).textContent).toContain("No lists yet");
    await fill(element, "new", "Compra");
    expect(inside(element).querySelector("[data-name]").textContent).toBe("Compra");
    await fill(element, "add", "leche");
    await fill(element, "add", "pan");
    await fill(element, "add", "   ");
    expect(rows(element)).toEqual(["☐ leche", "☐ pan"]);
    const id = element.list.id;
    expect(List.parse(id, core.records.get(bodyKey(id))).entries().map((one) => one.text)).toEqual(["leche", "pan"]);

    await press(element, "toggle", `[data-id="${itemId(element, "leche")}"]`);
    expect(rows(element)).toEqual(["☐ pan", "☑ leche"]);
    expect(List.parse(id, core.records.get(bodyKey(id))).counts()).toEqual({ total: 2, done: 1 });

    await press(element, "edit", `[data-id="${itemId(element, "pan")}"]`);
    await fill(element, "edit", "pan integral");
    expect(rows(element)).toEqual(["☐ pan integral", "☑ leche"]);
    await press(element, "edit", `[data-id="${itemId(element, "leche")}"]`);
    await press(element, "remove");
    expect(rows(element)).toEqual(["☐ pan integral"]);
    expect(List.parse(id, core.records.get(bodyKey(id))).entries().map((one) => one.text)).toEqual(["pan integral"]);

    await press(element, "rename");
    await fill(element, "rename", "Súper");
    expect(inside(element).querySelector("[data-name]").textContent).toBe("Súper");

    await press(element, "back");
    await fill(element, "new", "Tareas");
    await press(element, "back");
    const names = [...inside(element).querySelectorAll("[data-act=open]")].map((one) => one.textContent);
    expect(names.join(" ")).toContain("Súper");
    expect(names.join(" ")).toContain("Tareas");
    expect(JSON.parse(core.records.get(metaKey(id)))).toMatchObject({ name: "Súper", total: 1, done: 0 });
  });

  it("asks inside the plugin before deleting a list, never with confirm()", async () => {
    const core = fakeCore();
    globalThis.confirm = vi.fn(() => true);
    const element = await phone(core, { live: false });
    await fill(element, "new", "Compra");
    await press(element, "back");
    await press(element, "delete");
    expect(inside(element).textContent).toContain("Delete “Compra” from this phone?");
    await press(element, "cancelDelete");
    expect(core.records.size).toBe(2);
    await press(element, "delete");
    await press(element, "confirmDelete");
    expect(core.records.size).toBe(0);
    expect(inside(element).textContent).toContain("No lists yet");
    expect(globalThis.confirm).not.toHaveBeenCalled();
    delete globalThis.confirm;
  });

  it("proposes the list as text in the chat, after keeping it", async () => {
    const core = fakeCore();
    const element = await phone(core, { live: false });
    await fill(element, "new", "Compra");
    await fill(element, "add", "leche");
    await fill(element, "add", "pan");
    await press(element, "toggle", `[data-id="${itemId(element, "pan")}"]`);
    await press(element, "send");
    expect(core.said).toEqual(["🛒 Compra\n☐ leche\n☑ pan"]);
  });

  it("says when the phone has no room left, and keeps the list on screen", async () => {
    const core = fakeCore({ quota: 700 });
    const element = await phone(core, { live: false });
    await fill(element, "new", "Compra");
    for (let at = 0; at < 12; at += 1) await fill(element, "add", `something long enough to fill the room ${at}`);
    expect(rows(element)).toHaveLength(12);
    expect(inside(element).querySelector("[data-warning]").textContent).toContain("No room left on this phone");
    core.quota = 1_000_000;
    await fill(element, "add", "fits now");
    expect(inside(element).querySelector("[data-warning]").textContent).toBe("");
  });

  it("speaks the phone's language, right to left in Arabic", async () => {
    const element = await phone(fakeCore({ lang: "es" }), { live: false });
    expect(inside(element).textContent).toContain("Todavía no hay listas");
    const arabic = await phone(fakeCore({ lang: "ar" }), { live: false });
    expect(arabic.getAttribute("dir")).toBe("rtl");
    expect(element.getAttribute("dir")).toBe("ltr");
  });

  it("offers live only from a conversation, and says so otherwise", async () => {
    const element = await phone(fakeCore(), { live: false });
    await fill(element, "new", "Compra");
    expect(inside(element).querySelector('[data-act="live"]')).toBeNull();
    expect(inside(element).textContent).toContain("To edit together, open List from a conversation");
    const inChat = await phone(fakeCore(), { live: true });
    await fill(inChat, "new", "Compra");
    expect(inside(inChat).querySelector('[data-act="live"]')).not.toBeNull();
    expect(inside(inChat).textContent).toContain("only while you both have this list open in this conversation");
  });

  it("never speaks on its own when opened, nor when a list that was never shared is entered", async () => {
    const core = fakeCore();
    const element = await phone(core);
    await fill(element, "new", "Compra");
    await fill(element, "add", "leche");
    await press(element, "back");
    await press(element, "open");
    expect(core.sent).toHaveLength(0);
  });
});

/** Two phones in one conversation, both with List open. */
async function twoPhones() {
  const coreA = fakeCore();
  const coreB = fakeCore();
  const link = connect(coreA, coreB);
  const a = await phone(coreA);
  const b = await phone(coreB);
  const idle = async () => {
    await link.idle();
    await settle(a, b);
  };
  return { coreA, coreB, link, a, b, idle };
}

describe("two phones", () => {
  it("go live: the other phone opens the list by itself, and each change reaches the other", async () => {
    const { coreB, a, b, idle } = await twoPhones();
    await fill(a, "new", "Compra");
    await fill(a, "add", "leche");
    await fill(a, "add", "pan");
    await press(a, "live");
    await idle();
    expect(b.list?.id).toBe(a.list.id);
    expect(inside(b).querySelector("[data-name]").textContent).toBe("Compra");
    expect(rows(b)).toEqual(["☐ leche", "☐ pan"]);
    expect(statusOf(a)).toContain("Live");
    expect(statusOf(b)).toContain("Live");

    await press(b, "toggle", `[data-id="${itemId(b, "leche")}"]`);
    await fill(a, "add", "huevos");
    await idle();
    expect(rows(a)).toEqual(["☐ pan", "☐ huevos", "☑ leche"]);
    expect(rows(b)).toEqual(rows(a));
    // Each phone keeps its copy.
    const kept = List.parse(b.list.id, coreB.records.get(bodyKey(b.list.id)));
    expect(kept.entries().map((one) => one.text)).toEqual(["pan", "huevos", "leche"]);
    expect(JSON.parse(coreB.records.get(metaKey(b.list.id)))).toMatchObject({ shared: true });
  });

  it("keep a tick on one and an edit on the other of the same item", async () => {
    const { a, b, link, idle } = await twoPhones();
    await fill(a, "new", "Compra");
    await fill(a, "add", "leche");
    await press(a, "live");
    await idle();
    link.down();
    await press(a, "toggle", `[data-id="${itemId(a, "leche")}"]`);
    await press(b, "edit", `[data-id="${itemId(b, "leche")}"]`);
    await fill(b, "edit", "leche de avena");
    await idle();
    link.up();
    await press(b, "live");
    await idle();
    expect(rows(a)).toEqual(["☑ leche de avena"]);
    expect(rows(b)).toEqual(["☑ leche de avena"]);
  });

  it("say so when the other phone does not answer in 8 seconds, without pretending", async () => {
    vi.useFakeTimers();
    const { coreB, a, idle } = await twoPhones();
    coreB.shut();
    await fill(a, "new", "Compra");
    await press(a, "live");
    await idle();
    expect(statusOf(a)).toContain("Waiting");
    await vi.advanceTimersByTimeAsync(8000);
    await settle(a);
    expect(statusOf(a)).toContain("doesn't have List open in this conversation");
    expect(statusOf(a)).toContain("may not have it, may not have allowed it, or may have it closed");
    expect(statusOf(a)).not.toContain("Live:");
  });

  it("say so when the other phone cannot be reached", async () => {
    const { a, link } = await twoPhones();
    link.down();
    await fill(a, "new", "Compra");
    await press(a, "live");
    expect(statusOf(a)).toContain("can't be reached");
    expect(statusOf(a)).toContain("Your changes stay on this phone");
  });

  it("keep what each did offline and join it when one goes live again", async () => {
    const { a, b, link, idle } = await twoPhones();
    await fill(a, "new", "Compra");
    await fill(a, "add", "leche");
    await press(a, "live");
    await idle();
    link.down();
    await fill(a, "add", "offline on a");
    await fill(b, "add", "offline on b");
    await idle();
    expect(statusOf(a)).toContain("can't be reached");
    expect(statusOf(b)).toContain("can't be reached");
    link.up();
    await press(a, "live");
    await idle();
    const all = ["☐ leche", "☐ offline on a", "☐ offline on b"];
    expect([...rows(a)].sort()).toEqual(all);
    expect([...rows(b)].sort()).toEqual(all);
    expect(rows(a)).toEqual(rows(b));
    expect(statusOf(a)).toContain("Live");
  });

  it("catch up by themselves when one closes the plugin and comes back to the shared list", async () => {
    const { coreB, a, b, idle } = await twoPhones();
    await fill(a, "new", "Compra");
    await press(a, "live");
    await idle();
    const id = a.list.id;
    await press(b, "close");
    await idle();
    expect(coreB.closed).toBe(1);
    expect(statusOf(a)).toContain("closed the list");
    await fill(a, "add", "while b was away");
    await idle();
    // B opens List again in the conversation and enters the list: it says hello on its own.
    document.body.removeChild(b);
    coreB.reload();
    const again = await phone(coreB);
    await press(again, "open", `[data-id="${id}"]`);
    await idle();
    expect(rows(again)).toEqual(["☐ while b was away"]);
    expect(statusOf(again)).toContain("Live");
    expect(statusOf(a)).toContain("Live");
  });

  it("offer to join when the other opens a list while this one is on another", async () => {
    const { a, b, idle } = await twoPhones();
    await fill(b, "new", "Mine");
    await fill(a, "new", "Compra");
    await fill(a, "add", "leche");
    await press(a, "live");
    await idle();
    expect(b.list.name).toBe("Mine");
    expect(inside(b).querySelector("[data-invite]").textContent).toContain("The other person opened “Compra”");
    await press(b, "join");
    await idle();
    expect(b.list.id).toBe(a.list.id);
    expect(rows(b)).toEqual(["☐ leche"]);
    expect(statusOf(b)).toContain("Live");
  });

  it("ignore a resumed hello for a list this phone never had", async () => {
    const coreB = fakeCore();
    const b = await phone(coreB);
    const hello = encode({ p: "ftlist", v: VERSION, k: HELLO, doc: "unknown", who: "w", app: "1.0.0", sv: "AA==", resume: true });
    await coreB.hear(hello);
    await settle(b);
    expect(b.list).toBeNull();
    expect(coreB.sent).toHaveLength(0);
    // Garbage and other formats do nothing either.
    await coreB.hear("garbage");
    await coreB.hear(encode({ p: "ftboard", v: 1, k: HELLO, doc: "x", who: "w", sv: "" }));
    await settle(b);
    expect(b.list).toBeNull();
    expect(coreB.sent).toHaveLength(0);
  });

  it("say to update when the other phone speaks a newer version, and apply nothing", async () => {
    const { coreB, a, b, idle } = await twoPhones();
    await fill(a, "new", "Compra");
    await press(a, "live");
    await idle();
    const before = rows(b);
    await coreB.hear(encode({ p: "ftlist", v: VERSION + 1, k: UPDATE, doc: a.list.id, who: a.list.who, app: "2.0.0", u: "AAA=" }));
    await settle(b);
    expect(statusOf(b)).toContain("newer List");
    expect(rows(b)).toEqual(before);
  });

  it("send only small messages, in parts when a list is big", async () => {
    const { a, b, link, idle } = await twoPhones();
    await fill(a, "new", "Big");
    for (let at = 0; at < 200; at += 1) a.list.add(`${"item ".repeat(50)}${at}`);
    await settle(a);
    await press(a, "live");
    await idle();
    expect(b.list.counts().total).toBe(200);
    for (const { data } of link.carried) expect(atob(data).length).toBeLessThanOrEqual(48 * 1024);
    expect(link.carried.some(({ data }) => decode(data, "ftlist").k === "part")).toBe(true);
  });
});
