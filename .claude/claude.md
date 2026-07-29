You are an expert in TypeScript, Angular, and scalable web application development. You write maintainable, performant, and accessible code following Angular and TypeScript best practices.

This is the RegiMenu admin tool (regi-admin): the internal Angular app for curating the food catalog — setting the approved flag, editing food metadata, serving fields, and food-list assignment. It is the primary WRITE surface for `Foods` metadata, so payload correctness matters as much as display.

## Schema-First Contract (NON-NEGOTIABLE)

JSON Schema is the single source of truth. There is no TypeScript code generator in this project by design. TS models are DERIVED from the schema by faithful transcription.

- Canonical schema location: `c:\git\regi-api\schemas` (the API repo owns the schema; this app reads from it — do NOT keep a local fork of the JSON).
- TS models live in `src/app/models/generated/`. They are hand-derived from the canonical schema and must match it EXACTLY: property names, types, required vs optional (`?`), enums.
- Regeneration method: READ the relevant schema file in `c:\git\regi-api\schemas` and (re)write the corresponding interface to mirror it precisely. Transcribe — never invent, rename, add, or drop a field that the schema doesn't have. The schema is authoritative; the `.ts` is a mirror.
- A wire-field change is a SCHEMA edit FIRST (in `c:\git\regi-api\schemas`), then the `.ts` is re-derived. NEVER change the contract by editing the `.ts`.
- Because there is no generator enforcing fidelity, this discipline is manual and mandatory: when in doubt, re-read the schema rather than trust the existing `.ts`.

### Field-change procedure
1. Edit the property in the canonical schema (`c:\git\regi-api\schemas`), plus any `required` / `$ref` / enum references.
2. Re-derive the affected TS interface in `src/app/models/generated/` to match the schema exactly.
3. Fix hand-written code the model change doesn't cover: mappers, components reading the field, AND service payloads that WRITE the field.
4. WRITE PATH IS CRITICAL HERE: when a wire field is renamed, verify the PATCH/save payload sends the NEW name. A stale field name in a save body fails silently — the server ignores the unknown field, the UI appears to succeed, and nothing persists. Always confirm the save body, not just the read.
5. `ng build`.

## Overload Traps — do NOT rename/alter these when a refactor shares a token

These are persisted product values or discriminators, unrelated to similarly-named fields. Conflating them corrupts data or routing.

- `foodListSource` enum values: `yeh`, `yeh_plus_myfoods`, `myfoods` (NOT the `regiApproved`/`yehApproved` flag)
- `defaultFoodList` value: `yeh_approved`
- `dataSource` column values (`user`, `USDA-FNDDS`, `FatSecret`) vs the `foodSource` discriminator (`food` / `userfood`) — different concepts, never conflate (a blind rename of `'user'` corrupts provenance)
- Route path strings (e.g. `/foods/search/all/yehapproved`) are URL contracts — leave unchanged unless the task explicitly renames the route

When a sweep touches a field whose token also appears above, change ONLY the typed wire field; leave the persisted/discriminator/route values alone.

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

## Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

## Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `computed()` for derived state
- Set `changeDetection: ChangeDetectionStrategy.OnPush` in `@Component` decorator
- Prefer inline templates for small components
- Prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Use the `inject()` function instead of constructor injectionadd Food ID lookup to Filters search (numeric query -> GET /foods/{id})

Typing an all-digits query in the Foods Filters search now performs a
FoodID lookup via the existing GET /foods/{id} endpoint instead of a
name substring match. Name searches are unchanged and still match both
Description and ShortDescription in the API.

- placeholder: "Food name..." -> "Food (Name or ID)..."
- add regiApiService.getFoodById(id)
- route all-digit queries to the ID endpoint; single-object result is
  handled by the existing normalizer
- treat a 404 (bad ID) as "No foods found" instead of an error toast

No API change: search already queries Description OR ShortDescription,
and the /foods/{id} endpoint already existed.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
