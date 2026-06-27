# Reliability and Failure Handling in System Design

**TL;DR:** Reliability and failure handling in system design is about making sure a system does not just work in the happy path, but also behaves safely, predictably, and recoverably when traffic surges, dependencies fail, components slow down, or infrastructure breaks.

## Who this document is for

This guide is written for a **complete beginner**, but it is intentionally **deep**, not shallow.
That means:

- every topic starts in simple language
- every new term is explained clearly
- but the explanations still go beyond definitions into **tradeoffs, failure modes, and real design thinking**

If you are learning system design seriously, this is the right mindset:

> beginner-friendly does **not** mean surface-level.

## What this document covers

This compendium focuses on the most important **reliability and failure-handling concepts** that appear in real systems:

1. Rate Limiting
2. Load Shedding
3. Circuit Breaker
4. Timeouts
5. Connection Pool Exhaustion
6. Graceful Degradation
7. Failover
8. Health Checks
9. Dead Letter Queue (DLQ)
10. How These Concepts Fit Together

## The big idea behind all of them

A production system is not judged only by:

- how fast it is when everything is healthy
- how elegant the architecture diagram looks
- how many features it supports

It is judged by what happens when reality shows up:

- traffic spikes
- slow databases
- broken dependencies
- network delays
- retries
- partial outages
- configuration mistakes
- noisy neighbors
- bad messages
- stale backups

A strong system does not magically avoid all failures.
A strong system **contains**, **absorbs**, **routes around**, or **recovers from** them.

### A simple mental model

You can think about reliability topics in 5 buckets:

#### 1) Prevent too much traffic from entering
- rate limiting
- admission control

#### 2) Protect the system during overload
- load shedding
- backpressure
- concurrency limits

#### 3) Protect calls to unhealthy dependencies
- timeouts
- retries with care
- circuit breakers

#### 4) Keep service available when parts fail
- health checks
- failover
- redundancy
- graceful degradation

#### 5) Handle failed background work safely
- retries with limits
- dead letter queues
- recovery workflows

### Reliability is about tradeoffs

Almost every mechanism in this document has a tradeoff.
For example:

- tighter timeouts reduce long waits but may increase false failures
- aggressive rate limiting protects the backend but may block good users
- load shedding keeps the system alive but rejects some traffic
- failover reduces downtime but adds complexity and consistency risk
- deep health checks are more accurate but may flap if tuned poorly

This is a crucial beginner lesson:

> In system design, many good solutions are not “free wins.” They are controlled compromises.

---

# 1. Rate Limiting

## 1.1 What is Rate Limiting?

Let’s start in plain English.

**Rate limiting** means controlling how many requests a user, client, IP, API key, or service is allowed to send in a certain amount of time.

It is a system-level rule that says:

> “You are allowed to use this resource, but not infinitely fast.”

### Real-world analogy: nightclub bouncer

Imagine a nightclub.

- The club can safely hold only 200 people.
- A bouncer controls how fast new people enter.
- If too many people rush in at once, the place becomes unsafe.
- So some people are paused, delayed, or turned away.

That bouncer is the rate limiter.

### Another analogy: toll booth lane control

A highway toll plaza may not let unlimited vehicles merge into one lane at full speed.
There is a practical entry rate the road can handle.

The same idea applies to systems:

- your API can handle some request rate safely
- beyond that, unbounded traffic can break the experience for everybody

### Plain English definition

Rate limiting means:

> “Requests are allowed only up to a safe quota in a given window or at a given pace.”

### ASCII diagram

```text
Client requests ---> Rate Limiter ---> API Server ---> Database
                         |
                         +--> allow if under limit
                         +--> reject/delay if over limit
```

## 1.2 Why It Exists

Systems use rate limiting for several different reasons, and beginners often underestimate how broad the use cases are.

### A) Abuse prevention

You may want to stop:

- brute force login attempts
- OTP abuse
- API scraping
- bot traffic
- spammy automation

### B) Fairness

In shared systems, one heavy user should not degrade service for everyone else.

This is especially important in:

- SaaS products
- public APIs
- shared multi-tenant systems

### C) Backend protection

Even if your app servers can accept traffic, your downstream systems may not.
For example:

- DB may handle 5,000 QPS safely, not 50,000
- SMS provider may cost money per request
- payment provider may have partner-side quotas

### D) Cost control

Some traffic patterns are not just risky; they are expensive.

Examples:

- sending too many OTP SMS messages
- excessive third-party geocoding requests
- repeated AI inference calls

### E) Tenant isolation

In multi-tenant systems, one customer may generate far more usage than expected.
Without per-tenant limits, that customer becomes a noisy neighbor.

## 1.3 How It Works

At a high level, a rate limiter usually does four things:

1. identify who the limit applies to
2. count or model recent usage
3. compare it against a policy
4. allow, reject, or delay the request

### What can be limited?

A limit may be based on:

- user ID
- account ID
- API key
- IP address
- phone number
- tenant ID
- endpoint name
- region
- service-to-service caller identity

### Example policy formats

```text
100 requests per minute per API key
3 OTP sends per 10 minutes per phone number
20 password reset attempts per hour per account
1000 requests per second per tenant
```

### Timeline example

```text
Limit = 5 requests per minute

Minute starts
Req 1 -> allow
Req 2 -> allow
Req 3 -> allow
Req 4 -> allow
Req 5 -> allow
Req 6 -> reject
Req 7 -> reject
```

### Important note: reject vs delay

A rate limiter may behave in different ways:

- **reject** extra requests immediately
- **delay** them until capacity is available
- **queue** some amount of overflow

In user-facing APIs, rejection is common.
In internal traffic shaping systems, delaying may be more common.

## 1.4 Concrete Example

### Login OTP API

Suppose:

- OTP endpoint allows **3 requests per 10 minutes per phone number**
- 10,000 real users are trying to log in
- 100 abusive clients each try **100 OTP requests**

Without rate limiting:

