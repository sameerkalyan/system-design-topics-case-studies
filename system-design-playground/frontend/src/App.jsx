import { useEffect, useMemo, useState } from 'react';

const API_BASE = 'http://localhost:5001';

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

  const nodes = dashboard?.nodes || [];
  const queueDepth = dashboard?.queueDepth || 0;
  const healthyCount = nodes.filter(node => node.healthy).length;

  const conceptCards = useMemo(() => ([
    { title: 'Load balancing', value: dashboard?.strategy || 'round-robin' },
    { title: 'Healthy nodes', value: `${healthyCount}/${nodes.length || 0}` },
    { title: 'Rate-limited requests', value: dashboard?.requestsThisMinute || 0 },
    { title: 'Queue depth', value: queueDepth }
  ]), [dashboard, healthyCount, nodes.length, queueDepth]);

  async function refreshDashboard() {
    const res = await fetch(`${API_BASE}/api/dashboard`);
    const data = await res.json();
    setDashboard(data);
  }

  useEffect(() => {
    refreshDashboard();
    const id = setInterval(refreshDashboard, 3000);
    return () => clearInterval(id);
  }, []);

  async function updateStrategy(strategy) {
    await fetch(`${API_BASE}/api/strategy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategy })
    });
    refreshDashboard();
  }

  async function fetchResource() {
    setError('');
    const res = await fetch(`${API_BASE}/api/resource/${resourceId}`);
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || 'Request failed');
      return;
    }

    setResponses(prev => [data, ...prev].slice(0, 8));
    refreshDashboard();
  }

  async function toggleNode(nodeId) {
    await fetch(`${API_BASE}/api/nodes/${nodeId}/toggle`, { method: 'POST' });
    refreshDashboard();
  }

  async function enqueueJob() {
    const res = await fetch(`${API_BASE}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: jobPayload })
    });

    const data = await res.json();
    setJobResult(data);
    refreshDashboard();
  }

  async function processJob() {
    const res = await fetch(`${API_BASE}/api/jobs/process`, { method: 'POST' });
    const data = await res.json();
    setJobResult(data);
    refreshDashboard();
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

          <button className="primary" onClick={fetchResource}>Fetch resource</button>
          {error ? <p className="error-text">{error}</p> : null}

          <div className="response-list">
            {responses.map((item, index) => (
              <div key={`${item.servedBy || item.data?.resourceId}-${index}`} className="response-card">
                <strong>{item.cache === 'hit' ? 'Cache hit' : 'Cache miss'}</strong>
                <p>Served by: {item.servedBy || item.data?.servedBy || 'cache'}</p>
                <p>Strategy: {item.strategy || 'cached'}</p>
                <p>Delay: {item.delay || 0}ms</p>
                <p>Resource: {item.data?.resourceId || item.data?.data?.resourceId}</p>
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
      </main>
    </div>
  );
}
