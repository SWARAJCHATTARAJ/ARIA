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
ALTER TABLE public.query_logs ENABLE ROW LEVEL SECURITY;

-- (Basic policies: users can only see their own stuff)
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can view own api keys" ON public.api_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view shared or own okf docs" ON public.okf_docs FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);
CREATE POLICY "Users can view own threads" ON public.threads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view own collections" ON public.collections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view own query logs" ON public.query_logs FOR SELECT USING (auth.uid() = user_id);
