const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const projectRoot = __dirname;
const repositoryRoot = path.resolve(projectRoot, '../..');
const config = getDefaultConfig(projectRoot);
// Share the existing pure presentation/clarification contracts, not duplicate planners.
config.watchFolders = [repositoryRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules'), path.resolve(repositoryRoot, 'node_modules')];
module.exports = config;
