const STORAGE_KEY = "BOUNTYWATCH_PROGRAMS";

const listEl = document.getElementById("program-list");
const emptyEl = document.getElementById("empty-state");
const countEl = document.getElementById("count-badge");
const clearBtn = document.getElementById("clear-btn");
const searchInput = document.getElementById("search-input");
const searchClear = document.getElementById("search-clear");
const scanSerpToggle = document.getElementById("scan-serp-toggle");
const checkSitesToggle = document.getElementById("check-sites-toggle");
const siteCard = document.getElementById("site-card");
const siteDomainEl = document.getElementById("site-domain");
const siteStatusEl = document.getElementById("site-status");
const siteProgramsEl = document.getElementById("site-programs");
const siteRecheck = document.getElementById("site-recheck");

const MSG_GET_SITE_STATUS = "BOUNTYWATCH_GET_SITE_STATUS";

const dorksBtn = document.getElementById("dorks-btn");
const dorksLabel = document.getElementById("dorks-label");
const dorkView = document.getElementById("dork-view");
const dorkListEl = document.getElementById("dork-list");
const dorkHintEl = document.getElementById("dork-hint");

const SETTINGS_KEY = "BOUNTYWATCH_SETTINGS";
const OPENED_DORKS_KEY = "BOUNTYWATCH_OPENED_DORKS";

let allPrograms = [];
let searchQuery = "";
let mode = "programs"; // "programs" | "dorks"
let openedDorks = new Set();

