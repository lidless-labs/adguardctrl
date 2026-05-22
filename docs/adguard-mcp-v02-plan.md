<!-- content-guard: allow private-ipv4 file -->
# adguard-mcp v0.2 Implementation Plan

**Goal:** Add 13 tools to the existing adguard-mcp surface (15 -> 28), bumping to v0.2.0.

**Architecture:** Same MCP+TypeBox+vitest pattern as v0.1.1. Three phases: foundation+reads, safe-writes, destructive. Each phase is one subagent dispatch (lighter-superpowers rule, opus model). Codex review at the end of all three phases on the consolidated diff before commit.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk@^1.29`, `@sinclair/typebox@^0.34`, vitest 4, tsup, openclaw.

---

## Phase 1 (Subagent 1): Client `put` + helper + 4 Tier-1 reads

**Goal:** Add the `put` HTTP method, the `hhmmToMs` schedule helper, and 4 read-only tools.

### Task 1.1: Add `put` method to `AdGuardClient`

**Files:**
- Modify: `src/adguard-client.ts`
- Test: `tests/client.test.ts` (extend existing)

- [ ] **Step 1: Write failing test for PUT method emission.**

Add inside the existing `describe` block in `tests/client.test.ts`:

```typescript
it("emits PUT with JSON body", async () => {
  fake = await startFakeAdGuard([
    { method: "PUT", path: "/control/blocked_services/update", status: 200, body: {} },
  ]);
  const client = new AdGuardClient({ url: fake.baseUrl, username: "u", password: "p" });
  await client.put("/control/blocked_services/update", { ids: ["youtube"], schedule: null });
  const req = fake.requests.find((q) => q.method === "PUT")!;
  expect(req.method).toBe("PUT");
  expect(req.headers["content-type"]).toBe("application/json");
  expect(JSON.parse(req.body)).toEqual({ ids: ["youtube"], schedule: null });
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `npm test -- tests/client.test.ts -t "PUT"`
Expected: FAIL with "client.put is not a function" or similar.

- [ ] **Step 3: Add `put` method to `AdGuardClient`.**

In `src/adguard-client.ts`, after the `post` method (around line 40):

```typescript
async put<T = unknown>(path: string, body?: unknown): Promise<T> {
  return this.request<T>("PUT", path, body);
}
```

- [ ] **Step 4: Re-run test to verify it passes.**

Run: `npm test -- tests/client.test.ts -t "PUT"`
Expected: PASS.

### Task 1.2: Add `hhmmToMs` schedule helper

**Files:**
- Modify: `src/tools/_util.ts`
- Create: `tests/util-schedule.test.ts`

- [ ] **Step 1: Write failing tests.**

Create `tests/util-schedule.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { hhmmToMs } from "../src/tools/_util.ts";

describe("hhmmToMs", () => {
  it("passes through numbers unchanged", () => {
    expect(hhmmToMs(0)).toBe(0);
    expect(hhmmToMs(86400000)).toBe(86400000);
    expect(hhmmToMs(45000000)).toBe(45000000);
  });

  it("converts HH:MM strings to milliseconds from midnight", () => {
    expect(hhmmToMs("00:00")).toBe(0);
    expect(hhmmToMs("12:30")).toBe((12 * 60 + 30) * 60 * 1000);
    expect(hhmmToMs("23:59")).toBe((23 * 60 + 59) * 60 * 1000);
    expect(hhmmToMs("9:05")).toBe((9 * 60 + 5) * 60 * 1000);
  });

  it("accepts 24:00 as end-of-day (86400000)", () => {
    expect(hhmmToMs("24:00")).toBe(86400000);
  });

  it("throws on invalid input", () => {
    expect(() => hhmmToMs("25:00")).toThrow();
    expect(() => hhmmToMs("12:60")).toThrow();
    expect(() => hhmmToMs("not-a-time")).toThrow();
    expect(() => hhmmToMs("12")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `npm test -- tests/util-schedule.test.ts`
Expected: FAIL with "hhmmToMs is not a function" or similar.

- [ ] **Step 3: Add `hhmmToMs` to `src/tools/_util.ts`.**

Append to `src/tools/_util.ts`:

```typescript
export function hhmmToMs(value: string | number): number {
  if (typeof value === "number") return value;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) throw new Error(`schedule time must be HH:MM or milliseconds, got: ${value}`);
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (mm > 59) throw new Error(`invalid HH:MM (minutes > 59): ${value}`);
  if (h > 24 || (h === 24 && mm > 0)) throw new Error(`invalid HH:MM (max 24:00): ${value}`);
  return (h * 60 + mm) * 60 * 1000;
}
```

- [ ] **Step 4: Re-run test.**

Run: `npm test -- tests/util-schedule.test.ts`
Expected: 4 PASS.

### Task 1.3: `adguard_check_host` (Tier 1 read)

**Files:**
- Create: `src/tools/adguard_check_host.ts`
- Create: `tests/tools/check_host.test.ts`
- Modify: `src/tools/index.ts` (add export)

- [ ] **Step 1: Write failing test.**

Create `tests/tools/check_host.test.ts`:

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { startFakeAdGuard, FakeAdGuard } from "../fake-adguard.ts";
import { AdGuardClient } from "../../src/adguard-client.ts";
import { createAdguardCheckHostTool } from "../../src/tools/adguard_check_host.ts";

let fake: FakeAdGuard | null = null;
afterEach(async () => { if (fake) await fake.close(); fake = null; });

describe("adguard_check_host", () => {
  it("issues GET with query params and returns the filter decision", async () => {
    fake = await startFakeAdGuard([
      { method: "GET", path: "/control/filtering/check_host", status: 200, body: { reason: "FilteredBlackList", rules: [{ filter_list_id: 1, text: "||youtube.com^" }], service_name: "", cname: "", ip_addrs: [] } },
    ]);
    const tool = createAdguardCheckHostTool(() => new AdGuardClient({ url: fake!.baseUrl, username: "u", password: "p" }));
    const r = await tool.execute("id", { host: "youtube.com", qtype: "A", client: "192.168.1.5" });
    const payload = JSON.parse(r.content[0].text);
    expect(payload.reason).toBe("FilteredBlackList");
    const req = fake.requests[0];
    expect(req.path).toMatch(/^\/control\/filtering\/check_host\?/);
    expect(req.path).toContain("name=youtube.com");
    expect(req.path).toContain("client=192.168.1.5");
    expect(req.path).toContain("qtype=A");
  });

  it("omits client and qtype query params when not provided", async () => {
    fake = await startFakeAdGuard([
      { method: "GET", path: "/control/filtering/check_host", status: 200, body: { reason: "NotFilteredNotFound", rules: [], service_name: "", cname: "", ip_addrs: [] } },
    ]);
    const tool = createAdguardCheckHostTool(() => new AdGuardClient({ url: fake!.baseUrl, username: "u", password: "p" }));
    await tool.execute("id", { host: "example.com" });
    const req = fake.requests[0];
    expect(req.path).toContain("name=example.com");
    expect(req.path).not.toContain("client=");
    expect(req.path).not.toContain("qtype=");
  });
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `npm test -- tests/tools/check_host.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Create `src/tools/adguard_check_host.ts`.**

```typescript
import { Type } from "@sinclair/typebox";
import type { ClientFactory } from "./_util.ts";
import { InstanceArg, jsonToolResult } from "./_util.ts";

const Schema = Type.Object({
  instance: InstanceArg,
  host: Type.String({ description: "Hostname to test (e.g. 'youtube.com'). The lookup runs through AGH's filter pipeline as if the client queried it." }),
  client: Type.Optional(Type.String({ description: "Optional client IP/ClientID/name to simulate the lookup against (per-client rules differ)." })),
  qtype: Type.Optional(Type.String({ description: "DNS query type (A, AAAA, HTTPS, MX...). Default: server-side default (A)." })),
}, { additionalProperties: false });

const NAME = "adguard_check_host";

export function createAdguardCheckHostTool(getClient: ClientFactory) {
  return {
    name: NAME,
    label: "adguard: check host",
    description: "Test what AGH would do with a hostname via GET /control/filtering/check_host. Returns the filter decision, matched rules, CNAME chain, and IPs.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const args = raw as { instance?: string; host: string; client?: string; qtype?: string };
      const client = getClient(args.instance);
      const params = new URLSearchParams({ name: args.host });
      if (args.client) params.set("client", args.client);
      if (args.qtype) params.set("qtype", args.qtype);
      const result = await client.get(`/control/filtering/check_host?${params.toString()}`);
      return jsonToolResult(result);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes.**

Run: `npm test -- tests/tools/check_host.test.ts`
Expected: 2 PASS.

- [ ] **Step 5: Add export to `src/tools/index.ts`.**

Append:

```typescript
export { createAdguardCheckHostTool } from "./adguard_check_host.ts";
```

### Task 1.4: `adguard_get_blocked_services` (Tier 1 read)

**Files:**
- Create: `src/tools/adguard_get_blocked_services.ts`
- Create: `tests/tools/get_blocked_services.test.ts`
- Modify: `src/tools/index.ts`

- [ ] **Step 1: Test (happy path + empty-state).**

Create `tests/tools/get_blocked_services.test.ts`:

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { startFakeAdGuard, FakeAdGuard } from "../fake-adguard.ts";
import { AdGuardClient } from "../../src/adguard-client.ts";
import { createAdguardGetBlockedServicesTool } from "../../src/tools/adguard_get_blocked_services.ts";

let fake: FakeAdGuard | null = null;
afterEach(async () => { if (fake) await fake.close(); fake = null; });

describe("adguard_get_blocked_services", () => {
  it("returns global blocked-services schedule + ids", async () => {
    const payload = { schedule: { time_zone: "America/New_York", mon: { start: 28800000, end: 64800000 } }, ids: ["youtube", "tiktok"] };
    fake = await startFakeAdGuard([
      { method: "GET", path: "/control/blocked_services/get", status: 200, body: payload },
    ]);
    const tool = createAdguardGetBlockedServicesTool(() => new AdGuardClient({ url: fake!.baseUrl, username: "u", password: "p" }));
    const r = await tool.execute("id", {});
    const result = JSON.parse(r.content[0].text);
    expect(result.ids).toEqual(["youtube", "tiktok"]);
    expect(result.schedule.time_zone).toBe("America/New_York");
  });

  it("returns empty ids cleanly when no services blocked", async () => {
    fake = await startFakeAdGuard([
      { method: "GET", path: "/control/blocked_services/get", status: 200, body: { schedule: { time_zone: "UTC" }, ids: [] } },
    ]);
    const tool = createAdguardGetBlockedServicesTool(() => new AdGuardClient({ url: fake!.baseUrl, username: "u", password: "p" }));
    const r = await tool.execute("id", {});
    const result = JSON.parse(r.content[0].text);
    expect(result.ids).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, verify it fails.**

Run: `npm test -- tests/tools/get_blocked_services.test.ts`

- [ ] **Step 3: Create `src/tools/adguard_get_blocked_services.ts`.**

```typescript
import { Type } from "@sinclair/typebox";
import type { ClientFactory } from "./_util.ts";
import { InstanceArg, jsonToolResult } from "./_util.ts";

const Schema = Type.Object({ instance: InstanceArg }, { additionalProperties: false });
const NAME = "adguard_get_blocked_services";

export function createAdguardGetBlockedServicesTool(getClient: ClientFactory) {
  return {
    name: NAME,
    label: "adguard: get blocked services",
    description: "Get the GLOBAL blocked-services list and weekly schedule via GET /control/blocked_services/get. Schedule day ranges are milliseconds-from-midnight.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const args = raw as { instance?: string };
      const client = getClient(args.instance);
      const result = await client.get("/control/blocked_services/get");
      return jsonToolResult(result);
    },
  };
}
```

- [ ] **Step 4: Run tests, verify PASS.**

- [ ] **Step 5: Add export to `src/tools/index.ts`.**

```typescript
export { createAdguardGetBlockedServicesTool } from "./adguard_get_blocked_services.ts";
```

### Task 1.5: `adguard_get_dns_config` (Tier 1 read)

**Files:**
- Create: `src/tools/adguard_get_dns_config.ts`
- Create: `tests/tools/get_dns_config.test.ts`
- Modify: `src/tools/index.ts`

- [ ] **Step 1: Test.**

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { startFakeAdGuard, FakeAdGuard } from "../fake-adguard.ts";
import { AdGuardClient } from "../../src/adguard-client.ts";
import { createAdguardGetDnsConfigTool } from "../../src/tools/adguard_get_dns_config.ts";

let fake: FakeAdGuard | null = null;
afterEach(async () => { if (fake) await fake.close(); fake = null; });

describe("adguard_get_dns_config", () => {
  it("returns DNS config including upstreams + cache settings", async () => {
    const payload = { upstream_dns: ["1.1.1.1", "8.8.8.8"], bootstrap_dns: ["9.9.9.9"], cache_size: 4194304, blocking_mode: "default", default_local_ptr_upstreams: ["192.168.1.1"] };
    fake = await startFakeAdGuard([
      { method: "GET", path: "/control/dns_info", status: 200, body: payload },
    ]);
    const tool = createAdguardGetDnsConfigTool(() => new AdGuardClient({ url: fake!.baseUrl, username: "u", password: "p" }));
    const r = await tool.execute("id", {});
    const result = JSON.parse(r.content[0].text);
    expect(result.upstream_dns).toEqual(["1.1.1.1", "8.8.8.8"]);
    expect(result.cache_size).toBe(4194304);
  });
});
```

