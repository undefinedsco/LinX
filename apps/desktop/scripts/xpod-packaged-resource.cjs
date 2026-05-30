const fs = require('node:fs');
const path = require('node:path');

const REQUIRED_RUNTIME_DEPENDENCIES = [
  'jsonld',
];

function getResourcesDir(context) {
  if (context?.packager && typeof context.packager.getResourcesDir === 'function') {
    return context.packager.getResourcesDir(context.appOutDir);
  }

  if (process.platform === 'darwin') {
    return path.join(context.appOutDir, 'LinX.app', 'Contents', 'Resources');
  }

  return path.join(context.appOutDir, 'resources');
}

function copyXpodRuntimeNodeModules(options) {
  const sourceRoot = options.sourceRoot;
  const targetRoot = options.targetRoot;

  for (const dependencyName of REQUIRED_RUNTIME_DEPENDENCIES) {
    copyRuntimeDependencyTree({
      dependencyName,
      sourceRoot,
      targetRoot,
      copied: new Set(),
    });
  }
}

function copyRuntimeDependencyTree(options) {
  const { dependencyName, sourceRoot, targetRoot, copied } = options;
  if (copied.has(dependencyName)) {
    return;
  }

  const sourceDir = path.join(sourceRoot, 'node_modules', ...dependencyName.split('/'));
  if (!fs.existsSync(path.join(sourceDir, 'package.json'))) {
    throw new Error(`Packaged xpod resource is missing prepared runtime dependency: ${dependencyName}`);
  }

  copied.add(dependencyName);
  const targetDir = path.join(targetRoot, 'node_modules', ...dependencyName.split('/'));
  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    force: true,
    errorOnExist: false,
    dereference: true,
  });

  const packageJson = readJson(path.join(sourceDir, 'package.json'));
  for (const nestedDependencyName of Object.keys(packageJson.dependencies ?? {})) {
    copyRuntimeDependencyTree({
      dependencyName: nestedDependencyName,
      sourceRoot,
      targetRoot,
      copied,
    });
  }
}

function assertPackagedXpodRuntime(options) {
  const root = options.root;
  const missing = [];

  for (const dependencyName of REQUIRED_RUNTIME_DEPENDENCIES) {
    const packageJsonPath = path.join(root, 'node_modules', ...dependencyName.split('/'), 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      missing.push(path.relative(root, packageJsonPath));
    }
  }

  if (missing.length > 0) {
    throw new Error([
      'Packaged xpod runtime is incomplete.',
      ...missing.map((item) => `Missing: ${item}`),
    ].join('\n'));
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

module.exports = {
  REQUIRED_RUNTIME_DEPENDENCIES,
  assertPackagedXpodRuntime,
  copyXpodRuntimeNodeModules,
  getResourcesDir,
};
