# BountyRadar

<img src="icons/icon128.png" width="96" alt="BountyRadar icon" />

**Website:** https://sudoninja-noob.github.io/BountyRadar/ · **GitHub:** https://github.com/sudoninja-noob/BountyRadar · **Download:** [ZIP](https://github.com/sudoninja-noob/BountyRadar/archive/refs/heads/main.zip)

Built by [sudoninja-noob](https://sudoninja-noob.github.io/)

BountyRadar is a Chrome extension that automatically detects bug bounty programs on the pages you visit. It scans the content of every page, recognizes bounty-related keywords ("bounty", "reward", "monetary compensation", "eligible targets", etc.), and once a page looks like a bug bounty program it saves it to your tracked list with the page's favicon, title, and URL.

It also lets you send all tracked programs to ChatGPT in one click so you can get a normalized, structured (JSON) overview of every program: reward ranges, in-scope/out-of-scope domains, and more.

## Features

- **Does this site have a program? (every site you visit)** – on any website (e.g. `facebook.com`), BountyRadar checks whether the company behind it runs a bug bounty / disclosure program, even if you never open the program page. The toolbar icon shows a green **✓** on that tab, the popup's **This site** card lists the program link(s), and they're added to your tracked list. Checks, in order:
  1. **Program directory** – ~1,500 public programs from [ProjectDiscovery](https://github.com/projectdiscovery/public-bugbounty-programs) and [bounty-targets-data](https://github.com/arkadiyt/bounty-targets-data) (HackerOne, Bugcrowd, Intigriti, YesWeHack), downloaded weekly and searched locally.
  2. **`/.well-known/security.txt`** – `Policy:` / `Contact:` links to a bounty platform or a policy page.
  3. **Security links on the page** – footer links like "Security", "Bug Bounty", "Responsible Disclosure".
  4. **Common paths** – `/security`, `/bug-bounty`, `/responsible-disclosure`, `/vulnerability-disclosure`, `/whitehat`, …

  Each program shows its **in-scope domains** (click **In scope (N)** to expand) with a **Copy** button that puts one entry per line on your clipboard – ready for `subfinder -dL`, `httpx -l`, etc. **Copy all in-scope** merges every program's list for the site. Scope comes from the platform's target list (HackerOne, Bugcrowd, Intigriti, YesWeHack), the directory's owned domains, or – for self-hosted programs – domains written on the program page (marked "verify before testing", since pages can mix in out-of-scope hosts).

  Results are cached per domain (7 days if found, 3 days if not); use **Recheck** in the popup to refresh.
- **Automatic detection** – visit any page; if it's a bug bounty program it is added to your tracked list automatically. A page counts when it contains a specific phrase (e.g. "bug bounty program", "eligible targets", "vulnerability disclosure policy"), or the word "bounty" together with at least two other signals ("reward", "scope", "monetary", …).
- **Tracked list** – open the extension popup to see all detected programs (favicon, title, URL) with search and clear. Tracking parameters (`utm_*`, `gclid`, …) and `#fragments` are stripped so the same page isn't saved twice.
- **Copy list** – copy all detected programs as JSON.
- **Send to ChatGPT** – one click opens ChatGPT with a file attachment containing your tracked programs plus a fixed extraction prompt. ChatGPT reads the official `program_url` of each program and replies with a single ` ```json ``` ` code block of normalized records (reward, in-scope/out-of-scope domains, platform, etc.). If ChatGPT's page layout has changed and auto-send fails, a small box appears with a **Copy prompt** button so you can paste it manually.
- **Dork launcher** – click **Dorks** in the popup for ~75 curated Google dorks that surface public bug bounty / disclosure programs (program-page URLs, telltale phrases, Bugcrowd/HackerOne/Synack embeds, `security.txt`, by country TLD). Click one to open that search in a background tab; filter them with the search box. Searches are opened one click at a time on purpose — automated bulk queries trigger Google CAPTCHAs and break its terms.
- **Search-results scanning (optional, off by default)** – when enabled in the popup, BountyRadar also fetches the result links on Google search pages in the background and checks them for bounty programs.

## Privacy

- Detection runs locally on the pages you open. Only favicon, title, and URL are stored per program, in `chrome.storage.local`.
- Favicons in the popup come from Chrome's local favicon cache; no third-party favicon service is contacted.
- **Site check** (on by default, toggle in the popup): for each new domain you visit, BountyRadar requests `security.txt`, a few security-looking links, and common program paths **from that same site**. The program directory is downloaded weekly from `raw.githubusercontent.com`; lookups against it happen locally.
- Nothing else is sent anywhere unless you:
  - click **Copy** or **Chatgpt** (your tracked list goes to your clipboard / to ChatGPT), or
  - turn on **Also scan Google search results** – then BountyRadar requests up to 40 result pages per search from your browser, so those sites see a visit from your IP even though you never opened them.

## Requirements

- Google Chrome (a recent version that supports Manifest V3).

## Installation (load as unpacked extension)

1. **Download the code**
   - Clone or download this repository into a folder on your computer, e.g. `BountyRadar`:
     ```bash
     git clone https://github.com/sudoninja-noob/BountyRadar.git
     ```
     or download the [ZIP](https://github.com/sudoninja-noob/BountyRadar/archive/refs/heads/main.zip) and unzip it.
   - Inside the folder you must see `manifest.json` (this is the extension's "entry point").

2. **Open the Extensions page**
   - Open Chrome and go to `chrome://extensions`.

3. **Enable Developer mode**
   - Toggle **Developer mode** (top-right corner) to ON.

4. **Load the extension**
   - Click the **Load unpacked** button (top-left).
   - Select the `BountyRadar` folder that contains `manifest.json`.
   - BountyRadar appears in your extension list. It is now active.

5. **Pin the extension (optional but recommended)**
   - Click the puzzle piece icon in the Chrome toolbar.
   - Find **BountyRadar** and click the pin so the icon stays visible in your toolbar.

## How to use

### Basic tracking

- Just browse normally. When BountyRadar detects a page that is a bug bounty program, it adds it to your list automatically (look for the badge count on the extension icon).
- Click the **BountyRadar icon** to open the popup and see everything tracked.

### In the popup toolbar

- **Search** – filter the tracked programs by title or URL.
- **Copy** – copies all detected programs as a JSON array to your clipboard.
- **Chatgpt** – opens `chatgpt.com` in a new tab, attaches a `bountyradar-prompt.txt` file containing every tracked program plus the extraction instructions, and automatically presses send. Copy ChatGPT's ` ```json ``` ` output and you're done.
- **Clear** – empties your tracked list.
- **Dorks** – switch to the dork list (click again, now labelled **Programs**, to go back). Pair it with background scanning so every dork you open is checked automatically.
- **Also scan Google search results** – opt-in checkbox; see [Privacy](#privacy).

## Updating the extension

After pulling new code, reload it so the changes take effect (otherwise the extension may keep running the old version):

1. Go to `chrome://extensions`.
2. Click the **reload (⟳)** icon on the BountyRadar card.
3. Important: after any change to `manifest.json`, clicking reload re-registers content scripts. It is a good idea to refresh any already-open `chatgpt.com` tabs once so they get the latest script.

## Files

| File             | Purpose                                                            |
| ---------------- | ------------------------------------------------------------------ |
| `manifest.json`  | Extension manifest (Manifest V3) and content-script registration   |
| `background.js`  | Service worker: scanning, storage, badge, permission handling      |
| `common.js`      | Shared helpers (keywords, text extraction, URL normalization)      |
| `content.js`     | Content script that scans pages on your sites                      |
| `popup.html`     | Popup UI                                                            |
| `popup.css`      | Popup styling                                                       |
| `sitecheck.js`   | Per-site program check: directory, security.txt, links, paths      |
| `dorks.js`       | Curated Google dork list used by the popup's Dorks view             |
| `popup.js`       | Popup logic (search, copy, clear, Chatgpt)                          |
| `chatgpt-inject.js` | Content script for `chatgpt.com` – attaches the prompt file and submits |
| `icons/`         | Extension icons                                                     |

## Troubleshooting

- **Badge shows no count but I visited a program page** – make sure the page is really a bug bounty program (keywords must appear in page text). Reload the page after installing the extension; content scripts start on freshly loaded pages.
- **Chatgpt button seems to do nothing** – make sure you are logged into ChatGPT, and that no `chatgpt.com` tab is mid-upload when you click. Reload the extension, then reload any open `chatgpt.com` tab.
- **Changes not applying** – you must click **reload (⟳)** on `chrome://extensions` after editing files.

## License

