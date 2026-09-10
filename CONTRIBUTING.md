# Contributing

Thanks for helping improve hi3d-cli.

## Setup

```bash
git clone https://github.com/mathmagical-community/hi3d-cli.git && cd hi3d-cli
npm install
npm run build
npm test
```

`npm test` starts mock Hi3D servers and exercises the CLI and the MCP server end to end; no real credentials are needed.
To try against the real API, log in with your own keys (`hi3d-cli login`) and never commit `~/.hi3d/config.json`.

## Branches and pull requests

- Open pull requests against **`develop`**. `main` only receives merges from `develop` when a release is cut.
- Keep commits focused; conventional prefixes (`feat:`, `fix:`, `docs:`, `ci:`, `test:`) are appreciated.
- Every user-visible change needs a line in `CHANGELOG.md` and, if it changes a command, an update to both READMEs, `skill/` and `docs/wiki/`.

## Rules of the road

- Commands and MCP tools must stay 1:1: add a tool to `packages/mcp/src/tools.ts` and the CLI command is generated from its schema.
- Output is always one JSON document on stdout; use stderr for progress. Keep the exit-code table in `program.ts` stable.
- No site-specific constants in the repository (see `packages/core/src/web-constants.example.ts`).
- Keep the package pure JavaScript with no native dependencies so it runs on macOS, Windows and Linux with Node ≥ 18.
- Run `npm run build && npm test && npm run release` before opening a pull request.

## Releasing

Bump `version` in `packages/hi3d-cli/package.json` and `VERSION` in `packages/cli/src/program.ts`, update `CHANGELOG.md`,
then merge `develop` into `main` and push a tag `vX.Y.Z` **on `main`** (the workflow refuses tags elsewhere). GitHub Actions publishes to npm via Trusted Publishing (OIDC): register this repository
and `release.yml` as a trusted publisher in the npm package settings once; no token secret is needed. Set the repository variable
`NPM_PACKAGE_NAME` (e.g. `@hi3d/hi3d-cli`) to publish under a scoped name; leave it unset to publish `hi3d-cli`.