- OTP provider gets flooded
- SMS cost rises sharply
- some genuine users may be delayed
- fraud and spam risk increase

With rate limiting:

- the first 3 OTP sends are allowed
- later ones are rejected with `429 Too Many Requests`

### ASCII example

```text
Phone: +91xxxx
Req 1 -> allow
Req 2 -> allow
Req 3 -> allow
Req 4 -> 429 Too Many Requests
Req 5 -> 429 Too Many Requests
```

### Another example: public weather API

Suppose:

- free plan allows **100 requests per minute per API key**
- one integration bug starts sending **5,000 requests per minute**

Without rate limiting:

- your backend may be overloaded
- your paid weather provider bill may spike
- other customers may suffer

With rate limiting:

- buggy client is contained
- rest of the platform remains stable

## 1.5 Why It Matters

Rate limiting protects against several failure types at once.

### Overload protection

It caps incoming demand before it becomes internal collapse.

### Retry storm containment

When buggy clients retry too aggressively, rate limiting can stop the request flood from scaling infinitely.

### Security protection

It slows attackers down in:

- login brute force
- OTP abuse
- token guessing
- scraping

### Fairness

It prevents one customer or integration from taking all the capacity.

### Stability during incidents

Even when your system is partially degraded, good rate limiting prevents the degraded state from becoming a full outage faster than necessary.

## 1.6 Algorithms in Depth

There is no single universal rate limiting algorithm. Each one reflects a different tradeoff between simplicity, fairness, memory use, and burst handling.

### 1) Fixed Window

Count requests inside a fixed time bucket.

```text
12:00:00 - 12:00:59 -> count requests
12:01:00 - 12:01:59 -> reset count
```

#### Pros
- simple
- cheap
- easy to implement in Redis or memory

#### Cons
- can allow burstiness at boundary edges

Example:

- 100 requests at 12:00:59
- 100 requests at 12:01:00
- effectively 200 requests in 2 seconds

### 2) Sliding Window

Instead of strict buckets, count requests over the last rolling interval.

Example:

- “last 60 seconds” at any moment

#### Pros
- fairer and smoother than fixed window
- better for user-facing APIs

#### Cons
- more memory or computation
- more implementation complexity

### 3) Leaky Bucket

Think of requests entering a bucket that leaks at a constant rate.

#### What it does well
- smooths output traffic
- useful when downstream prefers stable throughput

#### Weakness
- may reject or delay bursts more aggressively

### 4) Token Bucket

Tokens are added gradually over time.
A request consumes one token.
If tokens exist, request proceeds.
If not, it is blocked or delayed.

#### Why it is popular
- allows short bursts
- still enforces long-term rate control
- practical and flexible

### ASCII comparison

```text
Fixed window:
|-----window-----| reset |-----window-----|

Sliding window:
[now looks back exactly 60 seconds]

Leaky bucket:
requests in -> drain at steady rate

Token bucket:
save tokens over time -> spend tokens for bursts
```

## 1.7 Before/After Diagrams

### Without rate limiting

```text
Clients ---> API ---> DB
   |
   +--> one abusive client sends 10,000 requests
   +--> everyone else suffers
```

### With rate limiting

```text
Clients ---> Rate limiter ---> API ---> DB
               |
               +--> abusive excess blocked
               +--> normal users continue
```

## 1.8 Code-Level Pseudocode

### Fixed window counter

```text
function allowRequest(userId):
    key = "limit:" + userId + ":" + currentMinute()
    count = store.increment(key)

    if count == 1:
        store.expire(key, 60 seconds)

    if count > 100:
        return false
    return true
```

### Token bucket

```text
function allowRequest(user):
    bucket = getBucket(user)
    refillTokens(bucket)

    if bucket.tokens >= 1:
        bucket.tokens -= 1
        return true

    return false
```

### Slightly richer response example

```text
if allowRequest(user):
    processRequest()
else:
    return 429 with retryAfter=30 seconds
```

## 1.9 Where It Is Used

- API gateways
- login endpoints
- OTP flows
- payment initiation endpoints
- search APIs
- public APIs with free vs paid quotas
- multi-tenant SaaS systems
- third-party integration protection

## 1.10 Comparison Table

| Algorithm | Complexity | Burst handling | Fairness | Memory cost | Best use case |
|---|---:|---|---|---:|---|
| Fixed window | Low | Weak | Medium | Low | Simple endpoint limits |
| Sliding window | Medium | Better | Good | Medium | Fairer user-level API limits |
| Leaky bucket | Medium | Low | Strong steady output | Medium | Traffic shaping for downstream stability |
| Token bucket | Medium | Strong | Good | Medium | APIs needing burst tolerance |

## 1.11 How to Detect Problems

Look for:

- sudden `429` spikes
- one IP, API key, or tenant dominating traffic
- unusual OTP sends
- request cost anomalies
- dashboards showing blocked vs allowed requests
- abuse clusters by geography or caller type

## 1.12 Common Beginner Mistakes

- using only one global limit instead of per-user/per-tenant limits
- limiting only by IP address
- forgetting burst behavior
- ignoring bot rotation across many IPs
- not returning useful errors like `Retry-After`
- making limits too strict for real user behavior
- rate limiting core internal services without careful tuning

## 1.13 Final takeaway for Rate Limiting

Rate limiting is one of the simplest and most powerful ways to keep traffic under control.
It is not just a security feature.
It is also a **fairness**, **stability**, and **cost control** feature.

---

# 2. Load Shedding

## 2.1 What is Load Shedding?

**Load shedding** means deliberately dropping, delaying, or refusing some work so the system can keep the most important work alive.

### Analogy: overloaded restaurant kitchen

If a kitchen can safely handle only 100 active orders, accepting 300 at once may destroy service for everyone:

- food gets delayed
- staff gets overwhelmed
- quality drops
- customers leave angry

A smarter restaurant may temporarily stop taking new walk-ins or reduce the menu.

