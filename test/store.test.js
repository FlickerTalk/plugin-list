// Keeping lists in `ft.records` (plan-plugins-nuevos §7): on every change, because the plugin is
// never told it is being closed; one save after another, never two at once; and a full quota
// says so without losing what is on screen.
import { describe, expect, it } from "vitest";
import { List, bodyKey, metaKey } from "../src/model.js";
import { Keeper } from "../src/store.js";
import { fakeCore } from "./fake-core.js";

const PLACE = "P".repeat(43);
const OTHER = "Q".repeat(43);
const kept = (core, id, place = PLACE) => List.parse(id, core.records.get(bodyKey(place, id)), core.records.get(metaKey(place, id)));
const texts = (list) => list.entries().map((one) => one.text);

describe("the keeper", () => {
  it("saves a list on every change, body and meta", async () => {
    const core = fakeCore();
    const keeper = new Keeper(core.ft.records, PLACE);
    const list = new List({ name: "Compra" });
    keeper.watch(list);
    list.add("leche");
    await keeper.settled();
    expect(texts(kept(core, list.id))).toEqual(["leche"]);
    expect(JSON.parse(core.records.get(metaKey(PLACE, list.id)))).toMatchObject({ name: "Compra", total: 1 });
    list.add("pan");
    await keeper.settled();
    expect(texts(kept(core, list.id))).toEqual(["leche", "pan"]);
    // Many changes at once: never two writes of one record at a time, and the last state kept.
    for (let at = 0; at < 10; at += 1) list.add(`item ${at}`);
    await keeper.settled();
    expect(kept(core, list.id).counts().total).toBe(12);
    expect(core.ft.records.set.mock.calls.length).toBeLessThan(2 * 12);
  });

  it("saves what came from the twin too, and stops when told to", async () => {
    const core = fakeCore();
    const keeper = new Keeper(core.ft.records, PLACE);
    const list = new List({ name: "x" });
    const stop = keeper.watch(list);
    const other = List.parse(list.id, list.body());
    other.add("from the other phone");
    list.doc.transact(() => {}, "noop");
    const { encodeStateAsUpdate, applyUpdate } = await import("yjs");
    applyUpdate(list.doc, encodeStateAsUpdate(other.doc), "live");
    await keeper.settled();
    expect(texts(kept(core, list.id))).toEqual(["from the other phone"]);
    stop();
    list.add("not saved");
    await keeper.settled();
    expect(texts(kept(core, list.id))).toEqual(["from the other phone"]);
  });

  it("says when the quota is full, keeps the list on screen, and recovers when there is room", async () => {
    const core = fakeCore({ quota: 600 });
    const keeper = new Keeper(core.ft.records, PLACE);
    const states = [];
    keeper.onFull((full) => states.push(full));
    const list = new List({ name: "Compra" });
    keeper.watch(list);
    list.add("leche");
    await keeper.settled();
    expect(keeper.full).toBe(false);
    for (let at = 0; at < 20; at += 1) list.add(`a long item to fill the quota number ${at}`);
    await keeper.settled();
    expect(keeper.full).toBe(true);
    expect(states).toEqual([true]);
    expect(list.counts().total).toBe(21);
    // What was kept before stays readable.
    expect(kept(core, list.id)).not.toBeNull();
    core.quota = 1_000_000;
    list.add("room again");
    await keeper.settled();
    expect(keeper.full).toBe(false);
    expect(states).toEqual([true, false]);
    expect(kept(core, list.id).counts().total).toBe(22);
  });

  it("treats a core that fails as full, not as saved", async () => {
    const core = fakeCore();
    core.ft.records.set = async () => {
      throw new Error("gone");
    };
    const keeper = new Keeper(core.ft.records, PLACE);
    expect(await keeper.save(new List({ name: "x" }))).toBe(false);
    expect(keeper.full).toBe(true);
  });

  it("lists what is kept, newest first, even when a meta is broken or missing", async () => {
    const core = fakeCore();
    const keeper = new Keeper(core.ft.records, PLACE);
    const old = new List({ id: "a", name: "Old", updatedAt: 1 });
    const recent = new List({ id: "b", name: "Recent" });
    await keeper.save(old);
    await keeper.save(recent);
    const orphan = new List({ id: "c", name: "Orphan" });
    orphan.add("x");
    core.records.set(bodyKey(PLACE, "c"), orphan.body());
    core.records.set(metaKey(PLACE, "d"), "{broken");
    core.records.set("something/else", "1");
    const index = await keeper.index();
    expect(index.map((one) => one.id)).toEqual(["c", "b", "a"]);
    expect(index.find((one) => one.id === "c")).toMatchObject({ name: "Orphan", total: 1 });
    expect((await keeper.load("b")).name).toBe("Recent");
    expect(await keeper.load("nothing")).toBeNull();
    await keeper.forget("b");
    expect(core.records.has(bodyKey(PLACE, "b"))).toBe(false);
    expect(core.records.has(metaKey(PLACE, "b"))).toBe(false);
  });

  it("lists, loads, saves and forgets only inside its own place", async () => {
    const core = fakeCore();
    const here = new Keeper(core.ft.records, PLACE);
    const there = new Keeper(core.ft.records, OTHER);
    const local = new Keeper(core.ft.records, "local");
    const mine = new List({ id: "same", name: "Here" });
    mine.add("secret");
    await here.save(mine);
    const theirs = new List({ id: "same", name: "There" });
    await there.save(theirs);
    await local.save(new List({ id: "solo", name: "Solo" }));
    expect((await here.index()).map((one) => one.name)).toEqual(["Here"]);
    expect((await there.index()).map((one) => one.name)).toEqual(["There"]);
    expect((await local.index()).map((one) => one.name)).toEqual(["Solo"]);
    expect((await there.load("same")).entries()).toEqual([]);
    expect(await there.load("solo")).toBeNull();
    expect(await local.load("same")).toBeNull();
    await there.forget("same");
    expect(texts(kept(core, "same"))).toEqual(["secret"]);
    expect([...core.records.keys()].sort()).toEqual([`list/${PLACE}/same/body`, `list/${PLACE}/same/meta`, "list/local/solo/body", "list/local/solo/meta"]);
  });
});