- [ ] **Step 2: Run test, fail.**
- [ ] **Step 3: Implementation.**

```typescript
import { Type } from "@sinclair/typebox";
import type { ClientFactory } from "./_util.ts";
import { InstanceArg, jsonToolResult } from "./_util.ts";

const Schema = Type.Object({ instance: InstanceArg }, { additionalProperties: false });
const NAME = "adguard_get_dns_config";

export function createAdguardGetDnsConfigTool(getClient: ClientFactory) {
  return {
    name: NAME,
    label: "adguard: get DNS config",
    description: "Get the DNS server config via GET /control/dns_info (upstreams, bootstrap, cache, parallel resolution, blocking mode, etc).",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const args = raw as { instance?: string };
      const client = getClient(args.instance);
      const result = await client.get("/control/dns_info");
      return jsonToolResult(result);
    },
  };
}
```

- [ ] **Step 4: Run, pass.**
- [ ] **Step 5: Add export to `src/tools/index.ts`.**

### Task 1.6: `adguard_get_safesearch_settings` (Tier 1 read)

**Files:**
- Create: `src/tools/adguard_get_safesearch_settings.ts`
- Create: `tests/tools/get_safesearch.test.ts`
- Modify: `src/tools/index.ts`

- [ ] **Step 1: Test.**

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { startFakeAdGuard, FakeAdGuard } from "../fake-adguard.ts";
import { AdGuardClient } from "../../src/adguard-client.ts";
import { createAdguardGetSafesearchSettingsTool } from "../../src/tools/adguard_get_safesearch_settings.ts";

