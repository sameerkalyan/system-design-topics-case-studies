# Section A: Data / Consistency

This document covers four core system design concepts from Section A of your prompt library:

1. Eventual Consistency
2. Read Replica Lag
3. Lost Update Problem
4. Distributed Locking

## How to Use This for Interviews

This version is not only for learning the concepts, but also for **system design interviews** and **backend interviews**.

For each topic, try to practice four levels of answer quality:

### Level 1: Definition

Can you explain the concept in one or two simple sentences?

### Level 2: Failure mode

Can you explain what breaks when the concept is ignored?

### Level 3: Tradeoff

Can you explain when the concept is worth the cost and when it is not?

### Level 4: Design application

Can you use the concept inside a real system like:

- payments
n- inventory
- social feeds
- chat
- analytics
- job processing

### What Interviewers Usually Want

In many interviews, the interviewer is not checking whether you memorized a textbook definition. They often want to see whether you can:

- recognize a correctness risk early
- separate **acceptable inconsistency** from **dangerous inconsistency**
- choose the right tradeoff for the product requirement
- explain operational detection and mitigation
- avoid overengineering

### A Good Short Answer Pattern

When asked about one of these concepts, a strong quick answer often follows this structure:

1. define it simply
2. explain why it appears in distributed systems
3. give one realistic failure example
4. explain 2 or 3 mitigation strategies
5. mention tradeoffs and when you would use each

---

# 1. Eventual Consistency

**TL;DR:** In an eventually consistent system, different copies of data may be temporarily different, but if no new updates happen, they will become the same after some time.

## What is Eventual Consistency?

Eventual consistency is a data consistency model used in distributed systems.

A **distributed system** is a system where multiple machines work together and often keep copies of the same data.

In plain English:

- you update data in one place
- other copies do not get that change instantly
- after a short delay, those copies catch up
- finally, all copies become consistent

### Analogy

Imagine a school with three buildings, and each building has a notice board.

If the principal changes tomorrow's exam timing, the update may be placed on Building A's notice board first. Building B and Building C may get updated a little later.

For a short time:

- Building A says: exam at 10 AM
- Building B still says: exam at 9 AM
- Building C still says: exam at 9 AM

A little later, all notice boards show 10 AM.

That is eventual consistency.

## Strong Consistency vs Eventual Consistency

**Strong consistency** means every read sees the latest successful write immediately.

**Eventual consistency** means some reads may see old data for a short time.

### Simple example

A user changes their profile photo.

- In a strongly consistent system, everyone sees the new photo immediately.
- In an eventually consistent system, some users may still see the old photo for a few seconds.

### ASCII comparison

```text
Strong Consistency

User writes new value = X
        |
        v
All replicas updated before read returns
        |
        v
All readers see X immediately


Eventual Consistency

User writes new value = X
        |
        v
Primary/one node updated first
        |
        v
Other replicas catch up later
        |
        v
Some readers may temporarily see old value
        |
        v
Eventually all readers see X
```

## How It Happens

A **node** is a server or machine participating in the system.

Step by step:

1. A client sends a write request.
2. One node accepts the write first.
3. That node stores the new value.
4. The system starts replicating the change to other nodes.
5. Before replication finishes, another client performs a read.
6. That read may hit a node that still has old data.
7. After replication completes, all nodes return the same updated value.

### ASCII flow

```text
Client A -> Node 1: set profile_name = "Maya"
                  Node 1 stores new value immediately

Node 1 ----replication----> Node 2
Node 1 ----replication----> Node 3

Before replication finishes:
Client B -> Node 2: read profile_name
Node 2 -> returns old value: "Mia"

Later:
Node 2 updated to "Maya"
Node 3 updated to "Maya"
```

## Concrete Example

Let us use a social media like counter.

Suppose:

- Region US-East handles the write
- Region Europe and Region Asia keep replicas
- replication lag is usually 300 ms to 2 seconds

A post has **100 likes**.

A user in the US clicks Like.

Now:

- US-East updates count to 101 immediately
- Europe replica still shows 100 for 700 ms
- Asia replica still shows 100 for 1.4 seconds

So for a short **stale read window**, users in other regions may see:

- US-East: 101
- Europe: 100
- Asia: 100

After replication completes:

- all regions show 101

This is often acceptable for likes, views, or follower counts.

## Why Systems Use It

Distributed systems often choose eventual consistency because it helps with:

### 1. Availability

**Availability** means the system can still respond even when some parts are slow or unreachable.

