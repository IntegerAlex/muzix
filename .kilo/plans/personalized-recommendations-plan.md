# Personalized Recommendations Implementation Plan

## Goal
Replace the static "Top picks for you" section (currently `songs.slice(0, 6)`) with a personalized recommendation system based on user listening behavior and song metadata.

## Research Summary
After researching production music recommendation systems, the most battle-tested approach is a **Hybrid Recommendation System** combining:

1. **Collaborative Filtering** (implicit feedback from listening events)
   - Alternating Least Squares (ALS) - used by Spotify, Netflix
   - Item-item similarity: "users who listened to X also listened to Y"
   - Library: `lightfm` (hybrid matrix factorization, used by Lyst in production)

2. **Content-Based Filtering** (song metadata features)
   - Artist, genre, album, lyrics keywords
   - Handles cold-start for new songs/users

3. **Hybrid Scoring** (weighted combination)
   - Combines CF + content-based signals
   - Addresses cold-start and data sparsity

## Current State
- **Frontend**: `web/muzix/app/(tabs)/index.tsx` line 180: `const recentSongs = useMemo(() => songs.slice(0, 6), [songs]);`
- **Backend**: No recommendation endpoint exists
- **Data available**:
  - `listening_events` table with event_type, completion_percentage, song_id, user_id
  - `songs` table with artist, album, genre (via album), lyrics, colors
  - `user_likes` table for explicit preferences
  - Analytics already compute: top songs, artist affinity, skip rate, completion rate

## Proposed Solution: LightFM Hybrid Model

### Why LightFM?
- **Battle-tested**: Used in production by Lyst (fashion e-commerce), referenced in academic papers
- **Hybrid by design**: Combines collaborative filtering + content-based filtering natively
- **Cold-start handling**: Works well for new users/songs via content features
- **Python implementation**: `lightfm` library is mature and well-maintained
- **Fast training**: Can train on CPU in seconds for small-medium datasets

### Algorithm Details
1. **User-Item Interactions** (from `listening_events`):
   - Positive signals: `complete` (weight=1.0), `play` with high completion % (weight=0.5-1.0)
   - Negative signals: `skip` (weight=-1.0), `play` with low completion % (weight=0.0-0.3)
   - Confidence: based on duration_played_ms / song_duration_ms

2. **Item Features** (from `songs` + `albums`):
   - Artist ID
   - Album ID
   - Genre (from album)
   - Lyrics keywords (TF-IDF)
   - Color features (from colors array)

3. **User Features** (derived from listening history):
   - Preferred artists (top 10)
   - Preferred genres (top 5)
   - Preferred time-of-day (morning/afternoon/evening/night)
   - Average completion rate
   - Skip rate

4. **Model Training**:
   - Use `lightfm` with `WARP` loss (Weighted Approximate-Rank Pairwise)
   - Train on user-item interactions + features
   - Store model in memory (retrain on app startup or via API trigger)
   - For small datasets, training takes < 1 second

5. **Recommendation Generation**:
   - For each user, generate top-N recommendations
   - Filter out already-liked songs
   - Ensure diversity (max 2 songs per artist)
   - Fallback to popular songs for new users

## Implementation Plan

### Phase 1: Backend Infrastructure
1. **Add dependency**: `lightfm` to `requirements.txt`
2. **Create recommendation service** (`backend/services/recommendations.py`):
   - `train_model()` - builds interaction matrix, trains LightFM model
   - `get_recommendations(user_id, limit=20)` - generates personalized recommendations
   - `get_popular_songs(limit=20)` - fallback for new users
3. **Create recommendation repository** (`backend/repositories/recommendations.py`):
   - `get_user_interactions(user_id)` - fetches listening events with weights
   - `get_song_features()` - builds item feature matrix
   - `get_user_features(user_id)` - builds user feature vector
4. **Create API endpoint** (`backend/routes/recommendations.py`):
   - `GET /recommendations/user/top-picks?limit=20`
   - Requires auth
   - Returns list of recommended songs with scores

### Phase 2: Model Training Strategy
1. **On-demand training**: Train model when first user requests recommendations after app startup
2. **Cache model**: Store in memory, retrain every 24 hours or when new events arrive
3. **Fallback**: If model not trained yet, return popular songs

### Phase 3: Frontend Integration
1. **Update `HomeScreen`** (`web/muzix/app/(tabs)/index.tsx`):
   - Replace `recentSongs` with `topPicks` fetched from `/recommendations/user/top-picks`
   - Add loading state while recommendations load
   - Keep fallback to popular songs if API fails
2. **Update API client** (`web/muzix/services/api.ts`):
   - Add `recommendations.topPicks(limit, token)` method

### Phase 4: Testing & Validation
1. **Backend tests**:
   - Test model training with sample data
   - Test recommendation generation
   - Test cold-start scenarios (new user, new song)
2. **Frontend tests**:
   - Test loading states
   - Test fallback behavior
   - Test error handling

## Key Design Decisions

### 1. Interaction Weighting
| Event Type | Weight | Rationale |
|------------|--------|-----------|
| complete | 1.0 | Strong positive signal |
| play (completion > 80%) | 0.8 | User enjoyed the song |
| play (completion 50-80%) | 0.5 | Moderate interest |
| play (completion < 50%) | 0.2 | Low interest |
| skip | -1.0 | Strong negative signal |

### 2. Feature Engineering
- **Item features**: One-hot encode artist, album, genre; TF-IDF on lyrics; normalize colors
- **User features**: Aggregate from listening history (top artists, genres, time patterns)
- **Normalization**: All features normalized to [0, 1] range

### 3. Model Parameters
- `no_components`: 50 (latent factors)
- `learning_rate`: 0.05
- `epochs`: 20
- `max_sampled`: 10
- Loss: `warp` (optimizes for ranking)

### 4. Cold-Start Strategy
- **New user** (< 5 listening events): Return popular songs + songs from genres/artists they've shown interest in
- **New song** (no interactions): Return to users who like similar artists/genres via content features

## Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| Model training too slow | Use `lightfm` (optimized Cython), train on-demand with caching |
| Cold-start for new users | Fallback to content-based + popular songs |
| Data sparsity | Use content features to augment collaborative signals |
| Model drift | Retrain every 24 hours |
| Memory usage | Cache model in memory (~10-50MB for typical dataset) |

## Dependencies to Add
```txt
# backend/requirements.txt
lightfm>=1.17
scikit-learn>=1.0  # for TF-IDF
```

## Files to Create/Modify
### Create:
- `backend/services/recommendations.py`
- `backend/repositories/recommendations.py`
- `backend/routes/recommendations.py`
- `backend/models/recommendation.py` (optional, for model persistence)

### Modify:
- `backend/main.py` - register new router
- `backend/requirements.txt` - add dependencies
- `web/muzix/app/(tabs)/index.tsx` - use recommendations API
- `web/muzix/services/api.ts` - add recommendation methods

## Validation Plan
1. Verify recommendations differ per user
2. Verify recommendations include songs user hasn't heard
3. Verify cold-start users get reasonable fallbacks
4. Verify model training completes in < 5 seconds
5. Verify API response time < 500ms (with cached model)
