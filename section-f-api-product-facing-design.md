# Section F: API / Product-Facing Design

This document covers three core system design concepts from Section F of your prompt library:

1. Polling vs Webhooks vs WebSockets
2. API Versioning
3. Session Management / Sticky Sessions

## How to Use This for Interviews

This document is designed for both:

- **deep understanding**, and
- **clear system design interview answers**

For each topic, practice answering at four levels:

### Level 1: Definition

Can you explain the concept in plain English?

### Level 2: Failure mode

Can you explain what breaks when the delivery method, API contract, or session model is chosen poorly?

### Level 3: Tradeoff

Can you explain what product or infrastructure benefit you gain and what complexity cost you pay?

### Level 4: Design application

Can you place the concept correctly inside systems like:

- chat apps
- payment platforms
- partner integrations
- mobile apps
- dashboards
- classic web applications behind load balancers

## What Interviewers Usually Want

API and product-facing design questions are often testing whether you can connect backend architecture to user-visible behavior.

Interviewers are often looking for whether you understand:

- how updates reach clients or other systems
- how APIs evolve without breaking old consumers
- how user session state behaves under load balancing and failures
- when a simpler mechanism is better than a more “real-time” one
- how operational tradeoffs affect product correctness and UX

A strong answer usually does five things:

1. defines the concept simply
2. explains what real product problem it solves
3. gives one realistic example
4. explains the main tradeoff
5. describes failure modes and mitigations

---

# 1. Polling vs Webhooks vs WebSockets

**TL;DR:** Polling, webhooks, and WebSockets are three different ways to deliver updates, and the right choice depends on who needs the update, how quickly it must arrive, and how much connection complexity you want to manage.

## Why Update Delivery Methods Matter

Many systems need to communicate changing state.

Examples:

- a payment status changes
- a build finishes
- a chat message arrives
- a delivery location updates
- a background job completes

The key design question is:

> How should the update reach the interested client or system?

### Analogy

Think of three ways to get news from a friend:

- **Polling**: you keep calling them repeatedly to ask for updates
- **Webhooks**: they call you when something important happens
- **WebSockets**: you stay on an open call so either side can speak immediately

Each method works, but each has different cost and complexity.

## What is Polling?

**Polling** means the client repeatedly asks the server whether anything changed.

Example:

```text
GET /payment-status?id=123
```

repeated every few seconds.

### Good

- simple to build
- works in many environments
- easy for clients that cannot receive inbound requests

### Bad

- wasteful if nothing changed
- updates are delayed until next poll
- too-frequent polling can create heavy traffic

### Common use cases

- checking report status
- refreshing dashboard summaries
- basic mobile or browser status checks

## What are Webhooks?

**Webhooks** are server-to-server callbacks.

Instead of the client asking repeatedly, the source system sends an HTTP request to a registered URL when an event happens.

### Example

A payment provider calls:

```text
POST https://merchant.example.com/webhooks/payment
```

when a charge succeeds or fails.

### Good

- efficient for event-driven server-to-server updates
- near real-time without repeated polling
- reduces unnecessary requests

### Bad

- receiving system must expose a reliable endpoint
- retries and idempotency are required
- delivery can fail if receiver is down or slow

### Common use cases

- payment notifications
- CI/CD job completion
- third-party integration callbacks
- CRM or e-commerce system sync

## What are WebSockets?

**WebSockets** create a long-lived bidirectional connection between client and server.

That means:

- server can push updates to client immediately
- client can also send messages back on the same connection

### Good

- very low-latency updates
- excellent for interactive real-time apps
- avoids constant re-requesting

### Bad

- more connection management complexity
- harder scaling than stateless HTTP request/response
- reconnect logic and connection drops must be handled carefully

### Common use cases

- chat
- collaborative editing
- multiplayer games
- live dashboards

## Concrete Example

### Payment status updates

A checkout flow needs to know when payment changes from:

- `PENDING`
- to `SUCCEEDED`
- or `FAILED`

#### Polling solution

Frontend checks every 3 seconds.

Pros:

