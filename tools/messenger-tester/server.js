const express = require("express");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- State ---
let config = {
  webhookUrl: "",
  verifyToken: "test_verify_token_abc123",
  senderId: "TEST_USER_123",
};
let capturedResponses = [];
let sseClients = [];

// --- Helpers ---
function broadcast(event, data) {
  sseClients.forEach((res) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  });
}

function buildWebhookPayload(messagingEvent) {
  return {
    object: "page",
    entry: [
      {
        id: "TEST_PAGE_ID",
        time: Date.now(),
        messaging: [messagingEvent],
      },
    ],
  };
}

function buildMessagingBase() {
  return {
    sender: { id: config.senderId },
    recipient: { id: "TEST_PAGE_ID" },
    timestamp: Date.now(),
  };
}

// --- SSE endpoint ---
app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  sseClients.push(res);
  req.on("close", () => {
    sseClients = sseClients.filter((c) => c !== res);
  });
});

// --- Config ---
app.get("/api/config", (req, res) => res.json(config));

app.post("/api/config", (req, res) => {
  config = { ...config, ...req.body };
  res.json(config);
});

// --- Webhook Verification Test ---
app.post("/api/verify", async (req, res) => {
  if (!config.webhookUrl) {
    return res.json({ success: false, error: "Webhook URL not set" });
  }

  const challenge = "CHALLENGE_" + Date.now();
  const url = `${config.webhookUrl}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(config.verifyToken)}&hub.challenge=${encodeURIComponent(challenge)}`;

  try {
    const response = await fetch(url);
    const body = await response.text();
    const passed = response.status === 200 && body === challenge;

    broadcast("system", {
      type: "verify",
      passed,
      status: response.status,
      expected: challenge,
      received: body,
    });

    res.json({
      success: true,
      passed,
      status: response.status,
      expected: challenge,
      received: body,
    });
  } catch (err) {
    broadcast("system", {
      type: "verify",
      passed: false,
      error: err.message,
    });
    res.json({ success: false, error: err.message });
  }
});

// --- Send Text Message ---
app.post("/api/send-message", async (req, res) => {
  if (!config.webhookUrl) {
    return res.json({ success: false, error: "Webhook URL not set" });
  }

  const { text } = req.body;
  const messaging = {
    ...buildMessagingBase(),
    message: {
      mid: `mid.${Date.now()}`,
      text,
    },
  };

  const payload = buildWebhookPayload(messaging);

  try {
    const response = await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.text();
    res.json({ success: true, status: response.status, response: body });
  } catch (err) {
    broadcast("system", { type: "error", error: err.message });
    res.json({ success: false, error: err.message });
  }
});

// --- Send Postback ---
app.post("/api/send-postback", async (req, res) => {
  if (!config.webhookUrl) {
    return res.json({ success: false, error: "Webhook URL not set" });
  }

  const { payload: postbackPayload, title } = req.body;
  const messaging = {
    ...buildMessagingBase(),
    postback: {
      title: title || postbackPayload,
      payload: postbackPayload,
    },
  };

  const webhookPayload = buildWebhookPayload(messaging);

  try {
    const response = await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(webhookPayload),
    });
    const body = await response.text();
    res.json({ success: true, status: response.status, response: body });
  } catch (err) {
    broadcast("system", { type: "error", error: err.message });
    res.json({ success: false, error: err.message });
  }
});

// --- Send Quick Reply ---
app.post("/api/send-quick-reply", async (req, res) => {
  if (!config.webhookUrl) {
    return res.json({ success: false, error: "Webhook URL not set" });
  }

  const { text, payload: qrPayload } = req.body;
  const messaging = {
    ...buildMessagingBase(),
    message: {
      mid: `mid.${Date.now()}`,
      text: text || qrPayload,
      quick_reply: {
        payload: qrPayload,
      },
    },
  };

  const webhookPayload = buildWebhookPayload(messaging);

  try {
    const response = await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(webhookPayload),
    });
    const body = await response.text();
    res.json({ success: true, status: response.status, response: body });
  } catch (err) {
    broadcast("system", { type: "error", error: err.message });
    res.json({ success: false, error: err.message });
  }
});

// ============================================
// MOCK FACEBOOK GRAPH API
// Captures outgoing Send API calls from the
// main server so they appear in the tester UI
// ============================================

app.post("/v:version/me/messages", (req, res) => {
  const captured = {
    timestamp: Date.now(),
    recipient: req.body.recipient,
    message: req.body.message,
    messaging_type: req.body.messaging_type,
  };

  capturedResponses.push(captured);
  broadcast("bot_response", captured);

  console.log(
    "[Mock Graph API] Captured:",
    JSON.stringify(req.body.message, null, 2)
  );

  res.json({
    recipient_id: req.body.recipient?.id,
    message_id: `mid.mock_${Date.now()}`,
  });
});

// Fallback without version prefix
app.post("/me/messages", (req, res) => {
  const captured = {
    timestamp: Date.now(),
    recipient: req.body.recipient,
    message: req.body.message,
    messaging_type: req.body.messaging_type,
  };

  capturedResponses.push(captured);
  broadcast("bot_response", captured);

  res.json({
    recipient_id: req.body.recipient?.id,
    message_id: `mid.mock_${Date.now()}`,
  });
});

// Get / clear captured responses
app.get("/api/responses", (req, res) => res.json(capturedResponses));
app.delete("/api/responses", (req, res) => {
  capturedResponses = [];
  res.json({ success: true });
});

// --- Start ---
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   NoteBot Messenger Tester              ║
  ║   http://localhost:${PORT}                  ║
  ╠══════════════════════════════════════════╣
  ║                                          ║
  ║   1. Open the URL above in browser       ║
  ║   2. Paste your ngrok webhook URL        ║
  ║   3. Start sending messages!             ║
  ║                                          ║
  ║   Mock Graph API running on same port.   ║
  ║   Set in your .env:                      ║
  ║   GRAPH_API_URL=http://localhost:${PORT}     ║
  ║                                          ║
  ╚══════════════════════════════════════════╝
  `);
});
