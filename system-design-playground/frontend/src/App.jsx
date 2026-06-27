import { useEffect, useMemo, useState } from 'react';

const API_BASE = 'http://localhost:5001';

const strategyOptions = [
  { value: 'round-robin', label: 'Round robin' },
  { value: 'least-connections', label: 'Least connections' },
  { value: 'weighted-round-robin', label: 'Weighted round robin' }
];

const eventTone = {
  request: 'good',
  cache: 'accent',
  'rate-limit': 'warn',
  failover: 'warn',
  queue: 'good',
  retry: 'warn',
  dlq: 'danger',
  node: 'accent',
  burst: 'accent',
  config: 'accent',
  reset: 'good'
};

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || data.message || 'Request failed');
  }
  return data;
}

export default function App() {
  const [snapshot, setSnapshot] = useState(null);
  const [resourceKey, setResourceKey] = useState('catalog:item:42');
  const [burstCount, setBurstCount] = useState(18);
  const [jobType, setJobType] = useState('email-send');
  const [jobTarget, setJobTarget] = useState('user-42');
  const [newNodeName, setNewNodeName] = useState('api-node-d');
  const [newNodeWeight, setNewNodeWeight] = useState(2);
  const [newNodeLatency, setNewNodeLatency] = useState(160);
  const [requestLog, setRequestLog] = useState([]);
  const [queueLog, setQueueLog] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const config = snapshot?.config;
  const nodes = snapshot?.nodes || [];
  const events = snapshot?.recentEvents || [];
  const queue = snapshot?.queue || [];
  const deadLetterQueue = snapshot?.deadLetterQueue || [];
  const metrics = snapshot?.metrics;

  const headlineMetrics = useMemo(() => {
    if (!snapshot || !config || !metrics) return [];
    return [
      { label: 'Strategy', value: config.strategy },
      { label: 'Healthy nodes', value: `${metrics.healthyNodes}/${metrics.totalNodes}` },
      { label: 'Cache keys', value: snapshot.cache.size },
      { label: 'Queued jobs', value: queue.length }
    ];
  }, [snapshot, config, metrics, queue.length]);

  async function refresh() {
    const data = await api('/api/state');
    setSnapshot(data);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
    const interval = setInterval(() => {
      refresh().catch(() => {});
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  async function run(action) {
    setError('');
    setLoading(true);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function updateConfig(patch) {
    return run(async () => {
      const data = await api('/api/config', {
        method: 'POST',
        body: JSON.stringify({ ...config, ...patch })
      });
      setSnapshot(data);
    });
  }

  function fetchResource() {
    return run(async () => {
      const data = await api(`/api/resource/${encodeURIComponent(resourceKey)}`);
      setRequestLog((prev) => [data, ...prev].slice(0, 8));
    });
  }

  function simulateBurst() {
    return run(async () => {
      const data = await api('/api/burst', {
        method: 'POST',
        body: JSON.stringify({ count: Number(burstCount) })
      });
      const accepted = data.results.filter((item) => item.ok).length;
      const throttled = data.results.filter((item) => item.status === 429).length;
      setRequestLog((prev) => [
        {
          source: 'burst',
          key: `burst x${burstCount}`,
          value: `${accepted} accepted, ${throttled} throttled`
        },
        ...prev
      ].slice(0, 8));
    });
  }

  function enqueueJob() {
    return run(async () => {
      const data = await api('/api/queue/enqueue', {
        method: 'POST',
        body: JSON.stringify({
          type: jobType,
          payload: { target: jobTarget }
        })
      });
      setQueueLog((prev) => [data.job, ...prev].slice(0, 8));
    });
  }

  function processQueue() {
    return run(async () => {
      const data = await api('/api/queue/process', {
        method: 'POST',
        body: JSON.stringify({ count: 4 })
      });
      if (data.processed?.length) {
        setQueueLog((prev) => [...data.processed, ...prev].slice(0, 8));
      }
    });
  }

  function addNode() {
    return run(async () => {
      await api('/api/nodes', {
        method: 'POST',
        body: JSON.stringify({
          name: newNodeName,
          weight: Number(newNodeWeight),
          baseLatencyMs: Number(newNodeLatency)
        })
      });
    });
  }

  function toggleNode(id) {
    return run(async () => {
      await api(`/api/nodes/${id}/toggle-health`, { method: 'POST' });
    });
  }

  function resetSimulation() {
    return run(async () => {
      const data = await api('/api/reset', { method: 'POST' });
      setSnapshot(data);
      setRequestLog([]);
      setQueueLog([]);
    });
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">System design playground</p>
          <h1>Steer the control room. Watch the system bend.</h1>
          <p className="intro">
            This playground turns abstract scaling topics into visible behavior: cache hits,
            failover, throttling, queue retries, dead-letter traffic, and shifting load across nodes.
          </p>
          <div className="hero-actions">
            <button className="primary" onClick={fetchResource} disabled={loading}>Fetch sample resource</button>
            <button onClick={resetSimulation} disabled={loading}>Reset simulation</button>
          </div>
        </div>

        <div className="hero-radar" aria-hidden="true">
          <div className="radar-ring radar-ring-1" />
          <div className="radar-ring radar-ring-2" />
          <div className="radar-ring radar-ring-3" />
          {nodes.slice(0, 6).map((node, index) => (
            <div
              key={node.id}
              className={`radar-node ${node.healthy ? '' : 'offline'}`}
              style={{ '--x': `${18 + (index % 3) * 28}%`, '--y': `${20 + Math.floor(index / 3) * 34}%` }}
            >
              <span>{node.name.replace('api-node-', '')}</span>
            </div>
          ))}
        </div>
      </header>

      <section className="metric-strip">
        {headlineMetrics.map((item) => (
          <article key={item.label} className="metric-card">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      <main className="layout-grid">
        <section className="panel panel-tall">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Traffic distribution</p>
              <h2>Load balancer</h2>
            </div>
            <span>Fail one node and compare strategies</span>
          </div>

          <label className="field">
            <span>Routing strategy</span>
            <select value={config?.strategy || 'round-robin'} onChange={(e) => updateConfig({ strategy: e.target.value })}>
              {strategyOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <div className="node-list">
            {nodes.map((node) => (
              <article key={node.id} className="node-card">
                <div className="node-topline">
                  <div>
                    <h3>{node.name}</h3>
                    <p>{node.healthy ? 'Healthy' : 'Offline for failover test'}</p>
                  </div>
                  <button onClick={() => toggleNode(node.id)} disabled={loading}>
                    {node.healthy ? 'Take offline' : 'Restore'}
                  </button>
                </div>
                <dl className="stat-grid">
                  <div><dt>Weight</dt><dd>{node.weight}</dd></div>
                  <div><dt>Base latency</dt><dd>{node.baseLatencyMs} ms</dd></div>
                  <div><dt>Handled</dt><dd>{node.totalRequests}</dd></div>
                  <div><dt>In flight</dt><dd>{node.inFlight}</dd></div>
                </dl>
              </article>
            ))}
          </div>

          <div className="subpanel">
            <h3>Add a node</h3>
            <div className="triple-inputs">
              <input value={newNodeName} onChange={(e) => setNewNodeName(e.target.value)} placeholder="Node name" />
              <input type="number" value={newNodeWeight} onChange={(e) => setNewNodeWeight(e.target.value)} placeholder="Weight" />
              <input type="number" value={newNodeLatency} onChange={(e) => setNewNodeLatency(e.target.value)} placeholder="Latency ms" />
            </div>
            <button className="primary" onClick={addNode} disabled={loading}>Add node</button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Read path</p>
              <h2>Cache and rate limiting</h2>
            </div>
            <span>Repeat the same key and watch the path change</span>
          </div>

          <label className="field">
            <span>Resource key</span>
            <input value={resourceKey} onChange={(e) => setResourceKey(e.target.value)} />
          </label>

          <div className="button-row wrap">
            <button className="primary" onClick={fetchResource} disabled={loading}>Fetch resource</button>
            <button onClick={() => updateConfig({ cacheEnabled: !config?.cacheEnabled })} disabled={loading}>
              Cache: {config?.cacheEnabled ? 'on' : 'off'}
            </button>
          </div>

          <label className="field">
            <span>Rate limit per window</span>
            <input
              type="number"
              min="1"
              max="100"
              value={config?.rateLimitPerWindow || 12}
              onChange={(e) => updateConfig({ rateLimitPerWindow: Number(e.target.value) })}
            />
          </label>

          <div className="subpanel">
            <h3>Burst simulation</h3>
            <div className="button-row">
              <input type="number" min="1" max="50" value={burstCount} onChange={(e) => setBurstCount(e.target.value)} />
              <button onClick={simulateBurst} disabled={loading}>Run burst</button>
            </div>
          </div>

          <div className="log-list">
            {requestLog.map((entry, index) => (
              <article key={`${entry.key}-${index}`} className="log-card">
                <strong>{entry.source === 'cache' ? 'Cache hit' : entry.source === 'burst' ? 'Burst run' : 'Origin response'}</strong>
                <p>{entry.key}</p>
                <small>{entry.servedBy ? `${entry.servedBy} - ${entry.latencyMs} ms` : entry.value}</small>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Write path</p>
              <h2>Queue, retries, and DLQ</h2>
            </div>
            <span>Turn on retry storm to make failures pile up</span>
          </div>

          <div className="double-inputs">
            <input value={jobType} onChange={(e) => setJobType(e.target.value)} placeholder="Job type" />
            <input value={jobTarget} onChange={(e) => setJobTarget(e.target.value)} placeholder="Target" />
          </div>

          <div className="button-row wrap">
            <button onClick={enqueueJob} disabled={loading}>Enqueue job</button>
            <button className="primary" onClick={processQueue} disabled={loading}>Process queue</button>
            <button onClick={() => updateConfig({ retryStormEnabled: !config?.retryStormEnabled })} disabled={loading}>
              Retry storm: {config?.retryStormEnabled ? 'on' : 'off'}
            </button>
          </div>

          <div className="queue-summary">
            <div>
              <span>Queue depth</span>
              <strong>{queue.length}</strong>
            </div>
            <div>
              <span>DLQ depth</span>
              <strong>{deadLetterQueue.length}</strong>
            </div>
          </div>

          <div className="log-list compact">
            {queueLog.map((entry, index) => (
              <article key={`${entry.id}-${index}`} className="log-card">
                <strong>Job {entry.id}</strong>
                <p>{entry.status || entry.type}</p>
                <small>{entry.attempts ? `attempts: ${entry.attempts}` : 'queued'}</small>
              </article>
            ))}
          </div>
        </section>

        <section className="panel panel-wide">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">System trace</p>
              <h2>Recent events</h2>
            </div>
            <span>The control room log</span>
          </div>

          <div className="event-list">
            {events.map((event) => (
              <article key={event.id} className={`event-item tone-${eventTone[event.type] || 'accent'}`}>
                <div className="event-title-row">
                  <strong>{event.type}</strong>
                  <span>{new Date(event.ts).toLocaleTimeString()}</span>
                </div>
                <p>{event.message}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
