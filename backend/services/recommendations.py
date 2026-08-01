"""Recommendation service: pure numpy/scipy ALS collaborative filtering with content fallback."""
import asyncio
import hashlib
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import numpy as np
from scipy.sparse import coo_matrix, csr_matrix, csc_matrix

import repositories.recommendations as rec_repo

logger = logging.getLogger("muzix.recommendations")


def _als_step(factors: np.ndarray, other_factors: np.ndarray,
              indptr: np.ndarray, indices: np.ndarray, data: np.ndarray,
              reg: float, alpha: float) -> np.ndarray:
    """One ALS half-step: update factors for one dimension (users or items)."""
    n = len(indptr) - 1
    new_factors = np.empty_like(factors)
    OtO = other_factors.T @ other_factors

    for i in range(n):
        start, end = indptr[i], indptr[i + 1]
        if start == end:
            new_factors[i] = factors[i]
            continue

        item_ids = indices[start:end]
        ratings = data[start:end]
        X = other_factors[item_ids]
        conf = 1.0 + alpha * ratings

        A = OtO.copy()
        for j in range(len(item_ids)):
            x = X[j]
            A += (conf[j] - 1.0) * np.outer(x, x)
        A += reg * np.eye(factors.shape[1], dtype=np.float64)

        b = np.dot(conf, X)
        new_factors[i] = np.linalg.solve(A, b)

    return new_factors


class NumpyALS:
    """Pure numpy/scipy ALS for implicit feedback. No compiled extensions."""

    def __init__(self, factors=50, regularization=0.01, alpha=40, iterations=20, random_state=42):
        self.factors = factors
        self.regularization = regularization
        self.alpha = alpha
        self.iterations = iterations
        self.random_state = random_state
        self.user_factors: np.ndarray | None = None
        self.item_factors: np.ndarray | None = None

    def fit(self, user_items: csr_matrix):
        n_users, n_items = user_items.shape
        rng = np.random.RandomState(self.random_state)

        self.user_factors = rng.normal(0, 0.1, (n_users, self.factors)).astype(np.float64)
        self.item_factors = rng.normal(0, 0.1, (n_items, self.factors)).astype(np.float64)
        reg = self.regularization
        alpha = self.alpha

        # CSC for column-efficient access (item updates)
        user_items_csc = user_items.tocsc()

        for iteration in range(self.iterations):
            self.user_factors = _als_step(
                self.user_factors, self.item_factors,
                user_items.indptr, user_items.indices, user_items.data,
                reg, alpha,
            )

            self.item_factors = _als_step(
                self.item_factors, self.user_factors,
                user_items_csc.indptr, user_items_csc.indices, user_items_csc.data,
                reg, alpha,
            )

            logger.debug("ALS iteration %d/%d complete", iteration + 1, self.iterations)


_model: NumpyALS | None = None
_user_factors: np.ndarray | None = None
_item_factors: np.ndarray | None = None
_user_id_map: dict[str, int] = {}
_item_id_map: dict[str, int] = {}
_item_features_map: dict[str, dict] = {}
_last_trained_at: datetime | None = None
_model_version_hash: str = ""
_training_lock = asyncio.Lock()
_popular_cache: tuple[float, list[dict]] | None = None
_POPULAR_CACHE_TTL = 60


def _compute_version_hash() -> str:
    try:
        raw = f"{datetime.now(timezone.utc).isoformat()}-recommendations"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]
    except Exception:
        return datetime.now(timezone.utc).isoformat()


async def _get_cached_popular(limit: int, base_url: str = "") -> list[dict]:
    global _popular_cache
    now = time.time()
    if _popular_cache is not None and (now - _popular_cache[0]) < _POPULAR_CACHE_TTL:
        return _popular_cache[1][:limit]
    result = await rec_repo.get_popular_songs(limit, base_url=base_url)
    _popular_cache = (now, result)
    return result


async def train_model() -> bool:
    global _model, _user_factors, _item_factors, _user_id_map, _item_id_map, _item_features_map, _last_trained_at, _model_version_hash

    async with _training_lock:
        return await _train()

