// A list as a document (plan-plugins-nuevos §7): items in a Yjs map of maps, so ticking and
// editing the same item on two phones do not step on each other; ticked items go down; a
// fractional order; the text that 📤 proposes; and the records it is kept in.
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { List, LOCAL_PLACE, MAX_NAME, MAX_TEXT, PREFIX, SCHEMA, bodyKey, metaKey, newId, orderBetween, placeOf } from "../src/model.js";
import { ID } from "../src/live.js";

/** Two phones' copies of one list, exchanging everything both ways. */
const exchange = (a, b) => {
  const fromA = Y.encodeStateAsUpdate(a.doc, Y.encodeStateVector(b.doc));
  const fromB = Y.encodeStateAsUpdate(b.doc, Y.encodeStateVector(a.doc));
  Y.applyUpdate(b.doc, fromA, "test");
  Y.applyUpdate(a.doc, fromB, "test");
};
const copyOf = (list) => List.parse(list.id, list.body());
const texts = (list) => list.entries().map((one) => `${one.done ? "☑" : "☐"} ${one.text}`);

describe("a list", () => {
  it("adds, ticks, edits and removes items, the ticked ones going down", () => {
    const list = new List({ name: "Compra" });
    expect(list.name).toBe("Compra");
    const milk = list.add("leche");
    const bread = list.add("  pan  ");
    const eggs = list.add("huevos");
    expect(list.add("   ")).toBeNull();
    expect(texts(list)).toEqual(["☐ leche", "☐ pan", "☐ huevos"]);
    expect(list.toggle(bread)).toBe(true);
    expect(texts(list)).toEqual(["☐ leche", "☐ huevos", "☑ pan"]);
    list.toggle(milk);
    expect(texts(list)).toEqual(["☐ huevos", "☑ leche", "☑ pan"]);
    // Unticked, it goes back to where it was.
    list.toggle(bread);
    expect(texts(list)).toEqual(["☐ pan", "☐ huevos", "☑ leche"]);
    expect(list.edit(eggs, "huevos camperos")).toBe(true);
    expect(list.edit(eggs, "  ")).toBe(false);
    expect(list.remove(milk)).toBe(true);
    expect(list.remove(milk)).toBe(false);
    expect(list.toggle("nobody")).toBe(false);
    expect(list.edit("nobody", "x")).toBe(false);
    expect(texts(list)).toEqual(["☐ pan", "☐ huevos camperos"]);
    expect(list.counts()).toEqual({ total: 2, done: 0 });
  });

  it("keeps each item as its own map with text, done, order and the time it was added", () => {
    const list = new List({ name: "x" });
    const id = list.add("leche", { now: 1234 });
    const item = list.doc.getMap("items").get(id);
    expect(item).toBeInstanceOf(Y.Map);
    expect(item.toJSON()).toEqual({ text: "leche", done: false, order: 1, at: 1234 });
    expect(list.entries()[0]).toEqual({ id, text: "leche", done: false, order: 1, at: 1234 });
    expect(list.doc.getMap("info").get("schema")).toBe(SCHEMA);
  });

  it("cuts a name and a text that are too long, and renames", () => {
    const list = new List({ name: "n".repeat(500) });
    expect(list.name).toHaveLength(MAX_NAME);
    const id = list.add("t".repeat(5000));
    expect(list.entries()[0].text).toHaveLength(MAX_TEXT);
    list.edit(id, "short");
    expect(list.rename("  Tareas  ")).toBe(true);
    expect(list.name).toBe("Tareas");
  });

  it("orders by fractions: between two, after the last, before the first", () => {
    expect(orderBetween(null, null)).toBe(1);
    expect(orderBetween(3, null)).toBe(4);
    expect(orderBetween(null, 3)).toBe(2);
    expect(orderBetween(1, 2)).toBe(1.5);
    expect(orderBetween(1, 1.5)).toBe(1.25);
    expect(newId(1000) < newId(2000)).toBe(true);
    expect(newId()).toMatch(/^[0-9a-z]{15}$/);
  });

  it("says what 📤 proposes: the name and every item, pending first", () => {
    const list = new List({ name: "Compra" });
    list.add("leche");
    const bread = list.add("pan");
    list.toggle(bread);
    expect(list.summary()).toBe("🛒 Compra\n☐ leche\n☑ pan");
    expect(new List({ name: "Vacía" }).summary()).toBe("🛒 Vacía");
    expect(new List({ name: "" }).summary("Untitled list")).toBe("🛒 Untitled list");
  });
});

