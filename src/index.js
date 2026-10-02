// List for FlickerTalk (plan-plugins-nuevos §7): shopping or to-do lists kept on this phone; add,
// tick, edit, remove; ticked items go down. From a conversation, "Live" lets the two phones edit
// one list at once over the core's direct channel (`live.js`); what each does apart is kept here
// and joins the other's when both have the list open. Send puts the list in the composer as text.
// Nothing leaves this frame but what the user sends, and what live says to the same plugin on the
// other phone.

import { name as APP_NAME, version as APP_VERSION } from "../module.json";
import { dirOf, makeT } from "./i18n.js";
import { icon } from "./icons.js";
import { HELLO, Inbox, LiveSession, inOrder, isNewer } from "./live.js";
import { yjsReplica } from "./live-yjs.js";
import { LOCAL_PLACE, List, MAX_NAME, MAX_TEXT, placeOf } from "./model.js";
import { Keeper } from "./store.js";
import { STRINGS } from "./strings.js";

/** The `p` of every live message of this plugin. */
export const FORMAT = "ftlist";

const t = makeT(STRINGS);

const escape = (text) =>
  String(text).replace(/[&<>"']/g, (one) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[one]);

const STYLE = `
:host { display: block; font: 15px system-ui, sans-serif; color: #111; --paper: #fff; --line: #d8d8d8; --soft: #666; --accent: #e0562b; --done: #8a8a8a; }
@media (prefers-color-scheme: dark) { :host { color: #f4f4f4; --paper: #111; --line: #3a3a3a; --soft: #aaa; --done: #888; } }
:host([dark]) { color: #f4f4f4; --paper: #111; --line: #3a3a3a; --soft: #aaa; --done: #888; }
* { box-sizing: border-box; }
.bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 4px 0 8px; }
.grow { flex: 1; min-width: 0; }
h1 { font-size: 18px; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
button {
  appearance: none; border: 1px solid currentColor; background: transparent; color: inherit;
  border-radius: 10px; min-width: 44px; height: 44px; font: inherit; padding: 0 10px; cursor: pointer; opacity: .8;
}
button.on { opacity: 1; box-shadow: inset 0 0 0 2px currentColor; }
button.danger { color: var(--accent); }
button.plain { border: 0; }
.i { display: block; width: 22px; height: 22px; margin: auto; background: currentColor; -webkit-mask: var(--i) center/contain no-repeat; mask: var(--i) center/contain no-repeat; }
.i.svg { background: none; -webkit-mask: none; mask: none; fill: currentColor; }
.labelled { display: inline-flex; gap: 6px; align-items: center; }
.labelled .i { margin: 0; width: 20px; height: 20px; }
.line { display: flex; gap: 6px; align-items: flex-start; }
.line .i, .meta .i, .invite .i { flex: none; width: 18px; height: 18px; margin: 1px 0 0; }
.meta .i { display: inline-block; vertical-align: -3px; }
form { display: flex; gap: 6px; align-items: center; margin: 0; }
form.wide { flex: 1; }
input { flex: 1; min-width: 0; font: inherit; color: inherit; background: transparent; border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; height: 44px; }
ul { list-style: none; margin: 8px 0 0; padding: 0; }
li { display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--line); min-height: 52px; }
li .open { flex: 1; display: flex; flex-direction: column; align-items: flex-start; text-align: start; border: 0; border-radius: 0; height: auto; padding: 10px 4px; opacity: 1; }
.title { font-weight: 600; }
.meta { color: var(--soft); font-size: 13px; }
.check { min-width: 32px; width: 32px; height: 32px; padding: 0; border-radius: 8px; border-width: 2px; opacity: 1; flex: none; }
.check .i { width: 20px; height: 20px; }
.text { flex: 1; overflow-wrap: anywhere; padding: 8px 0; }
[data-done="true"] .text { text-decoration: line-through; color: var(--done); }
[data-done="true"] .check { color: var(--done); }
.status, .hint, .warn, .note { margin: 4px 0; }
.status:empty, .warn:empty, .note:empty { display: none; }
.hint, .note { color: var(--soft); font-size: 13px; }
.warn { color: var(--accent); }
.invite { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 8px; border: 1px solid var(--line); border-radius: 10px; margin: 4px 0; }
.invite:empty { display: none; }
.invite span { flex: 1; min-width: 60%; }
.confirm { flex-wrap: wrap; padding: 8px 0; }
.confirm span { flex: 1 1 100%; }
.empty { color: var(--soft); text-align: center; padding: 40px 0; }
`;

/** A line of text with its icon beside it; the icon is decoration, the text says it all. */
const line = (name, text) => (text ? `${icon(name)}<span>${escape(text)}</span>` : "");
const button = (act, label, name, extra = "") => `<button type="button" data-act="${act}" aria-label="${escape(label)}" ${extra}>${icon(name)}</button>`;

/** The plugin's view: the lists this phone keeps, or one list. */
class ListElement extends HTMLElement {
  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.lang = "en";
    this.mayLive = false;
    this.screen = "home";
    this.metas = [];
    this.list = null;
    this.session = null;
    this.status = "off";
    this.stops = [];
    this.editing = null;
    this.renaming = false;
    this.confirming = null;
    this.invite = null;
    this.pendingTitle = "";
    this.place = LOCAL_PLACE;
    this.keeper = null;
  }

  connectedCallback() {
    this.ft = globalThis.ft;
    this.inbox = new Inbox(FORMAT);
    this.root.innerHTML = `<style>${STYLE}</style><div class="view"></div>`;
    this.view = this.root.querySelector(".view");
    this.root.addEventListener("click", (event) => this.onClick(event));
    this.root.addEventListener("submit", (event) => this.onSubmit(event));
    this.root.addEventListener("keydown", (event) => this.onKey(event));
    this.ft.onOpen((opening) => this.onOpen(opening));
    // The frame does not wait for one message to be handled before handing the next.
    this.ft.live?.onMessage?.(inOrder((data) => this.onLive(data)));
    this.paint();
  }

  T(key, holes = {}) {
    return t(this.lang, key, { app: APP_NAME, ...holes });
  }

  number(value) {
    try {
      return new Intl.NumberFormat(this.lang).format(value);
    } catch {
      return String(value);
    }
  }

  // ---- What the app hands over ----

  async onOpen(opening) {
    this.lang = opening.lang || "en";
    // The lists of a conversation live under its id (`chat`, core 1.3.0), which never leaves this
    // phone; without one (opened from Settings, or malformed) they are this phone's own, never
    // live, even if the core said `live`.
    this.place = placeOf(opening.chat);
    this.keeper = new Keeper(this.ft.records, this.place);
    this.keeper.onFull(() => this.paintWarning());
    this.mayLive = Boolean(opening.live) && this.place !== LOCAL_PLACE;
    this.setAttribute("lang", this.lang);
    this.setAttribute("dir", dirOf(this.lang));
    // Dark when the app says so: `:host([dark])` works in WebKit too (`:host-context` does not).
    // The system's dark mode stays as a fallback in the stylesheet.
    if (opening.dark) this.setAttribute("dark", "");
    else this.removeAttribute("dark");
    this.metas = await this.keeper.index();
    this.paint();
  }

  // ---- Lists ----

  /** Puts a list on screen and keeps it on every change, from this phone or from the twin. */
  show(list, { title = "" } = {}) {
    this.list = list;
    this.screen = "list";
    this.status = "off";
    this.editing = null;
    this.renaming = false;
    this.invite = null;
    this.pendingTitle = typeof title === "string" ? title.slice(0, MAX_NAME) : "";
    this.stops.push(this.keeper.watch(list));
    this.stops.push(list.onChange(() => this.paintItems()));
    this.paint();
  }

  /** Opens a kept list; if it was shared and this is a conversation, says hello on its own. */
  async enter(id) {
    const list = await this.keeper.load(id);
    if (!list) return;
    this.show(list);
    if (this.mayLive && list.shared && list.peer && !list.readOnly) await this.startLive({ resume: true });
  }

  /** Leaves the list on screen: a bye if live, and everything written. */
  async leave() {
    if (this.session) {
      const session = this.session;
      this.session = null;
      await session.stop();
    }
    this.status = "off";
    for (const stop of this.stops.splice(0)) stop();
    await this.keeper?.settled();
    this.list = null;
    this.editing = null;
    this.renaming = false;
  }

  async home() {
    await this.leave();
    this.screen = "home";
    this.metas = await this.keeper.index();
    this.paint();
  }

  // ---- Live ----

  makeSession(list) {
    const session = new LiveSession({
      format: FORMAT,
      app: APP_VERSION,
      doc: list.id,
      who: list.who,
      peer: list.peer,
      replica: yjsReplica(list.doc),
      send: (data) => this.ft.live.send(data),
      onStatus: (status) => {
        if (this.session !== session) return;
        this.status = status;
        this.paintStatus();
      },
      onPeer: (who) => {
        list.peer = who;
        list.shared = true;
        if (list.name || list.items.size) this.keeper.save(list);
      },
    });
    return session;
  }

  async startLive({ resume = false } = {}) {
    if (!this.list) return;
    this.session ??= this.makeSession(this.list);
    this.paintStatus();
    await this.session.start({ resume, title: this.list.name });
  }

  async toggleLive() {
    if (this.session && (this.status === "joined" || this.status === "waiting")) {
      const session = this.session;
      this.session = null;
      this.status = "off";
      this.paintStatus();
      await session.stop();
      return;
    }
    await this.startLive({ resume: false });
  }

  /**
   * What the twin says: for the live list, or a hello for one that is not live here. Only lists of
   * this conversation exist here: a resumed hello for a list kept under another conversation is
   * unknown, and is not answered.
   */
  async onLive(data) {
    if (!this.mayLive || !this.keeper) return;
    const message = this.inbox.take(data);
    if (!message) return;
    if (this.session && message.doc === this.session.doc) {
      await this.session.hear(message);
      return;
    }
    if (isNewer(message)) {
      if (this.list && this.list.id === message.doc) {
        this.status = "outdated";
        this.paintStatus();
      }
      return;
    }
    if (message.k !== HELLO || typeof message.sv !== "string") return;
    const here = this.list && this.list.id === message.doc ? this.list : null;
    const known = here ?? (await this.keeper.load(message.doc));
    // A resumed hello only reopens what this phone shared with that same person.
    if (message.resume && (!known || (known.peer && known.peer !== message.who))) return;
    if (known?.readOnly) return;
    if (this.screen === "list" && this.list && !here) {
      const title = typeof message.title === "string" ? message.title.slice(0, MAX_NAME) : "";
      this.invite = { message, name: known?.name || title || this.T("received") };
      this.paintInvite();
      return;
    }
    await this.join(message, known);
  }

  async join(message, known) {
    let list = known;
    if (!list || list !== this.list) {
      if (this.screen === "list") await this.leave();
      list = known ?? List.received(message.doc);
      this.show(list, { title: message.title });
    }
    this.session = this.makeSession(list);
    await this.session.hear(message);
  }

  // ---- Clicks and forms ----

  async onClick(event) {
    const target = event.target.closest("button[data-act]");
    if (!target) return;
    const { act, id } = target.dataset;
    switch (act) {
      case "close":
        await this.leave();
        return this.ft.close();
      case "back":
        return this.home();
      case "open":
        return this.enter(id);
      case "delete":
        this.confirming = id;
        return this.paint();
      case "cancelDelete":
        this.confirming = null;
        return this.paint();
      case "confirmDelete":
        this.confirming = null;
        await this.keeper.forget(id);
        this.metas = await this.keeper.index();
        return this.paint();
      case "toggle":
        this.list?.toggle(id);
        return;
      case "edit":
        this.editing = id;
        this.paintItems();
        return this.view.querySelector('form[data-form="edit"] input')?.focus?.();
      case "cancelEdit":
        this.editing = null;
        return this.paintItems();
      case "remove": {
        const editing = this.editing;
        this.editing = null;
        if (!this.list?.remove(editing)) this.paintItems();
        return;
      }
      case "rename":
        this.renaming = true;
        this.paintHeader();
        return this.view.querySelector('form[data-form="rename"] input')?.focus?.();
      case "live":
        return this.toggleLive();
      case "send":
        return this.sendList();
      case "join": {
        const invite = this.invite;
        this.invite = null;
        if (!invite) return;
        return this.join(invite.message, await this.keeper.load(invite.message.doc));
      }
      case "notNow":
        this.invite = null;
        return this.paintInvite();
      default:
    }
  }

  async onSubmit(event) {
    const form = event.target.closest("form[data-form]");
    if (!form) return;
    event.preventDefault();
    const input = form.querySelector("input");
    const value = input?.value ?? "";
    switch (form.dataset.form) {
      case "new": {
        const list = new List({ name: value });
        await this.keeper.save(list);
        return this.show(list);
      }
      case "add":
        if (this.list?.add(value)) {
          input.value = "";
          input.focus?.();
        }
        return;
      case "edit": {
        const editing = this.editing;
        this.editing = null;
        if (!this.list?.edit(editing, value)) this.paintItems();
        return;
      }
      case "rename":
        this.renaming = false;
        this.list?.rename(value);
        return this.paintHeader();
      default:
    }
  }

  onKey(event) {
    if (event.key !== "Escape") return;
    if (this.editing) {
      this.editing = null;
      this.paintItems();
    } else if (this.renaming) {
      this.renaming = false;
      this.paintHeader();
    }
  }

  /** Send: the list as text in the composer. The app closes the plugin, so leave cleanly first. */
  async sendList() {
    // Outside a conversation there is no composer: `say` would do nothing and the list would be gone.
    if (!this.list || this.place === LOCAL_PLACE) return;
    const text = this.list.summary(this.T("untitled"));
    await this.leave();
    this.ft.say(text);
  }

  // ---- Painting ----

  paint() {
    if (!this.view) return;
    this.view.innerHTML = this.screen === "list" && this.list ? this.listScreen() : this.homeScreen();
    if (this.screen === "list") {
      this.paintHeader();
      this.paintStatus();
      this.paintWarning();
      this.paintInvite();
      this.paintItems();
    }
  }

  homeScreen() {
    const T = (key, holes) => this.T(key, holes);
    const rows = this.metas
      .map((meta) => {
        const name = meta.name || T("untitled");
        if (this.confirming === meta.id) {
          return `<li class="confirm"><span>${escape(T("confirmDelete", { name }))}</span>
            <button type="button" class="danger" data-act="confirmDelete" data-id="${escape(meta.id)}">${escape(T("delete"))}</button>
            <button type="button" data-act="cancelDelete">${escape(T("cancel"))}</button></li>`;
        }
        const progress = T("progress", { done: this.number(meta.done ?? 0), total: this.number(meta.total ?? 0) });
        const shared = meta.shared ? ` · ${icon("sync-outline")} ${escape(T("shared"))}` : "";
        return `<li><button type="button" class="open" data-act="open" data-id="${escape(meta.id)}"><span class="title">${escape(name)}</span><span class="meta">${escape(progress)}${shared}</span></button>
          ${button("delete", T("delete"), "trash-outline", `data-id="${escape(meta.id)}"`)}</li>`;
      })
      .join("");
    return `
      <div class="bar"><h1 class="grow">${escape(T("title"))}</h1>${button("close", T("close"), "close-outline")}</div>
      <form data-form="new"><input name="value" maxlength="${MAX_NAME}" autocomplete="off" placeholder="${escape(T("namePlaceholder"))}" aria-label="${escape(T("newList"))}"><button type="submit" aria-label="${escape(T("newList"))}">${icon("add-outline")}</button></form>
      ${this.place === LOCAL_PLACE ? `<p class="hint" data-hint>${escape(T("localHint"))}</p>` : ""}
      ${rows ? `<ul>${rows}</ul>` : `<p class="empty">${escape(T("empty"))}</p>`}`;
  }

  listScreen() {
    const T = (key) => this.T(key);
    const list = this.list;
    return `
      <div class="bar" data-header></div>
      <p class="status line" data-status aria-live="polite"></p>
      <p class="hint line" data-hint>${this.mayLive ? line("sync-outline", T("liveHint")) : escape(T("needsChat"))}</p>
      <p class="warn line" data-warning role="alert"></p>
      <p class="note line">${list.readOnly ? line("download-outline", T("readOnly")) : ""}</p>
      <div class="invite" data-invite></div>
      ${list.readOnly ? "" : `<form data-form="add"><input name="value" maxlength="${MAX_TEXT}" autocomplete="off" enterkeyhint="done" placeholder="${escape(T("addPlaceholder"))}" aria-label="${escape(T("addPlaceholder"))}"><button type="submit" aria-label="${escape(T("add"))}">${icon("add-outline")}</button></form>`}
      <ul data-items></ul>`;
  }

  paintHeader() {
    const header = this.view?.querySelector("[data-header]");
    if (!header || !this.list) return;
    const T = (key) => this.T(key);
    const list = this.list;
    const name = list.name || this.pendingTitle || T("untitled");
    const live = this.session && (this.status === "joined" || this.status === "waiting");
    const title = this.renaming
      ? `<form class="wide" data-form="rename"><input name="value" maxlength="${MAX_NAME}" autocomplete="off" value="${escape(list.name)}" aria-label="${escape(T("rename"))}"><button type="submit" aria-label="${escape(T("save"))}">${icon("checkmark-outline")}</button></form>`
      : `<h1 class="grow" data-name>${escape(name)}</h1>`;
    header.innerHTML = `
      ${button("back", T("back"), "arrow-back-outline")}
      ${title}
      ${!this.renaming && !list.readOnly ? button("rename", T("rename"), "pencil-outline") : ""}
      ${this.mayLive && !list.readOnly ? `<button type="button" data-act="live" class="${live ? "on" : ""}" aria-pressed="${live ? "true" : "false"}" aria-label="${escape(live ? T("stopLive") : T("live"))}"><span class="labelled">${icon("sync-outline")}${escape(T("live"))}</span></button>` : ""}
      ${this.place !== LOCAL_PLACE ? button("send", T("send"), "send-outline") : ""}
      ${button("close", T("close"), "close-outline")}`;
  }

  paintStatus() {
    this.paintHeader();
    const node = this.view?.querySelector("[data-status]");
    if (!node) return;
    const T = (key) => this.T(key);
    const shown = {
      waiting: ["sync-outline", T("waiting")],
      joined: ["sync-outline", T("joined")],
      silent: ["person-outline", `${T("silent")} ${T("kept")}`],
      unreachable: ["cloud-offline-outline", `${T("unreachable")} ${T("kept")}`],
      left: ["person-outline", `${T("left")} ${T("kept")}`],
      outdated: ["download-outline", T("outdated")],
    }[this.status];
    node.innerHTML = shown ? line(...shown) : "";
  }

  paintWarning() {
    const node = this.view?.querySelector("[data-warning]");
    if (node) node.innerHTML = this.keeper.full ? line("alert-circle-outline", this.T("full")) : "";
  }

  paintInvite() {
    const node = this.view?.querySelector("[data-invite]");
    if (!node) return;
    if (!this.invite) {
      node.innerHTML = "";
      return;
    }
    node.innerHTML = `${icon("person-outline")}<span>${escape(this.T("joinPrompt", { name: this.invite.name }))}</span>
      <button type="button" data-act="join">${escape(this.T("join"))}</button>
      <button type="button" data-act="notNow">${escape(this.T("notNow"))}</button>`;
  }

  paintItems() {
    const node = this.view?.querySelector("[data-items]");
    if (!node || !this.list) return;
    if (!this.renaming) {
      const name = this.view.querySelector("[data-name]");
      if (name) name.textContent = this.list.name || this.pendingTitle || this.T("untitled");
    }
    const entries = this.list.entries();
    if (this.editing && !entries.some((one) => one.id === this.editing)) this.editing = null;
    const typing = node.querySelector('form[data-form="edit"] input');
    const draft = typing && typing.closest("li")?.dataset.editing === this.editing ? { value: typing.value, focused: this.root.activeElement === typing } : null;
    const T = (key) => this.T(key);
    const readOnly = this.list.readOnly;
    node.innerHTML = entries
      .map((one) => {
        if (one.id === this.editing && !readOnly) {
          return `<li data-editing="${escape(one.id)}"><form class="wide" data-form="edit"><input name="value" maxlength="${MAX_TEXT}" autocomplete="off" value="${escape(one.text)}" aria-label="${escape(T("edit"))}"><button type="submit" aria-label="${escape(T("save"))}">${icon("checkmark-outline")}</button></form>
            ${button("remove", T("remove"), "trash-outline", 'class="danger"')}${button("cancelEdit", T("cancel"), "close-outline")}</li>`;
        }
        const check = `<button type="button" class="check" data-act="toggle" data-id="${escape(one.id)}" role="checkbox" aria-checked="${one.done}" aria-label="${escape(one.text)}" ${readOnly ? "disabled" : ""}>${one.done ? icon("checkmark-outline") : ""}</button>`;
        const edit = readOnly ? "" : button("edit", T("edit"), "pencil-outline", `class="plain" data-id="${escape(one.id)}"`);
        return `<li data-item="${escape(one.id)}" data-done="${one.done}">${check}<span class="text">${escape(one.text)}</span>${edit}</li>`;
      })
      .join("");
    if (draft) {
      const input = node.querySelector('form[data-form="edit"] input');
      if (input) {
        input.value = draft.value;
        if (draft.focused) input.focus?.();
      }
    }
  }
}

if (typeof customElements !== "undefined" && !customElements.get("ft-list")) customElements.define("ft-list", ListElement);