async def _train() -> bool:
    global _model, _user_factors, _item_factors, _user_id_map, _item_id_map, _item_features_map, _last_trained_at, _model_version_hash

    try:
        since = datetime.now(timezone.utc) - timedelta(days=180)
        interactions = await rec_repo.get_all_user_interactions(since=since)
        if not interactions:
            logger.warning("No interactions available for training")
            return False

        song_ids = sorted(set(i["song_id"] for i in interactions if i.get("song_id")))
        if not song_ids:
            return False

        song_features = await rec_repo.get_song_features(song_ids)
        _item_features_map = song_features

        user_ids = sorted(set(i.get("user_id") for i in interactions if i.get("user_id")))
        if not user_ids:
            user_ids = ["global"]

        user_id_map = {uid: idx for idx, uid in enumerate(user_ids)}
        item_id_map = {sid: idx for idx, sid in enumerate(song_ids)}
        _user_id_map = user_id_map
        _item_id_map = item_id_map

        rows, cols, data = [], [], []
        for item in interactions:
            uid = item.get("user_id")
            sid = item.get("song_id")
            if not uid or not sid or uid not in user_id_map or sid not in item_id_map:
                continue
            weight = float(item.get("weight", 1))
            if weight <= 0:
                continue
            rows.append(user_id_map[uid])
            cols.append(item_id_map[sid])
            data.append(weight)

        if not rows:
            return False

        interaction_matrix = coo_matrix((data, (rows, cols)),
                                        shape=(len(user_id_map), len(item_id_map)),
                                        dtype=np.float64).tocsr()

        model = NumpyALS(factors=50, regularization=0.01, alpha=40, iterations=15, random_state=42)
        model.fit(interaction_matrix)

        _model = model
        _user_factors = model.user_factors
        _item_factors = model.item_factors
        _last_trained_at = datetime.now(timezone.utc)
        _model_version_hash = _compute_version_hash()
        logger.info("Recommendation model trained with %d interactions", len(rows))
        return True

    except Exception as exc:
        logger.error("Failed to train recommendation model: %s", exc, exc_info=True)
        _model = None
        _user_factors = None
        _item_factors = None
        return False


def _content_score(song_id: str, user_data: dict) -> float:
    song = _item_features_map.get(song_id, {})
    score = 0.0
    if song.get("artist_id") in user_data.get("top_artists", []):
        score += 0.5
    if song.get("genre") in user_data.get("top_genres", []):
        score += 0.3
    return score


async def get_recommendations(user_id: str, limit: int = 20, base_url: str = "") -> list[dict]:
    global _model, _user_factors, _item_factors, _user_id_map, _item_id_map

    if _model is None or _user_factors is None or _item_factors is None:
        return await _get_cached_popular(limit, base_url=base_url)

    try:
        user_data = await rec_repo.get_user_features(user_id)
        liked = await rec_repo.get_user_liked_songs(user_id)

        user_idx = _user_id_map.get(user_id)
        if user_idx is None or user_idx >= _user_factors.shape[0]:
            return await _get_cached_popular(limit, base_url=base_url)

        user_vector = _user_factors[user_idx]
        scores = _item_factors @ user_vector

        item_scores = {sid: float(scores[idx]) for sid, idx in _item_id_map.items()}
        for sid in item_scores:
            item_scores[sid] += _content_score(sid, user_data)

        filtered = [(sid, score) for sid, score in item_scores.items() if sid not in liked]
        filtered.sort(key=lambda x: x[1], reverse=True)

        top_ids = [sid for sid, _ in filtered[:limit]]
        song_map = {sid: _item_features_map.get(sid, {}) for sid in top_ids}

        return [{
            "id": sid,
            "title": song.get("title", "Unknown"),
            "artist": song.get("artist_name", "Unknown"),
            "album": song.get("album_title", "Unknown"),
            "duration_ms": song.get("duration_ms", 0),
            "colors": song.get("colors", ["#6d28d9", "#db2777"]),
            "imageUrl": f"{base_url}/thumbnails/{sid}.jpg",
        } for sid in top_ids for song in [song_map.get(sid, {})]]

    except Exception as exc:
        logger.error("Failed to generate recommendations: %s", exc, exc_info=True)
        return await _get_cached_popular(limit, base_url=base_url)


async def get_model_status() -> dict[str, Any]:
    return {
        "trained": _model is not None,
        "last_trained_at": _last_trained_at.isoformat() if _last_trained_at else None,
        "version": _model_version_hash,
        "num_users": len(_user_id_map),
        "num_items": len(_item_id_map),
    }
