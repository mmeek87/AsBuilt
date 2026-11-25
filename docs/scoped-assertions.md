# Scoped and collection assertions

Criteria can now constrain observations to a semantic container:

```json
{
  "id": "result-location",
  "expected": "Every visible result belongs to Ontario",
  "kind": "text",
  "value": "Ontario",
  "match": "exact",
  "occurrence": "unique",
  "within": { "role": "article", "name": "", "each": true }
}
```

`within.name` is an exact accessible name; an empty string matches unnamed containers, not every name. Supported roles are region, dialog, navigation, main, article, listitem and group. With `each` omitted or false, exactly one visible container must match. With `each: true`, every matching visible container must satisfy the original criterion independently. `occurrence` applies inside each container. Text elsewhere on the page cannot satisfy the check or its matching diagnostics.

An empty collection cannot pass. Missing content in a static observation remains Not verified. Ambiguous single containers and collections exceeding 100 visible members are Not verified. Reports give counts and the first three non-passing member observations, using one-based indexes. Collections changing size during inspection are Not verified. This is an observation of rendered members, not a guarantee of stability, pagination completeness, backend ownership or all records in a database. A named region must actually have an accessible name; a heading inside a generic div alone does not make that div a named region.

The local and cloud worker handshake checks scoped-assertion support. Rebuild worker images before executing new scoped plans. Existing unscoped plans retain their behavior. The plan editor exposes the scope and collection choice so users can review what will run.

## Local evidence

`node --import tsx --test tests/scoped-observation.test.ts tests/observation.test.ts` exercises real Chromium DOM matching in fresh contexts. It includes correct collections, mixed locations, empty results, hidden members, misleading text outside the container and ambiguous containers, on desktop and mobile widths. These are fictional fixtures, not eBarrel tests.

The test writes an openable screenshot report to `.data/scoped-assertions/review.html` and structured observations to `results.json`. This development evidence does not appear in the separately installed AsBuilt service's Past reviews. No installation or deployment is implied.
