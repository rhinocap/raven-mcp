# Security Policy — Raven MCP

## Data Flow

Raven MCP runs entirely locally. Here is the complete data flow:

```
Claude (prompt) → MCP Protocol (stdio) → Raven MCP (local process) → Response (text)
```

### What Raven reads
- User prompts passed via the MCP protocol from Claude Code or Claude Desktop
- Static JSON files bundled in the package (design principles, patterns, tokens)

### What Raven returns
- Text responses (JSON) containing design principles, patterns, tokens, and evaluations
- All responses are returned via stdio to the calling MCP client (Claude)

### What Raven does NOT do
- No network requests during tool execution — all data is local JSON loaded at startup
- No file system reads beyond its own bundled data files
- No logging of user prompts, code, or design artifacts
- No collection of PII or customer data
- No external API calls, database connections, or cloud service integrations
- No access to environment variables, secrets, or credentials during tool execution

### Optional telemetry (postinstall only)
On `npm install`, an optional postinstall script sends a single HTTPS POST to `ravenmcp.ai/api/welcome` containing:
- Node.js version
- OS platform and architecture
- Timestamp

**No user data, prompts, code, or design artifacts are sent.** This telemetry is limited to install-time only and never runs during tool execution.

**To disable:** Set `RAVEN_NO_TELEMETRY=1` before install:
```bash
RAVEN_NO_TELEMETRY=1 npm install raven-mcp
```

## Dependencies

### Runtime
| Package | Purpose | License |
|---------|---------|---------|
| `@modelcontextprotocol/sdk` | MCP protocol implementation | MIT |
| `zod` | Input validation | MIT |

### Dev-only (not shipped)
| Package | Purpose | License |
|---------|---------|---------|
| `typescript` | Build | Apache-2.0 |
| `tsx` | Dev server | MIT |
| `@types/node` | Type definitions | MIT |
| `resend` | Email (dev testing only) | MIT |

Zero transitive runtime dependencies beyond the two listed above.

## License

MIT — see [LICENSE](./LICENSE).

## Reporting Vulnerabilities

Email security concerns to andrew@ravenmcp.ai. Response within 48 hours.

## Enterprise / Compliance Use

For enterprise environments requiring:
- Telemetry disabled: set `RAVEN_NO_TELEMETRY=1`
- Version pinning: lock to a specific version in `package.json`
- SBOM: generate with `npm sbom --sbom-format cyclonedx`
- Audit: run `npm audit` — zero known vulnerabilities as of v1.1.0

Raven MCP is designed for local-only, air-gapped use. No network access is required after installation.
