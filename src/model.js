// A list (plan-plugins-nuevos §7): a Yjs document with a map of items, each item its own map
// (`text`, `done`, `order`, `at`), so ticking an item on one phone and editing it on the other
// keep both; `order` is a fraction, so an item can always go between two; `at` is when it was
// added. The name and the schema live in the `info` map. Ticked items go down.

import * as Y from "yjs";
import { fromBase64, newWho, toBase64 } from "./live.js";

/**
 * Where the plugin keeps its lists: one meta record and one body record each, under the place they
 * belong to. A place is the conversation the plugin was opened in (`onOpen.chat`, core 1.3.0: an
 * opaque id of 43 `[A-Za-z0-9_-]`, this phone's own, never sent), or `local` when there is none
 * or it is malformed. A list is seen, opened and shared only from its own place, so a list shared
 * with one person is never offered, nor said hello to, in the conversation with another.
 * Longest key: 5 + 43 + 1 + 64 + 5 = 118 bytes, under the core's 128.
 */
export const PREFIX = "list/";
export const LOCAL_PLACE = "local";
const CHAT = /^[A-Za-z0-9_-]{43}$/;
export const placeOf = (chat) => (typeof chat === "string" && CHAT.test(chat) ? chat : LOCAL_PLACE);
export const metaKey = (place, id) => `${PREFIX}${place}/${id}/meta`;
export const bodyKey = (place, id) => `${PREFIX}${place}/${id}/body`;

/** The shape of the document. A list with a higher schema came from a newer plugin: read only. */
export const SCHEMA = 1;
export const MAX_NAME = 60;
export const MAX_TEXT = 300;
/** The origin of what this phone does. */
export const LOCAL = "local";

/** An id for a list or an item: time first, so ids sort as things were made. */
export function newId(now = Date.now()) {
  const random = Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, "0");
  return `${now.toString(36).padStart(9, "0")}${random}`;
}

/** An order between two others (either may be missing): a fraction, so there is always room. */
export function orderBetween(before, after) {
  if (before == null && after == null) return 1;
  if (after == null) return before + 1;
  if (before == null) return after - 1;
  return (before + after) / 2;
}

const clean = (text, limit) => String(text ?? "").replace(/\s+/g, " ").trim().slice(0, limit);

export class List {
  /**
   * A new list, or one whose document comes from elsewhere (`doc`): then nothing is written in
   * it, so a list received from the twin takes its name and schema from the twin.
   * `who`, `peer` and `shared` belong to this phone only and live in the meta record.
   */
  constructor({ id = newId(), name = "", doc = null, who = newWho(), peer = null, shared = false, updatedAt = Date.now() } = {}) {
    this.id = id;
    this.who = who;
    this.peer = peer;
    this.shared = shared;
    this.updatedAt = updatedAt;
    this.doc = doc ?? new Y.Doc();
    this.items = this.doc.getMap("items");
    this.info = this.doc.getMap("info");
    if (!doc) {
      this.doc.transact(() => {
        this.info.set("schema", SCHEMA);
        this.info.set("name", clean(name, MAX_NAME));
      }, LOCAL);
    }
    this.doc.on("update", () => {
      this.updatedAt = Date.now();
    });
  }

  /** A list this phone does not have yet, to be filled by the twin. */
  static received(id) {
    return new List({ id, doc: new Y.Doc() });
  }

  get name() {
    const name = this.info.get("name");
    return typeof name === "string" ? name : "";
  }

  get readOnly() {
    const schema = this.info.get("schema");
    return typeof schema === "number" && schema > SCHEMA;
  }

  /** Hears every change of the document: `origin` says whose it was. */
  onChange(listener) {
    const heard = (_, origin) => listener(origin);
    this.doc.on("update", heard);
    return () => this.doc.off("update", heard);
  }

