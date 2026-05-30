const path = require('node:path');
const {
  assertPackagedXpodRuntime,
  copyXpodRuntimeNodeModules,
  getResourcesDir,
} = require('./xpod-packaged-resource.cjs');

exports.default = async function afterPackXpodResource(context) {
  const resourcesDir = getResourcesDir(context);
  const sourceRoot = path.resolve(__dirname, '..', 'build', 'xpod-resource');
  const targetRoot = path.join(resourcesDir, 'xpod');

  copyXpodRuntimeNodeModules({
    sourceRoot,
    targetRoot,
  });
  assertPackagedXpodRuntime({ root: targetRoot });
};
