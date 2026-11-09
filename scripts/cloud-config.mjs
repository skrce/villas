import { isAbsolute, relative, resolve } from 'node:path';

export function validateCloudConfig(config, root) {
  if (!config || Array.isArray(config) || typeof config !== 'object' ||
      !/^villas-[a-z0-9-]{1,23}[a-z0-9]$/.test(config.projectId ?? '') ||
      !['staging', 'production'].includes(config.environment) ||
      !/^[A-Za-z0-9._%+-]+@gmail\.com$/.test(config.account ?? '') ||
      config.configuration !== 'villas-personal' ||
      !/^[a-z0-9-]+$/.test(config.stateBucket ?? '') || !config.stateBucket.startsWith(`${config.projectId}-`) ||
      ![config.gcloudConfigDir, config.variablesFile, config.terraformBinary, config.gcloudBinary].every(path => typeof path === 'string' && isAbsolute(path))) {
    throw new Error('Use the separate Villas project, personal Gmail identity, villas-personal gcloud configuration and absolute operator paths.');
  }
  for (const path of [config.gcloudConfigDir, config.variablesFile]) {
    const location = relative(resolve(root), resolve(path));
    if (!location.startsWith('..') && !isAbsolute(location)) throw new Error('Keep personal cloud credentials and variable files outside the repository.');
  }
  return config;
}
