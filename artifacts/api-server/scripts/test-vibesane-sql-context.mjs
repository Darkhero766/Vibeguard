import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const scripts=path.dirname(fileURLToPath(import.meta.url));
let scannerPromise, tmp;
after(async()=>{if(tmp)await rm(tmp,{recursive:true,force:true});});
async function scan(sql){
  if(!scannerPromise){
    scannerPromise=(async()=>{
      tmp=await mkdtemp(path.join(tmpdir(),'vibesane-sql-test-'));
      const outfile=path.join(tmp,'scanner.mjs');
      await build({
        entryPoints:[path.join(scripts,'../src/lib/extendedScanner.ts')],
        outfile,bundle:true,platform:'node',format:'esm',
        target:'node20',logLevel:'silent',
      });
      return (await import(pathToFileURL(outfile).href)).scanExtendedFiles;
    })();
  }
  const fn=await scannerPromise;
  return fn([{path:'supabase/staging/fixture.sql',content:sql}]);
}
const initial='CREATE TABLE public.secrets (id uuid); ALTER TABLE public.secrets ENABLE ROW LEVEL SECURITY;';
const revoke='REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;';

test('unexplained missing RLS policy is still a High finding',async()=>{
  const f=await scan(initial);
  assert.equal(f.filter(x=>x.check==='rls_policy_missing').length,1);
});
test('explicit revoke for all client roles is intentional deny-by-default',async()=>{
  const f=await scan(initial+'\n'+revoke);
  assert.equal(f.filter(x=>x.check==='rls_policy_missing').length,0);
});
test('a missing client role in the revoke does not suppress the warning',async()=>{
  const f=await scan(initial+'\nREVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon;');
  assert.equal(f.filter(x=>x.check==='rls_policy_missing').length,1);
});
test('regrant after deny-by-default restores the missing-policy warning',async()=>{
  const f=await scan(initial+'\n'+revoke+'\nGRANT SELECT ON public.secrets TO authenticated;');
  assert.equal(f.filter(x=>x.check==='rls_policy_missing').length,1);
});
test('SECURITY DEFINER with header SET search_path after security clause is pinned',async()=>{
  const f=await scan("CREATE FUNCTION public.do_work() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN RETURN; END $$;");
  assert.equal(f.filter(x=>x.check==='security_definer_search_path').length,0);
});
test('SECURITY DEFINER without search_path pin remains a High finding',async()=>{
  const f=await scan('CREATE FUNCTION public.do_work() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN; END $$;');
  assert.equal(f.filter(x=>x.check==='security_definer_search_path').length,1);
});
test('search_path mentioned only in function body cannot masquerade as pinned',async()=>{
  const f=await scan('CREATE FUNCTION public.do_work() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN PERFORM set_config(\'search_path\',\'public\',true); RETURN; END $$;');
  assert.equal(f.filter(x=>x.check==='security_definer_search_path').length,1);
});
test('actual versioned hardened staging schema has zero High or Critical deltas',async()=>{
  const file=path.resolve(scripts,'../../../supabase/staging/20261120_staging_bootstrap_hardened.sql');
  const src=await readFile(file,'utf8');
  const f=await scan(src);
  assert.deepEqual(f.filter(x=>['High','Critical'].includes(x.severity)).map(x=>x.check),[]);
});
