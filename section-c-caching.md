# Section C: Caching

This document covers three core system design concepts from Section C of your prompt library:

1. Cache Invalidation
2. Write-through vs Write-around vs Write-back Cache
3. CDN Caching

## How to Use This for Interviews

This document is designed for both:

- **deep understanding**, and
- **clear system design interview answers**

For each topic, practice answering at four levels:

### Level 1: Definition

Can you explain the idea in plain English?

### Level 2: Failure mode

Can you explain what goes wrong if caching is designed poorly?

### Level 3: Tradeoff

Can you explain what speed benefit you gain and what correctness risk you accept?

### Level 4: Design application

Can you place the caching strategy correctly inside a real system like:

- product catalogs
- user profiles
- inventory
- payment flows
- static assets
- dashboards

## What Interviewers Usually Want

Caching questions are rarely just about “making things faster.”

Interviewers are often testing whether you understand:

- what the source of truth is
- how stale data appears
- which data can tolerate staleness
- what happens on writes
- what operational signals show cache problems

A strong answer usually does five things:

1. defines the caching pattern simply
2. explains the performance goal
3. explains the freshness risk
4. gives one realistic example
5. explains how to detect and control failure modes

---

# 1. Cache Invalidation

**TL;DR:** Cache invalidation is the process of updating or removing cached data when the source of truth changes, so the system does not keep serving old values for too long.

## What is Cache Invalidation?

A **cache** is a faster temporary storage layer that keeps copies of data to reduce repeated work.

**Cache invalidation** means making sure that when the real data changes, the cached copy does not stay wrong.

In plain English:

- the database or source data changes
- the cache may still hold the old value
- invalidation removes or refreshes that old cached value

### Analogy

Imagine a school notice board that copies the official class schedule from the administration office.

If the official schedule changes but the notice board is not updated, students keep reading the wrong time.

Cache invalidation is the process of replacing or removing the outdated notice.

## Why It Is Hard

Caching is easy when data never changes.

Caching becomes hard when:

- many services read the same value
- writes happen in different places
- multiple cache layers exist
- timing and failures make updates incomplete

The classic problem is:

- source of truth changed
- cache did not change at the same moment
- users keep seeing stale data

### Why this is tricky

The cache is usually there because the database is expensive or slow.

But if the cache is wrong, the system is fast and incorrect.

That is why cache invalidation is one of the most famous “hard problems” in software engineering.

## How It Works

There are several common ways to invalidate or refresh cache entries.

### 1. Delete on write

When data changes in the database:

- write new value to DB
- delete the cache key
- next read fetches fresh data from DB and repopulates cache

### 2. Update on write

When data changes:

- write to DB
- also write the new value into cache

### 3. TTL expiry

**TTL** means **time to live**.

The cache key expires automatically after some time.

### 4. Event-based invalidation

When data changes:

- publish an event
- interested services or cache workers invalidate relevant keys

### ASCII flow

```text
Write request
    |
    v
Database updated
    |
    +--> delete cache key
    |
    +--> or update cache value
    |
    +--> or publish invalidation event

Next read:
cache miss -> DB -> repopulate cache
```

## Concrete Example

Suppose an e-commerce product page caches product details for **10 minutes**.

Cached value:

- product price = $100

Then the seller updates the price to **$80** in the database.

### If cache is not invalidated

For up to 10 minutes, users may still see:

- cached price = $100

while DB says:

- actual price = $80

### If cache is deleted on write

Flow:

1. update DB price to $80
2. delete key `product:123`
3. next reader gets a cache miss
4. app fetches $80 from DB
5. cache is repopulated with $80

### Stale window example

Suppose:

- TTL = 600 seconds
- invalidation event failed
- DB updated at 10:00:00

Then users may see stale data until 10:10:00 unless another mechanism corrects it.

## Common Invalidation Strategies

### 1. Cache-aside

The app reads from cache first.

On miss:

- app reads from DB
- app fills cache

On write:

