# Retry Storm in Distributed Systems

**TL;DR:** A **retry storm** happens when failed or slow requests are retried by many clients or services at the same time, creating extra traffic that makes the struggling system even more overloaded.

## 1. What is a Retry Storm?

Let’s begin in plain English.

A **retry** means trying the same request again after it fails or times out.

That sounds reasonable. In fact, retries are often useful.

But a **retry storm** happens when:

- a service becomes slow or temporarily fails
- many clients decide to retry
- those retries hit the service together
- the extra traffic makes recovery even harder

So the system creates its **own extra traffic** while already under stress.

### Simple analogy: busy phone line

Imagine a concert ticket hotline.

- 10,000 people call at the same time
- the phone line becomes busy
- instead of waiting, everyone hangs up and redials immediately
- the redialing creates even more call attempts
- the phone system gets even more overloaded

That is a retry storm.

### Core idea

The original problem may be small:

- one slow server
- one brief DB pause
- one network hiccup

But retries can turn that small issue into a much bigger outage.

### ASCII picture

```text
Initial traffic -> service slows down
              -> clients retry
              -> more traffic hits service
              -> service slows down more
```

### Beginner definition

A retry storm is:

> a failure amplification problem where retry logic multiplies traffic instead of helping recovery.

---

## 2. Quick Connection to Thundering Herd / Cascading Failure

Retry storms are closely related to other system design problems.

### Connection to Thundering Herd

A **thundering herd** happens when many clients wake up or act at the same time.

A retry storm often behaves like a thundering herd because:

- many clients hit timeout
- many clients retry together
- all of them rush the same service at once

### Connection to Cascading Failure

A **cascading failure** means one problem spreads and causes more problems in other parts of the system.

Retry storms often cause cascading failures because:

- Service A slows down
- callers retry more
- Service A now calls DB or cache more heavily
- DB or cache slows down too
- more services time out and retry

### Mental model

```text
Small slowdown
   -> retries
   -> traffic surge
   -> downstream overload
   -> more failures
```

### Simple relationship diagram

```text
Retry Storm
   -> looks like a thundering herd of retries
   -> can trigger cascading failure across services
```

---

## 3. How It Happens

Here is the typical step-by-step path.

### Step-by-step breakdown

1. A service becomes slow
2. Clients wait for a response
3. Some clients hit their timeout limit
4. Those clients retry the same request
5. Many retries happen around the same time
6. Total traffic rises above the original level
7. The service gets even more overloaded
8. Downstream systems like cache or database also get stressed
9. More requests fail or time out
10. More retries happen

### ASCII request flow

```text
Clients
  |
  +--> Request 1 ---------------------> Service
  +--> Request 2 ---------------------> Service
  +--> Request 3 ---------------------> Service
  +--> Request 4 ---------------------> Service
                                          |
                                          v
                                      Service slows
                                          |
                                          v
                            Some requests time out at clients
                                          |
                                          v
Clients retry all timed-out requests again
                                          |
                                          v
                                  More traffic than before
```

### Simple timeline

```text
Time ------------------------------------------------------>

T0: normal traffic
T1: service becomes slow
T2: some clients time out
T3: clients retry
T4: traffic doubles or triples
T5: service gets slower
T6: even more timeouts and retries
```

### Another visual

```text
Original requests:   10,000
Timed out requests:   4,000
Retries:              4,000 more
Second retry round:   2,000 more

Total actual requests handled attempt-wise: 16,000
```

### Why synchronization is dangerous

If all clients retry **immediately** or after the same exact delay, the retries line up and hit the service together.

```text
Bad pattern:
All clients retry after exactly 1 second
```

That creates a giant burst.

---

## 4. Concrete Example

Let’s use a **payment API during a flash sale**.

### Scenario

Assume:

- original checkout traffic: **10,000 requests per second**
- payment service is usually healthy at that load
- due to a brief DB slowdown, payment latency rises sharply
- client timeout is **800 ms**
- each client retries up to **2 times**

### What should happen ideally?

If the payment service is slightly slow, you want:

- some patience
- controlled retries
- no synchronized retry burst

### What happens in a retry storm?

Suppose in one second:

- **10,000 original requests** arrive
- **6,000** of them time out at the client
- all 6,000 retry once
- of those, **3,000** time out again and retry again

Now actual service attempts become:

- original: **10,000**
- first retries: **6,000**
- second retries: **3,000**

Total:

$$10{,}000 + 6{,}000 + 3{,}000 = 19{,}000$$

So 10,000 real user requests create **19,000 service calls**.

### Worse scenario with more aggressive retries

If every request retries twice regardless of system condition:

- original: **10,000**
- retry 1: **10,000**
- retry 2: **10,000**

Total attempts:

$$30{,}000$$

If there are retries at multiple layers, the number can go even higher.

