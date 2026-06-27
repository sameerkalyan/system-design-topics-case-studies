# Cache Stampede in System Design

## 1. Quick Recap

You already know the **Thundering Herd Problem**: many users, threads, or services all wake up and do the same work at the same time. **Cache Stampede** is one very common version of that problem. It happens specifically when a **cache** entry expires and a large number of requests all miss the cache together, then rush to the database or backend service at once. So you can think of it like this:

```text
Thundering Herd Problem
        |
        +--> Cache Stampede
              (herd caused by cache expiry)
```

In short: **every cache stampede is a thundering herd pattern, but not every thundering herd is caused by cache expiry**.

---

## 2. What is Cache Stampede?

A **cache** is a fast storage layer that keeps frequently used data close by so your system does not need to fetch it from the slower source every time.

A **cache miss** happens when the requested data is not found in the cache.

A **cache stampede** happens when:

- a popular cached item expires
- many requests arrive at nearly the same time
- all of them see a cache miss
- all of them go to the backend together
- the backend gets overloaded doing the same work repeatedly

### Plain English definition

Cache stampede means:

> A lot of requests try to rebuild or fetch the same missing cache value at the same time.

Instead of one request rebuilding the data and everyone else reusing it, **everybody rushes in together**.

### Real-world analogy: library rush

Imagine a library with one very popular book.

- The library usually keeps a **copy at the front desk** for fast access. That is like the **cache**.
- The real book archive is in a **slow basement room**. That is like the **database**.
- The front-desk copy is removed for replacement.
- At that exact moment, 100 people ask for the same book.
- Because the front desk no longer has it, all 100 ask the librarian to go to the basement.

That is the problem.

### ASCII analogy diagram

```text
Popular book at front desk = cache
Real archive in basement    = database

Readers  ---> Front desk copy missing ---> All ask librarian ---> Basement flooded
```

### Why it is special

A normal cache miss is not scary by itself.

```text
One request -> cache miss -> fetch from DB -> refill cache -> done
```

A stampede is scary because:

```text
1000 requests -> same cache miss -> 1000 backend fetches -> overload
```

---

## 3. How it Triggers

Let's walk through it slowly.

### Key terms first

- **TTL (Time To Live)**: how long a cached item stays valid
- **Backend**: the slower source that generates or stores the real data, often a database or another service
- **Concurrent**: happening at the same time

### Step-by-step flow

Suppose your homepage data is cached for **60 seconds**.

1. The homepage data sits in cache and requests are fast
2. Traffic is high because many users are opening the app
3. The cache item's TTL reaches zero
4. The item expires
5. New incoming requests check the cache
6. They all see the item is missing
7. Each request independently asks the backend for the same data
8. The backend gets hit many times for one logical answer
9. Response times go up and errors may start

### Timeline diagram

```text
Time ---------------------------------------------------------->

[0s - 59s]
Cache key exists
Req A -> HIT
Req B -> HIT
Req C -> HIT

[60s]
Cache expires

[60s + tiny moment]
Req D -> MISS -> DB
Req E -> MISS -> DB
Req F -> MISS -> DB
Req G -> MISS -> DB
Req H -> MISS -> DB
```

### Flow diagram: expiry -> miss -> flood

```text
                 Cache key expires
                         |
                         v
                Request 1 arrives -> miss -> DB
                Request 2 arrives -> miss -> DB
                Request 3 arrives -> miss -> DB
                Request 4 arrives -> miss -> DB
                Request 5 arrives -> miss -> DB
                         |
                         v
                Same expensive work repeated
```

### Another way to picture it

```text
             +------------------+
Users -----> |      Cache       |
             +------------------+
                      |
                key expired
                      |
                      v
             +------------------+
             |    Miss storm    |
             +------------------+
              /   /   /   /   /
             v   v   v   v   v
         +------------------------+
         |   DB / origin service  |
         +------------------------+
```

---

