import asyncio
from dotenv import load_dotenv
load_dotenv('D:/aria/backend/.env')
import sys
sys.path.insert(0, 'D:/aria/backend')
from utils.supabase_client import get_supabase_headers, settings
import httpx

async def check():
    headers = get_supabase_headers()
    url = f"{settings.supabase_url}/rest/v1/okf_docs"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers, params={"select": "id,file_path,topic,source,content,created_at,embedding"})
        print("Status:", resp.status_code)
        docs = resp.json()
        print(f"Total docs in okf_docs: {len(docs)}")
        from utils.supabase_client import get_embed_model
        import numpy as np
        model = get_embed_model()
        q = "What are the off-target mitigation strategies for CRISPR gene editing?"
        qv = list(model.embed([q]))[0]
        qn = np.linalg.norm(qv)

        import json
        for d in docs:
            raw_emb = d.get('embedding')
            if isinstance(raw_emb, str):
                emb_list = json.loads(raw_emb)
            else:
                emb_list = raw_emb
            emb = np.array(emb_list, dtype=float)
            en = np.linalg.norm(emb)
            sim = np.dot(qv, emb) / (qn * en)
            print(f"- ID: {d.get('id')[:8]} | path: {d.get('file_path')} | sim: {sim:.4f} | len: {len(d.get('content', ''))}")

if __name__ == '__main__':
    asyncio.run(check())
