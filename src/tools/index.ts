import { createAdguardStatusTool } from "./adguard_status.ts";
import { createAdguardStatsTool } from "./adguard_stats.ts";
import { createAdguardQueryLogTool } from "./adguard_query_log.ts";
import { createAdguardListFilterListsTool } from "./adguard_list_filter_lists.ts";
import { createAdguardListUserRulesTool } from "./adguard_list_user_rules.ts";
import { createAdguardListClientsTool } from "./adguard_list_clients.ts";
import { createAdguardListBlockedServicesCatalogTool } from "./adguard_list_blocked_services_catalog.ts";
import { createAdguardAddUserRuleTool } from "./adguard_add_user_rule.ts";
import { createAdguardRemoveUserRuleTool } from "./adguard_remove_user_rule.ts";
import { createAdguardAddFilterListTool } from "./adguard_add_filter_list.ts";
import { createAdguardRemoveFilterListTool } from "./adguard_remove_filter_list.ts";
import { createAdguardToggleFilterListTool } from "./adguard_toggle_filter_list.ts";
import { createAdguardSetClientBlockedServicesTool } from "./adguard_set_client_blocked_services.ts";
import { createAdguardReplaceUserRulesTool } from "./adguard_replace_user_rules.ts";
import { createAdguardToggleProtectionTool } from "./adguard_toggle_protection.ts";
import { createAdguardCheckHostTool } from "./adguard_check_host.ts";
import { createAdguardGetBlockedServicesTool } from "./adguard_get_blocked_services.ts";
import { createAdguardGetDnsConfigTool } from "./adguard_get_dns_config.ts";
import { createAdguardGetSafesearchSettingsTool } from "./adguard_get_safesearch_settings.ts";
import { createAdguardRefreshFilterListsTool } from "./adguard_refresh_filter_lists.ts";
import { createAdguardAddClientTool } from "./adguard_add_client.ts";
import { createAdguardUpdateClientTool } from "./adguard_update_client.ts";
import { createAdguardSetBlockedServicesTool } from "./adguard_set_blocked_services.ts";
import { createAdguardToggleSafesearchTool } from "./adguard_toggle_safesearch.ts";
import { createAdguardToggleSafebrowsingTool } from "./adguard_toggle_safebrowsing.ts";
import { createAdguardDeleteClientTool } from "./adguard_delete_client.ts";
import { createAdguardClearQueryLogTool } from "./adguard_clear_query_log.ts";
import { createAdguardResetStatsTool } from "./adguard_reset_stats.ts";
import { createAdguardListRewritesTool } from "./adguard_list_rewrites.ts";
import { createAdguardAddRewriteTool } from "./adguard_add_rewrite.ts";
import { createAdguardUpdateRewriteTool } from "./adguard_update_rewrite.ts";
import { createAdguardDeleteRewriteTool } from "./adguard_delete_rewrite.ts";
import { createAdguardGetRewriteSettingsTool } from "./adguard_get_rewrite_settings.ts";
import { createAdguardToggleRewritesTool } from "./adguard_toggle_rewrites.ts";
import { createAdguardGetAccessListTool } from "./adguard_get_access_list.ts";
import { createAdguardSetAccessListTool } from "./adguard_set_access_list.ts";
import { createAdguardGetQuerylogConfigTool } from "./adguard_get_querylog_config.ts";
import { createAdguardUpdateQuerylogConfigTool } from "./adguard_update_querylog_config.ts";
import { createAdguardGetStatsConfigTool } from "./adguard_get_stats_config.ts";
import { createAdguardUpdateStatsConfigTool } from "./adguard_update_stats_config.ts";
import { createAdguardDhcpStatusTool } from "./adguard_dhcp_status.ts";
import { createAdguardDhcpInterfacesTool } from "./adguard_dhcp_interfaces.ts";
import { createAdguardTlsStatusTool } from "./adguard_tls_status.ts";
import { createAdguardValidateTlsConfigTool } from "./adguard_validate_tls_config.ts";
import { createAdguardTestUpstreamDnsTool } from "./adguard_test_upstream_dns.ts";
import { createAdguardSyncStatusTool } from "./adguard_sync_status.ts";
import { createAdguardSyncHealthTool } from "./adguard_sync_health.ts";
import { createAdguardSyncLogsTool } from "./adguard_sync_logs.ts";
import { createAdguardSyncRunTool } from "./adguard_sync_run.ts";
import { createAdguardSyncClearLogsTool } from "./adguard_sync_clear_logs.ts";
import { withAnnotations } from "./annotations.ts";
import type { ClientFactory, SyncClientFactory } from "./_util.ts";