## 4. Concrete Example

Let's use **Hotstar during an IPL match**.

### Scenario

Hotstar shows a **live scoreboard summary** on its match page.
That summary is very popular and is cached in Redis for **30 seconds**.

Assume:

- **20,000 concurrent users** are refreshing or opening the match page
- the scoreboard cache key has **TTL = 30 seconds**
- once it expires, requests arrive at about **5,000 requests per second**
- generating the scoreboard requires **1 expensive database query** and some aggregation work

### Ideal situation

Best case:

- first request after expiry fetches fresh data
- cache is refilled immediately
- remaining requests use the refreshed cache

So ideally for that refresh moment:

- **5,000 incoming requests per second**
- maybe only **1 backend recomputation**
- nearly all others get cached result

### What happens in a cache stampede?

Without protection:

- cache expires at second 30
- during the next 1 second, around **5,000 requests** arrive
- all 5,000 see cache miss
- all 5,000 trigger backend work

So instead of:

- **1 DB query**

you get:

- **5,000 DB queries in one second**

### ASCII diagram

```text
Hotstar IPL score key expires at 8:15:30 PM

5,000 req/s
    |
    v
+-----------+
|   Redis   |
+-----------+
     |
   MISS for everyone
     |
     v
+-------------------+
|   Score service   |
+-------------------+
     |
     v
+-------------------+
|     Database      |
+-------------------+

Result: 5,000 nearly identical queries in 1 second
```

### Why this hurts even if one query is fast

Maybe one scoreboard query takes only **40 ms** when the system is calm.
But 5,000 copies of that same query in one second can:

- exhaust DB connections
- consume CPU heavily
- increase lock contention
- slow other unrelated queries
- cause timeout errors in the app

### Amazon sale example

This also happens during a sale on Amazon-like systems:

- product price cache expires
- 10,000 users load the same product page
- every request asks pricing service for fresh value
- pricing DB gets hammered

Same pattern, different app.

---

## 5. Why it's Worse than a Regular Cache Miss

A regular cache miss is normal.
A cache stampede is dangerous because it **compounds**.

### Regular cache miss

```text
1 request -> cache miss -> 1 backend call -> cache refill -> recovered
```

### Cache stampede

```text
Many requests -> many misses -> many backend calls -> slowdown -> more failures
```

### The compounding feedback loop

Here is the important part many beginner explanations skip:

```text
More misses
   -> more DB load
   -> slower DB responses
   -> requests stay open longer
   -> app threads/connections stay busy longer
   -> more timeouts
   -> clients retry
   -> even more requests arrive
   -> even more misses and backend load
```

### ASCII loop diagram

```text
Cache expires
    -> burst of misses
    -> DB overload
    -> slower responses
    -> request timeout
    -> client retries
    -> larger burst
    -> more overload
```

### Why the delay makes it worse

When the backend slows down:

- the first request takes longer to refill the cache
- while it is still working, many more requests arrive
- all of them also miss
- the refill window gets wider

That means a backend slowdown can create even more misses.

### Visual of widening refill gap

```text
Normal case:
MISS -> refill in 30 ms -> few extra misses

Bad case:
MISS -> refill in 2 s -> thousands more misses during that 2 s window
```

### Plain English summary

A regular miss is one person asking the librarian for help.
A stampede is the line getting longer because the librarian is already overloaded, which makes everyone wait longer, which creates an even bigger line.

---

## 6. Solutions in Depth

Below are the major ways to reduce or prevent cache stampede.

---

### 6.1 Mutex / distributed locking

A **mutex** means **mutual exclusion**: only one worker is allowed to do a critical piece of work at a time.

A **distributed lock** is the same idea, but used across many servers.

### Core idea

- first request after cache miss gets the lock
- that request recomputes the value
- other requests wait or use stale data
- once cache is filled, everyone reads from cache

### Before