let fake: FakeAdGuard | null = null;
afterEach(async () => { if (fake) await fake.close(); fake = null; });

describe("adguard_get_safesearch_settings", () => {
  it("returns safesearch enabled state + per-engine flags", async () => {
    const payload = { enabled: true, bing: true, duckduckgo: true, ecosia: false, google: true, pixabay: false, yandex: true, youtube: true };
    fake = await startFakeAdGuard([
      { method: "GET", path: "/control/safesearch/status", status: 200, body: payload },
    ]);
    const tool = createAdguardGetSafesearchSettingsTool(() => new AdGuardClient({ url: fake!.baseUrl, username: "u", password: "p" }));
    const r = await tool.execute("id", {});
    const result = JSON.parse(r.content[0].text);
    expect(result.enabled).toBe(true);
    expect(result.youtube).toBe(true);
    expect(result.ecosia).toBe(false);
  });
});
```

- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implementation.**

```typescript
import { Type } from "@sinclair/typebox";
import type { ClientFactory } from "./_util.ts";
import { InstanceArg, jsonToolResult } from "./_util.ts";

const Schema = Type.Object({ instance: InstanceArg }, { additionalProperties: false });
const NAME = "adguard_get_safesearch_settings";

export function createAdguardGetSafesearchSettingsTool(getClient: ClientFactory) {
  return {
    name: NAME,
    label: "adguard: get safesearch settings",
    description: "Get SafeSearch enabled state + per-engine flags via GET /control/safesearch/status.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const args = raw as { instance?: string };
      const client = getClient(args.instance);
      const result = await client.get("/control/safesearch/status");
      return jsonToolResult(result);
    },
  };
}
```

- [ ] **Step 4: Run, pass.**
- [ ] **Step 5: Add export to `src/tools/index.ts`.**

### Task 1.7: Phase 1 sanity check + commit

- [ ] Run full suite: `npm test`. All existing + ~10 new tests should pass.
- [ ] Run build: `npm run build`. No TypeScript errors.
- [ ] Stage + commit: `git add src/ tests/ && git commit -m "feat: add put method, hhmm helper, 4 tier-1 reads (check_host, get_blocked_services, get_dns_config, get_safesearch_settings)"`

---

## Phase 2 (Subagent 2): 6 Tier-2 safe-writes

Each tool follows the same pattern:
1. Write test with: (a) refuses-without-confirm, (b) happy path asserting method+path+body
2. Run, see it fail
3. Create tool file with `assertConfirmedWrite` at the top
4. Run, see it pass
5. Add export to `src/tools/index.ts`

### Task 2.1: `adguard_refresh_filter_lists`

**Files:**
- Create: `src/tools/adguard_refresh_filter_lists.ts`
- Create: `tests/tools/refresh_filter_lists.test.ts`
- Modify: `src/tools/index.ts`

Test asserts: refuses without confirm, POSTs to `/control/filtering/refresh` body `{whitelist: false}` by default, returns `{updated}`.

```typescript
import { Type } from "@sinclair/typebox";
import type { ClientFactory } from "./_util.ts";
import { InstanceArg, jsonToolResult } from "./_util.ts";
import { assertConfirmedWrite } from "../gates.ts";

