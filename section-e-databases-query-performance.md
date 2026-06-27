# Section E: Databases / Query Performance

This document covers three core system design concepts from Section E of your prompt library:

1. Indexing
2. Slow Queries / Full Table Scan
3. Pagination Problems: OFFSET vs Cursor Pagination

## How to Use This for Interviews

This document is designed for both:

- **deep understanding**, and
- **clear system design interview answers**

For each topic, practice answering at four levels:

### Level 1: Definition

Can you explain the concept in plain English?

### Level 2: Failure mode

Can you explain what becomes slow or incorrect when the query path is badly designed?

### Level 3: Tradeoff

Can you explain what performance benefit you gain and what write, storage, or complexity cost you pay?

### Level 4: Design application

Can you place the concept correctly inside systems like:

- user search and lookup
- order history
- admin dashboards
- large feeds
- reporting systems
- high-traffic APIs

## What Interviewers Usually Want

Database performance questions are often testing whether you understand that system design is not only about architecture diagrams, but also about whether the data path is efficient under real load.

Interviewers are often looking for whether you understand:

- why a query is slow
- how indexes change execution cost
- when scans are acceptable and when they are dangerous
- why pagination strategy matters at scale
- the tradeoff between read speed and write overhead

A strong answer usually does five things:

1. defines the concept simply
2. explains the bottleneck or failure mode
3. gives one realistic example with data size
4. explains the tradeoff
5. describes how to detect and fix the issue

---

# 1. Indexing

**TL;DR:** An index is a data structure that helps the database find rows quickly without scanning the whole table, but indexes speed up reads by adding extra storage and write cost.

## What is an Index?

An **index** is a helper structure that allows the database to locate matching rows more efficiently.

In plain English:

- without an index, the database may need to inspect many or all rows
- with an index, it can jump much closer to the right rows

### Analogy

Think of a textbook index.

If you want to find the topic “hashing,” you do not read every page from page 1 to page 800.
You use the back-of-book index to jump to the relevant pages.

A database index serves a similar purpose.

## Why Indexes Matter

Suppose a `users` table has **50 million rows**.

If you run:

```sql
SELECT * FROM users WHERE email = 'a@example.com';
```

and `email` is not indexed, the database may need to inspect row after row until it finds a match.

That becomes expensive in:

- CPU
- disk IO
- memory pressure
- query latency

With a good index, the database can find the row far more directly.

## How Indexing Works

At a high level, an index stores values from one or more columns in a structure optimized for lookup.

You do not need deep internal theory for interview basics. The key idea is:

- the database keeps an extra structure sorted or organized for faster access
- queries can use that structure instead of scanning the entire table

### ASCII idea

```text
Table rows:
row1  row2  row3  row4  row5  ... row50,000,000

Without index:
scan scan scan scan scan scan ...

With index on email:
email -> row location
```

## Concrete Example

### Example 1: Email lookup

Table:

- `users(id, email, name, created_at)`
- 50 million rows

Common query:

```sql
SELECT id, name FROM users WHERE email = 'a@example.com';
```

If `email` is indexed:

- lookup is fast
- DB touches a tiny portion of the table

If `email` is not indexed:

- DB may scan the whole table
- latency may jump from milliseconds to seconds

### Example 2: Orders by status and date

Table:

- `orders(id, status, created_at, total_amount)`
- 200 million rows

Common query:

```sql
SELECT id, total_amount
FROM orders
WHERE status = 'PAID'
ORDER BY created_at DESC
LIMIT 50;
```

A composite index on `(status, created_at)` may help the DB efficiently find the latest paid orders.

## Types of Index Use

### 1. Primary key index

Usually created automatically on the primary key.

Good for:

- exact row lookup by ID

### 2. Unique index

Enforces uniqueness and speeds lookup.

Good for:

- email
- username
- external IDs

### 3. Composite index

Index across multiple columns.

Example:

```text
(status, created_at)
```

Good for queries that filter and sort using those columns in compatible ways.

### 4. Covering index high level

A covering index contains enough information for a query so the database may not need to read the base table row.

This can be very fast for some workloads.

## Tradeoffs

Indexes are powerful, but not free.

### Benefits

- faster reads
- faster filtering
- better sorting support
- better join performance in many cases

### Costs

- more storage
- slower writes, because indexes also need updating
- more maintenance overhead
- risk of redundant or unused indexes

### Important idea

The right question is not “should I index?”

The better question is:

> Which queries matter enough to justify index cost?

## Code-Level / SQL Examples

### Example 1: Index on email