  rename(name) {
    const value = clean(name, MAX_NAME);
    if (this.readOnly || !value) return false;
    if (value !== this.name) this.doc.transact(() => this.info.set("name", value), LOCAL);
    return true;
  }

  /** Adds an item at the end; returns its id, or null when there is nothing to add. */
  add(text, { now = Date.now() } = {}) {
    const value = clean(text, MAX_TEXT);
    if (this.readOnly || !value) return null;
    let last = null;
    for (const item of this.items.values()) {
      const order = item.get("order");
      if (typeof order === "number" && (last === null || order > last)) last = order;
    }
    const id = newId(now);
    this.doc.transact(() => {
      const item = new Y.Map();
      this.items.set(id, item);
      item.set("text", value);
      item.set("done", false);
      item.set("order", orderBetween(last, null));
      item.set("at", now);
    }, LOCAL);
    return id;
  }

  item(id) {
    const item = this.items.get(id);
    return item instanceof Y.Map ? item : null;
  }

  toggle(id) {
    const item = this.item(id);
    if (this.readOnly || !item) return false;
    this.doc.transact(() => item.set("done", !item.get("done")), LOCAL);
    return true;
  }

  edit(id, text) {
    const item = this.item(id);
    const value = clean(text, MAX_TEXT);
    if (this.readOnly || !item || !value) return false;
    if (value !== item.get("text")) this.doc.transact(() => item.set("text", value), LOCAL);
    return true;
  }

  remove(id) {
    if (this.readOnly || !this.item(id)) return false;
    this.doc.transact(() => this.items.delete(id), LOCAL);
    return true;
  }

  /** The items as plain objects: pending first, then ticked, each by order, then by time. */
  entries() {
    const all = [];
    for (const [id, item] of this.items.entries()) {
      if (!(item instanceof Y.Map)) continue;
      const text = item.get("text");
      if (typeof text !== "string") continue;
      const order = item.get("order");
      const at = item.get("at");
      all.push({ id, text, done: item.get("done") === true, order: typeof order === "number" ? order : 0, at: typeof at === "number" ? at : 0 });
    }
    return all.sort((a, b) => Number(a.done) - Number(b.done) || a.order - b.order || a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  counts() {
    const entries = this.entries();
    return { total: entries.length, done: entries.filter((one) => one.done).length };
  }

  /** The text 📤 puts in the composer: `🛒 name`, then `☐`/`☑` and each item. */
  summary(fallbackName = "") {
    const lines = [`🛒 ${this.name || fallbackName}`.trimEnd()];
    for (const one of this.entries()) lines.push(`${one.done ? "☑" : "☐"} ${one.text}`);
    return lines.join("\n");
  }

  /** The body record: the whole document as one Yjs update, in base64. */
  body() {
    return toBase64(Y.encodeStateAsUpdate(this.doc));
  }

  /** The meta record: what the list of lists shows, and this phone's side of the live session. */
  meta() {
    const { total, done } = this.counts();
    return JSON.stringify({ id: this.id, name: this.name, total, done, updatedAt: this.updatedAt, who: this.who, peer: this.peer, shared: this.shared });
  }

  /** A list read back from its records; null when the body is not one. */
  static parse(id, body, meta = null) {
    if (typeof body !== "string" || !body) return null;
    const doc = new Y.Doc();
    try {
      const update = fromBase64(body);
      Y.decodeUpdate(update);
      Y.applyUpdate(doc, update, "load");
    } catch {
      return null;
    }
    let read = {};
    try {
      read = (typeof meta === "string" && JSON.parse(meta)) || {};
    } catch {
      read = {};
    }
    return new List({
      id,
      doc,
      who: typeof read.who === "string" && read.who && read.who.length <= 64 ? read.who : newWho(),
      peer: typeof read.peer === "string" ? read.peer : null,
      shared: read.shared === true,
      updatedAt: typeof read.updatedAt === "number" ? read.updatedAt : Date.now(),
    });
  }
}