- app writes to DB
- app invalidates cache

#### Good

- simple and common
- cache only fills for hot data

#### Bad

- stale reads possible if invalidation is missed
- first request after miss pays DB cost

### 2. Write-through

Writes go through the cache layer, which also updates the DB.

#### Good

- cache and DB stay closer together
- readers often see fresh cache values

#### Bad

- write path becomes slower or more complex
- cache infrastructure becomes more central to correctness

### 3. Write-around

Writes go directly to DB and skip cache.

Cache fills only on later reads.

#### Good

- avoids polluting cache with write-only values

#### Bad

- first read after write may miss cache
- stale value must still be invalidated if it already exists

### 4. Write-back

Writes go to cache first and DB later.

#### Good

- very fast writes

#### Bad

- high durability risk if cache fails before DB flush
- dangerous for critical business data

### 5. Event-driven invalidation

Data change emits an event that tells other caches to invalidate related keys.

#### Good

- works well across multiple services
- useful when many caches depend on one source change

#### Bad

- event delivery failures can leave stale entries behind
- requires careful observability

## Tradeoffs

Caching is always a tradeoff between:

- speed
- freshness
- complexity
- operational safety

### Key tension

The more aggressive your caching is, the more important invalidation becomes.

### Examples

- short TTL -> fresher, but more DB traffic
- long TTL -> faster, but staler
- delete on write -> simpler, but miss storm possible
- update on write -> fresher, but more write complexity

## Code-Level Pseudocode

### Example 1: Cache delete on write

```text
function updateUserProfile(userId, newProfile):
    db.write(userId, newProfile)
    cache.delete("user:" + userId)
    return success

function getUserProfile(userId):
    value = cache.get("user:" + userId)
    if value != null:
        return value

    value = db.read(userId)
    cache.set("user:" + userId, value, ttl=300)
    return value
```

### Example 2: Write-through style update

```text
function updateProduct(productId, newValue):
    cache.set("product:" + productId, newValue, ttl=600)
    db.write(productId, newValue)
    return success
```

### Example 3: Event-driven invalidation

```text
function updateInventory(productId, newStock):
    db.write(productId, newStock)
    eventBus.publish({
        type: "INVENTORY_UPDATED",
        productId: productId
    })

consumer on INVENTORY_UPDATED:
    cache.delete("inventory:" + event.productId)
    cache.delete("product_page:" + event.productId)
```

## Cache Invalidation vs Cache Expiry vs Stale Cache

| Concept | Meaning |
| --- | --- |
| Cache invalidation | actively removing or updating old cached data |
| Cache expiry | automatic time-based removal using TTL |
| Stale cache | cache serving old data after source changed |

### Important distinction

TTL expiry is one possible mechanism, but it is not the same as full invalidation strategy.

If you rely only on TTL, stale data may persist until the timer ends.

## Comparison Table

| Strategy | Freshness | Complexity | Write cost | Read performance | Best use case |
| --- | --- | --- | --- | --- | --- |
| Cache-aside + delete | Medium to high | Medium | Low to medium | High | common app reads |
| Update on write | High | Medium | Medium | High | values that must stay fresh |
| TTL-only | Low to medium | Low | Low | High | low-risk cached values |
| Event-driven invalidation | High if reliable | High | Medium | High | multi-service systems |

## How to Detect Problems

### Signals

- users report “I updated it but still see old data”
- cache value differs from DB value
- stale reads cluster around write-heavy actions
- invalidation event consumers fall behind
- cache hit ratio looks healthy but correctness complaints increase

### Useful metrics

- cache hit ratio
- cache miss ratio
- stale-read complaint rate
- invalidation event lag
- cache/DB mismatch rate from sampling
- TTL distribution by key type

## Common Beginner Mistakes

- relying only on TTL for correctness-sensitive data
- invalidating too late after DB writes
- forgetting there may be multiple cache layers
- updating DB but not deleting the old cache key
- assuming cache hit ratio alone means the cache is healthy
- using stale-while-revalidate on critical values without caution

