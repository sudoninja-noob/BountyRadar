const STORAGE_KEY = "BOUNTYWATCH_PROGRAMS";

const listEl = document.getElementById("program-list");
const emptyEl = document.getElementById("empty-state");
const countEl = document.getElementById("count-badge");
const copyBtn = document.getElementById("copy-btn");
const copyLabel = document.getElementById("copy-label");
const chatgptBtn = document.getElementById("chatgpt-btn");
const chatgptLabel = document.getElementById("chatgpt-label");
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

function programsJson(programs) {
  return JSON.stringify(
    programs.map((p) => ({
      favicon: p.favicon || faviconUrl(p.url),
      title: p.title || p.url,
      url: p.url
    })),
    null,
    2
  );
}

function buildChatgptPrompt(programs) {
  return `Do not ask any questions and do not request confirmation or choices. Execute immediately, program by program, and produce the output as a code snippet.

For each program in the input list below, send a request ONLY to its "url" (output it as "program_url") - the exact bug bounty / security policy page. Do not visit the site homepage, subdomains, docs, or any other URL. The "program_url" page is the single source of truth and contains the latest, most accurate information, so everything below must be extracted exclusively from that page.

Give me output in a code snippet and JSON formatted like this: a single markdown code block that starts with \`\`\`json and ends with \`\`\`. Inside it, put ONE valid JSON array containing ALL programs. There must be nothing before and nothing after the code block - no text, no bullet points, no comments.

The JSON must be exactly:
[
  {
    "name": "...",
    "program_url": "...",
    "logo": "...",
    "platform": "...",
    "reward": "...",
    "inscope_domains": [...],
    "outofscope_domains": [...],
    "issues_reported": [],
    "scamhit": "",
    "last_updated": "YYYY-MM-DD"
  },
  ...
]

Fill every field with COMPLETE information from the official program page. Never leave a field empty if the page contains the information. Extraction rules:

- "reward": return a SINGLE min-max range string, format "$min - $max" or "€min - €max" (use the currency shown on the page). Find ALL monetary amounts stated ANYWHERE on the page, INCLUDING per-vulnerability-type / per-severity reward tables. For example, if a reward table lists XSS €100, CSRF €300, SQLi €1,000, RCE €2,000, the min is the smallest amount (100) and the max is the largest (2000), so it must become "€100 - €2,000". NEVER output "-" as long as the page contains any reward figure - "-" is only allowed when the page has no reward information at all. NEVER repeat severity names, vulnerability types, tiers, or semicolon lists. If a single fixed amount is stated, return just that amount (e.g. "$500", "€100", "£100", "₹1000").
- "inscope_domains": extract EVERY concrete URL, domain, subdomain, and wildcard explicitly covered by the program exactly as written on the page (for example: https://www.appbox.co, https://www.appbox.co/login, username.appboxes.co, *.appboxes.co). Do NOT replace real URLs or domains with vague descriptions like "Appbox proprietary code" or "production environment" - use the exact values the page shows. Only fall back to descriptive strings when the page gives no concrete URLs at all.
- "outofscope_domains": extract every concrete URL, domain, and subdomain explicitly excluded (for example billing.appbox.co, app.username.appboxes.co), plus any excluded generic categories written on the page.
- Read the ENTIRE page including every table and list - do not skim, summarize, or truncate. Every concrete URL and every monetary amount present on the page must appear in your output.
- "platform": say which bounty platform hosts the program (HackerOne, Bugcrowd, YesWeHack, Immunefi, Intigriti, SelfHosted, None).
- "scamhit": "yes" only if the program page indicates it may be a scam or asks for up-front payment; otherwise empty.
- "program_url": the exact page the program/policy is on.
- "logo": use a working image URL for the site or leave "". If none available, use https://<domain>/favicon.ico.
- "last_updated": today's date YYYY-MM-DD.
- "issues_reported": leave as an empty array [].

${programsJson(programs)}

## I want you to visit all of these websites and give me output like this in json format:
{
    "name": "Glia",
    "program_url": "https://www.glia.com/security-bounty",
    "logo": "https://cdn.prod.website-files.com/680f1550811d9719bdbcf21b/6835fd1ea895df4327eae39d_favicon%20(4).png",
    "platform": "SelfHosted",
    "reward": "$200 - $5,000",
    "inscope_domains": [
        "*.glia.com",
        "*.glia.eu",
        "*.salemove.com",
        "*.salemove.eu"
    ],
    "outofscope_domains": [],
    "issues_reported": [],
    "scamhit": "",
    "last_updated": "2025-09-27"
},
{
    "name": "Totalcoin",
    "program_url": "https://totalcoin.io/bug-bounty",
    "logo": "https://totalcoin.io/favicon.ico",
    "platform": "SelfHosted",
    "reward": "$200 - $30,000",
    "inscope_domains": [],
    "outofscope_domains": [
        "totalcoin.io"
    ],
    "issues_reported": [],
    "scamhit": "",
    "last_updated": "2025-09-27"
},
{
    "name": "Genetec",
    "program_url": "https://www.genetec.com/trust-cybersecurity/public-bug-bounty-program",
    "logo": "https://www.genetec.com/webfiles/latest/build/static/img/favicon-16x16.png",
    "platform": "SelfHosted",
    "reward": "$100 - $5000 CAD",
    "inscope_domains": [
        "*.clearance.network",
        "*.clearid.io",
        "*.genetec.cloud",
        "*.genetec.com",
        "login.genetec.com",
        "*.genetec.one",
        "*.geneteccloud.com",
        "*.q2c.eu",
        "*.autovu.com",
        "*.curbsense.com",
        "*.autovu.cloud"
    ],
    "outofscope_domains": [],
    "issues_reported": [],
    "scamhit": "",
    "last_updated": "2025-09-27"
}`;
}

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

