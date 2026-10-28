import os
import sys
import json
import logging
import httpx
from dotenv import load_dotenv

# Add parent directory to sys.path so config/pipeline imports work
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

load_dotenv(dotenv_path=os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env")))

from config import settings
from pipeline.okf_parser import parse_okf_file
from fastembed import TextEmbedding

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("ingest_okf")

def ingest_all_okf_docs(data_dir: str):
    logger.info(f"Scanning OKF directory: {data_dir}")
    if not os.path.exists(data_dir):
        logger.error(f"Directory {data_dir} does not exist.")
        return

    # Initialize FastEmbed 384-dim model (matching schema VECTOR(384))
    cache_dir = os.environ.get("FASTEMBED_CACHE_PATH") or getattr(settings, "fastembed_cache_path", None) or os.path.expanduser("~/.cache/fastembed")
    logger.info(f"Initializing FastEmbed (BAAI/bge-small-en-v1.5, 384-dim, cache_dir={cache_dir})...")
    embed_model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5", cache_dir=cache_dir)

    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation"
    }
    url = f"{settings.supabase_url}/rest/v1/okf_docs"

    files_found = []
    for root, _, files in os.walk(data_dir):
        for f in files:
            if f.endswith(".md") or f.endswith(".okf"):
                files_found.append(os.path.join(root, f))

    logger.info(f"Found {len(files_found)} OKF document(s) to process.")

    counts = {"updated": 0, "inserted": 0, "skipped": 0, "failed": 0}

    for full_path in files_found:
        try:
            parsed = parse_okf_file(full_path)
            meta = parsed["metadata"]
            content = parsed["content"]

            rel_path = os.path.relpath(full_path, os.path.join(data_dir, "..")).replace("\\", "/")

            # Prepare text for embedding (Title + Topic + Content)
            text_to_embed = f"{meta.get('title', '')}\nTopics: {', '.join(meta.get('topic', []))}\n\n{content}"
            embedding_vector = list(embed_model.embed([text_to_embed]))[0]
            vector_list = embedding_vector.tolist() if hasattr(embedding_vector, "tolist") else list(embedding_vector)

            # Build record with honest metadata
            doc_record = {
                "file_path": rel_path,
                "type": meta.get("type", "note"),
                "topic": meta.get("topic", ["General"])[0] if meta.get("topic") else "General",
                "source": meta.get("source") or f"OKF Document: {meta.get('title')}",
                "related_links": meta.get("related", []),
                "content": content,
                "embedding": vector_list,
                "user_id": None  # Shared RAG corpus
            }

            # Upsert by file_path: Check if document with this file_path already exists
            check_url = f"{url}?file_path=eq.{rel_path}&select=id"
            check_resp = httpx.get(check_url, headers=headers, timeout=10.0)
            existing_rows = check_resp.json() if check_resp.status_code == 200 else []

            if existing_rows and len(existing_rows) > 0:
                doc_id = existing_rows[0]["id"]
                patch_url = f"{url}?id=eq.{doc_id}"
                resp = httpx.patch(patch_url, headers=headers, json=doc_record, timeout=10.0)
                action = "Updated existing"
                is_update = True
            else:
                resp = httpx.post(url, headers=headers, json=doc_record, timeout=10.0)
                action = "Inserted new"
                is_update = False

            if resp.status_code in (200, 201, 204):
                if is_update:
                    counts["updated"] += 1
                else:
                    counts["inserted"] += 1
                logger.info(f"{action}: '{rel_path}' | Title: '{meta.get('title')}' | Source: '{doc_record['source']}'")
            else:
                counts["failed"] += 1
                logger.error(f"Failed to {action.lower()} '{rel_path}': HTTP {resp.status_code} - {resp.text}")

        except Exception as e:
            counts["failed"] += 1
            logger.error(f"Error processing file '{full_path}': {e}")

    logger.info("=" * 60)
    logger.info(f"RE-EMBEDDING SUMMARY: {counts['updated']} rows updated, {counts['inserted']} inserted, {counts['skipped']} skipped, {counts['failed']} failed")
    logger.info("=" * 60)
    return counts

if __name__ == "__main__":
    base_data_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data", "okf"))
    ingest_all_okf_docs(base_data_dir)