## Interview Framing

Cache invalidation is a strong interview topic because it tests whether you understand that performance is useless if the data becomes misleading.

A strong answer usually includes:

- the source of truth
- the stale-read risk
- one or two invalidation strategies
- tradeoffs between TTL and write-driven invalidation
- operational detection ideas

## Interview Questions You May Get

### Q1. Why is cache invalidation hard?

Because the cache and the database are separate places holding copies of the same logical data, and they do not automatically stay in sync under failures or timing gaps.

### Q2. Is TTL enough?

Only for low-risk data or when some staleness is acceptable. TTL alone is usually too weak for correctness-sensitive values.

### Q3. What would you cache carefully or avoid caching?

Examples:

- account balances
- inventory during checkout
- authorization decisions
- payment status at the final confirmation step

## Strong Interview Answer Pattern

```text
I would treat the database as the source of truth and choose a cache invalidation strategy
based on how costly stale reads are. For many read-heavy cases, cache-aside with delete-on-write
works well. For more freshness-sensitive data, I would use update-on-write or event-driven
invalidation, and I would monitor for cache/DB divergence rather than only hit ratio.
```

## Red Flags in Interviews

- saying “just add Redis” with no write-path design
- relying only on TTL for critical values
- focusing only on speed and not freshness
- forgetting multi-layer caches such as app cache plus CDN plus browser cache
- not discussing observability

---

# 2. Write-through vs Write-around vs Write-back Cache

**TL;DR:** These write strategies define what happens to cache and database when data is written, and each one trades off write speed, freshness, and durability differently.

## What Are These Cache Write Strategies?

These strategies answer one important question:

> When a write happens, what should update first: the cache, the database, or both?

In plain English:

- **write-through** updates cache and database together
- **write-around** updates database and skips cache on the write path
- **write-back** writes to cache first and delays the database write

### Analogy

Imagine an office with:

- a fast desk notebook
- a slower official company register

The write strategy decides:

- write in both immediately
- write only in official register first
- write in notebook now and copy to register later

## Write-through Cache

In write-through:

- app writes data to cache layer
- cache layer also writes data to DB
- both are updated in the same logical flow

### ASCII flow

```text
App write
   |
   v
Cache layer
   |
   +--> Cache updated
   |
   +--> DB updated
```

### Pros

- cache usually stays fresh after writes
- read-after-write experience is better
- simpler for readers because cache often has latest value

### Cons

- write latency can be higher than cache-only write
- every write may touch cache even if value is rarely read later
- cache path becomes part of correctness design

## Write-around Cache

In write-around:

- app writes directly to DB
- cache is skipped on write
- future reads may populate cache later

### ASCII flow

```text
App write
   |
   v
Database updated
   |
   v
Cache unchanged until a later read miss
```

### Pros

- avoids filling cache with values that may never be read
- simpler write path in many cases
- useful for write-heavy workloads with low reread frequency

### Cons

- first read after write may be slower
- if old cache entry exists and is not invalidated, stale reads remain possible
- less helpful for read-after-write freshness

## Write-back Cache

In write-back:

- app writes to cache first
- DB update happens later asynchronously

### ASCII flow

```text
App write
   |
   v
Cache updated immediately
   |
   v
Flush to DB later
```

### Pros

- fastest write path
- can absorb bursts efficiently
- useful for heavy write buffering in some systems

### Cons

- crash before DB flush can lose data
- DB may lag behind cache
- harder recovery logic
- usually dangerous for critical business records

## Concrete Example

Consider a product catalog service.

Traffic pattern:

- 500 writes per minute
- 100,000 reads per minute

### Write-through fit

Good if product updates must appear quickly for readers and write volume is manageable.

### Write-around fit

Good if many products are updated in bulk but only a small subset gets read often.

### Write-back fit

Potentially useful for buffering high-volume, lower-risk writes such as non-critical analytics counters, but risky for pricing or inventory.

## When to Use Each

