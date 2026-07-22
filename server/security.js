import dns from "node:dns/promises";
import net from "node:net";

const ALLOW_PRIVATE_URLS = process.env.ALLOW_PRIVATE_URLS === "true";

export async function validatePublicHttpUrl(value, fieldName = "URL") {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, error: `${fieldName} không được để trống.` };
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return { ok: false, error: `${fieldName} không phải URL hợp lệ.` };
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return { ok: false, error: `${fieldName} chỉ được dùng http:// hoặc https://.` };
  }

  if (ALLOW_PRIVATE_URLS) return { ok: true, url };

  const hostname = url.hostname.toLowerCase();
  if (isBlockedHostname(hostname)) {
    return { ok: false, error: `${fieldName} trỏ tới địa chỉ nội bộ hoặc private, bị chặn mặc định.` };
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      return { ok: false, error: `${fieldName} trỏ tới IP nội bộ hoặc private, bị chặn mặc định.` };
    }
    return { ok: true, url };
  }

  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (addresses.some(({ address }) => isPrivateIp(address))) {
      return { ok: false, error: `${fieldName} phân giải tới IP nội bộ hoặc private, bị chặn mặc định.` };
    }
  } catch {
    // The target may only resolve inside Codex's environment. Syntax and hostname
    // checks still apply; the actual request will report the network error.
  }

  return { ok: true, url };
}

export function isBlockedHostname(hostname) {
  return hostname === 'localhost' || hostname.endsWith('.localhost') ||
    hostname === 'localhost.localdomain' || hostname === 'ip6-localhost' ||
    hostname.endsWith('.local') || hostname.endsWith('.internal');
}

export function isPrivateIp(address) {
  const version = net.isIP(address);
  if (version === 4) {
    const octets = address.split('.').map(Number);
    const [a, b] = octets;
    return a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127);
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    return normalized === '::1' || normalized === '::' ||
      normalized.startsWith('fc') || normalized.startsWith('fd') ||
      normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
      normalized.startsWith('fea') || normalized.startsWith('feb');
  }
  return false;
}

export function isSafeFilename(value) {
  return typeof value === 'string' && value === value.replace(/[^a-zA-Z0-9._-]/g, '') &&
    value !== '.' && value !== '..' && value.length <= 180;
}