If the system does not wait for every replica to update before replying, it can keep serving users more reliably.

### 2. Lower latency

**Latency** means delay.

If a user in one region must wait for every region worldwide to confirm the write, response time becomes slower.

Eventual consistency allows a faster response.

### 3. Geo-distribution

**Geo-distribution** means data exists in multiple geographic regions.

The farther apart regions are, the more network delay exists.

### 4. Replication speed and scalability

A system can scale more easily when it allows replicas to catch up asynchronously.

**Asynchronously** means the work happens later instead of blocking the current request.

## Where It Causes Problems

Eventual consistency is useful, but it can create confusing or risky behavior.

### Read-after-write issue

A user updates something, then immediately reads it back and sees the old value.

### Stale reads

A **stale read** means reading old data even though newer data already exists somewhere else.

### Conflicting updates

Two users may update the same data in different places before the replicas fully sync.

### User confusion

Examples:

- changing a password but old settings still appear
- updating an address but checkout still shows the old address
- removing an item but another screen still shows it

### Duplicate actions

If a user does not see their update reflected, they may click again and create duplicates.

## Conflict Handling in Depth

When multiple updates happen to the same data, the system needs a conflict resolution strategy.

### 1. Last write wins

The system keeps the newest update based on timestamp.

#### Good

- simple
- fast

#### Bad

- can silently overwrite a valid update
- depends on clocks being reasonably correct

```text
Update A at 10:00:01 -> value = "blue"
Update B at 10:00:02 -> value = "green"

Result: "green"
```

### 2. Vector clocks high level

A **vector clock** is a way to track which update came from which node and whether one update happened before another.

It helps identify whether:

- one update clearly came after another, or
- two updates happened independently and conflict

This is more advanced, but the big idea is:

- do not assume timestamps alone are enough
- track causal history when conflicts matter

### 3. Manual conflict resolution

Sometimes the system shows both versions and asks a human or application rule to decide.

Example:

- two admins edit the same product description
- system stores both edits
- admin chooses final text later

### 4. Merge strategies

The system may merge updates automatically.

Example:

- user A updates phone number
- user B updates address
- system can combine both because they changed different fields

But if both change the same field, merge is harder.

## Code-Level Pseudocode

### Example 1: Fresh-read routing after a write

```text
function updateUserProfile(userId, newName):
    primary.write(userId, { name: newName, version: nextVersion() })
    return { success: true, readFrom: "primary", freshnessWindowMs: 3000 }

function readUserProfile(userId, recentWrite):
    if recentWrite.exists and recentWrite.ageMs < 3000:
        return primary.read(userId)
    else:
        return replica.read(userId)
```

Idea:

- after a write, route that user's next read to a fresh source
- this reduces read-after-write confusion

### Example 2: Version check for conflict handling

```text
function updateDocument(docId, newContent, expectedVersion):
    current = db.read(docId)

    if current.version != expectedVersion:
        return {
            error: "VERSION_CONFLICT",
            currentVersion: current.version,
            currentContent: current.content
        }

    db.write(docId, {
        content: newContent,
        version: current.version + 1
    })

    return { success: true }
```

Idea:

- if someone already updated the document, the second writer is warned
- this helps avoid accidental overwrite

## Eventual Consistency vs Replica Lag vs Stale Cache

These ideas are related, but not the same.

### ASCII comparison

```text
Eventual Consistency
  Broad system behavior:
  copies may differ temporarily, then converge

Read Replica Lag
  A database replica is behind the primary

Stale Cache
  Cache still serves old data after source changed
```

### Key distinction

- **Eventual consistency** is the big consistency model.
- **Replica lag** is one concrete reason stale reads happen.
- **Stale cache** is a caching problem, not necessarily a replication problem.

## Comparison Table

| Aspect | Strong Consistency | Eventual Consistency |
| --- | --- | --- |
| Freshness | Highest | Temporarily stale possible |
| Read behavior | Latest write immediately visible | Old value may be seen briefly |
| Availability | Can be lower during failures | Often higher |
| Latency | Usually higher | Usually lower |
| Complexity | Simpler mental model | Harder for clients and users |
| Best use cases | balances, inventory reservation, critical workflows | likes, feeds, analytics, view counts |

## How to Detect It

You can detect eventual consistency issues using:

### 1. Replica lag metrics

Measure how far followers are behind the leader.

### 2. Cross-region diff checks

Compare the same record across regions.

### 3. Stale-read complaints

Users report:

- “I just updated this”
- “Why do I still see the old value?”