export {
  createAdguardStatusTool,
  createAdguardStatsTool,
  createAdguardQueryLogTool,
  createAdguardListFilterListsTool,
  createAdguardListUserRulesTool,
  createAdguardListClientsTool,
  createAdguardListBlockedServicesCatalogTool,
  createAdguardAddUserRuleTool,
  createAdguardRemoveUserRuleTool,
  createAdguardAddFilterListTool,
  createAdguardRemoveFilterListTool,
  createAdguardToggleFilterListTool,
  createAdguardSetClientBlockedServicesTool,
  createAdguardReplaceUserRulesTool,
  createAdguardToggleProtectionTool,
  createAdguardCheckHostTool,
  createAdguardGetBlockedServicesTool,
  createAdguardGetDnsConfigTool,
  createAdguardGetSafesearchSettingsTool,
  createAdguardRefreshFilterListsTool,
  createAdguardAddClientTool,
  createAdguardUpdateClientTool,
  createAdguardSetBlockedServicesTool,
  createAdguardToggleSafesearchTool,
  createAdguardToggleSafebrowsingTool,
  createAdguardDeleteClientTool,
  createAdguardClearQueryLogTool,
  createAdguardResetStatsTool,
  createAdguardListRewritesTool,
  createAdguardAddRewriteTool,
  createAdguardUpdateRewriteTool,
  createAdguardDeleteRewriteTool,
  createAdguardGetRewriteSettingsTool,
  createAdguardToggleRewritesTool,
  createAdguardGetAccessListTool,
  createAdguardSetAccessListTool,
  createAdguardGetQuerylogConfigTool,
  createAdguardUpdateQuerylogConfigTool,
  createAdguardGetStatsConfigTool,
  createAdguardUpdateStatsConfigTool,
  createAdguardDhcpStatusTool,
  createAdguardDhcpInterfacesTool,
  createAdguardTlsStatusTool,
  createAdguardValidateTlsConfigTool,
  createAdguardTestUpstreamDnsTool,
  createAdguardSyncStatusTool,
  createAdguardSyncHealthTool,
  createAdguardSyncLogsTool,
  createAdguardSyncRunTool,
  createAdguardSyncClearLogsTool,
};

/**
 * Canonical, ordered list of every tool the package exposes.
 * Both `mcp-server.ts` (stdio MCP entry) and `index.ts` (OpenClaw plugin entry)
 * register from this single source so the production tool count stays in lockstep.
 */
export function buildAllTools(getClient: ClientFactory, getSyncClient: SyncClientFactory) {
  return withAnnotations([
    // Tier 1: reads
    createAdguardStatusTool(getClient),
    createAdguardStatsTool(getClient),
    createAdguardQueryLogTool(getClient),
    createAdguardListFilterListsTool(getClient),
    createAdguardListUserRulesTool(getClient),
    createAdguardListClientsTool(getClient),
    createAdguardListBlockedServicesCatalogTool(getClient),
    createAdguardCheckHostTool(getClient),
    createAdguardGetBlockedServicesTool(getClient),
    createAdguardGetDnsConfigTool(getClient),
    createAdguardGetSafesearchSettingsTool(getClient),
    createAdguardListRewritesTool(getClient),
    createAdguardGetRewriteSettingsTool(getClient),
    createAdguardGetAccessListTool(getClient),
    createAdguardGetQuerylogConfigTool(getClient),
    createAdguardGetStatsConfigTool(getClient),
    createAdguardDhcpStatusTool(getClient),
    createAdguardDhcpInterfacesTool(getClient),
    createAdguardTlsStatusTool(getClient),
    createAdguardSyncStatusTool(getSyncClient),
    createAdguardSyncHealthTool(getSyncClient),
    createAdguardSyncLogsTool(getSyncClient),
    // Tier 2: safe writes (confirm: true)
    createAdguardAddUserRuleTool(getClient),
    createAdguardRemoveUserRuleTool(getClient),
    createAdguardAddFilterListTool(getClient),
    createAdguardRemoveFilterListTool(getClient),
    createAdguardToggleFilterListTool(getClient),
    createAdguardSetClientBlockedServicesTool(getClient),
    createAdguardRefreshFilterListsTool(getClient),
    createAdguardAddClientTool(getClient),
    createAdguardUpdateClientTool(getClient),
    createAdguardSetBlockedServicesTool(getClient),
    createAdguardToggleSafesearchTool(getClient),
    createAdguardToggleSafebrowsingTool(getClient),
    createAdguardAddRewriteTool(getClient),
    createAdguardUpdateRewriteTool(getClient),
    createAdguardDeleteRewriteTool(getClient),
    createAdguardToggleRewritesTool(getClient),
    createAdguardSetAccessListTool(getClient),
    createAdguardUpdateQuerylogConfigTool(getClient),
    createAdguardUpdateStatsConfigTool(getClient),
    createAdguardValidateTlsConfigTool(getClient),
    createAdguardTestUpstreamDnsTool(getClient),
    createAdguardSyncRunTool(getSyncClient),
    // Tier 3: destructive (confirm: true + destructive: true)
    createAdguardReplaceUserRulesTool(getClient),
    createAdguardToggleProtectionTool(getClient),
    createAdguardDeleteClientTool(getClient),
    createAdguardClearQueryLogTool(getClient),
    createAdguardResetStatsTool(getClient),
    createAdguardSyncClearLogsTool(getSyncClient),
  ]);
}
