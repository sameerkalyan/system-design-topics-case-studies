# Duplicate Requests / Idempotency Gap in Distributed Systems

**TL;DR:** **Duplicate requests** happen when the same logical action is sent more than once, and an **idempotency gap** happens when the system does not safely recognize and handle those duplicates, causing repeated side effects like double payment, double order creation, or duplicate jobs.

## 1. What is Duplicate Requests / Idempotency Gap?

Let’s start in plain English.

A **duplicate request** means the same action reaches the system more than one time.

Examples:

- a user clicks **Pay Now** twice
- a mobile app retries a request after a timeout
- an API gateway retries a request automatically
- a webhook is delivered again
- a worker reprocesses the same message after a crash

An **idempotency gap** means the system has **no safe protection** against those repeated attempts.

### Define the important term: idempotency

An operation is **idempotent** if doing it multiple times has the same final effect as doing it once.

Example:

- “set order status to `paid`” can be idempotent if repeating it changes nothing after the first success
- “charge card ₹500” is **not automatically safe** to repeat unless the system prevents duplicate charges

### Plain English definition

This problem means:

> The system receives the same logical request more than once, but treats each copy like a brand-new action.

That is the gap.

### Relatable analogy: online payment button

Imagine you are buying concert tickets.

- you tap **Pay Now**
- the page freezes for 3 seconds
- you think nothing happened
- you tap **Pay Now** again
- both requests reach the server
- the card gets charged twice

That is a duplicate request problem.

The missing safety that should have prevented the second charge is the **idempotency gap**.

### ASCII diagram

```text
User taps Pay Now
      |
      v
Request A -----------------> Server
User taps again
      |
      v
Request B -----------------> Server

If server treats A and B as separate payments:
Double charge happens
```

---

## 2. Why It Matters

This problem matters because distributed systems are full of retries, timeouts, network glitches, crashes, and race conditions.

A **race condition** means the final result depends on the order or timing of events happening close together.

Even if users behave perfectly, duplicates can still happen because:

- clients retry after timeout
- proxies retry
- workers restart and re-read the same message
- webhook senders retry until acknowledged

### Why one duplicate can be expensive

Duplicate side effects can cause:

- double payment
- duplicate order
- duplicate ticket booking
- repeated emails or SMS
- inventory reduced twice
- the same background job running again

### ASCII picture

```text
One logical action
      |
      +--> Request copy 1
      +--> Request copy 2
      +--> Request copy 3

Without duplicate protection:
1 action becomes 3 side effects
```

### Beginner summary

This is not just a “networking bug.”
It is a **business correctness problem**.

---

## 3. How It Happens

Duplicate requests can happen in many ways.

### Step-by-step flow

1. User or service sends a request
2. Server starts processing it
3. Response is delayed, lost, or timeout happens
4. Caller does not know whether the action succeeded
5. Caller retries the same request
6. Server receives the retry as if it were new
7. The same side effect happens again

### ASCII request flow

```text
Client -> Create Order request -> Server
                    |
                    v
              Server processes it
                    |
             Response lost / delayed
                    |
                    v
Client thinks request failed
                    |
                    v
Client retries same request
                    |
                    v
Server creates order again
```

### Timeline example

```text
T0: Client sends payment request
T1: Server charges card successfully
T2: Response times out before client receives it
T3: Client retries payment request
T4: Server charges card again
```

### Common causes

- user double click
- mobile app resend after bad network
- browser refresh or form resubmit
- API gateway retry
- webhook redelivery
- worker retry after crash
- queue system delivering at least once

### Important delivery term

**At-least-once delivery** means a message system guarantees a message will be delivered one or more times.

That is useful for reliability, but it means duplicates are possible and must be handled safely.

---

## 4. Concrete Example

Let’s use an e-commerce payment example.

### Scenario

Assume:

- checkout endpoint receives **5,000 payment attempts per minute**
- client timeout is **2 seconds**
- payment service sometimes responds in **3 seconds** during peak load
- app retries once after timeout

### What happens

1. Customer taps pay
2. Payment service actually succeeds in 3 seconds
3. But client gives up after 2 seconds
4. Client retries payment
5. Payment service processes second request too

### Numbers

Suppose in one minute:

- 5,000 original payment requests
- 500 of them time out at client side
- all 500 retry once

If the system lacks idempotency protection:

- up to **500 duplicate payment attempts** may happen

### Worse case

If even 10% of those retries become actual duplicate charges:

$$500 \times 10\% = 50$$

That means:

- **50 users may be double charged in one minute**

### ASCII diagram

```text
5,000 pay requests/min
      |
      v
500 slow responses exceed timeout
      |
      v
500 retries sent
      |
      v
Without idempotency:
500 extra payment attempts may execute
```

### Another example: order creation

Suppose:

- `POST /orders` creates a new order row
- one mobile client retries after network timeout
- server inserts a new row both times

Instead of one order:

- order #9001
- order #9002

Two orders appear for one purchase intention.

