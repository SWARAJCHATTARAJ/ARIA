import json
import httpx
import os
import asyncio
from typing import AsyncGenerator
from aria.rag import VectorMemory
from aria.core import Settings
from pydantic import BaseModel

class ChatMessage(BaseModel):
    role: str
    content: str

async def stream_chat_response(
    messages: list[ChatMessage], 
    memory: VectorMemory, 
    settings: Settings,
    openrouter_key: str | None = None
) -> AsyncGenerator[str, None]:
    
    # 1. Grab context for the latest message
    latest_msg = messages[-1].content if messages else ""
    evidence = memory.retrieve(latest_msg, n_results=5) if latest_msg else []
    
    context_str = "\n\n".join([f"[{i+1}] {e.text}" for i, e in enumerate(evidence)])
    
    # 2. Build the system prompt
    system_prompt = (
        "You are an AI research assistant for the ARIA Research Console.\n"
        "You have access to the user's uploaded documents and research memory.\n"
        "Use the following context to answer their question. If the answer is not in the context, "
        "rely on your general knowledge but mention that it's not from their documents.\n\n"
        f"CONTEXT:\n{context_str}"
    )
    
    formatted_messages = [{"role": "system", "content": system_prompt}]
    for msg in messages:
        formatted_messages.append({"role": msg.role, "content": msg.content})

    # 3. Call OpenRouter / LLM
    api_key = openrouter_key or os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        yield "Error: No OpenRouter API Key configured."
        return

    headers = {
        "Authorization": f"Bearer {api_key}",
        "HTTP-Referer": "https://aria.swarajchattaraj.tech",
        "X-Title": "ARIA Console",
        "Content-Type": "application/json"
    }
    
    data = {
        "model": settings.model or "openrouter/free",
        "messages": formatted_messages,
        "stream": True
    }

    async with httpx.AsyncClient() as client:
        try:
            async with client.stream(
                "POST", 
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=data,
                timeout=60.0
            ) as response:
                if response.status_code == 429:
                    # FALLBACK TO OPENAI
                    openai_key = os.getenv("OPENAI_API_KEY")
                    if not openai_key:
                        yield "\n\n[System] OpenRouter rate limit hit, and no OPENAI_API_KEY is configured for fallback."
                        return
                        
                    yield "\n\n[System] OpenRouter rate limit hit. Falling back to OpenAI...\n\n"
                    
                    openai_headers = {
                        "Authorization": f"Bearer {openai_key}",
                        "Content-Type": "application/json"
                    }
                    openai_data = {
                        "model": "gpt-4o-mini", # Fallback model
                        "messages": formatted_messages,
                        "stream": True
                    }
                    
                    async with client.stream(
                        "POST",
                        "https://api.openai.com/v1/chat/completions",
                        headers=openai_headers,
                        json=openai_data,
                        timeout=60.0
                    ) as openai_response:
                        if openai_response.status_code != 200:
                            yield f"\n\nError: OpenAI Fallback API returned status {openai_response.status_code}"
                            return
                        
                        async for chunk in openai_response.aiter_lines():
                            if chunk.startswith("data: "):
                                data_str = chunk[6:]
                                if data_str.strip() == "[DONE]":
                                    break
                                try:
                                    json_chunk = json.loads(data_str)
                                    delta = json_chunk["choices"][0]["delta"].get("content", "")
                                    if delta:
                                        yield delta
                                except Exception:
                                    continue
                    return

                elif response.status_code != 200:
                    yield f"Error: LLM API returned status {response.status_code}"
                    return
                
                async for chunk in response.aiter_lines():
                    if chunk.startswith("data: "):
                        data_str = chunk[6:]
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            json_chunk = json.loads(data_str)
                            delta = json_chunk["choices"][0]["delta"].get("content", "")
                            if delta:
                                yield delta
                        except Exception:
                            continue
        except Exception as e:
            yield f"\n\nError streaming response: {str(e)}"