- easy to implement

Cons:

- delayed update
- many useless requests if status rarely changes

#### Webhook solution

Payment provider notifies merchant backend.

Backend updates DB.

Frontend may still poll merchant backend briefly or use another push channel.

Pros:

- good fit for server-to-server event delivery

Cons:

- merchant must handle retries and idempotency

#### WebSocket solution

Merchant backend opens a live channel to the user session and pushes status immediately.

Pros:

- fast user-facing updates

Cons:

- more complex than needed for many simple payment flows

### Important product insight

Sometimes the best design is a **combination**:

- provider -> merchant via webhook
- merchant -> browser via polling or WebSocket

## Tradeoffs in Depth

### Latency

- polling: bounded by poll interval
- webhooks: often near real-time, but depends on delivery and retries
- WebSockets: usually the lowest latency for connected clients

### Complexity

- polling: lowest
- webhooks: medium
- WebSockets: highest

### Cost

- polling: repeated request overhead
- webhooks: efficient per event, but receiver infrastructure needed
- WebSockets: persistent connection cost

### Scalability

- polling can overload servers if interval is too aggressive
- webhooks scale well for event-driven server integrations
- WebSockets require connection-aware scaling and state management

### Connectivity constraints

- webhooks do not work well for browser clients directly
- some environments make persistent connections harder
- polling often works almost everywhere

## Code-Level Pseudocode

### Example 1: Polling loop

```text
function waitForPaymentStatus(paymentId):
    every 3 seconds:
        status = GET /payments/{paymentId}/status
        if status in ["SUCCEEDED", "FAILED"]:
            stop polling
            showResult(status)
```

### Example 2: Webhook handler

```text
function handleWebhook(request):
    verifySignature(request)

    event = parse(request.body)

    if alreadyProcessed(event.id):
        return 200

    updatePaymentStatus(event.paymentId, event.status)
    markProcessed(event.id)
    return 200
```

### Example 3: WebSocket push

```text
onPaymentStatusChanged(paymentId, status):
    connection = connectionRegistry.findByPaymentId(paymentId)
    if connection exists:
        connection.send({ paymentId: paymentId, status: status })
```

## Comparison Table

| Method | Real-time quality | Complexity | Infrastructure cost | Failure handling | Best use case |
| --- | --- | --- | --- | --- | --- |
| Polling | Low to medium | Low | Low to medium | simple retries | simple status checks |
| Webhooks | Medium to high | Medium | Medium | retries, signatures, idempotency | server-to-server event delivery |
| WebSockets | High | High | Medium to high | reconnect, session tracking | interactive real-time UX |

## How to Detect Problems

### Signals

- excessive polling traffic
- missed webhook deliveries
- duplicate webhook processing
- dropped WebSocket sessions
- user complaints about delayed updates

### Useful metrics

- requests per polling endpoint
- webhook success and retry rates
- webhook age or delivery delay
- active WebSocket connections
- reconnect rate
- update latency from source event to user-visible change

## Common Beginner Mistakes

- polling too often by default
- using WebSockets for every update problem
- building webhook handlers without idempotency
- forgetting webhook signature verification
- assuming WebSocket connections never drop
- designing only one channel when the product really needs two hops

## Interview Framing

This topic is excellent for interviews because it tests whether you choose communication patterns based on product need rather than technology excitement.

A strong answer usually includes:

- who needs the update
- who can initiate the connection
- how fresh the update must be
- what failure handling is required
- whether a hybrid design is better

## Interview Questions You May Get

### Q1. When is polling still a good choice?

Good examples:

- simple status pages
- low-frequency updates
- environments where push delivery is awkward
- cases where a few seconds of delay is acceptable

### Q2. Why are webhooks not a browser replacement?

Because webhooks are usually server-to-server callbacks. Browsers generally do not expose stable public endpoints to receive incoming webhooks.

### Q3. When are WebSockets worth it?

Good examples:

- chat
- collaborative tools
- trading dashboards
- multiplayer interactions
- very low-latency live updates

## Strong Interview Answer Pattern

