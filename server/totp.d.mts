export function base32(secret: string): Buffer;
export function totp(
  secret: string,
  now?: number,
  step?: number,
  digits?: number,
): string;
