import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const REMOTE_URL_GUARD_MESSAGE =
  "The hosted endpoint only audits public http(s) URLs. file://, localhost, and private/internal addresses are not reachable. Run the local server (npx raven-mcp) for local files.";

export function isPrivateOrInternalAddress(rawAddress: string): boolean {
  const address = stripIpv6Brackets(rawAddress).toLowerCase();
  const family = isIP(address);
  if (family === 4) {
    return isPrivateIpv4(address);
  }
  if (family === 6) {
    const bytes = parseIpv6Bytes(address);
    return bytes !== null && isPrivateIpv6Bytes(bytes);
  }
  return false;
}

export async function remoteUrlGuardError(raw: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return REMOTE_URL_GUARD_MESSAGE;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return REMOTE_URL_GUARD_MESSAGE;
  }

  const hostname = stripIpv6Brackets(parsed.hostname);
  if (isPrivateOrInternalAddress(hostname) || hostnameContainsPrivateIpv4(hostname)) {
    return REMOTE_URL_GUARD_MESSAGE;
  }

  let addresses: { address: string }[] = [];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    return null;
  }

  for (let i = 0; i < addresses.length; i++) {
    if (isPrivateOrInternalAddress(addresses[i].address)) {
      return REMOTE_URL_GUARD_MESSAGE;
    }
  }
  return null;
}

export async function remoteRequestShouldAbort(
  rawUrl: string,
  resolve: (host: string) => Promise<{ address: string }[]> = defaultLookup
): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }

  const host = stripIpv6Brackets(url.hostname);
  if (host === "") {
    return false;
  }
  if (isPrivateOrInternalAddress(host) || hostnameContainsPrivateIpv4(host)) {
    return true;
  }
  if (isIP(host) !== 0) {
    return false;
  }

  let addresses: { address: string }[];
  try {
    addresses = await resolve(host);
  } catch {
    return true;
  }
  for (let i = 0; i < addresses.length; i++) {
    if (isPrivateOrInternalAddress(addresses[i].address)) {
      return true;
    }
  }
  return false;
}

function defaultLookup(host: string): Promise<{ address: string }[]> {
  return lookup(host, { all: true });
}

function stripIpv6Brackets(value: string): string {
  if (value.startsWith("[") && value.endsWith("]")) {
    return value.slice(1, -1);
  }
  return value;
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(function (part) {
    return Number(part);
  });
  if (parts.length !== 4 || parts.some(function (part) {
    return !Number.isInteger(part) || part < 0 || part > 255;
  })) {
    return false;
  }

  const a = parts[0];
  const b = parts[1];
  const c = parts[2];

  return (
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a >= 224 && a <= 239) ||
    a >= 240
  );
}

function isPrivateIpv6Bytes(bytes: number[]): boolean {
  let allZero = true;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== 0) {
      allZero = false;
      break;
    }
  }
  if (allZero) {
    return true;
  }
  let loopback = true;
  for (let i = 0; i < 15; i++) {
    if (bytes[i] !== 0) {
      loopback = false;
      break;
    }
  }
  if (loopback && bytes[15] === 1) {
    return true;
  }
  if ((bytes[0] & 0xfe) === 0xfc) {
    return true;
  }
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) {
    return true;
  }
  const quad = embeddedIpv4(bytes);
  if (quad !== null && isPrivateIpv4(quad)) {
    return true;
  }
  return false;
}

function embeddedIpv4(bytes: number[]): string | null {
  let prefixMatches = true;
  for (let i = 0; i < 10; i++) {
    if (bytes[i] !== 0) {
      prefixMatches = false;
      break;
    }
  }
  if (prefixMatches && bytes[10] === 0xff && bytes[11] === 0xff) {
    return quadFromBytes(bytes);
  }

  prefixMatches = bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b;
  if (prefixMatches) {
    for (let i = 4; i < 12; i++) {
      if (bytes[i] !== 0) {
        prefixMatches = false;
        break;
      }
    }
  }
  if (prefixMatches) {
    return quadFromBytes(bytes);
  }

  prefixMatches = true;
  for (let i = 0; i < 12; i++) {
    if (bytes[i] !== 0) {
      prefixMatches = false;
      break;
    }
  }
  if (prefixMatches) {
    return quadFromBytes(bytes);
  }

  return null;
}

function quadFromBytes(bytes: number[]): string {
  return bytes[12] + "." + bytes[13] + "." + bytes[14] + "." + bytes[15];
}

function parseIpv6Bytes(address: string): number[] | null {
  if (address.includes(".")) {
    return parseIpv4EmbeddedIpv6(address);
  }

  const halves = address.split("::");
  if (halves.length > 2) {
    return null;
  }

  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = halves.length === 2 ? 8 - left.length - right.length : 0;
  if (missing < 0 || (halves.length === 1 && left.length !== 8)) {
    return null;
  }

  const groups = left.concat(Array(missing).fill("0"), right);
  if (groups.length !== 8) {
    return null;
  }

  const bytes: number[] = [];
  for (let i = 0; i < groups.length; i++) {
    if (!/^[0-9a-f]{1,4}$/i.test(groups[i])) {
      return null;
    }
    const value = parseInt(groups[i], 16);
    bytes.push((value >> 8) & 0xff, value & 0xff);
  }
  return bytes;
}

function parseIpv4EmbeddedIpv6(address: string): number[] | null {
  const lastColon = address.lastIndexOf(":");
  if (lastColon === -1) {
    return null;
  }
  const ipv4 = address.slice(lastColon + 1);
  if (isIP(ipv4) !== 4) {
    return null;
  }

  const octets = ipv4.split(".").map(function (part) {
    return Number(part);
  });
  const head = address.slice(0, lastColon) + ":" +
    ((octets[0] << 8) | octets[1]).toString(16) + ":" +
    ((octets[2] << 8) | octets[3]).toString(16);
  return parseIpv6Bytes(head);
}

function hostnameContainsPrivateIpv4(hostname: string): boolean {
  const labels = hostname.toLowerCase().split(".");
  if (labels.length === 1) {
    const numeric = parseNumericIpv4(labels[0]);
    return numeric !== null && isPrivateIpv4(numeric);
  }

  for (let i = 0; i <= labels.length - 4; i++) {
    if (labels.slice(i, i + 4).every(function (label) { return /^\d+$/.test(label); })) {
      const candidate = labels.slice(i, i + 4).join(".");
      if (isPrivateIpv4(candidate)) {
        return true;
      }
    }
  }
  return false;
}

function parseNumericIpv4(value: string): string | null {
  let parsed: number;
  if (/^0x[0-9a-f]+$/i.test(value)) {
    parsed = parseInt(value.slice(2), 16);
  } else if (/^\d+$/.test(value)) {
    parsed = Number(value);
  } else {
    return null;
  }

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffffffff) {
    return null;
  }
  return [
    (parsed >>> 24) & 0xff,
    (parsed >>> 16) & 0xff,
    (parsed >>> 8) & 0xff,
    parsed & 0xff
  ].join(".");
}