```text
Req 1 -> MISS -> DB
Req 2 -> MISS -> DB
Req 3 -> MISS -> DB
Req 4 -> MISS -> DB
```

### After

```text
Req 1 -> MISS -> gets lock -> DB -> refill cache -> unlock
Req 2 -> MISS -> waits ------------------------------^
Req 3 -> MISS -> waits ------------------------------^
Req 4 -> MISS -> waits ------------------------------^
```

### Distributed version

```text
App Server A -> tries lock for key:user_feed
App Server B -> tries lock for key:user_feed
App Server C -> tries lock for key:user_feed

Only one wins
Others wait / poll / use stale cache
```

### Why it helps

- only one recomputation happens
- backend is protected from duplicate work

### Tradeoffs

- lock management is tricky
- if lock is stuck, requests may block
- bad timeout settings can create delays

---

### 6.2 Probabilistic early expiration (PER / XFetch)

This is a smarter approach.

Instead of waiting until the cache fully expires, the system sometimes decides to refresh **a little early**, especially for hot keys.

### Key idea

If you always refresh exactly at expiry time, many requests may line up there.
If you refresh a bit earlier, the chance of a mass expiry burst goes down.

### What "probabilistic" means

**Probabilistic** means based on probability, not a fixed exact moment.

The cache entry can still be valid, but the system may say:

- "This key is getting close to expiry"
- "Traffic is high"
- "Let's refresh now with some probability"

### Before

```text
All requests depend on exact TTL = 60s
At 60s -> hard expiry -> large miss storm
```

### After

```text
TTL approaches 60s
Some request at 54s refreshes early
Some request at 57s may refresh early
Result: fewer requests reach hard expiry together
```

### ASCII timeline

```text
Without PER:
|--------------------valid--------------------| EXPIRE | MISS STORM

With PER:
|-------------valid-------------| early refresh happens | new TTL |
```

### Why XFetch is elegant

**XFetch**-style logic tries to decide whether to recompute early based on:

- how expensive recomputation is
- how close the item is to expiry
- randomness to spread refresh work

This avoids every request reaching the same cliff edge at the same time.

### Why it helps

- spreads regeneration over time
- reduces synchronized expiry events
- works well for very hot keys

### Tradeoffs

- harder to implement and tune
- may refresh slightly more often than strictly necessary

---

### 6.3 Background cache refresh

This is also called **asynchronous recompute**.

**Asynchronous** means the work happens in the background, without forcing the current user request to wait for all of it.

### Core idea

- refresh cache before TTL hits zero
- do it in background with a scheduler, worker, or refresh thread
- users keep reading from already prepared cache

### Before

```text
TTL hits zero
    -> first live user request pays the refresh cost
    -> many requests may miss together
```

### After

```text
Background job notices key is about to expire
    -> refreshes it early
    -> user requests keep getting cache hits
```

### ASCII diagram

```text
                 Background worker
                        |
                        v
Cache key near expiry -> refresh now -> new TTL set
        |
        v
Users continue reading cached value
```

### Best use case

Very hot keys that are easy to predict, such as:

- homepage widgets
- live score summaries
- popular category pages

### Tradeoffs

- may refresh data nobody actually needs
- needs a scheduler or worker system
- harder when the list of hot keys changes often

---

### 6.4 Request coalescing / promise deduplication

**Request coalescing** means combining many identical requests into one shared operation.

**Promise deduplication** is a common name for this in JavaScript or Node.js systems: if one request is already fetching the value, others reuse the same in-flight promise instead of starting new work.

### Before

```text
Req A -> MISS -> fetch from DB
Req B -> MISS -> fetch from DB
Req C -> MISS -> fetch from DB
```

### After

```text
Req A -> MISS -> start fetch
Req B -> MISS -> attach to same in-flight fetch
Req C -> MISS -> attach to same in-flight fetch

One fetch completes -> all receive same result
```

### ASCII flow

