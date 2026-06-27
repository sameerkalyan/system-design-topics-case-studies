# System Design Playground

A rebuilt full-stack demo for learning system design concepts by interacting with a small simulated distributed system.

## What this playground demonstrates

This app is designed to make common interview and production topics visible instead of purely theoretical.

### Concepts included

- load balancing
- round robin vs least connections vs weighted round robin
- failover with unhealthy nodes
- in-memory caching with TTL
- rate limiting under burst traffic
- queue processing
- retries and retry storms
- dead-letter queue behavior
- circuit breaker simulation
- backpressure and saturation behavior
- request distribution charts
- event logging and system-state inspection

## Project structure

```text
system-design-playground/
  backend/
    package.json
    src/index.js
  frontend/
    package.json
    index.html
    src/
      App.jsx
      main.jsx
      styles.css
```

## Backend behavior

The backend exposes a small simulation API that lets the frontend:

- inspect the whole current system state
- change routing strategy and simulation settings
- add new backend nodes
- toggle node health to force failover scenarios
- fetch resources through a balancer and observe cache hits or misses
- simulate burst traffic and rate-limit pressure
- enforce backpressure on saturated nodes and full queues
- open and close node circuit breakers after repeated failures
- enqueue jobs and process them through retries
- move repeatedly failing jobs into a dead-letter queue
- return request-series metrics for charts
- reset the environment back to defaults

## Frontend behavior

The frontend is a dashboard-style control room where you can:

- switch balancing strategies live
- take nodes offline and restore them
- add a node with a custom weight and latency
- fetch the same resource repeatedly to observe cache behavior
- lower or raise the rate limit window threshold
- run burst traffic and observe accepted vs throttled requests
- enqueue jobs and process them in batches
- enable retry storm mode to increase failure pressure
- toggle circuit breaker behavior
- toggle backpressure mode and saturate the queue
- inspect recent system events in a single log panel
- view live request distribution charts

## How to run

### 1. Install dependencies

From the playground root:

```bash
cd system-design-playground
npm run install:all
```

### 2. Start the backend

```bash
cd backend
npm run dev
```

Backend default URL:

```text
http://localhost:5001
```

### 3. Start the frontend

Open a second terminal:

```bash
cd frontend
npm run dev
```

Vite will print the local frontend URL in your terminal.

## Suggested demo flow

1. Start with **round robin** and fetch the same resource twice.
2. Notice the first request goes to origin and the next one comes from cache.
3. Turn cache off and fetch again to compare behavior.
4. Mark a node unhealthy and keep sending requests.
5. Switch to **least connections** and compare how traffic shifts.
6. Add a slower or heavier-weighted node and test **weighted round robin**.
7. Lower the rate limit and run a burst to trigger throttling.
8. Turn on **backpressure** and drive the system into saturation.
9. Turn on **circuit breaker** and watch overloaded nodes get opened.
10. Enqueue several jobs, trigger retry storm mode, and watch failures move into the dead-letter queue.
11. Inspect the charts to compare distribution and failure buildup over time.

## API summary

### Read state

- `GET /api/state`

### Update simulation config

- `POST /api/config`

Example body:

```json
{
  "strategy": "least-connections",
  "cacheEnabled": true,
  "rateLimitPerWindow": 8,
  "retryStormEnabled": false,
  "circuitBreakerEnabled": true,
  "backpressureEnabled": true
}
```

### Nodes

- `POST /api/nodes`
- `POST /api/nodes/:id/toggle-health`

### Read path

- `GET /api/resource/:key`
- `POST /api/burst`

### Queue path

- `POST /api/queue/enqueue`
- `POST /api/queue/process`

### Reset

- `POST /api/reset`

## Good next extensions

- sticky sessions
- replica lag and read replicas
- consistent hashing visualization
- shard-router simulation
- outbox pattern demo
- per-node latency histograms
- storage-layer or Kafka-style partition demos
