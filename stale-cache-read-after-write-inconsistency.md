# Stale Cache / Read-After-Write Inconsistency in Distributed Systems

**TL;DR:** **Stale cache** means the cache still has old data after the real data has changed, and **read-after-write inconsistency** means a user writes new data successfully but then immediately reads back the old value instead of the new one.

## 1. What is Stale Cache / Read-After-Write Inconsistency?

Let’s start in plain English.

A **cache** is a fast storage layer that keeps frequently used data closer to the application so reads are faster.

The **source of truth** is the main system that stores the real latest data, usually a database.

A **stale cache** happens when:

- the database has new data
- but the cache still holds the old data
- so reads return outdated information

A **read-after-write inconsistency** happens when:

- a user updates data
- the update succeeds
- the user immediately reads the data again
- but the system returns the old version

### Plain English definition

This problem means:

> The system accepted a write, but a later read still shows the older value.

### Relatable analogy: whiteboard vs printed notice

Imagine a school has:

- the **real timetable** on the principal’s office whiteboard
- a **printed copy** posted in the hallway for students

Now suppose the principal updates the whiteboard:

- math class moved from 10 AM to 11 AM

But nobody replaces the hallway printout yet.
Students read the hallway notice and still see 10 AM.

That hallway notice is like a **stale cache**.

### ASCII diagram

```text
Database (new value):   user_name = "Aarav"
Cache (old value):      user_name = "Arav"

Read request ---> Cache returns old value
```

### Important beginner idea

The write is not lost.
The problem is that **the read path and write path are out of sync for a while**.

---

## 2. Why It Matters

This problem matters because modern systems often use caches everywhere:

- API response caching
- object caching
- Redis/Memcached layers
- CDN edge caching
- browser caching
- read replicas with lag

When caching is added, reads become faster, but correctness gets trickier.

### What users experience

Users may see:

- profile update succeeded, but old name still shows
- product stock changed, but old stock count is displayed
- message marked as read, but badge still shows unread
- order status updated, but order page still shows previous status

### Why this is dangerous

Sometimes stale reads are just confusing.
Sometimes they are business-critical.

Examples:

- wrong inventory count
- wrong wallet balance
- wrong seat availability
- old permissions shown after access revoked

### ASCII picture

```text
Write succeeds
    -> user expects new data
    -> cache still has old data
    -> immediate read shows old value
```

### Plain English summary

This is a correctness problem caused by **fast reads returning outdated state**.

---

## 3. How It Happens

Stale cache and read-after-write inconsistency can happen in several common ways.

### Basic step-by-step flow

1. Data is cached
2. User updates the real data in the database
3. Cache is not updated or invalidated immediately
4. User reads data again
5. Read goes to cache
6. Cache returns old value

### ASCII request flow

```text
Step 1: Existing state
DB    -> email = old@example.com
Cache -> email = old@example.com

Step 2: User updates email
Client -> App -> DB update to new@example.com

Step 3: Cache still old
Cache -> email = old@example.com

Step 4: User reads profile
Client -> App -> Cache hit -> old@example.com
```

### Timeline example

```text
T0: Cache stores profile = "old name"
T1: User updates profile to "new name"
T2: DB write succeeds
T3: Cache still contains "old name"
T4: User refreshes page
T5: Cache returns "old name"
```

### Common causes

- cache invalidation happens late
- cache update fails silently
- multiple cache layers are inconsistent
- read goes to stale replica
- asynchronous events have delay
- TTL has not expired yet

### Define TTL

**TTL (Time To Live)** means how long a cached value stays valid before expiring.

If TTL is 5 minutes, the stale value may survive for up to 5 minutes unless explicitly cleared sooner.

---

## 4. Concrete Example

Let’s use a social app profile update example.

### Scenario

Suppose:

- user profile is cached in Redis
- cache TTL is **300 seconds**
- profile page receives **20,000 reads per minute**
- profile updates happen **500 times per minute**

### Update flow

