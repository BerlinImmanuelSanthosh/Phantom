import os
from dotenv import load_dotenv

# Load environment variables from backend/.env and root .env
backend_dir = os.path.dirname(__file__)
load_dotenv(os.path.join(backend_dir, ".env"))
load_dotenv(os.path.join(os.path.dirname(backend_dir), ".env"))

# Centralized Model Configurations (Edit in backend/.env)
GROQ_MODEL_DASHBOARD = os.getenv("GROQ_MODEL_DASHBOARD", "openai/gpt-oss-20b")
GROQ_MODEL_CHAT = os.getenv("GROQ_MODEL_CHAT", "openai/gpt-oss-20b")
GROQ_MODEL_FOODMAKER = os.getenv("GROQ_MODEL_FOODMAKER", "openai/gpt-oss-20b")
GROQ_MODEL_TABLETS = os.getenv("GROQ_MODEL_TABLETS", "qwen/qwen3.8-27b")

# Centralized Groq API Keys
GROQ_API_KEY_DASHBOARD = os.getenv("GROQ_API_KEY_DASHBOARD") or os.getenv("GROQ_API_KEY")
GROQ_API_KEY_CHAT = os.getenv("GROQ_API_KEY_CHAT") or os.getenv("GROQ_API_KEY")
GROQ_API_KEY_FOODMAKER = os.getenv("GROQ_API_KEY_FOODMAKER") or os.getenv("GROQ_API_KEY")
GROQ_API_KEY_TABLETS = os.getenv("GROQ_API_KEY_TABLETS") or os.getenv("GROQ_API_KEY")
