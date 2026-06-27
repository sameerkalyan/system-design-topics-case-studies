# Section B: Scaling / Traffic Distribution

This document covers three core system design concepts from Section B of your prompt library:

1. Consistent Hashing
2. Sharding / Partitioning Strategies
3. Replication

## How to Use This for Interviews

This document is designed for both:

- **learning the concepts deeply**, and
- **answering system design interview questions clearly**

For each topic, practice explaining it at four levels:

### Level 1: Definition

Can you explain what it is in plain English?

### Level 2: Problem it solves

Can you explain what breaks without it?

### Level 3: Tradeoff

Can you explain the cost of using it?

### Level 4: Real system usage

Can you place it correctly inside systems like:

- caches
- databases
- storage systems
- user feeds
- product catalogs
- global applications

## What Interviewers Usually Want

In Section B topics, interviewers are often testing whether you understand:

- how systems grow beyond one machine
- how requests get routed
- how data gets distributed
- how failures affect correctness and availability
- how scaling decisions create operational tradeoffs

A strong answer usually does five things:

1. define the concept simply
2. explain the scaling problem it solves
3. give one realistic example
4. explain one or two major tradeoffs
5. describe when you would and would not use it

---

# 1. Consistent Hashing

**TL;DR:** Consistent hashing is a way to distribute keys across servers so that when servers are added or removed, only a small portion of keys need to move.

## What is Consistent Hashing?

Consistent hashing is a routing technique used in distributed systems.

It helps answer this question:

> Given a key like `user:123`, `product:99`, or `session:abc`, which server should handle it?

In plain English:

- data keys are mapped to servers
- the mapping is designed so cluster changes do not reshuffle everything
- when a server joins or leaves, only nearby keys move

### Analogy

Imagine books placed on shelves arranged in a circle.

Each book title is assigned a position on the circle. Each shelf also occupies positions on that circle.

A book belongs to the next shelf clockwise.

If you add one new shelf, only the books near that shelf move. You do **not** need to reorganize the whole library.

That is the main benefit of consistent hashing.

## Why Normal Hashing Causes Problems

A common beginner approach is:

```text
serverIndex = hash(key) % numberOfServers
```

This is called **modulo hashing**.

It looks simple, but it has a big weakness.

If the number of servers changes, the modulo changes too.

That means many or most keys map to new servers.

### Example

Suppose there are 4 cache nodes:

```text
hash(user:42) % 4 = 1
```

Now add a 5th node:

```text
hash(user:42) % 5 = 3
```

Suddenly the same key may move to a different node.

When this happens for millions of keys:

- caches miss heavily
- databases get hammered by refill traffic
- rebalance events become painful

### ASCII comparison

```text
Modulo hashing with 4 nodes:
key -> hash(key) % 4 -> node

Modulo hashing with 5 nodes:
key -> hash(key) % 5 -> different node for many keys

Problem:
Adding 1 node can remap a huge fraction of keys.
```

## How Consistent Hashing Works

Consistent hashing places both:

- **keys**, and
- **nodes**

on a logical circular space called a **hash ring**.

### Step by step

1. Hash each node to positions on a ring.
2. Hash each key to a position on the same ring.
3. Move clockwise from the key position.
4. The first node you encounter owns that key.
5. If a node is removed, its keys move to the next node clockwise.
6. If a node is added, it only steals a subset of keys from its neighbor.

### ASCII diagram

```text
                 [Node C]
                    |
                    v
          key3 --> ( )
        /             \
       /               \
[Node B]               [Node D]
       \               /
        \             /
          ( ) <-- key1
            ^
            |
         [Node A]
              \
               key2

Each key goes to the next node clockwise.
```

## Concrete Example

Suppose a distributed cache has **4 nodes** and **10 million keys**.

### With modulo hashing

When cluster size changes from 4 to 5 nodes, a very large fraction of keys may move.

In rough terms, most keys may get remapped because the divisor changed.

This can cause:

- cache hit ratio drop from 95% to 40%
- DB read surge
- latency spike

### With consistent hashing

When a 5th node is added:

- only the key ranges near that node move
- maybe around 20% of keys move instead of nearly everything
- the cache warms incrementally instead of catastrophically

This is why consistent hashing is common in:

