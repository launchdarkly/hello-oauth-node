const express = require('express');
const axios = require('axios');
const ClientOAuth2 = require('client-oauth2');

// After registering your OAuth client you will be given the following credentials
const clientId = 'CLIENT_ID_HERE';
const clientSecret = 'CLIENT_SECRET_HERE';
const port = 4000;

const app = express();

var launchDarklyAuth = new ClientOAuth2({
  clientId: clientId,
  clientSecret: clientSecret,
  accessTokenUri: 'https://app.launchdarkly.com/trust/oauth/token',
  authorizationUri: 'https://app.launchdarkly.com/trust/oauth/authorize',
  redirectUri: `http://localhost:${port}/redirect`,
  scopes: ['info', 'read', 'write'],
});

app.get('/', (req, res) => res.sendFile('index.html', {root: __dirname}));

app.get('/auth', function(req, res) {
  var uri = launchDarklyAuth.code.getUri();
  res.redirect(uri);
});

app.get('/redirect', function(req, res) {
  // LaunchDarkly's OAuth implementation requires secret credentials to be placed in the POST body or as query parameters
  launchDarklyAuth.code
    .getToken(req.originalUrl, {
      query: {
        client_id: launchDarklyAuth.options.clientId,
        client_secret: launchDarklyAuth.options.clientSecret,
      },
    })
    .then(function(user) {
      console.log(user); //=> { accessToken: '...', tokenType: 'bearer', ... }

      // Refresh the current users access token.
      // This should not need to be done immediately after getting a new token. This is just a demo to show how to refresh a token
      user
        .refresh({
          query: {
            client_id: launchDarklyAuth.options.clientId,
            client_secret: launchDarklyAuth.options.clientSecret,
          },
        })
        .then(function(updatedUser) {
          console.log('Token successfully updated:', updatedUser !== user); //=> true
          console.log('New OAuth Token:', updatedUser.accessToken);

          // The token should ideally be saved in the database at this point

          // Token usage demonstration:
          // Sign API requests on behalf of the current user.
          const testReq = updatedUser.sign({
            method: 'get',
            url: 'https://app.launchdarkly.com/trust/oauth/test',
          });

          axios(testReq)
            .then(testRes => {
              return res.send(testRes.data);
            })
            .catch(e => {
              console.log(e);
              return res.send('There was an error testing the OAuth token');
            });
        });
    })
    .catch(e => {
      return res.send(e);
    });
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`));
