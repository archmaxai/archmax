import { lookup } from "node:dns/promises";

const PRIVATE_RANGES = [
  { start: 0x0a000000, end: 0x0affffff }, // 10.0.0.0/8
  { start: 0xac100000, end: 0xac1fffff }, // 172.16.0.0/12
  { start: 0xc0a80000, end: 0xc0a8ffff }, // 192.168.0.0/16
  { start: 0x7f000000, end: 0x7fffffff }, // 127.0.0.0/8
  { start: 0xa9fe0000, end: 0xa9feffff }, // 169.254.0.0/16
  { start: 0x00000000, end: 0x00ffffff }, // 0.0.0.0/8
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isPrivateIPv4(ip: string): boolean {
  const num = ipv4ToInt(ip);
  return PRIVATE_RANGES.some((r) => num >= r.start && num <= r.end);
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1") return true;
  if (lower.startsWith("fe80:")) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower === "::") return true;
  if (lower.startsWith("::ffff:")) {
    const v4 = lower.slice(7);
    if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return isPrivateIPv4(v4);
  }
  return false;
}

export async function validateSafeUrl(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "Invalid URL";
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "Only HTTP(S) URLs are allowed";
  }

  const hostname = parsed.hostname;

  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    if (isPrivateIPv4(hostname)) return "URL resolves to a private/loopback address";
  } else if (hostname.startsWith("[") || hostname.includes(":")) {
    const bare = hostname.replace(/^\[|\]$/g, "");
    if (isPrivateIPv6(bare)) return "URL resolves to a private/loopback address";
  } else {
    try {
      const result = await lookup(hostname, { all: true });
      for (const entry of result) {
        if (entry.family === 4 && isPrivateIPv4(entry.address)) {
          return "URL resolves to a private/loopback address";
        }
        if (entry.family === 6 && isPrivateIPv6(entry.address)) {
          return "URL resolves to a private/loopback address";
        }
      }
    } catch {
      return "Could not resolve hostname";
    }
  }

  return null;
}