1. User changes display name from `Riya` to `Riya Sharma`
2. App writes the new name to the database
3. Cache entry `profile:123` is not invalidated because of a bug or delay
4. User refreshes profile page
5. Cache still returns `Riya`

### Numbers

Assume:

- 500 profile updates per minute
- 10% of cache invalidations are delayed or missed

That means:

$$500 \times 10\% = 50$$

So about **50 profile updates per minute** may show stale data immediately after save.

### Another example: e-commerce inventory

Suppose:

- product stock is cached for **60 seconds**
- actual stock becomes **0** after last purchase
- cache still says **1 left**
- next buyer sees stale stock and tries to buy

That can create:

- failed checkout
- oversell risk
- poor user experience

### ASCII diagram

```text
Buyer A purchases last unit
        |
        v
DB stock = 0
Cache stock = 1   (stale)
        |
        v
Buyer B reads product page
        |
        v
Sees stock = 1 and attempts checkout
```

### Another example: read replica lag

Suppose:

- write goes to primary DB
- read goes to replica DB
- replica is 2 seconds behind

The user writes a new value, then reads from the replica and still sees the old value.

This is not exactly cache, but it creates a similar **read-after-write inconsistency**.

---

## 5. Why It’s Dangerous

Stale cache problems are dangerous because the system may be fast, available, and still **wrong**.

### 5.1 Confusing user experience

The user just changed something and expects to see the new value.
Seeing the old value makes them think:

- update failed
- app is broken
- they should click save again

That can create duplicate writes too.

### 5.2 Business correctness issues

Stale reads can cause:

- wrong stock decisions
- wrong balance display
- wrong order status
- incorrect permission enforcement if old auth data is cached

### 5.3 Data races and extra writes

If users do not trust the first write, they may repeat it.
That can create:

- duplicate updates
- inconsistent audit logs
- conflicting writes

### 5.4 Hidden bugs across layers

Modern systems often have multiple caches:

- in-memory cache
- Redis
- CDN
- browser cache

One layer may be fresh while another is stale.
That makes debugging harder.

### ASCII danger loop

```text
User saves change
   -> stale read returns old data
   -> user thinks save failed
   -> user retries action
   -> more writes / more confusion
```

### Plain English summary

The danger is that **speed creates the illusion of correctness**, even when the returned value is outdated.

---

## 6. Where It Usually Comes From

### 6.1 Cache-aside pattern bugs

In the **cache-aside** pattern:

- app reads from cache first
- on miss, reads DB and fills cache
- writes update DB and then invalidate cache

If invalidation is missed, stale data remains.

### 6.2 Delayed invalidation

The app may send invalidation asynchronously.
If that event is late, old data is still served.

### 6.3 Multiple cache layers

Examples:

- local in-process cache
- Redis shared cache
- CDN edge cache
- browser cache

One layer may be updated while others are not.

### 6.4 Read replicas

A **read replica** is a copy of the main database used for reads.
If replication is delayed, recent writes are not visible there yet.

### 6.5 Eventual consistency

**Eventual consistency** means all copies should become consistent eventually, but not instantly.

That delay window is where stale reads happen.

### ASCII sources diagram

```text
Write -> Primary DB updated
      |
      +-> Cache invalidation delayed
      +-> Replica sync delayed
      +-> CDN still old
      +-> Browser cache still old
```

---

## 7. Solutions in Depth

Below are the major ways to reduce stale cache and read-after-write inconsistency.

---

### 7.1 Write-through cache

In **write-through caching**, the application writes to the cache and the database together as part of the write path.

### Before

```text
Write DB only -> cache remains old
```

### After

```text
Write DB + update cache immediately
```

### ASCII diagram

```text
Client -> App -> DB write
              -> Cache update
```

### Why it helps

- cache becomes fresh immediately after successful write

### Tradeoff

- write path becomes more complex
- cache failure handling must be designed carefully

---

### 7.2 Invalidate cache on write

This is one of the most common approaches.

After updating the database:

- delete the related cache key
- next read misses cache
- next read fetches fresh DB value and repopulates cache

