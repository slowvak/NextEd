# Copyright Bradley J Erickson, 2026.
import httpx
import asyncio

async def test():
    async with httpx.AsyncClient() as client:
        with open("dummy.safetensors", "wb") as f: f.write(b"dummy")
        with open("dummy.json", "wb") as f: f.write(b"{}")
        
        files = [
            ('file', ('dummy.safetensors', open("dummy.safetensors", "rb"), 'application/octet-stream')),
            ('config', ('dummy.json', open("dummy.json", "rb"), 'application/json'))
        ]
        try:
            resp = await client.post("http://localhost:8050/api/v1/ai/upload-model", files=files)
            print("Main server response:", resp.status_code, resp.text)
        except Exception as e:
            print("Main server error:", e)

asyncio.run(test())
