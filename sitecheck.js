// Per-site program check: "does the company behind this site run a bug bounty
// / disclosure program?" Loaded into the service worker after common.js; uses
// fetchWithTimeout and addOrUpdateProgram from background.js at call time.

const DIRECTORY_KEY = "BOUNTYWATCH_DIRECTORY";
// Bump when the stored index / cached result shape changes to force a rebuild.
const DIRECTORY_VERSION = 2;
const SITE_RESULT_VERSION = 2;
const SCOPE_MAX = 300;
const SITE_CACHE_KEY = "BOUNTYWATCH_SITE_CACHE";
const DIRECTORY_TTL_MS = 7 * 24 * 3600 * 1000;
const SITE_FOUND_TTL_MS = 7 * 24 * 3600 * 1000;
const SITE_NONE_TTL_MS = 3 * 24 * 3600 * 1000;
const SITE_CACHE_MAX = 3000;
const SITE_FETCH_TIMEOUT = 10000;

const BOUNTY_TARGETS =
  "https://raw.githubusercontent.com/arkadiyt/bounty-targets-data/main/data/";
const DIRECTORY_SOURCES = [
  {
    url: "https://raw.githubusercontent.com/projectdiscovery/public-bugbounty-programs/main/dist/data.json",
    parse: parseChaos
  },
  { url: BOUNTY_TARGETS + "hackerone_data.json", parse: parseHackerOne },
  { url: BOUNTY_TARGETS + "bugcrowd_data.json", parse: parseBugcrowd },
  { url: BOUNTY_TARGETS + "intigriti_data.json", parse: parseIntigriti },
  { url: BOUNTY_TARGETS + "yeswehack_data.json", parse: parseYesWeHack }
];

// Hosts where a bounty platform (or security.txt) would point to a program.
const PLATFORM_HOSTS =
  /(^|\.)(hackerone\.com|bugcrowd\.com|intigriti\.com|yeswehack\.com|hackenproof\.com|immunefi\.com|federacy\.com|bugbounty\.jp|huntr\.com|synack\.com)$/i;

// Shared hosting / code / store domains that appear in many programs' scope
// lists but say nothing about who owns the site you're on.
const SHARED_DOMAINS = new Set([
  "github.com", "githubusercontent.com", "github.io", "gitlab.com", "bitbucket.org",
  "apple.com", "google.com", "microsoft.com", "amazon.com", "amazonaws.com",
  "cloudfront.net", "azure.com", "azurewebsites.net", "windows.net", "azureedge.net",
  "herokuapp.com", "vercel.app", "netlify.app", "pages.dev", "workers.dev",
  "firebaseapp.com", "web.app", "appspot.com", "npmjs.com", "pypi.org", "docker.com",
  "wordpress.org", "wordpress.com", "shopify.com", "myshopify.com", "zendesk.com",
  "salesforce.com", "force.com", "atlassian.net", "hackerone.com", "bugcrowd.com",
  "intigriti.com", "yeswehack.com", "example.com", "cloudflare.com", "chrome.google.com"
]);
// A scope-derived domain claimed by more programs than this is treated as shared.
const SHARED_DOMAIN_PROGRAM_LIMIT = 8;

const PROBE_PATHS = [
  "/security",
  "/bug-bounty",
  "/bugbounty",
  "/responsible-disclosure",
  "/vulnerability-disclosure",
  "/security/bug-bounty",
  "/whitehat"
];

// ---------- domains ----------

const SECOND_LEVEL_LABELS = new Set([
  "co", "com", "net", "org", "gov", "edu", "ac", "or", "ne", "go", "gob",
  "gouv", "nic", "mil", "ltd", "plc", "sch", "nhs", "int", "biz", "info",
  "nom", "res", "gen", "firm", "ind"
]);

// Approximates the registrable domain ("www.bbc.co.uk" -> "bbc.co.uk")
// without shipping the full Public Suffix List.
function registrableDomain(host) {
  host = String(host || "")
    .toLowerCase()
    .replace(/^\*\.?/, "")
    .replace(/\.$/, "");
  if (!host.includes(".") || /^\d+(\.\d+){3}$/.test(host) || host.includes(":")) {
    return "";
  }
  const parts = host.split(".");
  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];
  if (parts.length >= 3 && tld.length === 2 && SECOND_LEVEL_LABELS.has(sld)) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

const HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}$/i;

