export type Confidence = 'high' | 'partial' | 'none' | 'unavailable';

export type ReasonCode =
  | 'AUTO_MATCH'
  | 'PARTIAL_MATCH'
  | 'NO_MATCH'
  | 'DIRECTORY_UNAVAILABLE'
  | 'STUDENT_MANUAL'
  | 'DUPLICATE';

export interface Decision {
  status: 'approved' | 'flagged';
  reasonCode: ReasonCode;
}

export interface DecisionInput {
  qualificationStatus: 'qualified' | 'student';
  confidence: Confidence | null;
  isDuplicate: boolean;
}

export function decide(input: DecisionInput): Decision {
  if (input.isDuplicate) return { status: 'flagged', reasonCode: 'DUPLICATE' };
  if (input.qualificationStatus === 'student') {
    return { status: 'flagged', reasonCode: 'STUDENT_MANUAL' };
  }
  switch (input.confidence) {
    case 'high':
      return { status: 'approved', reasonCode: 'AUTO_MATCH' };
    case 'partial':
      return { status: 'flagged', reasonCode: 'PARTIAL_MATCH' };
    case 'none':
      return { status: 'flagged', reasonCode: 'NO_MATCH' };
    default:
      return { status: 'flagged', reasonCode: 'DIRECTORY_UNAVAILABLE' };
  }
}