function matchesQuery(p, q) {
  if (!q) return true;
  return (
    (p.title || "").toLowerCase().includes(q) ||
    (p.url || "").toLowerCase().includes(q)
  );
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function render() {
  const inDorks = mode === "dorks";
  dorkView.classList.toggle("hidden", !inDorks);
  listEl.classList.toggle("hidden", inDorks);
  if (inDorks) {
    emptyEl.classList.add("hidden");
    countEl.classList.add("hidden");
    renderDorks();
    return;
  }

  listEl.innerHTML = "";
  const q = searchQuery.trim().toLowerCase();
  const filtered = allPrograms.filter((p) => matchesQuery(p, q));

  if (filtered.length === 0) {
    emptyEl.classList.remove("hidden");
    countEl.classList.add("hidden");
    if (q) {
      emptyEl.innerHTML = `<div class="empty-icon">🔍</div><p><strong>No results for "<em>${escapeHtml(
        searchQuery.trim()
      )}</em>"</strong></p><p>Try a different keyword or clear the search.</p>`;
    } else {
      emptyEl.innerHTML =
        '<div class="empty-icon">🎯</div><p><strong>No bug bounty programs tracked yet</strong></p><p>Browse pages containing keywords like <em>bounty</em>, <em>reward</em>, <em>monetary</em>, <em>eligible targets</em> and they\'ll be saved here.</p>';
    }
    return;
  }

  emptyEl.classList.add("hidden");
  countEl.classList.remove("hidden");
  countEl.textContent = `${filtered.length} program${filtered.length === 1 ? "" : "s"}`;

  for (const p of filtered) {
    const card = document.createElement("div");
    card.className = "card";

    const top = document.createElement("div");
    top.className = "top";

    const left = document.createElement("div");
    left.className = "left";

    // Chrome's local favicon cache: no network request per tracked site.
    const icon = document.createElement("img");
    icon.className = "favicon";
    icon.src = chrome.runtime.getURL(
      "/_favicon/?pageUrl=" + encodeURIComponent(p.url) + "&size=32"
    );
    icon.alt = "";
    icon.addEventListener("error", () => icon.classList.add("hidden"));

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = p.title || p.url;

    left.appendChild(icon);
    left.appendChild(title);

    top.appendChild(left);

    const url = document.createElement("a");
    url.className = "url";
    url.href = p.url;
    url.target = "_blank";
    url.rel = "noopener noreferrer";
    url.textContent = p.url;

    card.appendChild(top);
    card.appendChild(url);
    listEl.appendChild(card);
  }
}

function renderDorkHint() {
  dorkHintEl.textContent = "";
  if (scanSerpToggle.checked) {
    dorkHintEl.textContent =
      "Click a dork to open it in a background tab. Background scanning is on, so BountyRadar checks the results and adds any programs it finds.";
    return;
  }
  const enable = document.createElement("button");
  enable.textContent = "turn on background scanning";
  enable.addEventListener("click", () => {
    scanSerpToggle.checked = true;
    scanSerpToggle.dispatchEvent(new Event("change"));
  });
  dorkHintEl.append(
    "Click a dork to open it in a background tab. To have BountyRadar check the results for you, ",
    enable,
    "."
  );
}

function renderDorks() {
  renderDorkHint();
  dorkListEl.innerHTML = "";
  const q = searchQuery.trim().toLowerCase();
  let shown = 0;

  for (const group of DORK_GROUPS) {
    const dorks = group.dorks.filter((d) => !q || d.toLowerCase().includes(q));
    if (dorks.length === 0) continue;

    const heading = document.createElement("div");
    heading.className = "dork-group-title";
    heading.textContent = group.name;
    dorkListEl.appendChild(heading);

    for (const dork of dorks) {
      const row = document.createElement("button");
      row.className = "dork";
      row.title = "Open this Google search in a background tab";
      row.classList.toggle("opened", openedDorks.has(dork));

      const text = document.createElement("span");
      text.className = "dork-q";
      text.textContent = dork;

      const state = document.createElement("span");
      state.className = "dork-state";
      state.textContent = openedDorks.has(dork) ? "opened ✓" : "open ↗";

      row.append(text, state);
      row.addEventListener("click", () => openDork(dork, row, state));
      dorkListEl.appendChild(row);
      shown++;
    }
  }

  if (shown === 0) {
    const none = document.createElement("p");
    none.className = "dork-hint";
    none.textContent = `No dorks match "${searchQuery.trim()}".`;
    dorkListEl.appendChild(none);
  }
}

// One tab per click, never an automated loop: bulk queries get Google
// CAPTCHAs and break its terms of service.
async function openDork(dork, row, state) {
  await chrome.tabs.create({ url: dorkSearchUrl(dork), active: false });
  openedDorks.add(dork);
  row.classList.add("opened");
  state.textContent = "opened ✓";
  try {
    await chrome.storage.session.set({ [OPENED_DORKS_KEY]: [...openedDorks] });
  } catch (_) {}
}

async function loadOpenedDorks() {
  try {
    const data = await chrome.storage.session.get([OPENED_DORKS_KEY]);
    openedDorks = new Set(data[OPENED_DORKS_KEY] || []);
  } catch (_) {}
}

function setMode(next) {
  mode = next;
  const inDorks = mode === "dorks";
  dorksBtn.setAttribute("aria-pressed", String(inDorks));
  dorksLabel.textContent = inDorks ? "Programs" : "Dorks";
  searchInput.placeholder = inDorks ? "Search dorks..." : "Search programs...";
  searchInput.value = "";
  searchQuery = "";
  searchClear.classList.add("hidden");
  render();
}

dorksBtn.addEventListener("click", () =>
  setMode(mode === "dorks" ? "programs" : "dorks")
);

async function getCurrent() {
  const data = await chrome.storage.local.get([STORAGE_KEY]);
  return Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
}

async function load() {
  const programs = await getCurrent();
  allPrograms = programs;
  render();
}

searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value;
  searchClear.classList.toggle("hidden", searchQuery === "");
  render();
});

searchClear.addEventListener("click", () => {
  searchInput.value = "";
  searchClear.classList.add("hidden");
  searchQuery = "";
  render();
  searchInput.focus();
});

clearBtn.addEventListener("click", async () => {
  await chrome.storage.local.set({ [STORAGE_KEY]: [] });
  await load();
});

async function loadSettings() {
  const data = await chrome.storage.local.get([SETTINGS_KEY]);
  const settings = data[SETTINGS_KEY] || {};
  scanSerpToggle.checked = !!settings.scanSearchResults;
  checkSitesToggle.checked = settings.checkVisitedSites !== false;
}

async function saveSetting(key, value) {
  const data = await chrome.storage.local.get([SETTINGS_KEY]);
  await chrome.storage.local.set({
    [SETTINGS_KEY]: { ...(data[SETTINGS_KEY] || {}), [key]: value }
  });
}

scanSerpToggle.addEventListener("change", async () => {
  if (mode === "dorks") renderDorkHint();
  await saveSetting("scanSearchResults", scanSerpToggle.checked);
});

checkSitesToggle.addEventListener("change", () =>
  saveSetting("checkVisitedSites", checkSitesToggle.checked)
);

// ---------- "This site" card ----------

let activeTab = null;