const Schema = Type.Object({
  instance: InstanceArg,
  whitelist: Type.Optional(Type.Boolean({ description: "Refresh allowlist lists instead of blocklist lists. Default: false (refresh blocklists)." })),
  confirm: Type.Boolean({ description: "Must be true. Tier-2 safe-write gate." }),
}, { additionalProperties: false });

const NAME = "adguard_refresh_filter_lists";

export function createAdguardRefreshFilterListsTool(getClient: ClientFactory) {
  return {
    name: NAME,
    label: "adguard: refresh filter lists",
    description: "Force refresh subscribed filter lists immediately via POST /control/filtering/refresh. Returns the number of lists updated. Tier-2 write; requires confirm:true.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      assertConfirmedWrite(raw, NAME);
      const args = raw as { instance?: string; whitelist?: boolean };
      const client = getClient(args.instance);
      const result = await client.post("/control/filtering/refresh", { whitelist: args.whitelist === true });
      return jsonToolResult(result);
    },
  };
}
```

### Task 2.2: `adguard_add_client`

**Files:**
- Create: `src/tools/adguard_add_client.ts`
- Create: `tests/tools/add_client.test.ts`
- Modify: `src/tools/index.ts`

Test asserts: refuses without confirm, POSTs `/control/clients/add` with full client body.

```typescript
import { Type } from "@sinclair/typebox";
import type { ClientFactory } from "./_util.ts";
import { InstanceArg, jsonToolResult } from "./_util.ts";
import { assertConfirmedWrite, WriteGateError } from "../gates.ts";

