// Set when focus was requested before the composer existed (its panel renders deferred).
let focusRequestedAt = 0;

/** Focuses the commit message input now, or when the composer mounts within the next seconds. */
export function focusCommitMessage() {
  const input = document.querySelector<HTMLInputElement>("[data-commit-message-input]");
  if (input) {
    input.focus();
    return;
  }
  focusRequestedAt = Date.now();
  // The user moving focus elsewhere first cancels the request, so a later composer can't steal it.
  document.addEventListener("focusin", () => (focusRequestedAt = 0), { once: true });
}

/** Consume a pending shortcut request when the deferred composer mounts. */
export function consumeCommitFocusRequest(): boolean {
  const pending = focusRequestedAt > 0 && Date.now() - focusRequestedAt <= 3000;
  focusRequestedAt = 0;
  return pending;
}