### Multi-layer retry example

Suppose:

- client retries 2 times
- API gateway retries 1 time
- service SDK retries 2 times

Then one logical request may produce multiple downstream attempts.

This is how **10,000** user requests can become **30,000**, **50,000**, or even more effective requests downstream.

### ASCII diagram

```text
Users -> Checkout API -> Payment Service -> Payment DB

Original traffic: 10,000 req/s
Payment latency rises
        |
        v
6,000 clients time out and retry
        |
        v
Payment Service now sees 16,000 req/s
        |
        v
More timeouts happen
        |
        v
Second retry round pushes traffic even higher
```

### Hotstar live score example

A live score service may get:

- **20,000 requests per second** during an IPL match
- backend becomes slow for 2 seconds
- app clients retry immediately on timeout

That 2-second slowdown can turn into a much larger wave of requests, making the service collapse harder than the original slowdown would have.

---

## 5. Why It’s Dangerous

Retry storms are dangerous because they create **multiplied traffic under already bad conditions**.

### 5.1 Multiplied traffic

Retries are not free.
Every retry is another request the system must process.

### 5.2 Extra CPU and connection usage

Each extra attempt uses:

- CPU to parse and handle the request
- memory for request state
- network bandwidth
- database or cache connections

### 5.3 Queue buildup

When requests arrive faster than the system can finish them:

- queues build up
- waiting time grows
- even healthy requests start timing out

### 5.4 Database overload

The struggling service often depends on a database.
When retries grow traffic:

- DB sees more queries
- DB response time increases
- connections stay busy longer
- app gets even slower

### 5.5 Tail latency

**Tail latency** means the slowest requests, such as the worst 1%.

Retry storms make tail latency worse because:

- overloaded queues create long waits
- those long waits cause even more timeouts
- more timeouts trigger more retries

### 5.6 Cascading failures across services

One service under retry pressure may overload other dependencies.

Example:

- API retries hammer user service
- user service hammers cache and DB
- cache and DB slow down
- more APIs start failing

### ASCII compounding loop

```text
Slow service
   -> client timeout
   -> retries
   -> more incoming requests
   -> larger queue
   -> slower responses
   -> more timeouts
   -> more retries
```

### Full chain

```text
Original slowdown
    -> retry traffic added
    -> CPU rises
    -> connections fill
    -> queue grows
    -> DB slows
    -> latency spikes
    -> more retries
    -> outage expands
```

### Beginner summary

The danger is not just the original failure.
The danger is that retry logic can **pour fuel on the fire**.

---

## 6. Where Retry Storms Usually Come From

Retry storms can start from many layers.

### 6.1 Client SDKs with automatic retries

An **SDK** is a library developers use to call a service.

Some SDKs automatically retry on timeout or certain errors.
That is useful, but dangerous if poorly configured.

### 6.2 Load balancers or proxies retrying

A **proxy** forwards requests to another service.
Some proxies retry failed upstream requests automatically.

### 6.3 API gateways

An **API gateway** is the front door for many APIs.
If it retries on behalf of clients, it can multiply traffic.

### 6.4 Background workers

Workers may retry failed jobs quickly, especially if queues are large.

### 6.5 Cron jobs

A **cron job** is a scheduled task.
If many cron jobs start together and retry failures aggressively, they can create a retry storm.

### 6.6 Humans manually refreshing or resubmitting

Users can become part of the storm too.

Examples:

- repeatedly refreshing a stuck page
- clicking “Pay Now” many times
- re-submitting forms

### ASCII source diagram

```text
User app retries
Gateway retries
Service SDK retries
Worker retries
Human refreshes
        |
        v
All stack together on same struggling service
```

---

## 7. Solutions in Depth

Below are the main ways to reduce retry storms.

---

### 7.1 Exponential backoff

**Backoff** means waiting before retrying.

**Exponential backoff** means the wait time grows after each failed attempt.

Example:

- retry 1 after 100 ms
- retry 2 after 200 ms
- retry 3 after 400 ms

### Before

```text
Failure -> retry immediately -> retry immediately -> retry immediately
```

### After

```text
Failure -> wait 100ms -> retry
        -> wait 200ms -> retry
        -> wait 400ms -> retry
```

### ASCII diagram

```text
Without backoff:
R R R R R  all at once

With backoff:
R   R     R        spread out over time
```

### Why it helps

- reduces retry bursts
- gives the service time to recover

---

### 7.2 Jitter

**Jitter** means adding randomness to retry timing.

Without jitter, clients using the same backoff schedule may still retry together.

### Before

```text
All clients retry at 1s, then 2s, then 4s
```

### After

```text
Client A retries at 1.1s
Client B retries at 1.6s
Client C retries at 2.0s
Client D retries at 1.3s
```

### ASCII diagram