### 4. Version mismatch logs

Store version numbers in logs and compare returned versions.

### 5. Synthetic tests

Automated test flow:

1. write value
2. immediately read from multiple regions
3. measure how long until all regions match

## Common Beginner Mistakes

- assuming a successful write is visible everywhere instantly
- using eventual consistency for critical money or balance checks
- ignoring read-after-write user experience
- relying only on timestamps for conflict resolution
- forgetting that cross-region replication introduces delay
- not defining whether stale reads are acceptable for a feature

## When Eventual Consistency is Fine vs Dangerous

### Usually fine

- social likes
- view counters
- activity feeds
- analytics dashboards
- non-critical profile info

### Dangerous without extra protection

- bank balances
- seat booking
- inventory reservation
- payment state transitions
- security permission changes

## Interview Framing

If an interviewer asks whether eventual consistency is “good” or “bad,” a strong answer is:

> Eventual consistency is neither automatically good nor bad. It is a tradeoff. It works well when temporary staleness is acceptable, but it is risky when correctness depends on every reader seeing the newest write immediately.

That answer is strong because it shows you understand that the right choice depends on the product requirement.

## Interview Questions You May Get

### Q1. When would you accept eventual consistency?

Good examples:

- like counts
- follower counts
- feed fanout results
- analytics dashboards
- recommendation results

### Q2. When would you avoid it or add stronger protection?

Good examples:

- payment authorization state
- available inventory for checkout
- seat booking
- wallet balance
- permission revocation

### Q3. How would you reduce user confusion?

Strong answers include:

- read-your-writes behavior for the acting user
- primary read fallback for a short window
- UI messages like “updating…” when appropriate
- idempotent retry handling
- versioning or conflict detection

## What a Strong Interview Answer Sounds Like

```text
Eventual consistency means replicas may temporarily disagree after a write, but converge later.
I would use it when temporary stale reads are acceptable, such as social counters or feeds,
because it improves availability and latency across regions.
I would avoid relying on it directly for payments or inventory reservation unless I add
stronger controls like single-writer ownership, version checks, conditional updates,
or fresh reads from the source of truth.
```

## Red Flags in Interviews

Interviewers often worry when a candidate:

- says “eventual consistency is fine for everything at scale”
- ignores user-visible stale reads
- cannot distinguish between replica lag and cache staleness
- uses timestamp-only conflict resolution for critical data without caution
- talks about performance only and not correctness

## Design Heuristic

A very practical interview heuristic is:

### Ask this question first

**What is the cost of being wrong for 1 to 5 seconds?**

- If the cost is low, eventual consistency may be acceptable.
- If the cost is high, you need stronger guarantees or compensating controls.

---

# 2. Read Replica Lag

**TL;DR:** Read replica lag happens when a replica database is behind the primary, so a read from the replica may return old data even though the primary already has the new value.

## What is Read Replica Lag?

A **read replica** is a copy of a database used mainly for serving read requests.

**Read replica lag** means the replica has not yet received the latest updates from the primary database.

### Analogy

Imagine a teacher's original notebook and a student who keeps a photocopy.

Whenever the teacher updates the notebook, the student does not receive the new photocopy instantly.

For a short time, the student's copy is behind.

That delay is replica lag.

## What is a Read Replica?

In many database systems:

- the **primary** database handles writes
- one or more **replicas** receive copied changes
- applications send many reads to replicas to reduce load on the primary

### Why use replicas?

- scale read traffic
- reduce load on the primary
- improve geographic reach
- support failover strategies

### ASCII diagram

```text
           writes
App -----------------> Primary DB
                          |
                          | replicate changes
                          v
                     Replica 1
                          \
                           \
                            v
                         Replica 2

Reads can go to Primary or Replicas
```

## How Lag Happens

Step by step:

1. App writes new data to the primary.
2. Primary commits the write.
3. Primary sends the change to replicas.
4. Network or processing delay slows replication.
5. A user reads from a replica before the replica catches up.
6. The user sees old data.

### ASCII flow

```text
T0: User updates email to new@example.com
T1: Primary stores new@example.com
T2: Replica still has old@example.com
T3: User profile read goes to replica
T4: Replica returns old@example.com
T5: Replica catches up later
```

## Concrete Example

Suppose an e-commerce app has:

- 1 primary database
- 3 read replicas
- average replica lag: 150 ms
- during traffic spikes: lag can grow to 3 seconds

A seller updates stock for a product from **8 units** to **2 units**.

Immediately after the update:

