'use strict';

require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const axios = require('axios');
const moment = require('moment');
const ClientOAuth2 = require('client-oauth2');

// After registering your OAuth client you will be given the following credentials
const CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;
const LD_DOMAIN = process.env.LD_DOMAIN || 'https://app.launchdarkly.com';
const PORT = process.env.PORT || 4000;
const REDIRECT_URI = process.env.REDIRECT_URI || `http://localhost:${PORT}/redirect`;
const COOKIE_SESSION_SECRET = process.env.COOKIE_SESSION_SECRET || 'Super Secure Cookie Session Secret';

const app = express();
app.set('view engine', 'pug');
app.use(express.static('public'));
app.use(
  cookieSession({
    name: 'session',
    secret: COOKIE_SESSION_SECRET,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 Days
  }),
);

var launchDarklyAuth = new ClientOAuth2({
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  accessTokenUri: `${LD_DOMAIN}/trust/oauth/token`,
  authorizationUri: `${LD_DOMAIN}/trust/oauth/authorize`,
  redirectUri: REDIRECT_URI,
  scopes: ['writer'],
});

app.get('/', (req, res) => {
  let context = {
    loggedIn: false,
    message: 'Hello LaunchDarkly OAuth',
    apiUrl: `${LD_DOMAIN}/api/v2`,
  };
  const { oauthTokenData, memberInfo } = req.session;
  if (oauthTokenData) {
    context.loggedIn = true;
    context.tokenMessage = `Your OAuth token is: ${oauthTokenData.access}`;
    context.token = oauthTokenData.access;
    context.expiresIn = moment(oauthTokenData.expires).fromNow();
  }

  if (memberInfo) {
    const name = [memberInfo.firstName, memberInfo.lastName].join(' ');
    const displayName = name.length > 0 ? name : memberInfo.email;
    context.message = `Hello, ${displayName}`;
  }
  res.render('index', context);
});

// Delete cookie-session data and go home
app.get('/logout', (req, res) => {
  delete req.session.oauthTokenData;
  res.redirect('/');
});

// Begin the OAuth 2.0 flow
app.get('/auth', function (req, res) {
  var uri = launchDarklyAuth.code.getUri();
  res.redirect(uri);
});

// Make any GET request to LaunchDarkly's API using URL parameters
app.get('/get/:path*', function (req, res) {
  if (req.session.oauthTokenData === undefined) {
    res.redirect('/');
  }
  const endpoint = req.params.path + req.params[0];
  const token = launchDarklyAuth.createToken(
    req.session.oauthTokenData.access,
    req.session.oauthTokenData.refresh,
    'bearer',
  );
  const ldReq = token.sign({
    method: 'get',
    url: `${LD_DOMAIN}/api/v2/${endpoint}`,
  });
  axios(ldReq)
    .then((testRes) => {
      return res.send(testRes.data);
    })
    .catch((e) => {
      return res.send(e.toJSON());
    });
});

app.get('/redirect', function (req, res) {
  launchDarklyAuth.code
    .getToken(req.originalUrl)
    .then(function (token) {
      console.log(token); //=> { accessToken: '...', tokenType: 'bearer', ... }
      // The token should ideally be saved in the database at this point
      req.session.oauthTokenData = {
        access: token.accessToken,
        refresh: token.refreshToken,
        expires: token.expires,
      };

      // use the token to get the user's member information and save it in the session
      const ldReq = token.sign({
        method: 'get',
        url: `${LD_DOMAIN}/api/v2/members/me`,
      });
      axios(ldReq)
        .then((memberResponse) => {
          const { firstName, lastName, role, email, customRoles } = memberResponse.data;
          req.session.memberInfo = { firstName, lastName, role, email, customRoles };
          res.redirect('/');
        })
        .catch((e) => res.send(e.message));
    })
    .catch((e) => {
      res.send(e.message);
    });
});

app.get('/refresh', function (req, res) {
  if (req.session.oauthTokenData === undefined) {
    res.redirect('/');
  }
  const token = launchDarklyAuth.createToken(
    req.session.oauthTokenData.access,
    req.session.oauthTokenData.refresh,
    'bearer',
  );
  token
    .refresh()
    .then((updatedToken) => {
      console.log('Token successfully updated:', updatedToken !== token); //=> true
      console.log('New OAuth Token:', updatedToken.accessToken);

      // The token should ideally be saved in the database at this point
      // This example stores the token information in the cookie-session
      req.session.oauthTokenData = {
        access: updatedToken.accessToken,
        refresh: updatedToken.refreshToken,
        expires: updatedToken.expires,
      };
      res.redirect('/');
    })
    .catch((e) => {
      res.send(e.message);
    });
});

app.listen(PORT, () => console.log(`Example app listening on port ${PORT}!`));
