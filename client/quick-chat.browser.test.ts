import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { build } from "esbuild";
import { expect, it } from "vitest";

// Supply existing React Native Web and Playwright installations; never install dependencies here.
it.skipIf(!process.env.MORPHISE_UI_RUNTIME || !process.env.PLAYWRIGHT_MODULE)("keeps Quick Chat task-first and preserves independent handoff/recovery state", { timeout: 60000 }, async () => {
  const temp = await mkdtemp(join(tmpdir(), "morphise-quick-chat-ui-"));
  const runtime = process.env.MORPHISE_UI_RUNTIME!;
  const root = resolve(__dirname, "..");
  try {
    const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{QuickChatScreen}from'${root}/client/quick-chat';
const dark={surface0:'#141414',surface1:'#232323',surface2:'#303030',foreground:'#f0f0f0',foregroundMuted:'#aaaaaa',border:'#494949',accent:'#68b5a7',accentForeground:'#121212',statusDanger:'#ee8d91',statusSuccess:'#83c997',statusWarning:'#e4bf78'};
const light={...dark,surface0:'#ffffff',surface1:'#f2f3f5',surface2:'#e3e6e9',foreground:'#20242a',foregroundMuted:'#535d69',border:'#a9b0ba',accent:'#226e62',accentForeground:'#ffffff',statusDanger:'#a3222b'};
const ready={entries:[{provider:'fake',label:'Fake',status:'ready',enabled:true,models:[{id:'test',label:'Test'}]}]};
window.fixture={calls:[],opened:null,params:{},delay:false,resolve:null};
const client={paseo:{providers:{subscribe:fn=>{window.fixture.providers=fn;return()=>{}},snapshot:async()=>ready}},rpc:async(c,input)=>{window.fixture.calls.push(c.name);switch(c.name){
case'quick-chat.list':return{enabled:true,directory:'/synthetic/scratch',chats:[{id:'source',title:'Synthetic idea',workspaceId:'scratch'},{id:'second',title:'Another idea',workspaceId:'scratch-2'}]};
case'quick-chat.start':return{agentId:'new-agent',workspaceId:'new-scratch',directory:'/synthetic/new'};
case'quick-chat.targets':return{targets:[{id:'project',title:'Demo project',directory:'/synthetic/'+('long-project-folder/'.repeat(8))+'project'}]};
case'quick-chat.prepare':{const preview={previewId:'12345678-1234-4234-8234-123456789abc',text:'Quoted synthetic idea',provider:'fake/test',directory:'/synthetic/'+('long-project-folder/'.repeat(8))+'project',entries:12,partial:true,files:['idea.txt'],filesPartial:true};return window.fixture.delay?new Promise(r=>window.fixture.resolve=()=>r(preview)):preview;}
case'quick-chat.continue':if(window.fixture.failCreate)throw Error('Creation response lost');return{agentId:'destination',workspaceId:'project',warning:null};
case'quick-chat.recover':if(window.fixture.failRecover)throw Error('Result not confirmed');window.fixture.recoveryInput=input.operationId;return{agentId:'recovered',workspaceId:'other-project',warning:'Recovered a different operation'};
default:throw Error(c.name)}}};
const app=createRoot(document.getElementById('root'));window.render=()=>app.render(<QuickChatScreen client={client} theme={{colors:location.search.includes('light')?light:dark}} host={{id:'test',label:'Test'}} layout={{compact:innerWidth<600,platform:'web'}} params={window.fixture.params} navigation={{openWorkspace:x=>window.fixture.opened=x.workspaceId,openAgent:x=>window.fixture.opened=x.agentId}}/>);window.render();`;
    const settings = `import{useState}from'react';export function useSettings(def){const[values,setValues]=useState(()=>def.schema.parse({}));return{status:'ready',values,revision:'r',saving:false,save:async v=>{setValues(v);return true}}}export const useAgent=()=>null;export const useAgents=()=>[];`;
    const host = `import React from'react';import{Text,TextInput,ScrollView}from'react-native';export{TextInput,ScrollView};export const Icon=()=> <Text aria-hidden>·</Text>;export const SidebarRow=()=>null;export const Markdown=()=>null;export const Modal=()=>null;export const useToast=()=>({error:console.error,show:()=>{}});export const copyText=async()=>{};`;
    const bundle = await build({ stdin: { contents: entry, resolveDir: root, loader: "tsx" }, bundle: true, write: false, platform: "browser", format: "iife", define: { "process.env.NODE_ENV": '"development"', __DEV__: "true" }, plugins: [{ name: "synthetic-host", setup(b) {
      b.onResolve({ filter: /^(react|react-dom)(\/.*)?$/ }, (args) => ({ path: require.resolve(args.path, { paths: [runtime] }) }));
      b.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web", { paths: [runtime] }) }));
      b.onResolve({ filter: /^@getpaseo\/plugin\/client$/ }, () => ({ path: "settings", namespace: "fixture" }));
      b.onResolve({ filter: /^@getpaseo\/plugin\/client\/ui$/ }, () => ({ path: "host", namespace: "fixture" }));
      b.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({ contents: args.path === "settings" ? settings : host, loader: "tsx", resolveDir: root }));
    } }] });
    const file = join(temp, "app.js");
    await writeFile(file, bundle.outputFiles[0]!.text);
    const runner = `const{chromium}=require(process.env.PLAYWRIGHT_MODULE);const assert=require('node:assert/strict');const http=require('node:http');const fs=require('node:fs');
(async()=>{const server=http.createServer((req,res)=>{if(req.url==='/app.js')return res.end(fs.readFileSync(process.argv[2]));res.setHeader('content-type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#141414}#root{height:100vh}</style><div id="root"></div><script src="/app.js"></script>')});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();try{
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));const url='http://127.0.0.1:'+server.address().port;
await page.goto(url);await page.getByText('Synthetic idea',{exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Recovery ID',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Disable new Quick Chats',exact:true}).count(),0);
await page.getByRole('button',{name:'Enable Quick Chat',exact:true}).click();await page.getByRole('button',{name:/^Provider and model:/}).click();await page.getByRole('radio',{name:'Fake · Test',exact:true}).click();await page.getByRole('button',{name:'New Quick Chat',exact:true}).click();assert.equal(await page.evaluate(()=>window.fixture.opened),'new-agent');
await page.evaluate(()=>window.fixture.providers({entries:[]}));assert.equal(await page.getByRole('button',{name:'New Quick Chat',exact:true}).isDisabled(),true);await page.getByText('Your selected model is no longer available. Choose another model; nothing has been substituted.',{exact:true}).waitFor();await page.getByRole('button',{name:'Refresh providers',exact:true}).count();
await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByText('Storage and privacy',{exact:true}).waitFor();await page.getByRole('button',{name:'Close settings',exact:true}).click();
await page.getByRole('textbox',{name:'Find a Quick Chat',exact:true}).fill('Synthetic');assert.equal(await page.getByText('Another idea',{exact:true}).count(),0);await page.getByRole('textbox',{name:'Find a Quick Chat',exact:true}).fill('');
await page.getByRole('button',{name:'Continue Synthetic idea in project',exact:true}).click();await page.evaluate(()=>window.fixture.delay=true);await page.getByRole('button',{name:/^Prepare context for Demo project/}).click();await page.evaluate(()=>{window.fixture.params={agentId:'second'};window.render()});await page.getByText('Finish the current operation before opening another handoff. Your current context is preserved.',{exact:true}).waitFor();await page.evaluate(()=>window.fixture.resolve());await page.getByRole('textbox',{name:'Context to send',exact:true}).waitFor();await page.getByText('From: Synthetic idea',{exact:true}).waitFor();
await page.getByRole('textbox',{name:'Context to send',exact:true}).fill('Reviewed idea A');await page.getByRole('button',{name:'Recover handoff',exact:true}).click();await page.getByRole('textbox',{name:'Recovery ID',exact:true}).fill('22345678-1234-4234-8234-123456789abc');await page.getByRole('button',{name:'Check recovery ID (does not resend)',exact:true}).click();await page.getByRole('button',{name:'Open recovered project chat',exact:true}).waitFor();await page.getByRole('button',{name:'Close recovery',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'Context to send',exact:true}).inputValue(),'Reviewed idea A');assert.equal(await page.getByRole('button',{name:'Create project chat with this context',exact:true}).count(),1);
await page.evaluate(()=>{window.fixture.params={agentId:'third'};window.render()});await page.getByText('Close the current handoff before opening another. Your reviewed context and recovery details are preserved.',{exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Context to send',exact:true}).inputValue(),'Reviewed idea A');
await page.getByRole('button',{name:/^Scratch files/}).click();await page.getByText(/idea.txt/).waitFor();await page.evaluate(()=>window.fixture.failCreate=true);await page.getByRole('button',{name:'Create project chat with this context',exact:true}).click();await page.getByText('Creation response lost',{exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Context to send',exact:true}).isEditable(),false);await page.evaluate(()=>window.fixture.failRecover=true);await page.getByRole('button',{name:'Check handoff result (does not resend)',exact:true}).click();await page.getByText('Result not confirmed',{exact:true}).waitFor();await page.evaluate(()=>window.fixture.failRecover=false);await page.getByRole('button',{name:'Check handoff result (does not resend)',exact:true}).click();await page.getByRole('button',{name:'Open project chat',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.fixture.recoveryInput),'12345678-1234-4234-8234-123456789abc');assert.equal(await page.evaluate(()=>window.fixture.calls.filter(x=>x==='quick-chat.continue').length),1);
await page.setViewportSize({width:360,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.setViewportSize({width:700,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
for(const width of [360,700,1440])for(const theme of ['dark','light']){
await page.setViewportSize({width,height:900});await page.goto(url+'?'+theme);await page.getByText('Synthetic idea',{exact:true}).waitFor();await page.getByRole('button',{name:'Enable Quick Chat',exact:true}).click();
async function fits(){const overflow=await page.evaluate(()=>[...document.querySelectorAll('[role="button"],input,textarea')].filter(e=>e.getClientRects().length).map(e=>({label:e.getAttribute('aria-label'),r:e.getBoundingClientRect()})).filter(x=>x.r.left< -1||x.r.right>innerWidth+1).map(x=>x.label));assert.deepEqual(overflow,[],width+' '+theme);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)}
await fits();await page.getByRole('button',{name:'Continue Synthetic idea in project',exact:true}).click();await page.getByRole('button',{name:/^Prepare context for Demo project/}).waitFor();await fits();await page.getByRole('button',{name:/^Prepare context for Demo project/}).click();await page.getByRole('textbox',{name:'Context to send',exact:true}).waitFor();await fits();await page.getByRole('button',{name:'Create project chat with this context',exact:true}).scrollIntoViewIfNeeded();await page.getByRole('button',{name:'Recover handoff',exact:true}).click();await page.getByRole('textbox',{name:'Recovery ID',exact:true}).fill('12345678-1234-4234-8234-123456789abc');await fits();await page.getByRole('button',{name:'Check recovery ID (does not resend)',exact:true}).click();await page.getByRole('button',{name:'Open recovered project chat',exact:true}).waitFor();await fits();}
assert.deepEqual(errors,[]);console.log('PASS task-first home, model removal, search, settings, external-entry guard, draft-preserving recovery, single create, narrow/light layouts');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});`;
    const script = join(temp, "run.cjs");
    await writeFile(script, runner);
    const result = await promisify(execFile)(process.execPath, [script, file], { timeout: 50000 });
    expect(result.stdout).toContain("PASS task-first home");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
