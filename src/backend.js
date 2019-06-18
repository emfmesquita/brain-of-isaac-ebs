const express = require("express");
const jsonwebtoken = require("jsonwebtoken");
const cors = require("cors");
const axios = require("axios");
const session = require("express-session");
const bodyParser = require("body-parser");
const MongoStore = require("connect-mongo")(session);
const LoginRoutes = require("./LoginRoutes");
require("dotenv").config();

const app = express();
app.use(cors());

app.use(
  session({
    cookie: {
      maxAge: 7 * 24 * 3600 * 1000,
      secure: process.env.SESSION_MODE !== "DEV"
    },
    secret: process.env.SESSION_SECRET,
    saveUninitialized: false,
    resave: process.env.SESSION_MODE === "DEV",
    store: new MongoStore({
      url: process.env.MONGODB_CONN_STRING,
      touchAfter: 3600,
      ttl: 7 * 24 * 3600
    })
  })
);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const port = process.env.PORT || 3000;
const clientId = process.env.ENV_CLIENT_ID;
const secret = Buffer.from(process.env.ENV_SECRET, "base64");

const bearerPrefix = "Bearer ";
const channelData = {};

const isLogged = req => {
  return req.session.userData && req.session.userData.id;
};

app.put("/update", (req, res) => {
  if (!isLogged(req)) {
    res.sendStatus(401);
    return 401;
  }

  const channelId = req.session.userData.id;
  const jwtPayload = {
    exp: Date.now() + 60,
    role: "external",
    channel_id: channelId,
    pubsub_perms: {
      send: ["broadcast"]
    }
  };
  const token = jsonwebtoken.sign(jwtPayload, secret);

  const newData = {
    tr: req.body.tr
  };
  channelData[channelId] = newData;

  axios
    .post(
      `https://api.twitch.tv/extensions/message/${channelId}`,
      {
        content_type: "application/json",
        message: JSON.stringify(newData),
        targets: ["broadcast"]
      },
      {
        headers: {
          Authorization: bearerPrefix + token,
          "Client-Id": clientId,
          "Content-Type": "application/json"
        }
      }
    )
    .then(pubsubRes => {
      res.status(200);
    })
    .catch(error => {
      console.error(error);
      res.status(500).send(error);
    });
});

app.get("/", (req, res) => {
  if (!isLogged(req)) {
    res.sendStatus(401);
  } else {
    res.send("Hello World!");
  }
});

app.get("/ping", (req, res) => {
  res.send("pong");
});

LoginRoutes(app);

app.listen(port, () => {
  console.log(`Brain of Isaac EBS listening on port ${port}!`);
  setInterval(() => {
    axios.get(`${process.env.EBS_URL}/ping`).then(res => console.log(res.data));
  }, 300000); // every 5 minutes (300000)
});