const SafeSearchSchema = Type.Optional(Type.Object({
  enabled: Type.Optional(Type.Boolean()),
  bing: Type.Optional(Type.Boolean()),
  duckduckgo: Type.Optional(Type.Boolean()),
  ecosia: Type.Optional(Type.Boolean()),
  google: Type.Optional(Type.Boolean()),
  pixabay: Type.Optional(Type.Boolean()),
  yandex: Type.Optional(Type.Boolean()),
  youtube: Type.Optional(Type.Boolean()),
}, { additionalProperties: false }));

const Schema = Type.Object({
  instance: InstanceArg,
  name: Type.String({ description: "Client display name (must be unique on this instance)." }),
  ids: Type.Array(Type.String(), { minItems: 1, description: "Identifier(s) for this client: IP, MAC, ClientID, or CIDR. At least one required." }),
  use_global_settings: Type.Optional(Type.Boolean()),
  filtering_enabled: Type.Optional(Type.Boolean()),
  safebrowsing_enabled: Type.Optional(Type.Boolean()),
  parental_enabled: Type.Optional(Type.Boolean()),
  safe_search: SafeSearchSchema,
  use_global_blocked_services: Type.Optional(Type.Boolean()),
  blocked_services: Type.Optional(Type.Array(Type.String())),
  upstreams: Type.Optional(Type.Array(Type.String())),
  tags: Type.Optional(Type.Array(Type.String())),
  ignore_querylog: Type.Optional(Type.Boolean()),
  ignore_statistics: Type.Optional(Type.Boolean()),
  upstreams_cache_enabled: Type.Optional(Type.Boolean()),
  upstreams_cache_size: Type.Optional(Type.Number()),
  confirm: Type.Boolean({ description: "Must be true. Tier-2 safe-write gate." }),
}, { additionalProperties: false });

const NAME = "adguard_add_client";

export function createAdguardAddClientTool(getClient: ClientFactory) {
  return {
    name: NAME,
    label: "adguard: add client",
    description: "Register a new named client via POST /control/clients/add. Tier-2 write; requires confirm:true.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      assertConfirmedWrite(raw, NAME);
      const { instance, confirm, ...body } = raw as Record<string, unknown>;
      void confirm;
      const client = getClient(instance as string | undefined);
      await client.post("/control/clients/add", body);
      return jsonToolResult({ added: true, name: body.name });
    },
  };
}
```

### Task 2.3: `adguard_update_client`

**Files:**
- Create: `src/tools/adguard_update_client.ts`
- Create: `tests/tools/update_client.test.ts`
- Modify: `src/tools/index.ts`

Test asserts: refuses without confirm, POSTs `/control/clients/update` with NESTED body `{name, data}`.

```typescript
import { Type } from "@sinclair/typebox";
import type { ClientFactory } from "./_util.ts";
import { InstanceArg, jsonToolResult } from "./_util.ts";
import { assertConfirmedWrite } from "../gates.ts";

const Schema = Type.Object({
  instance: InstanceArg,
  name: Type.String({ description: "Current name of the client to update (used to find the existing record)." }),
  data: Type.Object({}, { additionalProperties: true, description: "Full new Client object (AGH replaces the record; this is NOT a partial merge). Include name (new), ids, and any per-client settings to preserve." }),
  confirm: Type.Boolean({ description: "Must be true. Tier-2 safe-write gate." }),
}, { additionalProperties: false });

const NAME = "adguard_update_client";

export function createAdguardUpdateClientTool(getClient: ClientFactory) {
  return {
    name: NAME,
    label: "adguard: update client",
    description: "Update an existing named client via POST /control/clients/update. Body is nested {name, data} where data replaces the full client record. Tier-2 write; requires confirm:true.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      assertConfirmedWrite(raw, NAME);
      const args = raw as { instance?: string; name: string; data: Record<string, unknown> };
      const client = getClient(args.instance);
      await client.post("/control/clients/update", { name: args.name, data: args.data });
      return jsonToolResult({ updated: true, name: args.name });
    },
  };
}
```

### Task 2.4: `adguard_set_blocked_services`

**Files:**
- Create: `src/tools/adguard_set_blocked_services.ts`
- Create: `tests/tools/set_blocked_services.test.ts`
- Modify: `src/tools/index.ts`

Test asserts: refuses without confirm, **PUT** (not POST) to `/control/blocked_services/update`, HH:MM strings converted to ms in body.

```typescript
import { Type } from "@sinclair/typebox";
import type { ClientFactory } from "./_util.ts";
import { InstanceArg, jsonToolResult, hhmmToMs } from "./_util.ts";
import { assertConfirmedWrite } from "../gates.ts";

const DayRange = Type.Object({
  start: Type.Union([Type.Number(), Type.String()], { description: "Milliseconds from midnight (0-86400000) or HH:MM string." }),
  end: Type.Union([Type.Number(), Type.String()], { description: "Milliseconds from midnight (0-86400000) or HH:MM string." }),
}, { additionalProperties: false });

