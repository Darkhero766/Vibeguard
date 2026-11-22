import test from 'node:test';import assert from 'node:assert/strict';import{TOOL_DEFS,explainFinding,listFindings,handleMessage,statusTool}from'./agentshield-mcp-server.mjs';
test('read-only tool set',()=>{assert.deepEqual(TOOL_DEFS.map(x=>x.name),['scan_changed','list_findings','explain_finding','status']);assert.ok(TOOL_DEFS.every(x=>x.inputSchema.additionalProperties===false));});
test('guidance is deterministic and bounded',()=>{assert.match(explainFinding('secret_leak').guidance,/rotate/i);assert.equal(explainFinding('unknown').securityGuarantee,false);assert.throws(()=>explainFinding('x'.repeat(101));});
test('no scan is not reported as clean',()=>assert.equal(listFindings('/unknown').status,'no_scan'));
test('MCP init/list',async()=>{assert.equal((await handleMessage({jsonrpc:'2.0',id:1,method:'initialize'})).result.serverInfo.name,'vibesane-agentshield');assert.equal((await handleMessage({jsonrpc:'2.0',id:2,method:'tools/list'})).result.tools.length,4);});
test('unknown method error',async()=>assert.equal((await handleMessage({jsonrpc:'2.0',id:3,method:'invalid'})).error.code,-32601));
test('scanner readiness fail closed',async()=>assert.equal((await statusTool('/missing')).status,'not_ready'));