- Redis-like distributed caches
- Memcached clusters
- distributed storage systems
- request routing systems

## Why It Matters

Consistent hashing matters because it reduces **reshuffling cost**.

### Without it

Scaling events are disruptive.

### With it

Scaling becomes operationally safer.

This is especially important when:

- cache warmup is expensive
- data movement is large
- request latency is sensitive
- node failures happen regularly

## Virtual Nodes

A **virtual node** or **vnode** means one physical server is placed on the ring multiple times.

Why do this?

Because if each physical node appears only once, distribution may be uneven.

One node may accidentally own too much of the ring.

### Example

Without virtual nodes:

- Node A owns 10%
- Node B owns 15%
- Node C owns 50%
- Node D owns 25%

That is unbalanced.

With many virtual nodes per machine:

- ownership becomes much more even
- load spreads better
- failure impact becomes smoother

### ASCII idea

```text
Without vnodes:
[A]-----------------[B]----[C]---------------------------[D]

With vnodes:
[A1]-[C1]-[B1]-[D1]-[A2]-[C2]-[B2]-[D2]-[A3]-[C3]-[B3]-[D3]
```

## Code-Level Pseudocode

### Example 1: Key-to-node mapping

```text
function getNodeForKey(key, sortedRingPositions):
    keyHash = hash(key)

    for entry in sortedRingPositions:
        if entry.position >= keyHash:
            return entry.node

    return sortedRingPositions[0].node
```

### Example 2: Adding a node to the ring

```text
function addNode(nodeId, vnodeCount):
    for i in range(0, vnodeCount):
        position = hash(nodeId + ":" + i)
        ring.insert(position, nodeId)

    ring.sortByPosition()
```

### Example 3: Replication on the ring

```text
function getReplicaNodes(key, replicationFactor):
    owner = getNodeForKey(key, ring)
    return nextNUniqueClockwiseNodes(owner, replicationFactor)
```

## Consistent Hashing vs Modulo Hashing vs Directory-Based Routing

| Approach | How it works | Strength | Weakness |
| --- | --- | --- | --- |
| Modulo hashing | `hash(key) % N` | simple | huge remapping when `N` changes |
| Consistent hashing | ring-based ownership | low rebalance cost | more implementation complexity |
| Directory-based routing | lookup table says where data lives | flexible control | metadata service must be maintained |

### Important idea

Consistent hashing is best when you want decentralized, low-reshuffle routing.

Directory-based routing is often better when you want full control over placement.

## Comparison Table

| Factor | Modulo Hashing | Consistent Hashing | Directory-Based Routing |
| --- | --- | --- | --- |
| Simplicity | High | Medium | Medium |
| Key movement on scale change | High | Low | Controlled |
| Operational flexibility | Low | Medium | High |
| Metadata dependency | Low | Low | High |
| Skew handling | Low | Medium with vnodes | High |
| Common use cases | tiny systems | caches, distributed storage | advanced sharded systems |

## How to Detect Problems

### Signals

- uneven node CPU or memory usage
- uneven cache hit ratios per node
- spikes in key remapping after node changes
- high DB refill load after cache cluster resize
- hot partitions or hot keys

### Useful metrics

- percentage of keys per node
- request rate per node
- cache hit ratio per node
- rebalance duration
- data movement volume after scaling event

## Common Beginner Mistakes

- assuming plain modulo hashing is enough at scale
- not using virtual nodes
- ignoring hot keys
- assuming even key count means even traffic
- forgetting that key size and request rate also matter
- thinking consistent hashing solves every balancing problem automatically

## Interview Framing

Consistent hashing is a common interview topic because it tests whether you understand that scaling is not only about adding nodes, but also about **minimizing disruption when the cluster changes**.

A strong answer usually includes:

- why modulo hashing fails during scaling
- the ring idea
- why only a subset of keys move
- why virtual nodes improve balance
- at least one practical use case such as cache clusters

## Interview Questions You May Get

### Q1. Why not just use `hash(key) % N`?

Because when `N` changes, a large portion of keys remap, causing major cache churn or data movement.

### Q2. Why are virtual nodes important?

They smooth out uneven placement and help distribute load more fairly across physical machines.

### Q3. Does consistent hashing solve hot key problems?

Not by itself.

If one key gets enormous traffic, that one key can still overload a node. You may need:

