import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { build } from "esbuild";
import { expect, it } from "vitest";

// Run the real hook with an explicitly supplied existing React/renderer installation. No downloads.
it.skipIf(!process.env.MORPHISE_REACT_RUNTIME)("owns conversation outcomes by query and reports unavailable, failed and pending searches", async () => {
  const temp = await mkdtemp(join(tmpdir(), "morphise-search-test-"));
  try {
    const bundle = await build({ entryPoints: [join(__dirname, "conversation-hits.ts")], bundle: true, platform: "node", format: "cjs", write: false, external: ["react"] });
    await writeFile(join(temp, "hook.cjs"), bundle.outputFiles[0]!.text);
    const runner = `
const assert=require('node:assert/strict');const Module=require('node:module');
const runtime=process.env.MORPHISE_REACT_RUNTIME;const React=require(runtime+'/react');const {create,act}=require(runtime+'/react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const hook=new Module(process.argv[2]);hook.filename=process.argv[2];hook.paths=[runtime];hook._compile(require('fs').readFileSync(process.argv[2],'utf8'),process.argv[2]);
const {useConversationHits}=hook.exports;let value;let calls=[];let timer;
global.setTimeout=f=>{timer=f;return 1};global.clearTimeout=()=>{timer=null};
const client={rpc:(_contract,input)=>new Promise((resolve,reject)=>calls.push({input,resolve,reject}))};
const agents=[{id:'a'}];function Probe({query='needle',on=true}){value=useConversationHits(client,agents,query,on,()=>false);return null}
(async()=>{let tree;await act(async()=>{tree=create(React.createElement(Probe))});
assert.equal(value.pending,1,'pending includes debounce');await act(async()=>timer());
await act(async()=>calls[0].resolve({match:null,nextCursor:null,unavailable:'No readable provider log'}));
assert.deepEqual(value.problems,['No readable provider log']);assert.equal(value.pending,0);
await act(async()=>tree.update(React.createElement(Probe,{query:'second'})));await act(async()=>timer());
await act(async()=>calls[1].resolve({match:'second excerpt',nextCursor:null,unavailable:null}));assert.equal(value.hits.get('a'),'second excerpt');
await act(async()=>tree.update(React.createElement(Probe,{query:'third'})));assert.equal(value.hits.size,0);await act(async()=>timer());
await act(async()=>tree.update(React.createElement(Probe,{query:'fourth'})));await act(async()=>calls[2].resolve({match:'third stale',nextCursor:null,unavailable:null}));assert.equal(value.hits.size,0);
await act(async()=>timer());await act(async()=>calls[3].reject(new Error('Synthetic RPC failed')));assert.deepEqual(value.problems,['Synthetic RPC failed']);assert.equal(value.pending,0);
await act(async()=>tree.update(React.createElement(Probe,{query:'',on:true})));assert.equal(value.pending,0);assert.equal(timer,null);
await act(async()=>tree.update(React.createElement(Probe,{query:'x'.repeat(1001),on:true})));assert.equal(timer,null);assert.deepEqual(value.problems,['Search must be 1000 characters or fewer']);
await act(async()=>tree.update(React.createElement(Probe,{query:'needle',on:false})));assert.equal(value.hits.size,0);assert.equal(value.pending,0);assert.equal(timer,null);
await act(async()=>tree.unmount());console.log('PASS hook outcomes, pending, stale query, disabled, empty, overlong');})().catch(e=>{console.error(e);process.exitCode=1});`;
    const script = join(temp, "run.cjs");
    await writeFile(script, runner);
    const result = await promisify(execFile)(process.execPath, [script, join(temp, "hook.cjs")], { timeout: 15000 });
    expect(result.stdout).toContain("PASS hook outcomes");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