```sql
CREATE UNIQUE INDEX idx_users_email ON users(email);
```

### Example 2: Composite index on status and created_at

```sql
CREATE INDEX idx_orders_status_created_at ON orders(status, created_at DESC);
```

### Example 3: Query that benefits

```sql
SELECT id, total_amount
FROM orders
WHERE status = 'PAID'
ORDER BY created_at DESC
LIMIT 50;
```

## Indexing vs Caching vs Full Table Scan

| Concept | Main purpose |
| --- | --- |
| Indexing | make DB lookups and filters faster |
| Caching | avoid repeated work by storing results or objects elsewhere |
| Full table scan | inspect all rows because no efficient access path exists |

### Key distinction

- indexing improves the database path itself
- caching may avoid the DB entirely
- a full table scan is sometimes acceptable, but often dangerous on large hot tables

## Comparison Table

| Option | Read benefit | Write cost | Storage cost | Complexity | Best use case |
| --- | --- | --- | --- | --- | --- |
| No index | Low | Low | Low | Low | tiny tables or rare scans |
| Single-column index | High for matching lookups | Medium | Medium | Low | exact filters like email |
| Composite index | High for targeted multi-column queries | Medium to high | Medium | Medium | filter + sort patterns |
| Cache instead of DB hit | Very high for hot repeated reads | External complexity | External storage | Medium | very hot read paths |

## How to Detect Problems

### Signals

- slow query logs mention large scan counts
- DB CPU spikes during lookup-heavy endpoints
- queries that should be simple become slow as data grows
- execution plans show sequential scans where targeted lookup is expected

### Useful metrics and tools

- slow query logs
- `EXPLAIN` or query plan output
- rows examined vs rows returned
- DB CPU and IO usage
- index usage stats

## Common Beginner Mistakes

- indexing every column without a query-driven reason
- choosing the wrong composite index order
- forgetting that writes become more expensive with too many indexes
- assuming an index automatically helps every query shape
- not checking query plans after adding an index

## Interview Framing

Indexing is a classic interview topic because it tests whether you can connect:

- query pattern
- data size
- execution cost
- tradeoffs on the write path

A strong answer usually includes:

- what query needs to be fast
- what column or columns are filtered or sorted on
- why the index helps
- what write or storage cost it adds

## Interview Questions You May Get

### Q1. Should every frequently queried column be indexed?

Not automatically. The answer depends on query shape, cardinality, write cost, and whether the column participates in useful filters, joins, or ordering.

### Q2. Why does composite index order matter?

Because the index is organized in a specific column order, and many databases can only use it efficiently when the query pattern matches that order.

### Q3. When is a full table scan acceptable?

Good examples:

- small tables
- admin jobs running rarely
- analytical scans on systems designed for scanning

Bad examples:

- hot API paths on huge OLTP tables

## Strong Interview Answer Pattern

```text
I would add an index based on the actual query pattern, not just the column name.
If the endpoint filters by email or filters by status and sorts by created_at, I would design the index
around that access path. I would also call out the tradeoff that every extra index increases write cost
and storage usage, so I would validate it with query plans and production metrics.
```

## Red Flags in Interviews

- saying “just add an index” with no query pattern discussion
- indexing every field by default
- ignoring write amplification
- not distinguishing single-column from composite access patterns

---

# 2. Slow Queries / Full Table Scan

**TL;DR:** A slow query often becomes slow because the database must examine too much data, and a full table scan is one common reason that happens.

## What is a Slow Query?

A **slow query** is a database query that takes too long for the needs of the system.

“Too long” depends on context:

- 50 ms may be fine for a report
- 50 ms may be too slow for a hot lookup path if it happens thousands of times per second
- 5 seconds is often unacceptable for an interactive API

### Analogy

Imagine searching every file in a giant cabinet one by one just to find one customer record.

That is what a bad query can feel like to a database.

## What is a Full Table Scan?

A **full table scan** means the database reads all or most rows in a table to answer a query.

Sometimes that is fine.

But on large operational tables, it can be very expensive.

### ASCII idea

```text
Orders table:
[ row ][ row ][ row ][ row ][ row ] ... [ row ]

Query without useful index:
scan -> scan -> scan -> scan -> scan -> ...
```

## How It Happens

Slow queries often happen because of:

### 1. Missing index

The database has no efficient access path.

### 2. Bad filter pattern

Query filters on columns that are not indexed or not selective enough.

### 3. Bad join pattern

Large joins can explode work if join columns are not indexed or if the query shape is poor.

### 4. Too much data

