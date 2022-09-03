const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const app = express();
app.use(express.json());
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const userExistsQuery = `SELECT * FROM user WHERE username='${username}'`;
  const userExists = await db.get(userExistsQuery);
  if (userExists !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else if (password.length < 6) {
    response.status(400);
    response.send("Password is too short");
  } else {
    const hashedPassword = await bcrypt.hash(password, 10);
    const createQuery = `INSERT INTO user (name,username,password,gender) VALUES ('${name}','${username}','${hashedPassword}','${gender}');`;
    await db.run(createQuery);
    response.status(400);
    response.send("User created successfully");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const do_user_have_accountQuery = `SELECT * FROM user where username='${username}';`;
  const do_user_have_account = await db.get(do_user_have_accountQuery);
  if (do_user_have_account === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const is_correct_password = await bcrypt.compare(
      password,
      do_user_have_account.password
    );
    if (is_correct_password === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getQuery = `SELECT user.username,tweet.tweet,tweet.date_time 
  FROM user INNER JOIN follower ON user.user_id=follower.follower_user_id 
  INNER JOIN tweet ON follower.following_user_id=tweet.user_id 
  WHERE user.username='${username}' ORDER BY tweet.date_time DESC LIMIT 4;`;
  const getRes = await db.all(getQuery);
  console.log(getRes);
});
const convertObjectToList = (user_following_res) => {
  return { name: user_following_res.name };
};
app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;
  const user_following_query = `SELECT * FROM user INNER JOIN follower as f ON user.user_id=f.follower_user_id INNER JOIN user as u ON u.user_id=f.following_user_id WHERE user.username='${username}';`;
  const user_following_res = await db.all(user_following_query);
  const listRes = user_following_res.map((eachVal) =>
    convertObjectToList(eachVal)
  );
  response.send(listRes);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;
  const user_followers_query = `SELECT * FROM user INNER JOIN follower as f ON user.user_id=f.following_user_id INNER JOIN user as u ON u.user_id=f.follower_user_id WHERE user.username='${username}';`;
  const user_followers_res = await db.all(user_followers_query);
  const listRes = user_followers_res.map((eachVal) =>
    convertObjectToList(eachVal)
  );
  response.send(listRes);
});
const tweetidconvetObjectToList = (eachtweet) => {
  return eachtweet.tweet_id;
};
const tweetAuthenticateToken = async (request, response, next) => {
  let { username } = request;
  const user_following_query = `SELECT tweet.tweet_id
  FROM user INNER JOIN follower ON user.user_id=follower.follower_user_id 
  INNER JOIN tweet ON follower.following_user_id=tweet.user_id 
  WHERE user.username='${username}';`;
  const user_following_res = await db.all(user_following_query);
  const userfollowing_user_tweetid = user_following_res.map((eachvalue) =>
    tweetidconvetObjectToList(eachvalue)
  );
  request.userfollowing_user_tweetid = userfollowing_user_tweetid;
  next();
};
app.get(
  "/tweets/:tweetId/",
  authenticateToken,
  tweetAuthenticateToken,
  async (request, response) => {
    let { tweetId } = request.params;
    tweetId = parseInt(tweetId);
    const { userfollowing_user_tweetid } = request;
    const request_tweetid_inuserfollowinglist = userfollowing_user_tweetid.includes(
      tweetId
    );
    if (request_tweetid_inuserfollowinglist === true) {
      const tweetQuery = `SELECT tweet,date_time FROM tweet WHERE tweet_id=${tweetId};`;
      const tweet = await db.get(tweetQuery);
      const likesQuery = `SELECT COUNT(like_id) as likes_count FROM like WHERE tweet_id=${tweetId};`;
      const likes = await db.get(likesQuery);
      const replyQuery = `SELECT COUNT(reply_id) as replies_count FROM reply WHERE tweet_id=${tweetId};`;
      const replies = await db.get(replyQuery);
      const finalres = {
        tweet: tweet.tweet,
        likes: likes.likes_count,
        replies: replies.replies_count,
        dateTime: tweet.date_time,
      };
      response.send(finalres);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
const userLikesArrayofTweet = (eachuser) => {
  return eachuser.username;
};
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  tweetAuthenticateToken,
  async (request, response) => {
    let { tweetId } = request.params;
    tweetId = parseInt(tweetId);
    const { userfollowing_user_tweetid } = request;
    const request_tweetid_inuserfollowinglist = userfollowing_user_tweetid.includes(
      tweetId
    );
    if (request_tweetid_inuserfollowinglist === true) {
      const userLikesQuery = `SELECT user.username FROM like INNER JOIN user ON user.user_id=like.user_id WHERE like.tweet_id=${tweetId};`;
      const userLikesRes = await db.all(userLikesQuery);
      const userLikesArrayofTweetRes = userLikesRes.map((eachuser) =>
        userLikesArrayofTweet(eachuser)
      );
      const finalres = {
        likes: userLikesArrayofTweetRes,
      };
      response.send(finalres);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  tweetAuthenticateToken,
  async (request, response) => {
    let { tweetId } = request.params;
    tweetId = parseInt(tweetId);
    const { userfollowing_user_tweetid } = request;
    const request_tweetid_inuserfollowinglist = userfollowing_user_tweetid.includes(
      tweetId
    );
    if (request_tweetid_inuserfollowinglist === true) {
      const replyQuery = `SELECT name,reply FROM reply INNER JOIN user ON user.user_id=reply.user_id WHERE reply.tweet_id=${tweetId};`;
      const replyRes = await db.all(replyQuery);
      const finalRes = { replies: replyRes };
      response.send(finalRes);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get("/user/tweets/", authenticateToken, async (request, response) => {
   let { username } = request;
   const userIdQuery=`SELECT * FROM user WHERE username='${username}';`;
   const userId=await db.get(userIdQuery);
   const 
});

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const createTweet = `INSERT INTO tweet (tweet) VALUES ('${tweet}');`;
  await db.run(createTweet);
  response.send("Created a Tweet");
});
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    let { username } = request;
    const { tweetId } = request.params;
    const userIdUsernameQuery = `SELECT user_id FROM user WHERE username='${username}';`;
    const userIdUsername = await db.get(userIdUsernameQuery);
    const userIdtweetIdQuery = `SELECT user_id FROM tweet WHERE tweet_id=${tweetId};`;
    const userIdtweetId = await db.get(userIdtweetIdQuery);
    const isHeTheOwner = userIdUsername === userIdtweetId;
    console.log(userIdUsername, username, tweetId, userIdtweetId, isHeTheOwner);
    if (isHeTheOwner === true) {
      const deleteQuery = `DELETE FROM tweet WHERE tweet_id=${tweetId}`;
      await db.run(deleteQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
module.exports = app;
