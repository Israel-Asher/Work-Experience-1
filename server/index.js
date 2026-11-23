const path = require('path');
const express = require('express');
const { sendToSupport } = require('./support');

const app = express();
const PORT = process.env.PORT || 3000;

// A person needs more than a few seconds to fill in name, email and a message.
// Bots usually submit the moment the page loads.
const MIN_FILL_TIME_MS = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

// Returns why a submission looks like spam, or null if it looks genuine.
function spamReason(body) {
  // The "website" field is hidden from people, so only bots fill it in.
  if ((body.website || '').trim()) {
    return 'honeypot filled in';
  }

  // contact.js sends how long the form was open before it was submitted.
  const elapsedMs = Number(body.elapsedMs);
  if (!Number.isFinite(elapsedMs) || elapsedMs < MIN_FILL_TIME_MS) {
    return 'submitted too quickly';
  }

  return null;
}

app.post('/contact', (req, res) => {
  const reason = spamReason(req.body);
  if (reason) {
    // Reply as if it worked, so bots can't tell they were caught, but don't save it.
    console.log(`[spam] Blocked contact form submission: ${reason}`);
    return res.json({ ok: true });
  }

  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim();
  const message = (req.body.message || '').trim();

  if (!name || !email || !message) {
    return res.status(400).json({ ok: false, error: 'Please fill in your name, email and message.' });
  }

  sendToSupport({ name, email, message });
  res.json({ ok: true });
});

// Only start the server when run directly (npm start), not when the tests load it.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Calico Media site running at http://localhost:${PORT}`);
  });
}

module.exports = app;
