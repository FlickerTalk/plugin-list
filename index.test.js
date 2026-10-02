// The plugin as the user sees it (plan-plugins-nuevos §7), against the fake core: several lists,
// add, tick, edit, remove; kept on every change; 📤; the 21 languages; and two phones in one
// conversation going live, losing each other and meeting again.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FORMAT } from "./src/index.js";
import { HELLO, UPDATE, VERSION, decode, encode } from "./src/live.js";
import { LOCAL_PLACE, List, bodyKey, metaKey } from "./src/model.js";
import { connect, fakeCore } from "./test/fake-core.js";

/** What the core calls a conversation for this plugin on each phone: opaque, 43 characters. */
const CHAT_A = "a".repeat(42) + "1";
const CHAT_B = "b".repeat(42) + "2";
const CHAT_C = "c".repeat(42) + "3";

const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "module.json"), "utf8"));

const flush = async () => {
  for (let at = 0; at < 60; at += 1) await Promise.resolve();
};

/** One phone with the plugin open: `live` when opened from a conversation with it granted. */
async function phone(core, opening = { live: true, chat: CHAT_A }) {
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
  it("asks for live and to propose a text, nothing more, on core 1.3.0 (the one that says the chat)", () => {
    expect(manifest).toEqual({
      id: "com.flickertalk.list",
      name: "List",
      version: "1.0.0",
      minCoreVersion: "1.3.0",
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
    expect(List.parse(id, core.records.get(bodyKey(LOCAL_PLACE, id))).entries().map((one) => one.text)).toEqual(["leche", "pan"]);

    await press(element, "toggle", `[data-id="${itemId(element, "leche")}"]`);
    expect(rows(element)).toEqual(["☐ pan", "☑ leche"]);
    expect(List.parse(id, core.records.get(bodyKey(LOCAL_PLACE, id))).counts()).toEqual({ total: 2, done: 1 });

    await press(element, "edit", `[data-id="${itemId(element, "pan")}"]`);
    await fill(element, "edit", "pan integral");
    expect(rows(element)).toEqual(["☐ pan integral", "☑ leche"]);
    await press(element, "edit", `[data-id="${itemId(element, "leche")}"]`);
    await press(element, "remove");
    expect(rows(element)).toEqual(["☐ pan integral"]);
    expect(List.parse(id, core.records.get(bodyKey(LOCAL_PLACE, id))).entries().map((one) => one.text)).toEqual(["pan integral"]);

    await press(element, "rename");
    await fill(element, "rename", "Súper");
    expect(inside(element).querySelector("[data-name]").textContent).toBe("Súper");

    await press(element, "back");
    await fill(element, "new", "Tareas");
    await press(element, "back");
    const names = [...inside(element).querySelectorAll("[data-act=open]")].map((one) => one.textContent);
    expect(names.join(" ")).toContain("Súper");
    expect(names.join(" ")).toContain("Tareas");
    expect(JSON.parse(core.records.get(metaKey(LOCAL_PLACE, id)))).toMatchObject({ name: "Súper", total: 1, done: 0 });
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
    const element = await phone(core, { live: false, chat: CHAT_A });
    await fill(element, "new", "Compra");
    await fill(element, "add", "leche");
    await fill(element, "add", "pan");
    await press(element, "toggle", `[data-id="${itemId(element, "pan")}"]`);
    await press(element, "send");
    expect(core.said).toEqual(["🛒 Compra\n☐ leche\n☑ pan"]);
  });

  it("offers no 📤 outside a conversation, and sending there does nothing and keeps the list usable", async () => {
    const core = fakeCore();
    const element = await phone(core, { live: false });
    await fill(element, "new", "Compra");
    await fill(element, "add", "leche");
    expect(inside(element).querySelector('[data-act="send"]')).toBeNull();
    await element.sendList();
    await settle(element);
    expect(core.ft.say).not.toHaveBeenCalled();
    expect(element.list?.name).toBe("Compra");
    await fill(element, "add", "pan");
    expect(rows(element)).toEqual(["☐ leche", "☐ pan"]);
  });

  it("goes dark when the app says so, also where :host-context does not exist (WebKit)", async () => {
    const core = fakeCore();
    const element = await phone(core, { live: false, dark: true });
    expect(element.hasAttribute("dark")).toBe(true);
    await core.open({ live: false, dark: false });
    expect(element.hasAttribute("dark")).toBe(false);
    const css = [...inside(element).querySelectorAll("style")].map((one) => one.textContent).join("\n");
    expect(css).toContain(":host([dark])");
    expect(css).toContain("prefers-color-scheme: dark");
    expect(css).not.toContain(":host-context");
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
    const inChat = await phone(fakeCore(), { live: true, chat: CHAT_A });
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
  const a = await phone(coreA, { live: true, chat: CHAT_A });
  const b = await phone(coreB, { live: true, chat: CHAT_B });
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
    const kept = List.parse(b.list.id, coreB.records.get(bodyKey(CHAT_B, b.list.id)));
    expect(kept.entries().map((one) => one.text)).toEqual(["pan", "huevos", "leche"]);
    expect(JSON.parse(coreB.records.get(metaKey(CHAT_B, b.list.id)))).toMatchObject({ shared: true });
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
    const again = await phone(coreB, { live: true, chat: CHAT_B });
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

  it("take a hello that arrives twice in a row as one, in order", async () => {
    const { coreB, a, b, link, idle } = await twoPhones();
    await fill(a, "new", "Compra");
    await fill(a, "add", "leche");
    coreB.shut();
    await press(a, "live");
    const hello = link.carried.at(-1).data;
    coreB.listening = true;
    await Promise.all([coreB.hear(hello), coreB.hear(hello)]);
    await idle();
    expect(rows(b)).toEqual(["☐ leche"]);
    expect(statusOf(b)).toContain("Live");
    expect(statusOf(a)).toContain("Live");
    expect(link.carried.filter(({ data }) => decode(data, "ftlist").k === "bye")).toHaveLength(0);
    expect(inside(b).querySelector("[data-invite]").textContent).toBe("");
  });

  it("ignore a hello whose list id could not be a record key, and write nothing", async () => {
    const coreB = fakeCore();
    const b = await phone(coreB);
    for (const doc of ["a/b", "", "x".repeat(200), "has space", "nul\u0000"]) {
      await coreB.hear(encode({ p: "ftlist", v: VERSION, k: HELLO, doc, who: "w", app: "1.0.0", sv: "AA==", title: "Evil" }));
    }
    await settle(b);
    expect(b.list).toBeNull();
    expect(coreB.records.size).toBe(0);
    expect(coreB.ft.records.set).not.toHaveBeenCalled();
    expect(coreB.ft.records.get).not.toHaveBeenCalled();
    expect(coreB.sent).toHaveLength(0);
    expect(inside(b).textContent).not.toContain("Evil");
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

/** Every string inside what travelled, base64 unpacked as deep as it goes, as text. */
function unpacked(data, depth = 0) {
  const found = [String(data)];
  if (depth > 4 || typeof data !== "string") return found;
  let text;
  try {
    text = atob(data);
  } catch {
    return found;
  }
  found.push(text);
  try {
    const message = JSON.parse(new TextDecoder().decode(Uint8Array.from(text, (char) => char.charCodeAt(0))));
    for (const value of Object.values(message)) if (typeof value === "string") found.push(...unpacked(value, depth + 1));
  } catch {
    // Bytes, not JSON (a Yjs update): the text above is all there is.
  }
  return found;
}

describe("the conversation the plugin is opened in", () => {
  it("keeps the lists of each conversation apart, and apart from the phone's own", async () => {
    const core = fakeCore();
    const inB = await phone(core, { live: true, chat: CHAT_B });
    await fill(inB, "new", "With B");
    await fill(inB, "add", "for B only");
    const id = inB.list.id;
    expect([...core.records.keys()].sort()).toEqual([`list/${CHAT_B}/${id}/body`, `list/${CHAT_B}/${id}/meta`]);

    document.body.innerHTML = "";
    core.reload();
    const inC = await phone(core, { live: true, chat: CHAT_C });
    expect(inside(inC).textContent).toContain("No lists yet");
    await fill(inC, "new", "With C");
    await press(inC, "back");
    expect(inside(inC).textContent).not.toContain("With B");

    document.body.innerHTML = "";
    core.reload();
    const alone = await phone(core, { live: false });
    expect(inside(alone).textContent).toContain("No lists yet");
    expect(inside(alone).textContent).toContain("Lists made here stay on this phone");

    document.body.innerHTML = "";
    core.reload();
    const backInB = await phone(core, { live: true, chat: CHAT_B });
    const names = [...inside(backInB).querySelectorAll("[data-act=open]")].map((one) => one.textContent).join(" ");
    expect(names).toContain("With B");
    expect(names).not.toContain("With C");
    expect(inside(backInB).textContent).not.toContain("Lists made here stay on this phone");
  });

  it("answers nothing when someone else presents a shared list with its owner's id (the attack)", async () => {
    // A shared X with C; X lives on C's phone under C's chat with A.
    const coreA = fakeCore();
    const coreC = fakeCore();
    const link = connect(coreA, coreC);
    const a = await phone(coreA, { live: true, chat: CHAT_A });
    let c = await phone(coreC, { live: true, chat: CHAT_C });
    await fill(a, "new", "Secret");
    await fill(a, "add", "the code is 1234");
    await press(a, "live");
    await link.idle();
    await settle(a, c);
    const x = a.list.id;
    const whoA = a.list.who;
    expect(rows(c)).toEqual(["☐ the code is 1234"]);
    await press(a, "close");
    await press(c, "close");

    // C now has List open in the conversation with B. B, with a modified app, says A's resumed hello.
    document.body.innerHTML = "";
    coreC.reload();
    c = await phone(coreC, { live: true, chat: CHAT_B });
    const sentBefore = coreC.sent.length;
    const writesBefore = coreC.ft.records.set.mock.calls.length;
    await coreC.hear(encode({ p: "ftlist", v: VERSION, k: HELLO, doc: x, who: whoA, app: "1.0.0", sv: "AA==", resume: true }));
    await settle(c);
    expect(coreC.sent.length).toBe(sentBefore);
    expect(c.list).toBeNull();
    expect(coreC.ft.records.set.mock.calls.length).toBe(writesBefore);

    // An open hello for X there makes a new, empty list in that conversation, with nothing of C's.
    await coreC.hear(encode({ p: "ftlist", v: VERSION, k: HELLO, doc: x, who: whoA, app: "1.0.0", sv: "AA==", title: "Secret" }));
    await settle(c);
    expect(c.list.id).toBe(x);
    expect(c.list.entries()).toEqual([]);
    const said = coreC.sent.slice(sentBefore).flatMap((data) => unpacked(data)).join("\n");
    expect(said).not.toContain("the code is 1234");
    expect(coreC.records.get(bodyKey(CHAT_B, x)) ?? "").not.toContain(btoa("the code is 1234").slice(0, 8));
    // C's own copy, in the conversation with A, is untouched.
    const own = List.parse(x, coreC.records.get(bodyKey(CHAT_C, x)), coreC.records.get(metaKey(CHAT_C, x)));
    expect(own.entries().map((one) => one.text)).toEqual(["the code is 1234"]);
  });

  it("treats a malformed chat as no conversation: local lists, no live", async () => {
    for (const chat of ["short", `${CHAT_A}x`, `${CHAT_A.slice(1)}/`, 7]) {
      document.body.innerHTML = "";
      const core = fakeCore();
      const element = await phone(core, { live: true, chat });
      await fill(element, "new", "Here");
      expect([...core.records.keys()].every((key) => key.startsWith("list/local/"))).toBe(true);
      expect(inside(element).querySelector('[data-act="live"]')).toBeNull();
    }
  });

  it("never goes live without a conversation, even if the core says live, and ignores what arrives", async () => {
    const core = fakeCore();
    const element = await phone(core, { live: true });
    await fill(element, "new", "Mine");
    expect(inside(element).querySelector('[data-act="live"]')).toBeNull();
    expect(inside(element).textContent).toContain("To edit together, open List from a conversation");
    await press(element, "back");
    await core.hear(encode({ p: "ftlist", v: VERSION, k: HELLO, doc: "someone", who: "w", app: "1.0.0", sv: "AA==", title: "Theirs" }));
    await settle(element);
    expect(element.list).toBeNull();
    expect(core.sent).toHaveLength(0);
    expect(inside(element).textContent).not.toContain("Theirs");
  });

  it("never lets the chat id leave the phone: not live, not in the composer", async () => {
    const { coreA, coreB, a, b, link, idle } = await twoPhones();
    await fill(a, "new", "Compra");
    await fill(a, "add", "leche");
    await press(a, "live");
    await idle();
    await press(b, "toggle", `[data-id="${itemId(b, "leche")}"]`);
    await fill(b, "add", "pan");
    await idle();
    for (let at = 0; at < 120; at += 1) a.list.add(`${"long item ".repeat(40)}${at}`);
    await press(a, "live");
    await press(a, "live");
    await idle();
    await press(b, "send");
    expect(link.carried.some(({ data }) => decode(data, "ftlist").k === "part")).toBe(true);
    const everything = [...coreA.sent, ...coreB.sent].flatMap((data) => unpacked(data)).concat(coreA.said, coreB.said).join("\n");
    expect(coreB.said).toHaveLength(1);
    for (const chat of [CHAT_A, CHAT_B]) expect(everything).not.toContain(chat);
  });
});

describe("what the view paints", () => {
  const PICTOGRAPH = /\p{Extended_Pictographic}/u;
  const painted = (element) => inside(element).innerHTML.replace(/<style>[\s\S]*?<\/style>/g, "");

  it("has no emoji in any state or language, only icons, and the buttons keep their labels", async () => {
    for (const lang of ["en", "es", "ar", "ja"]) {
      document.body.innerHTML = "";
      const seen = [];
      const core = fakeCore({ lang });
      const element = await phone(core, { live: true, chat: CHAT_A });
      seen.push(painted(element));
      await fill(element, "new", "Compra");
      await fill(element, "add", "leche");
      await fill(element, "add", "pan");
      await press(element, "toggle", `[data-id="${itemId(element, "pan")}"]`);
      seen.push(painted(element));
      const live = inside(element).querySelector('[data-act="live"]');
      expect(live.getAttribute("aria-label")).toBeTruthy();
      expect(live.querySelector('[data-icon="sync-outline"]')).not.toBeNull();
      expect(inside(element).querySelector('[data-act="send"]').getAttribute("aria-label")).toBeTruthy();
      const icons = { waiting: "sync-outline", joined: "sync-outline", silent: "person-outline", unreachable: "cloud-offline-outline", left: "person-outline", outdated: "download-outline" };
      for (const [status, name] of Object.entries(icons)) {
        element.status = status;
        element.paintStatus();
        expect(inside(element).querySelector(`[data-status] [data-icon="${name}"]`), status).not.toBeNull();
        seen.push(painted(element));
      }
      element.keeper.full = true;
      element.paintWarning();
      expect(inside(element).querySelector('[data-warning] [data-icon="alert-circle-outline"]')).not.toBeNull();
      seen.push(painted(element));
      element.keeper.full = false;
      element.paintWarning();
      element.invite = { message: {}, name: "Compra" };
      element.paintInvite();
      expect(inside(element).querySelector('[data-invite] [data-icon="person-outline"]')).not.toBeNull();
      seen.push(painted(element));
      element.invite = null;
      element.paintInvite();
      await press(element, "edit", `[data-id="${itemId(element, "leche")}"]`);
      seen.push(painted(element));
      await press(element, "cancelEdit");
      await press(element, "rename");
      seen.push(painted(element));
      element.list.shared = true;
      await element.keeper.save(element.list);
      await press(element, "back");
      expect(inside(element).querySelector('[data-act="open"] [data-icon="sync-outline"]')).not.toBeNull();
      seen.push(painted(element));
      await press(element, "delete");
      seen.push(painted(element));

      document.body.innerHTML = "";
      const alone = await phone(fakeCore({ lang }), { live: false });
      seen.push(painted(alone));
      await fill(alone, "new", "Solo");
      seen.push(painted(alone));
      for (const html of seen) expect(html, lang).not.toMatch(PICTOGRAPH);
    }
  });
});
