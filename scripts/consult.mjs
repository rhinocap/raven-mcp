#!/usr/bin/env node
// consult.mjs — the reader side of the design decision graph, for coding agents.
// Usage: RAVEN_DECISIONS_HOME=<store> RAVEN_AGENT_ID=<you> node scripts/consult.mjs <query>
// Browses active decisions (scan), then does a TARGETED get on each match — the get is
// what the server records as a consultation (reader/decision/timestamp). Prints the
// matching decisions' statements so an agent can follow them before making design choices.

process.env.RAVEN_NO_USAGE_LOG = '1';
const query = (process.argv[2] || '').toLowerCase();

const { buildServer } = await import('../dist/index.js');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');

const [clientT, serverT] = InMemoryTransport.createLinkedPair();
const server = buildServer();
const client = new Client({ name: 'consult', version: '1.0.0' }, { capabilities: {} });
await Promise.all([server.connect(serverT), client.connect(clientT)]);

try {
  const all = JSON.parse((await client.callTool({ name: 'decision_list', arguments: {} })).content[0].text);
  const active = all.filter((d) => d.status === 'active');
  const matches = query
    ? active.filter((d) => (d.scope + ' ' + d.statement).toLowerCase().includes(query))
    : active;

  if (matches.length === 0) {
    console.log(JSON.stringify({ query, matched: 0, available_scopes: active.map((d) => d.scope) }, null, 2));
  } else {
    // Targeted get on each match = the recorded consultation.
    const consulted = [];
    for (const d of matches) {
      const got = JSON.parse((await client.callTool({ name: 'decision_get', arguments: { id: d.id } })).content[0].text);
      consulted.push({ id: got.node.id, scope: got.node.scope, statement: got.node.statement });
    }
    console.log(JSON.stringify({ query, matched: consulted.length, decisions: consulted }, null, 2));
  }
} finally {
  await client.close();
}
