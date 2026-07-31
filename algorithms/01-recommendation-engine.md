# 01 — Recommendation Engine

ALS collaborative filtering with content-based boost and popular songs fallback.

- **Type**: Known algorithm (Hu, Koren, Yeh 2008 — implicit feedback ALS) + Custom hybrid
- **File**: `backend/services/recommendations.py`, lines 17–244
- **Repository**: `backend/repositories/recommendations.py`, lines 41–251

## How it works

### 1. ALS Matrix Factorization (`NumpyALS`)

Pure numpy/scipy implementation. No compiled extensions or third-party ML libraries.

**Hyperparameters** (actual training at line 174):

| Parameter | Value | Notes |
|-----------|-------|-------|
| factors | 50 | Latent dimension |
| regularization | 0.01 | L2 regularization |
| alpha | 40 | Confidence scaling for implicit feedback |
| iterations | 15 | Actual training iterations (constructor default is 20, overridden at line 174) |
| random_state | 42 | Deterministic init |

**Initialization**: `N(0, 0.1)` for both user and item factors (line 64–65).

**Training data**: 180 days of user interactions, built into a CSR sparse matrix (line 132, 170–172). Negative-weight interactions are excluded (line 161–162).

**ALS half-step** (`_als_step`, lines 17–45):
```
for each user/item i:
    X = other_factors[interacted_items]
    conf = 1.0 + alpha * ratings
    A = (other_factors.T @ other_factors) + sum((conf[j] - 1) * outer(x_j, x_j)) + reg * I
    b = conf @ X
    new_factors[i] = solve(A, b)
```

Alternates user-factor and item-factor updates each iteration. Uses CSC column-efficient access for item updates (line 70).

### 2. Content-Based Scoring (`_content_score`, lines 193–200)

Hardcoded boost on top of ALS dot-product scores:

| Condition | Boost |
|-----------|-------|
| Artist in user's top 10 artists | +0.5 |
| Genre in user's top 5 genres | +0.3 |
| Both match | +0.8 |
| Neither match | +0.0 |

### 3. Final Ranking (`get_recommendations`, lines 203–244)

```
user_vector = _user_factors[user_idx]
scores = _item_factors @ user_vector          # dot product
scores[song_id] += _content_score(song_id)   # add content boost
filter out already-liked songs
sort descending by score
return top-N (default 20, max 50)
```

### 4. Cold-Start Fallback

When the model is not trained (no interactions or first request), returns globally popular songs:

- **Query**: `GROUP BY song_id ORDER BY play_count DESC` with average completion rate
- **Cache**: In-memory TTL cache, 60 seconds (`_POPULAR_CACHE_TTL`, line 99)
- **Source**: `backend/repositories/recommendations.py`, lines 214–251

### 5. Model Training Flow

- Training is triggered lazily on first `get_recommendations` call (line 207–208)
- Uses `asyncio.Lock()` to prevent concurrent training (line 96, 123–126)
- Model state is held in module-level globals (lines 88–98)
- Version hash computed from timestamp for cache invalidation (lines 102–107)

## Input → Output

- **Input**: `user_id: str`, `limit: int` (default 20)
- **Output**: List of song dicts with `id`, `title`, `artist`, `album`, `duration_ms`, `colors`, `imageUrl`
