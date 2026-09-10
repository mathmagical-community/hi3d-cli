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

Nobody pushes tags by hand — the release workflow derives the tag from `packages/hi3d-cli/package.json` and refuses inconsistent states.

1. **Pre-release from `develop`**: set the version to `X.Y.Z-rc.N` in `packages/hi3d-cli/package.json` and `VERSION` in `packages/cli/src/program.ts`, add a `## X.Y.Z-rc.N` entry at the top of `CHANGELOG.md` (`npm run check-version` verifies all three agree), push. The workflow tags `vX.Y.Z-rc.N`, creates a GitHub pre-release and publishes to npm under the dist-tag `next` (`npm i @hi3d/hi3d-cli@next`).
2. **Stable from `main`**: merge `develop` into `main`, set the plain `X.Y.Z` in the same three places, push `main`. The workflow tags `vX.Y.Z`, creates the GitHub Release and publishes as `latest`.

A push whose version already has a tag does nothing. npm publishing uses Trusted Publishing (OIDC) — register this repository and `release.yml` once in the npm package settings — or an `NPM_TOKEN` secret; with neither the run stays green, the GitHub Release is still created, and the job summary shows the manual `npm publish` command. Set the repository variable `NPM_PACKAGE_NAME` (e.g. `@hi3d/hi3d-cli`) to publish under a scoped name.
