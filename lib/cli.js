/**
 * Copyright 2013-present, Novivia, Inc.
 * All rights reserved.
 */

/* eslint-disable no-console */

import fs from "fs-extra";
import Git from "nodegit";
import {join as joinPath} from "path";
import {stripIndent} from "common-tags";
import {parse as parseJson5} from "json5";

const JSON_SPACING = 2;

async function getPackageInfo() {
  return parseJson5(await readFile(joinPath(process.cwd(), "package.json5")));
}

function readFile(filename) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return fs.readFile(filename, "utf8");
}

async function openSource() {
  const basePath = process.cwd();

  // Get current Git repository.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const repository = await Git.Repository.open(basePath);
  const repositoryStatuses = await repository.getStatus();

  if (repositoryStatuses.filter(status => status.inIndex()).length > 0) {
    return console.error(
      "Your repository contains unstaged changes, aborting.",
    );
  }

  const packageInfo = await getPackageInfo();
  const branchName = `task_open-source_v${packageInfo.version}`;

  console.info(`Creating and checking out "${branchName}" branch.`);

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
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await fs.unlink(joinPath(basePath, ".npmrc"));

  console.info("Removing package.json5 file...");

  // Delete the `package.json` file.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await fs.unlink(joinPath(basePath, "package.json5"));

  console.info("Creating modified package.json file...");

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await fs.writeFile(
    joinPath(basePath, "package.json"),
    JSON.stringify(packageInfo, null, JSON_SPACING),
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

  console.info(stripIndent`
    Done! You can now push the "${branchName}" to the "github" remote and open
    a pull request. You can also publish this module to npm using "npm run
    publish".
  `);
}

async function runOpenSource() {
  try {
    await openSource();
  } catch (e) {
    console.error("An error occured:", e);
  }
}

runOpenSource();
