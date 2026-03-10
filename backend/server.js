const express = require('express');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3001;
const LOG_FILE = path.join(__dirname, 'logs', 'events.jsonl');
const ACTION_LOG_FILE = path.join(__dirname, 'logs', 'actions.jsonl');
const COMMENT_LOG_FILE = path.join(__dirname, 'logs', 'comments.jsonl');
const DIST_CANDIDATES = [
  process.env.FRONTEND_DIST_DIR,
  path.resolve(__dirname, '../frontend/dist'),
  path.resolve(process.cwd(), 'frontend/dist'),
  path.resolve(__dirname, 'frontend/dist'),
  path.resolve(process.cwd(), 'dist'),
  path.resolve(__dirname, 'dist'),
].filter(Boolean);

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

function resolveDistDir() {
  for (const candidate of DIST_CANDIDATES) {
    try {
      if (fs.existsSync(path.join(candidate, 'index.html'))) {
        return candidate;
      }
    } catch {
      // ignore invalid candidate path
    }
  }
  return null;
}

function parseObjectBody(body) {
  if (!body) return null;
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  return typeof body === 'object' ? body : null;
}

function normalizeEvents(body) {
  const parsed = parseObjectBody(body);
  return Array.isArray(parsed?.events) ? parsed.events : null;
}

function getClientMeta(req) {
  return {
    ip: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''),
    userAgent: String(req.headers['user-agent'] || ''),
  };
}

