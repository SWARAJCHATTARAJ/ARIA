export type TierType = 'OKF' | 'RAG' | 'LIVE';

export type ReviewStatus = 'verified' | 'draft' | 'scholarly' | 'preprint' | 'unreviewed_web';

export type ClaimStatus = 'supported' | 'partially_supported' | 'unsupported' | 'uncited' | 'audit_incomplete';

export interface AuditClaim {
  claim_id: number | string;
  text: string;
  citation_ids?: number[];
  evidence?: string;
  note?: string;
  supported?: boolean;
  status: ClaimStatus;
  coverage?: number;
  start?: number;
  end?: number;
}

export interface VisualCardData {
  found: boolean;
  title?: string;
  description?: string;
  thumbnail_url?: string;
  original_image_url?: string;
  extract?: string;
  page_url?: string;
}

export interface RouteTelemetry {
  dristi_available?: boolean;
  dristi_engine?: 'V1' | 'V2' | string;
  route_decision?: string;
  escalated?: boolean;
  v1_confidence?: number | null;
  v2_confidence?: number | null;
  latency_ms?: number | null;
}

export interface RetrievalTelemetry {
  tiers?: string[];
  okf_node_paths?: string[];
  rag_scores?: number[];
  sources?: Array<{
    source?: string;
    source_type?: string;
    tier?: string;
    similarity?: number;
    is_retracted?: boolean;
    rank?: number;
    published?: string;
    cited?: boolean;
  }>;
}

export interface Citation {
  id: number;
  title?: string | null;
  path?: string | null;
  url?: string | null;
  source?: string | null;
  authors?: string | string[] | null;
  year?: string | number | null;
  venue?: string | null;
  snippet?: string | null;
  source_type?: string;
  tier?: TierType | string;
  doi?: string | null;
  arxiv_id?: string | null;
  is_retracted?: boolean;
  review_status?: ReviewStatus | string;
  similarity?: number | null;
  cited?: boolean;
  rank?: number;
  published?: string;
}

export interface AuditResult {
  claims?: (AuditClaim | string)[];
  removed_claims?: Array<{ text: string; reason?: string }>;
  conflicts?: string[];
  retractions?: string[];
  confidence?: number;
  tier_agreement?: string | null;
  answer_final?: string;
  repaired?: boolean;
}

export type PipelineStage = 'idle' | 'routing' | 'retrieving' | 'streaming' | 'auditing' | 'complete' | 'error';

export interface MessageTelemetry {
  route?: RouteTelemetry;
  retrieval?: RetrievalTelemetry;
  audit?: AuditResult;
  stage?: PipelineStage;
}

export interface Message {
  id: string;
  role: 'user' | 'aria';
  content: string;
  query?: string;
  citations?: Citation[];
  telemetry?: MessageTelemetry;
  isStreaming?: boolean;
  queuePosition?: number | null;
  error?: string;
  timestamp?: number;
  recordedDate?: string;
}
