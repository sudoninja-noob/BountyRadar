(() => {
  const PENDING_PROMPT_KEY = "BOUNTYWATCH_PENDING_PROMPT";
  const MSG_SEND_TO_CHATGPT = "BOUNTYWATCH_SEND_TO_CHATGPT";

  async function takePendingPrompt() {
    const data = await chrome.storage.local.get(PENDING_PROMPT_KEY);
    const prompt = data[PENDING_PROMPT_KEY];
    if (prompt) await chrome.storage.local.remove(PENDING_PROMPT_KEY);
    return typeof prompt === "string" ? prompt : "";
  }

  function findComposer() {
    return document.querySelector(
      '[contenteditable="true"].ProseMirror[role="textbox"]'
    );
  }

  function findFileInput() {
    const inputs = document.querySelectorAll('input[type="file"]');
    for (const el of inputs) {
      const accept = el.getAttribute("accept") || "";
      if (!/image|video/i.test(accept)) return el;
    }
    return inputs[0] || null;
  }

  function findSendButton() {
    const selectors = [
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
      'button[type="submit"]',
      'button[aria-label="Send message"]',
      'button[aria-label="Send"]'
    ];
    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn) return btn;
    }
    return null;
  }

  function buttonReady(btn) {
    return !btn.disabled && btn.getAttribute("aria-disabled") !== "true";
  }

  function attachmentVisible() {
    const composerBody = document.querySelector('[data-composer-body]');
    if (!composerBody) return false;
    return /bountyradar-prompt/i.test(composerBody.textContent || "");
  }

  function attachmentGone() {
    return !attachmentVisible();
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function attachFile(prompt) {
    const input = findFileInput();
    if (!input) return false;

    const file = new File([prompt], "bountyradar-prompt.txt", {
      type: "text/plain"
    });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("input", { bubbles: true }));

    let chipCounted = false;
    for (let i = 0; i < 30; i++) {
      if (attachmentVisible()) {
        chipCounted = true;
        break;
      }
      await sleep(500);
    }
    if (!chipCounted) return false;

    let readyStreak = 0;
    for (let i = 0; i < 60; i++) {
      await sleep(500);
      const btn = findSendButton();
      if (btn && buttonReady(btn) && attachmentVisible()) {
        readyStreak++;
        if (readyStreak >= 2) {
          btn.click();
          for (let j = 0; j < 8; j++) {
            await sleep(500);
            if (!btn.isConnected || !buttonReady(btn) || attachmentGone()) {
              return true;
            }
          }
          return true;
        }
      } else {
        readyStreak = 0;
      }
    }
    return false;
  }

  function setComposerText(editor, text) {
    editor.focus();
    if (document.execCommand("insertText", false, text)) return;
    const p = editor.querySelector("p");
    if (p) {
      p.textContent = text;
      editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
  }

  async function sendAsText(prompt) {
    const editor = findComposer();
    if (!editor) return false;
    setComposerText(editor, prompt);
    for (let i = 0; i < 40; i++) {
      const btn = findSendButton();
      if (btn && buttonReady(btn)) {
        btn.click();
        for (let j = 0; j < 6; j++) {
          await sleep(500);
          if (editor.textContent === "") return true;
        }
        return true;
      }
      await sleep(250);
    }
    return false;
  }

  // Shown when ChatGPT's DOM has changed and auto-send can't find its
  // controls. The button click gives us the user gesture clipboard needs.
  function showFallbackToast(prompt) {
    const box = document.createElement("div");
    box.style.cssText =
      "position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:320px;" +
      "padding:12px 14px;border-radius:10px;background:#0b1220;color:#e2e8f0;" +
      "border:1px solid #22c55e;font:13px/1.4 -apple-system,Segoe UI,sans-serif;" +
      "box-shadow:0 8px 24px rgba(0,0,0,.35)";
    box.textContent =
      "BountyRadar couldn't auto-send the prompt (ChatGPT's page may have changed). ";

    const copy = document.createElement("button");
    copy.textContent = "Copy prompt";
    copy.style.cssText =
      "margin:8px 8px 0 0;padding:5px 10px;border-radius:6px;border:0;" +
      "background:#22c55e;color:#0b1220;font-weight:600;cursor:pointer";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(prompt);
        copy.textContent = "Copied - paste it into the chat";
      } catch (_) {
        copy.textContent = "Copy failed";
      }
    });

    const close = document.createElement("button");
    close.textContent = "Dismiss";
    close.style.cssText =
      "margin-top:8px;padding:5px 10px;border-radius:6px;border:1px solid #26324a;" +
      "background:transparent;color:#e2e8f0;cursor:pointer";
    close.addEventListener("click", () => box.remove());

    box.append(document.createElement("br"), copy, close);
    document.body.appendChild(box);
  }

  async function send(prompt) {
    if (!prompt) return;
    await sleep(4000);

    for (let i = 0; i < 20; i++) {
      if (findComposer() || findFileInput()) break;
      await sleep(500);
    }

    const attached = await attachFile(prompt);
    const sent = attached || (await sendAsText(prompt));
    if (!sent) showFallbackToast(prompt);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === MSG_SEND_TO_CHATGPT) {
      takePendingPrompt()
        .then(send)
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
      return true;
    }
    return false;
  });

  window.addEventListener("load", () => {
    setTimeout(() => takePendingPrompt().then(send), 500);
  });
})();