### Use write-through when

- freshness matters soon after write
- read-after-write experience matters
- write volume is not extreme
- you want cache warm immediately

### Use write-around when

- writes are frequent but rereads are limited
- you want to avoid polluting the cache
- stale values are controlled with explicit invalidation

### Use write-back when

- ultra-fast writes matter more than immediate DB durability
- delayed flush is acceptable
- data loss risk is acceptable or heavily mitigated

## Code-Level Pseudocode

### Example 1: Write-through

```text
function updateProfile(userId, profile):
    cache.set("profile:" + userId, profile, ttl=300)
    db.write(userId, profile)
    return success
```

### Example 2: Write-around

```text
function updateCatalog(productId, value):
    db.write(productId, value)
    cache.delete("catalog:" + productId)
    return success
```

### Example 3: Write-back

```text
function incrementCounter(key):
    cache.increment(key)
    buffer.markDirty(key)

background worker:
    for key in buffer.dirtyKeys():
        db.write(key, cache.get(key))
        buffer.clearDirty(key)
```

## Comparison Table

| Strategy | Write latency | Read freshness | Durability risk | Cache pollution risk | Best use case |
| --- | --- | --- | --- | --- | --- |
| Write-through | Medium | High | Low | Medium | read-heavy values that should stay fresh |
| Write-around | Low to medium | Medium | Low | Low | write-heavy, low-reread workloads |
| Write-back | Low | Medium to high in cache, lower in DB | High | Medium | buffered, non-critical high-write paths |

## How to Detect Problems

### Signals

- DB and cache values diverge
- write-back buffer grows too large
- crash causes lost recent writes
- first-read latency after writes becomes high
- stale reads increase after write-around flows

### Useful metrics

- dirty buffer size
- flush lag to DB
- cache/DB mismatch count
- read-after-write latency
- write failure rate by strategy

## Common Beginner Mistakes

- using write-back for critical money or inventory data
- assuming write-through guarantees perfect freshness across all layers
- forgetting to invalidate old cached values in write-around flows
- choosing strategy without looking at actual read/write ratio
- ignoring crash recovery for delayed flush paths

## Interview Framing

This topic is great for interviews because it shows whether you can map a cache strategy to workload shape instead of memorizing names.

A strong answer usually includes:

- the write flow
- the main benefit
- the main failure mode
- the workload type it fits
- the kind of data it should not handle

## Interview Questions You May Get

### Q1. Which strategy is safest?

Usually write-through or DB-first plus explicit invalidation is safer than write-back for correctness-sensitive data.

### Q2. Which strategy is fastest for writes?

Write-back is typically fastest on the write path, but it accepts more durability and consistency risk.

### Q3. Why not use write-back for payments or stock?

Because if the cache or buffer fails before the DB is updated, recent acknowledged writes may be lost or delayed in unsafe ways.

## Strong Interview Answer Pattern

```text
I would choose the cache write strategy based on the workload and correctness needs.
For freshness-sensitive read-heavy data, write-through can work well.
For write-heavy workloads that are not reread often, write-around avoids polluting the cache.
I would be very cautious with write-back, because although it gives fast writes,
it creates durability and recovery risks that are often unacceptable for critical data.
```

## Red Flags in Interviews

- recommending write-back casually for critical state
- ignoring the database as source of truth
- describing write-through as “always best”
- not relating the strategy to workload shape
- not mentioning crash or flush failure risk

---

# 3. CDN Caching

**TL;DR:** CDN caching stores content at edge locations closer to users to reduce latency and origin load, but it introduces global invalidation and freshness tradeoffs.

## What is CDN Caching?

A **CDN** or **content delivery network** is a globally distributed network of edge servers that store copies of content closer to users.

**CDN caching** means those edge servers keep cached copies of assets or cacheable responses so users do not always need to contact the origin server.

In plain English:

- user requests a file or response
- nearby edge server may already have it
- if yes, the CDN serves it quickly
- if not, the CDN fetches it from origin and may cache it