```text
Without jitter:
| retry retry retry retry retry |

With jitter:
| retry   retry     retry  retry    retry |
```

### Why it helps

- breaks synchronization
- prevents herd-like retry bursts

---

### 7.3 Capped retries

A **capped retry** means setting a maximum number of retries.

### Before

```text
Keep retrying until success
```

### After

```text
Retry at most 2 or 3 times, then fail fast
```

### Why it helps

- limits traffic multiplication
- prevents endless retry loops

---

### 7.4 Circuit breaker

A **circuit breaker** is a protective pattern.
When too many failures happen, it stops sending requests for a while.

### States

- **Closed**: normal traffic flows
- **Open**: requests are blocked or failed fast
- **Half-open**: a few test requests are allowed to see if recovery happened

### Before

```text
Clients keep hitting broken service
```

### After

```text
Too many failures -> breaker opens -> traffic paused -> service can recover
```

### ASCII diagram

```text
Normal -> failures rise -> circuit opens
                        -> retries stop hitting downstream constantly
```

### Why it helps

- protects downstream service
- prevents endless hammering during outages

---

### 7.5 Request hedging vs retries

These are related but not the same.

### Retry

Retry means:

- wait for failure or timeout
- then send another attempt

### Request hedging

**Hedging** means sending a second request only when the first is unusually slow, often to reduce tail latency.

### Important contrast

Hedging can help in controlled cases, but if used carelessly, it can also add traffic.

### Simple comparison

```text
Retry:  first fails -> send second
Hedge:  first is slow -> maybe send second before failure
```

### Beginner guidance

Retries are for recovery.
Hedging is for latency optimization.
Both need traffic control.

---

### 7.6 Rate limiting / load shedding

**Rate limiting** restricts how many requests are allowed.

**Load shedding** means deliberately dropping some traffic so the system can protect itself.

### Before

```text
Accept everything -> system collapses
```

### After

```text
Reject or delay excess traffic -> core system survives
```

### ASCII diagram

```text
Incoming burst -> limiter/shedder -> allowed traffic passes
                              -> extra traffic rejected early
```

### Why it helps

- prevents total meltdown
- protects critical paths

---

### 7.7 Idempotency keys

An **idempotent** operation is one that can be safely repeated without causing duplicate side effects.

An **idempotency key** is a unique request ID used to detect repeated attempts of the same logical operation.

Example:

- payment request sent twice
- server sees same idempotency key
- server avoids charging twice

### Why it helps

It does not stop the retry storm itself, but it makes retries **safer** for operations like:

- payments
- order creation
- booking

### ASCII diagram

```text
Client retries payment with same idempotency key
        |
        v
Server recognizes duplicate logical request
        |
        v
No double charge
```

---

### 7.8 Queueing and buffering

A **queue** can absorb spikes and let workers process at a safer pace.

### Before

```text
All retries hit service directly
```

### After

```text
Requests -> queue -> workers process gradually
```

### Why it helps

- smooths bursts
- protects downstream systems

### Tradeoff

- increased delay
- queue lag becomes important to monitor

---

### 7.9 Better timeout tuning

A **timeout** is how long a caller waits before giving up.

Bad timeout settings can create unnecessary retries.

### Too short timeout

```text
Service would have replied in 900ms
Client timeout is 500ms
Client retries unnecessarily
```

### Better timeout

```text
Timeout reflects realistic service latency
```

### Why it helps

- fewer false timeouts
- fewer unnecessary retries

---

## 8. Code-Level Pseudocode

### 8.1 Retry with exponential backoff + jitter

```text
maxRetries = 3
baseDelay = 100ms

for attempt in 1 to maxRetries:
    result = callService()
    if result is success:
        return result

    delay = baseDelay * (2 ^ (attempt - 1))
    jitter = random(0, 150ms)
    sleep(delay + jitter)

raise "request failed after retries"
```

### What this does

- limits retries
- spaces them out
- adds randomness to avoid synchronization

---

### 8.2 Simple circuit breaker logic

```text
failureCount = 0
breakerState = "CLOSED"

function callWithBreaker():
    if breakerState == "OPEN":
        raise "service unavailable fast-fail"

    try:
        result = callService()
        failureCount = 0
        return result
    catch error:
        failureCount += 1
        if failureCount >= 5:
            breakerState = "OPEN"
        raise error
```

### What this does

- tracks repeated failures
- opens the breaker after too many failures
- stops hammering the service continuously

---

### 8.3 Retry limit per request

```text
function processRequest(request):
    if request.retryCount >= 2:
        raise "retry limit exceeded"

    request.retryCount += 1
    return send(request)
```

---

## 9. Retry Storm vs Thundering Herd vs Traffic Spike

These are related but not the same.

### Retry storm

- extra traffic created by the system itself after failure or timeout

### Thundering herd

- many clients or workers act at the same time after a shared event