```text
I would choose the update delivery method based on the audience and latency requirement.
For simple periodic status checks, polling is often enough.
For system-to-system event delivery, webhooks are usually a better fit.
For highly interactive client experiences like chat, I would consider WebSockets.
I would also mention that many real products combine these patterns instead of choosing only one.
```

## Red Flags in Interviews

- recommending WebSockets by default for everything
- ignoring webhook retries and idempotency
- proposing browser webhooks as if they were normal client callbacks
- discussing latency without discussing operational cost

---

# 2. API Versioning

**TL;DR:** API versioning is the practice of evolving an API without breaking existing clients, and the best strategy depends on how often breaking changes happen and how much backward compatibility you can maintain.

## What is API Versioning?

API versioning is a way to change an API while still supporting older clients.

In plain English:

- your API changes over time
- some clients upgrade slowly
- versioning helps old and new clients coexist

### Analogy

Think of publishing a new edition of a textbook.

New students may use the new edition, but some classes may still depend on the old edition for a while.

If page numbers, chapter names, and exercises all change abruptly, old readers get confused.

API versioning solves a similar compatibility problem.

## Why It Exists

APIs often serve many client types:

- web apps
- mobile apps
- internal services
- partner integrations

Some of those clients are slow to upgrade.

Breaking changes can include:

- renaming a field
- removing a field
- changing response structure
- changing enum meanings
- changing authentication expectations

Without versioning or compatibility discipline, old clients can break unexpectedly.

## How It Works

There are several common styles.

### 1. URL versioning

Example:

```text
/v1/users
/v2/users
```

#### Good

- obvious and easy to observe
- simple routing
- easy for docs and gateways

#### Bad

- can encourage large parallel API trees
- version proliferation can get messy

### 2. Header versioning

Example:

```text
API-Version: 2
```

#### Good

- keeps URL cleaner
- can be elegant for API evolution

#### Bad

- less visible in logs or manual testing
- can be harder for some clients and debugging flows

### 3. Media type versioning

Example:

```text
Accept: application/vnd.company.v2+json
```

#### Good

- flexible and standards-oriented

#### Bad

- less beginner-friendly
- often less discoverable

### 4. Backward-compatible evolution

Sometimes you avoid new versions by making only non-breaking changes, such as:

- adding optional fields
- preserving old behavior
- deprecating gradually

This is often the cleanest approach when possible.

## Concrete Example

Suppose an API returns:

```json
{
  "user_id": 123,
  "full_name": "Maya Patel"
}
```

Later, the team wants to split `full_name` into:

```json
{
  "first_name": "Maya",
  "last_name": "Patel"
}
```

If old mobile apps still expect `full_name`, removing it immediately breaks them.

### Safer path

- keep `full_name` for old clients
- add `first_name` and `last_name`
- migrate clients gradually
- deprecate old field later

That may avoid a major version bump if designed carefully.

## When You Actually Need a New Version

A new version is usually justified for **breaking changes**.

### Common breaking changes

- removing a field clients depend on
- changing field type
- changing semantic meaning of a response
- changing authentication or request contract incompatibly

### Usually non-breaking changes

- adding optional fields
- adding new endpoints
- adding new enum values if clients are robust
- expanding response shape without removing old fields

### Important idea

Versioning is not only a technical mechanism. It is also a product and client-lifecycle decision.

## Tradeoffs of Versioning Styles

| Style | Strength | Weakness |
| --- | --- | --- |
| URL versioning | explicit, easy routing | can create many parallel endpoints |
| Header versioning | cleaner URLs | less visible and harder to inspect manually |
| Media type versioning | flexible and standards-friendly | higher complexity |
| Backward-compatible evolution | least disruption | requires discipline and careful contract design |

## Code-Level Examples

### Example 1: URL versioning

```text
GET /v1/users/123
GET /v2/users/123
```

### Example 2: Header versioning

```text
GET /users/123
API-Version: 2
```

### Example 3: Backward-compatible response evolution

