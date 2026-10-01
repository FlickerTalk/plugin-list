# plugin-list

**List** for [FlickerTalk](https://flickertalk.com): shopping or to-do lists kept on your phone,
which the two people of a conversation can edit at the same time.

## What it does

- **Several lists** on the phone. In a list: add an item, tick it, edit it, remove it. Ticked items
  go to the bottom; unticked, an item goes back to where it was.
- **🔄 Live**, from a conversation: the same list on both phones, each change on the other phone as
  it happens. The other phone opens the list by itself if List is open there; if it is on another
  list, it is offered "📥 The other person opened “Shopping” — Join".
- **The limit, said in the plugin**: changes join only while **both** have the list open in that
  conversation. If the other phone does not answer within about 8 seconds, List says
  "👤 The other person doesn't have List open in this conversation. They may not have it, may not
  have allowed it, or may have it closed." It cannot tell those apart, and it never claims that a
  change arrived when it did not.
- **Apart, then together**: what each one does with no connection, or with the list closed, is kept
  on each phone and joins the other's the next time both have the list open (a tick on one phone
  and an edit of the same item on the other keep both). Entering a list that was shared says hello
  on its own; nothing is said just by opening List, because a hello may wake the other phone.
- **📤** puts the list in the conversation's composer as text, for you to send:

  ```text
  🛒 Shopping
  ☐ milk
  ☑ bread
  ```

- **21 languages**, right to left in Arabic, dark mode.

Not in this version: reordering by dragging (so SortableJS is not used), quantities, categories,
reminders, templates, more than two people, assigning items.

## Privacy

A list you both edit; it is kept on each phone, and changes travel encrypted over the direct
connection, never stored on our server.

- List sees its own lists. It never sees the conversation, who the contact is, or anything else on
  the phone, and it has no network.
- Live messages go through the core's `ft.live`: only over the direct connection between the two
  phones, end-to-end encrypted like every message, never through the mailbox. If the connection is
  relayed by our TURN server, the server sees that there is traffic, never its content.
- Going live may wake the other phone with a push that carries no content.
- What 📤 puts in the composer and you send is a message like any other.

## What it uses of the core

| Capability   | What for                                                                      |
| ------------ | ----------------------------------------------------------------------------- |
| `ft.records` | each list in two records, `list/<id>/meta` and `list/<id>/body`, written on every change (`storage: small`, 4 MB) |
| `ft.live`    | live editing, 1 to 1, in messages of at most 48 KiB (bigger ones go in parts) |
| `ft.say`     | 📤 (`send: propose`: the text lands in the composer and you send it)          |
| `onOpen`     | `lang`, and `live` (true only from a conversation, with live allowed)         |

Permissions: `{ "live": true, "send": "propose" }`. Needs FlickerTalk core **1.1.0**
(`minCoreVersion`). The contract is in [plugin-sdk](https://github.com/FlickerTalk/plugin-sdk).

## How a list is kept

A [Yjs](https://github.com/yjs/yjs) document: `items` is a map of item id → map with `text`,
`done`, `order` (a fraction, so an item can always go between two) and `at` (when it was added);
`info` holds `name` and `schema`. A list with a higher `schema` than this plugin knows opens read
only. The body record is the whole document as one Yjs update in base64; the meta record is JSON
with the name, the counts, and this phone's side of the live session (`who`, `peer`, `shared`).

## The live protocol

Shared by List and by the FlickerTalk plugins that edit something between two phones. Each message
is an envelope, JSON → UTF-8 → base64:

```json
{ "p": "ftlist", "v": 1, "k": "hello", "doc": "<list id>", "who": "<participant id>", "app": "1.0.0" }
```

- `p` the format (anything else is ignored), `v` the protocol version, `k` the kind, `doc` the
  document, `who` a random id of the participant **per document**, `app` the plugin's version.
- `doc`, `who` and a part's `id` are 1 to 64 characters of `A-Z a-z 0-9 _ -`. What comes from the
  other phone is untrusted, and a document id becomes part of record keys: a message with any
  other id is dropped as garbage.
- Kinds: `hello` (carries `sv`, what this side has; waits about 8 s for an answer), `sync` (`u`,
  what the other lacks, and `sv` when it answers a hello), `update` (`u`, a change as it happens),
  `part` (`id`, `n`, `i`, `data`: a piece of a message that does not fit in 48 KiB), `bye`.
- Only a live session that the other side answered sends changes; what is done meanwhile goes in
  the next `hello`/`sync`. A hello that resumes a shared list (`resume: true`, without the name)
  is answered only by the participant it was shared with, and a phone never creates a list from it.
- A message with a higher `v` is not applied; the plugin says to update instead. Unknown fields
  and kinds are ignored, and so is anything that is not a message of this format.

The code is meant to be copied into other plugins as it is:

| File | What | Changes when copied |
| --- | --- | --- |
| `src/live.js`, `test/live.test.js` | envelope, parts, versions, `Inbox`, `LiveSession`, `inOrder` | nothing: the format `p` is a parameter |
| `src/live-yjs.js`, `test/live-yjs.test.js` | a Yjs document as the replica | nothing (only for plugins that use Yjs) |
| `src/i18n.js`, `test/i18n.test.js` | the 21 languages, holes, RTL, the catalogue check | nothing: the texts live apart |
| `test/fake-core.js` | the fake core, and two of them joined as two phones | nothing |

## Development

```sh
npm install
npm test          # Vitest + happy-dom: the protocol, the model, the records, the view, two phones
npm run build     # esbuild: src/ → dist/index.js, and THIRD_PARTY_NOTICES.md beside it
```

`dist/` is generated and **committed**: what the catalogue signs is `module.json` + `dist/`. Run
the build before the tests: they check that `dist/` stays under 400 KB, holds no web address and
nothing the plugin frame forbids, and runs. The CI checks too that `dist/` comes from `src/`, and
the licences of the dependencies.

## Licence

MIT. The bundle contains Yjs and lib0 (MIT); their licences are in `THIRD_PARTY_NOTICES.md`.
