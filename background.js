importScripts("common.js", "sitecheck.js");

const STORAGE_KEY = "BOUNTYWATCH_PROGRAMS";
const SETTINGS_KEY = "BOUNTYWATCH_SETTINGS";
const MSG_DETECT = "BOUNTYWATCH_DETECT";
const MSG_SCAN_URLS = "BOUNTYWATCH_SCAN_URLS";
const MSG_SITE_VISIT = "BOUNTYWATCH_SITE_VISIT";
const MSG_GET_SITE_STATUS = "BOUNTYWATCH_GET_SITE_STATUS";

const MAX_LINKS_PER_SERP = 40;
const MAX_CONCURRENT = 3;
const FETCH_TIMEOUT = 20000;
const URL_COOLDOWN_MS = 300000;
const DOMAIN_COOLDOWN_MS = 8000;

async function getPrograms() {
  const data = await chrome.storage.local.get([STORAGE_KEY]);
  return Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
}

async function setPrograms(programs) {
  await chrome.storage.local.set({ [STORAGE_KEY]: programs });
}

// Serialize read-modify-write on storage so concurrent scans don't overwrite
// each other's additions.
let writeChain = Promise.resolve();

function addOrUpdateProgram(program) {
  const run = writeChain.then(() => doAddOrUpdateProgram(program));
  writeChain = run.catch(() => {});
  return run;
}

async function doAddOrUpdateProgram(program) {
  const url = normalizeUrl(program.url);
  if (!url) return;

  const programs = await getPrograms();
  const idx = programs.findIndex((p) => p.url === url);

  if (idx >= 0) {
    const existing = programs[idx];
    const title = program.title || existing.title || url;
    programs[idx] = { favicon: faviconUrl(url), title, url };
  } else {
    programs.push({
      favicon: faviconUrl(url),
      title: program.title || url,
      url
    });
  }

  await setPrograms(programs);
}

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch (_) {
    return "";
  }
}

function badgeText(count) {
  return count > 0 ? String(count) : "";
}

async function initBadge() {
  const programs = await getPrograms();
  await chrome.action.setBadgeBackgroundColor({ color: "#16a34a" });
  await chrome.action.setBadgeText({ text: badgeText(programs.length) });
}

async function getSettings() {
  const data = await chrome.storage.local.get([SETTINGS_KEY]);
  return {
    scanSearchResults: false,
    checkVisitedSites: true,
    ...(data[SETTINGS_KEY] || {})
  };
}

// Re-normalize stored URLs (fragments, tracking params, old Google favicon
// URLs) and drop duplicates that collapse to the same URL.
async function doCleanStoredPrograms() {
  const programs = await getPrograms();
  const seen = new Set();
  const cleaned = [];
  for (const p of programs) {
    const url = normalizeUrl(p.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    cleaned.push({ favicon: faviconUrl(url), title: p.title || url, url });
  }
  if (JSON.stringify(cleaned) !== JSON.stringify(programs)) {
    await setPrograms(cleaned);
  }
}

function cleanStoredPrograms() {
  const run = writeChain.then(doCleanStoredPrograms);
  writeChain = run.catch(() => {});
  return run;
}

chrome.runtime.onInstalled.addListener(() => {
  cleanStoredPrograms();
  initBadge();
  getDirectory().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  cleanStoredPrograms();
  initBadge();
  getDirectory().catch(() => {});
});

// Tab-specific badge: a check mark on sites whose company runs a program;
// other tabs fall back to the global tracked-program count.
async function setSiteBadge(tabId, result) {
  const found = !!(result && result.programs.length);
  await chrome.action.setBadgeText({ tabId, text: found ? "\u2713" : null });
  if (found) {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#16a34a" });
    await chrome.action.setTitle({
      tabId,
      title: `BountyRadar - ${result.domain} has a bug bounty / disclosure program`
    });
  } else {
    await chrome.action.setTitle({ tabId, title: "BountyRadar - tracked programs" });
  }
}

initBadge();
cleanStoredPrograms();

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === "local" && changes[STORAGE_KEY]) {
    const next = changes[STORAGE_KEY].newValue;
    await chrome.action.setBadgeBackgroundColor({ color: "#16a34a" });
    await chrome.action.setBadgeText({
      text: badgeText(Array.isArray(next) ? next.length : 0)
    });
  }
});