```json
{
  "user_id": 123,
  "full_name": "Maya Patel",
  "first_name": "Maya",
  "last_name": "Patel"
}
```

## API Versioning vs Feature Flags vs Backward Compatibility

| Concept | Main purpose |
| --- | --- |
| API versioning | support multiple contract shapes over time |
| Feature flags | control feature rollout behavior |
| Backward compatibility | evolve safely without breaking old clients |

### Key distinction

Not every API change requires a new version.

Sometimes better contract discipline is enough.

## Comparison Table

| Strategy | Discoverability | Routing ease | Compatibility control | Complexity | Best use case |
| --- | --- | --- | --- | --- | --- |
| URL versioning | High | High | High | Low to medium | public APIs, partner APIs |
| Header versioning | Medium | Medium | High | Medium | cleaner internal or managed APIs |
| Media type versioning | Low to medium | Medium | High | High | specialized API ecosystems |
| Compatibility-first evolution | Medium | High | Medium to high | Medium | stable APIs with careful design |

## How to Detect Problems

### Signals

- clients break after deploys
- old API versions stay heavily used for too long
- schema drift between docs and reality
- migration projects stall
- support burden grows for many live versions

### Useful metrics

- traffic by API version
- error rate by client version
- deprecation warning counts
- percent of traffic still on old contract
- partner upgrade completion rate

## Common Beginner Mistakes

- adding a new version for every tiny change
- versioning too late after clients already depend on the API
- breaking old clients silently
- keeping many old versions forever with no deprecation plan
- assuming mobile clients can upgrade instantly
- forgetting observability by version

## Interview Framing

API versioning is a strong interview topic because it tests whether you understand client compatibility, not just endpoint implementation.

A strong answer usually includes:

- what type of clients exist
- whether the change is truly breaking
- what versioning style is being used
- how migration and deprecation will work
- how version usage will be monitored

## Interview Questions You May Get

### Q1. Do you need a new version for every API change?

No. Many changes can be handled through backward-compatible evolution.

### Q2. Which versioning style is best?

There is no universal best. URL versioning is often simplest and most observable, while other styles may fit specific API ecosystems better.

### Q3. How do you retire an old version?

A strong answer:

- announce deprecation clearly
- monitor traffic by version
- help clients migrate
- set a removal timeline
- alert on remaining usage before shutdown

## Strong Interview Answer Pattern

```text
I would first decide whether the change is actually breaking.
If it is not, I would prefer backward-compatible evolution.
If it is breaking and multiple clients upgrade at different speeds, I would introduce a clear versioning strategy,
often URL versioning for simplicity and observability. I would also define a deprecation and migration plan,
not just the new endpoint shape.
```

## Red Flags in Interviews

- versioning every minor change
- breaking contracts with no migration path
- ignoring long-lived clients like mobile apps or partners
- discussing versioning without deprecation strategy

---

# 3. Session Management / Sticky Sessions

**TL;DR:** Session management tracks user state across requests, and sticky sessions keep a user routed to the same server, which can simplify legacy designs but creates scaling and failover tradeoffs.

## What is Session Management?

**Session management** is the mechanism that lets a system remember a user across multiple requests.

Examples:

- user logged in already
- shopping cart still exists
- selected preferences persist during browsing

In plain English:

- the user proves identity once
- the system stores or encodes session state
- later requests use that session information

### Analogy

Imagine getting a hand stamp at an event entrance.

You do not need to prove your ticket again at every doorway. The stamp tells the venue that you already checked in.

A web session works similarly.

## What is a Sticky Session?

A **sticky session** means the load balancer keeps sending the same user to the same application server.

Why?

Because that server may be holding the user's session state in local memory.

### Simple idea

Without sticky routing:

- request 1 goes to Server A
- request 2 goes to Server B
- if session only exists on A, B does not know the user state

So sticky sessions try to keep that user attached to A.

## How It Works

### Traditional server-side session model

1. User logs in.
2. Server creates session ID.
3. Session ID is stored in a cookie.
4. Session data is stored on the server or in a shared session store.
5. Later requests send the cookie.
6. Server looks up session state.