const ScheduleSchema = Type.Optional(Type.Object({
  time_zone: Type.Optional(Type.String()),
  sun: Type.Optional(DayRange),
  mon: Type.Optional(DayRange),
  tue: Type.Optional(DayRange),
  wed: Type.Optional(DayRange),
  thu: Type.Optional(DayRange),
  fri: Type.Optional(DayRange),
  sat: Type.Optional(DayRange),
}, { additionalProperties: false }));

const Schema = Type.Object({
  instance: InstanceArg,
  ids: Type.Array(Type.String(), { description: "Service IDs from the catalog (youtube, instagram, tiktok, ...). Empty array clears global blocks." }),
  schedule: ScheduleSchema,
  confirm: Type.Boolean({ description: "Must be true. Tier-2 safe-write gate." }),
}, { additionalProperties: false });

const NAME = "adguard_set_blocked_services";

function normalizeSchedule(schedule: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!schedule) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schedule)) {
    if (key === "time_zone") { out[key] = value; continue; }
    if (value && typeof value === "object" && "start" in value && "end" in value) {
      const range = value as { start: string | number; end: string | number };
      out[key] = { start: hhmmToMs(range.start), end: hhmmToMs(range.end) };
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function createAdguardSetBlockedServicesTool(getClient: ClientFactory) {
  return {
    name: NAME,
    label: "adguard: set blocked services",
    description: "Set the GLOBAL blocked-services list and optional weekly schedule via PUT /control/blocked_services/update. Accepts HH:MM strings or milliseconds for schedule times. Tier-2 write; requires confirm:true.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      assertConfirmedWrite(raw, NAME);
      const args = raw as { instance?: string; ids: string[]; schedule?: Record<string, unknown> };
      const client = getClient(args.instance);
      const body: Record<string, unknown> = { ids: args.ids };
      const normalized = normalizeSchedule(args.schedule);
      if (normalized) body.schedule = normalized;
      await client.put("/control/blocked_services/update", body);
      return jsonToolResult({ set: true, count: args.ids.length });
    },
  };
}
```

### Task 2.5: `adguard_toggle_safesearch`

**Files:**
- Create: `src/tools/adguard_toggle_safesearch.ts`
- Create: `tests/tools/toggle_safesearch.test.ts`
- Modify: `src/tools/index.ts`

Test asserts: refuses without confirm, PUT to `/control/safesearch/settings` with `SafeSearchConfig` body, when enabled:false all per-engine flags forced false.

```typescript
import { Type } from "@sinclair/typebox";
import type { ClientFactory } from "./_util.ts";
import { InstanceArg, jsonToolResult } from "./_util.ts";
import { assertConfirmedWrite } from "../gates.ts";

const Schema = Type.Object({
  instance: InstanceArg,
  enabled: Type.Boolean({ description: "Target SafeSearch state globally." }),
  bing: Type.Optional(Type.Boolean()),
  duckduckgo: Type.Optional(Type.Boolean()),
  ecosia: Type.Optional(Type.Boolean()),
  google: Type.Optional(Type.Boolean()),
  pixabay: Type.Optional(Type.Boolean()),
  yandex: Type.Optional(Type.Boolean()),
  youtube: Type.Optional(Type.Boolean()),
  confirm: Type.Boolean({ description: "Must be true. Tier-2 safe-write gate." }),
}, { additionalProperties: false });

const NAME = "adguard_toggle_safesearch";

export function createAdguardToggleSafesearchTool(getClient: ClientFactory) {
  return {
    name: NAME,
    label: "adguard: toggle safesearch",
    description: "Enable or disable SafeSearch globally via PUT /control/safesearch/settings. Per-engine flags optional (default to all engines when enabling). Tier-2 write; requires confirm:true.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      assertConfirmedWrite(raw, NAME);
      const args = raw as Record<string, boolean | string | undefined>;
      const enabled = args.enabled as boolean;
      const engines = ["bing", "duckduckgo", "ecosia", "google", "pixabay", "yandex", "youtube"] as const;
      const body: Record<string, boolean> = { enabled };
      for (const e of engines) {
        if (args[e] !== undefined) body[e] = args[e] as boolean;
        else body[e] = enabled;
      }
      const client = getClient(args.instance as string | undefined);
      await client.put("/control/safesearch/settings", body);
      return jsonToolResult({ set: true, enabled });
    },
  };
}
```

### Task 2.6: `adguard_toggle_safebrowsing`

**Files:**
- Create: `src/tools/adguard_toggle_safebrowsing.ts`
- Create: `tests/tools/toggle_safebrowsing.test.ts`
- Modify: `src/tools/index.ts`

Test asserts: refuses without confirm, POSTs to `/control/safebrowsing/enable` or `/disable` based on `enabled`.

```typescript
import { Type } from "@sinclair/typebox";
import type { ClientFactory } from "./_util.ts";
import { InstanceArg, jsonToolResult } from "./_util.ts";
import { assertConfirmedWrite } from "../gates.ts";

