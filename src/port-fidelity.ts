export const PORT_TOKEN_CAP = 5000;

export type PortSubstitution = { source: string; target: string; context: string };
export type PortDropped = { source: string; context: string };
export type PortAdded = { target: string; context: string };
export type PortMoved = { text: string; context: string };
export type PortCaseChange = { source: string; target: string; context: string };

export type PortFidelityResult = {
  verdict: "verbatim" | "diverged";
  substituted: PortSubstitution[];
  dropped: PortDropped[];
  added: PortAdded[];
  moved: PortMoved[];
  case_changed: PortCaseChange[];
  token_counts: {
    source: number;
    target: number;
    compared_source: number;
    compared_target: number;
    cap: number;
    capped: boolean;
  };
  warnings: string[];
};

type WordToken = { text: string; normalized: string };
type Alignment = { source: number; target: number };
type RawDropped = PortDropped & { normalized: string };
type RawAdded = PortAdded & { normalized: string };

const ENTITY_MAP: Record<string, string> = {
  amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"',
  ndash: "-", mdash: "-", lsquo: "'", rsquo: "'", ldquo: '"', rdquo: '"',
  copy: "©", reg: "®", trade: "™", hellip: "…", deg: "°", times: "×", divide: "÷",
  middot: "·", bull: "•", laquo: "«", raquo: "»", sect: "§", para: "¶", dagger: "†",
  Dagger: "‡", permil: "‰", euro: "€", pound: "£", yen: "¥", cent: "¢", plusmn: "±",
  frac12: "½", frac14: "¼", frac34: "¾", sup2: "²", sup3: "³", micro: "µ", szlig: "ß",
  agrave: "à", aacute: "á", acirc: "â", atilde: "ã", auml: "ä", aring: "å", aelig: "æ",
  ccedil: "ç", egrave: "è", eacute: "é", ecirc: "ê", euml: "ë", igrave: "ì",
  iacute: "í", icirc: "î", iuml: "ï", eth: "ð", ntilde: "ñ", ograve: "ò", oacute: "ó",
  ocirc: "ô", otilde: "õ", ouml: "ö", oslash: "ø", ugrave: "ù", uacute: "ú",
  ucirc: "û", uuml: "ü", yacute: "ý", thorn: "þ", yuml: "ÿ", prime: "′", Prime: "″",
  Agrave: "À", Aacute: "Á", Acirc: "Â", Atilde: "Ã", Auml: "Ä", Aring: "Å", AElig: "Æ",
  Ccedil: "Ç", Egrave: "È", Eacute: "É", Ecirc: "Ê", Euml: "Ë", Igrave: "Ì",
  Iacute: "Í", Icirc: "Î", Iuml: "Ï", ETH: "Ð", Ntilde: "Ñ", Ograve: "Ò", Oacute: "Ó",
  Ocirc: "Ô", Otilde: "Õ", Ouml: "Ö", Oslash: "Ø", Ugrave: "Ù", Uacute: "Ú",
  Ucirc: "Û", Uuml: "Ü", Yacute: "Ý", THORN: "Þ",
  minus: "−", lowast: "∗", ne: "≠", le: "≤", ge: "≥", larr: "←", rarr: "→",
  uarr: "↑", darr: "↓", harr: "↔",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z][a-z0-9]+);/gi, function(entity, body: string) {
    if (body[0] === "#") {
      const hexadecimal = body[1] && body[1].toLowerCase() === "x";
      const number = parseInt(body.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      if (Number.isFinite(number) && number >= 0 && number <= 0x10ffff) return String.fromCodePoint(number);
      return entity;
    }
    const decoded = ENTITY_MAP[body] === undefined ? ENTITY_MAP[body.toLowerCase()] : ENTITY_MAP[body];
    return decoded === undefined ? entity : decoded;
  });
}

function normalizeUnicode(value: string): string {
  return decodeEntities(value)
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201a\u201b\u2032]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f\u2033]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-");
}

export function tokenizePortWords(value: string): string[] {
  return wordTokens(value).map(function(token) { return token.text; });
}

