require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());

const weights = {
  AAPL: 0.065,
  MSFT: 0.06,
  AMZN: 0.033,
  GOOGL: 0.025,
  NVDA: 0.04,
};

const API_KEY = process.env.FINNHUB_API_KEY;
const BASE_URL = 'https://finnhub.io/api/v1/quote';
const HISTORY_FILE = path.join(__dirname, 'history.json');

const getHistory = () => {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  const raw = fs.readFileSync(HISTORY_FILE);
  return JSON.parse(raw);
};

const saveHistory = (entry) => {
  const history = getHistory();
  history.push(entry);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(-100), null, 2));
};

app.get('/api/spy-nav', async (_req, res) => {
  if (!API_KEY) return res.status(500).json({ error: 'API key missing' });

  try {
    let nav = 0;
    for (const [ticker, weight] of Object.entries(weights)) {
      const { data } = await axios.get(`${BASE_URL}?symbol=${ticker}&token=${API_KEY}`);
      nav += data.c * weight;
    }

    const finalNav = parseFloat((nav * 10).toFixed(2));
    const timestamp = new Date().toISOString();

    saveHistory({ time: timestamp, nav: finalNav });

    res.json({ nav: finalNav });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to compute NAV' });
  }
});


app.get('/api/spy-history', (_req, res) => {
  res.json(getHistory());
});

app.delete('/api/spy-history', (_req, res) => {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify([]));
    res.json({ message: 'History reset' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset history' });
  }
});

app.get('/api/spy-price', async (_req, res) => {
  try {
    const response = await axios.get(`https://finnhub.io/api/v1/quote?symbol=SPY&token=${API_KEY}`);
    res.json({ price: response.data.c });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch SPY price' });
  }
});


const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`🚀 Backend listening on http://localhost:${PORT}`);
});