```text
             Many requests for same key
                        |
                        v
             Is there already an in-flight fetch?
                    /                 \
                  Yes                  No
                  |                    |
            wait for result         start fetch
                  \                    /
                   \                  /
                    +----shared result+
```

### Why it helps

- duplicate work is removed
- very effective inside one app process
- simple mental model for beginners

### Tradeoffs

- local-only if implemented per process
- across many servers, you may need distributed coordination too

---

### 6.5 Stale-while-revalidate (SWR)

This pattern allows the system to briefly serve **stale** data.

**Stale** means slightly old, but still acceptable for a short period.

**Revalidate** means refresh the data in the background.

### Core idea

- if cache is slightly outdated, still return it
- trigger a background refresh
- next requests get the fresh value

### Before

```text
Cache expires -> all requests miss -> backend flood
```

### After

```text
Cache becomes stale
    -> requests still get old value briefly
    -> one background refresh runs
    -> cache becomes fresh again
```

### ASCII diagram

```text
Request -> cache stale but usable -> return stale value now
                                 -> trigger refresh in background

Next request -> fresh value available
```

### Why it helps

- keeps latency low for users
- prevents a sudden miss storm
- especially useful when slightly old data is acceptable

### Tradeoffs

- users may briefly see old data
- not suitable for highly sensitive data that must always be exact

---

## 7. Code-Level Pseudocode

Below are two simple implementations.

### 7.1 Mutex / lock pseudocode

```text
function getScore(key):
    value = cache.get(key)
    if value exists:
        return value

    if lock.acquire(key, timeout=2s):
        try:
            value = cache.get(key)
            if value exists:
                return value

            value = database.query(key)
            cache.set(key, value, ttl=30s)
            return value
        finally:
            lock.release(key)
    else:
        sleep(50ms)
        retry reading cache
```

### What this does

- first request gets the lock
- double-checks cache again
- fetches from DB only if still missing
- stores result
- releases lock
- others wait and retry cache

### 7.2 Request coalescing / promise deduplication pseudocode (Node.js style)

```text
const inFlight = new Map()

async function getProduct(key) {
  const cached = await cache.get(key)
  if (cached) return cached

  if (inFlight.has(key)) {
    return inFlight.get(key)
  }

  const promise = (async () => {
    const value = await db.query(key)
    await cache.set(key, value, 60)
    return value
  })()

  inFlight.set(key, promise)

  try {
    return await promise
  } finally {
    inFlight.delete(key)
  }
}
```

### What this does

- if cache hits, return immediately
- if someone is already fetching the key, reuse that promise
- only one DB query is started per key per process

### 7.3 Stale-while-revalidate pseudocode

```text
function getNewsFeed(key):
    entry = cache.getWithMetadata(key)

    if entry is fresh:
        return entry.value

    if entry is stale but allowed:
        triggerBackgroundRefresh(key)
        return entry.value

    value = database.query(key)
    cache.set(key, value, ttl=60s, staleWindow=30s)
    return value
```

---

## 8. Comparison Table

| Solution | Complexity | Latency impact | Stale data risk | Best use case |
|---|---:|---|---|---|
| Mutex / distributed locking | Medium to High | Waiting requests may see extra latency | Low | Expensive cache rebuilds where only one recompute should happen |
| Probabilistic early expiration (PER / XFetch) | High | Usually low if tuned well | Low to Medium | Very hot keys with synchronized expiry risk |
| Background cache refresh | Medium | Very low for users when refresh works well | Low to Medium | Predictable hot keys refreshed on schedule |
| Request coalescing / promise deduplication | Medium | Low for shared requests, some wait for leader request | Low | Many identical requests in the same time window |
| Stale-while-revalidate | Medium | Very low because stale response can be returned instantly | Medium | Content where slightly old data is acceptable |

### Visual summary

```text
Lowest freshness risk:     Locking
Lowest user latency:       SWR / background refresh
Most mathematically fancy: PER / XFetch
Simplest app-level win:    Request coalescing
```