That is load shedding.

### Plain English definition

Load shedding means:

> “Reject some work on purpose so the whole system does not collapse.”

### Why beginners often misunderstand it

At first, it sounds bad:

- “Why would we reject requests intentionally?”

But the real choice is often not:

- reject nothing vs reject something

It is actually:

- reject a controlled subset now
- or let the whole system degrade badly for everyone

## 2.2 Why Systems Need It

Without load shedding, overload often looks like this:

```text
more traffic
   -> longer queues
   -> higher latency
   -> more timeouts
   -> more retries
   -> even more traffic
   -> collapse
```

Load shedding is a survival tool.

### It is especially useful when:

- traffic spikes suddenly
- downstream is already degraded
- capacity cannot scale instantly
- not all traffic is equally important

## 2.3 How It Happens Without Shedding

Suppose a service can process **10,000 req/s** safely.
Traffic spikes to **30,000 req/s**.

Without shedding:

1. service accepts everything
2. in-flight requests pile up
3. queue depth grows
4. CPU saturates
5. latency rises sharply
6. callers time out
7. retries add more pressure
8. the whole thing gets worse

### ASCII overload path

```text
Traffic spike
   -> service accepts all
   -> queue grows
   -> latency rises
   -> retries start
   -> more load arrives
   -> collapse risk increases
```

## 2.4 Concrete Example

### E-commerce flash sale

Suppose:

- homepage gets **50,000 req/s**
- product details service can handle **20,000 req/s**
- recommendation service can handle **8,000 req/s**

Without shedding:

- product page waits on recommendations
- recommendation service overloads
- whole page slows or fails

With shedding:

- recommendation module is disabled
- product title, image, price, and checkout still load

### This is the important lesson

Load shedding often protects the **core business path** by sacrificing less important work.

## 2.5 What Gets Shed?

Not all requests have equal value.

Typical low-priority candidates:

- analytics events
- recommendation widgets
- optional enrichments
- background exports
- decorative metadata
- expensive but non-essential search filters

Typical high-priority candidates to protect:

- login
- checkout
- payment confirmation
- order creation
- session validation

## 2.6 Techniques in Depth

### 1) Reject excess requests immediately

Return:

- `429 Too Many Requests`
- `503 Service Unavailable`

This protects the backend from accepting work it cannot finish well.

### 2) Drop low-priority work first

Instead of treating all traffic equally, keep priority classes.

Example:

- priority 1: checkout
- priority 2: search
- priority 3: recommendations
- priority 4: analytics

When overloaded, drop 4 first, then 3 if needed.

### 3) Adaptive concurrency limits

Rather than allowing unlimited in-flight work, reduce concurrency when latency worsens.

Example:

- healthy latency -> allow 500 concurrent requests
- rising latency -> cut to 300
- severe overload -> cut to 150

### 4) Queue admission control

Do not allow an internal queue to grow forever.
Once full, reject or delay new work.

### 5) Partial feature disablement

Turn off expensive or optional features during stress.

Examples:

- no personalized ranking
- no recommendation carousel
- no auto-preview generation

## 2.7 Before/After Diagrams

### Without load shedding

```text
Incoming traffic ---> Service ---> Queue keeps growing ---> Latency explodes
```

### With load shedding

```text
Incoming traffic ---> Shedder ---> critical requests continue
                         |
                         +--> low-priority requests dropped
```

## 2.8 Code-Level Pseudocode

### Reject if queue full

```text
MAX_QUEUE = 10000

function submit(req):
    if queue.size() >= MAX_QUEUE:
        return "503 overloaded"
    queue.push(req)
    return "accepted"
```

### Priority-based dropping

```text
function handleRequest(req):
    if systemOverloaded() and req.priority == "low":
        return "dropped"
    return process(req)
```

### Adaptive concurrency sketch

```text
if p95Latency > 800ms:
    maxConcurrent = maxConcurrent - 50
else if p95Latency < 300ms:
    maxConcurrent = maxConcurrent + 20
```

## 2.9 Load Shedding vs Rate Limiting vs Backpressure

```text
Rate limiting:
  stop too much traffic at the edge based on rules

Backpressure:
  tell upstream to slow down because downstream is full

Load shedding:
  deliberately drop work to keep system alive
```

### Key distinction

- rate limiting is usually **policy-driven**
- backpressure is usually **capacity-signal-driven**
- load shedding is usually **survival-driven under overload**

## 2.10 Comparison Table

| Strategy | Complexity | Latency effect | Protection strength | Tradeoff | Best use case |
|---|---:|---|---|---|---|
| Reject excess | Low | Fast fail | Strong | Some requests fail | Sudden overload |
| Priority dropping | Medium | Protects important paths | Strong | Lower-priority features disappear | Mixed traffic importance |
| Adaptive concurrency | Medium | Controls latency growth | Strong | Needs tuning | Service-to-service systems |
| Queue admission control | Medium | Prevents queue explosion | Strong | New work refused | Async pipelines |

## 2.11 How to Detect When You Need It

Look for:

- p95/p99 latency climbing sharply
- queue depth exploding
- CPU saturation
- DB overload during spikes
- retries increasing under stress
- optional features causing core failures

## 2.12 Common Beginner Mistakes

- shedding critical traffic before low-priority traffic
- no prioritization model
- trying to accept everything
- no user-friendly fallback behavior
- only scaling hardware instead of controlling demand
- confusing load shedding with random failure

## 2.13 Final takeaway for Load Shedding

Load shedding is one of the clearest examples of a mature system design mindset:

> protect the most important path first, even if that means sacrificing less important work.

---

# 3. Circuit Breaker

## 3.1 What is a Circuit Breaker?

A **circuit breaker** is a protective mechanism that stops sending requests to a dependency that is failing too often.

### Analogy: electrical breaker

In a house, if electrical current becomes unsafe, a breaker cuts the circuit.
This prevents a small electrical issue from becoming fire or equipment damage.