- primary shows 2
- replica A shows 8 for 200 ms
- replica B shows 8 for 1.2 seconds
- replica C shows 8 for 2.8 seconds during peak traffic

If the product page reads from a lagging replica, shoppers may see incorrect stock.

## Why It Matters

### 1. Read-after-write inconsistency

A user updates data, refreshes, and sees the old value.

### 2. Stale data

Pages, APIs, or dashboards show outdated information.

### 3. Wrong user experience

Users lose trust when the system appears broken.

### 4. Business correctness risk

Replica lag can be more than a UI annoyance if the stale read affects:

- inventory
- payment state
- order status
- fraud rules

## Causes of Lag

### 1. Network delay

Replication messages take time to travel.

### 2. Replication backlog

A **backlog** is queued work waiting to be processed.

Heavy writes can create a large backlog.

### 3. Slow disks or IO

If replica storage is slow, updates apply more slowly.

### 4. Heavy write traffic

Too many updates per second can overwhelm replication.

### 5. Long transactions

A **transaction** is a group of operations treated as one unit.

Long transactions can delay what replicas are able to apply or expose.

### 6. Resource pressure

High CPU, memory pressure, or lock contention can slow the replica.

## Solutions in Depth

### 1. Read-your-writes routing

After a user writes data, send their next reads to the primary for a short period.

### 2. Primary-read fallback

If the replica is too stale, read from the primary instead.

### 3. Lag-aware routing

Check replica lag before routing reads.

If lag exceeds a threshold, stop using that replica for freshness-sensitive reads.

### 4. Reduce heavy writes

Batch updates, shorten transactions, and reduce unnecessary writes.

### 5. Smaller replication backlog

Improve throughput so replicas can apply changes faster.

### 6. Feature-specific routing

Not every read has the same freshness requirement.

For example:

- product recommendations can tolerate staleness
- payment confirmation cannot

## Code-Level Pseudocode

### Example 1: Fresh read after write

```text
function updateAddress(userId, newAddress):
    primary.write(userId, { address: newAddress })
    recentWriteCache.put(userId, now(), ttl=5000)
    return { success: true }

function getAddress(userId):
    if recentWriteCache.exists(userId):
        return primary.read(userId)
    return chooseReplica().read(userId)
```

### Example 2: Lag threshold routing

```text
function getOrder(orderId):
    replica = chooseReplica()

    if replica.lagMs > 200:
        return primary.read(orderId)

    return replica.read(orderId)
```

## Replica Lag vs Stale Cache vs Eventual Consistency

| Concept | What it means | Typical cause |
| --- | --- | --- |
| Replica lag | Replica database is behind primary | replication delay |
| Stale cache | Cache has old value | invalidation or TTL issue |
| Eventual consistency | Copies converge over time | distributed replication model |

### Important idea

Replica lag is one common mechanism that creates eventual consistency behavior.

## Comparison Table

| Approach | Freshness | Latency | Complexity | Best for |
| --- | --- | --- | --- | --- |
| Read from primary only | Highest | Higher | Low | critical fresh reads |
| Read from replicas always | Lower during lag | Lower | Low | non-critical reads |
| Read-your-writes routing | High for recent writer | Medium | Medium | user profile, settings |
| Lag-aware routing | Balanced | Balanced | Medium | mixed workloads |

## How to Detect It

### Signals

- replica lag metrics in milliseconds or seconds
- replication delay alerts
- users complaining after updates
- mismatched values between primary and replica
- logs showing old versions returned right after writes

### Practical monitoring examples

- alert when lag > 500 ms for critical systems
- graph max lag and average lag separately
- track message age in replication pipeline

## Common Beginner Mistakes

- sending all reads to replicas without thinking about freshness
- assuming replicas are always up to date
- using lagging replicas during flash sales or spikes
- measuring average lag only and ignoring worst-case lag
- forgetting that a “fast” replica can still be stale
- treating replica reads as safe for critical correctness logic

## Interview Framing

Replica lag is a favorite interview topic because it tests whether you understand the difference between:

- scaling reads, and
- preserving correctness

A strong candidate usually says something like:

> Replicas are good for offloading read traffic, but not every read can safely go to a replica. Freshness-sensitive reads may need the primary, stickiness after write, or lag-aware routing.

## Interview Questions You May Get

### Q1. Why not send all reads to replicas?

Because some reads require fresh data. If you route everything to replicas, users may see stale state right after writes.

### Q2. What is a practical mitigation in production?

Common answers:

