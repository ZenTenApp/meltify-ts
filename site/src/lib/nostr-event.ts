/**
 * Nostr kind 0 events: the part the page uses — the name a profile advertises.
 *
 * Nothing here is verified. The id and the BIP340 signature are deliberately not
 * checked, so a name taken from a relay is shown as **unverified**: a relay (or
 * anyone it serves) can put a name on a tab, and the tab says so with a `?`.
 *
 * Restoring verification is a small, known change if it is ever wanted: NIP-01
 * serialises `[0, pubkey, created_at, kind, tags, content]` — six elements, with
 * the *kind* as an element of its own — and the id is the sha256 of that, which
 * the signature then covers. (An earlier version of this file dropped the `kind`
 * element, which is why real events looked malformed.)
 */

/** What a kind 0 gives the shell: a display name and when it was signed. */
export interface Kind0Profile {
  name: string;
  createdAt: number;
}

/**
 * The name a relay's event advertises: `display_name`, else `name`. Empty
 * strings and non-strings are ignored, and the whole content is allowed to be
 * junk — this reads, it does not judge.
 */
export function readKind0(raw: unknown): Kind0Profile | null {
  if (raw === null || typeof raw !== 'object') return null;
  const event = raw as { kind?: unknown; created_at?: unknown; content?: unknown };
  if (event.kind !== 0) return null;
  if (typeof event.content !== 'string' || event.content.trim() === '') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(event.content);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const content = parsed as { display_name?: unknown; name?: unknown };
  const name = [content.display_name, content.name].find(
    (value): value is string => typeof value === 'string' && value.trim() !== '',
  );
  if (name === undefined) return null;

  const createdAt = typeof event.created_at === 'number' && Number.isFinite(event.created_at)
    ? event.created_at
    : 0;
  return { name: name.trim(), createdAt };
}
