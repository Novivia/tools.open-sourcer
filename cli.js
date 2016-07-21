/**
 * Copyright 2013-present, Novivia, Inc.
 * All rights reserved.
 */

import fsExtra from "fs-extra";
import Git from "nodegit";
import {join as joinPath} from "path";
import {noMultiSpaceAfterLineFeed} from "tempura";
import {parse as parseJson5} from "json5";
import {promisifyAll} from "bluebird";

const fs = promisifyAll(fsExtra);

async function getPackageInfo() {
  return parseJson5(await readFile(joinPath(process.cwd(), "package.json5")));
}

async function readFile(filename) {
  return fs.readFileAsync(filename, "utf8");
}

function unscopeModuleName(moduleName) {
  // Extract namespace.
  const [
    match,
    namespace,
    packageName,
  ] = /^@(.*)\/(.*)$/.exec(moduleName);

  return {
    originalName: packageName,
    originalScope: namespace,
    unscopedName: `${namespace}-${packageName}`,
  };
}

async function openSource() {
  const basePath = process.cwd();

  // Get current Git repository.
  const repository = await Git.Repository.open(basePath);
  const repositoryStatuses = await repository.getStatus();

  if (repositoryStatuses.filter(status => status.inIndex()).length > 0) {
    console.error("Your repository contains unstaged changes, aborting.");
    return;
  }

  const packageInfo = await getPackageInfo();
  const branchName = `task_open-source_v${packageInfo.version}`;

  console.info(`Creating and checking out "${branchName}" branch.`);

  // const headCommit = await repository.getHeadCommit();
  const defaultSignature = repository.defaultSignature();
  const newGitBranch = await repository.createBranch(
    branchName,
    await repository.getHeadCommit(),
    0,
    defaultSignature,
    `Created ${branchName} on HEAD`,
  );

  await repository.checkoutBranch(newGitBranch);

  console.info("Updating package data...");

  // Extract namespace.
  const {
    unscopedName,
  } = unscopeModuleName(packageInfo.name);

  // Rename module name from `@something/name` to `something-name`.
  // packageInfo.name = unscopedName;

  // const dependencyTypes = [
  //   "dependencies",
  //   "devDependencies",
  //   "peerDependencies",
  // ];
  // for (const dependencyType of dependencyTypes)

  // Update git repository.
  const githubRemote = await repository.getRemote("github");
  const githubRemoteUrl = githubRemote.url() || githubRemote.pushurl();

  if (githubRemoteUrl) {
    packageInfo.repository.url = githubRemoteUrl;
    console.info("Git url set to:", githubRemoteUrl);
  }

  // Remove `publishConfig` from package data.
  Reflect.deleteProperty(packageInfo, "publishConfig");

  // Remove `open-source` from package scripts.
  Reflect.deleteProperty(packageInfo.scripts, "open-source");

  // Remove `@novivia/open-sourcer` from development dependencies.
  Reflect.deleteProperty(packageInfo.devDependencies, "@novivia/open-sourcer");

  console.info("Removing .npmrc file...");

  // Delete the `.npmrc` file.
  await fs.unlinkAsync(joinPath(basePath, ".npmrc"));

  console.info("Removing package.json5 file...");

  // Delete the `package.json` file.
  await fs.unlinkAsync(joinPath(basePath, "package.json5"));

  console.info("Creating modified package.json file...");

  await fs.writeFileAsync(
    joinPath(basePath, "package.json"),
    JSON.stringify(packageInfo, null, 2),
  );

  console.info("Tracking package.json file...");
  const repositoryIndex = await repository.refreshIndex();

  await repositoryIndex.addByPath("package.json");
  repositoryIndex.removeByPath("package.json5");
  repositoryIndex.removeByPath(".npmrc");
  await repositoryIndex.write();

  console.info("Committing changes...");
  await repository.createCommit(
    "HEAD",
    defaultSignature,
    defaultSignature,
    `Open-sourced version ${packageInfo.version}.`,
    await repositoryIndex.writeTree(),
    [await repository.getCommit(await repository.getHeadCommit())],
  );

  console.info(noMultiSpaceAfterLineFeed`
    Done! You can now push the "${branchName}" to the "github" remote and open
    a pull request. You can also publish this module to npm using "npm run
    publish".
  `);
}

async function runOpenSource() {
  try {
    await openSource();
  } catch(e) {
    console.error("An error occured:", e);
  }
}

runOpenSource();
