const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

const state = {
  strategy: 'round-robin',
  rateLimitPerMinute: 12,
  requestLog: [],
  queue: [],
  processedJobs: [],
  cache: new Map(),
  balancerIndex: 0,
  nodes: [
    { id: 'api-a', weight: 1, baseDelay: 120, healthy: true, activeConnections: 0, handled: 0, failed: 0 },
    { id: 'api-b', weight: 2, baseDelay: 260, healthy: true, activeConnections: 0, handled: 0, failed: 0 },
    { id: 'api-c', weight: 1, baseDelay: 80, healthy: true, activeConnections: 0, handled: 0, failed: 0 }
  ]
};

function now() {
  return Date.now();
}

function pruneRateLog() {
  const cutoff = now() - 60_000;
  state.requestLog = state.requestLog.filter(ts => ts >= cutoff);
}

function checkRateLimit() {
  pruneRateLog();
  if (state.requestLog.length >= state.rateLimitPerMinute) {
    return false;
  }
  state.requestLog.push(now());
  return true;
}

function getHealthyNodes() {
  return state.nodes.filter(node => node.healthy);
}

function pickRoundRobin(nodes) {
  const node = nodes[state.balancerIndex % nodes.length];
  state.balancerIndex = (state.balancerIndex + 1) % nodes.length;
  return node;
}

function pickLeastConnections(nodes) {
  return [...nodes].sort((a, b) => a.activeConnections - b.activeConnections || a.baseDelay - b.baseDelay)[0];
}

function pickWeightedRoundRobin(nodes) {
  const expanded = [];
  for (const node of nodes) {
    for (let i = 0; i < node.weight; i += 1) {
      expanded.push(node);
    }
  }
  const node = expanded[state.balancerIndex % expanded.length];
  state.balancerIndex = (state.balancerIndex + 1) % expanded.length;
  return node;
}

function chooseNode() {
  const healthyNodes = getHealthyNodes();
  if (!healthyNodes.length) {
    return null;
  }

  if (state.strategy === 'least-connections') {
    return pickLeastConnections(healthyNodes);
  }

  if (state.strategy === 'weighted-round-robin') {
    return pickWeightedRoundRobin(healthyNodes);
  }

  return pickRoundRobin(healthyNodes);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processByNode(node, payload) {
  node.activeConnections += 1;
  const jitter = Math.floor(Math.random() * 120);
  const simulatedDelay = node.baseDelay + jitter;

  try {
    await wait(simulatedDelay);

    if (!node.healthy) {
      throw new Error('Node became unhealthy while processing');
    }

    node.handled += 1;

    return {
      nodeId: node.id,
      delay: simulatedDelay,
      payload
    };
  } catch (error) {
    node.failed += 1;
    throw error;
  } finally {
    node.activeConnections = Math.max(0, node.activeConnections - 1);
  }
}

function getCacheKey(resourceId) {
  return `resource:${resourceId}`;
}

function getCache(resourceId) {
  const key = getCacheKey(resourceId);
  const entry = state.cache.get(key);

  if (!entry) return null;
  if (entry.expiresAt < now()) {
    state.cache.delete(key);
    return null;
  }

  return entry;
}

function setCache(resourceId, value, ttlMs = 15000) {
  const key = getCacheKey(resourceId);
  state.cache.set(key, {
    value,
    expiresAt: now() + ttlMs
  });
}

app.get('/api/health', (req, res) => {
  res.json({
    strategy: state.strategy,
    rateLimitPerMinute: state.rateLimitPerMinute,
    queueDepth: state.queue.length,
    processedJobs: state.processedJobs.length,
    cacheEntries: state.cache.size,
    nodes: state.nodes
  });
});

app.post('/api/strategy', (req, res) => {
  const { strategy } = req.body;
  const allowed = ['round-robin', 'least-connections', 'weighted-round-robin'];

  if (!allowed.includes(strategy)) {
    return res.status(400).json({ error: 'Invalid strategy' });
  }

  state.strategy = strategy;
  return res.json({ ok: true, strategy });
});

app.post('/api/nodes/:id/toggle', (req, res) => {
  const node = state.nodes.find(item => item.id === req.params.id);
  if (!node) {
    return res.status(404).json({ error: 'Node not found' });
  }

  node.healthy = !node.healthy;
  return res.json({ ok: true, node });
});

app.post('/api/rate-limit', (req, res) => {
  const { rateLimitPerMinute } = req.body;
  if (!Number.isFinite(rateLimitPerMinute) || rateLimitPerMinute < 1) {
    return res.status(400).json({ error: 'Invalid rate limit' });
  }

  state.rateLimitPerMinute = rateLimitPerMinute;
  return res.json({ ok: true, rateLimitPerMinute });
});

app.get('/api/resource/:id', async (req, res) => {
  if (!checkRateLimit()) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      concept: 'rate-limiting'
    });
  }

  const resourceId = req.params.id;
  const cached = getCache(resourceId);
  if (cached) {
    return res.json({
      concept: 'caching',
      cache: 'hit',
      data: cached.value
    });
  }

  const node = chooseNode();
  if (!node) {
    return res.status(503).json({
      error: 'No healthy backend nodes available',
      concept: 'failover'
    });
  }

  try {
    const result = await processByNode(node, {
      resourceId,
      content: `Resource payload for ${resourceId}`
    });

    const response = {
      concept: 'load-balancing',
      cache: 'miss',
      strategy: state.strategy,
      servedBy: result.nodeId,
      delay: result.delay,
      data: result.payload
    };

    setCache(resourceId, response);
    return res.json(response);
  } catch (error) {
    return res.status(502).json({
      error: error.message,
      concept: 'failover'
    });
  }
});

app.post('/api/jobs', (req, res) => {
  const job = {
    id: `job-${Math.random().toString(36).slice(2, 8)}`,
    payload: req.body.payload || 'default-job',
    createdAt: now(),
    attempts: 0,
    status: 'queued'
  };

  state.queue.push(job);
  return res.status(202).json({
    concept: 'messaging-queue',
    job,
    queueDepth: state.queue.length
  });
});

app.post('/api/jobs/process', async (req, res) => {
  const nextJob = state.queue.shift();
  if (!nextJob) {
    return res.json({ concept: 'messaging-queue', message: 'No jobs in queue' });
  }

  const retryLimit = 3;

  while (nextJob.attempts < retryLimit) {
    nextJob.attempts += 1;
    const shouldFail = Math.random() < 0.45;

    if (!shouldFail) {
      nextJob.status = 'processed';
      nextJob.processedAt = now();
      state.processedJobs.unshift(nextJob);
      return res.json({
        concept: 'retries',
        message: 'Job processed successfully',
        job: nextJob
      });
    }
  }

  nextJob.status = 'failed-after-retries';
  state.processedJobs.unshift(nextJob);
  return res.status(500).json({
    concept: 'retry-storm',
    message: 'Job failed after retries',
    job: nextJob
  });
});

app.get('/api/dashboard', (req, res) => {
  res.json({
    strategy: state.strategy,
    rateLimitPerMinute: state.rateLimitPerMinute,
    queueDepth: state.queue.length,
    processedJobs: state.processedJobs.slice(0, 8),
    cacheKeys: Array.from(state.cache.keys()),
    nodes: state.nodes,
    requestsThisMinute: state.requestLog.length
  });
});

app.listen(PORT, () => {
  console.log(`System design playground backend running on port ${PORT}`);
});
