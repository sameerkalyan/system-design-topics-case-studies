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
  deadLetterJobs: [],
  cache: new Map(),
  balancerIndex: 0,
  nodeSequence: 4,
  trafficBurstEnabled: false,
  retryStormMode: false,
  cacheEnabled: true,
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
  const burstDelay = state.trafficBurstEnabled ? 180 : 0;
  const simulatedDelay = node.baseDelay + jitter + burstDelay;

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
  if (!state.cacheEnabled) {
    return null;
  }

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
  if (!state.cacheEnabled) {
    return;
  }

  const key = getCacheKey(resourceId);
  state.cache.set(key, {
    value,
    expiresAt: now() + ttlMs
  });
}

function summarizeState() {
  return {
    strategy: state.strategy,
    rateLimitPerMinute: state.rateLimitPerMinute,
    queueDepth: state.queue.length,
    processedJobs: state.processedJobs.slice(0, 8),
    deadLetterJobs: state.deadLetterJobs.slice(0, 8),
    cacheKeys: Array.from(state.cache.keys()),
    cacheEnabled: state.cacheEnabled,
    nodes: state.nodes,
    requestsThisMinute: state.requestLog.length,
    trafficBurstEnabled: state.trafficBurstEnabled,
    retryStormMode: state.retryStormMode
  };
}

app.get('/api/health', (req, res) => {
  res.json({
    strategy: state.strategy,
    rateLimitPerMinute: state.rateLimitPerMinute,
    queueDepth: state.queue.length,
    processedJobs: state.processedJobs.length,
    deadLetterJobs: state.deadLetterJobs.length,
    cacheEntries: state.cache.size,
    cacheEnabled: state.cacheEnabled,
    nodes: state.nodes
  });
});

app.get('/api/dashboard', (req, res) => {
  res.json(summarizeState());
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

app.post('/api/nodes', (req, res) => {
  const { baseDelay = 140, weight = 1 } = req.body;
  const node = {
    id: `api-${String.fromCharCode(96 + state.nodeSequence)}`,
    weight: Number(weight) || 1,
    baseDelay: Number(baseDelay) || 140,
    healthy: true,
    activeConnections: 0,
    handled: 0,
    failed: 0
  };

  state.nodeSequence += 1;
  state.nodes.push(node);
  return res.status(201).json({ ok: true, node, totalNodes: state.nodes.length });
});

app.post('/api/rate-limit', (req, res) => {
  const { rateLimitPerMinute } = req.body;
  if (!Number.isFinite(rateLimitPerMinute) || rateLimitPerMinute < 1) {
    return res.status(400).json({ error: 'Invalid rate limit' });
  }

  state.rateLimitPerMinute = rateLimitPerMinute;
  return res.json({ ok: true, rateLimitPerMinute });
});

app.post('/api/cache/toggle', (req, res) => {
  state.cacheEnabled = !state.cacheEnabled;
  if (!state.cacheEnabled) {
    state.cache.clear();
  }

  return res.json({ ok: true, cacheEnabled: state.cacheEnabled });
});

app.post('/api/traffic-burst/toggle', (req, res) => {
  state.trafficBurstEnabled = !state.trafficBurstEnabled;
  return res.json({ ok: true, trafficBurstEnabled: state.trafficBurstEnabled });
});

app.post('/api/retry-storm/toggle', (req, res) => {
  state.retryStormMode = !state.retryStormMode;
  return res.json({ ok: true, retryStormMode: state.retryStormMode });
});

app.post('/api/simulate-burst', async (req, res) => {
  const { count = 10, resourceId = 'burst-resource' } = req.body;
  const total = Math.min(Number(count) || 10, 30);
  const results = [];

  for (let i = 0; i < total; i += 1) {
    if (!checkRateLimit()) {
      results.push({ status: 429, error: 'Rate limit exceeded' });
      continue;
    }

    const cached = getCache(resourceId);
    if (cached) {
      results.push({ status: 200, cache: 'hit', servedBy: 'cache' });
      continue;
    }

    const node = chooseNode();
    if (!node) {
      results.push({ status: 503, error: 'No healthy backend nodes available' });
      continue;
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
      results.push({ status: 200, cache: 'miss', servedBy: result.nodeId, delay: result.delay });
    } catch (error) {
      results.push({ status: 502, error: error.message });
    }
  }

  return res.json({
    concept: 'traffic-burst',
    total,
    results
  });
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
      servedBy: 'cache',
      strategy: state.strategy,
      delay: 0,
      data: cached.value.data
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

app.post('/api/jobs/process', (req, res) => {
  const nextJob = state.queue.shift();
  if (!nextJob) {
    return res.json({ concept: 'messaging-queue', message: 'No jobs in queue' });
  }

  const retryLimit = state.retryStormMode ? 6 : 3;
  const failureChance = state.retryStormMode ? 0.8 : 0.45;

  while (nextJob.attempts < retryLimit) {
    nextJob.attempts += 1;
    const shouldFail = Math.random() < failureChance;

    if (!shouldFail) {
      nextJob.status = 'processed';
      nextJob.processedAt = now();
      state.processedJobs.unshift(nextJob);
      return res.json({
        concept: nextJob.attempts > 1 ? 'retries' : 'messaging-queue',
        message: 'Job processed successfully',
        job: nextJob
      });
    }
  }

  nextJob.status = 'dead-lettered';
  nextJob.failedAt = now();
  state.deadLetterJobs.unshift(nextJob);
  state.processedJobs.unshift(nextJob);
  return res.status(500).json({
    concept: 'retry-storm',
    message: 'Job failed after retries and moved to dead letter queue',
    job: nextJob
  });
});

app.listen(PORT, () => {
  console.log(`System design playground backend running on port ${PORT}`);
});
