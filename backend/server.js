const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const LOG_FILE = path.join(__dirname, 'logs', 'events.jsonl');
const ACTION_LOG_FILE = path.join(__dirname, 'logs', 'actions.jsonl');
const COMMENT_LOG_FILE = path.join(__dirname, 'logs', 'comments.jsonl');
const DIST_DIR = path.resolve(__dirname, '../frontend/dist');

app.use(express.json({ limit: '1mb' }));
app.use(express.text({ type: ['text/plain', 'application/json'], limit: '1mb' }));

async function ensureLogFiles() {
  await fs.promises.mkdir(path.join(__dirname, 'logs'), { recursive: true });
  for (const file of [LOG_FILE, ACTION_LOG_FILE, COMMENT_LOG_FILE]) {
    if (!fs.existsSync(file)) {
      await fs.promises.writeFile(file, '', 'utf8');
    }
  }
}

function normalizeEvents(body) {
  if (!body) return null;
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body);
      return Array.isArray(parsed?.events) ? parsed.events : null;
    } catch {
      return null;
    }
  }
  if (typeof body === 'object' && Array.isArray(body.events)) {
    return body.events;
  }
  return null;
}

app.post('/api/events', async (req, res) => {
  const events = normalizeEvents(req.body);
  if (!events) {
    return res.status(400).json({ ok: false, message: 'events must be an array' });
  }

  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const userAgent = req.headers['user-agent'] || '';
  const lines = events
    .map((event) =>
      JSON.stringify({
        ...event,
        serverReceivedAt: Date.now(),
        serverMeta: {
          ip: String(clientIp),
          userAgent: String(userAgent),
        },
      })
    )
    .join('\n') + '\n';

  try {
    await fs.promises.mkdir(path.dirname(LOG_FILE), { recursive: true });
    await fs.promises.appendFile(LOG_FILE, lines, 'utf8');
    return res.json({ ok: true, count: events.length });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

function appendJsonl(file, payload) {
  const line = `${JSON.stringify(payload)}\n`;
  return fs.promises
    .mkdir(path.dirname(file), { recursive: true })
    .then(() => fs.promises.appendFile(file, line, 'utf8'));
}

app.post('/api/actions', async (req, res) => {
  const body = typeof req.body === 'string' ? (() => {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  })() : req.body;

  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, message: 'invalid payload' });
  }

  try {
    await appendJsonl(ACTION_LOG_FILE, {
      ...body,
      serverReceivedAt: Date.now(),
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      userAgent: req.headers['user-agent'] || '',
    });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/comments', async (req, res) => {
  const body = typeof req.body === 'string' ? (() => {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  })() : req.body;

  if (!body || typeof body !== 'object' || !body.targetId || !body.content || !body.nickname) {
    return res.status(400).json({ ok: false, message: 'targetId/content/nickname required' });
  }

  const comment = {
    id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    targetId: String(body.targetId),
    content: String(body.content).slice(0, 500),
    nickname: String(body.nickname).slice(0, 30),
    participantId: String(body.participantId || ''),
    createdAt: Date.now(),
    likes: 0,
  };

  try {
    await appendJsonl(COMMENT_LOG_FILE, comment);
    return res.json({ ok: true, comment });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/comments', async (req, res) => {
  const targetId = String(req.query.targetId || '');
  if (!targetId) {
    return res.status(400).json({ ok: false, message: 'targetId required' });
  }

  try {
    if (!fs.existsSync(COMMENT_LOG_FILE)) {
      return res.json({ ok: true, comments: [] });
    }

    const raw = await fs.promises.readFile(COMMENT_LOG_FILE, 'utf8');
    const comments = raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((v) => v && v.targetId === targetId)
      .slice(-100);

    return res.json({ ok: true, comments });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/health', (_, res) => {
  res.json({ ok: true, ts: Date.now() });
});

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      next();
      return;
    }
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

ensureLogFiles()
  .catch((err) => {
    console.error('Failed to initialize log files:', err);
  })
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`WeibSim running at http://localhost:${PORT}`);
    });
  });
