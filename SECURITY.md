# Security

- Credentials are stored in `~/.hi3d/config.json` with mode `0600`. They are never sent anywhere except the Hi3D endpoints.
- Environment variables (`HI3D_CLIENT_ID` / `HI3D_CLIENT_SECRET` / `HI3D_WEB_COOKIE`) let CI and agents inject credentials without writing them to disk.
- The MCP server in HTTP mode (`hi3d-cli mcp --http`) is meant to run behind your own authentication; use `--require-auth` and do not expose it publicly.
- Site-specific constants for web mode are not published in this repository.

To report a vulnerability, please open a private security advisory on GitHub or email the maintainers listed in `package.json` rather than filing a public issue.