- key replication
- request coalescing
- local caching
- application-specific sharding for hot keys

## Strong Interview Answer Pattern

```text
I would use consistent hashing when I need stable key-to-node mapping under cluster changes,
especially for distributed caches or storage routing. The main benefit is that adding or removing
nodes only remaps a small portion of keys, unlike modulo hashing. I would also use virtual nodes
to improve balance, because otherwise physical node ownership can become uneven.
```

## Red Flags in Interviews

- explaining only the ring but not the scaling benefit
- forgetting virtual nodes
- claiming it guarantees perfect balance
- ignoring hot key behavior
- using it where centralized routing metadata would be simpler and more controllable

---

# 2. Sharding / Partitioning Strategies

**TL;DR:** Sharding splits a large dataset across multiple machines so storage and traffic can scale horizontally, but the shard key choice determines whether the system remains balanced and queryable.

## What is Sharding?

**Sharding** means splitting one logical dataset into smaller pieces called **shards**.

Each shard lives on a different database or machine.

In plain English:

- one database is no longer enough
- so data is divided across many databases
- the application chooses which shard owns each record

### Analogy

Imagine a giant library that no longer fits in one building.

So the city opens multiple branches.

Now the books are distributed across branches using a rule such as:

- branch by author surname
- branch by subject
- branch by geography

That rule is like the **shard key**.

## Why Systems Shard

Systems shard because a single database can hit limits in:

- storage capacity
- CPU
- disk IO
- memory
- write throughput
- read throughput

At some point, vertical scaling becomes expensive or insufficient.

**Horizontal scaling** means adding more machines instead of making one machine bigger.

Sharding is one of the main ways databases scale horizontally.

## How It Works

A request arrives for a record such as a user or order.

The system uses a **shard key** to decide where that record should live.

### Step by step

1. Choose a shard key, such as `user_id`.
2. Apply routing logic.
3. Send the query to the correct shard.
4. Read or write the record there.
5. If a query spans many shards, the system may need to fan out to multiple shards.

### ASCII diagram

```text
                 +-------------------+
Request -------->| Shard Router      |
                 +-------------------+
                    |       |      |
                    v       v      v
                 Shard1  Shard2  Shard3
```

## Concrete Example

Suppose an `orders` table has **400 million rows**.

One database server can no longer handle:

- 40 TB storage growth
- write spikes during sales
- read traffic from many regions

So the company creates **4 shards**.

### Hash-based example

```text
shard = hash(user_id) % 4
```

Now:

- users with shard result 0 go to shard 0
- result 1 go to shard 1
- result 2 go to shard 2
- result 3 go to shard 3

If there are 100 million users, each shard may hold roughly 25 million users.

### Growth problem

If shard 2 gets many “heavy” users, equal row count may still produce unequal traffic.

That is an important real-world issue.

## Partitioning Strategies

### 1. Hash-based partitioning

Use a hash of the shard key.

#### Good

- usually spreads data evenly
- simple routing
- good for point lookups

#### Bad

- range queries are hard
- resharding can be painful
- hot keys can still exist

### 2. Range-based partitioning

Split data by ranges.

Example:

- user IDs 1 to 10 million -> shard A
- 10 million to 20 million -> shard B

Or by dates:

- January orders -> shard A
- February orders -> shard B

#### Good

- range scans are efficient
- easy to reason about

#### Bad

- hotspots can form if new writes always go to the latest range
- uneven growth is common

### 3. Directory-based partitioning

A metadata service tracks where each partition lives.

Example:

```text
customer_europe -> shard 7
customer_us_west -> shard 2
premium_accounts -> shard 9
```

#### Good

- flexible placement
- easier live rebalancing
- useful for complex business rules

#### Bad

- requires metadata management
- router becomes more complex
- metadata service must be reliable

### 4. Geo-based partitioning

Data is split by region.

Example:

- Europe users -> EU cluster
- India users -> India cluster
- US users -> US cluster

#### Good

- lower latency
- supports data residency rules
- reduces cross-region traffic

#### Bad

- cross-region queries become harder
- global users complicate routing
- rehoming users across regions can be expensive

## Tradeoffs of Each Strategy

### ASCII view

