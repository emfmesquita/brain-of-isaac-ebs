const express = require("express");
const jsonwebtoken = require("jsonwebtoken");
const color = require("color");
const cors = require("cors");
const axios = require("axios");
const session = require('express-session');
const bodyParser = require('body-parser')
const MongoStore = require('connect-mongo')(session);
const LoginRoutes = require("./LoginRoutes");
require("dotenv").config();

const app = express();
app.use(cors());

app.use(session({
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
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const port = process.env.PORT || 3000;
const clientId = process.env.ENV_CLIENT_ID;
const secret = Buffer.from(process.env.ENV_SECRET, "base64");

const bearerPrefix = "Bearer ";
const channelColors = {};
const channelData = {};
const initialColor = color("#6441A4");
const colorWheelRotation = 30;

const MSGS = {
  invalidAuthHeader: "Invalid authorization header",
  invalidJwt: "Invalid JWT"
};

const verifyAndDecode = header => {
  if (header && header.startsWith(bearerPrefix)) {
    try {
      const token = header.substring(bearerPrefix.length);
      return jsonwebtoken.verify(token, secret, { algorithms: ["HS256"] });
    } catch (error) {
      throw new Error(MSGS.invalidJwt);
    }
  }
  throw new Error(MSGS.invalidAuthHeader);
};

const isLogged = (req) => {
  return req.session.userData && req.session.userData.id;
}

app.get("/msg", (req, res) => {
  const channelId = "54240816";
  const jwtPayload = {
    exp: Date.now() + 60,
    role: "external",
    channel_id: channelId,
    pubsub_perms: {
      send: ["broadcast"]
    }
  };
  const token = jsonwebtoken.sign(jwtPayload, secret);

  axios.post(
    "https://api.twitch.tv/extensions/message/54240816",
    {
      content_type: "application/json",
      message: '{"foo":"bar"}',
      targets: ["broadcast"]
    },
    {
      headers: {
        Authorization: bearerPrefix + token,
        "Client-Id": clientId,
        "Content-Type": "application/json"
      }
    }
  ).then(pubsubRes => {
    res.send("msg sent");
  }).catch(error => {
    console.log(error);
    res.status("500").send(error);
  });
});

app.get("/got/:trans/:itemId", (req, res) => {
  const itemId =  req.params.itemId;
  const trans = req.params.trans;
  if(!itemId || !trans){
    res.status("500").send("missing params");
  }

  const channelId = "54240816";
  const jwtPayload = {
    exp: Date.now() + 60,
    role: "external",
    channel_id: channelId,
    pubsub_perms: {
      send: ["broadcast"]
    }
  };
  const token = jsonwebtoken.sign(jwtPayload, secret);

  if(!channelData[channelId]){
    channelData[channelId]= {
      tr: {
        gup: [0 ,[], []],
        bee: [0, [], []]
      }
    }
  }

  const gotItems = channelData[channelId].tr[trans][1];
  if(gotItems.indexOf(itemId) === -1) {
    gotItems.push(itemId);
    channelData[channelId].tr[trans][0] = gotItems.length;
  }



  axios.post(
    "https://api.twitch.tv/extensions/message/54240816",
    {
      content_type: "application/json",
      message: JSON.stringify(channelData[channelId]),
      targets: ["broadcast"]
    },
    {
      headers: {
        Authorization: bearerPrefix + token,
        "Client-Id": clientId,
        "Content-Type": "application/json"
      }
    }
  ).then(pubsubRes => {
    res.send("item added");
  }).catch(error => {
    console.error(error);
    res.status("500").send(error);
  });
});

app.put("/update", (req, res) => {
  if(!isLogged(req)){
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
  }
  channelData[channelId] = newData;

  axios.post(
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
  ).then(pubsubRes => {
    res.status(200);
  }).catch(error => {
    console.error(error);
    res.status(500).send(error);
  });
});

app.get("/", (req, res) => {
  if(!isLogged(req)){
    res.sendStatus(401);
  } else{
    res.send("Hello World!");
  }
});

LoginRoutes(app);

app.listen(port, () => console.log(`Brain of Isaac EBS listening on port ${port}!`));