const Schema = Type.Object({
  instance: InstanceArg,
  enabled: Type.Boolean({ description: "Target SafeBrowsing state." }),
  confirm: Type.Boolean({ description: "Must be true. Tier-2 safe-write gate." }),
}, { additionalProperties: false });

const NAME = "adguard_toggle_safebrowsing";

export function createAdguardToggleSafebrowsingTool(getClient: ClientFactory) {
  return {
    name: NAME,
    label: "adguard: toggle safebrowsing",
    description: "Enable or disable AGH SafeBrowsing via POST /control/safebrowsing/enable or /disable. Tier-2 write; requires confirm:true.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      assertConfirmedWrite(raw, NAME);
      const args = raw as { instance?: string; enabled: boolean };
      const client = getClient(args.instance);
      const path = args.enabled ? "/control/safebrowsing/enable" : "/control/safebrowsing/disable";
      await client.post(path, undefined);
      return jsonToolResult({ set: true, enabled: args.enabled });
    },
  };
}
```

### Task 2.7: Phase 2 sanity check + commit

- [ ] Run full suite: `npm test`. ~12 new tests pass (2 per tool).
- [ ] `npm run build`. Clean.
- [ ] Commit: `git add src/ tests/ && git commit -m "feat: add 6 tier-2 safe-writes (refresh_filter_lists, add_client, update_client, set_blocked_services, toggle_safesearch, toggle_safebrowsing)"`

---

## Phase 3 (Subagent 3): 3 Tier-3 destructive + registry + smoke + version bump

### Task 3.1: `adguard_delete_client`

**Files:**
- Create: `src/tools/adguard_delete_client.ts`
- Create: `tests/tools/delete_client.test.ts`
- Modify: `src/tools/index.ts`

Test asserts: refuses without (confirm AND destructive), POSTs `/control/clients/delete` body `{name}`.

```typescript
import { Type } from "@sinclair/typebox";
import type { ClientFactory } from "./_util.ts";
import { InstanceArg, jsonToolResult } from "./_util.ts";
import { assertDestructive } from "../gates.ts";

const Schema = Type.Object({
  instance: InstanceArg,
  name: Type.String({ description: "Name of the configured client to remove." }),
  confirm: Type.Boolean({ description: "Must be true. Tier-3 destructive gate." }),
  destructive: Type.Boolean({ description: "Must be true. Tier-3 destructive gate (deleting a client drops per-client rules and stats)." }),
}, { additionalProperties: false });

const NAME = "adguard_delete_client";

export function createAdguardDeleteClientTool(getClient: ClientFactory) {
  return {
    name: NAME,
    label: "adguard: delete client",
    description: "Remove a configured named client via POST /control/clients/delete. Tier-3 destructive; per-client rules + per-client filtering settings are lost. Requires confirm:true and destructive:true.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      assertDestructive(raw, NAME);
      const args = raw as { instance?: string; name: string };
      const client = getClient(args.instance);
      await client.post("/control/clients/delete", { name: args.name });
      return jsonToolResult({ deleted: true, name: args.name });
    },
  };
}
```

### Task 3.2: `adguard_clear_query_log`

**Files:**
- Create: `src/tools/adguard_clear_query_log.ts`
- Create: `tests/tools/clear_query_log.test.ts`
- Modify: `src/tools/index.ts`

**CRITICAL:** path is `/control/querylog_clear` (underscore), NOT `/control/querylog/clear`.

```typescript
import { Type } from "@sinclair/typebox";
import type { ClientFactory } from "./_util.ts";
import { InstanceArg, jsonToolResult } from "./_util.ts";
import { assertDestructive } from "../gates.ts";

const Schema = Type.Object({
  instance: InstanceArg,
  confirm: Type.Boolean({ description: "Must be true. Tier-3 destructive gate." }),
  destructive: Type.Boolean({ description: "Must be true. Tier-3 destructive gate (the query log is gone after this)." }),
}, { additionalProperties: false });

const NAME = "adguard_clear_query_log";

export function createAdguardClearQueryLogTool(getClient: ClientFactory) {
  return {
    name: NAME,
    label: "adguard: clear query log",
    description: "Wipe the AGH DNS query log via POST /control/querylog_clear. Tier-3 destructive; requires confirm:true and destructive:true.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      assertDestructive(raw, NAME);
      const args = raw as { instance?: string };
      const client = getClient(args.instance);
      await client.post("/control/querylog_clear", undefined);
      return jsonToolResult({ cleared: true });
    },
  };
}
```

### Task 3.3: `adguard_reset_stats`

**Files:**
- Create: `src/tools/adguard_reset_stats.ts`
- Create: `tests/tools/reset_stats.test.ts`
- Modify: `src/tools/index.ts`

**CRITICAL:** path is `/control/stats_reset` (underscore), NOT `/control/stats/reset`.

```typescript
import { Type } from "@sinclair/typebox";
import type { ClientFactory } from "./_util.ts";
import { InstanceArg, jsonToolResult } from "./_util.ts";
import { assertDestructive } from "../gates.ts";