copyBtn.addEventListener("click", async () => {
  const programs = await getCurrent();
  const resetLabel = (msg) => {
    copyLabel.textContent = msg;
    setTimeout(() => (copyLabel.textContent = "Copy"), 1500);
  };
  if (programs.length === 0) {
    resetLabel("Nothing to copy");
    return;
  }
  try {
    await navigator.clipboard.writeText(programsJson(programs));
    resetLabel("Copied!");
  } catch (_) {
    resetLabel("Copy failed");
  }
});

const PENDING_PROMPT_KEY = "BOUNTYWATCH_PENDING_PROMPT";
const MSG_SEND_TO_CHATGPT = "BOUNTYWATCH_SEND_TO_CHATGPT";

async function openChatgptWithPrompt(prompt) {
  await chrome.storage.local.set({ [PENDING_PROMPT_KEY]: prompt });

  const existing = await chrome.tabs.query({
    url: ["*://chatgpt.com/*", "*://chat.openai.com/*"]
  });
  const tab = existing[0];

  if (tab && tab.id != null) {
    await chrome.tabs.update(tab.id, { active: true });
    try {
      await chrome.tabs.sendMessage(tab.id, { type: MSG_SEND_TO_CHATGPT });
    } catch (_) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["chatgpt-inject.js"]
      });
      try {
        await chrome.tabs.sendMessage(tab.id, { type: MSG_SEND_TO_CHATGPT });
      } catch (_) {}
    }
  } else {
    await chrome.tabs.create({ url: "https://chatgpt.com/" });
  }
}

chatgptBtn.addEventListener("click", async () => {
  const resetLabel = (msg) => {
    chatgptLabel.textContent = msg;
    setTimeout(() => (chatgptLabel.textContent = "Chatgpt"), 1500);
  };
  const programs = await getCurrent();
  if (programs.length === 0) {
    resetLabel("Nothing to send");
    return;
  }
  try {
    await openChatgptWithPrompt(buildChatgptPrompt(programs));
    resetLabel("Opening ChatGPT…");
  } catch (_) {
    resetLabel("Failed");
  }
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