function toIsoTimestamp(value) {
  if (!value && value !== 0) return new Date().toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function toEpochMs(value) {
  if (!value && value !== 0) return Date.now();
  const epochMs = new Date(value).getTime();
  return Number.isNaN(epochMs) ? Date.now() : epochMs;
}

function cleanOptionalText(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

async function ensureLogFiles() {
  await fs.promises.mkdir(path.join(__dirname, 'logs'), { recursive: true });
  for (const file of [LOG_FILE, ACTION_LOG_FILE, COMMENT_LOG_FILE]) {
    if (!fs.existsSync(file)) {
      await fs.promises.writeFile(file, '', 'utf8');
    }
  }
}

function appendJsonl(file, payload) {
  const line = `${JSON.stringify(payload)}\n`;
  return fs.promises
    .mkdir(path.dirname(file), { recursive: true })
    .then(() => fs.promises.appendFile(file, line, 'utf8'));
}

async function appendJsonlBatch(file, rows) {
  if (!rows.length) return;
  const lines = rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.appendFile(file, lines, 'utf8');
}

async function saveEvents(events, req) {
  const clientMeta = getClientMeta(req);
  const enrichedEvents = events.map((event) => ({
    ...event,
    serverReceivedAt: Date.now(),
    serverMeta: clientMeta,
  }));

  if (!supabase) {
    await appendJsonlBatch(LOG_FILE, enrichedEvents);
    return enrichedEvents.length;
  }

  const rows = enrichedEvents.map((event) => ({
    participant_id: cleanOptionalText(event.participantId),
    session_id: cleanOptionalText(event.sessionId),
    page_session_id: cleanOptionalText(event.pageSessionId),
    page: String(event.page || 'unknown'),
    condition: cleanOptionalText(event.condition),
    seq: Number.isFinite(Number(event.seq)) ? Number(event.seq) : null,
    event_name: String(event.event || 'unknown'),
    action: cleanOptionalText(event.action),
    target_id: cleanOptionalText(event.targetId),
    depth: cleanOptionalText(event.depth),
    dwell_ms: Number.isFinite(Number(event.dwellMs)) ? Number(event.dwellMs) : null,
    event_timestamp: toIsoTimestamp(event.timestamp),
    received_at: toIsoTimestamp(event.serverReceivedAt),
    payload: event,
  }));

  const { error } = await supabase.from('event_logs').insert(rows);
  if (error) throw error;
  return rows.length;
}

async function saveAction(body, req) {
  const payload = {
    ...body,
    serverReceivedAt: Date.now(),
    serverMeta: getClientMeta(req),
  };

  if (!supabase) {
    await appendJsonl(ACTION_LOG_FILE, payload);
    return;
  }

  const row = {
    participant_id: cleanOptionalText(payload.participantId || payload.participant_id),
    action_name: String(payload.action || payload.event || payload.type || 'action'),
    target_id: cleanOptionalText(payload.targetId || payload.target_id),
    received_at: toIsoTimestamp(payload.serverReceivedAt),
    payload,
  };

  const { error } = await supabase.from('action_logs').insert(row);
  if (error) throw error;
}

async function saveInteraction(body, req) {
  const detail =
    body.detail && typeof body.detail === 'object'
      ? {
          ...body.detail,
          serverMeta: getClientMeta(req),
          serverReceivedAt: new Date().toISOString(),
        }
      : {
          serverMeta: getClientMeta(req),
          serverReceivedAt: new Date().toISOString(),
        };

  if (!supabase) {
    await appendJsonl(ACTION_LOG_FILE, {
      kind: 'interaction',
      postId: body.postId,
      eventType: body.eventType,
      detail,
      timestamp: body.timestamp ?? new Date().toISOString(),
    });
    return;
  }

  const { error } = await supabase.from('interaction_logs').insert({
    post_id: String(body.postId),
    event_type: String(body.eventType),
    detail,
    timestamp: toIsoTimestamp(body.timestamp),
  });
  if (error) throw error;
}

async function saveComment(comment) {
  if (!supabase) {
    await appendJsonl(COMMENT_LOG_FILE, comment);
    return comment;
  }

  const row = {
    id: comment.id,
    target_id: comment.targetId,
    content: comment.content,
    nickname: comment.nickname,
    participant_id: cleanOptionalText(comment.participantId),
    created_at: toIsoTimestamp(comment.createdAt),
    likes: Number.isFinite(Number(comment.likes)) ? Number(comment.likes) : 0,
    payload: comment,
  };

  const { error } = await supabase.from('comment_logs').insert(row);
  if (error) throw error;
  return comment;
}

async function loadComments(targetId) {
  if (!supabase) {
    if (!fs.existsSync(COMMENT_LOG_FILE)) {
      return [];
    }

    const raw = await fs.promises.readFile(COMMENT_LOG_FILE, 'utf8');
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((value) => value && value.targetId === targetId)
      .slice(-100);
  }

  const { data, error } = await supabase
    .from('comment_logs')
    .select('id,target_id,content,nickname,participant_id,created_at,likes')
    .eq('target_id', targetId)
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) throw error;

  return (data || []).map((row) => ({
    id: row.id,
    targetId: row.target_id,
    content: row.content,
    nickname: row.nickname,
    participantId: row.participant_id || '',
    createdAt: toEpochMs(row.created_at),
    likes: row.likes || 0,
  }));
}

const DIST_DIR = resolveDistDir();

app.use(express.json({ limit: '1mb' }));
app.use(express.text({ type: ['text/plain', 'application/json'], limit: '1mb' }));

app.post('/api/events', async (req, res) => {
  const events = normalizeEvents(req.body);
  if (!events) {
    return res.status(400).json({ ok: false, message: 'events must be an array' });
  }

  try {
    const count = await saveEvents(events, req);
    return res.json({ ok: true, count, storage: supabase ? 'supabase' : 'jsonl' });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/actions', async (req, res) => {
  const body = parseObjectBody(req.body);
  if (!body) {
    return res.status(400).json({ ok: false, message: 'invalid payload' });
  }

  try {
    await saveAction(body, req);
    return res.json({ ok: true, storage: supabase ? 'supabase' : 'jsonl' });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/interactions', async (req, res) => {
  const body = parseObjectBody(req.body);
  if (!body || !body.postId || !body.eventType) {
    return res.status(400).json({ ok: false, message: 'postId/eventType required' });
  }

  if (!['view', 'click', 'stay'].includes(String(body.eventType))) {
    return res.status(400).json({ ok: false, message: 'eventType must be view/click/stay' });
  }

  try {
    await saveInteraction(body, req);
    return res.json({ ok: true, storage: supabase ? 'supabase' : 'jsonl' });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/comments', async (req, res) => {
  const body = parseObjectBody(req.body);
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
    await saveComment(comment);
    return res.json({ ok: true, comment, storage: supabase ? 'supabase' : 'jsonl' });
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
    const comments = await loadComments(targetId);
    return res.json({ ok: true, comments, storage: supabase ? 'supabase' : 'jsonl' });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/health', (_, res) => {
  res.json({
    ok: true,
    ts: Date.now(),
    storage: supabase ? 'supabase' : 'jsonl',
  });
});

if (DIST_DIR && fs.existsSync(DIST_DIR)) {
  console.log(`[static] serving frontend from: ${DIST_DIR}`);
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      next();
      return;
    }
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
} else {
  console.warn('[static] frontend dist not found. Checked paths:', DIST_CANDIDATES);
}

ensureLogFiles()
  .catch((err) => {
    console.error('Failed to initialize log files:', err);
  })
  .finally(() => {
    if (supabase) {
      console.log('[storage] Supabase persistence enabled');
    } else {
      console.warn('[storage] Supabase env missing, falling back to local jsonl logs');
    }

    app.listen(PORT, () => {
      console.log(`WeibSim running at http://localhost:${PORT}`);
    });
  });
