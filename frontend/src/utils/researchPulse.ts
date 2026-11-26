export interface ResearchPulseStats {
  queriesCount: number;
  verifiedClaimsRead: number;
  sourcesExplored: number;
  currentDayStreak: number;
  lastActiveDate: string | null;
}

const PULSE_STORAGE_KEY = 'aria-research-pulse-v1';

const DEFAULT_PULSE: ResearchPulseStats = {
  queriesCount: 0,
  verifiedClaimsRead: 0,
  sourcesExplored: 0,
  currentDayStreak: 0,
  lastActiveDate: null,
};

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function yesterdayIsoDate(): string {
  const now = new Date(Date.now() - 86400000);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getResearchPulse(): ResearchPulseStats {
  try {
    const raw = localStorage.getItem(PULSE_STORAGE_KEY);
    if (!raw) return DEFAULT_PULSE;
    return { ...DEFAULT_PULSE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PULSE;
  }
}

function saveResearchPulse(stats: ResearchPulseStats): ResearchPulseStats {
  try {
    localStorage.setItem(PULSE_STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // ignore storage quota errors
  }
  return stats;
}

export function recordQueryCompleted(verifiedClaimsCount: number = 0): ResearchPulseStats {
  const current = getResearchPulse();
  const today = todayIsoDate();
  const yesterday = yesterdayIsoDate();

  let nextStreak = current.currentDayStreak;
  if (current.lastActiveDate === today) {
    nextStreak = Math.max(1, current.currentDayStreak);
  } else if (current.lastActiveDate === yesterday) {
    nextStreak = current.currentDayStreak + 1;
  } else {
    nextStreak = 1;
  }

  return saveResearchPulse({
    queriesCount: current.queriesCount + 1,
    verifiedClaimsRead: current.verifiedClaimsRead + Math.max(0, verifiedClaimsCount),
    sourcesExplored: current.sourcesExplored,
    currentDayStreak: nextStreak,
    lastActiveDate: today,
  });
}

export function recordSourceExplored(): ResearchPulseStats {
  const current = getResearchPulse();
  const today = todayIsoDate();
  return saveResearchPulse({
    ...current,
    sourcesExplored: current.sourcesExplored + 1,
    currentDayStreak: Math.max(1, current.currentDayStreak),
    lastActiveDate: current.lastActiveDate || today,
  });
}

export function resetResearchPulse(): void {
  saveResearchPulse(DEFAULT_PULSE);
}
