# @pipeworx/acled

ACLED MCP — armed-conflict and protest event data. OAuth (myACLED email + password).

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

- `search_events(...)` — filter by country, region, event type, actor, date, fatalities.
- `event_counts_by_country(...)` — aggregated event/fatality counts.

## Auth

BYO only.

ACLED migrated to OAuth in 2025. You provide your myACLED **email + password**; the pack exchanges them for a 24h access token (cached in-memory).

Pass `?_email=...&_password=...` on the gateway URL.

### Activation caveat

Registration alone is not enough — ACLED gates API access per account.
After registering at https://acleddata.com/register/, email
`access@acleddata.com` to request API access. Until they enable it,
data requests return HTTP 403 even with a valid OAuth token.

## Data sources

- Token: `https://acleddata.com/oauth/token`
- Data: `https://acleddata.com/api/acled/read`

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "acled": {
      "url": "https://gateway.pipeworx.io/acled/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Acled data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
