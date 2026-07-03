# ARIA Frontend

React console for the ARIA research workspace.

## Development

```bash
npm ci
npm run dev
```

The Vite dev server runs on `http://localhost:5173` and calls the FastAPI backend on `http://127.0.0.1:8000`.

## Production Build

```bash
npm run build
```

The backend serves the generated `frontend/dist` directory. The Streamlit wrapper in `app.py` embeds that backend so the app opens from `http://localhost:8501`.