- read-your-writes stickiness for a few seconds
- route critical reads to primary
- stop using replicas above a lag threshold
- split endpoints into freshness-sensitive and non-sensitive categories

### Q3. How would you explain this in a design interview?

A strong answer:

```text
I would use replicas for read scaling, but I would classify reads by freshness requirement.
For example, product recommendations can tolerate stale reads, but order confirmation and
payment status should prefer the primary or a freshness-aware path.
```

## Interview Follow-up: Metrics to Mention

Mentioning metrics makes your answer much stronger. Good ones include:

- replica lag in milliseconds or seconds
- replication backlog size
- age of last applied transaction
- percent of reads served from primary vs replicas
- stale-read complaints after write-heavy actions

## Design Heuristic

A useful rule in interviews:

### Reads are not all equal

If the read is:

- **user-facing and immediately after a write** -> prefer fresh path
- **analytics or low-risk browsing** -> replica may be fine
- **business-critical state check** -> primary or stronger consistency path

---

# 3. Lost Update Problem

**TL;DR:** The lost update problem happens when two clients read the same old value, both make changes, and one change silently overwrites the other.

## What is the Lost Update Problem?

The lost update problem is a concurrency bug.

**Concurrency** means multiple users, requests, or processes operate at the same time.

In plain English:

- two clients read the same value
- both calculate a new value
- both write back
- the later write overwrites the earlier one
- one update is effectively lost

### Analogy

Two people open the same shared note.

- both see: “Budget = 100”
- person A changes it to 120
- person B changes it to 90
- whoever saves last overwrites the other

One person's work disappears.

## How It Happens

Suppose a counter starts at **10**.

Two requests arrive at the same time.

### Step by step

1. Client A reads value = 10
2. Client B reads value = 10
3. Client A adds 5 and plans to write 15
4. Client B adds 3 and plans to write 13
5. Client A writes 15
6. Client B writes 13
7. Final value becomes 13

But the correct result should have been 18.

Client A's update was lost.

### ASCII diagram

```text
Initial value = 10

Client A reads 10 -----------> wants to write 15
Client B reads 10 -----------> wants to write 13

Client A writes 15
Client B writes 13

Final value = 13
Correct value should be 18
```

## Concrete Example

### Inventory decrement example

Suppose a product has **5 units** in stock.

Two buyers place orders at the same time.

#### Request A

- reads stock = 5
- decrements to 4

#### Request B

- reads stock = 5
- decrements to 4

If both save independently, final stock may still be **4**.

But two items were sold, so correct stock should be **3**.

That means one decrement was lost.

### Bank balance example

Balance = **1000**

- ATM withdrawal: -100
- online purchase: -200

If both read 1000 first and then write separately:

- one may write 900
- the other may write 800

Correct answer should be 700.

## Why It’s Dangerous

### Silent data loss

This bug often does not crash the system. It quietly stores the wrong result.

### Wrong balances and counts

- wrong bank balances
- wrong inventory counts
- wrong analytics counters

### Race-condition bugs

A **race condition** happens when the result depends on timing.

Lost update is a common race-condition pattern.

### Hard to reproduce

It may appear only under concurrency, making it tricky to debug.

## Solutions in Depth

### 1. Optimistic locking

**Optimistic locking** assumes conflicts are rare, but checks a version before writing.

Each row has a version number.

Flow:

- read row with version 7
- try update only if version is still 7
- if someone already changed it to version 8, your update fails and must retry

### 2. Version checks

Same core idea as optimistic locking.

Do not overwrite unless the record is still in the version you read.

### 3. Transactions

A **transaction** groups operations so they behave safely together.

### 4. Compare-and-set

Only update if current value matches expected value.

### 5. Row locks

A **row lock** prevents other transactions from modifying the same row until the current one finishes.

This is stronger but can reduce concurrency.

## Code-Level Pseudocode

### Example 1: Version-based update

```text
function updateStock(productId, expectedVersion, newStock):
    rowsAffected = db.execute(
        "UPDATE products SET stock = ?, version = version + 1 WHERE id = ? AND version = ?",
        [newStock, productId, expectedVersion]
    )

    if rowsAffected == 0:
        return { error: "CONFLICT_RETRY" }

    return { success: true }
```

### Example 2: Transactional locking

```text
function withdraw(accountId, amount):
    beginTransaction()

    account = db.query("SELECT balance FROM accounts WHERE id = ? FOR UPDATE", [accountId])

    if account.balance < amount:
        rollback()
        return { error: "INSUFFICIENT_FUNDS" }

    newBalance = account.balance - amount
    db.execute("UPDATE accounts SET balance = ? WHERE id = ?", [newBalance, accountId])

    commit()
    return { success: true, balance: newBalance }
```