function renderSiteResult(result) {
  siteProgramsEl.innerHTML = "";
  const found = !!(result && result.programs.length);
  siteCard.classList.toggle("found", found);

  if (!result) {
    siteStatusEl.textContent = "Couldn't check this site.";
    return;
  }
  siteDomainEl.textContent = result.domain;
  if (!found) {
    siteStatusEl.textContent =
      "No bug bounty or disclosure program found (directory, security.txt, security links, common paths).";
    return;
  }

  const anyBounty = result.programs.some((p) => p.bounty);
  siteStatusEl.textContent = anyBounty
    ? "✓ This company runs a bug bounty program"
    : "✓ This company has a vulnerability disclosure program";

  const allScope = [...new Set(result.programs.flatMap((p) => p.scope || []))];
  const withScope = result.programs.filter((p) => (p.scope || []).length);
  if (withScope.length > 1) {
    const bar = document.createElement("div");
    bar.className = "scope-all";
    bar.appendChild(
      copyButton(`Copy all in-scope (${allScope.length})`, () => allScope)
    );
    siteProgramsEl.appendChild(bar);
  }

  for (const p of result.programs) {
    const block = document.createElement("div");
    block.className = "site-program-block";

    const a = document.createElement("a");
    a.className = "site-program";
    a.href = p.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.title = p.url;

    const tag = document.createElement("span");
    tag.className = "tag" + (p.bounty ? " bounty" : "");
    tag.textContent = p.source;

    a.append(tag, p.title || p.url);
    block.appendChild(a);
    if ((p.scope || []).length) block.appendChild(scopeSection(p));
    siteProgramsEl.appendChild(block);
  }
}

const SCOPE_NOTES = {
  platform: "from the platform's scope list",
  directory: "from the program directory",
  page: "found on the program page - verify before testing"
};

// Collapsible in-scope list for one program, with a copy button.
function scopeSection(p) {
  const wrap = document.createElement("div");
  wrap.className = "scope";

  const head = document.createElement("div");
  head.className = "scope-head";

  const toggle = document.createElement("button");
  toggle.className = "link-btn scope-toggle";
  toggle.setAttribute("aria-expanded", "false");
  toggle.textContent = `In scope (${p.scope.length}) ▸`;

  const list = document.createElement("pre");
  list.className = "scope-list hidden";
  list.textContent = p.scope.join("\n");

  toggle.addEventListener("click", () => {
    const open = list.classList.toggle("hidden") === false;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = `In scope (${p.scope.length}) ${open ? "▾" : "▸"}`;
  });

  head.append(toggle, copyButton("Copy", () => p.scope));

  const note = document.createElement("div");
  note.className = "scope-note";
  note.textContent = SCOPE_NOTES[p.scopeSource] || "";

  wrap.append(head, note, list);
  return wrap;
}

// Copies one entry per line (ready for subfinder -dL, httpx -l, etc.).
function copyButton(label, getEntries) {
  const btn = document.createElement("button");
  btn.className = "copy-btn";
  btn.textContent = label;
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(getEntries().join("\n"));
      btn.textContent = "Copied!";
    } catch (_) {
      btn.textContent = "Copy failed";
    }
    setTimeout(() => (btn.textContent = label), 1500);
  });
  return btn;
}

async function checkActiveSite(force = false) {
  if (!activeTab) return;
  siteRecheck.disabled = true;
  siteCard.classList.remove("found");
  siteStatusEl.textContent = force ? "Rechecking…" : "Checking…";
  siteProgramsEl.innerHTML = "";
  try {
    const res = await chrome.runtime.sendMessage({
      type: MSG_GET_SITE_STATUS,
      url: activeTab.url,
      tabId: activeTab.id,
      force
    });
    renderSiteResult(res && res.ok ? res.result : null);
  } catch (_) {
    renderSiteResult(null);
  } finally {
    siteRecheck.disabled = false;
  }
}

async function loadActiveSite() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:/i.test(tab.url || "")) return;
  activeTab = tab;
  try {
    siteDomainEl.textContent = new URL(tab.url).hostname.replace(/^www\./, "");
  } catch (_) {}
  siteCard.classList.remove("hidden");
  checkActiveSite(false);
}

siteRecheck.addEventListener("click", () => checkActiveSite(true));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORAGE_KEY]) {
    load();
  }
});

loadSettings();
loadOpenedDorks();
loadActiveSite();
load();