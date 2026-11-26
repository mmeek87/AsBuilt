#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const commands = { baseline: 'establish_product_baseline', context: 'get_product_context', revise: 'revise_product_baseline', status: 'get_connection_status', capture: 'capture_intent', plan: 'generate_criteria', run: 'start_verification', progress: 'check_verification', report: 'get_report', 'save-product': 'save_product_review', products: 'list_product_reviews', product: 'get_product_review', 'run-scenario': 'run_product_scenario' };
export function endpoint(value = 'http://127.0.0.1:4310') {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw Error('Use an exact local HTTP origin, such as http://127.0.0.1:4310. Remote URLs are not supported.');
  return url.origin;
}
export function parse(argv) {
  let home; let url; const rest = []; let approved = false; let actionsApproved = false; let networkApproved = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--home' || a === '--url') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw Error(`${a} needs a value.`);
      if (a === '--home') home = value; else url = value;
    } else if (a === '--approved') approved = true;
    else if (a === '--approve-actions') actionsApproved = true;
    else if (a === '--approve-network') networkApproved = true;
    else if (a.startsWith('--')) throw Error(`Unknown option: ${a}`);
    else rest.push(a);
  }
  const [command, input, ...extra] = rest;
  if (!Object.hasOwn(commands, command ?? '')) throw Error('Commands: status, capture <json>, plan <json>, run <json> --approved, progress <id>, report <id>, baseline <json>, context <id>, revise <json>, save-product <json>, products, product <id>, run-scenario <json> --approved. Supply --home /absolute/path/to/AsBuilt.');
  if (extra.length || (['status','products'].includes(command) ? input !== undefined : !input)) throw Error('Unexpected or missing command arguments.');
  if (!home || !isAbsolute(home)) throw Error('--home must name the absolute path to your local AsBuilt checkout.');
  if (!['run','run-scenario'].includes(command) && (approved || actionsApproved || networkApproved)) throw Error('Approval flags are only valid for run or run-scenario.');
  if (['run','run-scenario'].includes(command) && !approved) throw Error('Show the exact target and checks to the user, then pass --approved only after approval.');
  return {home, url:endpoint(url), command, input, approved, actionsApproved, networkApproved};
}
export function payload(options) {
  if (['status','products'].includes(options.command)) return {};
  if (['progress','report','product','context'].includes(options.command)) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(options.input)) throw Error('Use the run ID returned by AsBuilt.');
    return {id:options.input};
  }
  const path = resolve(options.input);
  const text = readFileSync(path,'utf8');
  const limit = ['save-product','baseline','revise'].includes(options.command) ? 900000 : 64000;
  if (Buffer.byteLength(text) > limit) throw Error(`Input must be smaller than ${limit / 1000} KB.`);
  const body = JSON.parse(text);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error('Input must be a JSON object.');
  if (['run','run-scenario'].includes(options.command)) {
    // A saved file cannot grant permission. Only explicit invocation flags can.
    delete body.approved; delete body.actionsApproved; delete body.networkApproved;
    body.approved = true;
    if (body.network === 'browser' && !options.networkApproved) throw Error('Normal browser traffic requires explicit approval and --approve-network.');
    if (options.networkApproved) body.networkApproved = true;
    if (body.execution === 'interactive' && !options.actionsApproved) throw Error('Interactive runs need separate approval of the listed actions and --approve-actions.');
    if (options.actionsApproved) body.actionsApproved = true;
  }
  return body;
}
export async function main(argv = process.argv.slice(2)) {
  const options = parse(argv);
  const body = payload(options);
  const tokenFile = process.env.ASBUILT_TOKEN_FILE || join(options.home,'.data','token');
  let token;
  try { token = process.env.ASBUILT_TOKEN || readFileSync(tokenFile,'utf8').trim(); }
  catch { throw Error('Start your local AsBuilt service first. Its access key is kept in .data/token, or configure ASBUILT_TOKEN_FILE for a custom setup.'); }
  if (token.length < 32 || /[\r\n]/.test(token)) throw Error('The local access key is invalid.');
  let response;
  try {
    response = await fetch(`${options.url}/api/tools/${commands[options.command]}`, {
      method:'POST', redirect:'error', signal:AbortSignal.timeout(30000),
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}, body:JSON.stringify(body)
    });
  } catch { throw Error('Cannot reach local AsBuilt. Start it, check the port, and retry. Redirects are refused.'); }
  if (response.status === 401) throw Error('The local service rejected its access key. Check the checkout and token-file configuration.');
  if (!response.headers.get('content-type')?.includes('application/json')) throw Error('The local service returned an unexpected response.');
  const result = await response.json();
  if (!response.ok) throw Error(typeof result.error === 'string' ? result.error : 'AsBuilt could not complete the request.');
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await main(),null,2)); }
  catch (error) { console.error(error instanceof Error ? error.message : 'AsBuilt command failed.'); process.exitCode=1; }
}
