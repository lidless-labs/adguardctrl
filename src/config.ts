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

export function resolveInstances(env: Record<string, string | undefined>): ResolvedConfig {
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
    const url = env[`ADGUARD_${upperName}_URL`];
    const username = env[`ADGUARD_${upperName}_USERNAME`];
    const password = env[`ADGUARD_${upperName}_PASSWORD`];
    const missing: string[] = [];
    if (!url) missing.push("URL");
    if (!username) missing.push("USERNAME");
    if (!password) missing.push("PASSWORD");
    if (missing.length > 0) {
      throw new PartialInstanceConfigError(name, missing);
    }
    instances[name] = { url: url!, username: username!, password: password! };
  }
  if (Object.keys(instances).length === 0) throw new NoInstancesError();
  const explicitDefault = env.ADGUARD_DEFAULT_INSTANCE?.toLowerCase();
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
  const url = env.ADGUARDHOME_SYNC_URL || env.ADGUARD_SYNC_URL;
  const username = env.ADGUARDHOME_SYNC_USERNAME || env.ADGUARD_SYNC_USERNAME;
  const password = env.ADGUARDHOME_SYNC_PASSWORD || env.ADGUARD_SYNC_PASSWORD;
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
