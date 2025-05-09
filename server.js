// backend/server.js
require('dotenv').config()

const express = require('express')
const cors = require('cors')
const axios = require('axios')
const fs = require('fs')
const path = require('path')

const app = express()
const PORT = process.env.PORT || 5051
const API_KEY = process.env.FINNHUB_API_KEY
const BASE_URL = 'https://finnhub.io/api/v1/quote'
const HISTORY_FILE = path.join(__dirname, 'history.json')

// Middleware to log all incoming requests
app.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.url} from ${req.headers.origin || 'unknown'}`)
  next()
})

app.use(cors({ origin: ['https://spy-nav-frontend.vercel.app', 'http://localhost:3000'] }))
app.use(express.json())

// Helper functions
const getHistory = () => fs.existsSync(HISTORY_FILE) 
  ? JSON.parse(fs.readFileSync(HISTORY_FILE)) 
  : []

const saveHistory = (entry) => {
  const history = getHistory()
  history.push(entry)
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(-100), null, 2))
}

// Constants
const WEIGHTS = {
  AAPL: 0.065,
  MSFT: 0.06,
  AMZN: 0.033,
  GOOGL: 0.025,
  NVDA: 0.04
}

// Retry helper for Finnhub API calls
const fetchWithRetry = async (url, retries = 5, delay = 2000) => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.get(url, { timeout: 10000 }) // Increased timeout
      return response
    } catch (err) {
      if (i === retries - 1) throw err
      console.warn(`Retrying request (${i + 1}/${retries}): ${url}, Error: ${err.message}`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
}

// Routes
app.get('/', (_req, res) => {
  console.log('Health check requested')
  res.json({ status: 'OK' })
})

app.get('/api/spy-nav/?', async (_req, res) => {
  if (!API_KEY) {
    console.error('Finnhub API key missing')
    return res.status(500).json({ error: 'API key missing' })
  }

  try {
    let nav = 0
    for (const [ticker, weight] of Object.entries(WEIGHTS)) {
      const url = `${BASE_URL}?symbol=${ticker}&token=${API_KEY}`
      const { data } = await fetchWithRetry(url)
      if (!data.c) throw new Error(`Invalid price data for ${ticker}`)
      nav += data.c * weight
      console.log(`Fetched ${ticker} price: ${data.c}`)
    }
    const finalNav = parseFloat((nav * 10).toFixed(2))
    saveHistory({ time: new Date().toISOString(), nav: finalNav })
    console.log(`Computed NAV: ${finalNav}, Saved to history`)
    res.status(200).json({ nav: finalNav })
    console.log('Sent response: 200 OK with', { nav: finalNav })
  } catch (err) {
    console.error('Error computing NAV:', err.message, err.response?.data)
    res.status(500).json({ error: 'Failed to compute NAV', details: err.message })
    console.log('Sent response: 500 Internal Server Error')
  }
})

app.get('/api/spy-price/?', async (_req, res) => {
  if (!API_KEY) {
    console.error('Finnhub API key missing')
    return res.status(500).json({ error: 'API key missing' })
  }

  try {
    const url = `${BASE_URL}?symbol=SPY&token=${API_KEY}`
    const { data } = await fetchWithRetry(url)
    if (!data.c) throw new Error('Invalid price data for SPY')
    console.log(`Fetched SPY price: ${data.c}`)
    res.status(200).json({ price: data.c })
    console.log('Sent response: 200 OK with', { price: data.c })
  } catch (err) {
    console.error('Error fetching SPY price:', err.message, err.response?.data)
    res.status(500).json({ error: 'Failed to fetch SPY price', details: err.message })
    console.log('Sent response: 500 Internal Server Error')
  }
})

app.get('/api/spy-history', (_req, res) => {
  const history = getHistory()
  console.log(`Returning history with ${history.length} entries`)
  res.status(200).json(history)
  console.log('Sent response: 200 OK with history')
})

app.delete('/api/spy-history', (_req, res) => {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify([]))
    console.log('History reset')
    res.status(200).json({ message: 'History reset' })
    console.log('Sent response: 200 OK with history reset')
  } catch (err) {
    console.error('Error resetting history:', err)
    res.status(500).json({ error: 'Failed to reset history' })
    console.log('Sent response: 500 Internal Server Error')
  }
})

// Catch-all for 404 errors
app.use((req, res) => {
  console.log(`404: No route found for ${req.method} ${req.url}`)
  res.status(404).json({ error: 'Not Found' })
})

// Start server with error handling for port in use
const server = app.listen(PORT, () => {
  console.log(`🚀 Backend listening on http://localhost:${PORT}`)
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please free the port or try a different one.`)
    process.exit(1)
  } else {
    console.error('Server error:', err)
    process.exit(1)
  }
})