Software circuit breakers do the same thing conceptually:

- they detect too many failures
- they stop more calls from flowing for a while
- they give the dependency time to recover

### Plain English definition

Circuit breaker means:

> “This dependency looks unhealthy, so stop hammering it and fail fast instead.”

## 3.2 Why It Exists

If a dependency is already failing, sending even more traffic to it can make the situation worse.

Without a breaker:

- callers keep waiting
- retries keep increasing
- threads and connections stay occupied
- downstream gets pounded even harder

With a breaker:

- callers stop wasting time on doomed requests
- downstream gets breathing room
- system can recover faster

## 3.3 States of a Circuit Breaker

### Closed
Normal mode.
Requests are allowed through.

### Open
Breaker has decided dependency is unhealthy.
Requests are blocked or failed fast immediately.

### Half-Open
After a cooldown period, a small number of trial requests are allowed.
If they succeed, breaker closes.
If they fail, breaker opens again.

### ASCII state transitions

```text
Closed --too many failures--> Open
Open --cooldown expires--> Half-Open
Half-Open --trial succeeds--> Closed
Half-Open --trial fails--> Open
```

## 3.4 How It Works

1. dependency is healthy -> breaker stays closed
2. failures/timeouts rise above threshold
3. breaker opens
4. callers fail fast or use fallback
5. after cooldown, half-open probe begins
6. if probes succeed, normal traffic resumes

### Failure threshold examples

- 50 failures in 30 seconds
- error rate above 40%
- timeout rate above 25%
- consecutive failures above 10

Different systems use different criteria.

## 3.5 Concrete Example

### Payment gateway under failure

Suppose:

- payment service calls gateway at **5,000 req/min**
- gateway starts timing out heavily
- breaker threshold = **50 failures in 30 seconds**
- cooldown = **20 seconds**

Without breaker:

- app keeps calling gateway
- users wait long time
- retries and queues build up

With breaker:

- after threshold, breaker opens
- new requests fail fast or show fallback message
- system avoids spending more time on a clearly unhealthy dependency

## 3.6 Why It Helps

A circuit breaker helps in several ways.

### A) protects the downstream service

An already failing dependency often needs less pressure, not more.

### B) protects the caller

If each caller waits 5 seconds before failing, the caller layer may become exhausted too.
Fast failure is often safer.

### C) reduces retry amplification

A breaker can stop constant futile retry loops.

### D) improves operator visibility

A clearly open breaker is often easier to reason about than a vague wave of timeouts everywhere.

## 3.7 Before/After Diagrams

### Without circuit breaker

```text
App ---> failing service
App ---> failing service
App ---> failing service
App ---> failing service
        all keep waiting and failing slowly
```

### With circuit breaker

```text
App ---> breaker ---> failing service
           |
           +--> after threshold: fail fast locally
```

## 3.8 Code-Level Pseudocode

### Simple breaker

```text
failureCount = 0
state = "CLOSED"

function call():
    if state == "OPEN":
        raise "fast fail"

    try:
        result = downstreamCall()
        failureCount = 0
        return result
    catch error:
        failureCount += 1
        if failureCount >= 5:
            state = "OPEN"
        raise error
```

### Half-open recovery

```text
if state == "OPEN" and cooldownExpired():
    state = "HALF_OPEN"

if state == "HALF_OPEN":
    if trialRequestSucceeds():
        state = "CLOSED"
    else:
        state = "OPEN"
```

### With fallback

```text
function getRecommendations(userId):
    if breaker.isOpen():
        return []

    try:
        return recommendationService.fetch(userId)
    catch error:
        breaker.recordFailure()
        return []
```

## 3.9 Circuit Breaker vs Timeout vs Retry

```text
Timeout:
  stop waiting for one slow call

Retry:
  try again after failure

Circuit breaker:
  stop sending calls to a dependency that looks broadly unhealthy
```

### Relationship

These often work together:

- timeout detects slowness
- retry handles temporary blips
- circuit breaker protects against ongoing failure

## 3.10 Where It Is Used

- microservice-to-microservice calls
- DB wrappers
- external SDK clients
- payment APIs
- maps/geocoding providers
- recommendation/personalization services

## 3.11 Comparison Table

| Mechanism | Complexity | Latency impact | Protection strength | Tradeoff | Best use case |
|---|---:|---|---|---|---|
| Timeout | Low | reduces long waits | Medium | can trigger retries | slow operations |
| Retry | Low to Medium | may increase latency | Weak to Medium | can amplify load | transient failure |
| Circuit breaker | Medium | fast fail during outage | Strong | requests may fail earlier | unhealthy dependency |

## 3.12 How to Detect Need for a Breaker

Look for:

- high downstream error rate
- repeated timeout clusters
- retry spikes
- same dependency dominating traces during incidents
- exhausted caller threads waiting on failing dependency

## 3.13 Common Beginner Mistakes

- no half-open recovery stage
- threshold too low, causing flapping
- threshold too high, opening too late
- no fallback behavior
- breaker applied at wrong boundary
- assuming breaker alone replaces good timeouts and retries

## 3.14 Final takeaway for Circuit Breaker

Circuit breakers are not about hiding failure.
They are about **containing failure**.

---

# 4. Timeouts

## 4.1 What is a Timeout?

A **timeout** is the maximum amount of time a caller is willing to wait before giving up on an operation.

### Analogy: phone call waiting

If you call someone and they do not answer for a long time, you eventually hang up.
That “hang up now” threshold is the timeout.

### Plain English definition

Timeout means:

> “If this operation does not finish soon enough, stop waiting.”

## 4.2 Why Timeouts Matter

Many failures in distributed systems do not look like clear crashes.
They look like:

- slow responses
- hanging calls
- network stalls
- blocked reads

If you do not enforce timeouts:

- requests wait forever or too long
- worker threads remain occupied
- connection pools fill up
- user experience becomes terrible
- one slow dependency can freeze an entire chain

