import * as Y from "yjs";
import { fromBase64, newWho, toBase64 } from "./live.js";

// Lists are keyed by conversation, so one shared with one person never shows up in a chat with
// another. Longest key is 5 + 43 + 1 + 64 + 5 = 118 bytes, the core allows 128.
export const PREFIX = "list/";
export const LOCAL_PLACE = "local";
const CHAT = /^[A-Za-z0-9_-]{43}$/;
export const placeOf = (chat) => (typeof chat === "string" && CHAT.test(chat) ? chat : LOCAL_PLACE);
export const metaKey = (place, id) => `${PREFIX}${place}/${id}/meta`;
export const bodyKey = (place, id) => `${PREFIX}${place}/${id}/body`;

export const SCHEMA = 1;
export const MAX_NAME = 60;
export const MAX_TEXT = 300;
export const LOCAL = "local";

// Time first, so ids sort by creation.
export function newId(now = Date.now()) {
  const random = Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, "0");
  return `${now.toString(36).padStart(9, "0")}${random}`;
}

export function orderBetween(before, after) {
  if (before == null && after == null) return 1;
  if (after == null) return before + 1;
  if (before == null) return after - 1;
  return (before + after) / 2;
}

const clean = (text, limit) => String(text ?? "").replace(/\s+/g, " ").trim().slice(0, limit);

export class List {
  // A doc from elsewhere gets nothing written into it, so a list from the twin keeps the twin's name
  // and schema. who, peer and shared stay on this phone, in the meta record.
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

  summary(fallbackName = "") {
    const lines = [`🛒 ${this.name || fallbackName}`.trimEnd()];
    for (const one of this.entries()) lines.push(`${one.done ? "☑" : "☐"} ${one.text}`);
    return lines.join("\n");
  }

  body() {
    return toBase64(Y.encodeStateAsUpdate(this.doc));
  }

  meta() {
    const { total, done } = this.counts();
    return JSON.stringify({ id: this.id, name: this.name, total, done, updatedAt: this.updatedAt, who: this.who, peer: this.peer, shared: this.shared });
  }

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
