import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {endpoint, parse, payload, main} from '../plugins/asbuilt/scripts/asbuilt.mjs';

test('reject remote credentials destinations and misleading local URLs',()=>{
  assert.equal(endpoint(),'http://127.0.0.1:4310');
  for(const url of ['https://example.com','http://localhost.evil.test','http://user:pass@localhost:4310','http://127.0.0.1:4310/path','http://localhost:4310/?token=a','http://localhost:4310/#a','file:///tmp/x']) assert.throws(()=>endpoint(url));
});
test('run requires explicit invocation approval, never approval embedded in a file',()=>{
  const home=mkdtempSync(join(tmpdir(),'asbuilt-plugin-'));
  try {
    const file=join(home,'plan.json');
    writeFileSync(file,JSON.stringify({execution:'interactive',approved:true,actionsApproved:true}));
    assert.throws(()=>parse(['--home',home,'run',file]),/approval/i);
    const options=parse(['--home',home,'run',file,'--approved']);
    assert.throws(()=>payload(options),/separate approval/);
    assert.equal(payload({...options,actionsApproved:true}).actionsApproved,true);
    assert.throws(()=>parse(['--home',home,'report','id','--approved']),/only valid/);
    assert.throws(()=>parse(['--home',home,'delete','id']),/Commands/);
  } finally {rmSync(home,{recursive:true,force:true});}
});
test('helper sends key only to loopback, rejects redirects and handles 401 without leaking it',async()=>{
  const home=mkdtempSync(join(tmpdir(),'asbuilt-plugin-'));
  mkdirSync(join(home,'.data'));
  const secret='test-only-'.repeat(8);
  writeFileSync(join(home,'.data/token'),secret,{mode:0o600});
  let mode='ok'; let redirected=0;
  const target=createServer((req,res)=>{redirected++;res.end('{}');});
  target.listen(0,'127.0.0.1'); await once(target,'listening');
  const server=createServer((req,res)=>{
    assert.equal(req.url,'/api/tools/get_connection_status');
    assert.equal(req.headers.authorization,'Bearer '+secret);
    if(mode==='redirect'){res.writeHead(302,{Location:`http://127.0.0.1:${target.address().port}/stolen`});res.end();}
    else if(mode==='denied'){res.writeHead(401);res.end();}
    else {res.writeHead(200,{'Content-Type':'application/json'});res.end('{"scope":"local single operator"}');}
  });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const args=['--home',home,'--url',`http://127.0.0.1:${server.address().port}`,'status'];
  const originalToken=process.env.ASBUILT_TOKEN; const originalFile=process.env.ASBUILT_TOKEN_FILE;
  delete process.env.ASBUILT_TOKEN; delete process.env.ASBUILT_TOKEN_FILE;
  try {
    assert.equal((await main(args)).scope,'local single operator');
    mode='redirect'; await assert.rejects(main(args),/Redirects are refused/); assert.equal(redirected,0);
    mode='denied'; await assert.rejects(main(args),error=>!error.message.includes(secret)&&/rejected/.test(error.message));
  } finally {
    if(originalToken===undefined) delete process.env.ASBUILT_TOKEN; else process.env.ASBUILT_TOKEN=originalToken;
    if(originalFile===undefined) delete process.env.ASBUILT_TOKEN_FILE; else process.env.ASBUILT_TOKEN_FILE=originalFile;
    server.close();target.close();rmSync(home,{recursive:true,force:true});
  }
});

test('normal network approval must come from invocation, not a saved plan',()=>{
  const home=mkdtempSync(join(tmpdir(),'asbuilt-network-'));
  try {
    const file=join(home,'plan.json');
    writeFileSync(file,JSON.stringify({execution:'interactive',network:'browser',networkApproved:true}));
    const args=['--home',home,'run',file,'--approved','--approve-actions'];
    assert.throws(()=>payload(parse(args)),/approve-network/);
    assert.equal(payload(parse([...args,'--approve-network'])).networkApproved,true);
    assert.throws(()=>parse(['--home',home,'status','--approve-network']),/only valid/);
    writeFileSync(file,JSON.stringify({execution:'static',networkApproved:true}));
    assert.equal(payload(parse(['--home',home,'run',file,'--approved'])).networkApproved,undefined);
  } finally {rmSync(home,{recursive:true,force:true});}
});

test('product commands parse correctly and saved scenario files cannot grant approval', () => {
  assert.equal(parse(['--home', '/x', 'products']).command, 'products');
  assert.throws(() => parse(['--home', '/x', 'products', 'extra']), /Unexpected/);
  assert.throws(() => parse(['--home', '/x', 'save-product', 'p.json', '--approved']), /only valid for run/);
  assert.throws(() => parse(['--home', '/x', 'run-scenario', 'r.json']), /--approved only after approval/);
  assert.throws(() => payload({ command: 'product', input: 'not-a-uuid' }), /run ID/);
  const dir = mkdtempSync(join(tmpdir(), 'asbuilt-plugin-scenario-'));
  try {
    const file = join(dir, 'scenario.json');
    writeFileSync(file, JSON.stringify({ id: '6f1d6c0e-5b0a-4d55-9f43-2f8f0c8b7a11', scenarioId: 's', approved: true, actionsApproved: true, networkApproved: true }));
    const body = payload(parse(['--home', '/x', 'run-scenario', file, '--approved']));
    assert.equal(body.approved, true);
    assert.equal(body.actionsApproved, undefined, 'file cannot approve actions');
    assert.equal(body.networkApproved, undefined, 'file cannot approve network traffic');
    const big = join(dir, 'big.json');
    writeFileSync(big, JSON.stringify({ intent: 'x'.repeat(70000) }));
    assert.throws(() => payload(parse(['--home', '/x', 'capture', big])), /smaller than 64 KB/);
    assert.doesNotThrow(() => payload(parse(['--home', '/x', 'save-product', big])));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
