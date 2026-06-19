import os
import asyncio
import time
from datetime import datetime
from collections import Counter
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import httpx
from dotenv import load_dotenv
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

load_dotenv()
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- 读取 5 个 API 密钥 ----------
DEEPSEEK_KEY = os.getenv("DEEPSEEK_API_KEY")
KIMI_KEY = os.getenv("KIMI_API_KEY")
MINIMAX_KEY = os.getenv("MINIMAX_API_KEY")
ZHIPU_KEY = os.getenv("ZHIPU_API_KEY")
ALIBABA_KEY = os.getenv("ALIBABA_API_KEY")

CACHE = {"predictions": None, "last_update": None, "is_updating": False}

async def fetch_matches():
    return [
        {"id": 1, "home": "巴西", "away": "阿根廷"},
        {"id": 2, "home": "德国", "away": "法国"},
        {"id": 3, "home": "英格兰", "away": "葡萄牙"},
        {"id": 4, "home": "荷兰", "away": "西班牙"},
    ]

async def call_deepseek(prompt: str) -> str:
    if not DEEPSEEK_KEY: return "Error: 未配置 DeepSeek API Key"
    url = "https://api.deepseek.com/v1/chat/completions"
    headers = {"Authorization": f"Bearer {DEEPSEEK_KEY}", "Content-Type": "application/json"}
    data = {"model": "deepseek-chat", "messages": [{"role": "user", "content": prompt}], "temperature": 0.3, "max_tokens": 20}
    try:
        async with httpx.AsyncClient() as client:
            resp = await asyncio.wait_for(client.post(url, json=data, headers=headers), timeout=8.0)
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        return f"Error: {str(e)}"

async def call_kimi(prompt: str) -> str:
    if not KIMI_KEY: return "Error: 未配置 Kimi API Key"
    url = "https://api.moonshot.cn/v1/chat/completions"
    headers = {"Authorization": f"Bearer {KIMI_KEY}", "Content-Type": "application/json"}
    data = {"model": "moonshot-v1-8k", "messages": [{"role": "user", "content": prompt}], "temperature": 0.3, "max_tokens": 20}
    try:
        async with httpx.AsyncClient() as client:
            resp = await asyncio.wait_for(client.post(url, json=data, headers=headers), timeout=8.0)
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        return f"Error: {str(e)}"

async def call_minimax(prompt: str) -> str:
    if not MINIMAX_KEY: return "Error: 未配置 MiniMax API Key"
    url = "https://api.minimax.chat/v1/text/chatcompletion_v2"
    headers = {"Authorization": f"Bearer {MINIMAX_KEY}", "Content-Type": "application/json"}
    data = {"model": "abab6.5s-chat", "messages": [{"role": "user", "content": prompt}], "temperature": 0.3, "max_tokens": 20}
    try:
        async with httpx.AsyncClient() as client:
            resp = await asyncio.wait_for(client.post(url, json=data, headers=headers), timeout=8.0)
            resp.raise_for_status()
            return resp.json().get("reply", "Error: 未获取到回复")
    except Exception as e:
        return f"Error: {str(e)}"

async def call_zhipu(prompt: str) -> str:
    if not ZHIPU_KEY: return "Error: 未配置 智谱 API Key"
    url = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
    headers = {"Authorization": f"Bearer {ZHIPU_KEY}", "Content-Type": "application/json"}
    data = {"model": "glm-4-flash", "messages": [{"role": "user", "content": prompt}], "temperature": 0.3, "max_tokens": 20}
    try:
        async with httpx.AsyncClient() as client:
            resp = await asyncio.wait_for(client.post(url, json=data, headers=headers), timeout=8.0)
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        return f"Error: {str(e)}"

async def call_alibaba(prompt: str) -> str:
    if not ALIBABA_KEY: return "Error: 未配置 阿里百炼 API Key"
    url = "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation"
    headers = {"Authorization": f"Bearer {ALIBABA_KEY}", "Content-Type": "application/json"}
    data = {"model": "qwen-turbo", "input": {"messages": [{"role": "user", "content": prompt}]}, "parameters": {"result_format": "message", "temperature": 0.3, "max_tokens": 20}}
    try:
        async with httpx.AsyncClient() as client:
            resp = await asyncio.wait_for(client.post(url, json=data, headers=headers), timeout=8.0)
            resp.raise_for_status()
            return resp.json()["output"]["choices"][0]["message"]["content"].strip()
    except Exception as e:
        return f"Error: {str(e)}"

async def fetch_predictions_async():
    matches = await fetch_matches()
    if not matches: return None
    results_by_match = {idx: {} for idx in range(len(matches))}
    for idx, match in enumerate(matches):
        prompt = f"预测足球比赛最终比分，只回复比分（格式如 2-1），不要其他文字：{match['home']} vs {match['away']}"
        print(f"-> [比赛 {idx+1}] 同时请求 5 个 AI...")
        tasks = {"DeepSeek": call_deepseek(prompt), "Kimi": call_kimi(prompt), "MiniMax": call_minimax(prompt), "智谱": call_zhipu(prompt), "阿里百炼": call_alibaba(prompt)}
        batch_results = await asyncio.gather(*tasks.values(), return_exceptions=True)
        model_names = list(tasks.keys())
        for j, model_name in enumerate(model_names):
            result = batch_results[j]
            results_by_match[idx][model_name] = str(result) if not isinstance(result, Exception) else f"Error: {str(result)}"
    predictions, all_scores = [], []
    for idx, match in enumerate(matches):
        results = results_by_match[idx]
        valid_scores = [s for s in results.values() if not s.startswith("Error:")]
        consensus = Counter(valid_scores).most_common(1)[0][0] if valid_scores else "暂无有效预测"
        predictions.append({"match": f"{match['home']} vs {match['away']}", "predictions": results, "consensus": consensus})
        all_scores.append(consensus)
    return {"matches": predictions, "global_consensus": Counter(all_scores).most_common(1)[0][0] if all_scores else "暂无", "last_update": datetime.now().isoformat()}

async def update_cache_async():
    if CACHE["is_updating"]: return
    CACHE["is_updating"] = True
    try:
        result = await fetch_predictions_async()
        if result: CACHE["predictions"], CACHE["last_update"] = result, datetime.now().isoformat()
    except Exception as e: print(f"更新出错: {e}")
    finally: CACHE["is_updating"] = False

def run_update_wrapper():
    try: loop = asyncio.get_running_loop(); loop.create_task(update_cache_async())
    except RuntimeError: asyncio.run(update_cache_async())

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(update_cache_async())
    scheduler = BackgroundScheduler()
    scheduler.add_job(run_update_wrapper, 'interval', minutes=5)
    scheduler.start()

@app.get("/predict")
async def get_predictions():
    if CACHE["predictions"] is None: return {"status": "loading", "message": "正在获取预测数据，请稍候..."}
    return {"status": "ready", "data": CACHE["predictions"], "last_update": CACHE["last_update"]}

@app.get("/")
async def root(): return {"message": "AI 足球预测 API 运行中"}
