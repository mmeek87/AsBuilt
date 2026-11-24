# Matching and evidence update

AsBuilt service 0.2.1 supports `kind: "link"`, `match: "exact" | "contains"` and `occurrence: "unique" | "at_least_one"`. Existing plans retain exact/unique defaults. Only visible matches count. Presence checks may accept duplicates; required-field presence means at least one matching native field is required, not every field.

Role mismatches and exact-vs-containing mismatches are reported as check-definition uncertainties, without changing the approved criterion or inferring an app defect. Missing content in static previews remains Not verified with an unknown cause. Merely finding script tags no longer diagnoses client rendering. The bundled known static fixture retains definite missing-content failures.

Blocked resources are grouped by origin, resource type and reason (up to 40 groups). Paths, credentials, query strings and fragments are omitted because paths can also contain secrets. The overall blocked count remains separate. Counts alone do not prove an effect on any criterion.

The same observation module is used by local and isolated runners. Rebuild the local Docker image with `docker build -f Dockerfile.browser -t asbuilt-browser:local .` before using interactive previews. Old workers fail closed. No paid cloud execution is enabled by this change.

The plugin 0.1.1 documents these options and requires the updated local service. Re-upload `release/asbuilt.plugin` to update the Claude skill instructions. Restart the service / reconnect MCP if the host cached the older tool schema.
