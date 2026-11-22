import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root=path.dirname(fileURLToPath(import.meta.url));

test('server-only AES-256-GCM tokens roundtrip, reject bad key, edits and malformed encodings',async()=>{
 const result=await build({
   entryPoints:[path.join(root,'../src/lib/crypto.ts')],
   bundle:true,write:false,format:'esm',platform:'node',target:'node20',
   logLevel:'silent',
 });
 const encoded=Buffer.from(result.outputFiles[0].contents).toString('base64');
 const {encryptToken,decryptToken}=await import('data:text/javascript;base64,'+encoded);
 const old=process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
 const key=randomBytes(32).toString('hex');
 const testValue='synthetic-credential-not-valid-anywhere';
 try{
   process.env.GITHUB_TOKEN_ENCRYPTION_KEY=key;
   const first=encryptToken(testValue);
   const second=encryptToken(testValue);
   assert.notEqual(first,second,'12-byte randomized IV must be different');
   assert.equal(decryptToken(first),testValue);
   assert.equal(decryptToken(second),testValue);
   assert.ok(!first.includes(testValue));
   assert.equal(first.split(':').length,3);
   process.env.GITHUB_TOKEN_ENCRYPTION_KEY=key+'not-hex';
   assert.throws(()=>encryptToken(testValue),/64 hex characters/);
   process.env.GITHUB_TOKEN_ENCRYPTION_KEY='q'.repeat(64);
   assert.throws(()=>encryptToken(testValue),/64 hex characters/);
   process.env.GITHUB_TOKEN_ENCRYPTION_KEY=key.slice(0,62);
   assert.throws(()=>encryptToken(testValue),/64 hex characters/);
   process.env.GITHUB_TOKEN_ENCRYPTION_KEY=randomBytes(32).toString('hex');
   assert.throws(()=>decryptToken(first),'Decryption must fail with wrong key');
   process.env.GITHUB_TOKEN_ENCRYPTION_KEY=key;
   assert.throws(()=>decryptToken('a:b:c'),/Invalid encrypted token format/);
   assert.throws(()=>decryptToken(first+':extra'),/Invalid encrypted token format/);
   const split=first.split(':');
   const changedIv=(split[0][0]==='a'?'b':'a')+split[0].slice(1);
   assert.throws(()=>decryptToken([changedIv,split[1],split[2]].join(':')),
     'Tampering with the IV must fail authentication');
   assert.throws(()=>decryptToken([split[0],split[1],'not hex'].join(':')),
     /Invalid encrypted token format/);
 }finally{
   if(old===undefined)delete process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
   else process.env.GITHUB_TOKEN_ENCRYPTION_KEY=old;
 }
});
