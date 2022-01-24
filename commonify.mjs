#!/usr/bin/env node
import { execa } from 'execa';
import { mkdirp, pathExists } from 'fs-extra';
import { readFile, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import assert from 'assert';
import semver from 'semver';
import pMap from 'p-map';


async function getNpmPackageJson(query) {
  try {
    const { stdout } = await execa('npm', ['view', query, '--json']);
    if (!stdout) return undefined;
    const packageJson = JSON.parse(stdout);
    if (Array.isArray(packageJson)) return packageJson[packageJson.length - 1]; // latest matching version
    return packageJson;
  } catch (err) {
    // wow what an ugly hack
    // https://github.com/npm/cli/issues/2740
    if (err.stdout.includes('"code": "E404",')) {
      return undefined;
    }
  }
}

export async function commonify({ packageName, version: versionIn, scopeName, depth = 0, maxDepth = 3, publishNewIfExists = true, ignoreDeps = [], publishCommands = [] }) {
  if (depth > maxDepth) throw new Error('max recursion depth reached');

  assert(!scopeName.includes('@'), 'Do not include @ in the scope name');

  console.log('commonify', packageName, versionIn, scopeName);

  let version = versionIn;
  if (!semver.valid(version)) {
    console.log('Resolving version', packageName, version);
    const resolvedPackage = await getNpmPackageJson(`${packageName}@${version.replace(/\s/g, '')}`);
    assert(resolvedPackage, `Failed to resolve ${packageName} ${version}`);
    version = resolvedPackage.version;
  }

  const getNewPackageName = (p) => `@${scopeName}/${p}`;

  const newPackageName = getNewPackageName(packageName);

  let newPackageVersion;

  // already have a version published?
  const existingCommonifiedPackage = await getNpmPackageJson(`${newPackageName}@^${version}`);
  if (existingCommonifiedPackage) {
    if (!publishNewIfExists) {
      return {
        newPackageName,
        newPackageVersion: existingCommonifiedPackage.version,
      };
    }

    const incrementedVersion = semver.inc(existingCommonifiedPackage.version, 'patch');
    console.log('Upgrading existing version', existingCommonifiedPackage.version, '->', incrementedVersion);
    assert(incrementedVersion !== null);
    newPackageVersion = incrementedVersion;
  } else {
    const pkg = await getNpmPackageJson(`${packageName}@${version}`);
    assert(pkg, `Cannot find package ${packageName} in npm`);

    if (pkg.type !== 'module') {
      console.log(packageName, 'is not a module, skippiung');
      return undefined;
    }

    console.log('Creating initial (or new major) version based on source package', pkg.version);
    newPackageVersion = pkg.version;
  }

  let mappedDependencies = [];

  async function mapPackage(sourcePackage, sourceVersion) {
    const npmViewQuery = `${getNewPackageName(sourcePackage)}@${sourceVersion.replace(/\s/g, '')}`; // todo may need to add ^ or ~
    const actualDepPackage = await getNpmPackageJson(npmViewQuery);

    let commonifiedDependencyName;
    let commonifiedDependencyVersion;

    if (ignoreDeps.includes(sourcePackage)) {
      console.log('dep ignore', sourcePackage, sourceVersion);
      return {
        pkg: sourcePackage,
        version: sourceVersion,
      };
    }

    if (actualDepPackage) {
      commonifiedDependencyName = getNewPackageName(sourcePackage);
      commonifiedDependencyVersion = actualDepPackage.version;

      assert(semver.valid(actualDepPackage.version), `Invalid ${actualDepPackage.version}`);
    } else {
      console.log(`Cannot find commonified dependency matching ${npmViewQuery}. Will recursively commonify it`);
      const resp = await commonify({ packageName: sourcePackage, version: sourceVersion, scopeName, depth: depth + 1, maxDepth, publishNewIfExists: false, publishCommands });

      if (!resp) {
        console.log('dep pass thru', sourcePackage, sourceVersion);
        return {
          pkg: sourcePackage,
          version: sourceVersion,
        };
      }

      const { newPackageName: depNewPackageName, newPackageVersion: depNewPackageVersion } = resp;
      commonifiedDependencyName = depNewPackageName;
      commonifiedDependencyVersion = depNewPackageVersion;
    }

    mappedDependencies.push({ from: sourcePackage, to: commonifiedDependencyName });

    return {
      pkg: commonifiedDependencyName,
      version: commonifiedDependencyVersion, // todo improve?
    };
  }

  const packageFullName = `${packageName}@${version}`;
  const archiveName = `${packageName}-${version}`;
  const archivePath = `${archiveName}.tgz`;

  const extractedPath = join(archiveName, 'package');
  const transpiledPath = join(archiveName, 'transpiled')

  await execa('mv', [archiveName, `${archiveName}-${new Date().getTime()}`]).catch(() => {});

  if (!(await pathExists(archivePath))) await execa('npm', ['pack', packageFullName]);
  await execa('tar', ['xf', archivePath]);
  await mkdirp(archiveName);
  await execa('mv', ['package', archiveName]);

  const packageJsonOriginal = JSON.parse(await readFile(join(archiveName, 'package', 'package.json'), 'utf-8'));

  // console.log(packageJsonOriginal);

  assert(packageJsonOriginal.exports); // todo validate more?

  async function convertDependencies(sourceDependencies) {
    if (!sourceDependencies) return sourceDependencies;

    return Object.fromEntries(await pMap(Object.entries(sourceDependencies), async ([sourcePackage, sourceVersion]) => {
      const { pkg, version } = await mapPackage(sourcePackage, sourceVersion);
      return [pkg, version];
    }, { concurrency: 1 }));
  }

  const newPackageJson = {
    name: newPackageName, // todo handle already scoped packages
    version: newPackageVersion,
    description: `CommonJS version of ${packageName} ${version}. See https://github.com/mifi/commonify`,
    keywords: packageJsonOriginal.keywords,
    homepage: packageJsonOriginal.homepage,
    repository: packageJsonOriginal.repository,
    license: packageJsonOriginal.license,
    author: packageJsonOriginal.author,
    main: packageJsonOriginal.exports,
    files: packageJsonOriginal.files, // todo what if .mjs
    directories: packageJsonOriginal.directories, // todo what if .mjs
    scripts: {}, // don't need?
    engines: packageJsonOriginal.engines,
    dependencies: await convertDependencies(packageJsonOriginal.dependencies),
    devDependencies: packageJsonOriginal.devDependencies,
    optionalDependencies: packageJsonOriginal.optionalDependencies, // todo?

    // todo more?
  };

  console.log('new package.json', newPackageJson);

  const babelRcPath = resolve(`babelrc-${new Date().getTime()}.json`);

  await writeFile(babelRcPath, JSON.stringify({
    plugins: [
      ['module-resolver', {
        alias: Object.fromEntries(mappedDependencies.map(({ from, to }) => [from, to])),
      }],
      '@babel/plugin-transform-modules-commonjs',
    ],
  }, null, 2));

  await execa('npx', ['babel', `${extractedPath}`, '-d', transpiledPath, '--config-file', babelRcPath]);
  await execa('cp', ['-r', `${transpiledPath}/`, `${join(archiveName, 'package')}/`]);

  await writeFile(join(archiveName, 'package', 'package.json'), JSON.stringify(newPackageJson, null, 2));

  console.log('ready to publish');

  publishCommands.push(`(cd ${join(archiveName, 'package')} && npm publish --access=public)`);

  return {
    newPackageName,
    newPackageVersion,
  };
}
