# System Design Playground

A small **React + Node.js** project to help you learn system design concepts by interacting with them instead of only reading theory.

## Concepts covered in phase 1

- Load balancing
- Failover / health checks
- Rate limiting
- Caching
- Messaging / queue processing
- Retries / retry storms

## Project structure

```text
system-design-playground/
  backend/
    server.js
  frontend/
    index.html
  package.json
```

## How to run

### 1. Install dependencies for the backend

```bash
npm install express cors
```

### 2. Start the backend

```bash
node backend/server.js
```

The backend runs on `http://localhost:5001`.

### 3. Open the frontend

Open `frontend/index.html` in a browser.

If your browser blocks local file requests, serve the folder with a small static server.

Example:

```bash
npx serve frontend -l 4173
```

Then open:

```text
http://localhost:4173
```

## What the frontend lets you do

- send API requests through different load-balancing strategies
- toggle cache on and off
- simulate traffic surge
- simulate retry storm mode
- mark nodes healthy or unhealthy
- enqueue and process async jobs
- watch request logs and processed jobs

## Suggested learning flow

1. Start with round robin.
2. Switch to least connections.
3. Turn one node unhealthy.
4. Observe failover behavior.
5. Turn cache on and compare repeated requests.
6. Reuse the same client ID until rate limiting triggers.
7. Enable retry storm mode and process queued jobs.

## Why this project matters

Most system design explanations stay abstract. This project makes the system visible:

- which node served the request
- when requests fail
- when retries help or hurt
- when queue lag builds
- when cache avoids origin work
- when rate limiting protects the system

## Next improvements

Future phases can add:

- consistent hashing visualization
- shard router simulation
- replica lag simulation
- outbox pattern demo
- dead-letter queue view
- cache stampede simulation