Even a reasonable query may become slow once the table grows to tens or hundreds of millions of rows.

### 5. Functions preventing index use

Example:

```sql
WHERE LOWER(email) = 'a@example.com'
```

Depending on the DB and index design, wrapping the column in a function can prevent the normal index from being used efficiently.

## Concrete Example

Suppose an `orders` table has **50 million rows**.

Bad query:

```sql
SELECT *
FROM orders
WHERE customer_email = 'a@example.com';
```

If `customer_email` is not indexed:

- the DB may scan tens of millions of rows
- CPU spikes
- disk IO rises
- endpoint latency becomes terrible

Another bad pattern:

```sql
SELECT *
FROM orders
ORDER BY created_at DESC
LIMIT 50 OFFSET 500000;
```

Even if the final result is only 50 rows, the DB may need to skip a huge amount of data first.

## Why It Hurts

Slow queries hurt more than one request.

They can cause:

- CPU pressure
- disk IO saturation
- memory pressure
- lock contention in some patterns
- connection pool pressure
- cascading latency across the app

### Important idea

One bad query on a hot path can damage the whole system.

## Solutions in Depth

### 1. Proper indexes

Add indexes that match the real filter, join, and sort pattern.

### 2. Query rewrite

Sometimes the same logical request can be written more efficiently.

### 3. Pagination instead of giant result sets

Avoid fetching or scanning excessive data in one request.

### 4. Precomputed or materialized data

If the query is expensive and repeated often, precompute the answer.

### 5. Caching

For repeated read-heavy queries, caching may reduce pressure.

## Code-Level / SQL Examples

### Example 1: Bad vs improved lookup

Bad:

```sql
SELECT * FROM users WHERE email = 'a@example.com';
```

Improved with index:

```sql
CREATE UNIQUE INDEX idx_users_email ON users(email);
SELECT id, name FROM users WHERE email = 'a@example.com';
```

### Example 2: Avoid wide reads when possible

Bad:

```sql
SELECT * FROM orders WHERE status = 'PAID';
```

Better if only summary fields are needed:

```sql
SELECT id, total_amount, created_at
FROM orders
WHERE status = 'PAID'
ORDER BY created_at DESC
LIMIT 100;
```

### Example 3: Function-based pitfall

Potentially problematic:

```sql
SELECT * FROM users WHERE LOWER(email) = 'a@example.com';
```

Better approach depends on DB design, but could include normalized stored data or a matching specialized index.

## Slow Query vs N+1 vs Connection Pool Exhaustion

| Problem | Main issue |
| --- | --- |
| Slow query | one query does too much work |
| N+1 | too many small queries instead of one efficient query pattern |
| Connection pool exhaustion | too many requests waiting for DB connections |

### Key distinction

These problems often appear together, but they are not the same.

- one giant scan can be slow
- many tiny repeated queries can also be slow
- both can help exhaust the connection pool

## Comparison Table

| Root cause | Typical symptom | Fix type | Tradeoff | Example |
| --- | --- | --- | --- | --- |
| Missing index | scan-heavy latency | add index | slower writes | lookup by email |
| Bad query shape | high rows examined | rewrite query | engineering effort | `SELECT *` on huge tables |
| Large offset pagination | latency grows with page depth | cursor pagination | more UX/API complexity | deep feed browsing |
| Repeated expensive query | recurring high DB load | cache or precompute | freshness complexity | dashboards |

## How to Detect Problems

### Signals

- p95 or p99 DB latency rising
- one query dominating slow query logs
- rows examined far higher than rows returned
- APM traces point to DB time rather than app logic
- database CPU pinned during one endpoint

### Useful tools

- slow query logs
- `EXPLAIN`
- APM traces
- DB CPU and IO dashboards
- connection pool wait metrics

## Common Beginner Mistakes

- filtering on unindexed fields in hot tables
- using `SELECT *` when only a few columns are needed
- ignoring deep OFFSET cost
- not reviewing query plans
- assuming the query is fine because it is fast on a small dev dataset

## Interview Framing

Slow-query questions are strong interview filters because they test whether you can move from a symptom to a root cause.

A strong answer usually includes:

- what the query is doing
- how much data it likely touches
- whether the access path is indexed
- what fix is most appropriate
- how you would verify the improvement

## Interview Questions You May Get

### Q1. What is the first thing you check for a slow query?

A strong answer:

- execution plan
- rows examined vs rows returned
- indexes used or not used
- whether the query is on a hot path

### Q2. Is a full table scan always bad?

No. It depends on table size, frequency, and workload type.
A rare analytics scan on a dedicated system can be fine.
A repeated scan on a hot transactional path is often a problem.