## 4.3 How Timeouts Work

```text
T0: request sent
T1: caller waits
T2: timeout threshold reached
T3: caller gives up
T4: caller may fail, retry, or fallback
```

### Important beginner lesson

A timeout does **not** mean the downstream definitely failed.
It only means:

> “The caller stopped waiting.”

This distinction matters a lot.
The downstream might still finish later.
That is why idempotency matters for retries.

## 4.4 Concrete Example

Suppose:

- profile service usually responds in **200 ms**
- occasional spike reaches **2 seconds**
- caller timeout is **500 ms**

### If timeout is too short

- requests may fail unnecessarily
- retries may increase traffic
- service may have answered eventually, but caller gave up too early

### If timeout is too long

- callers waste time waiting
- resources stay occupied
- failure detection is delayed

## 4.5 Good Timeout vs Bad Timeout

### Timeout too short

This creates:

- false failures
- retry amplification
- poor user experience

### Timeout too long

This creates:

- blocked resources
- slow incident detection
- long cascading waits across services

The right timeout depends on:

- dependency latency profile
- user expectations
- operation type
- retry strategy

## 4.6 Different Types of Timeouts

### Connect timeout
Time allowed to establish a connection.

### Read timeout
Time allowed to wait for response data.

### Write timeout
Time allowed to send request data.

### Request timeout
Overall end-to-end budget for a request.

### Idle timeout
How long a connection can sit inactive before closing.

These are not the same, and mixing them up causes subtle bugs.

## 4.7 Before/After Thinking

### Without timeouts

```text
App -> dependency hangs forever
App threads remain stuck
system degrades silently
```

### With timeouts

```text
App -> dependency slow
wait up to threshold
stop waiting
retry/fallback/fail fast
```

## 4.8 Code-Level Pseudocode

### Simple timeout wrapper

```text
function callWithTimeout():
    start timer 500ms
    result = downstreamCall()
    if timer expired:
        raise "timeout"
    return result
```

### Timeout + retry

```text
for attempt in 1..3:
    try:
        return callWithTimeout(500ms)
    catch timeout:
        waitWithBackoff()
raise "failed"
```

### Timeout + fallback

```text
try:
    return profileService.fetch(userId, timeout=300ms)
catch timeout:
    return cache.get("last-known-profile")
```

## 4.9 Timeouts vs Retries vs Circuit Breakers

```text
Timeout:
  stop waiting for one slow call

Retry:
  try again after failure

Circuit breaker:
  stop calling a dependency that looks broadly unhealthy
```

## 4.10 Comparison Table

| Setting | Risk if too short | Risk if too long | Main use |
|---|---|---|---|
| Connect timeout | false connection failures | slow connection hangs | network connection safety |
| Read timeout | false operation failures | blocked callers | slow response handling |
| Request timeout | user-visible false failure | resource exhaustion | end-to-end control |
| Idle timeout | too many reconnects | stale idle resources | connection lifecycle management |

## 4.11 How to Tune Timeouts

Use:

- p95 and p99 latency
- dependency SLAs
- request criticality
- user experience tolerance
- retry policy at caller layers

Example mindset:

- payments may need careful but bounded patience
- recommendation calls should usually have short budgets
- internal batch jobs may tolerate longer waits than interactive APIs

## 4.12 Common Beginner Mistakes

- no timeout at all
- same timeout for every dependency
- too-short timeout causing retry storms
- forgetting that downstream may still complete after timeout
- using long timeouts instead of fixing root slowness

## 4.13 Final takeaway for Timeouts

Timeouts are one of the smallest pieces of code with one of the largest reliability impacts.
They define when patience ends.
If you define that badly, everything built on top becomes unstable.

---

# 5. Connection Pool Exhaustion

## 5.1 What is Connection Pool Exhaustion?

A **connection pool** is a reusable collection of already-open connections to a database or service.

Instead of opening a brand-new DB connection for every request, the app borrows one from the pool and returns it afterward.

**Connection pool exhaustion** happens when:

- all available connections are already busy
- new requests have to wait
- waiting grows too long
- timeouts or failures begin

### Analogy: checkout counters

A store may have only 10 checkout counters.
If 200 customers arrive and each checkout becomes slow, the queue explodes.

That is what DB pool exhaustion feels like inside a backend.

## 5.2 Why Pools Exist in the First Place

Opening and closing connections repeatedly is expensive.
Pools help by:

- reusing connections
- reducing setup overhead
- improving throughput

But a pool is not magic.
It is still a limited shared resource.

## 5.3 How It Happens

1. requests arrive and need DB access
2. pool size is fixed, say 50
3. slow queries keep those 50 connections busy
4. new requests queue up waiting
5. latency rises
6. request timeouts begin
7. retries may make everything worse

### ASCII diagram

```text
500 requests arrive
   |
   v
Pool size = 50
   |
   +--> 50 active connections
   +--> 450 waiting
```

## 5.4 Concrete Example

Suppose:

- DB pool size = **50**
- concurrent requests = **500**
- each slow query takes **2 seconds**

Then:

- only 50 requests actively use DB at a time
- 450 wait
- if request timeout is 1 second, many fail before ever getting a connection

### Important lesson

Sometimes the issue is not that the DB is fully dead.
The issue is that requests cannot get a connection fast enough.

## 5.5 Why It Hurts

- requests wait even before query execution begins
- latency piles up invisibly
- retry traffic can worsen contention
- app appears randomly slow
- one slow query pattern can degrade the entire service

## 5.6 Root Causes

Common causes include:

- slow queries
- too much concurrency
- long transactions
- connection leaks
- DB contention
- excessive N+1 query patterns
- bad timeout settings

## 5.7 Solutions in Depth

### A) Optimize slow queries

Often the best fix is not pool tuning at all.
It is making each DB query finish faster.

### B) Increase pool size carefully

This helps only if the DB can truly handle more concurrent work.
Blindly raising the pool can move the bottleneck deeper into the DB.