### Analogy

Imagine a publisher storing copies of a popular textbook in city libraries around the world instead of forcing every student to request it from one central warehouse.

That is the main idea of CDN caching.

## What is a CDN?

A CDN is a distributed layer between users and the origin system.

It commonly helps with:

- images
- CSS and JavaScript files
- videos
- downloadable files
- sometimes public API responses

### Main terms

- **origin**: the original server or storage system
- **edge**: a geographically distributed CDN location
- **cache hit**: CDN already has the content
- **cache miss**: CDN must fetch from origin
- **purge**: explicit removal of cached content

## How CDN Caching Works

### Step by step

1. User requests an asset.
2. Request goes to a nearby CDN edge.
3. If the edge has a fresh cached copy, it serves it.
4. If not, the edge requests the content from origin.
5. Edge returns the content to the user.
6. Edge stores the content for future nearby requests.

### ASCII flow

```text
User
  |
  v
CDN Edge
  |
  +--> cache hit -> serve immediately
  |
  +--> cache miss -> fetch from Origin -> cache -> serve
```

## Concrete Example

Suppose a global storefront serves:

- product images
- JS bundles
- CSS
- public product detail JSON

Without CDN:

- all users hit the origin region
- average asset latency may be 300 ms to 800 ms globally
- origin handles every request

With CDN:

- edge serves nearby users
- asset latency may drop to 30 ms to 100 ms in many regions
- origin requests may drop by 70% to 95% for hot static assets

### Example numbers

A JS bundle requested 10 million times per day:

- without CDN: origin sees 10 million requests
- with 95% CDN hit ratio: origin sees only 500,000 requests

That is a huge infrastructure difference.

## Why It Matters

CDN caching matters because it improves both:

### 1. User latency

Content is served closer to the user.

### 2. Origin protection

The CDN absorbs much of the read traffic.

### 3. Global scaling

One origin can support many more users when the CDN handles popular assets.

### 4. Burst handling

Large spikes such as product launches or live event traffic become easier to absorb.

## Common Problems

### 1. Stale content

An edge may still serve an old version after the origin changed.

### 2. Cache purge delay

Invalidation may not be instant in every region.

### 3. Regional inconsistency

Different edges may briefly have different versions.

### 4. Cache bypass bugs

Headers or query strings may prevent content from being cached as expected.

### 5. Personalization mistakes

Caching personalized responses publicly can leak user-specific data.

## Code-Level / Config Examples

### Example 1: Static asset caching header

```text
Cache-Control: public, max-age=31536000, immutable
```

This is common for versioned assets like:

- `app.4f82a.js`
- `styles.88bc1.css`

### Example 2: Public API caching header

```text
Cache-Control: public, max-age=60, stale-while-revalidate=30
```

This allows:

- 60 seconds of freshness
- short stale serving while background refresh happens

### Example 3: No-store for sensitive content

```text
Cache-Control: no-store
```

Useful for:

- account pages
- private payment responses
- personalized confidential data

## CDN Cache vs App Cache vs Browser Cache

| Layer | Where it lives | Common purpose |
| --- | --- | --- |
| CDN cache | edge network | global acceleration and origin offload |
| App cache | service or Redis layer | database offload and app read speed |
| Browser cache | end user device | repeated client-side reuse |

### Important distinction

These layers can all exist at the same time.

A stale response may come from:

- browser cache
- CDN edge
- app cache
- DB replica

A strong engineer does not assume there is only one cache.

## Comparison Table

| Factor | CDN Cache | App Cache | Browser Cache |
| --- | --- | --- | --- |
| Main benefit | global speed | backend speed | local repeat speed |
| Best data type | static/public content | app data | repeated client assets |
| Invalidation difficulty | medium to high | medium | medium |
| Personalization safety | low unless carefully controlled | higher with app logic | user-local |
| Origin offload impact | very high | medium to high | medium |

## How to Detect Problems

### Signals

