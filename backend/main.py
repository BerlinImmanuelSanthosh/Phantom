import os
import sys
from pathlib import Path
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Ensure both project root and backend folder are in sys.path
backend_dir = Path(__file__).resolve().parent
project_root = backend_dir.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Load environment variables
load_dotenv(os.path.join(backend_dir, ".env"))
load_dotenv(os.path.join(project_root, ".env"))

# Import mode-specific API routers cleanly
try:
    from backend.dashboard_api import router as dashboard_router
    from backend.chat_api import router as chat_router
    from backend.foodmaker_api import router as foodmaker_router
    from backend.tablets_api import router as tablets_router
    from backend.calls_api import router as calls_router
except ModuleNotFoundError:
    from dashboard_api import router as dashboard_router
    from chat_api import router as chat_router
    from foodmaker_api import router as foodmaker_router
    from tablets_api import router as tablets_router
    from calls_api import router as calls_router

app = FastAPI(
    title="Phantom AI Backend Service",
    description="Multi-mode FastAPI backend powered by 4 context-specific Groq API keys for Dashboard, Chat, Foodmaker, and Tablets.",
    version="1.0.0"
)

# Enable CORS for local dev server & frontend applications
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount mode routers
app.include_router(dashboard_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(foodmaker_router, prefix="/api")
app.include_router(tablets_router, prefix="/api")
app.include_router(calls_router, prefix="/api")

@app.get("/")
def root():
    return {
        "service": "Phantom AI Backend",
        "status": "running",
        "modes": {
            "dashboard": "/api/dashboard/status",
            "chat": "/api/chat/status",
            "foodmaker": "/api/foodmaker/status",
            "tablets": "/api/tablets/status"
        }
    }

@app.get("/health")
def health_check():
    keys_configured = {
        "dashboard": bool(os.getenv("GROQ_API_KEY_DASHBOARD") and "your_groq" not in os.getenv("GROQ_API_KEY_DASHBOARD", "")),
        "chat": bool(os.getenv("GROQ_API_KEY_CHAT") and "your_groq" not in os.getenv("GROQ_API_KEY_CHAT", "")),
        "foodmaker": bool(os.getenv("GROQ_API_KEY_FOODMAKER") and "your_groq" not in os.getenv("GROQ_API_KEY_FOODMAKER", "")),
        "tablets": bool(os.getenv("GROQ_API_KEY_TABLETS") and "your_groq" not in os.getenv("GROQ_API_KEY_TABLETS", "")),
    }
    return {
        "status": "healthy",
        "keys_configured": keys_configured
    }

if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host=host, port=port)
