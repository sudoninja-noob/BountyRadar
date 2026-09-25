(() => {
  const MSG_DETECT = "BOUNTYWATCH_DETECT";
  const MSG_SCAN_URLS = "BOUNTYWATCH_SCAN_URLS";
  const MSG_SITE_VISIT = "BOUNTYWATCH_SITE_VISIT";
  const SECURITY_LINK_RE =
    /bug[\s_-]?bount|responsible[\s_-]?disclosure|vulnerability[\s_-]?(disclosure|report)|report[\s_-]?a[\s_-]?vulnerability|white[\s_-]?hat|hall[\s_-]?of[\s_-]?fame|security\.txt|\bsecurity\b/i;

  const SEARCH_HOSTS = /(^|\.)google\.(com|co\.uk|de|fr|in|ca|au|jp|br|mx|it|es|nl|se|pl|ch|be|at|tr|ru|cz|dk|fi|no|pt|com\.mx|com\.br|com\.au|com\.in|co\.in|co\.jp|co\.kr)/i;

  function isSearchResultsPage() {
    const host = location.hostname.replace(/^www\./, "");
    if (!/google(\.[a-z]{2,3})?(\.[a-z]{2})?$/.test(host)) return false;
    const q = location.pathname.replace(/\/+$/, "") === "/search";
    return q || location.search.includes("q=");
  }

  function isSearchOrAssetHost(host) {
    return (
      SEARCH_HOSTS.test(host) ||
      /googleusercontent\.com$|gstatic\.com$/.test(host)
    );
  }

  function resolveHref(raw) {
    if (!raw) return "";
    let href = raw.trim();
    if (href.startsWith("//")) href = "https:" + href;

    try {
      const u = new URL(href, location.href);
      if (u.pathname === "/url" && u.searchParams.has("q")) {
        return u.searchParams.get("q");
      }
      return u.href;
    } catch (_) {
      return "";
    }
  }

  function closestResultHeading(a) {
    let el = a;
    for (let i = 0; i < 6 && el; i++) {
      const h = el.querySelector("h1, h2, h3, h4");
      if (h && h.textContent) return h.textContent.trim();
      el = el.parentElement;
    }
    return "";
  }

  function extractResultLinks() {
    const links = [];
    const seen = new Set();

    const anchors = document.querySelectorAll("a[href]");
    for (const a of anchors) {
      const url = normalizeUrl(resolveHref(a.getAttribute("href") || ""));
      if (!/^https?:/i.test(url)) continue;

      let host;
      try {
        host = new URL(url).hostname;
      } catch (_) {
        continue;
      }
      if (isSearchOrAssetHost(host)) continue;
      if (seen.has(url)) continue;

      const title = closestResultHeading(a);
      seen.add(url);
      links.push({ url, title });
    }

    return links;
  }

  // Links that likely lead to the site's security / bounty page (usually in
  // the footer), strongest matches first.
  function securityLinks() {
    const scored = [];
    const seen = new Set();
    for (const a of document.querySelectorAll("a[href]")) {
      const label = (a.textContent || "").trim().slice(0, 120);
      const href = a.href;
      if (!/^https?:/i.test(href) || seen.has(href)) continue;
      if (!SECURITY_LINK_RE.test(label) && !SECURITY_LINK_RE.test(href)) continue;
      seen.add(href);
      const strong = /bount|disclosure|vulnerab|white[\s_-]?hat/i.test(label + " " + href);
      scored.push({ href, score: strong ? 2 : 1 });
    }
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => normalizeUrl(x.href));
  }

  // Asks the background to check whether this site's company runs a program
  // (directory, security.txt, footer links, common paths). Once per URL.
  function checkSite() {
    if (isSearchResultsPage()) return;
    chrome.runtime
      .sendMessage({ type: MSG_SITE_VISIT, links: securityLinks() })
      .catch(() => {});
  }

  // Returns true once the page has been handled (detected, or a search page).
  function report() {
    if (isSearchResultsPage()) {
      const links = extractResultLinks();
      if (links.length === 0) return false;
      chrome.runtime
        .sendMessage({ type: MSG_SCAN_URLS, links })
        .catch(() => {});
      return true;
    }

    const result = scanText(
      document.body ? document.body.innerText : "",
      location.href
    );
    if (!result) return false;

    chrome.runtime
      .sendMessage({
        type: MSG_DETECT,
        keywords: result.strong.concat(result.weak),
        strong: result.strong,
        weak: result.weak
      })
      .catch(() => {});
    return true;
  }

  // Many program pages (and Google results) render their text with JS after
  // document_idle, so retry a couple of times before giving up on a URL.
  const RETRY_DELAYS_MS = [2000, 5000];
  let scanGeneration = 0;

  function scan() {
    checkSite();
    const generation = ++scanGeneration;
    if (report()) return;
    for (const delay of RETRY_DELAYS_MS) {
      setTimeout(() => {
        if (generation !== scanGeneration) return; // URL changed; stale retry
        if (report()) scanGeneration++; // done; cancel remaining retries
      }, delay);
    }
  }

  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      scan();
    }
  }, 1500);

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", scan);
  } else {
    scan();
  }
})();
