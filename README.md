# System Design Topics & Case Studies

A curated repository of system design notes, case studies, failure-mode explainers, and an interactive playground for learning distributed systems concepts hands-on.

## What this repository includes

This repo combines two styles of learning:

1. **Written explainers** for common system design problems and tradeoffs
2. **A runnable playground** that turns those ideas into a small working simulation

## Repository structure

### Topic deep-dives

- `section-a-data-consistency.md`
- `section-b-scaling-traffic-distribution.md`
- `section-c-caching.md`
- `section-d-messaging-async-systems.md`
- `section-e-databases-query-performance.md`
- `section-f-api-product-facing-design.md`

### Focused case studies and failure modes

- `backpressure.md`
- `cache-stampede-explained.md`
- `duplicate-requests-idempotency-gap.md`
- `hot-partition-hot-key.md`
- `n-plus-one-query-problem.md`
- `retry-storm.md`
- `single-point-of-failure-spof.md`
- `stale-cache-read-after-write-inconsistency.md`
- `thundering-herd-problem-explained.md`
- `react-node-load-balancing-demo.md`
- `reliability-and-failure-handling-compendium (1).md`

### Interactive demo

- `system-design-playground/`

The playground is a small React + Node project for simulating:

- load balancing
- failover
- caching
- rate limiting
- queue processing
- retry storms
- dead-letter queues
- circuit breaker behavior
- backpressure and queue saturation
- request distribution over time

## Best place to start

If you are new to the repo, a good order is:

1. Read `section-b-scaling-traffic-distribution.md`
2. Read `section-c-caching.md`
3. Read `section-d-messaging-async-systems.md`
4. Read `retry-storm.md`
5. Run `system-design-playground/`
6. Return to the written case studies with the simulation behavior in mind

## System Design Playground

The playground gives you a visual way to test concepts instead of only reading about them.

### Features

- switch between round robin, least connections, and weighted round robin
- take nodes offline to observe failover
- add nodes with custom weight and latency
- fetch the same resource repeatedly to see cache hits and misses
- simulate rate limiting under burst traffic
- inspect queue retries and dead-letter queue behavior
- toggle circuit breaker behavior and backpressure mode
- watch request distribution charts update from live interactions
- review a recent event log for debugging

### Run locally

```bash
cd system-design-playground
npm run install:all
```

Start backend:

```bash
cd backend
npm run dev
```

Start frontend in a second terminal:

```bash
cd frontend
npm run dev
```

## Who this repo is for

This repository is useful for:

- software engineers preparing for system design interviews
- backend engineers reviewing reliability and scaling patterns
- students learning distributed systems incrementally
- anyone who wants both conceptual notes and a concrete demo

## Suggested next improvements

Potential future additions:

- sticky sessions simulation
- replica lag and read-replica scenarios
- consistent hashing visualization
- shard-router demo
- outbox pattern simulation
- per-node time-series dashboards
- storage-layer or Kafka-style partition demos

## License / usage

Use the material for study, discussion, and experimentation. If you want, you can add a dedicated license file later to make reuse terms explicit.