### Q3. How do you know if an index helped?

Check:

- execution plan changes
- query latency improvement
- rows examined reduction
- DB CPU and IO impact

## Strong Interview Answer Pattern

```text
I would start by checking the query plan to see whether the database is scanning too much data.
If the query is filtering or sorting on a hot path, I would add or redesign the index to match the access pattern.
If the issue is deep pagination, wide row fetches, or repeated heavy queries, I would also consider query rewrite,
cursor pagination, precomputation, or caching depending on the workload.
```

## Red Flags in Interviews

- saying “DB is slow” without identifying query shape
- assuming every slow query only needs an index
- ignoring rows examined
- not separating hot OLTP paths from batch/analytics workloads

---

# 3. Pagination Problems: OFFSET vs Cursor Pagination

**TL;DR:** OFFSET pagination is simple but becomes slower and less stable on large changing datasets, while cursor pagination is more scalable and consistent for feeds and large lists.

## Why Pagination Exists

Pagination exists because returning every row at once is usually too expensive and too hard for users to consume.

In plain English:

- large result sets are broken into smaller pages
- APIs and UIs fetch a portion at a time
- this reduces work per request and improves usability

### Analogy

Imagine reading a huge phone book page by page instead of dumping all pages onto the desk at once.

## What is OFFSET Pagination?

OFFSET pagination uses a query like:

```sql
SELECT *
FROM orders
ORDER BY created_at DESC
LIMIT 20 OFFSET 40;
```

Meaning:

- skip the first 40 rows
- return the next 20 rows

### Good

- easy to understand
- easy to implement
- supports page numbers naturally

### Bad

- deep pages become slower
- changing data can create duplicates or missing rows across pages

## What is Cursor Pagination?

Cursor pagination uses a stable reference point from the previous page.

Example:

```sql
SELECT *
FROM orders
WHERE created_at < '2026-06-27T10:00:00Z'
ORDER BY created_at DESC
LIMIT 20;
```

Instead of saying “skip 40 rows,” it says:

- continue after this last seen position

That position is often called a **cursor**.

### Good

- performance stays more stable on large datasets
- more robust when rows are inserted or deleted during browsing

### Bad

- harder to implement
- less natural for jump-to-page UX
- requires deterministic ordering

## Concrete Example

Suppose a social feed has **500 million posts**.

### OFFSET example

Page 1:

```sql
LIMIT 20 OFFSET 0
```

Page 10000:

```sql
LIMIT 20 OFFSET 199980
```

The database may need to walk or skip a huge amount of data before returning the page.

### Stability problem

If new posts arrive between requests:

- page 1 may show some posts
- page 2 may skip or repeat some posts because the underlying order shifted

### Cursor example

Page 1 returns 20 posts and also returns a cursor based on the last item:

```text
next_cursor = (created_at='2026-06-27T10:00:00Z', id=98765)
```

Next page request uses that cursor to continue from a stable boundary.

## Why OFFSET Becomes Slow

OFFSET becomes slow because the DB often still has to traverse or discard the skipped rows.

So even if you ask for 20 rows:

- offset 20 is cheap
- offset 200,000 is much more expensive
- offset 20,000,000 is usually painful

## Why Cursor Pagination Helps

Cursor pagination helps because the query usually resumes from a known indexed position.

That means:

- less wasted scanning
- better stability under concurrent inserts/deletes
- better fit for timelines, feeds, logs, and large history lists

## Code-Level / SQL Examples

### Example 1: OFFSET pagination

```sql
SELECT id, total_amount, created_at
FROM orders
ORDER BY created_at DESC, id DESC
LIMIT 20 OFFSET 1000;
```

### Example 2: Cursor pagination