### Before

```text
DB updated
Cache still old
```

### After

```text
DB updated
Cache key deleted
Next read fetches fresh value
```

### ASCII diagram

```text
Write request
   -> update DB
   -> delete cache key
   -> next read = cache miss -> DB -> refill cache
```

### Why it helps

- simple mental model
- avoids serving old value for too long

### Tradeoff

- small window may still exist
- many reads after invalidation can cause cache miss spikes

---

### 7.3 Short TTL for sensitive data

Reduce how long cached entries live.

### Before

```text
TTL = 10 minutes
stale value may survive long time
```

### After

```text
TTL = 10 seconds
stale window is much smaller
```

### Why it helps

- limits maximum staleness duration

### Tradeoff

- more cache misses
- more database load

---

### 7.4 Read-your-writes routing

For a short time after a user writes, route that user’s reads to a source guaranteed to have the latest data.

Examples:

- read from primary DB
- bypass cache briefly
- use session-based freshness token

### Before

```text
Write to primary
Immediate read goes to stale cache/replica
```

### After

```text
Write to primary
Immediate next read goes to primary or bypasses cache
```

### ASCII diagram

```text
User updates profile
      |
      v
Mark session as "fresh-read required"
      |
      v
Next profile read bypasses stale cache
```

### Why it helps

- excellent for user-facing correctness right after updates

### Tradeoff

- more complexity in routing logic
- can increase primary DB load

---

### 7.5 Versioning / timestamps

Store a version number or updated timestamp with cached data.

Example:

- DB row version = 42
- cache entry version = 41
- app detects stale cache and refreshes

### Why it helps

- lets system detect outdated cache content
- useful in distributed or multi-writer systems

### Tradeoff

- extra metadata and comparison logic needed

---

### 7.6 Event-driven invalidation

When data changes, publish an event:

- `profile_updated`
- `inventory_changed`
- `order_status_changed`

Consumers invalidate or refresh caches.

### Before

```text
Different services keep stale local caches
```

### After

```text
Update event published -> all interested caches invalidate/refresh
```

### ASCII diagram

```text
DB write -> event bus -> service A invalidates cache
                    -> service B invalidates cache
                    -> CDN purge request
```

### Why it helps

- good for multi-service systems
- spreads freshness signal to many consumers

### Tradeoff

- event delivery delay may still create short stale window
- more infrastructure complexity

---

### 7.7 Stale-while-revalidate for non-critical reads

If slightly stale data is acceptable, serve stale briefly while refreshing in background.

### Why it helps

- keeps latency low
- avoids cache stampede

### Tradeoff

- does not guarantee immediate freshness
- not suitable for highly critical reads like balance or last-seat inventory

---

## 8. Code-Level Pseudocode

### 8.1 Cache invalidation on write

```text
function updateUserProfile(userId, newProfile):
    database.update(userId, newProfile)
    cache.delete("profile:" + userId)
    return "updated"
```

### What this does

- writes latest data to DB
- removes stale cache copy
- next read will fetch fresh data

---

### 8.2 Write-through update

```text
function updateProduct(productId, newData):
    database.update(productId, newData)
    cache.set("product:" + productId, newData, ttl=60)
    return "updated"
```

### What this does

- keeps cache aligned immediately after write

---

### 8.3 Read-your-writes bypass

```text
function getProfile(userId, session):
    if session.mustReadFresh:
        value = database.readPrimary(userId)
        session.mustReadFresh = false
        return value

    cached = cache.get("profile:" + userId)
    if cached exists:
        return cached

    value = database.readReplicaOrPrimary(userId)
    cache.set("profile:" + userId, value, ttl=300)
    return value
```

### What this does

- ensures the user sees the fresh value right after their own write

---

## 9. Stale Cache vs Replica Lag vs Eventual Consistency

These are related but different.

### Stale cache

- cache has old value after source changed

### Replica lag

- read replica has not caught up to primary DB yet

### Eventual consistency

- system guarantees data copies will converge later, not instantly