```text
Hash-based:
Good balance, weak range locality

Range-based:
Good range locality, hotspot risk

Directory-based:
Flexible, but operationally heavier

Geo-based:
Great regional fit, hard global queries
```

## Code-Level Pseudocode

### Example 1: Hash-based routing

```text
function getShardForUser(userId, shardCount):
    return hash(userId) % shardCount
```

### Example 2: Range-based routing

```text
function getShardForOrder(orderCreatedAt):
    if orderCreatedAt < "2026-01-01":
        return "archive_shard"
    if orderCreatedAt < "2026-07-01":
        return "shard_a"
    return "shard_b"
```

### Example 3: Directory-based routing

```text
function getShardForTenant(tenantId):
    mapping = metadataStore.lookup(tenantId)
    return mapping.shardId
```

## Sharding vs Replication vs Hot Partition

| Concept | Main purpose | What it adds |
| --- | --- | --- |
| Sharding | split data across machines | horizontal capacity and throughput |
| Replication | copy data to other machines | availability and read scaling |
| Hot partition | overloaded shard or partition | a failure/scaling problem, not a strategy |

### Important distinction

Many beginners confuse **sharding** and **replication**.

- Sharding divides data.
- Replication copies data.

A system can use both at the same time.

## Comparison Table

| Strategy | Balance | Range query support | Rebalance difficulty | Hotspot risk | Best use case |
| --- | --- | --- | --- | --- | --- |
| Hash-based | Good | Poor | Medium | Medium | large point-lookup workloads |
| Range-based | Variable | Strong | Medium | High on active ranges | time-based data, ordered scans |
| Directory-based | Controlled | Depends on mapping | Lower if metadata is good | Medium | multi-tenant or custom placement |
| Geo-based | Regional | Weak globally | High | Regional hotspot risk | global products with locality requirements |

## How to Detect Problems

### Signals

- one shard much larger than others
- one shard serving much higher QPS
- one shard showing worse latency
- cross-shard queries becoming common and slow
- resharding events becoming painful

### Useful metrics

- rows per shard
- bytes stored per shard
- QPS per shard
- p95/p99 latency per shard
- CPU and disk IO per shard
- number of fanout queries

## Common Beginner Mistakes

- choosing a bad shard key
- optimizing only for current traffic, not future growth
- confusing equal record count with equal load
- designing queries that require cross-shard joins everywhere
- assuming resharding later will be easy
- sharding too early before simpler scaling steps are exhausted

## Interview Framing

Sharding is one of the most important system design topics because it sits at the intersection of:

- storage scaling
- traffic routing
- query design
- operational complexity

A strong answer is not just “split the DB.”

A strong answer explains:

- what the shard key is
- why that key matches the access pattern
- what happens for hot tenants or hot ranges
- how cross-shard queries are handled
- how the system might rebalance later

## Interview Questions You May Get

### Q1. How do you choose a shard key?

A strong answer:

- based on dominant access patterns
- with awareness of write distribution
- with awareness of future growth
- with attention to hotspot risk

### Q2. What makes a shard key bad?

Examples:

- very low cardinality
- strong traffic skew
- all new writes hitting one partition
- frequent queries that need many shards at once

### Q3. What if one shard becomes too hot?

Possible answers:

- split the hot shard
- change routing for heavy tenants
- use directory-based reassignment
- isolate large customers
- add caching
- redesign the shard key if needed

## Strong Interview Answer Pattern

```text
I would shard only when a single database can no longer meet storage or throughput needs.
The key design decision is the shard key, because it determines balance, routing simplicity,
and query behavior. For point lookups, hash-based sharding often works well. For range-heavy
workloads, range partitioning may be better, but I would watch for hotspot risk. I would also
plan early for how I will detect skew and handle resharding.
```

## Red Flags in Interviews

- saying “just shard by user_id” with no access-pattern reasoning
- ignoring cross-shard joins and aggregations
- not distinguishing storage balance from traffic balance
- choosing range partitioning without discussing hot newest partitions
- assuming resharding is a trivial future task

---

# 3. Replication

**TL;DR:** Replication keeps multiple copies of data on different machines to improve availability, durability, and read scaling, but it introduces consistency and failover tradeoffs.

## What is Replication?

**Replication** means keeping copies of the same data in multiple places.

In plain English:

