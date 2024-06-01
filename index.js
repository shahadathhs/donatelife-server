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