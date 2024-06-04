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
    const blogsCollection = database.collection("blogs");
    const donationRequestsCollection = database.collection("donationRequests");
    const paymentsCollection = database.collection("payments");

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
    // use verify adminVolunteer after verifyToken
    const verifyAdminVolunteer = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
    
      const isAdminVolunteer = user?.role === 'admin' || user?.role === 'volunteer';
      if (!isAdminVolunteer) {
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
    // search page 
    app.get('/donors', async (req, res) => {
      const { role, bloodGroup, district, upazila } = req.query;
      let query = { role };
    
      if (bloodGroup) {
        query.bloodGroup = bloodGroup
      };
      if (district) {
        query.district = district
      };
      if (upazila) {
        query.upazila = upazila
      };
    
      try {
        const result = await usersCollection.find(query).toArray();
        res.status(200).send(result);
      } catch (error) {
        res.status(500).send({ message: 'Error fetching donors', error });
      }
    });

    //blog related api
    // for add blogs
    app.post("/blogs", verifyToken, verifyAdminVolunteer, async(req, res) => {
      try {
        const blog = req.body;
        const result = await blogsCollection.insertOne(blog);
        res.send(result);
      } catch (error) {
        console.error('Error inserting blog:', error);
        res.status(500).send({ error: 'An error occurred while inserting the blog.' });
      }
    })
    // for load blogs in dashboard
    app.get("/dashboard/blogs", verifyToken, verifyAdminVolunteer, async (req, res) => {
      const { status } = req.query;
      let query = {};
      if (status && status !== 'all') {
        query.status = status;
      }
      const result = await blogsCollection.find(query).toArray();
      res.send(result);
    })
    // for load blogs in blogs page
    app.get("/blogs", async (req, res) => {
      const result = await blogsCollection.find().toArray()
      res.send(result)
    })
    // for blogDetails page
    app.get("/blogs/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id : new ObjectId(id)};
      const result = await blogsCollection.findOne(query)
      res.send(result)
    })
    // making draft published
    app.patch("/users/published/:id", verifyToken, verifyAdmin, async(req, res) => {
      const id = req.params.id;
      const query = { _id : new ObjectId(id)};
      const updateDoc = {
        $set: {
          status: 'published'
        },
      };
      const result = await blogsCollection.updateOne(query, updateDoc);
      res.send(result)
    })
    // making published draft
    app.patch("/users/draft/:id", verifyToken, verifyAdmin, async(req, res) => {
      const id = req.params.id;
      const query = { _id : new ObjectId(id)};
      const updateDoc = {
        $set: {
          status: 'draft'
        },
      };
      const result = await blogsCollection.updateOne(query, updateDoc);
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

    // blood donation request related api
    // for making request
    app.post("/donationRequests", async(req, res) => {
      try {
        const donationRequest = req.body;
        const result = await donationRequestsCollection.insertOne(donationRequest);
        res.send(result);
      } catch (error) {
        console.error('Error inserting blog:', error);
        res.status(500).send({ error: 'An error occurred while inserting the blog.' });
      }
    })
    // for pending donation request
    app.get("/pendingRequests", async (req, res) => {
      const { status } = req.query;
      let query = {};

      if (status) {
        query.status = status;
      }

      try {
        const result = await donationRequestsCollection.find(query).toArray();
        res.status(200).send(result);
      } catch (error) {
        res.status(500).send({ message: 'Error fetching pending requests', error });
      }
    })
    // for single user donation request
    app.get("/donationRequests", verifyToken, async(req, res) => {
      const email = req.query.email;
      const query = {requesterEmail : email}
      const result = await donationRequestsCollection.find(query).toArray();
      res.send(result)
    })
    // for single user donation request (all with filter)
    app.get("/myDonationRequests", verifyToken, async (req, res) => {
      const email = req.query.email;
      const status = req.query.status;
      // Initialize the query object with requesterEmail
      let query = { requesterEmail: email };
      // Add status to the query if provided and not equal to 'all'
      if (status && status !== 'all') {
          query.status = status;
      }
      try {
        const result = await donationRequestsCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: 'An error occurred while fetching the donation requests.' });
      }
    });
    // all donation request
    app.get("/allDonationRequests", verifyToken, verifyAdminVolunteer, async (req, res) => {
      const status = req.query.status;
      let query = {};
  
      if (status && status !== 'all') {
          query.status = status;
      }
      try {
          const result = await donationRequestsCollection.find(query).toArray();
          res.send(result);
      } catch (error) {
          res.status(500).send({ error: 'An error occurred while fetching the donation requests.' });
      }
  });
  
    // for donationDetails page
    app.get("/donationRequests/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id : new ObjectId(id)};
      const result = await donationRequestsCollection.findOne(query)
      res.send(result)
    })
    // for making donation inprogress
    app.patch("/donationRequests/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const { donorName, donorEmail } = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: {
          status: 'inprogress',
          donorName,
          donorEmail
        }
      };
      const result = await donationRequestsCollection.updateOne(query, update);
      res.send(result)
    })
    // making inprogress done
    app.patch("/donationRequests/done/:id", verifyToken, async(req, res) => {
      const id = req.params.id;
      const query = { _id : new ObjectId(id)};
      const updateDoc = {
        $set: {
          status: 'done'
        },
      };
      const result = await donationRequestsCollection.updateOne(query, updateDoc);
      res.send(result)
    })
    // making inprogress cancel
    app.patch("/donationRequests/cancel/:id", verifyToken, async(req, res) => {
      const id = req.params.id;
      const query = { _id : new ObjectId(id)};
      const updateDoc = {
        $set: {
          status: 'cancel'
        },
      };
      const result = await donationRequestsCollection.updateOne(query, updateDoc);
      res.send(result)
    })
    // deleting single request
    app.delete("/donationRequests/:id", verifyToken, async(req, res) => {
      const id = req.params.id;
      const query = { _id : new ObjectId(id)};
      const result = await donationRequestsCollection.deleteOne(query);
      res.send(result)
    })
    // for editing donation requests
    app.patch("/editingRequests/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const { 
        requesterName, requesterEmail,
        recipientName, recipientBloodGroup,
        recipientDistrict, recipientUpazila,
        hospital, fullAddress,
        requesterMessage, donationDate, donationTime
      } = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: {
          requesterName, requesterEmail,
          recipientName, recipientBloodGroup,
          recipientDistrict, recipientUpazila,
          hospital, fullAddress,
          requesterMessage, donationDate, donationTime
        }
      };
      const result = await donationRequestsCollection.updateOne(query, update);
      res.send(result)
    })

    // contact us related api
    // for message
    app.post("/contactUs", async(req,res) => {
      const contact = req.body;
      const result = await contactUsCollection.insertOne(contact)
      res.send(result)
    })

    //payment related api
    //payment intent
    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100); // Amount in cents
      try {
        // Create a PaymentIntent with the order amount and currency
        const paymentIntent = await stripeInstance.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card", "link"],
        });
    
        res.send({
          clientSecret: paymentIntent.client_secret,
        });
        console.log('Payment SUCCESS', req.body)
      } catch (error) {
        console.error('Error creating payment intent:', error);
        res.status(500).send({ error: 'Internal Server Error' });
      }
    });
    // inserting payment in database
    app.post('/payments', verifyToken, async(req, res) => {
      const payment = req.body;
      const paymentResult = await paymentsCollection.insertOne(payment);
      console.log("payment saved",payment)
      res.send(paymentResult)
    })
    // loading payment in funding page
    app.get("/payments", verifyToken, async(req, res) => {
      const result = await paymentsCollection.find().toArray();
      res.send(result)
    })

    // dash board stats for admin and volunteer
    // stats related api
    // app.get("/admin-stats", verifyToken, verifyAdmin, async(req, res) => {
    //   const users = await usersCollection.estimatedDocumentCount();
    //   const donationRequests = await donationRequestsCollection.estimatedDocumentCount();
    //   const fundingContributor = await paymentsCollection.estimatedDocumentCount();

    //   const result = await paymentsCollection.aggregate([
    //     {
    //       $group: {
    //         _id: null,
    //         totalRevenue: { $sum: '$fundAmount'}
    //       }
    //     }
    //   ]).toArray();
    //   const totalFunds = result.length > 0 ? result[0].totalRevenue : 0;
      
    //   res.send({users, donationRequests, fundingContributor, totalFunds})
    // })
    app.get("/admin-stats", verifyToken, verifyAdminVolunteer, async (req, res) => {
      try {
        // Retrieve donor users efficiently using aggregation pipeline
        const donorCount = await usersCollection.aggregate([
          {
            $match: { role: "donor" } // Filter for users with "donor" status
          },
          { $count: "donorCount" } // Count matching documents
        ]).toArray();
    
        const totalDonors = donorCount.length > 0 ? donorCount[0].donorCount : 0;
    
        // Fetch other statistics with potential type conversion
        const users = await usersCollection.estimatedDocumentCount();
        const donationRequests = await donationRequestsCollection.estimatedDocumentCount();
        const fundingContributors = await paymentsCollection.estimatedDocumentCount();
    
        const totalFundsResult = await paymentsCollection.aggregate([
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: { $convert: { input: "$fundAmount", to: "decimal" } } }
              //totalRevenue: { $sum: '$fundAmount'}
            }
          }
        ]).toArray();
        const totalFunds = totalFundsResult.length > 0 ? totalFundsResult[0].totalRevenue : 0;
    
        res.send({ users, donationRequests, fundingContributors, totalFunds, totalDonors});
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Error retrieving admin statistics" });
      }
    });
    
    
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