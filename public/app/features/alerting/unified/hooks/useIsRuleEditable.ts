import { contextSrv } from 'app/core/services/context_srv';
import { RulerRuleDTO } from 'app/types/unified-alerting-dto';

import { featureDiscoveryApi } from '../api/featureDiscoveryApi';
import { getRulesPermissions } from '../utils/access-control';
import { rulerRuleType } from '../utils/rules';

import { useFolder } from './useFolder';

interface ResultBag {
  isRulerAvailable?: boolean;
  isEditable?: boolean;
  isRemovable?: boolean;
  loading: boolean;
  error?: unknown;
}

export function useIsRuleEditable(rulesSourceName: string, rule?: RulerRuleDTO): ResultBag {
  const {
    currentData: dsFeatures,
    isLoading,
    error,
  } = featureDiscoveryApi.endpoints.discoverDsFeatures.useQuery({
    rulesSourceName,
  });

  const folderUID = rule && rulerRuleType.grafana.rule(rule) ? rule.grafana_alert.namespace_uid : undefined;

  const rulePermission = getRulesPermissions(rulesSourceName);
  const { folder, loading } = useFolder(folderUID);

  // handle discovery and data source errors
  if (error) {
    return {
      isEditable: false,
      isRemovable: false,
      loading: false,
      isRulerAvailable: false,
      error,
    };
  }

  if (!rule) {
    return { isEditable: false, isRemovable: false, loading: false };
  }

  // Grafana rules can be edited if user can edit the folder they're in
  // When RBAC is disabled access to a folder is the only requirement for managing rules
  // When RBAC is enabled the appropriate alerting permissions need to be met
  if (rulerRuleType.grafana.rule(rule)) {
    if (!folderUID) {
      throw new Error(
        `Rule ${rule.grafana_alert.title} does not have a folder uid, cannot determine if it is editable.`
      );
    }

    if (!folder) {
      // Loading or invalid folder UID
      return {
        isRulerAvailable: true,
        isEditable: false,
        isRemovable: false,
        loading,
      };
    }

    const canEditGrafanaRules = contextSrv.hasPermissionInMetadata(rulePermission.update, folder);
    const canRemoveGrafanaRules = contextSrv.hasPermissionInMetadata(rulePermission.delete, folder);

    return {
      isRulerAvailable: true,
      isEditable: canEditGrafanaRules,
      isRemovable: canRemoveGrafanaRules,
      loading: loading || isLoading,
    };
  }

  // prom rules are only editable by users with Editor role and only if rules source supports editing
  const isRulerAvailable = Boolean(dsFeatures?.rulerConfig);
  const canEditCloudRules = contextSrv.hasPermission(rulePermission.update);
  const canRemoveCloudRules = contextSrv.hasPermission(rulePermission.delete);

  return {
    isRulerAvailable,
    isEditable: canEditCloudRules && isRulerAvailable,
    isRemovable: canRemoveCloudRules && isRulerAvailable,
    loading: isLoading,
  };
}
