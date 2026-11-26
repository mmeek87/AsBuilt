import { z } from "zod";

/**
 * The feature map: everything the app does, in plain language, written by the
 * user's assistant from the code and confirmed (or corrected) by the user.
 * It lives at .asbuilt/features.json. Each feature can point to a check file
 * (.asbuilt/<check>.json). The Action never treats the map as evidence; it
 * only reports which features have checks and which don't, so coverage gaps
 * are visible instead of silent.
 */
export const FEATURE_MAP_FILE = "features.json";

const text = (max: number) => z.string().trim().min(1).max(max);

export const featureMapSchema = z
  .object({
    app: text(80).optional(),
    features: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
            name: text(120),
            who: text(60).optional(),
            where: text(200).optional(),
            check: z
              .string()
              .regex(/^[a-z0-9][a-z0-9-]{0,62}$/)
              .optional(),
            why: text(160).optional(),
            confirmed: z.boolean().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(300),
  })
  .strict()
  .superRefine((m, ctx) => {
    const seen = new Set<string>();
    for (const f of m.features) {
      if (seen.has(f.id))
        ctx.addIssue({ code: "custom", message: `Duplicate feature id "${f.id}".` });
      seen.add(f.id);
    }
  });

export type FeatureMap = z.infer<typeof featureMapSchema>;

export type Coverage = {
  total: number;
  checked: number;
  unchecked: { name: string; why?: string; confirmed?: boolean }[];
  unconfirmed: number;
  url?: string;
};

/**
 * A feature counts as checked only when its check file actually ran in this
 * workflow. A missing or broken check file leaves it unchecked.
 */
export function coverage(
  map: FeatureMap,
  ran: Set<string>,
  url?: string,
): Coverage {
  const unchecked = map.features
    .filter((f) => !f.check || !ran.has(f.check))
    .map((f) => ({
      name: f.name,
      why: f.check && !ran.has(f.check) ? `check file ${f.check}.json didn't run` : f.why,
      confirmed: f.confirmed,
    }));
  return {
    total: map.features.length,
    checked: map.features.length - unchecked.length,
    unchecked,
    unconfirmed: map.features.filter((f) => f.confirmed === false).length,
    url,
  };
}