## Lost Update vs Duplicate Request vs Race Condition

| Concept | Meaning |
| --- | --- |
| Lost update | one valid change gets overwritten by another |
| Duplicate request | same request gets processed more than once |
| Race condition | timing changes the result unexpectedly |

### Relationship

- Lost update is a type of race-condition problem.
- Duplicate requests are different, though both can corrupt data.

## Comparison Table

| Solution | Correctness strength | Performance cost | Complexity | Best use case |
| --- | --- | --- | --- | --- |
| No protection | Very low | Low | Low | almost never |
| Optimistic locking | High | Low to medium | Medium | low-conflict edits |
| Row locks | Very high | Medium to high | Medium | critical updates |
| Compare-and-set | High | Low | Medium | counters, versions, state transitions |

## How to Detect It

### Signals

- counters not matching audit logs
- inventory mismatches
- balance discrepancies
- conflict retries increasing sharply
- concurrency tests failing under load

### Testing approach

Simulate many concurrent requests against the same record and compare:

- expected final value
- actual final value

If they differ, you likely have a lost update problem.

## Common Beginner Mistakes

- doing read-modify-write with no locking or versioning
- assuming low traffic means it is safe
- not storing audit logs
- using separate reads and writes for critical counters
- testing only single-user flows
- confusing duplicate-request problems with lost updates

## Interview Framing

The lost update problem is a very strong interview signal because it shows whether you think about concurrency, not just happy-path APIs.

A strong answer usually includes:

- the classic read-modify-write race
- why the result is silently wrong
- one optimistic strategy
- one pessimistic strategy
- tradeoffs between throughput and correctness

## Interview Questions You May Get

### Q1. Why is a naive read-then-write dangerous?

Because two requests can read the same old value and both write derived values, causing one update to overwrite the other.

### Q2. When would you prefer optimistic locking?

When conflicts are relatively rare and you want better concurrency.

Examples:

- profile edits
- document updates
- moderate-contention admin tools

### Q3. When would you prefer row locking or transactional protection?

When the cost of being wrong is high and the record is highly contended.

Examples:

- money movement
- inventory reservation
- critical state transitions

## Strong Interview Answer Pattern

```text
This is a classic lost update risk caused by concurrent read-modify-write.
If conflicts are rare, I would use optimistic locking with a version column and retry on conflict.
If the operation is highly contended or correctness is critical, I would use transactional locking
or an atomic database update so I do not compute from a stale read.
```

## Better-Than-Basic Mitigations

Candidates stand out when they mention stronger patterns such as:

### 1. Atomic SQL updates

Instead of:

- read stock
- decrement in app code
- write stock

Prefer a single atomic statement when possible.

```text
UPDATE inventory
SET stock = stock - 1
WHERE product_id = 42 AND stock > 0;
```

This avoids some lost-update patterns because the database performs the change atomically.

### 2. Invariants at the database boundary

If the business rule is “stock cannot go below zero,” enforce that in the write condition, not only in application memory.

### 3. Retry policy with backoff

If optimistic locking fails often, retry carefully with backoff instead of hammering the same hot row immediately.

## Red Flags in Interviews

- suggesting application-level locks before simpler DB-safe primitives
- forgetting that counters can often use atomic update operations
- discussing correctness without considering throughput cost
- using “last write wins” for money or stock without challenge

---

# 4. Distributed Locking

**TL;DR:** Distributed locking is a way to ensure that across many servers, only one worker at a time can perform a shared critical task.

## What is Distributed Locking?

A **lock** is a mechanism that gives temporary exclusive access to a resource.

**Distributed locking** means that exclusivity works across multiple machines, not just inside one process.

### Analogy

Imagine a storeroom with only one physical key.

Whoever holds the key can enter and restock shelves.

Everyone else must wait.

That key acts like a lock.

In distributed systems, many servers may want the same “key” at the same time.

## Why It Exists

In a multi-server system, the same job may be triggered by:

- many API servers
- many background workers
- cron jobs running on many machines
- retry logic

Without coordination, multiple workers may do the same work simultaneously.

That can cause:

- duplicate job execution
- corrupted state
- wasted compute
- conflicting writes

## How It Works

Typical flow:

1. Worker tries to acquire lock.
2. If successful, it becomes the temporary owner.
3. Worker performs the protected task.
4. Worker releases the lock when done.
5. If worker crashes, lock should eventually expire.
6. Other workers retry later.