### Sticky routing case

If sessions are stored only in local memory on one app node, the load balancer may keep routing that user back to the same node.

### Stateless alternative

Instead of storing all session state on the app server, some systems use stateless tokens or a shared central session store.

## Concrete Example

Suppose an e-commerce app runs on **3 app servers** behind a load balancer.

### Local in-memory session model

- Server A stores cart and login state for User 1
- User 1's next request must return to Server A

This works initially, but creates problems.

### Failure case

If Server A crashes:

- User 1 may lose cart or login state
- even if Servers B and C are healthy, they do not have the local session

### Shared store alternative

If the session lives in Redis or another shared store:

- any app server can handle the request
- the session can be looked up centrally
- load balancing becomes simpler and more resilient

## Why Sticky Sessions Exist

Sticky sessions exist because they are a simple way to support applications that keep user state locally in server memory.

They are especially common in:

- older monoliths
- server-rendered apps with local session memory
- systems built before shared session stores or stateless auth were introduced

## Why Sticky Sessions Can Be Problematic

### 1. Uneven load

One server may accumulate many active users while others stay cooler.

### 2. Failure impact

If one server dies, users bound to it may lose session state.

### 3. Scaling pain

Adding or removing app nodes becomes harder when user affinity matters.

### 4. Operational fragility

Deploys, restarts, or autoscaling events can disturb session continuity.

## Solutions in Depth

### 1. Shared session store

Store session data in Redis or a database-backed store.

#### Good

- any app node can serve the user
- reduces dependence on sticky routing

#### Bad

- adds shared infrastructure dependency
- session store becomes important for availability

### 2. Stateless JWT-style auth high level

Instead of server-local session memory, the client carries a signed token containing identity claims.

#### Good

- easier horizontal scaling
- no per-user server-local memory requirement

#### Bad

- revocation and rotation are harder
- token contents and lifetime require careful security design

### 3. Replicated session storage

Some systems replicate session state between servers.

#### Good

- helps reduce single-node loss

#### Bad

- synchronization complexity
- more moving parts than a shared session store

### 4. Load balancer affinity rules

Use stickiness temporarily when redesign is not possible yet.

#### Good

- practical migration step

#### Bad

- does not solve the deeper scalability issue by itself

## Code-Level / Config Examples

### Example 1: Session lookup flow

```text
function handleRequest(request):
    sessionId = request.cookie["session_id"]
    session = sessionStore.get(sessionId)

    if session is null:
        return unauthorized

    return serveUser(session.userId)
```

### Example 2: Sticky routing concept

```text
Load balancer rule:
if cookie affinity key maps to server A,
route future requests from that session to server A
```

### Example 3: Stateless token check

```text
function authenticate(request):
    token = request.header["Authorization"]
    claims = verifyAndDecode(token)
    return claims.userId
```

## Sticky Sessions vs Stateless Auth vs Shared Session Store

| Approach | Main benefit | Main weakness |
| --- | --- | --- |
| Sticky sessions | simple for local-memory apps | uneven load, weak failover |
| Shared session store | flexible routing across nodes | shared infrastructure dependency |
| Stateless auth | easy horizontal scaling | revocation and token lifecycle complexity |

### Important idea

These are not just authentication choices. They are also **scaling and resilience** choices.

## Comparison Table

| Model | Scalability | Failure behavior | Operational complexity | Security considerations | Best use case |
| --- | --- | --- | --- | --- | --- |
| Local session + sticky routing | Low to medium | weak if node fails | Low initially | familiar session model | legacy/simple apps |
| Shared session store | High | better cross-node resilience | Medium | central store protection needed | classic scalable web apps |
| Stateless token model | High | good if tokens valid | Medium | revocation, expiry, signing | APIs and distributed frontends |

## How to Detect Problems

### Signals

- uneven app node load
- users randomly logged out after restarts
- session loss complaints during deploys
- affinity skew on the load balancer
- app nodes with very uneven memory usage

### Useful metrics

