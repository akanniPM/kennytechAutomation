const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Serverless API Routes mapping
const intakeRoute = require('./api/intake');
const partsRoute = require('./api/parts');
const handoverRoute = require('./api/handover');
const b2bSaleRoute = require('./api/b2b-sale');
const paystackRoute = require('./api/paystack');
const receiptVerifyRoute = require('./api/receipt-verify');
const restockRoute = require('./api/restock');

app.all('/api/intake', (req, res) => intakeRoute(req, res));
app.all('/api/parts', (req, res) => partsRoute(req, res));
app.all('/api/handover', (req, res) => handoverRoute(req, res));
app.all('/api/b2b-sale', (req, res) => b2bSaleRoute(req, res));
app.all('/api/paystack', (req, res) => paystackRoute(req, res));
app.all('/api/receipt-verify', (req, res) => receiptVerifyRoute(req, res));
app.all('/api/restock', (req, res) => restockRoute(req, res));

app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 FixFlow Core Local Server Active!`);
  console.log(`💻 Dashboard: http://localhost:${PORT}`);
  console.log(`==================================================`);
});
