// Authenticator-app codes (TOTP, RFC 6238) for a dedicated test account,
// from the account's setup key stored as a repository secret. The secret and
// the codes are never logged or put into results.
import { createHmac } from "node:crypto";

export function base32(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = String(secret)
    .toUpperCase()
    .replace(/[\s=-]/g, "");
  if (!clean || /[^A-Z2-7]/.test(clean)) throw Error("not a base32 setup key");
  let bits = "";
  for (const ch of clean)
    bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totp(secret, now = Date.now(), step = 30, digits = 6) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / step)));
  const mac = createHmac("sha1", base32(secret)).update(counter).digest();
  const offset = mac[mac.length - 1] & 0xf;
  const value = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(value).padStart(digits, "0");
}
