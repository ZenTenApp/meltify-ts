/** Blob downloads. Nothing leaves the tab; the object URL is revoked after the click. */

export function downloadText(
  filename: string,
  text: string,
  mime = 'text/plain;charset=utf-8',
): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
