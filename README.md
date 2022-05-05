# Commonify.js

For us who are still relying on CommonJS, or using Electron [which does not support ESM](https://github.com/electron/electron/issues/21457).

🆕 See also [build-electron](https://github.com/mifi/build-electron)

I made this tool that makes it easy to:
- Pull any ESM package from npm
- Transpile it from ESM to CommonJS using babel
- Publish it under a custom npm scope
- Recursively do the same for all dependencies

**It is mostly an experiment**, and it feels like a step back in terms of the ecosystem moving to ESM, so if anyone has any other great ideas, please submit an issue! I have thought about the possibility of doing something similar to the `node_modules` folder in an npm `postinstall` script.

## Usage

First create your scope here: https://www.npmjs.com/org/create

```bash
git clone https://github.com/mifi/commonify.git
cd commonify

yarn
node cli.mjs lowdb 3.0.0 myscope
```
This will create the package `@myscope/lowdb` and its dependencies ready to publish to npm.

## Example packages

I will publish commonified packages to the `@commonify` scope:
- `@commonify/lowdb`
- `@commonify/steno`
- `@commonify/execa`
- `@commonify/strip-final-newline`
- `@commonify/onetime`
- `@commonify/mimic-fn`
- `@commonify/npm-run-path`
- `@commonify/path-key`
- `@commonify/is-stream`

## Todo

- **Support already scoped packages**
- Must support dual modules (they also have `"type": "module"` set). Example: https://github.com/yargs/yargs-parser/blob/main/package.json 
- Automate when upstream package version updates
- Auto-generate a list of versions and their version corresponding to upstream version