---

## 9. Where You'd Use Each Fix

### 9.1 Redis

**Redis** is often used as a shared cache between app servers.

Common fixes:

- **distributed locking** for hot keys
- **stale-while-revalidate** for feed-like data
- **background refresh** for predictable keys

```text
App servers -> Redis -> miss on hot key -> use lock or stale strategy
```

### 9.2 CDN edge caching

A **CDN (Content Delivery Network)** stores copies of content closer to users.
**Edge caching** means caching at those geographically distributed edge locations.

Common fixes:

- **stale-while-revalidate**
- **background refresh**
- sometimes **probabilistic early refresh**

```text
Users -> CDN edge -> stale response allowed -> edge refreshes origin in background
```

### 9.3 API response caching

When APIs return expensive but repeated responses, good fixes include:

- **request coalescing** inside the API server
- **locking** for shared distributed cache keys
- **SWR** when slightly old responses are okay

```text
Clients -> API layer -> response cache -> one in-flight fetch shared by many callers
```

### 9.4 DB query caching

For expensive query results cached in app or Redis:

- **locking** works well
- **PER / XFetch** helps for very hot query results
- **background refresh** helps when access patterns are predictable

```text
Hot query -> cached result -> near expiry -> refresh early or lock rebuild
```

### Rule of thumb

- exact correctness needed? -> prefer **locking**
- very hot and predictable? -> try **background refresh**
- slightly stale okay? -> use **SWR**
- lots of identical requests? -> use **coalescing**
- huge synchronized expiry risk? -> consider **PER / XFetch**

---

## 10. Common Mistakes Beginners Make

Here are a few common implementation mistakes.

### Mistake 1: Using the same TTL for every key

If many popular keys expire at the exact same time, you create synchronized miss storms.

```text
Key A expires at 12:00:00
Key B expires at 12:00:00
Key C expires at 12:00:00

Result -> herd event at one timestamp
```

#### Why it backfires

- many keys regenerate together
- backend load spikes sharply

#### Better idea

- add TTL **jitter** (small randomness)
- spread expiration times out

---

### Mistake 2: Adding a lock without a timeout

If a process crashes while holding the lock, other requests may wait forever.

```text
Req 1 gets lock -> crashes
Req 2 waits forever
Req 3 waits forever
```

#### Why it backfires

- your fix becomes a new outage source

#### Better idea

- always use lock expiry and careful release logic

---

### Mistake 3: Making everyone retry aggressively on a miss

Some beginners accidentally add code like:

```text
if miss:
    retry immediately
```

#### Why it backfires

- retries amplify the traffic spike
- database gets hammered even harder

#### Better idea

- use backoff and jitter
- or wait on one shared in-flight fetch

---

### Mistake 4: Serving stale data for everything

SWR is useful, but not every type of data can safely be stale.

Examples where stale data may be risky:

- account balance
- inventory count for the last item in stock
- fraud or permission data

#### Why it backfires

- users may see incorrect critical information

#### Better idea

- choose strategy by data type, not by convenience

---

## Final Summary

Cache stampede is a **cache-specific thundering herd**.
It happens when a popular cache key expires and many requests all try to rebuild it together.

### The important pattern to remember

```text
Expiry -> many misses -> backend flood -> slowdown -> retries -> bigger flood
```

### Best beginner mental model

Think of cache stampede as:

> Everyone showing up at the slow source because the fast shortcut disappeared at the same moment.

### Main fixes to know

- **Mutex / distributed lock**: one request recomputes, others wait
- **PER / XFetch**: refresh a little early with smart probability
- **Background refresh**: refill before expiry in the background
- **Request coalescing**: combine duplicate in-flight requests
- **Stale-while-revalidate**: serve slightly old data while refreshing

### One-line takeaway

If a cached value is popular, do not let its expiry become a public event that every request reacts to at once.
