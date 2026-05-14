export interface Team {
  id: number;
  name: string;
  logoUrl?: string;
  kitColor?: string;
}

export interface MatchField {
  id: number;
  name: string;
  location: string;
}

export interface MatchEvent {
  id: number;
  type: 'goal' | 'yellow_card' | 'red_card';
  player: {
    id: number;
    name: string;
  };
  team: 'home' | 'away';
}

export type MatchStatus = 'pendiente' | 'en_curso' | 'finalizado';
export type MatchPhase = 'fase_de_grupos' | 'octavos' | 'cuartos' | 'semis' | 'final';

export interface Match {
  id: number;
  homeTeam?: Team;
  awayTeam?: Team;
  homeTeamPlaceholder?: string;
  awayTeamPlaceholder?: string;
  homeGoals: number;
  awayGoals: number;
  homePenaltyGoals?: number;
  awayPenaltyGoals?: number;
  date: string;
  field: MatchField;
  status: MatchStatus;
  phase: MatchPhase;
  groupName?: string;
  dayOfWeek?: string;
  observations?: string;
  events?: MatchEvent[];
  userVote?: 'local' | 'empate' | 'visitante';
  votingStats?: {
    local: number;
    draw: number;
    away: number;
    total: number;
  };
}
