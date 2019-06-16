const fs = require("fs");
const path = require("path");
const handlebars = require("handlebars");
const signature = require("cookie-signature");
const querystring = require("querystring");
const axios = require("axios");
require("dotenv").config();

const clientId = process.env.ENV_CLIENT_ID;
const apiSecret = process.env.API_SECRET;

const oauthRedirectUrl = process.env.OAUTH_REDIRECT_URL;
const oauthCodeUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&response_type=code&force_verify=true&scope=&redirect_uri=${oauthRedirectUrl}`;
const oauthTokenUrl = code =>
  `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${apiSecret}&code=${code}&grant_type=authorization_code&redirect_uri=${oauthRedirectUrl}`;
const userUrl = "https://api.twitch.tv/helix/users";

module.exports = app => {
  const isLogged = req => {
    return req.session.userData && req.session.userData.id;
  };

  const loginPageTemplate = handlebars.compile(
    fs.readFileSync(path.resolve(__dirname, "login.html")) + ""
  );

  const sessionIdToClientPage = (req, port) => {
    const sessionId =
      "s:" + signature.sign(req.sessionID, process.env.SESSION_SECRET);
    const userData = req.session.userData;
    return loginPageTemplate({
      ...userData,
      sessionId,
      clientUrl: `http://localhost:${port}`
    });
  };

  app.get("/login/:port", (req, res) => {
    if (isLogged(req)) {
      res.send(sessionIdToClientPage(req, req.params.port));
    } else {
      res.redirect(oauthCodeUrl + `&state=${req.params.port}`);
    }
  });

  app.get("/oauthredirect", async (req, res) => {
    const queryStr = req.url.substr(req.url.lastIndexOf("?") + 1);
    const query = querystring.parse(queryStr);
    const port = query.state;
    const code = query.code;
    let token;

    // gets twitch api token
    try {
      const tokenResponse = await axios.post(oauthTokenUrl(code));
      token = tokenResponse.data.access_token;
    } catch (error) {
      res.status(500).send(error);
      return;
    }

    // gets user info
    try {
      const userResponse = await axios.get(userUrl, {
        headers: {
          Authorization: "Bearer " + token
        }
      });
      const userData = userResponse.data.data[0];
      req.session.userData = userData;
      res.send(sessionIdToClientPage(req, port));
    } catch (error) {
      res.status(500).send(error);
    }
  });

  app.get("/isloggedin", (req, res) => {
    if (!isLogged(req)) {
      res.status(401).send("false");
    } else {
      res.send("true");
    }
  });

  app.get("/logout", (req, res) => {
    if (!isLogged(req)) {
      res.sendStatus(401);
    } else {
      req.session.destroy(err => res.sendStatus(err ? 500 : 200));
    }
  });
};