### C) Add caching

Reduce how often the DB is needed.

### D) Reduce concurrency

Use backpressure, queueing, or concurrency limits so fewer requests compete for connections at once.

### E) Shorten transactions

Holding connections open longer than necessary starves the rest of the app.

### F) Move work async

Not every operation must happen inline during the user request.

## 5.8 Code-Level Pseudocode

### Acquire/release safely

```text
conn = pool.acquire()
try:
    runQuery(conn)
finally:
    pool.release(conn)
```

### Reject if DB wait too high

```text
if pool.waitTime() > 300ms:
    return "503 busy"
```

### Simple connection leak smell

```text
conn = pool.acquire()
runQuery(conn)
return result
```

If release is forgotten, the pool slowly dies.

## 5.9 Connection Pool Exhaustion vs DB Overload vs Thread Pool Exhaustion

```text
Connection pool exhaustion:
  app cannot borrow a DB connection quickly enough

DB overload:
  database itself cannot process safely

Thread pool exhaustion:
  app has no worker capacity left to handle requests
```

They often appear together, but they are not the same thing.

## 5.10 Comparison Table

| Problem | Main bottleneck | Typical symptom |
|---|---|---|
| Connection pool exhaustion | app-side DB connections | waiting for connection |
| DB overload | database compute/storage capacity | slow queries across the board |
| Thread pool exhaustion | app worker capacity | requests not getting CPU time |

## 5.11 How to Detect It

Look for:

- pool wait time rising
- active connections pinned at max
- long connection acquisition delays
- request timeout logs before query execution
- APM traces showing DB wait time
- connection leak symptoms after deploys

## 5.12 Common Beginner Mistakes

- increasing pool size blindly
- ignoring slow query root causes
- leaking connections
- long-running transactions
- assuming app slowness means DB slowness only

## 5.13 Final takeaway for Connection Pool Exhaustion

Connection pools are like shared oxygen tanks for DB access.
If they are all occupied, the rest of the app starts gasping.

---

# 6. Graceful Degradation

## 6.1 What is Graceful Degradation?

**Graceful degradation** means a system continues serving the most important functionality even when some dependencies or features are unavailable.

### Analogy: smaller restaurant menu

If the kitchen is under stress, a restaurant may switch to a smaller menu instead of shutting the whole restaurant.

That is graceful degradation.

### Plain English definition

Graceful degradation means:

> “The system keeps doing the most important things, even if it has to stop doing some less important ones.”

## 6.2 Why It Matters

A total outage is usually worse than reduced functionality.

Users often tolerate:

- missing recommendations
- delayed analytics
- simpler UI

They do not tolerate:

- not being able to log in
- not being able to pay
- losing access to core data

## 6.3 How It Works

```text
Dependency fails
   -> optional feature disabled
   -> main user journey still works
```

This is not accidental behavior.
It must be designed intentionally.

## 6.4 Concrete Example

### E-commerce product page

If recommendation service fails:

- title still loads
- image still loads
- price still loads
- checkout still works
- recommendation carousel disappears or is replaced with defaults

### Other examples

- chat app shows messages but no typing indicators
- streaming app shows catalog but no personalization
- travel app books ticket but delays email confirmation job

## 6.5 Critical vs Non-Critical Features

### Critical
- login
- session validation
- checkout
- payment confirmation
- order creation

### Non-Critical
- recommendations
- decorative counters
- rich previews
- analytics side effects
- optional enrichment APIs

This classification is one of the most important design decisions in resilient systems.

## 6.6 Techniques in Depth

### A) Default responses

Return empty or simplified safe defaults.

### B) Cached fallback data

If live personalization fails, show last-known-good data.

### C) Feature flags

Disable expensive or broken features without redeploying everything.

### D) Static fallback pages

Use cached or static versions of pages if some services are unavailable.

### E) Delayed processing

Do the non-critical task later instead of blocking the current request.

## 6.7 Before/After Diagrams

### Without graceful degradation

```text
Product page depends on recommendations
recommendation service fails
entire product page fails
```

### With graceful degradation

```text
Product page depends on recommendations
recommendation service fails
product page still works without recs
```

## 6.8 Code-Level Pseudocode

### Recommendation fallback

```text
function getProductPage(id):
    product = productService.get(id)
    try:
        recs = recommendationService.get(id)
    catch error:
        recs = []
    return { product, recs }
```

### Cached fallback on timeout

```text
try:
    return liveService.get()
catch timeout:
    return cache.get("last-known-good")
```

## 6.9 Graceful Degradation vs Failover

```text
Failover:
  switch to backup component

Graceful degradation:
  continue with reduced functionality
```

## 6.10 Comparison Table

| Approach | Complexity | UX effect | Resilience gain | Best use case |
|---|---:|---|---|---|
| Default fallback | Low | simplified response | Medium | optional fields |
| Cached fallback | Medium | better continuity | Medium to High | read-heavy features |
| Feature disablement | Medium | feature disappears | High | overload or broken dependency |
| Delayed async work | Medium | some features delayed | High | non-critical background effects |

## 6.11 How to Detect Need for It

- incidents caused by optional dependencies
- core user path blocked by enrichments
- incident reviews showing “nice-to-have” feature caused full outage
- user journey analysis reveals poor priority boundaries

## 6.12 Common Beginner Mistakes

- treating everything as equally critical
- no fallback UX
- blocking core flow on optional dependency
- degrading the wrong layer
- returning silent broken data instead of clear fallback behavior

## 6.13 Final takeaway for Graceful Degradation

Graceful degradation is a maturity signal.
It means the system designers have decided what must survive first.

---

# 7. Failover

## 7.1 What is Failover?

**Failover** means switching from a failed component to a backup component so the service can continue.

### Analogy: spare generator

If the main power source fails, a backup generator takes over.
That switch is failover.

### Plain English definition

Failover means:

> “When the primary fails, move to the backup fast enough that service can continue.”