// Pull hostnames out of a scope target like "https://*.acme.com/api",
// "*.acme.com", "acme.com, acme.io" or "api.acme.com:443".
function hostsIn(target) {
  const out = [];
  for (let token of String(target || "").split(/[\s,;|]+/)) {
    token = token
      .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
      .replace(/^\*+\.?/, "")
      .replace(/^\(|\)$/g, "")
      .split(/[/:?#]/)[0]
      .toLowerCase();
    if (HOST_RE.test(token)) out.push(token);
  }
  return out;
}

// Like hostsIn, but keeps the wildcard marker: "https://*.acme.com/x" ->
// "*.acme.com", "https://api.acme.com/" -> "api.acme.com".
function scopeEntries(target) {
  const out = [];
  for (let token of String(target || "").split(/[\s,;|]+/)) {
    token = token.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/^\(|\)$/g, "");
    const wildcard = /^\*\.?/.test(token);
    const host = token.replace(/^\*+\.?/, "").split(/[/:?#]/)[0].toLowerCase();
    if (HOST_RE.test(host)) out.push(wildcard ? "*." + host : host);
  }
  return out;
}

// File extensions and similar that look like TLDs in page text ("Node.js").
const FAKE_TLDS = new Set([
  "js", "ts", "py", "rb", "go", "md", "txt", "html", "htm", "php", "asp",
  "aspx", "jsp", "json", "xml", "yml", "yaml", "css", "png", "jpg", "jpeg",
  "gif", "svg", "pdf", "zip", "exe", "dll", "sh", "java", "min"
]);
// Page text is free-form, so only accept country codes (2 letters) and the
// generic TLDs programs actually use; drops "Node.js", "response.glia", etc.
const TEXT_GTLDS = new Set(("com net org io co ai app dev cloud info biz xyz tech me tv gg sh " +
  "online site store shop live pro gov edu mil int finance bank money exchange network " +
  "systems services solutions digital global group company agency media news blog games " +
  "security health care capital fund inc ltd llc tools software page one art design jobs " +
  "travel club world space website email zone link click life today top vip win bet " +
  "casino poker crypto wallet trade markets insurance energy auto cars studio social " +
  "chat host hosting codes computer community consulting domains team works eu asia").split(" "));

const TEXT_HOST_RE = /(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}\b/gi;

// Hostnames / wildcards written in a program page's visible text. Noisy (it
// can include out-of-scope entries), so the popup labels it for review.
function domainsInText(text) {
  const out = new Set();
  for (const m of String(text || "").matchAll(TEXT_HOST_RE)) {
    const entry = m[0].toLowerCase();
    const tld = entry.slice(entry.lastIndexOf(".") + 1);
    if (FAKE_TLDS.has(tld) || /^(e\.g|i\.e)\./.test(entry)) continue;
    if (tld.length !== 2 && !TEXT_GTLDS.has(tld)) continue;
    out.add(entry);
    if (out.size >= SCOPE_MAX) break;
  }
  return [...out];
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch (_) {
    return "";
  }
}

// ---------- directory sources ----------

function parseChaos(data) {
  return (data.programs || []).map((p) => ({
    name: p.name,
    url: p.url,
    platform: "Directory",
    bounty: !!p.bounty,
    domains: p.domains || [],
    scope: p.domains || [],
    owned: true // Chaos lists the company's own domains, not scope assets.
  }));
}

function webTargets(p, typeRe, typeKey, valueKeys) {
  return ((p.targets && p.targets.in_scope) || [])
    .filter((t) => typeRe.test(t[typeKey] || ""))
    .map((t) => valueKeys.map((k) => t[k]).find(Boolean) || "");
}

function parseHackerOne(data) {
  return data.map((p) => {
    const targets = webTargets(p, /^(URL|WILDCARD|API)$/i, "asset_type", ["asset_identifier"]);
    return {
      name: p.name,
      url: p.url,
      platform: "HackerOne",
      bounty: !!p.offers_bounties,
      domains: [...hostsIn(p.website), ...targets.flatMap(hostsIn)],
      scope: targets.flatMap(scopeEntries)
    };
  });
}

function parseBugcrowd(data) {
  return data.map((p) => {
    const targets = webTargets(p, /^(website|api)$/i, "type", ["target", "uri"]);
    return {
      name: p.name,
      url: p.url,
      platform: "Bugcrowd",
      bounty: (p.max_payout || 0) > 0,
      domains: targets.flatMap(hostsIn),
      scope: targets.flatMap(scopeEntries)
    };
  });
}

function parseIntigriti(data) {
  return data.map((p) => {
    const targets = webTargets(p, /^(url|wildcard)$/i, "type", ["endpoint"]);
    return {
      name: p.name,
      url: p.url,
      platform: "Intigriti",
      bounty: ((p.max_bounty && p.max_bounty.value) || 0) > 0,
      domains: targets.flatMap(hostsIn),
      scope: targets.flatMap(scopeEntries)
    };
  });
}

function parseYesWeHack(data) {
  return data.map((p) => {
    const targets = webTargets(p, /^(web-application|api|wildcard)$/i, "type", ["target"]);
    return {
      name: p.name,
      url: "https://yeswehack.com/programs/" + p.id,
      platform: "YesWeHack",
      bounty: (p.max_bounty || 0) > 0,
      domains: targets.flatMap(hostsIn),
      scope: targets.flatMap(scopeEntries)
    };
  });
}

// Compact index: { version, updatedAt, programs: [[name, url, platform, bounty, scope[]]], domains: { root: [i] } }
function buildIndex(programLists) {
  const programs = [];
  const domains = {};
  const seenUrl = new Map();

  for (const list of programLists) {
    for (const p of list) {
      if (!p.url || !p.name) continue;
      let idx = seenUrl.get(p.url);
      if (idx === undefined) {
        idx = programs.length;
        programs.push([p.name.trim(), p.url, p.platform, p.bounty ? 1 : 0, []]);
        seenUrl.set(p.url, idx);
      }
      const scope = programs[idx][4];
      for (const entry of p.scope || []) {
        if (scope.length >= SCOPE_MAX) break;
        if (!scope.includes(entry)) scope.push(entry);
      }
      const roots = new Set(p.domains.map(registrableDomain).filter(Boolean));
      for (const root of roots) {
        if (!p.owned && SHARED_DOMAINS.has(root)) continue;
        const entry = (domains[root] = domains[root] || { owned: [], scope: [] });
        const bucket = p.owned ? entry.owned : entry.scope;
        if (!bucket.includes(idx)) bucket.push(idx);
      }
    }
  }

  const flat = {};
  for (const [root, { owned, scope }] of Object.entries(domains)) {
    const ids = [...owned];
    if (scope.length <= SHARED_DOMAIN_PROGRAM_LIMIT) {
      for (const i of scope) if (!ids.includes(i)) ids.push(i);
    }
    if (ids.length) flat[root] = ids;
  }
  return { version: DIRECTORY_VERSION, updatedAt: Date.now(), programs, domains: flat };
}

let directoryMemo = null;
let directoryRefresh = null;

async function refreshDirectory() {
  const results = await Promise.allSettled(
    DIRECTORY_SOURCES.map(async (src) => {
      const res = await fetchWithTimeout(src.url, 60000);
      if (!res.ok) throw new Error(src.url + " " + res.status);
      return src.parse(await res.json());
    })
  );
  const lists = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
  if (lists.length === 0) throw new Error("no directory source reachable");
  const index = buildIndex(lists);
  await chrome.storage.local.set({ [DIRECTORY_KEY]: index });
  directoryMemo = index;
  return index;
}

// Returns the cached directory, refreshing it when missing or older than a week.
async function getDirectory() {
  if (!directoryMemo) {
    const data = await chrome.storage.local.get([DIRECTORY_KEY]);
    directoryMemo = data[DIRECTORY_KEY] || null;
  }
  const outdated = !directoryMemo || directoryMemo.version !== DIRECTORY_VERSION;
  const stale = outdated || Date.now() - directoryMemo.updatedAt > DIRECTORY_TTL_MS;
  if (stale && !directoryRefresh) {
    directoryRefresh = refreshDirectory()
      .catch(() => directoryMemo)
      .finally(() => (directoryRefresh = null));
  }
  // Block when there is nothing usable to answer from yet.
  if (outdated && directoryRefresh) await directoryRefresh;
  return directoryMemo;
}

function lookupDirectory(directory, root) {
  if (!directory || !directory.domains[root]) return [];
  return directory.domains[root].map((i) => {
    const [name, url, platform, bounty, scope] = directory.programs[i];
    return {
      title: name,
      url,
      source: platform,
      bounty: !!bounty,
      scope: scope || [],
      scopeSource: "directory"
    };
  });
}

// ---------- on-site checks ----------

async function fetchText(url) {
  try {
    const res = await fetchWithTimeout(url, SITE_FETCH_TIMEOUT);
    if (!res.ok) return null;
    return { text: await res.text(), finalUrl: res.url || url, type: res.headers.get("content-type") || "" };
  } catch (_) {
    return null;
  }
}

// Fetches an HTML page and returns a program record if it reads like one.
async function scanPage(url, source) {
  const page = await fetchText(url);
  if (!page || !page.type.includes("text/html")) return null;
  const text = htmlToText(page.text);
  if (!scanText(text, page.finalUrl)) return null;
  return {
    title: extractTitle(page.text) || hostOf(page.finalUrl),
    url: normalizeUrl(page.finalUrl),
    source,
    bounty: /\b(bount(y|ies)|reward|monetary)\b/i.test(page.text),
    scope: domainsInText(text),
    scopeSource: "page"
  };
}

function parseSecurityTxt(text) {
  const fields = { policy: [], contact: [] };
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(policy|contact)\s*:\s*(\S+)/i);
    if (m && /^https?:\/\//i.test(m[2])) fields[m[1].toLowerCase()].push(m[2]);
  }
  return fields;
}

async function checkSecurityTxt(origin, root) {
  const bases = [...new Set([origin, "https://" + root, "https://www." + root])];
  for (const base of bases) {
    const file = await fetchText(base + "/.well-known/security.txt");
    if (!file || !/^\s*(contact|policy)\s*:/im.test(file.text)) continue;

    const found = [];
    const { policy, contact } = parseSecurityTxt(file.text);
    for (const url of [...policy, ...contact]) {
      if (PLATFORM_HOSTS.test(hostOf(url))) {
        found.push({ title: root + " (bounty platform)", url: normalizeUrl(url), source: "security.txt", bounty: true });
      }
    }
    for (const url of policy.filter((u) => !PLATFORM_HOSTS.test(hostOf(u))).slice(0, 3)) {
      const page = await scanPage(url, "security.txt");
      if (page) found.push(page);
    }
    return found;
  }
  return [];
}

async function checkPageLinks(links, root) {
  const candidates = (links || [])
    .filter((u) => {
      const h = hostOf(u);
      return registrableDomain(h) === root || PLATFORM_HOSTS.test(h);
    })
    .slice(0, 4);
  for (const url of candidates) {
    if (PLATFORM_HOSTS.test(hostOf(url))) {
      return [{ title: root + " (bounty platform)", url: normalizeUrl(url), source: "page link", bounty: true }];
    }
    const page = await scanPage(url, "page link");
    if (page) return [page];
  }
  return [];
}

async function probePaths(origin) {
  for (const path of PROBE_PATHS) {
    const page = await fetchText(origin + path);
    if (!page || !page.type.includes("text/html")) continue;
    // Soft-404s often redirect home; only trust pages that stayed on a
    // program-like path.
    let finalPath = "";
    try {
      finalPath = new URL(page.finalUrl).pathname;
    } catch (_) {}
    if (!PROGRAM_PATH_RE.test(finalPath)) continue;
    const text = htmlToText(page.text);
    if (!scanText(text, page.finalUrl)) continue;
    return [{
      title: extractTitle(page.text) || hostOf(page.finalUrl),
      url: normalizeUrl(page.finalUrl),
      source: "common path",
      bounty: /\b(bount(y|ies)|reward|monetary)\b/i.test(page.text),
      scope: domainsInText(text),
      scopeSource: "page"
    }];
  }
  return [];
}

// ---------- cache + entry point ----------

async function getSiteCache() {
  const data = await chrome.storage.local.get([SITE_CACHE_KEY]);
  return data[SITE_CACHE_KEY] || {};
}

async function saveSiteResult(root, result) {
  const cache = await getSiteCache();
  cache[root] = result;
  const keys = Object.keys(cache);
  if (keys.length > SITE_CACHE_MAX) {
    keys
      .sort((a, b) => cache[a].checkedAt - cache[b].checkedAt)
      .slice(0, keys.length - SITE_CACHE_MAX)
      .forEach((k) => delete cache[k]);
  }
  await chrome.storage.local.set({ [SITE_CACHE_KEY]: cache });
}

function isFresh(result) {
  if (!result || result.v !== SITE_RESULT_VERSION) return false;
  const ttl = result.programs.length ? SITE_FOUND_TTL_MS : SITE_NONE_TTL_MS;
  return Date.now() - result.checkedAt < ttl;
}

const siteChecksInFlight = new Map();

// Resolves to { domain, checkedAt, programs: [{title, url, source, bounty}] }
// or null for pages that can't be checked (chrome://, localhost, IPs...).
async function checkSite(pageUrl, { links = [], force = false } = {}) {
  let origin;
  let host;
  try {
    const u = new URL(pageUrl);
    if (!/^https?:$/.test(u.protocol)) return null;
    origin = u.origin;
    host = u.hostname;
  } catch (_) {
    return null;
  }
  const root = registrableDomain(host);
  if (!root) return null;

  if (!force) {
    const cached = (await getSiteCache())[root];
    if (isFresh(cached)) return cached;
  }
  if (siteChecksInFlight.has(root)) return siteChecksInFlight.get(root);

  const run = (async () => {
    let programs = lookupDirectory(await getDirectory(), root);
    programs = programs.concat(await checkSecurityTxt(origin, root));
    if (programs.length === 0) programs = await checkPageLinks(links, root);
    if (programs.length === 0) programs = await probePaths(origin);

    const seen = new Set();
    programs = programs.filter((p) => {
      const key = normalizeUrl(p.url);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const result = { v: SITE_RESULT_VERSION, domain: root, checkedAt: Date.now(), programs };
    await saveSiteResult(root, result);
    for (const p of programs) await addOrUpdateProgram({ url: p.url, title: p.title });
    return result;
  })().finally(() => siteChecksInFlight.delete(root));

  siteChecksInFlight.set(root, run);
  return run;
}
