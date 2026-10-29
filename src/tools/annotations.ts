import { UNTRUSTED_DATA_NOTICE } from "./_util.ts";
import { annotationsFromTiers, assertNoDrift, type ToolAnnotations, type ToolTier } from "@lidless-labs/effect-operator-kit";

/**
 * Tool tier registry. Executor v2 prompts only on `destructiveHint === true`, so
 * only the Tier-1 reads are declared read-only; every Tier-2 write and Tier-3
 * destructive tool keeps the kit's fail-closed `destructiveHint: true`. A new tool
 * must be added here or `buildAllTools` throws at startup.
 */
export const TOOL_TIERS: Readonly<Record<string, ToolTier>> = {
  adguard_status: "read",
  adguard_stats: "read",
  adguard_query_log: "read",
  adguard_list_filter_lists: "read",
  adguard_list_user_rules: "read",
  adguard_list_clients: "read",
  adguard_list_blocked_services_catalog: "read",
  adguard_check_host: "read",
  adguard_get_blocked_services: "read",
  adguard_get_dns_config: "read",
  adguard_get_safesearch_settings: "read",
  adguard_list_rewrites: "read",
  adguard_get_rewrite_settings: "read",
  adguard_get_access_list: "read",
  adguard_get_querylog_config: "read",
  adguard_get_stats_config: "read",
  adguard_dhcp_status: "read",
  adguard_dhcp_interfaces: "read",
  adguard_tls_status: "read",
  adguard_sync_status: "read",
  adguard_sync_health: "read",
  adguard_sync_logs: "read",
  adguard_add_user_rule: "destructive",
  adguard_remove_user_rule: "destructive",
  adguard_add_filter_list: "destructive",
  adguard_remove_filter_list: "destructive",
  adguard_toggle_filter_list: "destructive",
  adguard_set_client_blocked_services: "destructive",
  adguard_refresh_filter_lists: "destructive",
  adguard_add_client: "destructive",
  adguard_update_client: "destructive",
  adguard_set_blocked_services: "destructive",
  adguard_toggle_safesearch: "destructive",
  adguard_toggle_safebrowsing: "destructive",
  adguard_add_rewrite: "destructive",
  adguard_update_rewrite: "destructive",
  adguard_delete_rewrite: "destructive",
  adguard_toggle_rewrites: "destructive",
  adguard_set_access_list: "destructive",
  adguard_update_querylog_config: "destructive",
  adguard_update_stats_config: "destructive",
  adguard_validate_tls_config: "destructive",
  adguard_test_upstream_dns: "destructive",
  adguard_sync_run: "destructive",
  adguard_replace_user_rules: "destructive",
  adguard_toggle_protection: "destructive",
  adguard_delete_client: "destructive",
  adguard_clear_query_log: "destructive",
  adguard_reset_stats: "destructive",
  adguard_sync_clear_logs: "destructive",
};

const ANNOTATIONS = annotationsFromTiers(TOOL_TIERS);

export function annotationsFor(name: string): ToolAnnotations {
  const annotations = ANNOTATIONS[name];
  if (!annotations) throw new Error(`no tool tier registered for ${name}`);
  return annotations;
}

/** Attach each tool's declared annotations, failing when a tool and the registry disagree. */
export function withAnnotations<T extends { name: string; description: string }>(tools: T[]): Array<T & { annotations: ToolAnnotations }> {
  assertNoDrift(tools.map((t) => t.name), TOOL_TIERS);
  return tools.map((t) => ({ ...t, description: `${t.description} ${UNTRUSTED_DATA_NOTICE}`, annotations: annotationsFor(t.name) }));
}