const Schema = Type.Object({
  instance: InstanceArg,
  confirm: Type.Boolean({ description: "Must be true. Tier-3 destructive gate." }),
  destructive: Type.Boolean({ description: "Must be true. Tier-3 destructive gate (stats history is zeroed)." }),
}, { additionalProperties: false });

const NAME = "adguard_reset_stats";

export function createAdguardResetStatsTool(getClient: ClientFactory) {
  return {
    name: NAME,
    label: "adguard: reset stats",
    description: "Zero out the AGH stats window via POST /control/stats_reset. Tier-3 destructive; requires confirm:true and destructive:true.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      assertDestructive(raw, NAME);
      const args = raw as { instance?: string };
      const client = getClient(args.instance);
      await client.post("/control/stats_reset", undefined);
      return jsonToolResult({ reset: true });
    },
  };
}
```

### Task 3.4: Update integration smoke test

**Files:**
- Modify: `tests/integration.test.ts`

Update the assertion that counts tools-registered from `15` to `28`. If the test currently lists tool names explicitly, append the 13 new ones in tier order.

- [ ] Locate the assertion: `grep -n "15\|14\|13" tests/integration.test.ts` if numeric, else find the `expect(tools.length).toBe(...)` or `expect(...).toHaveLength(...)` line.
- [ ] Update to `28`.
- [ ] Run: `npm test -- tests/integration.test.ts`. PASS.

### Task 3.5: Bump version + update README

**Files:**
- Modify: `package.json` (version `0.1.1` -> `0.2.0`)
- Modify: `README.md` (tool count: 15 -> 28; tool table additions)

- [ ] Edit `package.json`, change version field.
- [ ] In README, locate the tool count and tool table. Add the 13 new tools in tier order with descriptions matching `docs/adguard-mcp-v02-design.md`.
- [ ] Verify `npm run build` still produces clean dist.

### Task 3.6: Phase 3 sanity check + commit

- [ ] `npm test`. All ~75 tests should pass.
- [ ] `npm run build`. Clean.
- [ ] Commit: `git add . && git commit -m "feat: add 3 tier-3 destructive (delete_client, clear_query_log, reset_stats); register 13 new tools; bump to 0.2.0"`

---

## Phase 4: Codex code review

After all three subagents complete, run Codex review on the full diff:

```bash
cd /home/user/repos/adguard-mcp
git log --oneline -5  # confirm 3 commits from phases 1-3
git diff main...HEAD > /tmp/adguard-v02-diff.txt
codex exec --sandbox read-only --ephemeral --ignore-rules --skip-git-repo-check -m gpt-5.5 - <<'EOF'
Review the diff at /tmp/adguard-v02-diff.txt for solomonneas/adguard-mcp v0.2. This adds 13 tools across read/safe-write/destructive tiers to an MCP server. Spec at /home/user/repos/adguard-mcp/docs/adguard-mcp-v02-design.md.

Focus on:
1. AGH API path correctness: querylog_clear and stats_reset MUST use underscores. blocked_services/update MUST be PUT (not POST). update_client body MUST be nested {name, data}.
2. Write-gate enforcement: every tier-2 tool calls assertConfirmedWrite; every tier-3 tool calls assertDestructive.
3. Credential redaction: no path where instance config (username/password) could leak into errors or tool output.
4. hhmmToMs edge cases: handles "24:00", rejects "25:00", "12:60", non-string non-number.
5. update_client body shape: confirm the body is {name, data}, NOT a flat merge.
6. SafeSearch toggle: when enabled:false, per-engine flags must NOT default to true.
7. Test coverage: each tool has a refuses-without-confirm test (tier 2/3) and a happy-path test asserting method+path+body.

Report blockers (must-fix), issues (should-fix), and nits separately. Under 600 words.
EOF
```

- [ ] If Codex returns blockers: dispatch a fix subagent with the blockers list.
- [ ] If Codex returns only nits: proceed.

---

## Phase 5: PR + publish

After codex sign-off:

- [ ] Branch: `git checkout -b v0.2.0-creation-destructive-tools`
- [ ] Push: `git push -u origin v0.2.0-creation-destructive-tools`
- [ ] PR via `gh pr create` with body from design doc summary.
- [ ] Once merged: tag + npm publish + ClawHub publish per `[[clawhub-cli-publish-flow]]`.
- [ ] Update profile README: change adguard-mcp line from "15 tools" to "28 tools" with the new tool categories surfaced.
- [ ] Update the local project build queue notes "Done" list with v0.2.0 entry.

## Acceptance

1. All 28 tools register at startup.
2. ~75 tests pass.
3. `npm pack` under 1 MB, no leaked secrets in dist.
4. Codex review returns no blockers.
5. v0.2.0 live on npm + ClawHub.
6. Profile README updated.
