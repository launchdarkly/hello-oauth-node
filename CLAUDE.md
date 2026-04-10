# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LaunchDarkly OAuth 2.0 starter project demonstrating the authorization code grant flow using the `client-oauth2` library. Single-file Express app that authenticates users via LaunchDarkly's OAuth provider and proxies GET requests to the LaunchDarkly API.

## Commands

- **Run**: `npm start` or `node app.js` (serves on port 4000 by default)
- **Install**: `npm install`
- **No test suite or linter configured.** Formatting follows Prettier (single quotes, trailing commas, 120 char width).

## Architecture

The entire server lives in `app.js` — a single Express application with these routes:

- `GET /` — renders the Pug template with session state (token info, member name)
- `GET /auth` — initiates OAuth authorization code flow, redirects to LaunchDarkly
- `GET /redirect` — OAuth callback; exchanges code for token, fetches `/api/v2/members/me`, stores both in cookie-session
- `GET /refresh` — refreshes the OAuth token
- `GET /logout` — clears session
- `GET /get/:path*` — proxies any GET request to `LD_DOMAIN/api/v2/<path>` using the stored OAuth token

Session data (token + member info) is stored in an encrypted cookie via `cookie-session`, not a database.

## Configuration

All config is via environment variables loaded from `.env` by `dotenv`:

| Variable | Required | Default |
|---|---|---|
| `OAUTH_CLIENT_ID` | Yes | — |
| `OAUTH_CLIENT_SECRET` | Yes | — |
| `LD_DOMAIN` | No | `https://app.launchdarkly.com` |
| `PORT` | No | `4000` |
| `REDIRECT_URI` | No | `http://localhost:<PORT>/redirect` |
| `COOKIE_SESSION_SECRET` | No | hardcoded fallback |

Register an OAuth app in LaunchDarkly with redirect URI `http://localhost:4000/redirect` to get the client ID and secret.
