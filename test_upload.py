# Copyright Bradley J Erickson, 2026.
import httpx
import asyncio

async def test():
    async with httpx.AsyncClient() as client:
        # Create a dummy safetensors and config.json
        with open("dummy.safetensors", "wb") as f: f.write(b"dummy")
        with open("dummy.json", "wb") as f: f.write(b"{}")
        
        files = [
            ('file', ('dummy.safetensors', b"dummy", 'application/octet-stream')),
            ('config', ('dummy.json', b"{}", 'application/json'))
        ]
        resp = await client.post("http://localhost:8000/api/v1/ai/upload-model", files=files)
        print(resp.status_code)
        print(resp.text)

asyncio.run(test())
