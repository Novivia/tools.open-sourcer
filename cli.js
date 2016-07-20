/**
 * Copyright 2013-present, Novivia, Inc.
 * All rights reserved.
 */

import fsExtra from "fs-extra";
import {join as joinPath} from "path";
import {parse as parseJson5} from "json5";
import {promisifyAll} from "bluebird";

const fs = promisifyAll(fsExtra);

async function getPackageInfo() {
  return parseJson5(await readFile(joinPath(process.cwd(), "package.json5")));
}

async function readFile(filename) {
  return fs.readFileAsync(filename, "utf8");
}

async function openSource() {
  // Convert `package.json5` to `package.json`.
  const packageInfo = await getPackageInfo();

  // Extract namespace.
  const [
    match,
    namespace,
    packageName,
  ] = /^@(.*)\/(.*)$/.exec(packageInfo.name);
  const newPackageName = `${namespace}-${packageName}`;

  // Rename module name from `@something/name` to `something-name`.
  packageInfo.name = newPackageName;

  // Update git repository.
  // TODO: Get from "github" git remote.

  // Remove `publishConfig` in package data.
  Reflect.deleteProperty(packageInfo, "publishConfig");

  // Remove `open-source` in package scripts.
  Reflect.deleteProperty(packageInfo.scripts, "open-source");

  // Delete `.npmrc` file.
  // TODO.

  console.log(packageInfo);
}

openSource();
