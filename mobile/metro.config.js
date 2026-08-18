const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..');
const desktopSrc = path.resolve(repoRoot, 'src');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [repoRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(repoRoot, 'node_modules'),
];

const aliases = [
  ['@desktop/', desktopSrc],
  ['~/', projectRoot],
  ['@/', desktopSrc],
];

const exactAliases = new Map([
  ['@/lib/i18n', path.resolve(projectRoot, 'lib/agents/i18n.ts')],
]);

const upstreamResolveRequest = config.resolver.resolveRequest;

function resolveUpstream(context, moduleName, platform) {
  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
}

const isBareSpecifier = (name) => !name.startsWith('.') && !path.isAbsolute(name);

const isInsideProject = (filePath) =>
  typeof filePath === 'string' && !path.relative(projectRoot, filePath).startsWith('..');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const exact = exactAliases.get(moduleName);
  if (exact) {
    return { type: 'sourceFile', filePath: exact };
  }

  for (const [prefix, target] of aliases) {
    if (moduleName.startsWith(prefix)) {
      const absolute = path.join(target, moduleName.slice(prefix.length));
      const originDir = context.originModulePath
        ? path.dirname(context.originModulePath)
        : projectRoot;
      let relative = path.relative(originDir, absolute);
      if (!relative.startsWith('.')) {
        relative = `./${relative}`;
      }
      return resolveUpstream(context, relative, platform);
    }
  }

  if (isBareSpecifier(moduleName) && !isInsideProject(context.originModulePath)) {
    return resolveUpstream(
      { ...context, originModulePath: path.join(projectRoot, 'index.js') },
      moduleName,
      platform
    );
  }

  return resolveUpstream(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