### ASCII flow

```text
Worker A ---> Lock Store: acquire lock(job:rebuild-cache)
Lock Store ---> Worker A: success

Worker B ---> Lock Store: acquire lock(job:rebuild-cache)
Lock Store ---> Worker B: fail

Worker A does work
Worker A releases lock

Worker B retries later and may succeed
```

## Concrete Example

### Cache rebuild job

Suppose a hot product cache expires.

Traffic spike hits 20 app servers.

Without a distributed lock:

- all 20 servers detect cache miss
- all 20 rebuild the same cache entry
- database gets hammered 20 times

With a distributed lock:

- 1 server acquires lock
- 19 servers wait or serve stale data briefly
- only 1 rebuild query runs

### Another example: payment reconciliation

A scheduled reconciliation job should run once every hour.

If 3 workers run it simultaneously, they may:

- double-process records
- create duplicate external calls
- produce conflicting reports

## Why It’s Dangerous if Done Poorly

Distributed locks are powerful, but easy to misuse.

### 1. Deadlocks

A **deadlock** is a situation where progress stops because locks are never released properly.

### 2. Stuck locks

A worker crashes while holding the lock, and the lock remains forever.

### 3. Split ownership

Two workers both believe they own the lock.

This is very dangerous.

### 4. Clock and timing issues

If lock duration depends on time and the job runs longer than expected, lock ownership can become unclear.

## Solutions / Patterns

### 1. Redis lock

Common pattern:

- use `SET key value NX PX ttl`
- `NX` means only set if key does not exist
- `PX ttl` means set expiration time

This creates a lease-like lock.

### 2. Database row lock

Use database transactions and row-level locking.

Good when the protected resource already lives in the DB.

### 3. Lease-based lock

A **lease** is a lock with an expiry time.

If the owner disappears, the lease eventually ends.

### 4. Fencing tokens high level

A **fencing token** is a strictly increasing number given to each lock holder.

Even if an old worker thinks it still owns the lock, downstream systems can reject stale tokens.

This is important for high-safety use cases.

## Code-Level Pseudocode

### Example 1: Lock acquisition with TTL

```text
function processJob(jobId):
    token = randomId()
    acquired = redis.set(
        key = "lock:job:" + jobId,
        value = token,
        onlyIfAbsent = true,
        ttlMs = 30000
    )

    if not acquired:
        return { status: "LOCK_NOT_ACQUIRED" }

    try:
        doWork(jobId)
    finally:
        current = redis.get("lock:job:" + jobId)
        if current == token:
            redis.delete("lock:job:" + jobId)
```

Why compare token before delete?

Because another worker may have acquired a new lock after expiry. You should not delete someone else's lock.

### Example 2: Leader-style scheduled job lock

```text
function runHourlyReconciliation():
    lease = lockService.acquire("reconciliation", ttlMs=60000)

    if not lease.success:
        return "another worker is running"

    while workRemaining():
        if lease.timeLeftMs < 10000:
            lease = lockService.renew(lease)
            if not lease.success:
                return "lost lock, stop work safely"

        processNextBatch()

    lockService.release(lease)
```

## Distributed Locking vs Mutex vs DB Transaction Lock

| Concept | Scope | Typical use |
| --- | --- | --- |
| Local mutex | single process | threads inside one app instance |
| DB transaction lock | rows/data in one DB transaction | protecting DB updates |
| Distributed lock | many servers/processes | shared jobs/resources across machines |

### Important warning

A local mutex does **not** protect work across multiple servers.

If you have 10 servers, each server can hold its own local mutex at the same time.

## Comparison Table

| Approach | Complexity | Safety | Latency | Failure modes | Best use case |
| --- | --- | --- | --- | --- | --- |
| Local mutex | Low | Low in distributed systems | Low | does not work across servers | single-process concurrency |
| DB row lock | Medium | High for DB-centered work | Medium | contention, long transactions | record-level protection |
| Redis lease lock | Medium | Medium to high | Low | expiry races, ownership issues | job dedup, cache rebuild |
| Lease + fencing token | Higher | Highest | Medium | more operational complexity | critical external side effects |

## How to Detect Problems

### Signals

- duplicate job execution
- lock timeout spikes
- locks that never expire
- logs missing successful release events
- workers doing the same supposedly exclusive action

### Monitoring ideas

- track lock acquire success rate
- track lock hold duration
- alert on stale lock age
- count duplicate executions per job key

