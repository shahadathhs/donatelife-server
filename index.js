const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const stripe = require("stripe");
const app = express();
require('dotenv').config();
const port = process.env.PORT || 5000;

// Initialize Stripe with the secret key
const stripeInstance = stripe(process.env.STRIPE_SECRET_KEY)

//middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const user = process.env.DB_USER
const password = process.env.DB_PASS

const uri = `mongodb+srv://${user}:${password}@cluster0.ahaugjj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    //await client.connect();

    const database = client.db("donateLifeDB");
    const locationsCollection = database.collection("location");
    const usersCollection = database.collection("users");
    const contactUsCollection = database.collection("contactUs");

    // jwt related api
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    })

    // middlewares 
    const verifyToken = (req, res, next) => {
      //console.log('inside verify token', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'Unauthorized' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'Unauthorized' });
        }
        req.decoded = decoded;
        next();
      })
    }

    // use verify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'Forbidden' });
      }
      next();
    }

    // user related api
    // for all users page (to load all users)
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const { status } = req.query;
      let query = {};
      if (status && status !== 'all') {
        query.status = status;
      }
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });
    //for dashboard role
    app.get("/users/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;

        if (email !== req.decoded.email) {
          return res.status(403).send({ message: 'forbidden access' })
        }

        const query = { email: email };
        // Search for the user in the database
        const user = await usersCollection.findOne(query);
        if (user) {
          console.log("User found:", user);
        } else {
          console.log("No user found with the provided email.");
        }
        res.send(user);
      } catch (error) {
        console.error("Error occurred during user retrieval:", error);
        res.status(500).send({ message: 'Internal Server Error', error: error.message });
      }
    })
    // for useAdmin hook
    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden' })
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin });
    })
    // for useAdminVolunteer hook
    app.get('/users/adminVolunteer/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
    
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden' });
      }
    
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let adminVolunteer = false;
      if (user) {
        adminVolunteer = user.role === 'admin' || user.role === 'volunteer';
      }
      res.send({ adminVolunteer });
    });    
    // for registration page
    app.post("/users", async(req, res) => {
      const user = req.body;
      try {
        // Construct a query object to find a user with the provided email
        const query = { email: user.email };
        // Check if a user with the provided email already exists
        const existingUser = await usersCollection.findOne(query);
        // If the user already exists, send a message indicating this
        if (existingUser) {
          return res.send({ message: "User already exists", insertedId: null });
        }
        // If the user does not exist, insert the new user into the collection
        const result = await usersCollection.insertOne(user);
        // Send the result of the insert operation back to the client
        res.send(result);
      } catch (error) {
        // Handle any errors that occurred during the process
        console.error('Error inserting user:', error);
        // Send an error response back to the client
        res.status(500).send({ error: 'An error occurred while inserting the user.' });
      }
    })
    // making donor/ volunteer admin
    app.patch("/users/admin/:id", verifyToken, verifyAdmin, async(req, res) => {
      const id = req.params.id;
      const query = { _id : new ObjectId(id)};
      const updateDoc = {
        $set: {
          role: 'admin'
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result)
    })
    // making donor volunteer
    app.patch("/users/volunteer/:id", verifyToken, verifyAdmin, async(req, res) => {
      const id = req.params.id;
      const query = { _id : new ObjectId(id)};
      const updateDoc = {
        $set: {
          role: 'volunteer'
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result)
    })
    // making active blocked
    app.patch("/users/blocked/:id", verifyToken, verifyAdmin, async(req, res) => {
      const id = req.params.id;
      const query = { _id : new ObjectId(id)};
      const updateDoc = {
        $set: {
          status: 'blocked'
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result)
    })
    // making blocked active
    app.patch("/users/active/:id", verifyToken, verifyAdmin, async(req, res) => {
      const id = req.params.id;
      const query = { _id : new ObjectId(id)};
      const updateDoc = {
        $set: {
          status: 'active'
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result)
    })

    // location related api
    // for all location select
    app.get("/location", async(req, res) => {
      try {
        // Fetch all users from the locations collection
        const result = await locationsCollection.find().toArray();
        // Send the result back to the client
        res.send(result);
      } catch (error) {
        // Handle any errors that occurred during the process
        console.error('Error fetching locations:', error);
        // Send an error response back to the client
        res.status(500).send({ error: 'An error occurred while fetching locations.' });
      }
    })

    // contact us related api
    // for message
    app.post("/contactUs", async(req,res) => {
      const contact = req.body;
      const result = await contactUsCollection.insertOne(contact)
      res.send(result)
    })
    
    // Send a ping to confirm a successful connection
    //await client.db("admin").command({ ping: 1 });
    // Get the database and collection on which to run the operation
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('DonateLife Server Running!')
})

app.listen(port, () => {
  console.log(`DonateLife listening on port ${port}`)
})