---

## 5. Why It’s Dangerous

Duplicate requests are dangerous because they create **incorrect side effects**, not just slow performance.

### 5.1 Double side effects

Examples:

- double charge
- double shipment
- duplicate booking
- duplicate user signup email
- same coupon consumed twice

### 5.2 Data inconsistency

Different systems may disagree.

Example:

- payment system says charged twice
- order system shows one order
- ledger shows two entries

### 5.3 Customer trust damage

Users may forgive slowness.
They rarely forgive being charged twice.

### 5.4 Hard-to-debug incidents

These bugs are tricky because they often depend on timing:

- timeout happened
- response got lost
- retry hit a race window

### 5.5 Retry storms make it worse

If a service is slow, many retries can happen.
That not only increases load, but also increases duplicate risk.

### ASCII danger loop

```text
Slow response
   -> caller retries
   -> duplicate request arrives
   -> second side effect happens
   -> data mismatch / user complaint / refund work
```

### Plain English summary

This issue is dangerous because the system may look “available” but still be **wrong**.

---

## 6. Where Duplicate Requests Usually Come From

### 6.1 User actions

- double click
- page refresh
- form resubmit
- tapping button many times on mobile

### 6.2 Client retries

Apps often retry after:

- timeout
- connection reset
- temporary 5xx error

### 6.3 Gateways and proxies

A gateway or proxy may retry upstream calls automatically.

### 6.4 Webhooks

Webhook providers often retry until they get a success acknowledgment.

### 6.5 Message queues and workers

Queues with at-least-once delivery may deliver the same message again.

### 6.6 Crash recovery

A worker may complete side effects, crash before saving final state, and then replay the same task after restart.

### ASCII source diagram

```text
User retry
Client SDK retry
Gateway retry
Webhook redelivery
Worker replay
        |
        v
All can produce duplicates of one logical action
```

---

## 7. Solutions in Depth

Below are the major ways to prevent or reduce this problem.

---

### 7.1 Idempotency keys

An **idempotency key** is a unique client-provided identifier for one logical action.

Example:

```text
Idempotency-Key: pay_8f3a91_order_123
```

The server stores the result for that key.
If the same key comes again:

- do not perform the side effect again
- return the same previous result

### Before

```text
Request A -> process payment
Request A retry -> process payment again
```

### After

```text
Request A with key K -> process payment and store result
Request A retry with key K -> return stored result, no new charge
```

### ASCII diagram

```text
Client -> POST /payments (key=abc123)
              |
              v
       Server checks key store
              |
      not found -> process + save result
      found     -> return old result
```

### Why it helps

- best protection for unsafe operations like create/charge/book
- works well with retries

---

### 7.2 Database uniqueness constraints

A **uniqueness constraint** means the database refuses duplicate values in a protected column or column combination.

Example:

- unique `payment_reference`
- unique `external_order_id`

### Before

```text
Two inserts with same logical payment reference both succeed
```

### After

```text
Second insert fails because unique key already exists
```

### Why it helps

- strong final safety net
- protects against race conditions at storage level

### Tradeoff

- prevents duplicate records, but by itself may not return the exact original response nicely

---

### 7.3 Upsert / insert-if-not-exists

An **upsert** means:

- insert if record does not exist
- otherwise update or reuse existing row

This is useful for operations that should create one durable record exactly once.

### Example

```text
Create job execution record only if request_id not seen before
```

### Why it helps

- avoids duplicate row creation
- useful in event processing and task systems

---

### 7.4 Safe retry design

Not every endpoint should be retried the same way.

Examples:

- `GET /product/123` is usually safe to retry
- `POST /charge-card` is dangerous without idempotency protection

### Rule

Retry unsafe operations only when:

- they are protected by idempotency keys
- or they are made idempotent in another strong way

---

### 7.5 Deduplication tables / processed-message store

For event-driven systems, store a record of processed message IDs.

### Before

```text
Message delivered twice -> worker processes twice
```

### After

```text
Message ID already seen -> skip duplicate processing
```

### ASCII diagram

```text
Queue message -> Worker -> check processed_message_ids
                         |
                         +-> seen before? skip
                         +-> not seen? process and mark seen
```

### Why it helps

- common pattern for queues, webhooks, and events

---

### 7.6 UI / UX protections

Some duplicate requests start from the user interface.

Examples:

- disable button after first click
- show spinner
- prevent form resubmission

### Why it helps

- reduces accidental duplicates at the source

### Important note

UI protection is helpful, but **not enough by itself**.
The backend must still be safe.

---

## 8. Code-Level Pseudocode

### 8.1 Idempotency key handling

```text
function createPayment(request):
    key = request.idempotencyKey

    existing = idempotencyStore.find(key)
    if existing exists:
        return existing.savedResponse

    result = paymentGateway.charge(request.amount, request.card)
    idempotencyStore.save(key, result)
    return result
```

### What this does

- checks whether this logical request was already processed
- if yes, returns old result
- if no, processes once and stores response