- one system has the original write path
- other systems receive copies of the data
- if one machine fails, other copies may still exist
- reads may also be spread across copies

### Analogy

Imagine keeping multiple copies of an important notebook:

- one in your office
- one at home
- one in a bank locker

If one copy is unavailable, the information is not lost.

That is the main purpose of replication.

## Why Systems Replicate Data

Replication helps with:

### 1. Availability

If one machine fails, another copy may continue serving traffic.

### 2. Fault tolerance

The system can survive hardware or node failures more gracefully.

### 3. Read scaling

Many read requests can be spread across replicas.

### 4. Disaster recovery

Copies in other zones or regions reduce single-location risk.

## How It Works

A common model is **leader-follower** replication.

- the **leader** or **primary** accepts writes
- **followers** or **replicas** copy the changes
- reads may go to leader or followers depending on freshness needs

### ASCII diagram

```text
             writes
App -----------------> Leader
                         |
                         | replicate
             +-----------+-----------+
             |                       |
             v                       v
         Follower A              Follower B

Reads can go to Leader or Followers
```

## Concrete Example

Suppose a product uses:

- 1 primary database
- 2 replicas
- 5,000 writes per second
- 20,000 reads per second

Replication allows the reads to be spread across the replicas.

### Normal case

- writes go to primary
- many reads go to replicas
- overall read capacity increases

### Failure case

If one replica fails:

- read traffic shifts to remaining nodes
- the system may still stay available for many operations

### Lag case

If replicas are 500 ms behind during a traffic spike:

- some reads may return stale data
- payment or order confirmation flows may need the primary instead

## Replication Modes

### 1. Synchronous replication

A write is not considered complete until replicas also confirm it.

#### Good

- stronger consistency
- lower chance of losing acknowledged writes

#### Bad

- higher write latency
- lower availability when replicas are slow or unreachable

### 2. Asynchronous replication

Leader acknowledges the write before replicas fully catch up.

#### Good

- faster writes
- better availability during network issues

#### Bad

- replicas can lag
- failover may lose very recent acknowledged writes in some designs

### 3. Multi-leader replication

More than one node accepts writes.

#### Good

- useful for multi-region active-active patterns
- lower regional write latency

#### Bad

- conflict resolution is much harder
- operational complexity is much higher

### 4. Leaderless replication high level

Clients or coordinators write to multiple replicas directly.

This is common in some distributed databases.

Tradeoffs often involve:

- quorum rules
- conflict resolution
- eventual consistency behavior

## Tradeoffs

Replication is powerful, but it is not free.

### Availability vs consistency

If you want reads from many replicas, some may be stale.

### Write latency vs durability

Waiting for more replicas improves durability, but slows writes.

### Failover complexity

If the leader dies, the system must choose a new leader safely.

### Split-brain risk

**Split brain** means two nodes both behave like leader.

That can corrupt the system if not prevented.

## Code-Level / Config Examples

### Example 1: Write to leader, read from follower

```text
function createOrder(order):
    return leader.write(order)

function getCatalogPage(productId):
    return followerPool.read(productId)
```

### Example 2: Freshness-aware read routing

```text
function getPaymentStatus(paymentId, mustBeFresh):
    if mustBeFresh:
        return leader.read(paymentId)
    return followerPool.read(paymentId)
```

### Example 3: Quorum-style high level idea

```text
write succeeds if 2 of 3 replicas confirm
read succeeds if 2 of 3 replicas respond
```

This is a high-level example of trading latency and resilience against stronger agreement.

## Replication vs Backup vs Sharding

| Concept | Purpose |
| --- | --- |
| Replication | extra live copies for availability and read scaling |
| Backup | recover from deletion, corruption, or historical data loss |
| Sharding | split data across machines for capacity and throughput |

### Important beginner correction

Replicas are **not** the same as backups.

Why?

Because if bad data or accidental deletion replicates quickly, all replicas may contain the same bad state.

Backups are needed for historical recovery.

## Comparison Table

| Model | Consistency | Read scaling | Write latency | Complexity | Best use case |
| --- | --- | --- | --- | --- | --- |
| Single leader async | Medium | Strong | Low | Medium | common web apps |
| Single leader sync | Higher | Medium | Higher | Medium | stronger durability needs |
| Multi-leader | Lower or conflict-prone | Strong | Medium | High | special multi-region cases |
| Leaderless | Varies by quorum design | Strong | Medium | High | distributed KV/database systems |

