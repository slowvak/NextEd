import httpx
import asyncio

async def test():
    async with httpx.AsyncClient() as client:
        # We will connect directly to the main server running on port 8000
        # If it's not on 8000, we'll try 8080 (inference server directly)
        
        # Test direct inference server upload
        with open("dummy.safetensors", "wb") as f: f.write(b"dummy")
        with open("dummy.json", "wb") as f: f.write(b"{}")
        
        files = [
            ('file', ('dummy.safetensors', open("dummy.safetensors", "rb"), 'application/octet-stream')),
            ('config', ('dummy.json', open("dummy.json", "rb"), 'application/json'))
        ]
        
        try:
            resp = await client.post("http://localhost:8080/models/upload", files=files)
            print("Inference server response:", resp.status_code, resp.text)
        except Exception as e:
            print("Inference server error:", e)
            
        # Test via proxy
        files = [
            ('file', ('dummy.safetensors', open("dummy.safetensors", "rb"), 'application/octet-stream')),
            ('config', ('dummy.json', open("dummy.json", "rb"), 'application/json'))
        ]
        try:
            resp = await client.post("http://localhost:8000/api/v1/ai/upload-model", files=files)
            print("Main server response:", resp.status_code, resp.text)
        except Exception as e:
            print("Main server error:", e)

asyncio.run(test())
