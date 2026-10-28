-- Supabase Schema for ARIA v2

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Profiles table (extends auth.users)
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- API Keys table
CREATE TABLE public.api_keys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    key_hash TEXT UNIQUE NOT NULL,
    prefix TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

-- OKF Documents (Shared + Personal)
CREATE TABLE public.okf_docs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE, -- NULL means shared/public
    file_path TEXT NOT NULL,
    type TEXT NOT NULL,
    topic TEXT NOT NULL,
    source TEXT,
    related_links JSONB DEFAULT '[]'::jsonb,
    content TEXT NOT NULL,
    embedding VECTOR(384), -- assuming all-MiniLM-L6-v2 (384 dims)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, file_path)
);

-- Threads (Follow-up context)
CREATE TABLE public.threads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Collections / Workspaces
CREATE TABLE public.collections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    is_shared BOOLEAN DEFAULT FALSE,
    share_token TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Source Snapshots (For verifiable citations)
CREATE TABLE public.source_snapshots (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    url TEXT NOT NULL,
    retrieved_at TIMESTAMPTZ DEFAULT NOW(),
    content_snapshot TEXT NOT NULL,
    hash TEXT NOT NULL
);

-- Query Logs (History)
CREATE TABLE public.query_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    thread_id UUID REFERENCES public.threads(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    response TEXT,
    tiers_fired JSONB, -- e.g., ["OKF", "RAG", "LIVE"]
    dristi_engine TEXT, -- "V1" or "V2"
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Retraction Watch Dataset (Synced periodically)
CREATE TABLE public.retractions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT,
    authors TEXT,
    journal TEXT,
    doi TEXT UNIQUE,
    arxiv_id TEXT UNIQUE,
    retraction_date DATE,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okf_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.query_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retractions ENABLE ROW LEVEL SECURITY;

-- Policies: only authenticated users can view their own data; anon role denied on all tables
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can view own api keys" ON public.api_keys FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can view own okf docs" ON public.okf_docs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can view own threads" ON public.threads FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can view own collections" ON public.collections FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can view own query logs" ON public.query_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- Note: source_snapshots, retractions, and feedback have RLS enabled with zero public/anon policies;
-- access is restricted exclusively to server-side operations via the service_role key.

-- Vector Similarity Search RPC for pgvector
CREATE OR REPLACE FUNCTION match_okf_docs (
  query_embedding VECTOR(384),
  match_threshold FLOAT DEFAULT 0.4,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  file_path TEXT,
  type TEXT,
  topic TEXT,
  source TEXT,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    okf_docs.id,
    okf_docs.file_path,
    okf_docs.type,
    okf_docs.topic,
    okf_docs.source,
    okf_docs.content,
    1 - (okf_docs.embedding <=> query_embedding) AS similarity
  FROM okf_docs
  WHERE okf_docs.embedding IS NOT NULL
    AND 1 - (okf_docs.embedding <=> query_embedding) > match_threshold
  ORDER BY okf_docs.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Revoke execute from public, anon, and authenticated (service_role only)
REVOKE EXECUTE ON FUNCTION public.match_okf_docs(vector, float, int) FROM PUBLIC, anon, authenticated;

-- Feedback table (accuracy tracking and routing evaluation)
CREATE TABLE public.feedback (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    thread_id TEXT,
    message_id TEXT NOT NULL,
    verdict TEXT NOT NULL,
    query TEXT,
    tiers JSONB DEFAULT '[]'::jsonb,
    route_engine TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
-- No policies granted to anon or authenticated; feedback is inserted exclusively via backend service_role key.
