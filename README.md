# hello-oauth-node

LaunchDarkly OAuth Node JS starter project. A functional OAuth example using the [client-oauth2](https://github.com/mulesoft/js-client-oauth2) library can be seen in `app.js`

This app is deployed against LaunchDarkly's staging instance here: https://ld-hello-oauth.herokuapp.com/

## Usage Guide

1. Run `npm install`
2. Create a `.env` file with the following required environment variables:
   - `OAUTH_CLIENT_ID`
   - `OAUTH_CLIENT_SECRET`
3. Run `node app.js` to start the express server.
4. Visit http://localhost:4000 to begin the authorization process.