const queue = [];
let active = 0;
const recentUrlScans = new Map();
const recentDomainScans = new Map();

function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal })
    .catch((err) => {
      if (err && err.name === "AbortError") throw new Error("timeout");
      throw err;
    })
    .finally(() => clearTimeout(timer));
}

function pump() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift();
    active++;
    runScan(job)
      .catch(() => {})
      .finally(() => {
        active--;
        pump();
      });
  }
}

async function runScan(link) {
  const { title: serpTitle } = link;
  const url = normalizeUrl(link.url);
  if (!url) return;
  recentUrlScans.set(url, Date.now());

  const domain = getDomain(url);
  if (!domain) return;
  recentDomainScans.set(domain, Date.now());

  let res;
  try {
    res = await fetchWithTimeout(url, FETCH_TIMEOUT);
  } catch (_) {
    return;
  }

  if (!res.ok || !res.headers.get("content-type")?.includes("text/html")) {
    return;
  }

  let html;
  try {
    html = await res.text();
  } catch (_) {
    return;
  }

  const result = scanText(htmlToText(html), url);
  if (!result) return;

  const title = extractTitle(html) || serpTitle || domain;

  await addOrUpdateProgram({ url, title });
}

async function scanLinks(links) {
  const now = Date.now();
  let added = 0;
  const queueCopy = [];

  for (const link of links) {
    if (added >= MAX_LINKS_PER_SERP) break;
    const url = normalizeUrl(link.url);
    if (!url || !/^https?:/i.test(url)) continue;

    const lastUrl = recentUrlScans.get(url);
    if (lastUrl && now - lastUrl < URL_COOLDOWN_MS) continue;

    const domain = getDomain(url);
    const lastDomain = recentDomainScans.get(domain);
    if (lastDomain && now - lastDomain < DOMAIN_COOLDOWN_MS) continue;

    added++;
    queueCopy.push({ url, title: link.title });
  }

  for (const link of queueCopy) {
    const { url } = link;
    if (recentUrlScans.get(url)) continue;
    recentUrlScans.set(url, now);
    queue.push(link);
  }
  pump();

  return { added };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === MSG_DETECT && sender.tab) {
    (async () => {
      try {
        const url = normalizeUrl(sender.tab.url || "");
        const domain = getDomain(url);

        await addOrUpdateProgram({
          url,
          title: sender.tab.title || domain
        });

        sendResponse({ ok: true, stored: true });
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
    })();
    return true;
  }

  if (msg && msg.type === MSG_SITE_VISIT && sender.tab) {
    (async () => {
      const tabId = sender.tab.id;
      await setSiteBadge(tabId, null).catch(() => {});
      const { checkVisitedSites } = await getSettings();
      if (!checkVisitedSites) {
        sendResponse({ ok: true, disabled: true });
        return;
      }
      const result = await checkSite(sender.tab.url || "", { links: msg.links });
      await setSiteBadge(tabId, result).catch(() => {});
      sendResponse({ ok: true, result });
    })().catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  // From the popup's "This site" card.
  if (msg && msg.type === MSG_GET_SITE_STATUS) {
    (async () => {
      const result = await checkSite(msg.url || "", { force: !!msg.force });
      if (msg.tabId != null) await setSiteBadge(msg.tabId, result).catch(() => {});
      sendResponse({ ok: true, result });
    })().catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (msg && msg.type === MSG_SCAN_URLS && sender.tab) {
    (async () => {
      // Fetching search results hits third-party sites the user never
      // opened, so it only runs when explicitly enabled in the popup.
      const { scanSearchResults } = await getSettings();
      if (!scanSearchResults) {
        sendResponse({ ok: true, queued: 0, disabled: true });
        return;
      }
      const { added } = await scanLinks(msg.links || []);
      sendResponse({ ok: true, queued: added });
    })();
    return true;
  }

  return false;
});