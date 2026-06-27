# System Design Playground

A small full-stack playground built to help learn system design concepts through a single interactive project.

## Concepts covered in phase 1

- Load balancing
- Failover / health checks
- Caching
- Rate limiting
- Messaging / queue basics
- Retries and retry storms
- Dead-letter queue behavior
- Traffic burst simulation

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

## Backend features

The backend simulates:

- multiple API nodes with different base latencies
- balancing strategies:
  - round robin
  - least connections
  - weighted round robin
- node health toggling for failover
- adding new nodes dynamically
- rate limiting
- in-memory cache with TTL and cache toggle
- queue creation and processing
- retry behavior with a retry storm mode
- dead-letter queue behavior
- traffic burst mode and burst request simulation

## Frontend features

The React dashboard lets you:

- switch balancing strategies
- mark nodes healthy or unhealthy
- add backend nodes
- fetch resources and see cache hit or miss behavior
- enable or disable cache
- change the rate limit
- simulate burst traffic
- enable retry storm mode
- enqueue jobs
- process jobs and observe retries
- inspect dead-lettered jobs
- see recent node and queue state

## How to run

### Backend

```bash
cd system-design-playground/backend
npm install
npm start
```

The backend runs by default on `http://localhost:5001`.

### Frontend

```bash
cd system-design-playground/frontend
npm install
npm run dev
```

The frontend expects the backend at `http://localhost:5001`.

## Suggested learning path

1. Start with round robin.
2. Fetch the same resource twice and notice cache behavior.
3. Turn cache off and compare repeated requests.
4. Mark one node unhealthy and observe failover.
5. Add a new node and compare distribution.
6. Switch to least connections and weighted round robin.
7. Lower the rate limit and trigger a burst.
8. Enable retry storm mode and process queued jobs.
9. Watch failed jobs move to the dead-letter queue.

## Good next improvements

- add sticky sessions
- add request charts over time
- add distributed cache simulation
- add circuit breaker logic
- add consistent hashing visualization
- add shard router simulation
- add replica lag simulation
- add outbox pattern demo