### Traffic spike

- genuine increase in real user demand

### Comparison diagram

```text
Traffic spike:
Users suddenly arrive in large numbers

Thundering herd:
Many clients wake up / retry / refresh together after one event

Retry storm:
Failures cause retries
Retries create even more traffic than original user demand
```

### Simple examples

```text
Traffic spike:
A cricket final starts and real users flood the app

Thundering herd:
A cache key expires and many requests fall through together

Retry storm:
A slow service causes timeouts, and clients generate extra traffic by retrying
```

### Important note

A traffic spike can trigger a thundering herd.
A thundering herd can contribute to a retry storm.
A retry storm can cause cascading failure.

---

## 10. Comparison Table

| Strategy | Complexity | Effect on latency | Protection strength | Tradeoffs | When to use |
|---|---:|---|---|---|---|
| Exponential backoff | Low to Medium | Increases retry wait time | Good | Slower recovery for some requests | Default retry behavior |
| Jitter | Low | Small added unpredictability | Very good when combined with backoff | Slightly less deterministic timing | Any retrying clients at scale |
| Capped retries | Low | May fail faster | Good | Some requests give up sooner | All systems with retries |
| Circuit breaker | Medium | Fast-fail during outage | Strong | Can reject requests during recovery | Unhealthy downstream dependency |
| Request hedging | Medium to High | Can reduce tail latency | Mixed, depends on careful use | Adds extra traffic if misused | Rare slow-request optimization |
| Rate limiting / load shedding | Medium | Some requests rejected/delayed | Strong | User-facing errors increase temporarily | Protecting overloaded services |
| Idempotency keys | Medium | Little direct latency effect | Strong for correctness | Extra storage/state handling | Payments, orders, bookings |
| Queueing / buffering | Medium | Adds delay | Strong for burst smoothing | More async complexity | Background work and bursty traffic |
| Better timeout tuning | Low to Medium | Often reduces false retries | Good | Requires measurement and tuning | All networked services |

### Quick summary

```text
Best default retry pattern:      backoff + jitter + retry cap
Best outage protection:          circuit breaker + load shedding
Best duplicate-safety feature:   idempotency keys
Best for burst smoothing:        queueing
```

---

## 11. How to Detect a Retry Storm

### 11.1 Request rate suddenly higher than user traffic

If the service sees far more requests than the actual user action rate suggests, retries may be inflating traffic.

### 11.2 Retry counters in logs

Logs may show:

- `attempt=2`
- `retry=true`
- repeated request IDs

These are strong clues.

### 11.3 API gateway / load balancer metrics

Look for:

- rising upstream retries
- error spikes
- timeout spikes
- request rate multiplication between layers

### 11.4 Distributed tracing

A **distributed trace** shows one request path across many services.

Look for:

- repeated attempts for the same logical request
- same dependency called multiple times

### 11.5 Queue depth growth

If retries are creating more work than the system can process:

- queue length grows
- worker lag grows
- retry delay schedules pile up

### 11.6 APM tools like Datadog / New Relic

**APM** means **Application Performance Monitoring**.

These tools can help show:

- latency spikes
- error spikes
- retry counters
- downstream call explosion

### ASCII detection flow

```text
Users stable
   but
service request rate jumps
   -> suspect retries
   -> inspect logs, traces, gateway metrics
   -> confirm duplicated attempts
```

### Rule of thumb

If user traffic stays flat but backend request volume jumps, a retry storm is a strong suspect.

---

## 12. Common Beginner Mistakes

### Mistake 1: Retrying immediately with no delay

#### Why it backfires

- creates instant traffic multiplication
- gives the service no recovery time

---

### Mistake 2: Retrying non-idempotent requests unsafely

Examples:

- charging a card
- creating an order
- booking a seat

#### Why it backfires

- duplicates may happen
- users may be charged or booked twice

---

### Mistake 3: Setting very short timeouts

#### Why it backfires

- requests that were merely slow get treated as failures
- unnecessary retries get created

---

### Mistake 4: Allowing every layer to retry independently

Examples:

- mobile app retries
- gateway retries
- service SDK retries
- worker retries

#### Why it backfires

Each layer multiplies the total request count.
A small slowdown becomes a huge storm.

---

## Final Summary

A retry storm happens when a struggling system gets hit by a wave of **extra requests created by retry logic**.

### Core pattern

```text
Service slows
   -> callers time out
   -> callers retry
   -> traffic multiplies
   -> service slows more
```

### Main defenses to remember

- exponential backoff
- jitter
- capped retries
- circuit breaker
- load shedding
- safe retries with idempotency keys
- realistic timeout settings

### Beginner takeaway

Retries are useful only when they are **controlled**.
If retries happen too quickly, too often, or at too many layers, they stop being a recovery tool and become part of the outage itself.