## 7.2 Why It Matters

Redundancy by itself is not enough.
A backup that exists but never takes traffic is not helping at outage time.

Failover is the operational mechanism that makes redundancy useful.

## 7.3 How It Works

1. detect the failure
2. verify the backup is healthy enough
3. promote or activate the backup
4. redirect traffic
5. stabilize the system

### ASCII diagram

```text
Primary active ---> fails
        |
        v
Secondary promoted ---> traffic redirected
```

## 7.4 Concrete Example

### Primary DB + standby replica

Suppose:

- primary handles writes
- standby replica is ready
- failure detected in **10 seconds**
- promotion takes **20 seconds**

Total write disruption:

- roughly **30 seconds**

That may be acceptable or unacceptable depending on product needs.

## 7.5 Types of Failover

### Manual failover
A human operator triggers the switch.

#### Pros
- more control

#### Cons
- slower
- operationally stressful
- harder at 3 AM during incidents

### Automatic failover
System detects failure and switches automatically.

#### Pros
- faster recovery

#### Cons
- wrong detection can cause bad failovers
- needs trust in automation

### Active-passive
One side serves, the other waits.

### Active-active
Multiple sides serve simultaneously.

## 7.6 Common Problems During Failover

### Split brain
Two nodes both think they are primary.
This can cause conflicting writes.

### Stale replica
Backup may not have the latest data.

### DNS delay
Traffic switch may be delayed by DNS cache behavior.

### Session loss
If session state is not replicated properly, users may be logged out.

### Slow promotion
Failover may exist but take too long to help user experience meaningfully.

## 7.7 Code-Level / Config Examples

### Health-check based failover

```text
if primary.isHealthy():
    use primary
else if secondary.isHealthy():
    use secondary
else:
    fail
```

### Fallback routing

```text
try:
    return primaryService.call()
catch error:
    return secondaryService.call()
```

### Promotion concept sketch

```text
if leader_unhealthy and replica_up_to_date:
    promote(replica)
    redirect_traffic(replica)
```

## 7.8 Failover vs Redundancy vs Graceful Degradation

```text
Redundancy:
  extra copies exist

Failover:
  switch traffic to a backup

Graceful degradation:
  continue with reduced functionality
```

## 7.9 Comparison Table

| Strategy | Complexity | Downtime reduction | Cost | Tradeoff |
|---|---:|---|---:|---|
| Manual failover | Medium | Medium | Medium | slower human response |
| Automatic failover | High | High | Medium to High | automation correctness risk |
| Active-passive | Medium | Good | Medium | idle standby capacity |
| Active-active | High | Very high | High | consistency and routing complexity |

## 7.10 How to Detect Weak Failover

- failover drills fail
- standby is unhealthy or behind
- recovery time is too slow
- only primary is monitored closely
- failover path is untested in real conditions

## 7.11 Common Beginner Mistakes

- replicas with no switching mechanism
- untested failover
- assuming backups equal failover
- protecting stateless nodes but not stateful ones
- no validation that standby is actually usable

## 7.12 Final takeaway for Failover

Failover is not about owning backups on a diagram.
It is about **switching safely and quickly enough when reality breaks the primary path**.

---

# 8. Health Checks

## 8.1 What is a Health Check?

A **health check** is a test used to decide whether a service is alive and/or ready to receive traffic.

### Analogy: restaurant open vs able to cook

A restaurant may have lights on and staff inside, but if the kitchen is broken, it is not truly ready to serve customers.

The same is true for software.
A process may be running, but still not be healthy.

### Plain English definition

Health check means:

> “Is this service not just running, but actually fit for its current job?”

## 8.2 Why It Matters

If unhealthy instances keep receiving traffic:

- users see errors
- latency rises
- failover may not work properly
- load balancers make bad routing choices

## 8.3 Types of Health Checks

### Liveness check
Is the process alive at all?

### Readiness check
Can it safely receive new traffic right now?

### Startup check
Has it finished booting and warming up?

### Deep dependency check
Can it talk to required dependencies like DB, cache, or message broker?

## 8.4 How It Works

```text
Load balancer -> health checks instances
             -> routes only to healthy/ready ones
```

## 8.5 Concrete Example

A Kubernetes pod may be:

- alive from the OS point of view
- but unable to access the DB

In that case:

- liveness may still pass
- readiness should fail
- traffic should stop flowing to it

## 8.6 Shallow vs Deep Checks

### Shallow checks
Examples:

- process running
- HTTP server returns 200

#### Pros
- fast
- simple

#### Cons
- may miss real dependency failure

### Deep checks
Examples:

- DB reachable
- cache reachable
- migration finished
- queue connection healthy

#### Pros
- more realistic

#### Cons
- can be slower
- may flap if too aggressive

## 8.7 Code-Level Examples

### Simple `/health`

```text
return 200 if process is alive
```

### Dependency-aware `/ready`

```text
if db reachable and cache reachable:
    return 200
else:
    return 503
```

### Slightly richer readiness logic

```text
if warmupComplete and dbHealthy and queueHealthy:
    ready = true
else:
    ready = false
```

## 8.8 Health Checks vs Monitoring

```text
Health check:
  operational routing decision right now

Monitoring:
  broader visibility, trends, dashboards, alerting
```

Monitoring tells you the story.
Health checks make immediate control decisions.

## 8.9 Comparison Table

| Check type | Complexity | Accuracy | Risk |
|---|---:|---|---|
| Liveness | Low | Low to Medium | may hide deeper issue |
| Readiness | Medium | Good | needs tuning |
| Startup | Low to Medium | Good for boot control | mis-tuning delays rollout |
| Deep dependency | Medium to High | High | risk of flapping |

## 8.10 How to Tune Them

You must choose:

- check interval
- timeout
- failure threshold
- recovery threshold

Bad tuning can cause:

- false eviction of healthy nodes
- traffic staying on bad nodes too long
- flapping between healthy/unhealthy states

