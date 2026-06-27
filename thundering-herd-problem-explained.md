# Thundering Herd Problem in System Design

## 1. What is it?

Imagine **Zomato announces a flash sale at exactly 7:00 PM**.

Thousands of people open the app and tap **"Order Now"** at almost the same moment.

From the app's point of view, this means:

- a huge number of users send requests together
- all those requests hit the backend servers at the same time
- the servers, cache, and database suddenly get overloaded

That sudden rush is very similar to the **Thundering Herd Problem**.

### Simple definition

The **Thundering Herd Problem** happens when **many clients, users, or services wake up and do the same work at the same time**, usually after waiting on a shared event.

That shared event could be:

- a cache entry expiring
- a server becoming available again
- a lock being released
- a retry timer ending
- a popular notification or event going live

Instead of one request doing the work and the rest reusing the result, **everyone rushes in together**.

### Real-world analogy

Think of a **cricket match ticket drop**:

- the ticket site says tickets open at **10:00 AM**
- 50,000 people refresh the page at **9:59:59**
- at **10:00:00**, everyone clicks at once
- the website slows down or crashes

The problem is not that one person came.
The problem is that **everyone came at the same instant**.

---

## 2. How it happens

Let's define two simple terms first:

- **Cache**: a fast temporary storage layer that keeps frequently used data so the system does not need to ask the database every time
- **Database (DB)**: the main storage system where the real data lives

A common version of this problem happens when a **popular cache entry expires**.

### Step-by-step breakdown

Suppose your app stores the homepage feed in cache.

1. Many users request the same data
2. The data is served from cache, so everything is fast
3. The cache entry expires
4. Many new requests arrive at nearly the same time
5. All of them see **cache miss**
6. All of them go to the database together
7. The database gets flooded with duplicate work
8. Response times increase, errors start, and the whole system may struggle

### ASCII flow diagram

```text
                  Cache entry expires
                         |
                         v
User 1  -----> App Server -----> Cache miss -----> Database
User 2  -----> App Server -----> Cache miss -----> Database
User 3  -----> App Server -----> Cache miss -----> Database
User 4  -----> App Server -----> Cache miss -----> Database
User 5  -----> App Server -----> Cache miss -----> Database
                         |
                         v
                Same expensive query repeated
                again and again and again
```

### Another way to see it

```text
Time --->

[Cache valid]
Request A -> Cache hit
Request B -> Cache hit
Request C -> Cache hit

[Cache expires]
Request D -> Cache miss -> DB
Request E -> Cache miss -> DB
Request F -> Cache miss -> DB
Request G -> Cache miss -> DB
Request H -> Cache miss -> DB
```

### Why this is wasteful

All those requests often want the **same answer**.
But instead of doing the work once, the system may do it **100 times, 1000 times, or more**.

---

## 3. Concrete Example

Let's use a **Hotstar live cricket match** scenario.

### Scenario

Hotstar has a "live score summary" API.
That summary is very popular and is cached for **60 seconds**.

Assume:

- **1000 users** request the live score around the same time
- the cached score just expired
- generating the latest score needs **1 database query**
- the app is not protected against thundering herd

### What should ideally happen?

Best case:

- first request misses cache
- one request goes to the database
- result is cached again
- remaining requests read from cache

So ideally:

- **1000 user requests**
- **1 database query**

### What happens without protection?

If all 1000 requests arrive right after cache expiry:

- all 1000 see cache miss
- all 1000 go to the database
- database receives **1000 nearly identical queries**

So now you get:

- **1000 user requests**
- **1000 database queries**

### ASCII diagram

```text
1000 users open Hotstar score page
                |
                v
         App checks cache
                |
         Cache expired just now
                |
                v
  1000 requests fall through together
                |
                v
      1000 DB queries fired at once
```

### Small number example

If one DB query takes **50 ms**, that sounds small.
But 1000 duplicate queries at once can:

- saturate DB connections
- consume CPU
- increase waiting time for other queries
- slow down unrelated app features too

### Pseudocode of the bad pattern

```text
function getLiveScore(matchId):
    value = cache.get(matchId)
    if value exists:
        return value

    value = database.query("select * from live_scores where id = matchId")
    cache.set(matchId, value, ttl=60)
    return value
```

The problem in this code is that **many requests can execute the database query at the same time**.

---

## 4. Why it's dangerous

The Thundering Herd Problem is dangerous because one small event can create a large system-wide failure.

### 1) CPU spikes

- **CPU** is the part of the machine that performs computation
- when thousands of duplicate requests arrive, the server must process them all
- that means more parsing, more logic, more memory work, and more scheduling

In plain words:

- the server starts working too hard
- everything becomes slower
- even simple requests take longer

### 2) Database overload

The **database** is usually slower and more limited than cache.
It has:

- limited connections
- limited query capacity
- disk or memory pressure

If many identical queries hit it together:

