#!/usr/bin/env node

import assert from 'assert';

import { commonify } from './commonify.mjs'

const packageName = process.argv[2];
const version = process.argv[3];
const scopeName = process.argv[4];
assert(packageName);
assert(version);
assert(scopeName);

const ignoreDeps = process.argv[5] ? process.argv[5].split(',') : undefined;

const publishCommands = []; // gets mutated

await commonify({ packageName, version, scopeName, ignoreDeps, publishCommands });

console.log('Now you can publish package(s):');
publishCommands.forEach((publishCommand) => console.log(publishCommand));