## How to Detect Problems

### Signals

- replica lag increasing
- followers falling behind or disconnecting
- failover taking too long
- stale-read complaints
- leader election instability
- replication backlog growth

### Useful metrics

- replication lag ms
- last applied log position
- replica health status
- read/write QPS per node
- failover time
- number of election events

## Common Beginner Mistakes

- assuming replicas are backups
- sending critical fresh reads to asynchronous replicas
- designing failover with no clear leader election plan
- ignoring split-brain risk
- assuming multi-leader is just “more scalable” without conflict cost
- overusing replication when the real need is sharding

## Interview Framing

Replication is a favorite interview topic because it forces candidates to reason about:

- availability
- freshness
- durability
- failover behavior

A strong answer usually includes:

- which node takes writes
- which nodes take reads
- whether replication is sync or async
- what stale reads are acceptable
- what happens when the leader fails

## Interview Questions You May Get

### Q1. Why replicate instead of only scaling the primary vertically?

Because one machine eventually becomes a bottleneck or single point of failure. Replication improves resilience and can increase read capacity.

### Q2. Is async replication safe?

It is often practical and common, but it allows lag and may risk losing very recent acknowledged writes during some failover scenarios.

### Q3. When is multi-leader worth it?

Usually only when the product truly needs multi-region local writes or independently writable regions, and the team can handle conflict resolution complexity.

## Strong Interview Answer Pattern

```text
I would use replication to improve availability and read scaling, but I would be explicit
about the consistency model. For example, I might use a single leader with asynchronous followers,
routing fresh or correctness-sensitive reads to the leader and lower-risk reads to followers.
I would also define failover behavior clearly, because replication is only useful if leader loss
is handled safely.
```

## Red Flags in Interviews

- saying “replication solves scale” without distinguishing read scale from write scale
- confusing replicas with backups
- ignoring failover details
- using follower reads for correctness-critical paths with no caution
- suggesting multi-leader casually without discussing conflicts

---

# Interview Cheat Sheet for Section B

## 1-minute Comparison View

| Topic | Core problem | Main benefit | Main risk | Common mitigation |
| --- | --- | --- | --- | --- |
| Consistent Hashing | key remapping during node changes | low reshuffle cost | uneven ownership, hot keys | virtual nodes, hot-key handling |
| Sharding | one DB cannot hold all data/traffic | horizontal scale | bad shard key, cross-shard pain | careful key choice, skew monitoring |
| Replication | one copy is not enough for availability/read scale | fault tolerance, read scale | stale reads, failover complexity | freshness-aware routing, clear leader model |

## Quick “When I’d Use It” Lines

### Consistent hashing

“I’d use it when stable key-to-node routing matters and cluster membership changes should not remap everything.”

### Sharding

“I’d use it when a single database can no longer handle storage or throughput, and I can identify a shard key aligned to access patterns.”

### Replication

“I’d use it when I need higher availability or more read capacity, while being explicit about freshness and failover tradeoffs.”

## Common Cross-Cutting Interview Theme

All three topics test a deeper design skill:

### Can you scale without creating chaos?

A strong candidate does not just say:

- add servers
- add shards
- add replicas

A strong candidate says:

- how requests are routed
- how data placement changes over time
- how failure affects correctness
- how metrics reveal imbalance
- how scaling choices affect operations later

---

# Final Summary

Section B covers the mechanics of growing beyond a single machine:

- **Consistent hashing** helps route keys with minimal reshuffling when nodes change.
- **Sharding** splits data across machines for horizontal scale.
- **Replication** creates multiple copies for availability, durability, and read scaling.

These topics are deeply connected:

- consistent hashing helps with **routing**
- sharding helps with **distribution of ownership**
- replication helps with **redundancy and availability**

In interviews, the strongest answers keep coming back to three questions:

1. **How is traffic routed?**
2. **How is data distributed?**
3. **What happens when a node fails or traffic shifts?**

## Suggested Next Step

After Section B, the most natural continuation is **Section C: Caching**, especially:

1. Cache Invalidation
2. Write-through vs Write-around vs Write-back Cache
3. CDN Caching
