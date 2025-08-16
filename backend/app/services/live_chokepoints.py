from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import math
import asyncio
import logging

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

# Ensure default logging outputs to console if not configured by host
if not logging.getLogger().handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


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
        self.logger = logging.getLogger(__name__)

    async def get_live_chokepoints(
        self,
        bbox: List[float],
        z: int = 13,
        eps_m: int = 150,  # Optimized for Bangalore's dense urban areas
        min_samples: int = 4,  # Increased for major corridors
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
        self.logger.info(
            "live_chokepoints: bbox=(%.5f,%.5f,%.5f,%.5f) z=%s eps_m=%s min_samples=%s jf_min=%s include_geocode=%s",
            min_lon, min_lat, max_lon, max_lat, z, eps_m, min_samples, jf_min, include_geocode,
        )
        # Use cache to avoid repeated heavy work within short window
        cache_key = (
            f"live_chokepoints:{min_lon:.5f},{min_lat:.5f},{max_lon:.5f},{max_lat:.5f}:"
            f"z={z}:eps={eps_m}:minS={min_samples}:jfmin={jf_min}:ir={incident_radius_m}:geo={include_geocode}"
        )
        cached = await self._aget_cache(cache_key)
        if cached:
            self.logger.info("cache hit for live_chokepoints")
            return cached

        # Step 1: compute tiles covering bbox
        # Enforce a reasonable minimum zoom for traffic flow detail
        if z < 12:
            z = 12
        tiles = self._tiles_for_bbox(min_lon, min_lat, max_lon, max_lat, z)
        self.logger.info("tiles: zoom=%s count=%s", z, len(tiles))
        # Cap tiles to keep performance bounded - reduced for faster processing
        MAX_TILES = 16
        if len(tiles) > MAX_TILES:
            # Reduce zoom if tile count is excessive
            z_reduced = max(0, z - 1)
            tiles = self._tiles_for_bbox(min_lon, min_lat, max_lon, max_lat, z_reduced)
            z = z_reduced
            self.logger.info("tiles capped: new zoom=%s count=%s", z, len(tiles))

        # Step 2: fetch+decode vector tiles (try multiple styles)
        features, used_style = await self._fetch_decode_tiles_multi(tiles, z)
        self.logger.info("decoded features: %s (style=%s)", len(features), used_style)
        # quick diagnostics on available props
        if features:
            sample_props = features[0].get("properties", {})
            keys = list(sample_props.keys())[:10]
            self.logger.info("sample props keys: %s", keys)
        self.logger.info("decoded features: %s", len(features))

        # Step 3: build severity samples from jamFactor
        samples = self._build_samples_from_features(features, jf_min=jf_min)
        # If no samples and jf_min is high, relax threshold and retry once
        if not samples and jf_min > 2.0:
            self.logger.info("no samples at jf_min=%.2f, retrying with jf_min=2.0", jf_min)
            samples = self._build_samples_from_features(features, jf_min=2.0)
        # If still none, relax further to 0.5
        if not samples:
            self.logger.info("no samples after relax, retrying with jf_min=0.5")
            samples = self._build_samples_from_features(features, jf_min=0.5)
        # If still no samples, try higher zoom levels for more detailed segments
        if not samples and z < 14:
            for z_alt in [13, 14]:
                if z_alt <= z:
                    continue
                alt_tiles = self._tiles_for_bbox(min_lon, min_lat, max_lon, max_lat, z_alt)
                if len(alt_tiles) > 32:
                    continue
                alt_features, alt_style = await self._fetch_decode_tiles_multi(alt_tiles, z_alt)
                samples = self._build_samples_from_features(alt_features, jf_min=max(2.0, jf_min))
                self.logger.info("alt zoom %s: tiles=%s features=%s samples=%s", z_alt, len(alt_tiles), len(alt_features), len(samples))
                if samples:
                    break
        # Final fallback: probe Flow Segment Data API across a grid
        if not samples:
            self.logger.info("no samples after tiles; probing flowSegmentData grid fallback")
            grid_samples = await self._collect_flow_segment_samples(bbox=[min_lon, min_lat, max_lon, max_lat], max_points=80)
            self.logger.info("flowSegmentData samples: %s", len(grid_samples))
            samples = grid_samples
        self.logger.info("samples total: %s", len(samples))

        # Step 4: fetch incidents and boost nearby samples
        incidents = await self._fetch_incidents(bbox)
        self.logger.info("incidents: %s", len(incidents) if isinstance(incidents, list) else 0)
        if incidents:
            self._boost_samples_with_incidents(samples, incidents, incident_radius_m)
            self.logger.info("samples after incident boost: %s", len(samples))

        # Step 5: run DBSCAN clustering (haversine)
        clusters = self._cluster_samples(samples, eps_m=eps_m, min_samples=min_samples)
        self.logger.info("clusters formed: %s (eps_m=%s min_samples=%s)", len(clusters), eps_m, min_samples)

        # Step 6: aggregate/score clusters
        result = await self._aggregate_and_score(
            clusters,
            include_geocode=include_geocode,
            incidents=incidents,
            incident_count_radius_m=max(incident_radius_m, 150),
        )

        # Step 7: cache final (TTL ~60s)
        await self._aset_cache(cache_key, result, 60)
        self.logger.info("live_chokepoints done: clusters=%s", len(result.get("clusters", [])))
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
                # Ensure cached value is enriched with tile indices
                if isinstance(cached, dict) and "layers" in cached:
                    self.logger.debug("tile cache hit z=%s x=%s y=%s", z, x, y)
                    return cached
                # Legacy shape (layers only) is not usable for lon/lat conversion; refetch
            url = f"https://api.tomtom.com/traffic/map/4/tile/flow/relative/{z}/{x}/{y}.pbf"
            params = {"key": api_key}
            async with sem:
                try:
                    async with httpx.AsyncClient(timeout=8.0) as client:
                        resp = await client.get(url, params=params)
                        if resp.status_code != 200:
                            self.logger.debug("tile fetch failed z=%s x=%s y=%s status=%s", z, x, y, resp.status_code)
                            return None
                        layers = mvt_decode(resp.content)
                        enriched = {"x": x, "y": y, "z": z, "layers": layers}
                        # cache enriched object for short time
                        self.cache.set(cache_key, enriched, 60)
                        return enriched
                except Exception:
                    self.logger.exception("tile fetch error z=%s x=%s y=%s", z, x, y)
                    return None

        tasks = [fetch_tile(x, y) for (x, y) in tiles]
        decoded_tiles = [d for d in await asyncio.gather(*tasks) if d]
        self.logger.info("decoded tiles: %s/%s", len(decoded_tiles), len(tiles))

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

    async def _fetch_decode_tiles_multi(self, tiles: List[Tuple[int, int]], z: int) -> Tuple[List[Dict[str, Any]], str]:
        """Try multiple flow styles to maximize available properties/jam factor."""
        styles = ["relative", "absolute", "relative-delay", "relative-categorized"]
        for style in styles:
            feats = await self._fetch_decode_tiles_with_style(tiles, z, style)
            if feats:
                return feats, style
        return [], styles[-1]

    async def _fetch_decode_tiles_with_style(self, tiles: List[Tuple[int, int]], z: int, style: str) -> List[Dict[str, Any]]:
        settings = self.settings
        api_key = settings.clean_tomtom_traffic_api_key or settings.clean_tomtom_maps_api_key
        if not api_key:
            return []
        sem = asyncio.Semaphore(8)

        async def fetch_tile(x: int, y: int) -> Optional[Dict[str, Any]]:
            cache_key = f"mvt:{style}:{z}:{x}:{y}"
            cached = self.cache.get(cache_key)
            if cached and isinstance(cached, dict) and "layers" in cached:
                return cached
            url = f"https://api.tomtom.com/traffic/map/4/tile/flow/{style}/{z}/{x}/{y}.pbf"
            params = {"key": api_key}
            async with sem:
                try:
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        print(" ")
                        print(" url: ", url)
                        print(" ")
                        resp = await client.get(url, params=params)
                        if resp.status_code != 200:
                            return None
                        layers = mvt_decode(resp.content)
                        enriched = {"x": x, "y": y, "z": z, "layers": layers}
                        self.cache.set(cache_key, enriched, 60)
                        return enriched
                except Exception:
                    return None

        decoded_tiles = [d for d in await asyncio.gather(*[fetch_tile(x, y) for (x, y) in tiles]) if d]
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

    async def _collect_flow_segment_samples(self, bbox: List[float], max_points: int = 80) -> List[SamplePoint]:
        """Fallback: sample TomTom Flow Segment Data across a bbox grid to obtain speeds."""
        min_lon, min_lat, max_lon, max_lat = bbox
        # Build a simple grid limited by max_points
        cols = max(4, int(math.sqrt(max_points)))
        rows = cols
        step_lon = (max_lon - min_lon) / (cols - 1) if cols > 1 else (max_lon - min_lon)
        step_lat = (max_lat - min_lat) / (rows - 1) if rows > 1 else (max_lat - min_lat)
        settings = self.settings
        api_key = settings.clean_tomtom_traffic_api_key or settings.clean_tomtom_maps_api_key
        if not api_key:
            return []
        sem = asyncio.Semaphore(8)

        async def probe(lat: float, lon: float) -> Optional[SamplePoint]:
            # absolute style, resolution 10 (default), units KMPH
            url = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"
            params = {"key": api_key, "point": f"{lat},{lon}", "unit": "KMPH"}
            async with sem:
                try:
                    async with httpx.AsyncClient(timeout=6.0) as client:
                        resp = await client.get(url, params=params)
                        if resp.status_code != 200:
                            return None
                        data = resp.json()
                        fsd = data.get("flowSegmentData") or {}
                        cur = fsd.get("currentSpeed")
                        free = fsd.get("freeFlowSpeed")
                        conf = fsd.get("confidence", 0.8)
                        if isinstance(cur, (int, float)) and isinstance(free, (int, float)) and free > 0:
                            ratio = max(0.0, min(1.0, float(cur) / float(free)))
                            severity = 1.0 - ratio
                            if severity <= 0:
                                return None
                            weight = severity * float(conf)
                            return SamplePoint(lat=lat, lon=lon, severity=severity, weight=weight)
                        return None
                except Exception:
                    return None

        tasks = []
        for i in range(rows):
            lat = min_lat + step_lat * i
            for j in range(cols):
                lon = min_lon + step_lon * j
                tasks.append(probe(lat, lon))
        results = await asyncio.gather(*tasks)
        return [s for s in results if s]

    def _build_samples_from_features(self, features: List[Dict[str, Any]], jf_min: float) -> List[SamplePoint]:
        samples: List[SamplePoint] = []
        for feat in features:
            props = feat["properties"]
            jam: Optional[float] = None
            # Try common keys for jam factor
            for k, v in props.items():
                kl = str(k).lower()
                if not isinstance(v, (int, float)):
                    continue
                if "jam" in kl or kl == "jf" or kl == "jam_factor":
                    jam = float(v)
                    break
            # If still none, try numeric traffic_level as jam-like
            if jam is None and "traffic_level" in props:
                lvl = props.get("traffic_level")
                if isinstance(lvl, (int, float)):
                    # normalize 0..5 or 0..10 to 0..10
                    if 0 <= lvl <= 1:
                        jam = float(lvl) * 10.0
                    elif 0 <= lvl <= 5:
                        jam = float(lvl) * 2.0
                    else:
                        jam = float(lvl)
                elif isinstance(lvl, str):
                    lvls = lvl.strip().lower()
                    mapping = {
                        "free": 0.0,
                        "low": 2.0,
                        "light": 2.0,
                        "moderate": 5.0,
                        "medium": 5.0,
                        "high": 8.0,
                        "heavy": 8.0,
                        "severe": 9.0,
                        "critical": 10.0,
                    }
                    jam = mapping.get(lvls)
            # Fallback: derive jam from speeds if present
            if jam is None:
                cur = None
                free = None
                for k, v in props.items():
                    kl = str(k).lower()
                    if kl in ("current_speed", "currentspeed", "cs") and isinstance(v, (int, float)):
                        cur = float(v)
                    if kl in ("freeflowspeed", "free_flow_speed", "ffs") and isinstance(v, (int, float)):
                        free = float(v)
                if cur is not None and free and free > 0:
                    # map to 0..10 roughly
                    ratio = max(0.0, min(1.0, cur / free))
                    jam = (1.0 - ratio) * 10.0
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
                if isinstance(coords[0][0], (list, tuple)):
                    # MultiLineString-like [[x,y], ...]
                    line = coords[0]
                else:
                    line = coords
                mid_idx = len(line) // 2
                tx, ty = float(line[mid_idx][0]), float(line[mid_idx][1])
            except Exception:
                continue

            lon, lat = tile_point_to_lonlat(x, y, z, tx, ty, extent)
            severity = max(0.0, min(1.0, jam / 10.0))
            weight = severity
            samples.append(SamplePoint(lat=lat, lon=lon, severity=severity, weight=weight))

        return samples

    def _calculate_bbox_area_km2(self, bbox: List[float]) -> float:
        """Calculate bbox area in km²"""
        min_lon, min_lat, max_lon, max_lat = bbox
        
        # Convert to meters using haversine for accuracy
        lat_dist = haversine_m(min_lat, min_lon, max_lat, min_lon) / 1000
        lon_dist = haversine_m(min_lat, min_lon, min_lat, max_lon) / 1000
        
        return lat_dist * lon_dist

    def _split_large_bbox(self, bbox: List[float], max_area_km2: float = 8000) -> List[List[float]]:
        """Split bbox if larger than max_area_km2"""
        area = self._calculate_bbox_area_km2(bbox)
        if area <= max_area_km2:
            return [bbox]
        
        min_lon, min_lat, max_lon, max_lat = bbox
        
        # Determine split strategy
        lat_span = max_lat - min_lat
        lon_span = max_lon - min_lon
        
        # Split along the longer dimension first
        if lon_span >= lat_span:
            # Split vertically (E-W)
            mid_lon = (min_lon + max_lon) / 2
            bbox1 = [min_lon, min_lat, mid_lon, max_lat]
            bbox2 = [mid_lon, min_lat, max_lon, max_lat]
        else:
            # Split horizontally (N-S)
            mid_lat = (min_lat + max_lat) / 2
            bbox1 = [min_lon, min_lat, max_lon, mid_lat]
            bbox2 = [min_lon, mid_lat, max_lon, max_lat]
        
        # Recursively split if still too large
        result = []
        for sub_bbox in [bbox1, bbox2]:
            result.extend(self._split_large_bbox(sub_bbox, max_area_km2))
        
        return result

    def _get_bangalore_road_weight(self, road_name: Optional[str]) -> float:
        """Boost weight for major Bangalore corridors"""
        if not road_name:
            return 1.0
        
        road_lower = road_name.lower()
        major_roads = {
            'outer ring road': 1.8,
            'orr': 1.8,
            'hosur': 1.6,
            'airport': 1.6,
            'bannerghatta': 1.4,
            'kanakapura': 1.4,
            'mysore': 1.4,
            'whitefield': 1.5,
            'sarjapur': 1.5,
        }
        
        for keyword, weight in major_roads.items():
            if keyword in road_lower:
                return weight
        return 1.0

    async def _fetch_incidents_single(self, bbox: List[float]) -> List[Dict[str, Any]]:
        """Original single-bbox incident fetching logic"""
        min_lon, min_lat, max_lon, max_lat = bbox
        bbox_str = f"{min_lon},{min_lat},{max_lon},{max_lat}"
        
        settings = self.settings
        api_key = settings.clean_tomtom_traffic_api_key or settings.clean_tomtom_maps_api_key
        if not api_key:
            return []
        
        params = {
            "key": api_key,
            "bbox": bbox_str,
            "language": "en-GB",
            "timeValidityFilter": "present",
            "fields": "{incidents{type,severity,geometry{type,coordinates},properties{id,roadClosed,magnitudeOfDelay}}}",
        }
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get("https://api.tomtom.com/traffic/services/5/incidentDetails", params=params)
                if resp.status_code != 200:
                    self.logger.warning(f"Incident API failed for bbox {bbox_str}: {resp.status_code}")
                    return []
                data = resp.json()
        except Exception as e:
            self.logger.warning(f"Incident fetch exception for bbox {bbox_str}: {e}")
            return []
        
        incidents = data.get("incidents")
        if isinstance(incidents, dict):
            incidents = incidents.get("incidents")
        return incidents or []

    async def _fetch_incidents(self, bbox: List[float]) -> List[Dict[str, Any]]:
        """Enhanced to handle large bboxes by splitting"""
        # Check bbox area and split if needed
        area_km2 = self._calculate_bbox_area_km2(bbox)
        
        # Split bbox if too large
        sub_bboxes = self._split_large_bbox(bbox, max_area_km2=8000)
        
        if len(sub_bboxes) == 1:
            # Single bbox - use existing logic
            return await self._fetch_incidents_single(bbox)
        
        # Multiple bboxes - fetch and merge
        self.logger.info(f"Large bbox ({area_km2:.1f}km²) split into {len(sub_bboxes)} sub-regions")
        all_incidents = []
        
        # Fetch incidents from all sub-bboxes concurrently
        tasks = [self._fetch_incidents_single(sub_bbox) for sub_bbox in sub_bboxes]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for result in results:
            if isinstance(result, list):
                all_incidents.extend(result)
            elif isinstance(result, Exception):
                self.logger.warning(f"Sub-bbox incident fetch failed: {result}")
        
        # Deduplicate incidents by ID
        seen_ids = set()
        unique_incidents = []
        for incident in all_incidents:
            incident_id = None
            if isinstance(incident, dict):
                props = incident.get("properties", {})
                if isinstance(props, dict):
                    incident_id = props.get("id")
            
            if incident_id and incident_id not in seen_ids:
                seen_ids.add(incident_id)
                unique_incidents.append(incident)
            elif not incident_id:
                # No ID - include anyway (shouldn't happen but be safe)
                unique_incidents.append(incident)
        
        self.logger.info(f"Merged {len(all_incidents)} -> {len(unique_incidents)} unique incidents")
        return unique_incidents

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
        db = DBSCAN(eps=eps, min_samples=min_samples, metric="haversine")
        db.fit(coords, sample_weight=weights)
        labels = db.labels_
        clusters: Dict[int, List[SamplePoint]] = {}
        for lbl, s in zip(labels, samples):
            if lbl == -1:
                continue
            clusters.setdefault(int(lbl), []).append(s)
        return list(clusters.values())

    async def _aggregate_and_score(
        self,
        clusters: List[List[SamplePoint]],
        include_geocode: bool,
        incidents: List[Dict[str, Any]],
        incident_count_radius_m: int,
    ) -> Dict[str, Any]:
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

            # incident/closure around cluster center
            incident_count = 0
            closure = False
            if incidents:
                for lon_i, lat_i, is_closed in iter_incident_points_with_flags(incidents):
                    if haversine_m(lat, lon, lat_i, lon_i) <= incident_count_radius_m:
                        incident_count += 1
                        if is_closed:
                            closure = True

            bonus = 0.0
            if closure:
                bonus = max(bonus, 0.1)
            if incident_count > 0:
                bonus = max(bonus, 0.1)

            score = 100.0 * (0.6 * sev_mean + 0.3 * p90 + 0.1 * bonus)

            # Optional reverse geocode
            road_name: Optional[str] = None
            if include_geocode:
                try:
                    road_name = await self._reverse_geocode(lat, lon)
                except Exception:
                    road_name = None

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
                "road_name": road_name,
            })

        results.sort(key=lambda r: r["score"], reverse=True)
        return {"clusters": results}

    async def _reverse_geocode(self, lat: float, lon: float) -> Optional[str]:
        # cache by 5-decimal precision
        key = f"revgeo:{lat:.5f},{lon:.5f}"
        cached = self.cache.get(key)
        if cached:
            return cached  # type: ignore
        api_key = self.settings.clean_tomtom_search_api_key or self.settings.clean_tomtom_maps_api_key
        if not api_key:
            return None
        url = f"https://api.tomtom.com/search/2/reverseGeocode/{lat},{lon}.json"
        params = {"key": api_key, "radius": 50}
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                resp = await client.get(url, params=params)
                if resp.status_code != 200:
                    return None
                data = resp.json()
                addresses = data.get("addresses") or []
                if not addresses:
                    return None
                addr = addresses[0].get("address", {})
                name = addr.get("streetName") or addr.get("freeformAddress")
                if name:
                    self.cache.set(key, name, 300)
                return name
        except Exception:
            return None


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


def iter_incident_points_with_flags(incidents: List[Dict[str, Any]]):
    for inc in incidents:
        geom = inc.get("geometry", {}) if isinstance(inc, dict) else None
        props = inc.get("properties", {}) if isinstance(inc, dict) else {}
        is_closed = bool(props.get("roadClosed"))
        if not isinstance(geom, dict):
            continue
        coords = geom.get("coordinates")
        if not coords:
            continue
        if isinstance(coords[0], (int, float)) and len(coords) >= 2:
            lon_i, lat_i = float(coords[0]), float(coords[1])
            yield lon_i, lat_i, is_closed
        elif isinstance(coords[0], (list, tuple)):
            try:
                lon_i, lat_i = float(coords[0][0]), float(coords[0][1])
                yield lon_i, lat_i, is_closed
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

