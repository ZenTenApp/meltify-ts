/**
 * Clipboard with an insecure-context fallback.
 *
 * `navigator.clipboard` only exists in secure contexts. This site is designed
 * to run from a plain-http LAN address too, so fall back to the legacy
 * selection copy instead of silently failing.
 */

export async function copyText(value: string): Promise<void> {
  const clipboard = navigator.clipboard as Clipboard | undefined;
  if (clipboard !== undefined && typeof clipboard.writeText === 'function') {
    try {
      await clipboard.writeText(value);
      return;
    } catch {
      // fall through to the legacy path
    }
  }

  const holder = document.createElement('textarea');
  holder.value = value;
  holder.setAttribute('readonly', '');
  holder.style.position = 'fixed';
  holder.style.top = '-1000px';
  holder.style.opacity = '0';
  document.body.append(holder);
  holder.select();
  holder.setSelectionRange(0, value.length);
  const copied = document.execCommand('copy');
  holder.remove();
  if (!copied) throw new Error('copy rejected by the browser');
}
