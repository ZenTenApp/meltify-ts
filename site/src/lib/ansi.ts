/**
 * ANSI SGR → DOM. `renderText(report, { color: true })` returns the same escape
 * sequences the Go binary writes to a TTY; a `<pre>` would show them as control
 * characters, so they are turned into spans carrying the binary's own colours.
 *
 * Only what `src/render/text.ts` emits is understood: reset (`0`), bold (`1`)
 * and truecolor foreground (`38;2;r;g;b`). Anything else is dropped, so a
 * palette change shows up as missing colour rather than as escape garbage.
 */

const SGR = /\x1b\[([0-9;]*)m/g;

export function ansiToNodes(text: string): Node[] {
  const nodes: Node[] = [];
  let bold = false;
  let color: string | null = null;

  const push = (chunk: string): void => {
    if (chunk.length === 0) return;
    if (!bold && color === null) {
      nodes.push(document.createTextNode(chunk));
      return;
    }
    const span = document.createElement('span');
    if (bold) span.style.fontWeight = '700';
    if (color !== null) span.style.color = color;
    span.textContent = chunk;
    nodes.push(span);
  };

  let cursor = 0;
  for (const match of text.matchAll(SGR)) {
    const start = match.index ?? 0;
    push(text.slice(cursor, start));
    cursor = start + match[0].length;

    const codes = match[1] === '' ? ['0'] : (match[1] ?? '').split(';');
    for (let i = 0; i < codes.length; i += 1) {
      const code = codes[i];
      if (code === '0') {
        bold = false;
        color = null;
      } else if (code === '1') {
        bold = true;
      } else if (code === '38' && codes[i + 1] === '2') {
        const [r, g, b] = [codes[i + 2], codes[i + 3], codes[i + 4]];
        if (r !== undefined && g !== undefined && b !== undefined) {
          color = `rgb(${r}, ${g}, ${b})`;
        }
        i += 4;
      }
    }
  }
  push(text.slice(cursor));
  return nodes;
}
