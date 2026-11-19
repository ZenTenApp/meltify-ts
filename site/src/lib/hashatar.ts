/**
 * Hashatar avatars, drawn once per npub and cached as a data URI.
 *
 * `@hashatar/react` is a React component and this shell is plain DOM, so it uses
 * the same generator underneath (`@hashatar/core`) and paints the 32×32 grid the
 * way the React component does: a sharp, pixel-scaled bitmap of the hash. The
 * whole npub is the input, so two wallets that differ anywhere differ visually.
 *
 * Why a data URI instead of a canvas element: a strip re-renders on every store
 * change (each keystroke in a form), and rebuilding 1024 pixels each time is
 * wasted work. The PNG is generated once per text and reused by every render.
 * No network: the generator is `js-sha256` over the string, and the CSP allows
 * `data:` images only.
 */

import { generateHashatar } from '@hashatar/core';

/** Grid resolution, matching the component's default. */
const GRID = 32;

/** `null` is cached too: a page without a 2D context should not keep retrying. */
const cache = new Map<string, string | null>();

/**
 * A `data:image/png` hashatar for `text`, or null when this page cannot draw one
 * or the text is empty. Callers treat null as "no avatar", never as an error.
 */
export function hashatarImage(text: string): string | null {
  const cached = cache.get(text);
  if (cached !== undefined) return cached;

  let url: string | null = null;
  if (text !== '' && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = GRID;
    canvas.height = GRID;
    const context = canvas.getContext('2d');
    if (context !== null) {
      const grid = generateHashatar(text, { size: GRID });
      for (let row = 0; row < GRID; row += 1) {
        const line = grid[row];
        if (line === undefined) continue;
        for (let col = 0; col < GRID; col += 1) {
          const pixel = line[col];
          if (pixel === undefined) continue;
          context.fillStyle = `rgb(${pixel[0]} ${pixel[1]} ${pixel[2]})`;
          context.fillRect(col, row, 1, 1);
        }
      }
      url = canvas.toDataURL('image/png');
    }
  }

  cache.set(text, url);
  return url;
}
