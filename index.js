require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://volunteer-management-91459.web.app",
      "https://volunteer-management-91459.firebaseapp.com",
    ],
    credentials: true,
    optionsSuccessStatus: 200,
  })
);
app.use(cookieParser());

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).send({ message: "unauthorized access" });
  if (token) {
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (err) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      req.user = decoded;
      next();
    });
  }
};

// cookie options
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6ze9kj8.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
// const uri = `mongodb+srv://volunteer:WAeAMbvRV06W3Hff@cluster0.6ze9kj8.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const volunteerCollection = client
      .db("volunteerManagementDB")
      .collection("volunteers");
    const requestCollection = client
      .db("volunteerManagementDB")
      .collection("requests");

    //creating Token
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });

      res.cookie("token", token, cookieOptions).send({ success: true });
    });

    //clearing Token
    app.post("/logout", async (req, res) => {
      res
        .clearCookie("token", { ...cookieOptions, maxAge: 0 })
        .send({ success: true });
    });

    // get all volunteers from the database
    app.get("/all-volunteers", async (req, res) => {
      const search = req.query?.search;
      const page = parseInt(req.query?.page) - 1;
      const size = parseInt(req.query?.size);


      let query = {};
      if (search) {
        query = { title: { $regex: search, $options: "i" } };
      }

      const result = await volunteerCollection
        .find(query)
        .skip(page * size)
        .limit(size)
        .toArray();

      res.send(result);
    });

    // get total volunteers count
    app.get("/volunteers-count", async (req, res) => {
      const search = req.query.search;
      const query = {
        title: { $regex: search, $options: "i" },
      };
      const count = await volunteerCollection.countDocuments(query);
      res.send({ count });
    });

    app.get("/volunteers-now", async (req, res) => {
      const result = await volunteerCollection
        .find()
        .sort({ deadline: 1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    app.get("/volunteers/:email", verifyToken, async (req, res) => {
      const email = req.params?.email;
      const query = { email: email };
      const tokenEmail = req?.user?.email;
      if (email !== tokenEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const result = await volunteerCollection.find(query).toArray();
      res.send(result);
    });

    // get a single volunteer by id
    app.get("/volunteers/s/:id", async (req, res) => {
      const id = req.params?.id;
      const query = { _id: new ObjectId(id) };
      const result = await volunteerCollection.findOne(query);
      res.send(result);
    });

    // add volunteer to the database
    app.post("/add-volunteer", async (req, res) => {
      const volunteer = req.body;
      const result = await volunteerCollection.insertOne(volunteer);
      res.send(result);
    });

    // update a specific volunteer document
    app.put("/volunteers/:id", async (req, res) => {
      const updateVolunteer = req.body;
      const id = req.params?.id;
      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...updateVolunteer,
        },
      };
      const result = await volunteerCollection.updateOne(
        query,
        updateDoc,
        options
      );
      res.send(result);
    });

    // delete a volunteer by id
    app.delete("/volunteers/:id", async (req, res) => {
      const id = req.params?.id;
      const query = { _id: new ObjectId(id) };
      const result = await volunteerCollection.deleteOne(query);
      res.send(result);
    });

    // request related api

    app.get("/requests/:email", verifyToken, async (req, res) => {
      const {
        params: { email },
      } = req;
      const tokenEmail = req?.user?.email;
      if (email !== tokenEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const result = await requestCollection
        .find({
          "volunteer_info.volunteer_email": email,
        })
        .toArray();
      res.send(result);
    });

    app.post("/requests", async (req, res) => {
      const volunteerReq = req.body;

      // validation check if volunteer === 0
      const volunteerCount = { _id: new ObjectId(volunteerReq.postId) };
      const { volunteer } = await volunteerCollection.findOne(volunteerCount);
      if (volunteer < 1) {
        return res.send({ message: "No Need volunteer" });
      }

      const query = {
        email:volunteerReq?.organizer_email,
        postId:volunteerReq?.postId
      }

      const alreadyRequest = await requestCollection.findOne(query)
      console.log(alreadyRequest);
      if(alreadyRequest) {
        return res.status(400).send('You have already request this post!')
      }

      const result = await requestCollection.insertOne(volunteerReq);

      const updateDoc = {
        $inc: { volunteer: -1 },
      };

      const reqQuery = { _id: new ObjectId(volunteerReq?.postId) };
      const updateReqCount = await volunteerCollection.updateOne(
        reqQuery,
        updateDoc
      );

      res.send(result);
    });

    app.delete("/requests/:id", async (req, res) => {
      const {
        params: { id },
        query: { postId },
      } = req;

      const query = { _id: new ObjectId(id) };
      const result = await requestCollection.deleteOne(query);
      // undo volunteers need count
      const undoQuery = { _id: new ObjectId(postId) };
      const updateDoc = {
        $inc: { volunteer: 1 },
      };

      await volunteerCollection.updateOne(undoQuery, updateDoc);
      res.send(result);
    });
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send({ msg: "Volunteer Management system" });
});

app.listen(port, () => {
  console.log(`server on running port ${port}`);
});
