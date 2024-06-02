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

    // jwt related api
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    })

    // middlewares 
    // const verifyToken = (req, res, next) => {
    //   // console.log('inside verify token', req.headers.authorization);
    //   if (!req.headers.authorization) {
    //     return res.status(401).send({ message: 'unauthorized access' });
    //   }
    //   const token = req.headers.authorization.split(' ')[1];
    //   jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    //     if (err) {
    //       return res.status(401).send({ message: 'unauthorized access' })
    //     }
    //     req.decoded = decoded;
    //     next();
    //   })
    // }

    // use verify admin after verifyToken
    // const verifyAdmin = async (req, res, next) => {
    //   const email = req.decoded.email;
    //   const query = { email: email };
    //   const user = await userCollection.findOne(query);
    //   const isAdmin = user?.role === 'admin';
    //   if (!isAdmin) {
    //     return res.status(403).send({ message: 'forbidden access' });
    //   }
    //   next();
    // }

    // user related api
    app.get("/users", async(req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result)
    })

    app.get("/users/:email", async (req, res) => {
      try {
        const email = req.params.email;
        console.log("Received email parameter:", email);
        const query = { email: email };
        console.log("Executing query to find user:", query);
    
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
    });
    

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

    // location related api
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