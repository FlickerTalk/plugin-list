// Every icon of the interface is an Ionicon (outline), drawn through `icon()` and nowhere else, so
// moving to `<ion-icon>` later is a change in this file only. Emoji are not icons here; the only
// ones left are in the text the send button proposes to the chat (`List.summary`).
//
// - APP_ICONS: lent by the app, served as `./icon/<name>.svg` and painted with a CSS mask.
// - OWN_ICONS: not lent by the app, so carried in the bundle: copied byte for byte from the
//   `ionicons` package (8.1.0, MIT, © Ionic; a test compares them) and drawn as inline SVG in
//   `currentColor`.

export const APP_ICONS = ["add-outline","arrow-back-outline","checkmark-outline","close-outline","download-outline","pencil-outline","send-outline","trash-outline"];

export const OWN_ICONS = {
  "alert-circle-outline": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\" class=\"ionicon\"><path d=\"M448 256c0-106-86-192-192-192S64 150 64 256s86 192 192 192 192-86 192-192Z\" fill=\"none\" stroke=\"currentColor\" stroke-miterlimit=\"10\" stroke-width=\"32px\"/><path d=\"M250.26 166.05 256 288l5.73-121.95a5.74 5.74 0 0 0-5.79-6h0a5.74 5.74 0 0 0-5.68 6\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"32px\"/><path d=\"M256 367.91a20 20 0 1 1 20-20 20 20 0 0 1-20 20\"/></svg>",
  "cloud-offline-outline": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\" class=\"ionicon\"><path d=\"M93.72 183.25C49.49 198.05 16 233.1 16 288c0 66 54 112 120 112h184.37M467.82 377.74C485.24 363.3 496 341.61 496 312c0-59.82-53-85.76-96-88-8.89-89.54-71-144-144-144-26.16 0-48.79 6.93-67.6 18.14\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"32px\"/><path d=\"M448 448 64 64\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-miterlimit=\"10\" stroke-width=\"32px\"/></svg>",
  "person-outline": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\" class=\"ionicon\"><path d=\"M344 144c-3.92 52.87-44 96-88 96s-84.15-43.12-88-96c-4-55 35-96 88-96s92 42 88 96\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"32px\"/><path d=\"M256 304c-87 0-175.3 48-191.64 138.6C62.39 453.52 68.57 464 80 464h352c11.44 0 17.62-10.48 15.65-21.4C431.3 352 343 304 256 304Z\" fill=\"none\" stroke=\"currentColor\" stroke-miterlimit=\"10\" stroke-width=\"32px\"/></svg>",
  "sync-outline": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\" class=\"ionicon\"><path d=\"M434.67 285.59v-29.8c0-98.73-80.24-178.79-179.2-178.79a179 179 0 0 0-140.14 67.36m-38.53 82v29.8C76.8 355 157 435 256 435a180.45 180.45 0 0 0 140-66.92\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"32px\"/><path d=\"m32 256 44-44 46 44M480 256l-44 44-46-44\" fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"32px\"/></svg>",
};

const escape = (text) =>
  String(text).replace(/[&<>"']/g, (one) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[one]);

/**
 * An icon by its Ionicons name. Hidden from screen readers when it only goes with a text or sits
 * in a labelled button; with `label`, it is an image with that name.
 */
export function icon(name, { label, slot } = {}) {
  const a11y = (label ? `role="img" aria-label="${escape(label)}"` : `aria-hidden="true"`) + (slot ? ` slot="${slot}"` : "");
  if (APP_ICONS.includes(name)) return `<i class="i" data-icon="${name}" ${a11y} style="--i:url(./icon/${name}.svg)"></i>`;
  const svg = OWN_ICONS[name];
  if (!svg) throw new Error(`not an icon of this plugin: ${name}`);
  return svg.replace(/^<svg /, `<svg class="i svg" data-icon="${name}" ${a11y} fill="currentColor" `).replace(` class="ionicon"`, "");
}
