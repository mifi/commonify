# Commonify.js

For us who are still relying on CommonJS, or using Electron [which does not support ESM](https://github.com/electron/electron/issues/21457).

I made this tool that makes it easy to:
- Pull any ESM package from npm
- Transpile it from ESM to CommonJS using babel
- Publish it under a custom npm scope
- Recursively do the same for all dependencies


## Usage

First create your scope here: https://www.npmjs.com/org/create

```bash
yarn
node cli.mjs lowdb 3.0.0 myscope
```
This will create the package `@myscope/3.0.0` and its dependencies ready to publish to npm.

## Todo

Must support dual modules (they also have `"type": "module"` set). Example: https://github.com/yargs/yargs-parser/blob/main/package.json 
