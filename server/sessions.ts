import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
export const rememberedSeconds = 30 * 24 * 60 * 60;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
type Session = { digest: string; expires: number; remembered: boolean };
export function sessionStore(
  path: string,
  accessKey: string,
  now = () => Date.now(),
) {
  let sessions: Session[] = [];
  const keyHash = hash(accessKey);
  if (existsSync(path)) {
    try {
      const saved = JSON.parse(readFileSync(path, "utf8"));
      if (saved.keyHash === keyHash && Array.isArray(saved.sessions))
        sessions = saved.sessions.filter(
          (s: Session) =>
            /^[a-f0-9]{64}$/.test(s.digest) &&
            s.remembered === true &&
            Number.isFinite(s.expires) &&
            s.expires > now(),
        );
    } catch {
      /* Corrupt storage requires signing in again. */
    }
  }
  function persist() {
    sessions = sessions.filter((s) => s.expires > now()).slice(-100);
    writeFileSync(
      path + ".tmp",
      JSON.stringify({
        keyHash,
        sessions: sessions.filter((s) => s.remembered),
      }),
      { mode: 0o600 },
    );
    renameSync(path + ".tmp", path);
  }
  return {
    issue(remembered: boolean) {
      const value = randomBytes(32).toString("hex");
      const seconds = remembered ? rememberedSeconds : 8 * 60 * 60;
      sessions.push({
        digest: hash(value),
        expires: now() + seconds * 1000,
        remembered,
      });
      persist();
      return { value, seconds };
    },
    valid(value: string) {
      return (
        /^[a-f0-9]{64}$/.test(value) &&
        sessions.some((s) => s.digest === hash(value) && s.expires > now())
      );
    },
    revoke(value: string) {
      sessions = sessions.filter((s) => s.digest !== hash(value));
      persist();
    },
  };
}