## Common Beginner Mistakes

- no lock expiry at all
- assuming local mutex works across servers
- releasing a lock without verifying ownership token
- no retry or backoff strategy
- using distributed locks where idempotency would be simpler
- ignoring fencing tokens for critical side effects
- setting TTL too short for long-running work

## Interview Framing

Distributed locking is where many candidates accidentally sound confident while describing something unsafe.

Interviewers often listen for whether you understand that a distributed lock is not just “put key in Redis.”
A strong answer includes ownership, expiry, failure handling, and what happens if the owner pauses or crashes.

## Interview Questions You May Get

### Q1. When do you really need a distributed lock?

Good examples:

- only one worker should run a reconciliation job
- only one node should rebuild a shared expensive cache item
- only one coordinator should assign a global batch operation

### Q2. When is a distributed lock the wrong first tool?

Good examples:

- when idempotency would solve duplicate execution more simply
- when the database can enforce correctness with atomic writes
- when a queue partitioning model can guarantee single-consumer ownership by key

### Q3. What makes a distributed lock unsafe?

Good answers include:

- no expiry
- no ownership token
- assuming release is always safe
- not handling pause/GC/network delay
- no fencing token for critical downstream side effects

## Strong Interview Answer Pattern

```text
I would use a distributed lock only when the work must be globally coordinated across nodes.
I would prefer a lease with TTL, an ownership token, and safe release logic.
For high-risk side effects, I would also think about fencing tokens, because lease expiry alone
may not prevent a delayed old worker from acting after a new owner takes over.
```

## Important Interview Insight: Locking vs Idempotency

A very strong system design answer often says:

> I would not jump to distributed locking first if idempotency or partitioned ownership can solve the problem more simply.

Why this is strong:

- locks add operational complexity
- locks can fail in subtle ways
- idempotent processing is usually valuable even if a lock exists

## Red Flags in Interviews

- saying “Redis lock solves it” with no discussion of leases or ownership
- assuming lock expiry alone guarantees safety
- ignoring duplicate execution after partial failure
- using distributed locks for every concurrency problem

---

# Interview Cheat Sheet for Section A

## 1-minute Comparison View

| Topic | Core problem | Main risk | Common mitigation | Interview trap |
| --- | --- | --- | --- | --- |
| Eventual Consistency | copies differ temporarily | stale reads, conflicts | read-your-writes, versioning, conflict handling | treating all staleness as acceptable |
| Read Replica Lag | replica behind primary | old data returned after write | primary fallback, lag-aware routing | routing all reads to replicas |
| Lost Update Problem | concurrent writes overwrite | silent incorrect final state | optimistic locking, atomic update, row lock | naive read-modify-write |
| Distributed Locking | many nodes do same exclusive work | duplicate execution, split ownership | lease + token + expiry + fencing where needed | local mutex or unsafe Redis lock |

## Quick “When I’d Use It” Lines

### Eventual consistency

“I’d allow it where temporary staleness is acceptable and the business cost of short inconsistency is low.”

### Read replica lag mitigation

“I’d use replicas for scale, but I’d route freshness-sensitive reads differently.”

### Lost update protection

“I’d avoid read-modify-write races with atomic DB operations, optimistic locking, or transactional locking depending on contention.”

### Distributed locking

“I’d use it only for truly shared cross-node coordination, and I’d still design for idempotency.”

## Common Cross-Cutting Interview Theme

All four topics are really testing one deeper skill:

### Can you classify correctness requirements?

A strong candidate does not say “make everything strongly consistent” or “eventual consistency is fine at scale.”
A strong candidate says:

- this path is correctness-critical
- this path can tolerate temporary staleness
- this write needs conflict protection
- this job needs global coordination
- this problem is better solved by idempotency than by locking

---

# Final Summary

Section A covers a very important set of system design ideas:

- **Eventual consistency** explains why distributed systems may temporarily disagree.
- **Read replica lag** explains one common reason stale reads happen.
- **Lost update problem** explains how concurrent writes can silently overwrite each other.
- **Distributed locking** explains how many servers coordinate access to shared work.

These four concepts show a common theme:

> once a system becomes distributed, correctness is no longer automatic.

You must deliberately design for:

- freshness
- ordering
- concurrency safety
- failure handling
- user-visible consistency

## Suggested Next Step

After Section A, the most natural continuation is **Section B: Scaling / Traffic Distribution**, starting with:

1. Consistent Hashing
2. Sharding / Partitioning Strategies
3. Replication
