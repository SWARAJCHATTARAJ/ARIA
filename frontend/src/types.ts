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

export type ResearchMode = 'fast_brief' | 'deep_academic' | 'critique' | 'quantitative' | 'first_principles';

export const RESEARCH_MODE_OPTIONS: Array<{ id: ResearchMode; label: string; glyph: string; hint: string }> = [
  { id: 'fast_brief', label: 'Fast Executive Brief', glyph: '⚡', hint: 'Concise takeaways & rapid verification, lowest latency.' },
  { id: 'deep_academic', label: 'Deep Academic Paper', glyph: '🔬', hint: 'Comprehensive multi-section literature review (default).' },
  { id: 'critique', label: 'Literature Debate & Critique', glyph: '⚖️', hint: 'Contrasting methodologies & contradiction evaluation.' },
  { id: 'quantitative', label: 'Quantitative & Data Extraction', glyph: '🧮', hint: 'Equations, statistical benchmarks & parameter tables.' },
  { id: 'first_principles', label: 'First-Principles Explainer', glyph: '🌱', hint: 'Axioms-first breakdown up to graduate level.' },
];

export interface DisciplineOption {
  id: string;
  label: string;
  glyph: string;
}

export const DISCIPLINE_OPTIONS: DisciplineOption[] = [
  { id: 'auto', label: 'All Disciplines (Auto)', glyph: '🌐' },
  { id: 'science', label: 'General Science & Tech', glyph: '🔬' },
  { id: 'cs', label: 'Computer Science & AI', glyph: '🤖' },
  { id: 'physics', label: 'Physics & Engineering', glyph: '⚛️' },
  { id: 'chemistry', label: 'Chemistry & Materials', glyph: '⚗️' },
  { id: 'life', label: 'Botany & Life Sciences', glyph: '🧬' },
  { id: 'medicine', label: 'Medicine & Clinical', glyph: '🩺' },
  { id: 'humanities', label: 'Arts & Humanities', glyph: '📜' },
  { id: 'music', label: 'Music & Acoustics', glyph: '🎵' },
  { id: 'law', label: 'Law & Public Policy', glyph: '⚖️' },
  { id: 'economics', label: 'Economics & Finance', glyph: '📈' },
];

export type ThemePreset = 'cyber_obsidian' | 'quantum_indigo' | 'emerald_matrix' | 'solar_amber' | 'high_contrast';
export type AnimationIntensity = 'full_kinetic' | 'subtle_smooth' | 'reduced_motion';
export type CitationFormat = 'ieee' | 'apa' | 'nature';
export type FontDensity = 'compact' | 'standard' | 'comfortable';

export interface AriaSettings {
  researchMode: ResearchMode;
  discipline: string;
  sourceCount: number;
  retrievalStrictness: 'strict_peer' | 'include_web';
  compareDefault: boolean;
  themePreset: ThemePreset;
  animationIntensity: AnimationIntensity;
  gridOverlay: boolean;
  fontDensity: FontDensity;
  citationFormat: CitationFormat;
  auditThreshold: number;
  autoExpandAudit: boolean;
  pdfFullLedger: boolean;
  clickableUrls: boolean;
  byokProvider: string;
  byokApiKey: string;
}

export const DEFAULT_SETTINGS: AriaSettings = {
  researchMode: 'deep_academic',
  discipline: 'auto',
  sourceCount: 8,
  retrievalStrictness: 'strict_peer',
  compareDefault: false,
  themePreset: 'cyber_obsidian',
  animationIntensity: 'full_kinetic',
  gridOverlay: true,
  fontDensity: 'standard',
  citationFormat: 'ieee',
  auditThreshold: 0.5,
  autoExpandAudit: true,
  pdfFullLedger: true,
  clickableUrls: true,
  byokProvider: '',
  byokApiKey: '',
};

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
