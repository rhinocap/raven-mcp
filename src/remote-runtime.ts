// One-way latch marking the current process as the hosted (remote) MCP runtime.
//
// Set to true — and NEVER reset — by buildServer({ remote: true }) (the Vercel
// entry, api/mcp.js). The raven store (taste profiles + creative records under
// ~/.raven) is LOCAL, per-machine state; the hosted no-auth endpoint must never
// read or write it (per-user cloud state is a later phase). Every store-access
// function consults this latch and fails closed — empty reads, thrown writes —
// when it is set, so the store capability is gated ONCE at the choke point
// rather than per-tool or per-param (which only ever chases symptoms).
//
// Placed in a dependency-free leaf module so both index.ts and taste.ts import
// it with no circular dependency. Monotonic by design: exposing only a
// setter-to-true means a hypothetical mixed-mode process degrades stdio (fails
// closed) rather than ever re-opening the store for a remote request. Because
// stdio never calls the setter, the stdio path sees isRemoteRuntime() === false
// forever and is byte-for-byte unchanged.

let remoteRuntime = false;

export function setRemoteRuntime(): void {
  remoteRuntime = true;
}

export function isRemoteRuntime(): boolean {
  return remoteRuntime;
}
