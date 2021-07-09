# hello-oauth-node

LaunchDarkly OAuth Node JS starter project. A functional OAuth example using the [client-oauth2](https://github.com/mulesoft/js-client-oauth2) library.

This app is currently deployed here: https://ld-hello-oauth.herokuapp.com/

See [Authorizing OAuth Applications](https://docs.launchdarkly.com/docs/authorizing-oauth-applications) for information on managing OAuth applications within LaunchDarkly

## Usage Guide

1. Clone this repo and run `npm install`
2. Register a new OAuth App with LaunchDarkly with a redirect_uri of `http://localhost:4000/redirect`.
3. Create a `.env` file with the following required environment variables (LaunchDarkly provides this information after registering your app):
   - `OAUTH_CLIENT_ID` (client_id)
   - `OAUTH_CLIENT_SECRET` (client_secret)
4. Run `node app.js` to start the express server.
5. Visit http://localhost:4000 to begin the authorization process.
6. To confirm that the OAuth hand-shake was successful, click on some of the example endpoints listed on http://localhost:4000 and look for a successful response.