function wordTokens(value: string): WordToken[] {
  const normalized = normalizeUnicode(value);
  const matches = normalized.match(/\p{Regional_Indicator}{2}|\p{Extended_Pictographic}\p{Variation_Selector}?\p{Emoji_Modifier}?(?:\u200D\p{Extended_Pictographic}\p{Variation_Selector}?\p{Emoji_Modifier}?)*|[\p{L}\p{N}\p{M}]+(?:['-][\p{L}\p{N}\p{M}]+)*/gu) || [];
  return matches.map(function(text) { return { text, normalized: text.toLocaleLowerCase() }; });
}

export function extractVisibleText(html: string): string {
  return decodeEntities(html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[a-zA-Z/!][^>"']*(?:"[^"]*"[^>"']*|'[^']*'[^>"']*)*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function lcsLengths(source: WordToken[], target: WordToken[]): Int32Array {
  const row = new Int32Array(target.length + 1);
  for (let i = 0; i < source.length; i += 1) {
    let diagonal = 0;
    for (let j = 1; j <= target.length; j += 1) {
      const above = row[j];
      if (source[i].normalized === target[j - 1].normalized) row[j] = diagonal + 1;
      else if (row[j - 1] > row[j]) row[j] = row[j - 1];
      diagonal = above;
    }
  }
  return row;
}

function hirschberg(source: WordToken[], target: WordToken[], sourceOffset: number, targetOffset: number): Alignment[] {
  if (source.length === 0 || target.length === 0) return [];
  if (source.length === 1) {
    const found = target.findIndex(function(token) { return token.normalized === source[0].normalized; });
    return found < 0 ? [] : [{ source: sourceOffset, target: targetOffset + found }];
  }

  const midpoint = Math.floor(source.length / 2);
  const leftSource = source.slice(0, midpoint);
  const rightSource = source.slice(midpoint);
  const leftScores = lcsLengths(leftSource, target);
  const rightScores = lcsLengths(rightSource.slice().reverse(), target.slice().reverse());
  let split = 0;
  let best = -1;
  for (let j = 0; j <= target.length; j += 1) {
    const score = leftScores[j] + rightScores[target.length - j];
    if (score > best) {
      best = score;
      split = j;
    }
  }
  return hirschberg(leftSource, target.slice(0, split), sourceOffset, targetOffset)
    .concat(hirschberg(rightSource, target.slice(split), sourceOffset + midpoint, targetOffset + split));
}

function align(source: WordToken[], target: WordToken[]): Alignment[] {
  let prefix = 0;
  while (prefix < source.length && prefix < target.length && source[prefix].normalized === target[prefix].normalized) prefix += 1;
  let suffix = 0;
  while (suffix < source.length - prefix && suffix < target.length - prefix &&
    source[source.length - 1 - suffix].normalized === target[target.length - 1 - suffix].normalized) suffix += 1;

  const matches: Alignment[] = [];
  for (let i = 0; i < prefix; i += 1) matches.push({ source: i, target: i });
  matches.push(...hirschberg(
    source.slice(prefix, source.length - suffix),
    target.slice(prefix, target.length - suffix),
    prefix,
    prefix
  ));
  for (let i = suffix; i > 0; i -= 1) {
    matches.push({ source: source.length - i, target: target.length - i });
  }
  return matches;
}

function joined(tokens: WordToken[], start: number, end: number): string {
  return tokens.slice(start, end).map(function(token) { return token.text; }).join(" ");
}

function context(tokens: WordToken[], start: number, end: number): string {
  const before = joined(tokens, Math.max(0, start - 4), start);
  const changed = joined(tokens, start, end);
  const after = joined(tokens, end, Math.min(tokens.length, end + 4));
  return [before, changed, after].filter(Boolean).join(" ");
}

function sameNormalizedRun(source: string, target: string): boolean {
  const sourceTokens = wordTokens(source).map(function(token) { return token.normalized; });
  const targetTokens = wordTokens(target).map(function(token) { return token.normalized; });
  return sourceTokens.length === targetTokens.length && sourceTokens.every(function(token, index) {
    return token === targetTokens[index];
  });
}

function longestCommonTokenSpan(source: WordToken[], target: WordToken[]): { sourceStart: number; targetStart: number; length: number } | null {
  let previous = new Int32Array(target.length + 1);
  let bestLength = 0;
  let bestSourceStart = 0;
  let bestTargetStart = 0;
  for (let i = 0; i < source.length; i += 1) {
    const current = new Int32Array(target.length + 1);
    for (let j = 1; j <= target.length; j += 1) {
      if (source[i].normalized !== target[j - 1].normalized) continue;
      current[j] = previous[j - 1] + 1;
      if (current[j] > bestLength) {
        bestLength = current[j];
        bestSourceStart = i - bestLength + 1;
        bestTargetStart = j - bestLength;
      }
    }
    previous = current;
  }
  return bestLength < 3
    ? null
    : { sourceStart: bestSourceStart, targetStart: bestTargetStart, length: bestLength };
}

function hasAnyClassifiedChange(result: PortFidelityResult): boolean {
  return result.substituted.length > 0 || result.dropped.length > 0 || result.added.length > 0 ||
    result.moved.length > 0 || result.case_changed.length > 0;
}

export function introducedBannedTerms(target: string, bannedTerms: string[]): string[] {
  const haystack = wordTokens(target).map(function(token) { return token.normalized; });
  const introduced: string[] = [];
  for (const term of bannedTerms) {
    const needle = wordTokens(term).map(function(token) { return token.normalized; });
    if (needle.length === 0 || needle.length > haystack.length) continue;
    for (let i = 0; i <= haystack.length - needle.length; i += 1) {
      if (needle.every(function(token, offset) { return token === haystack[i + offset]; })) {
        introduced.push(term);
        break;
      }
    }
  }
  return Array.from(new Set(introduced));
}

export function diffPortText(sourceText: string, targetText: string): PortFidelityResult {
  const allSource = wordTokens(sourceText);
  const allTarget = wordTokens(targetText);
  const capped = allSource.length > PORT_TOKEN_CAP || allTarget.length > PORT_TOKEN_CAP;
  const source = allSource.slice(0, PORT_TOKEN_CAP);
  const target = allTarget.slice(0, PORT_TOKEN_CAP);
  const warnings = capped
    ? ["Port-fidelity comparison capped at " + PORT_TOKEN_CAP + " word tokens per side; changes beyond the compared prefix are not classified."]
    : [];
  const result: PortFidelityResult = {
    verdict: "verbatim",
    substituted: [],
    dropped: [],
    added: [],
    moved: [],
    case_changed: [],
    token_counts: {
      source: allSource.length,
      target: allTarget.length,
      compared_source: source.length,
      compared_target: target.length,
      cap: PORT_TOKEN_CAP,
      capped,
    },
    warnings,
  };

  const fullEqual = allSource.length === allTarget.length && allSource.every(function(token, index) {
    return token.normalized === allTarget[index].normalized && token.text === allTarget[index].text;
  });
  const matches = align(source, target);
  const rawDropped: RawDropped[] = [];
  const rawAdded: RawAdded[] = [];
  let previousSource = -1;
  let previousTarget = -1;

  for (const match of matches.concat([{ source: source.length, target: target.length }])) {
    const sourceStart = previousSource + 1;
    const targetStart = previousTarget + 1;
    const sourceLength = match.source - sourceStart;
    const targetLength = match.target - targetStart;
    if (sourceLength > 0 && targetLength > 0) {
      result.substituted.push({
        source: joined(source, sourceStart, match.source),
        target: joined(target, targetStart, match.target),
        context: context(source, sourceStart, match.source),
      });
    } else if (sourceLength > 0) {
      const sourceRun = joined(source, sourceStart, match.source);
      rawDropped.push({ source: sourceRun, context: context(source, sourceStart, match.source), normalized: sourceRun.toLocaleLowerCase() });
    } else if (targetLength > 0) {
      const targetRun = joined(target, targetStart, match.target);
      rawAdded.push({ target: targetRun, context: context(target, targetStart, match.target), normalized: targetRun.toLocaleLowerCase() });
    }
    if (match.source < source.length && match.target < target.length && source[match.source].text !== target[match.target].text) {
      result.case_changed.push({
        source: source[match.source].text,
        target: target[match.target].text,
        context: context(source, match.source, match.source + 1),
      });
    }
    previousSource = match.source;
    previousTarget = match.target;
  }

  const usedDropped = new Set<number>();
  const usedAdded = new Set<number>();
  for (let droppedIndex = 0; droppedIndex < rawDropped.length; droppedIndex += 1) {
    const dropped = rawDropped[droppedIndex];
    const addedIndex = rawAdded.findIndex(function(added, index) {
      return !usedAdded.has(index) && sameNormalizedRun(dropped.source, added.target);
    });
    if (addedIndex >= 0) {
      usedDropped.add(droppedIndex);
      usedAdded.add(addedIndex);
      result.moved.push({ text: dropped.source, context: dropped.context + " → " + rawAdded[addedIndex].context });
    }
  }

  const remainingDropped = rawDropped.filter(function(_dropped, index) { return !usedDropped.has(index); }).map(function(dropped) {
    return { tokens: wordTokens(dropped.source), context: dropped.context };
  });
  const remainingAdded = rawAdded.filter(function(_added, index) { return !usedAdded.has(index); }).map(function(added) {
    return { tokens: wordTokens(added.target), context: added.context };
  });

  // Ceiling: measured ~4s at 4.4k adversarial tokens; PORT_TOKEN_CAP bounds this greedy span-matcher pair loop.
  while (true) {
    let best: { droppedIndex: number; addedIndex: number; sourceStart: number; targetStart: number; length: number } | null = null;
    for (let droppedIndex = 0; droppedIndex < remainingDropped.length; droppedIndex += 1) {
      for (let addedIndex = 0; addedIndex < remainingAdded.length; addedIndex += 1) {
        const span = longestCommonTokenSpan(remainingDropped[droppedIndex].tokens, remainingAdded[addedIndex].tokens);
        if (span !== null && (best === null || span.length > best.length)) {
          best = { droppedIndex, addedIndex, sourceStart: span.sourceStart, targetStart: span.targetStart, length: span.length };
        }
      }
    }
    if (best === null) break;

    const dropped = remainingDropped[best.droppedIndex];
    const added = remainingAdded[best.addedIndex];
    result.moved.push({
      text: joined(dropped.tokens, best.sourceStart, best.sourceStart + best.length),
      context: dropped.context + " → " + added.context,
    });
    const droppedRemainders = [
      dropped.tokens.slice(0, best.sourceStart),
      dropped.tokens.slice(best.sourceStart + best.length),
    ].filter(function(tokens) { return tokens.length > 0; }).map(function(tokens) { return { tokens, context: dropped.context }; });
    const addedRemainders = [
      added.tokens.slice(0, best.targetStart),
      added.tokens.slice(best.targetStart + best.length),
    ].filter(function(tokens) { return tokens.length > 0; }).map(function(tokens) { return { tokens, context: added.context }; });
    remainingDropped.splice(best.droppedIndex, 1, ...droppedRemainders);
    remainingAdded.splice(best.addedIndex, 1, ...addedRemainders);
  }

  for (const dropped of remainingDropped) {
    result.dropped.push({ source: joined(dropped.tokens, 0, dropped.tokens.length), context: dropped.context });
  }
  for (const added of remainingAdded) {
    result.added.push({ target: joined(added.tokens, 0, added.tokens.length), context: added.context });
  }

  const fullCaseInsensitiveEqual = allSource.length === allTarget.length && allSource.every(function(token, index) {
    return token.normalized === allTarget[index].normalized;
  });
  result.verdict = fullEqual ? "verbatim" : "diverged";
  if (fullCaseInsensitiveEqual && !fullEqual && !hasAnyClassifiedChange(result)) {
    result.verdict = "diverged";
  }
  return result;
}
