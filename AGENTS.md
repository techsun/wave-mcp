# Working in this repo

This is `wave-mcp`, maintained for real use against a live Wave Accounting business.
It's an MCP stdio server, so changes to `src/` require `npm run build` and either 
`pkill -f "wave-mcp/build/main.js"` or a Claude Code session restart (the server 
process doesn't hot-reload) before they take effect.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `type: summary`,
optionally `type(scope): summary`.

Common types here: `fix`, `feat`, `chore`, `docs`, `refactor`, `test`.

- Summary line: imperative mood, no trailing period, under ~72 chars.
- Body (when the change needs explaining): what was broken/needed and why, not a
  restatement of the diff. For a bug fix against Wave's API, cite what the real
  schema/behavior is and how it was verified (schema introspection, a live test call).

## Wave API notes

- The public GraphQL API (`https://gql.waveapps.com/graphql/public`) has no way to
  read/list transactions -- only `moneyTransactionCreate`/`moneyTransactionsCreate`.
  Don't reintroduce transaction-read tools without confirming Wave has added support.
- Business/Account IDs used by the API are base64-encoded global IDs
  (`QnVzaW5lc3M6...`), not the raw UUID shown in Wave's web app URL.
- Before trusting any tool's GraphQL query/mutation against real data, check it
  against Wave's schema -- earlier versions of this server had several tools
  that called nonexistent fields/mutations.
