import { fromProcessEnv, type EnvReader } from "@lidless-labs/effect-operator-kit";

export interface InstanceConfig {
  url: string;
  username: string;
  password: string;
}

export interface ResolvedConfig {
  instances: Record<string, InstanceConfig>;
  defaultInstance: string;
}

export interface SyncConfig {
  url: string;
  username?: string;
  password?: string;
}

export class NoInstancesError extends Error {
  constructor() {
    super("No AdGuard instances configured. Set ADGUARD_<NAME>_URL/USERNAME/PASSWORD for at least one instance.");
    this.name = "NoInstancesError";
  }
}

export class UnknownInstanceError extends Error {
  constructor(name: string, known: string[]) {
    super(`Unknown AdGuard instance: ${name}. Known: ${known.join(", ") || "(none)"}.`);
    this.name = "UnknownInstanceError";
  }
}

export class PartialInstanceConfigError extends Error {
  constructor(name: string, missing: string[]) {
    super(
      `Partial AdGuard instance config for '${name}': missing ${missing.join(", ")}. ` +
        `Set ADGUARD_${name.toUpperCase()}_URL, ADGUARD_${name.toUpperCase()}_USERNAME, and ADGUARD_${name.toUpperCase()}_PASSWORD together, or unset all three.`,
    );
    this.name = "PartialInstanceConfigError";
  }
}

export class UnknownDefaultInstanceError extends Error {
  constructor(name: string, known: string[]) {
    super(
      `ADGUARD_DEFAULT_INSTANCE is set to '${name}', but no such instance is configured. Known: ${known.join(", ") || "(none)"}.`,
    );
    this.name = "UnknownDefaultInstanceError";
  }
}

export class NoSyncServerError extends Error {
  constructor() {
    super("No AdGuardHome Sync server configured. Set ADGUARDHOME_SYNC_URL or ADGUARD_SYNC_URL, and optionally matching USERNAME/PASSWORD.");
    this.name = "NoSyncServerError";
  }
}

export class PartialSyncConfigError extends Error {
  constructor(missing: string[]) {
    super(
      `Partial AdGuardHome Sync config: missing ${missing.join(", ")}. ` +
        "Set ADGUARDHOME_SYNC_URL or ADGUARD_SYNC_URL, and set USERNAME/PASSWORD together when the Sync API uses auth.",
    );
    this.name = "PartialSyncConfigError";
  }
}

/**
 * Kit optionalString trims and treats whitespace-only as blank. Repo config only
 * treats undefined and exact "" as absent and preserves raw spacing in values.
 */
function presentEnvValue(env: EnvReader, key: string): string | undefined {
  const raw = env.get(key);
  if (raw === undefined || raw === "") return undefined;
  return raw;
}

/**
 * First alias key with a present (non-undefined, non-exact-"") value wins.
 * ADGUARDHOME_SYNC_* precedes ADGUARD_SYNC_* to match repo alias order.
 */
function firstPresentAlias(env: EnvReader, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = presentEnvValue(env, key);
    if (value !== undefined) return value;
  }
  return undefined;
}

/**
 * Kit optionalString lowercases via trim; default-instance lookup lowercases raw
 * without trimming so spacing is preserved in the configured name token.
 */
function readDefaultInstance(env: EnvReader): string | undefined {
  const raw = env.get("ADGUARD_DEFAULT_INSTANCE");
  if (raw === undefined || raw === "") return undefined;
  return raw.toLowerCase();
}

/**
 * Instance fields are validated via PartialInstanceConfigError with repo-specific
 * copy. Only undefined and exact "" are missing; return the raw untrimmed value.
 */
function readRequiredInstanceField(env: EnvReader, key: string): string {
  const raw = env.get(key);
  if (raw === undefined || raw === "") {
    throw new Error(`${key} is required`);
  }
  return raw;
}

export function resolveInstances(env: Record<string, string | undefined>): ResolvedConfig {
  const reader = fromProcessEnv(env as NodeJS.ProcessEnv);
  const instances: Record<string, InstanceConfig> = {};
  // Collect all candidate instance names by scanning for any of the three suffixes,
  // so a partial config (e.g. URL+USERNAME set, PASSWORD missing) still surfaces.
  const candidateNames = new Set<string>();
  const SUFFIX_RE = /^ADGUARD_([A-Z0-9_]+)_(URL|USERNAME|PASSWORD)$/;
  for (const key of Object.keys(env)) {
    const m = SUFFIX_RE.exec(key);
    if (!m) continue;
    if (m[1] === "SYNC") continue;
    if (env[key] === undefined || env[key] === "") continue;
    candidateNames.add(m[1]);
  }
  for (const upperName of candidateNames) {
    const name = upperName.toLowerCase();
    const url = presentEnvValue(reader, `ADGUARD_${upperName}_URL`);
    const username = presentEnvValue(reader, `ADGUARD_${upperName}_USERNAME`);
    const password = presentEnvValue(reader, `ADGUARD_${upperName}_PASSWORD`);
    const missing: string[] = [];
    if (!url) missing.push("URL");
    if (!username) missing.push("USERNAME");
    if (!password) missing.push("PASSWORD");
    if (missing.length > 0) {
      throw new PartialInstanceConfigError(name, missing);
    }
    instances[name] = {
      url: readRequiredInstanceField(reader, `ADGUARD_${upperName}_URL`),
      username: readRequiredInstanceField(reader, `ADGUARD_${upperName}_USERNAME`),
      password: readRequiredInstanceField(reader, `ADGUARD_${upperName}_PASSWORD`),
    };
  }
  if (Object.keys(instances).length === 0) throw new NoInstancesError();
  const explicitDefault = readDefaultInstance(reader);
  if (explicitDefault) {
    if (!instances[explicitDefault]) {
      throw new UnknownDefaultInstanceError(explicitDefault, Object.keys(instances));
    }
    return { instances, defaultInstance: explicitDefault };
  }
  const defaultInstance = instances.primary ? "primary" : Object.keys(instances).sort()[0];
  return { instances, defaultInstance };
}

export function resolveSyncConfig(env: Record<string, string | undefined>): SyncConfig | undefined {
  const reader = fromProcessEnv(env as NodeJS.ProcessEnv);
  const url = firstPresentAlias(reader, ["ADGUARDHOME_SYNC_URL", "ADGUARD_SYNC_URL"]);
  const username = firstPresentAlias(reader, ["ADGUARDHOME_SYNC_USERNAME", "ADGUARD_SYNC_USERNAME"]);
  const password = firstPresentAlias(reader, ["ADGUARDHOME_SYNC_PASSWORD", "ADGUARD_SYNC_PASSWORD"]);
  const missing: string[] = [];

  if (!url && (username || password)) missing.push("URL");
  if (username && !password) missing.push("PASSWORD");
  if (password && !username) missing.push("USERNAME");
  if (missing.length > 0) throw new PartialSyncConfigError(missing);
  if (!url) return undefined;
  return username && password ? { url, username, password } : { url };
}

export function getInstanceConfig(cfg: ResolvedConfig, name?: string): InstanceConfig {
  const resolved = (name ?? cfg.defaultInstance).toLowerCase();
  const inst = cfg.instances[resolved];
  if (!inst) throw new UnknownInstanceError(resolved, Object.keys(cfg.instances));
  return inst;
}

export function getSyncConfig(cfg: SyncConfig | undefined): SyncConfig {
  if (!cfg) throw new NoSyncServerError();
  return cfg;
}
