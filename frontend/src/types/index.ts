export type TierType = 'OKF' | 'RAG' | 'LIVE';

export type ReviewStatus = 'verified' | 'draft' | 'scholarly' | 'preprint' | 'unreviewed_web';

export type ClaimStatus = 'supported' | 'partially_supported' | 'unsupported' | 'uncited' | 'audit_incomplete';

export type SourceTierFilter = 'all' | 'peer_reviewed';
export type RecencyFilter = 'all' | '5y' | '2y';
export type CitationStyle = 'apa7' | 'ieee' | 'chicago' | 'bibtex';
export type EntailmentStrictness = 'standard' | 'strict';
export type ResearchModePref = 'synthesis' | 'deep_compare';
export type ThemePreset = 'cyber-cyan' | 'emerald-biolab' | 'obsidian-gold' | 'solaris-paper';
export type SurfaceMode = 'system' | 'dark' | 'light';
export type FontFamilyPref = 'serif' | 'sans';
export type FontScalePref = 'compact' | 'default' | 'large';
export type PdfLayoutStyle = 'academic' | 'executive';

export type FollowUpIntent = 'deep_dive' | 'counter_view' | 'applied';

export interface FollowUpCard {
  intent: FollowUpIntent;
  label: string;
  question: string;
}

export interface AuditClaim {
  claim_id: number | string;
  text: string;
  citation_ids?: number[];
  source_index?: number | null;
  evidence?: string;
  evidence_quote?: string | null;
  note?: string;
  supported?: boolean;
  status: ClaimStatus;
  verdict?: 'supported' | 'partial' | 'unverified';
  coverage?: number;
  start?: number;
  end?: number;
}

export interface FigureData {
  title: string;
  caption: string;
  url: string;
  source_url?: string;
  attribution?: string;
}

export interface ChartSeries {
  name: string;
  data: number[];
}

export interface ChartData {
  title: string;
  caption: string;
  chart_type: string;
  x_label: string;
  y_label: string;
  categories: string[];
  series: ChartSeries[];
  source_citation?: string;
}

export interface VisualCardData {
  found: boolean;
  title?: string;
  description?: string;
  image_url?: string | null;
  thumbnail_url?: string;
  original_image_url?: string;
  extract?: string;
  page_url?: string;
  canonical_topic?: string;
  wikipedia_exact_title?: string;
}

export interface OkfGraphNode {
  id: string;
  note_id: string;
  title: string;
  type: string;
  topic: string[];
  confidence: string;
  source: string;
  updated: string;
  snippet_preview: string;
  content: string;
}

export interface OkfGraphEdge {
  source: string;
  target: string;
}

export interface OkfGraphData {
  nodes: OkfGraphNode[];
  edges: OkfGraphEdge[];
  total_nodes: number;
  total_edges: number;
}

export interface HistoryEntry {
  id: string;
  query: string;
  snippet: string;
  confidence?: number;
  timestamp: number;
}

export interface CollectionEntry {
  id: string;
  query: string;
  content: string;
  confidence?: number;
  timestamp: number;
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
  entailment_score?: number;
  verification_status?: 'verified' | 'partial' | 'unverified';
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
  figures?: FigureData[];
  chart?: ChartData;
  followup_questions?: string[];
  followup_cards?: FollowUpCard[];
  query?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'aria';
  content: string;
  query?: string;
  citations?: Citation[];
  telemetry?: MessageTelemetry;
  figures?: FigureData[];
  chart?: ChartData;
  isStreaming?: boolean;
  queuePosition?: number | null;
  error?: string;
  timestamp?: number;
}
