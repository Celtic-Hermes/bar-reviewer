// All of the app's icons, in one place. Simple outline icons I drew myself (no outside
// icon set, no files to download, so they work offline and no credit is needed).
//
// How they look: 24 x 24 grid, a 1.75 line, round line ends and corners, no fill, drawn in
// the current text color (currentColor), so they follow the app's colors in light and dark.
// Icons are decoration: they're hidden from screen readers, and the text next to them (or
// the button's aria-label, for an icon-only button) says what they mean.
//
// How to use them:
//   In index.html:  <span data-icon="home"></span> My notes   (filled in when the page loads;
//                   a space or text after it gets a little gap automatically)
//   In app.js:      icon("gavel")                      → an <svg> element to put on the page
//                   setIconLabel(button, "pen", "My notes")   → icon + text in an element
//   Size and spacing: the shared .icon / .icon-lead / .icon-lg rules in style.css.
// To add a new icon, see "Adding a new icon" in CLAUDE.md.

const ICON_PATHS = {
  // ----- The 8 subjects -----
  government: '<path d="M3.5 9.5 12 4l8.5 5.5z"/><path d="M6.5 12v5.5M10.2 12v5.5M13.8 12v5.5M17.5 12v5.5"/><path d="M4.5 20h15M5 17.5h14"/>',
  briefcase: '<rect x="3.5" y="7.5" width="17" height="12" rx="2"/><path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5M3.5 13h17M10.5 13v1.8h3V13"/>',
  document: '<path d="M7 3.5h7.5L19 8v11.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z"/><path d="M14.5 3.5V8H19M9 12.5h6M9 16h6"/>',
  percent: '<circle cx="12" cy="12" r="9"/><path d="M9 15l6-6"/><circle cx="9.3" cy="9.3" r="1.1"/><circle cx="14.7" cy="14.7" r="1.1"/>',
  storefront: '<path d="M3.5 9.5 5 4.5h14l1.5 5"/><path d="M3.5 9.5a2.83 2.83 0 0 0 5.67 0 2.83 2.83 0 0 0 5.66 0 2.83 2.83 0 0 0 5.67 0"/><path d="M5 12.3V20h14v-7.7M10 20v-4.5h4V20"/>',
  shield: '<path d="M12 3.5 19.5 6v5.5c0 4.5-3.2 7.6-7.5 9-4.3-1.4-7.5-4.5-7.5-9V6z"/>',
  gavel: '<path d="M12.5 3.8l7.7 7.7-3.6 3.6-7.7-7.7z"/><path d="M12.75 11.25 5 19"/><path d="M12.5 20.5h8"/>',
  scales: '<path d="M12 4v16M7 20h10M5 7.5h14"/><path d="M5 7.5l-2.5 6a2.5 2.5 0 0 0 5 0zM19 7.5l-2.5 6a2.5 2.5 0 0 0 5 0z"/>',

  // ----- Navigation and features -----
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
  book: '<path d="M12 6.5C10 5 7 4.6 3.5 5v13c3.5-.4 6.5.1 8.5 1.5 2-1.4 5-1.9 8.5-1.5V5C17 4.6 14 5 12 6.5z"/><path d="M12 6.5v13"/>',
  tag: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7a1 1 0 0 1 .7.3l7.6 7.6a1 1 0 0 1 0 1.4l-7.7 7.7a1 1 0 0 1-1.4 0L3.8 12.9a1 1 0 0 1-.3-.7z"/><circle cx="8" cy="8" r="1.3"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4.5v4.6h-4.6"/>',
  chart: '<path d="M4 20h16"/><rect x="5.5" y="12" width="3" height="8" rx="0.8"/><rect x="10.5" y="5.5" width="3" height="14.5" rx="0.8"/><rect x="15.5" y="9" width="3" height="11" rx="0.8"/>',
  pen: '<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z"/><path d="M14.5 6.5l3 3"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  gear: '<path d="M18.60 9.98 L21.03 10.24 L21.03 13.76 L18.60 14.02 L18.09 15.24 L19.63 17.14 L17.14 19.63 L15.24 18.09 L14.02 18.60 L13.76 21.03 L10.24 21.03 L9.98 18.60 L8.76 18.09 L6.86 19.63 L4.37 17.14 L5.91 15.24 L5.40 14.02 L2.97 13.76 L2.97 10.24 L5.40 9.98 L5.91 8.76 L4.37 6.86 L6.86 4.37 L8.76 5.91 L9.98 5.40 L10.24 2.97 L13.76 2.97 L14.02 5.40 L15.24 5.91 L17.14 4.37 L19.63 6.86 L18.09 8.76Z"/><circle cx="12" cy="12" r="2.8"/>',
  bookmark: '<path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4.2L6 20V5a1 1 0 0 1 1-1z"/>',
  magnifier: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  eye: '<path d="M2.5 12C4.8 7.8 8.2 5.8 12 5.8s7.2 2 9.5 6.2c-2.3 4.2-5.7 6.2-9.5 6.2S4.8 16.2 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  flame: '<path d="M12 3c1 3.5 5.5 6 5.5 10.5a5.5 5.5 0 0 1-11 0c0-2 1-3.5 2-4.5.3 1.5 1 2.3 2 2.5C10.3 8.5 10.8 5.5 12 3z"/>',
  "chevron-left": '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  "chevron-right": '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  flag: '<path d="M6 20.5v-16"/><path d="M6 4.5h11.5l-2.75 4.25 2.75 4.25H6"/>'
};

// Which icon goes with each subject (exact subject names, as in SUBJECTS in app.js).
// A subject that isn't listed (a future Miscellaneous one) simply has no icon yet.
const SUBJECT_ICONS = {
  "Political Law": "government",
  "Labor Law and Social Legislation": "briefcase",
  "Civil Law": "document",
  "Taxation Law": "percent",
  "Mercantile Law": "storefront",
  "Criminal Law": "shield",
  "Remedial Law": "gavel",
  "Legal and Judicial Ethics": "scales"
};

// An icon as an <svg> element, or null if there's no icon with that name.
function icon(name) {
  const paths = ICON_PATHS[name];
  if (!paths) { return null; }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.75");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.innerHTML = paths;  // our own fixed shapes above, never anything typed by her
  return svg;
}

// Put an icon, then some text, in an element (replacing what was inside it).
function setIconLabel(element, name, text) {
  element.textContent = "";
  const svg = icon(name);
  if (svg) {
    svg.classList.add("icon-lead");
    element.appendChild(svg);
  }
  element.appendChild(document.createTextNode(text));
}

// Fill every <span data-icon="name"></span> in the page with its icon. If text follows the
// icon, it gets a little gap. Run once when the page loads (and again for anything added later).
function hydrateIcons(root) {
  (root || document).querySelectorAll("[data-icon]").forEach(function (slot) {
    if (slot.firstChild) { return; }  // already done
    const svg = icon(slot.dataset.icon);
    if (!svg) { return; }
    const next = slot.nextSibling;
    if (next && next.nodeType === 3 && next.textContent.trim() !== "") {
      svg.classList.add("icon-lead");
      next.textContent = next.textContent.replace(/^\s+/, "");  // the gap comes from .icon-lead, not a space
    }
    slot.appendChild(svg);
  });
}
hydrateIcons();