describe("two copies edited apart", () => {
  it("keep both a tick on one and an edit on the other", () => {
    const one = new List({ name: "Compra" });
    const milk = one.add("leche");
    const two = copyOf(one);
    one.toggle(milk);
    two.edit(milk, "leche de avena");
    exchange(one, two);
    for (const list of [one, two]) expect(texts(list)).toEqual(["☑ leche de avena"]);
  });

  it("keep what each added, in the same order on both phones", () => {
    const one = new List({ name: "Compra" });
    one.add("leche");
    const two = copyOf(one);
    one.add("pan");
    two.add("huevos");
    two.rename("Súper");
    exchange(one, two);
    expect(texts(one)).toEqual(texts(two));
    expect(texts(one)).toHaveLength(3);
    expect(one.name).toBe("Súper");
  });

  it("agree on a removal against an edit: removed on both", () => {
    const one = new List({ name: "x" });
    const id = one.add("leche");
    const two = copyOf(one);
    one.remove(id);
    two.edit(id, "leche entera");
    exchange(one, two);
    expect(texts(one)).toEqual(texts(two));
    expect(texts(one)).toEqual([]);
  });
});

describe("a list from a newer version", () => {
  it("is read only", () => {
    const list = new List({ name: "x" });
    const id = list.add("leche");
    list.doc.getMap("info").set("schema", SCHEMA + 1);
    const later = copyOf(list);
    expect(later.readOnly).toBe(true);
    expect(later.add("pan")).toBeNull();
    expect(later.toggle(id)).toBe(false);
    expect(later.edit(id, "y")).toBe(false);
    expect(later.remove(id)).toBe(false);
    expect(later.rename("y")).toBe(false);
    expect(texts(later)).toEqual(["☐ leche"]);
  });
});

describe("where a list is kept", () => {
  it("is the conversation it was opened in, or this phone only when there is none or it is malformed", () => {
    const chat = "aZ09_-".repeat(7) + "x";
    expect(chat).toHaveLength(43);
    expect(placeOf(chat)).toBe(chat);
    expect(LOCAL_PLACE).toBe("local");
    for (const bad of [undefined, null, "", "local", chat.slice(1), `${chat}y`, `${chat.slice(1)}/`, `${chat.slice(1)} `, `${chat.slice(1)}.`, 42]) expect(placeOf(bad), String(bad)).toBe(LOCAL_PLACE);
  });

  it("fits the core's 128-byte keys even with the longest place and the longest id", () => {
    const place = "p".repeat(43);
    const id = "i".repeat(64);
    expect(ID.test(id)).toBe(true);
    for (const key of [metaKey(place, id), bodyKey(place, id)]) expect(new TextEncoder().encode(key).length).toBeLessThanOrEqual(128);
  });
});

describe("the records of a list", () => {
  it("are a meta with what the list of lists shows and a body with the Yjs snapshot", () => {
    const list = new List({ id: "abc", name: "Compra", who: "me", peer: "you", shared: true });
    list.add("leche");
    const chat = "C".repeat(43);
    expect(metaKey(chat, "abc")).toBe(`${PREFIX}${chat}/abc/meta`);
    expect(bodyKey(LOCAL_PLACE, "abc")).toBe(`${PREFIX}local/abc/body`);
    const meta = JSON.parse(list.meta());
    expect(meta).toMatchObject({ id: "abc", name: "Compra", total: 1, done: 0, who: "me", peer: "you", shared: true });
    expect(typeof meta.updatedAt).toBe("number");
    const back = List.parse("abc", list.body(), list.meta());
    expect(texts(back)).toEqual(["☐ leche"]);
    expect(back).toMatchObject({ who: "me", peer: "you", shared: true, name: "Compra" });
  });

  it("are refused when broken, and a broken meta does not lose the body", () => {
    expect(List.parse("x", "%%%")).toBeNull();
    expect(List.parse("x", null)).toBeNull();
    const list = new List({ id: "x", name: "Compra" });
    list.add("leche");
    const back = List.parse("x", list.body(), "{broken");
    expect(texts(back)).toEqual(["☐ leche"]);
    expect(back.who).toMatch(/^[0-9a-f]{32}$/);
    expect(back.shared).toBe(false);
  });
});
