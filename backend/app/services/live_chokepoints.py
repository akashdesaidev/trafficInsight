from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import math
import asyncio

import httpx

try:
    import numpy as np
    from sklearn.cluster import DBSCAN
except Exception as exc:  # pragma: no cover
    np = None  # type: ignore
    DBSCAN = None  # type: ignore

try:
    from mapbox_vector_tile import decode as mvt_decode
except Exception as exc:  # pragma: no cover
    mvt_decode = None  # type: ignore

from app.core.config import get_settings
from app.services.cache import get_cache


EARTH_RADIUS_M = 6371000.0


@dataclass
class SamplePoint:
    lat: float
    lon: float
    severity: float  # 0..1 (jamFactor/10)
    weight: float    # weighted by severity and other boosts


class LiveChokepointService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.cache = get_cache()

    async def get_live_chokepoints(
        self,
        bbox: List[float],
        z: int = 13,
        eps_m: int = 200,
        min_samples: int = 3,
        jf_min: float = 4.0,
        incident_radius_m: int = 100,
        include_geocode: bool = False,
    ) -> Dict[str, Any]:
        """
        Compute live chokepoints using vector flow tiles (jamFactor) and DBSCAN.
        Returns clusters suitable for a leaderboard UI.
        """

        # Basic parameter checks
        if np is None or DBSCAN is None:
            raise RuntimeError("numpy/scikit-learn not installed")
        if mvt_decode is None:
            raise RuntimeError("mapbox-vector-tile not installed")

        min_lon, min_lat, max_lon, max_lat = bbox
        # Use cache to avoid repeated heavy work within short window
        cache_key = (
            f"live_chokepoints:{min_lon:.5f},{min_lat:.5f},{max_lon:.5f},{max_lat:.5f}:"
            f"z={z}:eps={eps_m}:minS={min_samples}:jfmin={jf_min}:ir={incident_radius_m}:geo={include_geocode}"
        )
        cached = await self._aget_cache(cache_key)
        if cached:
            return cached

        # Step 1: compute tiles covering bbox
        tiles = self._tiles_for_bbox(min_lon, min_lat, max_lon, max_lat, z)
        # Cap tiles to keep performance bounded
        MAX_TILES = 32
        if len(tiles) > MAX_TILES:
            # Reduce zoom if tile count is excessive
            z_reduced = max(0, z - 1)
            tiles = self._tiles_for_bbox(min_lon, min_lat, max_lon, max_lat, z_reduced)
            z = z_reduced

        # Step 2: fetch+decode vector tiles
        features = await self._fetch_decode_tiles(tiles, z)

        # Step 3: build severity samples from jamFactor
        samples = self._build_samples_from_features(features, jf_min=jf_min)

        # Step 4: fetch incidents and boost nearby samples
        incidents = await self._fetch_incidents(bbox)
        if incidents:
            self._boost_samples_with_incidents(samples, incidents, incident_radius_m)

        # Step 5: run DBSCAN clustering (haversine)
        clusters = self._cluster_samples(samples, eps_m=eps_m, min_samples=min_samples)

        # Step 6: aggregate/score clusters
        result = self._aggregate_and_score(clusters, include_geocode=include_geocode)

        # Step 7: cache final (TTL ~60s)
        await self._aset_cache(cache_key, result, 60)
        return result

    # ------------------------ helpers ------------------------

    async def _aget_cache(self, key: str) -> Optional[Any]:
        return await get_cache_service_async(self.cache).get(key)  # type: ignore

    async def _aset_cache(self, key: str, value: Any, ttl: int) -> None:
        await get_cache_service_async(self.cache).set(key, value, ttl)  # type: ignore

    def _tiles_for_bbox(self, min_lon: float, min_lat: float, max_lon: float, max_lat: float, z: int) -> List[Tuple[int, int]]:
        # Convert lon/lat bbox to inclusive tile range at zoom z
        def lonlat_to_tile(lon: float, lat: float, zoom: int) -> Tuple[int, int]:
            lat_rad = math.radians(lat)
            n = 2 ** zoom
            xtile = int((lon + 180.0) / 360.0 * n)
            ytile = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
            return xtile, ytile

        min_x, max_y = lonlat_to_tile(min_lon, min_lat, z)
        max_x, min_y = lonlat_to_tile(max_lon, max_lat, z)

        tiles: List[Tuple[int, int]] = []
        for x in range(min(min_x, max_x), max(min_x, max_x) + 1):
            for y in range(min(min_y, max_y), max(min_y, max_y) + 1):
                tiles.append((x, y))
        return tiles

    async def _fetch_decode_tiles(self, tiles: List[Tuple[int, int]], z: int) -> List[Dict[str, Any]]:
        settings = self.settings
        api_key = settings.clean_tomtom_traffic_api_key or settings.clean_tomtom_maps_api_key
        if not api_key:
            raise RuntimeError("TomTom API key not configured")

        # simple concurrency limit
        sem = asyncio.Semaphore(8)

        async def fetch_tile(x: int, y: int) -> Optional[Dict[str, Any]]:
            cache_key = f"mvt:{z}:{x}:{y}"
            cached = self.cache.get(cache_key)
            if cached:
                return cached  # already decoded
            url = f"https://api.tomtom.com/traffic/map/4/tile/flow/relative/{z}/{x}/{y}.pbf"
            params = {"key": api_key}
            async with sem:
                try:
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        resp = await client.get(url, params=params)
                        if resp.status_code != 200:
                            return None
                        decoded = mvt_decode(resp.content)
                        # cache decoded layer object for short time
                        self.cache.set(cache_key, decoded, 60)
                        return {"x": x, "y": y, "z": z, "layers": decoded}
                except Exception:
                    return None

        tasks = [fetch_tile(x, y) for (x, y) in tiles]
        decoded_tiles = [d for d in await asyncio.gather(*tasks) if d]

        features: List[Dict[str, Any]] = []
        for decoded in decoded_tiles:
            x = decoded.get("x")
            y = decoded.get("y")
            tz = decoded.get("z")
            layers = decoded.get("layers", {})
            for layer_name, layer in layers.items():
                feats = layer.get("features") or []
                extent = layer.get("extent") or 4096
                for f in feats:
                    props = f.get("properties", {}) or {}
                    geom = f.get("geometry")
                    if not geom:
                        continue
                    features.append({
                        "layer": layer_name,
                        "properties": props,
                        "geometry": geom,
                        "extent": extent,
                        "x": x,
                        "y": y,
                        "z": tz,
                    })
        return features

    def _build_samples_from_features(self, features: List[Dict[str, Any]], jf_min: float) -> List[SamplePoint]:
        samples: List[SamplePoint] = []
        for feat in features:
            props = feat["properties"]
            jam = None
            for k, v in props.items():
                if isinstance(v, (int, float)) and "jam" in k.lower():
                    jam = float(v)
                    break
            if jam is None:
                continue
            if jam < jf_min:
                continue

            geom = feat["geometry"]
            extent = float(feat.get("extent", 4096))
            x = int(feat.get("x"))
            y = int(feat.get("y"))
            z = int(feat.get("z"))
            # geometry is typically a dict with type "LineString" or similar and coordinates in tile space
            coords = None
            if isinstance(geom, dict):
                coords = geom.get("coordinates")
            elif isinstance(geom, list):
                coords = geom
            if not coords:
                continue

            # representative point: mid vertex of the first line
            try:
                line = coords[0] if isinstance(coords[0][0], list) else coords
                mid_idx = len(line) // 2
                tx, ty = line[mid_idx]
            except Exception:
                continue

            lon, lat = tile_point_to_lonlat(x, y, z, tx, ty, extent)
            severity = max(0.0, min(1.0, jam / 10.0))
            weight = severity
            samples.append(SamplePoint(lat=lat, lon=lon, severity=severity, weight=weight))

        return samples

    async def _fetch_incidents(self, bbox: List[float]) -> List[Dict[str, Any]]:
        min_lon, min_lat, max_lon, max_lat = bbox
        bbox_str = f"{min_lon},{min_lat},{max_lon},{max_lat}"
        # Reuse existing API via local HTTP call would loopback; call TomTom directly to avoid coupling
        settings = self.settings
        api_key = settings.clean_tomtom_traffic_api_key or settings.clean_tomtom_maps_api_key
        if not api_key:
            return []
        params = {
            "key": api_key,
            "bbox": bbox_str,
            "language": "en-GB",
            "timeValidityFilter": "present",
            "fields": "{incidents{type,severity,geometry{type,coordinates},properties{id}}}",
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get("https://api.tomtom.com/traffic/services/5/incidentDetails", params=params)
                if resp.status_code != 200:
                    return []
                data = resp.json()
        except Exception:
            return []
        incidents = data.get("incidents")
        if isinstance(incidents, dict):
            incidents = incidents.get("incidents")
        return incidents or []

    def _boost_samples_with_incidents(self, samples: List[SamplePoint], incidents: List[Dict[str, Any]], radius_m: int) -> None:
        if not samples:
            return
        # simple proximity boost using haversine distance
        for s in samples:
            for lon_i, lat_i in iter_incident_points(incidents):
                d = haversine_m(s.lat, s.lon, lat_i, lon_i)
                if d <= radius_m:
                    s.weight *= 1.5

    def _cluster_samples(self, samples: List[SamplePoint], eps_m: int, min_samples: int) -> List[List[SamplePoint]]:
        if not samples:
            return []
        coords = np.radians([[s.lat, s.lon] for s in samples])
        weights = np.array([max(1e-6, s.weight) for s in samples])
        eps = eps_m / EARTH_RADIUS_M
        labels = DBSCAN(eps=eps, min_samples=min_samples, metric="haversine").fit_predict(coords, sample_weight=weights)
        clusters: Dict[int, List[SamplePoint]] = {}
        for lbl, s in zip(labels, samples):
            if lbl == -1:
                continue
            clusters.setdefault(int(lbl), []).append(s)
        return list(clusters.values())

    def _aggregate_and_score(self, clusters: List[List[SamplePoint]], include_geocode: bool) -> Dict[str, Any]:
        results: List[Dict[str, Any]] = []
        for idx, cl in enumerate(clusters):
            if not cl:
                continue
            total_w = sum(p.weight for p in cl)
            if total_w <= 0:
                continue
            lat = sum(p.lat * p.weight for p in cl) / total_w
            lon = sum(p.lon * p.weight for p in cl) / total_w
            sev_values = sorted([p.severity for p in cl])
            # weighted mean severity
            sev_mean = sum(p.severity * p.weight for p in cl) / total_w
            # simple p90 (unweighted for simplicity)
            p90 = sev_values[int(0.9 * (len(sev_values) - 1))] if len(sev_values) > 1 else sev_values[0]

            # placeholder incident/closure handling (requires storing flags during sampling)
            incident_count = 0
            closure = False

            bonus = 0.0
            if closure:
                bonus = max(bonus, 0.1)
            if incident_count > 0:
                bonus = max(bonus, 0.1)

            score = 100.0 * (0.6 * sev_mean + 0.3 * p90 + 0.1 * bonus)

            results.append({
                "id": f"cp_{idx}",
                "center": {"lat": lat, "lon": lon},
                "score": round(score, 1),
                "severity_mean": round(sev_mean, 3),
                "severity_peak": round(p90, 3),
                "incident_count": incident_count,
                "closure": closure,
                "support": round(total_w, 2),
                "count": len(cl),
            })

        results.sort(key=lambda r: r["score"], reverse=True)
        return {"clusters": results}


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    rlat1 = math.radians(lat1)
    rlat2 = math.radians(lat2)
    dlat = rlat2 - rlat1
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_M * c


def tile_point_to_lonlat(x: int, y: int, z: int, tx: float, ty: float, extent: float) -> Tuple[float, float]:
    # Convert tile-local coordinates (0..extent) to lon/lat at z/x/y
    n = 2 ** z
    u = (x + (tx / extent)) / n
    v = (y + (ty / extent)) / n
    lon = u * 360.0 - 180.0
    lat_rad = math.atan(math.sinh(math.pi * (1 - 2 * v)))
    lat = math.degrees(lat_rad)
    return lon, lat


def iter_incident_points(incidents: List[Dict[str, Any]]):
    for inc in incidents:
        geom = inc.get("geometry", {}) if isinstance(inc, dict) else None
        if not isinstance(geom, dict):
            continue
        coords = geom.get("coordinates")
        if not coords:
            continue
        # incidents geometry may be Point or LineString
        if isinstance(coords[0], (int, float)) and len(coords) >= 2:
            lon_i, lat_i = float(coords[0]), float(coords[1])
            yield lon_i, lat_i
        elif isinstance(coords[0], (list, tuple)):
            try:
                lon_i, lat_i = float(coords[0][0]), float(coords[0][1])
                yield lon_i, lat_i
            except Exception:
                continue

class _AsyncCacheWrapper:
    def __init__(self, cache) -> None:
        self.cache = cache

    async def get(self, key: str) -> Optional[Any]:
        return self.cache.get(key)

    async def set(self, key: str, value: Any, expire: int) -> None:
        self.cache.set(key, value, expire)


def get_cache_service_async(cache) -> _AsyncCacheWrapper:
    return _AsyncCacheWrapper(cache)


