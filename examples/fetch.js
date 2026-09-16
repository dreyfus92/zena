import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {instantiate, run} from '@zena-lang/runtime';

const defaultWasm = join(dirname(fileURLToPath(import.meta.url)), 'fetch.wasm');
const wasmPath = process.argv[2] ?? defaultWasm;

const wasm = readFileSync(wasmPath);
const {instance} = await instantiate(wasm, {fetch: true});
await run(instance);