## 8.11 Common Beginner Mistakes

- always returning 200 from health endpoint
- putting deep dependency checks into liveness instead of readiness
- no readiness gate during warmup
- thresholds too sensitive or too slow
- assuming health checks replace monitoring

## 8.12 Final takeaway for Health Checks

Health checks are small but powerful.
They decide whether traffic should trust a service right now.
If that decision is wrong, resilience features above them stop working well.

---

# 9. Dead Letter Queue (DLQ)

## 9.1 What is a Dead Letter Queue?

A **Dead Letter Queue (DLQ)** is a special queue where repeatedly failing messages are moved so they stop blocking normal processing.

### Analogy: damaged parcels in a warehouse

If one damaged parcel keeps breaking the conveyor workflow, workers move it aside for inspection later instead of letting it jam the entire line.

That side area is the DLQ.

### Plain English definition

DLQ means:

> “This message failed too many times, so isolate it instead of retrying forever.”

## 9.2 Why It Exists

Some failures are temporary.
Retries help those.

Other failures are persistent:

- bad payload format
- unsupported version
- missing referenced entity
- logic bug in consumer
- poison message

If you retry those forever:

- queue capacity is wasted
- logs become noisy
- healthy messages may be delayed
- operational clarity gets worse

## 9.3 How It Works

1. message enters main queue
2. worker processes it
3. if it fails, retry policy applies
4. after retry limit, message moves to DLQ
5. operators or systems inspect and fix later

### ASCII diagram

```text
Main Queue -> Worker -> success
                 |
                 +-> fail -> retry
                 +-> fail again -> retry
                 +-> fail too many times -> DLQ
```

## 9.4 Concrete Example

### Email worker

Suppose:

- invalid email payload enters queue
- worker retries **5 times**
- all attempts fail
- message moves to DLQ

This prevents the broken message from being retried forever while newer healthy messages continue.

### Another example: payment event consumer

Suppose a consumer expects `currency` field but receives malformed event without it.
If every retry still fails, DLQ preserves the event for analysis instead of silently losing it.

## 9.5 Poison Messages

A **poison message** is a message that always fails processing because of:

- corrupt data
- unsupported schema
- code bug
- invalid state transition

DLQs are especially valuable for poison messages.

## 9.6 Solutions / Operational Patterns

### A) Retry limits

Do not retry forever.
Set a max retry count or max retry age.

### B) Quarantine failed messages

Keep them somewhere separate and inspectable.

### C) Manual review

Operators can inspect:

- payload
- error reason
- event source
- replay safety

### D) Replay after fix

Once the bug or data issue is fixed, replay the message safely.

### E) Alerting

DLQ growth should trigger investigation.

## 9.7 Code-Level Pseudocode

### Retry count handling

```text
if message.retryCount >= 5:
    moveToDLQ(message)
else:
    retry(message)
```

### Move-to-DLQ logic

```text
function handle(message):
    try:
        process(message)
    catch error:
        message.retryCount += 1
        if message.retryCount >= 5:
            dlq.push(message)
        else:
            mainQueue.push(message)
```

### With failure metadata

```text
message.lastError = error.code
message.failedAt = now()
moveToDLQ(message)
```

## 9.8 DLQ vs Retry Queue vs Main Queue

```text
Main Queue:
  normal processing path

Retry Queue:
  messages delayed for another attempt

DLQ:
  quarantine for repeated or terminal failure
```

## 9.9 Comparison Table

| Queue type | Purpose | Best use |
|---|---|---|
| Main queue | normal processing | standard workload |
| Retry queue | temporary retry | transient failure |
| DLQ | repeated failure quarantine | poison messages |

## 9.10 How to Detect Problems

Look for:

- DLQ size growing steadily
- message age increasing
- same failure reason repeating
- replay loops
- no operational ownership of DLQ items

## 9.11 Common Beginner Mistakes

- infinite retries with no DLQ
- ignoring the DLQ after building it
- replaying DLQ blindly without fixing root cause
- storing no failure metadata
- mixing temporary and permanent failures badly

## 9.12 Final takeaway for DLQ

A DLQ is not a garbage bin for forgotten failures.
It is a **controlled quarantine area** that protects the main flow while preserving evidence and recovery options.

---

# 10. How These Concepts Fit Together

These reliability concepts are not isolated.
In real systems, they often appear in chains.

## 10.1 A Typical Failure Chain

```text
Traffic spike
   -> rate limiting helps at edge
   -> if traffic still too high, load shedding protects core system
   -> slow dependencies hit timeout
   -> retries begin
   -> circuit breaker may open
   -> connection pools and queues come under pressure
   -> health checks remove bad instances
   -> failover shifts traffic to backups
   -> graceful degradation keeps core path alive
   -> failed async messages move to DLQ
```

## 10.2 A Useful Mental Model

### Edge protection
- rate limiting
- admission control

### Overload protection
- load shedding
- backpressure
- concurrency limits

### Dependency protection
- timeouts
- retries with care
- circuit breakers

### Availability protection
- health checks
- failover
- redundancy

### Failure isolation and recovery
- graceful degradation
- DLQs
- replay processes
- incident response

## 10.3 Common Combined Example

Imagine an e-commerce site during a flash sale:

- traffic surges
- rate limiting blocks abusive clients
- load shedding disables recommendations
- payment provider slows down
- payment calls hit timeout
- circuit breaker opens on payment enrichment dependency
- health checks stop routing to unhealthy app pods
- failover promotes standby DB if primary dies
- order-confirmation email worker sends malformed message to DLQ

That is what real reliability design looks like:

not one heroic feature, but **many layers working together**.

## 10.4 Final Global Takeaway

A reliable system is not one that never fails.
A reliable system is one that:

- fails in controlled ways
- protects the most important path first
- recovers safely
- exposes bad states clearly
- avoids turning small problems into large outages

### One sentence to remember

> Reliability is the art of deciding what the system should do when the world is not cooperating.
