'use strict';

require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const axios = require('axios');
const moment = require('moment');
const ClientOAuth2 = require('client-oauth2');

// Decode a JWT payload without verifying the signature (for display purposes)
function decodeJwtPayload(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString());
}

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

  if (req.session.idTokenClaims) {
    context.isOidc = true;
    context.idTokenClaims = JSON.stringify(req.session.idTokenClaims, null, 2);
    context.idTokenRaw = req.session.idTokenRaw;
    context.oidcUserInfo = JSON.stringify(req.session.oidcUserInfo, null, 2);
  }

  res.render('index', context);
});

// Delete session data and go home
app.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/');
});

// Begin the standard OAuth 2.0 flow
app.get('/auth', function (req, res) {
  req.session.useOidc = false;
  var uri = launchDarklyAuth.code.getUri();
  res.redirect(uri);
});

// Begin the OIDC flow (adds openid scope, uses /oidc/token endpoint)
app.get('/auth/oidc', function (req, res) {
  req.session.useOidc = true;
  var uri = launchDarklyAuth.code.getUri({ scopes: ['writer', 'openid'] });
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
  if (req.session.useOidc) {
    // OIDC flow: manually exchange the authorization code at the OIDC token endpoint
    const url = new URL(req.originalUrl, `http://localhost:${PORT}`);
    const code = url.searchParams.get('code');

    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', REDIRECT_URI);
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);

    axios
      .post(`${LD_DOMAIN}/trust/oidc/token`, params)
      .then(function (tokenResponse) {
        const data = tokenResponse.data;
        req.session.oauthTokenData = {
          access: data.access_token,
          refresh: data.refresh_token,
          expires: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
        };

        // Decode the ID token immediately (it expires in ~5 seconds)
        if (data.id_token) {
          req.session.idTokenRaw = data.id_token;
          req.session.idTokenClaims = decodeJwtPayload(data.id_token);
        }

        // Fetch userinfo and member info in parallel
        return Promise.all([
          axios.get(`${LD_DOMAIN}/trust/oidc/userinfo`, {
            headers: { Authorization: `Bearer ${data.access_token}` },
          }),
          axios.get(`${LD_DOMAIN}/api/v2/members/me`, {
            headers: { Authorization: `Bearer ${data.access_token}` },
          }),
        ]);
      })
      .then(function ([userInfoResponse, memberResponse]) {
        req.session.oidcUserInfo = userInfoResponse.data;
        const { firstName, lastName, role, email, customRoles } = memberResponse.data;
        req.session.memberInfo = { firstName, lastName, role, email, customRoles };
        res.redirect('/');
      })
      .catch((e) => res.send(e.message));
  } else {
    // Standard OAuth flow
    launchDarklyAuth.code
      .getToken(req.originalUrl)
      .then(function (token) {
        console.log(token); //=> { accessToken: '...', tokenType: 'bearer', ... }
        req.session.oauthTokenData = {
          access: token.accessToken,
          refresh: token.refreshToken,
          expires: token.expires,
        };

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
  }
});

app.get('/refresh', function (req, res) {
  if (req.session.oauthTokenData === undefined) {
    res.redirect('/');
    return;
  }

  if (req.session.useOidc) {
    // OIDC refresh: manually POST to the OIDC token endpoint
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', req.session.oauthTokenData.refresh);
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);

    axios
      .post(`${LD_DOMAIN}/trust/oidc/token`, params)
      .then(function (tokenResponse) {
        const data = tokenResponse.data;
        req.session.oauthTokenData = {
          access: data.access_token,
          refresh: data.refresh_token,
          expires: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
        };
        if (data.id_token) {
          req.session.idTokenRaw = data.id_token;
          req.session.idTokenClaims = decodeJwtPayload(data.id_token);
        }
        res.redirect('/');
      })
      .catch((e) => res.send(e.message));
  } else {
    // Standard OAuth refresh
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
  }
});

// Fetch the OAuth Authorization Server Metadata (RFC 8414)
app.get('/discovery', function (req, res) {
  axios
    .get(`${LD_DOMAIN}/.well-known/oauth-authorization-server`)
    .then((response) => res.json(response.data))
    .catch((e) => res.status(500).send(e.message));
});

// Fetch OIDC userinfo for the current session
app.get('/userinfo', function (req, res) {
  if (!req.session.oauthTokenData) return res.redirect('/');
  axios
    .get(`${LD_DOMAIN}/trust/oidc/userinfo`, {
      headers: { Authorization: `Bearer ${req.session.oauthTokenData.access}` },
    })
    .then((response) => res.json(response.data))
    .catch((e) => res.status(500).send(e.message));
});

app.listen(PORT, () => console.log(`Example app listening on port ${PORT}!`));
