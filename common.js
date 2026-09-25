const STRONG_KEYWORDS = [
  "eligible targets",
  "we offer a monetary",
  "we offer monetary reward",
  "we offer reward",
  "we offer rewards",
  "monetary reward",
  "monetary rewards",
  "eligible for a reward",
  "we award a bounty",
  "vulnerability reward program",
  "vulnerability rewards program",
  "bug bounty program",
  "responsible disclosure",
  "vulnerability disclosure policy",
  "security reward program",
  "security bounty program",
  // British spelling, common on EU / UK / Indian sites.
  "bug bounty programme",
  "vulnerability reward programme",
  "vulnerability rewards programme",
  "security reward programme",
  "security bounty programme",
  // Phrases that bug hunters' Google dorks key on.
  "powered by bugcrowd",
  "submission form powered by bugcrowd",
  "powered by hackerone",
  "powered by synack",
  "submit vulnerability report",
  "submit a vulnerability report",
  "vulnerability reporting policy",
  "if you believe you've found a security vulnerability",
  "if you believe that you have found a security vulnerability",
  "if you believe you have found a security vulnerability",
  "eligible for monetary compensation",
  "we offer a bounty",
  // Dutch: "...of the report with a minimum of..." (reward wording on .nl sites)
  "van de melding met een minimum van een"
];

const WEAK_KEYWORDS = [
  "scope",
  "bounty",
  "bounties",
  "reward",
  "rewards",
  "monetary",
  "compensation",
  "hall of fame",
  "swag",
  "hoodie"
];

// URL paths typical of program / disclosure pages. A match counts as one
// weak signal on its own.
const PROGRAM_PATH_RE =
  /\/(responsible[-_]?disclosure|bug[-_]?bount(y|ies)|vulnerability[-_]disclosure|report[-_]a[-_]vulnerability|reporting[-_]security[-_]issues|white[-_]?hat|security[-_]?(policy|report|txt)?)(\/|\.|$|[-_?#])/i;

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildMatcher(list) {
  return list.map((kw) => new RegExp(`\\b${escapeRegExp(kw)}\\b`, "i"));
}

const STRONG_RE = buildMatcher(STRONG_KEYWORDS);
const WEAK_RE = buildMatcher(WEAK_KEYWORDS);

function scanText(text, url) {
  if (!text) return null;
  // Pages often use typographic apostrophes ("you’ve").
  text = text.replace(/[‘’]/g, "'");

  const strongMatches = [];
  const weakMatches = [];

  for (let i = 0; i < STRONG_RE.length; i++) {
    if (STRONG_RE[i].test(text)) strongMatches.push(STRONG_KEYWORDS[i]);
  }
  for (let i = 0; i < WEAK_RE.length; i++) {
    if (WEAK_RE[i].test(text)) weakMatches.push(WEAK_KEYWORDS[i]);
  }

  let pathMatch = false;
  try {
    pathMatch = !!url && PROGRAM_PATH_RE.test(new URL(url).pathname);
  } catch (_) {}
  if (pathMatch) weakMatches.push("program-like url path");

  // A strong phrase is enough on its own. Weak words ("reward", "scope") are
  // everywhere, so they only count with 3+ signals and either the word
  // "bounty" or a program-like URL path.
  const hasBountyWord =
    weakMatches.includes("bounty") || weakMatches.includes("bounties");
  const weakEnough = (hasBountyWord || pathMatch) && weakMatches.length >= 3;
  if (strongMatches.length === 0 && !weakEnough) return null;

  return { strong: strongMatches, weak: weakMatches };
}

const TRACKING_PARAM_RE =
  /^(utm_[a-z]+|gclid|fbclid|msclkid|mc_cid|mc_eid|_ga|_gl|ref|ref_src)$/i;

function normalizeUrl(href) {
  if (!href) return "";
  try {
    const u = new URL(href);
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAM_RE.test(key)) u.searchParams.delete(key);
    }
    return u.href;
  } catch (_) {
    return href;
  }
}

// The site's own favicon path. Kept third-party-free so tracked domains are
// never sent to an external favicon service.
function faviconUrl(href) {
  if (!href) return "";
  try {
    return new URL(href).origin + "/favicon.ico";
  } catch (_) {
    return "";
  }
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<title[^>]*>([\s\S]*?)<\/title>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return "";
  return m[1]
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}