- cache hit ratio falls suddenly
- origin traffic spikes unexpectedly
- users in one region report stale assets
- purge requests succeed but old content persists briefly
- personalized content appears cached publicly

### Useful metrics

- CDN hit ratio by path
- origin request rate
- latency by region
- purge completion time
- cache status header counts
- bytes served from edge vs origin

## Common Beginner Mistakes

- caching personalized content publicly
- not versioning static assets
- choosing bad TTLs for dynamic content
- assuming purge is instant everywhere
- forgetting browser caching behavior while debugging
- using the same headers for CSS bundles and private API responses

## Interview Framing

CDN caching is an interview favorite because it tests whether you understand caching beyond the application server.

A strong answer usually includes:

- what content belongs at the CDN
- how cache headers control behavior
- how invalidation works
- what should never be publicly cached
- how CDN and origin interact during misses

## Interview Questions You May Get

### Q1. What content is best for CDN caching?

Good examples:

- images
- CSS and JS bundles
- videos
- downloads
- public product pages or public API responses with controlled TTLs

### Q2. What should you avoid caching publicly?

Good examples:

- account-specific pages
- personalized dashboards
- payment responses
- private tokens or authorization responses

### Q3. Why version static assets?

Because versioning makes invalidation much easier. Instead of purging every edge perfectly, the app can reference a new filename and treat it as new content.

## Strong Interview Answer Pattern

```text
I would use CDN caching for static and public content to reduce global latency and protect the origin.
I would rely heavily on cache headers and asset versioning, because invalidating content globally can be imperfect.
For personalized or sensitive responses, I would avoid public caching entirely or use very strict cache controls.
```

## Red Flags in Interviews

- saying “cache everything at the CDN”
- forgetting that cache keys depend on URL, headers, and sometimes query strings
- not distinguishing public from personalized content
- assuming purge is instant and globally synchronized
- ignoring browser cache when debugging stale content

---

# Interview Cheat Sheet for Section C

## 1-minute Comparison View

| Topic | Core problem | Main benefit | Main risk | Common mitigation |
| --- | --- | --- | --- | --- |
| Cache Invalidation | cached copy differs from source of truth | fast reads | stale data | delete/update on write, event invalidation, TTL tuning |
| Write Strategy Choice | write path between cache and DB | speed or freshness optimization | lost freshness or durability | choose by workload, protect source of truth |
| CDN Caching | global content delivery | low latency, origin offload | stale or wrongly public content | versioning, good headers, careful cache rules |

## Quick “When I’d Use It” Lines

### Cache invalidation

“I’d use explicit invalidation when stale reads matter, and I’d avoid relying only on TTL for correctness-sensitive data.”

### Write-through / around / back

“I’d choose the write strategy based on read/write ratio, freshness needs, and durability risk.”

### CDN caching

“I’d use CDN caching for static and public content, while keeping personalized or sensitive responses out of public edge caches.”

## Common Cross-Cutting Interview Theme

All three topics test a deeper skill:

### Can you make systems fast without lying to users?

A strong candidate does not just say:

- add Redis
- add TTL
- add CDN

A strong candidate says:

- what data is cacheable
- how writes affect cached state
- how stale data is bounded
- what correctness risks are acceptable
- how to observe when the cache is wrong

---

# Final Summary

Section C focuses on one of the most important realities in system design:

> caching is not just a performance feature, it is a correctness tradeoff.

These three topics connect tightly:

- **Cache invalidation** controls freshness after writes
- **Write-through / write-around / write-back** define the write path tradeoff between speed and safety
- **CDN caching** extends caching to the network edge for global performance

In interviews, the strongest answers keep returning to three questions:

1. **What is the source of truth?**
2. **How stale can this data safely be?**
3. **What happens when the cache is wrong or incomplete?**

## Suggested Next Step

After Section C, the most natural continuation is **Section D: Messaging / Async Systems**, especially:

1. Delivery Semantics
2. Message Ordering Problems
3. Outbox Pattern
4. Consumer Lag