- DB response time rises
- connection pools fill up
- queries queue up
- timeouts may happen

### 3) Cascading failures

A **cascading failure** means one problem spreads and creates more problems in other parts of the system.

Example:

1. Cache expires
2. DB gets overloaded
3. App servers wait longer for DB
4. Request threads stay busy
5. Incoming requests pile up
6. Load balancer sees unhealthy servers
7. Retries add even more traffic
8. More services fail

### ASCII chain reaction

```text
Cache expiry
    -> many cache misses
    -> DB overload
    -> slower responses
    -> request timeout
    -> clients retry
    -> even more traffic
    -> more overload
```

### 4) Poor user experience

Users may see:

- slow loading
- spinner forever
- errors like 500 or 503
- app crashes or partial page loads

### 5) Wasted resources

Even if the system survives, it is wasting work.

Instead of:

- doing one expensive operation once

it is:

- doing the same expensive operation hundreds of times

---

## 5. Solutions

Below are four common solutions, explained in beginner-friendly language.

---

### Solution 1: Cache stampede prevention

A **cache stampede** is a specific form of thundering herd where many requests hit the database when a cached value expires.

The idea is simple:

- do not let all requests fall through at once
- serve stale data briefly, refresh early, or refresh in background

### Before

```text
Requests ---> Cache expired ---> Everyone goes to DB ---> DB overload
```

### After

```text
Requests ---> Cache expired
                |
                +--> serve stale value temporarily
                |
                +--> one background refresh updates cache
                |
                v
           DB sees limited load
```

### Common techniques inside this idea

- **Stale-while-revalidate**: serve old cached data for a short time while refreshing in background
- **Early refresh**: refresh hot cache keys before they fully expire
- **Soft TTL / Hard TTL**:
  - **TTL (Time To Live)** means how long cached data is kept
  - **Soft TTL**: after this, data can be refreshed but still served briefly
  - **Hard TTL**: after this, data must not be served anymore

### Simple pseudocode

```text
function getFeed(key):
    value = cache.get(key)

    if value is fresh:
        return value

    if value is stale but still acceptable:
        triggerBackgroundRefresh(key)
        return value

    return rebuildValue(key)
```

### Why it helps

- users keep getting responses
- the database gets fewer sudden spikes
- the refresh is spread out instead of happening in one giant burst

---

### Solution 2: Request coalescing

**Request coalescing** means combining many identical requests into one shared request.

If 500 requests ask for the same thing at the same moment:

- the system lets one request do the work
- the other 499 wait for that result
- once the result comes back, everyone gets the same answer

### Before

```text
Req 1 ---> DB
Req 2 ---> DB
Req 3 ---> DB
Req 4 ---> DB
Req 5 ---> DB
```

### After

```text
Req 1 ---> build result ---> DB
Req 2 ---wait-----------^
Req 3 ---wait-----------^
Req 4 ---wait-----------^
Req 5 ---wait-----------^

Then all receive the same returned value
```

### Visual flow

```text
Many identical requests
        |
        v
  "Is someone already fetching this key?"
        |
    Yes / No
     /      \
   Yes       No
   wait      fetch once from DB
      \      /
       \    /
        shared result
```

### Pseudocode

```text
function getProduct(key):
    value = cache.get(key)
    if value exists:
        return value

    if inFlightRequestExists(key):
        return waitForInFlightResult(key)

    markInFlight(key)
    value = database.query(key)
    cache.set(key, value, ttl=60)
    clearInFlight(key)
    return value
```

### Why it helps

- duplicate work is removed
- database traffic drops sharply
- popular endpoints become more stable

---

### Solution 3: Jitter + exponential backoff

Let's define the terms:

- **Retry**: trying again after a failure
- **Backoff**: waiting before retrying
- **Exponential backoff**: increasing the wait time after each failure, such as 100 ms, then 200 ms, then 400 ms, then 800 ms
- **Jitter**: adding randomness to that wait so everyone does not retry at the exact same moment

Without jitter, many clients may retry together and create another herd.

### Before

```text
Server fails temporarily
    |
    v
1000 clients retry after exactly 1 second
    |
    v
Another traffic spike hits server
```

### After

```text
Server fails temporarily
    |
    v
Clients retry with backoff + random jitter
    |
    +--> Client 1 retries in 1.1s
    +--> Client 2 retries in 1.7s
    +--> Client 3 retries in 2.3s
    +--> Client 4 retries in 1.4s
    |
    v
Load is spread over time
```

### Example retry pattern

```text
Attempt 1 -> wait 100 ms + random jitter
Attempt 2 -> wait 200 ms + random jitter
Attempt 3 -> wait 400 ms + random jitter
Attempt 4 -> wait 800 ms + random jitter
```

### Pseudocode

```text
baseDelay = 100ms
for attempt in 1 to 4:
    delay = baseDelay * (2 ^ (attempt - 1))
    jitter = random(0, 150ms)
    sleep(delay + jitter)
    retryRequest()
```

