#!/usr/bin/env node
// Safe local Foxy qualification: tests/build only; no deploy, publish, migrations or live network calls.
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const scriptsDir = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(scriptsDir, "..");
const repoDir = resolve(apiDir, "../..");
const outputDir = resolve(repoDir, process.env.FOXY_REPORT_DIR || "artifacts/api-server/.foxy-qualification");
const tasks = [
 ["Foxy build","pnpm",["run","build:agentshield"]],
 ["MCP regression tests","pnpm",["run","test:agentshield:mcp"]],
 ["Transactional jobs-store tests","pnpm",["run","test:agentshield:jobs"]],
 ["MCP smoke","pnpm",["run","test:agentshield:mcp:smoke"]],
 ["Host connector tests","pnpm",["run","test:agentshield:connect"]],
 ["Package regression tests","pnpm",["run","test:agentshield:package"],["darwin","linux","win32"]],
 ["Release validator tests","pnpm",["run","test:agentshield:release"]],
 ["Scanner output tests","pnpm",["run","test:vibesane:check-output"]]
];
function exec(command,args,cwd,capture=false){return new Promise(resolveRun=>{const child=spawn(command,args,{cwd,stdio:capture?["ignore","pipe","ignore"]:"inherit",shell:false});let out="";if(capture)child.stdout.on("data",c=>out+=c);child.on("error",e=>resolveRun({code:127,error:e.message,out}));child.on("close",code=>resolveRun({code:code??128,out}));});}
async function save(report){await mkdir(outputDir,{recursive:true});await writeFile(resolve(outputDir,"foxy-qualification.json"),JSON.stringify(report,null,2)+"\\n",{mode:0o600});const md=["# Foxy Local Qualification","", "- Status: **"+report.status+"**","- Commit: `"+report.sha+"`","- Runtime: "+report.node,"- Platform: "+report.platform+"/"+report.arch,"- Host acceptance: NOT INCLUDED","", "| Step | Result | Exit code | Seconds | Notes |","|---|---|---:|---:|---|",...report.tasks.map(t=>"| "+t.name+" | "+t.status+" | "+(t.exitCode===null?"—":t.exitCode)+" | "+(t.durationMs/1000).toFixed(1)+" | "+(t.note||"")+" |"),"","Skipped platform-specific steps are not treated as passed tests.","Local qualification is not cross-platform host acceptance or release approval."].join("\\n");await writeFile(resolve(outputDir,"foxy-qualification.md"),md+"\\n",{mode:0o600});}
async function main(){const [major,minor]=process.versions.node.split(".").map(Number);const report={started:new Date().toISOString(),sha:"unknown",node:process.version,platform:process.platform,arch:process.arch,tasks:[],status:"BLOCKED"};const git=await exec("git",["rev-parse","HEAD"],repoDir,true);if(git.code===0)report.sha=git.out.trim();if(major<24||(major===24&&minor<15)){report.blocker="Node 24.15.0+ required.";await save(report);console.error(report.blocker);process.exitCode=2;return;}for(const [name,command,args,supportedPlatforms] of tasks){const commandText=command+" "+args.join(" ");if(supportedPlatforms&&!supportedPlatforms.includes(process.platform)){const note="Supported on: "+supportedPlatforms.join(", ")+"; current host: "+process.platform;report.tasks.push({name,command:commandText,exitCode:null,durationMs:0,status:"SKIPPED",note});console.log("\\n--- "+name+" ---\\nSKIPPED: "+note);continue;}console.log("\\n--- "+name+" ---");const start=Date.now(),r=await exec(command,args,apiDir);report.tasks.push({name,command:commandText,exitCode:r.code,durationMs:Date.now()-start,status:r.code===0?"PASS":"FAIL",...(r.error?{error:r.error}:{})});if(r.code!==0)console.error("FAILED:",name,"exit",r.code);}const failed=report.tasks.some(t=>t.status==="FAIL"),skipped=report.tasks.some(t=>t.status==="SKIPPED");report.status=failed?"FAIL":skipped?"PASS_WITH_SKIPS":"PASS";report.finished=new Date().toISOString();await save(report);console.log("\\nFoxy qualification:",report.status,"\\nReports:",outputDir);if(failed)process.exitCode=1;}
main().catch(e=>{console.error(e);process.exitCode=1;});