```sql
SELECT id, total_amount, created_at
FROM orders
WHERE (created_at, id) < ('2026-06-27T10:00:00Z', 98765)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

### Example 3: API response shape

```json
{
  "items": [...],
  "next_cursor": "2026-06-27T10:00:00Z_98765"
}
```

## OFFSET vs Cursor vs Page Number UX

| Approach | Strength | Weakness |
| --- | --- | --- |
| OFFSET | simple and page-number friendly | poor deep-page performance, unstable under writes |
| Cursor | scalable and stable | harder UX for jump-to-page |
| Page number UI | user-friendly for catalogs/admin | often backed by OFFSET unless carefully designed |

### Important idea

There is a difference between:

- **user-facing page number UX**, and
- **database access strategy**

You may offer page numbers in the UI while still using smarter backend techniques in some systems.

## Comparison Table

| Strategy | Performance at depth | Stability under inserts/deletes | Jump-to-page support | Complexity | Best use case |
| --- | --- | --- | --- | --- | --- |
| OFFSET | Poor at large depth | Low | Strong | Low | small admin lists |
| Cursor | Strong | High | Weak | Medium | feeds, timelines, large histories |
| Keyset pagination | Strong | High | Weak | Medium | stable ordered datasets |

## How to Detect Problems

### Signals

- list endpoints get slower on deep pages
- users report duplicates or missing rows across pages
- DB CPU grows for deep browsing queries
- `rows examined` is much higher than page size

### Useful metrics and checks

- p95 latency by page depth
- rows scanned per paginated query
- duplicate/missing item bug reports
- query plans for list endpoints

## Common Beginner Mistakes

- using OFFSET for huge feeds or activity streams
- not using deterministic ordering
- exposing raw internal IDs unsafely as cursors
- forgetting that inserts/deletes can shift OFFSET pages
- not validating or encoding cursors properly

## Interview Framing

Pagination is a great interview topic because it looks simple until scale and concurrent writes make it tricky.

A strong answer usually includes:

- the difference between OFFSET and cursor behavior
- why deep OFFSET gets slower
- why cursor pagination is more stable
- when page-number UX still makes sense

## Interview Questions You May Get

### Q1. Why does OFFSET pagination get slow?

Because the database often must still traverse or discard all skipped rows before returning the page you asked for.

### Q2. Why is cursor pagination more stable?

Because it continues from a known last-seen position rather than from a row count that may shift when new records are inserted or deleted.

### Q3. When would OFFSET still be acceptable?

Good examples:

- small admin tables
- low-scale internal tools
- datasets where deep paging is rare

## Strong Interview Answer Pattern

```text
I would use OFFSET for simple small lists where jump-to-page matters and the dataset is not huge.
For large feeds, timelines, or fast-changing datasets, I would prefer cursor pagination because deep OFFSET
gets slower and page boundaries become unstable under concurrent inserts or deletes. I would also make sure
ordering is deterministic, often with a timestamp plus a unique tie-breaker like ID.
```

## Red Flags in Interviews

- recommending OFFSET for massive feeds by default
- ignoring deterministic sort order
- talking about cursor pagination without defining the cursor fields
- assuming pagination is only a frontend concern

---

# Interview Cheat Sheet for Section E

## 1-minute Comparison View

| Topic | Core problem | Main benefit | Main risk | Common mitigation |
| --- | --- | --- | --- | --- |
| Indexing | DB must search too much data | faster lookup/filter/sort | write and storage overhead | query-driven index design |
| Slow Queries / Full Table Scan | one query touches too much data | root-cause clarity | system-wide DB pressure | query plan review, indexing, rewrite |
| OFFSET vs Cursor Pagination | list retrieval degrades at scale | usable list APIs | deep-scan cost, unstable pages | cursor/keyset pagination |

## Quick “When I’d Use It” Lines

### Indexing

“I would add indexes based on the real access path, especially the filter, join, and sort pattern that matters on the hot path.”

### Slow query diagnosis

“I would start with the query plan, rows examined, and whether the query is doing unnecessary scans, joins, or wide reads.”

### Cursor pagination

“I would prefer cursor pagination for large or fast-changing datasets, and keep OFFSET for simpler small lists where page-number UX matters.”

## Common Cross-Cutting Interview Theme

All three topics test a deeper skill:

### Can you make the data path scale without wasting work?

A strong candidate does not just say:

- add an index
- optimize the DB
- paginate results

A strong candidate says:

- which query path is hot
- how much data the DB is really touching
- what execution pattern is causing waste
- how the fix changes read/write tradeoffs
- how to verify the improvement with plans and metrics

---

# Final Summary

Section E is about a very practical system design truth:

> many performance problems are really data-access problems.

These three topics connect tightly:

- **Indexing** improves how the DB finds data
- **Slow query analysis** explains when the DB is doing too much work
- **Pagination strategy** determines whether large list access remains efficient as data grows

In interviews, the strongest answers keep returning to four questions:

1. **How much data is the query touching?**
2. **Is the access path aligned with the query pattern?**
3. **What tradeoff does the optimization add?**
4. **How would you verify the fix?**

## Suggested Next Step

After Section E, the most natural continuation is **Section F: API / Product-Facing Design**, especially:

1. Polling vs Webhooks vs WebSockets
2. API Versioning
3. Session Management / Sticky Sessions