### Why it helps

- retries are spread out
- recovery is smoother
- clients do not all attack the server again at one exact instant

---

### Solution 4: Mutex / locking

A **mutex** means **mutual exclusion**.
That is a fancy way of saying:

- only one worker is allowed into a critical section at a time

A **critical section** is the piece of code where shared work happens, such as rebuilding a cache value.

### Before

```text
Req 1 -> cache miss -> DB
Req 2 -> cache miss -> DB
Req 3 -> cache miss -> DB
Req 4 -> cache miss -> DB
```

### After

```text
Req 1 -> cache miss -> acquire lock -> DB -> update cache -> release lock
Req 2 -> cache miss -> wait for lock ------------------------------^
Req 3 -> cache miss -> wait for lock ------------------------------^
Req 4 -> cache miss -> wait for lock ------------------------------^
```

### Visual flow

```text
Many requests for same key
         |
         v
   Try to acquire lock
      /          \
 gets lock       no lock
    |              |
 fetch from DB     wait or use stale value
    |
 update cache
    |
 release lock
```

### Pseudocode

```text
function getProfile(userId):
    value = cache.get(userId)
    if value exists:
        return value

    if lock.acquire("profile:" + userId):
        value = database.query(userId)
        cache.set(userId, value, ttl=60)
        lock.release("profile:" + userId)
        return value
    else:
        sleep(short_time)
        return cache.get(userId)
```

### Why it helps

- only one request rebuilds the missing value
- database load is controlled
- repeated duplicate work is avoided

### Important tradeoff

If locks are badly designed:

- requests may wait too long
- deadlocks or stuck locks may happen
- one slow request can delay others

So locks help, but must be used carefully.

---

## 6. Quick Reference Table

| Solution | What it does | Complexity | Best use case | Tradeoff |
|---|---|---:|---|---|
| Cache stampede prevention | Avoids many requests falling through after cache expiry | Medium | Very popular cached data | May serve slightly stale data |
| Request coalescing | Merges identical in-flight requests into one | Medium | APIs where many users ask for same key at same time | Requires tracking in-flight work |
| Jitter + exponential backoff | Spreads retries over time | Low to Medium | Temporary failures, retries, reconnect storms | Slower retry for some users |
| Mutex / locking | Allows only one request to rebuild shared data | Medium to High | Cache rebuilds, expensive shared computation | Lock management can be tricky |

### Simple rule of thumb

- If the issue is **cache expiry**, start with **cache stampede prevention**
- If the issue is **duplicate simultaneous requests**, use **request coalescing**
- If the issue is **retry storms**, use **jitter + exponential backoff**
- If the issue is **shared resource rebuild**, use **mutex/locking**

In real systems, teams often combine several of these.

---

## 7. Where it appears in real systems

The Thundering Herd Problem can appear in many layers of a real system.

### 1) Redis

**Redis** is a very popular in-memory data store often used as a cache.

It appears when:

- a hot key expires
- many app servers miss the same key together
- all of them rebuild from the database

Example:

- `homepage_feed` expires
- 20 app servers ask for it at once
- all 20 hit the DB

### 2) CDN

A **CDN (Content Delivery Network)** is a geographically distributed system that caches content closer to users.

It appears when:

- a highly requested file expires from CDN cache
- many users request it together
- the CDN sends many origin fetches back to the main server

This can overload the **origin server** (the original source server).

### 3) API gateways

An **API gateway** is the front door that receives requests and routes them to backend services.

It appears when:

- clients retry failed requests at the same time
- gateway rate limits are weak
- a backend recovers and suddenly gets flooded again

### 4) Databases

The database can experience the herd problem directly when:

- many workers poll the same row
- many queries wake up after a lock release
- many services run the same expensive query at once

### 5) Job queues and workers

A **worker** is a background process that performs tasks.

It appears when:

- many workers wake up together
- all compete for the same queue item or lock
- all hammer one shared dependency

### 6) Microservices

A **microservice** is a small service responsible for one part of a system.

It appears when:

- one service becomes slow
- calling services timeout
- all of them retry together
- the original service gets even more overloaded

---

## Final summary

The **Thundering Herd Problem** is what happens when **many requests or processes rush to do the same work at the same time**.

For beginners, the easiest way to remember it is:

> One shared event happens, and then everybody charges at once.

That shared event might be:

- cache expiry
- retry timer completion
- server recovery
- lock release

### Core danger

The main danger is not just high traffic.
It is **synchronized traffic** — traffic that arrives in one sharp burst and creates duplicate work.

### Core fixes

The main ways to reduce it are:

- prevent cache stampedes
- coalesce duplicate requests
- spread retries with jitter and exponential backoff
- protect shared rebuilds with locks

### One-line takeaway

If many requests need the same result, **try to do the expensive work once, not a thousand times**.