---

### 8.2 Deduplicating queue messages

```text
function handleMessage(message):
    if processedMessages.contains(message.id):
        return "skip duplicate"

    doBusinessLogic(message)
    processedMessages.add(message.id)
    return "processed"
```

### What this does

- prevents same message from creating repeated side effects

---

### 8.3 Database uniqueness example (logic)

```text
function createOrder(request):
    try:
        insert into orders(external_request_id, user_id, total)
        values(request.requestId, request.userId, request.total)
        return "created"
    catch unique_constraint_error:
        return "already created earlier"
```

---

## 9. Duplicate Requests vs Retry Storm vs Race Condition

These are related but different.

### Duplicate request

- same logical action is sent more than once

### Retry storm

- retries multiply traffic and overload the system

### Race condition

- timing/order of operations creates inconsistent or incorrect result

### Comparison diagram

```text
Duplicate request:
Same action arrives twice

Retry storm:
Many retries create too much traffic

Race condition:
Two operations happen close together and timing changes outcome
```

### Important note

These can happen together.

Example:

- slow service causes retries
- retries send duplicate payment attempts
- two attempts race and create inconsistent records

---

## 10. Comparison Table

| Solution | Complexity | Protection strength | Latency impact | Tradeoffs | Best use case |
|---|---:|---|---|---|---|
| Idempotency keys | Medium | Very strong | Very low | Need storage and key design | Payments, bookings, order creation |
| DB uniqueness constraints | Low to Medium | Strong | Very low | Not enough alone for rich response replay | Preventing duplicate rows |
| Upsert / insert-if-not-exists | Medium | Strong | Low | Operation-specific design needed | Durable create/update flows |
| Deduplication table / processed IDs | Medium | Strong | Low | Storage cleanup and retention needed | Queues, webhooks, event consumers |
| Safe retry policy | Low to Medium | Medium | Depends on timeout/backoff | Must classify safe vs unsafe operations | API clients and service calls |
| UI button disable / spinner | Low | Weak alone, helpful extra layer | Very low | Cannot protect against network retries alone | User-facing forms and checkout |

### Quick summary

```text
Best backend protection:      idempotency keys
Best storage safety net:      unique constraints
Best event-processing guard:  processed-message store
Best UX improvement:          disable repeated submit
```

---

## 11. How to Detect Duplicate Requests / Idempotency Gaps

### 11.1 Repeated request IDs or idempotency keys

Look for the same logical request appearing multiple times.

### 11.2 Duplicate business records

Examples:

- same external payment reference twice
- same order created twice
- same webhook event processed twice

### 11.3 Customer complaints

Common signals:

- “I was charged twice”
- “I got two confirmation emails”
- “Why do I see duplicate orders?”

### 11.4 Logs and tracing

Check logs for:

- timeout followed by retry
- same user action producing multiple create calls
- duplicate message IDs processed by workers

### 11.5 APM and dashboards

Tools like Datadog, New Relic, Grafana, or cloud logs can help spot:

- high retry counts
- repeated POSTs
- repeated side effects for one business entity

### ASCII detection flow

```text
User reports duplicate charge
        |
        v
Check logs for same logical request repeated
        |
        v
Check whether backend had idempotency key or unique guard
        |
        v
Find idempotency gap in create/charge flow
```

### Rule of thumb

If one business action can be observed twice in production, assume duplicates are possible and design for them explicitly.

---

## 12. Common Beginner Mistakes

### Mistake 1: Thinking retries are safe for every endpoint

#### Why it backfires

`GET` requests are often safe to retry.
`POST` actions like charge/create/book are often **not** safe unless protected.

---

### Mistake 2: Relying only on the UI to stop duplicates

#### Why it backfires

Even if the button is disabled:

- mobile network retries can still happen
- proxies can retry
- users can reopen app/web page

Backend must still be safe.

---

### Mistake 3: Using a unique constraint but not handling the second request properly

#### Why it backfires

The database may block duplicate creation, but the client may still see a confusing error instead of the original successful result.

---

### Mistake 4: Forgetting queue/event consumers need deduplication too

#### Why it backfires

At-least-once delivery systems intentionally allow repeat delivery for reliability.
Without deduplication, duplicate side effects are expected.

---

## Final Summary

Duplicate requests happen when the same logical action reaches the system more than once.
An idempotency gap happens when the backend has no strong way to recognize and safely handle those duplicates.

### Core pattern

```text
Timeout / retry / double click / replay
    -> same logical action arrives again
    -> backend treats it as new
    -> duplicate side effect happens
```

### Main defenses to remember

- idempotency keys
- unique constraints
- upsert / insert-if-not-exists
- processed-message deduplication
- safe retry policies
- UI protections as a helpful extra layer

### Beginner takeaway

In distributed systems, **“sent once” does not mean “received once,” and “received once” does not mean “processed once.”**
So for any operation that changes money, orders, bookings, inventory, or durable state, always design for duplicates explicitly.