### Comparison diagram

```text
Stale cache:
DB is new, cache is old

Replica lag:
Primary is new, replica is old

Eventual consistency:
Different copies become the same later, not immediately
```

### Important note

A user may not care which layer caused the stale read.
They simply see:

> “I updated it, but the old value still shows.”

---

## 10. Comparison Table

| Solution | Complexity | Freshness strength | Latency impact | Tradeoffs | Best use case |
|---|---:|---|---|---|---|
| Write-through cache | Medium | Strong | Low read latency, slightly heavier writes | More complex write path | Frequently read objects needing fresher cache |
| Invalidate on write | Low to Medium | Good | Next read may be slower due to cache miss | Small stale window, miss spikes possible | Common cache-aside systems |
| Short TTL | Low | Medium | More cache misses | Higher DB load | Moderately sensitive data |
| Read-your-writes routing | Medium to High | Very strong for same user | Can increase primary load | Routing/session complexity | User profile, settings, recent updates |
| Versioning / timestamps | Medium | Strong | Small metadata overhead | More comparison logic | Multi-service or version-aware systems |
| Event-driven invalidation | High | Good to strong | Usually low read latency | Event delay and infra complexity | Large distributed systems |
| Stale-while-revalidate | Medium | Weak for immediate freshness | Very low | Can intentionally serve stale data | Non-critical content and feeds |

### Quick summary

```text
Best simple fix:              invalidate cache on write
Best same-user correctness:   read-your-writes routing
Best multi-service approach:  event-driven invalidation
Best low-latency compromise:  stale-while-revalidate
```

---

## 11. How to Detect Stale Cache / Read-After-Write Problems

### 11.1 User reports

Typical complaints:

- “I updated my profile but old name still shows”
- “I marked it read but badge is still there”
- “Stock said available, but checkout failed”

### 11.2 Comparing DB and cache values

Inspect:

- value in DB
- value in cache
- timestamp/version in both places

### 11.3 Cache hit logs after recent writes

If recent writes are followed by cache hits serving old data, you likely have stale cache behavior.

### 11.4 Replica lag metrics

If reads come from replicas, watch replication delay.

### 11.5 Tracing cache invalidation flow

Check whether invalidation or refresh events are:

- emitted
- delivered
- processed
- delayed

### ASCII detection flow

```text
User says old value still visible
        |
        v
Check DB value
        |
        +-> DB old too? write failed or not committed
        |
        +-> DB new but cache old? stale cache
        |
        +-> DB primary new but replica old? replica lag
```

### Rule of thumb

If writes succeed but immediate reads show older state, inspect cache invalidation and read routing first.

---

## 12. Common Beginner Mistakes

### Mistake 1: Assuming TTL alone solves freshness

#### Why it backfires

TTL only limits how long stale data can survive.
It does not guarantee immediate freshness after a write.

---

### Mistake 2: Updating DB but forgetting cache invalidation

#### Why it backfires

The source of truth changes, but users keep seeing the old cached value.

---

### Mistake 3: Using stale-while-revalidate for critical data

#### Why it backfires

It is okay for feeds or thumbnails.
It is risky for:

- balances
- inventory
- permissions
- booking state

---

### Mistake 4: Ignoring replica lag while blaming only the cache

#### Why it backfires

Sometimes the cache is correct, but the replica read path is stale.
You must inspect the full read path.

---

## Final Summary

A **stale cache** means cached data is older than the real latest data.
A **read-after-write inconsistency** means a successful write is followed by a read that still returns the old value.

### Core pattern

```text
Write succeeds
   -> cache/replica not updated yet
   -> immediate read returns old value
```

### Main fixes to remember

- invalidate cache on write
- use write-through when appropriate
- shorten TTL for sensitive data
- route immediate reads to fresh source
- use versioning or event-driven invalidation in larger systems

### Beginner takeaway

Caching makes systems fast, but it can make correctness tricky.
Whenever you add a cache in front of changing data, always ask:

> After a write, how soon can I guarantee the next read sees the new value?
