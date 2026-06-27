import { useEffect, useMemo, useState } from 'react';

const strategyOptions = [
  { value: 'round-robin', label: 'Round robin' },
  { value: 'least-connections', label: 'Least connections' },
  { value: 'weighted-round-robin', label: 'Weighted round robin' }
];

export default function App() {
  const [dashboard, setDashboard] = useState(null);
  const [resourceId, setResourceId] = useState('video-feed');
  const [responses, setResponses] = useState([]);
  const [jobPayload, setJobPayload] = useState('send-email');
  const [jobResult, setJobResult] = useState(null);
  const [error, setError] = useState('');
  const [burstCount, setBurstCount] = useState(12);

  const nodes = dashboard?.nodes || [];
  const queueDepth = dashboard?.queueDepth || 0;
  const healthyCount = nodes.filter(node => node.healthy).length;

  const conceptCards = useMemo(() => ([
    { title: 'Load balancing', value: dashboard?.strategy || 'round-robin' },
    { title: 'Healthy nodes', value: `${healthyCount}/${nodes.length || 0}` },
    { title: 'Requests this minute', value: dashboard?.requestsThisMinute || 0 },
    { title: 'Queue depth', value: queueDepth }
  ]), [dashboard, healthyCount, nodes.length, queueDepth]);

  async function api(path, options = {}) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || data.message || 'Request failed');
    }
    return data;
  }

  async function refreshDashboard() {
    try {
      const data = await api('/api/dashboard');
      setDashboard(data);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    refreshDashboard();
    const id = setInterval(refreshDashboard, 3000);
    return () => clearInterval(id);
  }, []);

  async function updateStrategy(strategy) {
    try {
      await api('/api/strategy', {
        method: 'POST',
        body: JSON.stringify({ strategy })
      });
      refreshDashboard();
    } catch (err) {
      setError(err.message);
    }
  }

  async function fetchResource() {
    setError('');
    try {
      const data = await api(`/api/resource/${resourceId}`);
      setResponses(prev => [data, ...prev].slice(0, 8));
      refreshDashboard();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleNode(nodeId) {
    try {
      await api(`/api/nodes/${nodeId}/toggle`, { method: 'POST' });
      refreshDashboard();
    } catch (err) {
      setError(err.message);
    }
  }

  async function enqueueJob() {
    try {
      const data = await api('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({ payload: jobPayload })
      });
      setJobResult(data);
      refreshDashboard();
    } catch (err) {
      setError(err.message);
    }
  }

  async function processJob() {
    try {
      const data = await api('/api/jobs/process', { method: 'POST' });
      setJobResult(data);
      refreshDashboard();
    } catch (err) {
      setError(err.message);
      setJobResult({ message: err.message, concept: 'retry-storm' });
      refreshDashboard();
    }
  }

  async function toggleCache() {
    try {
      await api('/api/cache/toggle', { method: 'POST' });
      refreshDashboard();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleRetryStorm() {
    try {
      await api('/api/retry-storm/toggle', { method: 'POST' });
      refreshDashboard();
    } catch (err) {
      setError(err.message);
    }
  }

  async function triggerSurge() {
    try {
      const data = await api('/api/surge', {
        method: 'POST',
        body: JSON.stringify({ count: Number(burstCount) })
      });
      setJobResult(data);
      refreshDashboard();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">System Design Playground</p>
          <h1>Learn scaling by breaking and fixing a tiny system.</h1>
          <p className="intro">
            This mini app lets you switch balancing strategies, simulate unhealthy nodes,
            observe cache behavior, trigger queue processing, and see retry failures in one place.
          </p>
        </div>
        <div className="hero-grid">
          {conceptCards.map(card => (
            <div key={card.title} className="metric-card">
              <span>{card.title}</span>
              <strong>{card.value}</strong>
            </div>
          ))}
        </div>
      </header>

      <main className="layout-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Load balancer controls</h2>
            <span>Concepts: load balancing, failover</span>
          </div>

          <label className="field">
            <span>Strategy</span>
            <select
              value={dashboard?.strategy || 'round-robin'}
              onChange={(e) => updateStrategy(e.target.value)}
            >
              {strategyOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <div className="toggle-row">
            <button onClick={toggleCache}>
              Cache: {dashboard?.cacheEnabled ? 'on' : 'off'}
            </button>
            <button onClick={toggleRetryStorm}>
              Retry storm: {dashboard?.retryStormMode ? 'on' : 'off'}
            </button>
          </div>

          <div className="node-list">
            {nodes.map(node => (
              <div key={node.id} className="node-card">
                <div>
                  <h3>{node.id}</h3>
                  <p>{node.healthy ? 'Healthy' : 'Unhealthy'}</p>
                </div>
                <ul>
                  <li>Handled: {node.handled}</li>
                  <li>Active: {node.activeConnections}</li>
                  <li>Base delay: {node.baseDelay}ms</li>
                  <li>Failures: {node.failed}</li>
                </ul>
                <button onClick={() => toggleNode(node.id)}>
                  {node.healthy ? 'Mark unhealthy' : 'Restore node'}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>API traffic simulator</h2>
            <span>Concepts: caching, rate limiting</span>
          </div>

          <label className="field">
            <span>Resource id</span>
            <input value={resourceId} onChange={(e) => setResourceId(e.target.value)} />
          </label>

          <div className="button-row">
            <button className="primary" onClick={fetchResource}>Fetch resource</button>
            <input
              type="number"
              min="1"
              max="50"
              value={burstCount}
              onChange={(e) => setBurstCount(e.target.value)}
            />
            <button onClick={triggerSurge}>Trigger surge</button>
          </div>

          {error ? <p className="error-text">{error}</p> : null}

          <div className="response-list">
            {responses.map((item, index) => (
              <div key={`${item.servedBy || item.data?.resourceId}-${index}`} className="response-card">
                <strong>{item.cache === 'hit' ? 'Cache hit' : 'Cache miss'}</strong>
                <p>Served by: {item.servedBy || 'unknown'}</p>
                <p>Strategy: {item.strategy || 'cached'}</p>
                <p>Delay: {item.delay || 0}ms</p>
                <p>Resource: {item.data?.resourceId}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Queue and retries</h2>
            <span>Concepts: messaging, retry storm</span>
          </div>

          <label className="field">
            <span>Job payload</span>
            <input value={jobPayload} onChange={(e) => setJobPayload(e.target.value)} />
          </label>

          <div className="button-row">
            <button onClick={enqueueJob}>Enqueue job</button>
            <button className="primary" onClick={processJob}>Process next job</button>
          </div>

          {jobResult ? (
            <div className="job-result">
              <strong>{jobResult.message || jobResult.concept}</strong>
              <pre>{JSON.stringify(jobResult, null, 2)}</pre>
            </div>
          ) : null}

          <div className="processed-list">
            <h3>Recent processed jobs</h3>
            {(dashboard?.processedJobs || []).map(job => (
              <div key={job.id} className="processed-job">
                <span>{job.id}</span>
                <span>{job.status}</span>
                <span>attempts: {job.attempts}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel panel-wide">
          <div className="panel-head">
            <h2>Recent system events</h2>
            <span>Concepts: observability, debugging</span>
          </div>

          <div className="event-list">
            {(dashboard?.trafficLog || []).map((event, index) => (
              <div key={`${event.time}-${index}`} className="event-item">
                <strong>{event.type}</strong>
                <span>{event.ok ? 'ok' : 'failed'}</span>
                <code>{JSON.stringify(event)}</code>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
