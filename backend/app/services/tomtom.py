from typing import Any, Dict

import httpx


class TomTomService:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.tomtom.com"

    async def get(self, path: str, params: Dict[str, Any]) -> Dict[str, Any]:
        async with httpx.AsyncClient(base_url=self.base_url, timeout=10.0) as client:
            response = await client.get(path, params={"key": self.api_key, **params})
            response.raise_for_status()
            return response.json()