- session store latency and availability
- load distribution across app nodes
- login/session error rate
- session loss after deploy or failover
- sticky-affinity distribution skew

## Common Beginner Mistakes

- storing all session state only in local memory with no resilience plan
- assuming sticky sessions solve scalability
- using JWTs without thinking about revocation or expiration
- keeping too much mutable user state inside tokens
- not planning for server restarts or autoscaling events

## Interview Framing

This topic is strong in interviews because it tests whether you understand that authentication state and load balancing behavior are tightly connected.

A strong answer usually includes:

- where session state lives
- how requests get routed
- what happens on node failure
- whether stickiness is a temporary convenience or a long-term design
- when stateless auth is worth the tradeoff

## Interview Questions You May Get

### Q1. Why are sticky sessions considered problematic at scale?

Because they create uneven load, weaken failover behavior, and make autoscaling and deployments harder.

### Q2. Are JWTs always better than server-side sessions?

No. They simplify some scaling problems, but create different security and revocation tradeoffs.

### Q3. What is a practical migration path away from sticky sessions?

A strong answer:

- move session data into a shared store
- keep LB affinity only as a temporary bridge if needed
- reduce server-local state over time
- eventually allow any stateless app node to serve requests

## Strong Interview Answer Pattern

```text
If the app stores session state only in local server memory, sticky sessions may be needed,
but I would treat that as a scaling compromise rather than an ideal long-term architecture.
For a more scalable design, I would move session state to a shared store or use a carefully designed
stateless token model, depending on the product and security requirements.
```

## Red Flags in Interviews

- saying sticky sessions are fine forever at scale
- treating JWTs as a magic solution with no tradeoffs
- ignoring node-failure behavior
- discussing auth without discussing routing and state location

---

# Interview Cheat Sheet for Section F

## 1-minute Comparison View

| Topic | Core problem | Main benefit | Main risk | Common mitigation |
| --- | --- | --- | --- | --- |
| Polling vs Webhooks vs WebSockets | how updates reach clients/systems | right delivery model for latency and audience | wasted traffic, missed events, connection complexity | choose by audience, retries, idempotency, reconnection |
| API Versioning | API changes can break clients | safe evolution over time | version sprawl or client breakage | compatibility discipline, deprecation plan |
| Session Management / Sticky Sessions | user state must survive across requests | continuity of identity and session data | scaling and failover pain | shared session store or stateless auth |

## Quick “When I’d Use It” Lines

### Polling / webhooks / WebSockets

“I would choose based on who needs the update, how fast it must arrive, and whether the receiver can hold or expose a connection.”

### API versioning

“I would prefer backward-compatible evolution when possible, and use explicit versioning for truly breaking changes with a deprecation plan.”

### Session management

“I would avoid server-local session dependence at scale unless it is a temporary legacy constraint.”

## Common Cross-Cutting Interview Theme

All three topics test a deeper skill:

### Can you design backend behavior that remains usable and evolvable for real clients?

A strong candidate does not just say:

- use WebSockets
- make v2 endpoints
- store sessions somewhere

A strong candidate says:

- who the client is and what update path fits it
- how old and new clients will coexist
- where session state lives and how failure affects users
- what the migration and operational plan looks like

---

# Final Summary

Section F is about a very product-facing system design truth:

> backend architecture decisions become very visible when they affect update speed, client compatibility, or user continuity.

These three topics connect tightly:

- **Polling vs Webhooks vs WebSockets** determines how updates travel
- **API Versioning** determines how interfaces evolve safely
- **Session Management / Sticky Sessions** determines how user state survives across requests and across servers

In interviews, the strongest answers keep returning to four questions:

1. **Who needs the update or contract?**
2. **How fast must it propagate?**
3. **How long must old clients remain supported?**
4. **Where does user state live when traffic scales or nodes fail?**

## Suggested Next Step

You now have deep, interview-focused drafts for Sections **A through F**.

A strong next move would be one of these:

1. create a **master combined document** for all sections
2. make each section **more senior/staff-level**
3. add **mock interview Q&A** after every topic
4. convert the material into **flashcards or revision notes**