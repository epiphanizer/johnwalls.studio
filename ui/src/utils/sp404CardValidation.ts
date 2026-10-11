import type { SP404HardwareProfile } from './sp404Library';

export type SP404CardValidationSeverity = 'error' | 'warning';

export interface SP404CardValidationIssue {
  severity: SP404CardValidationSeverity;
  message: string;
  path?: string;
}

export interface SP404CardValidationReport {
  profile: SP404HardwareProfile;
  valid: boolean;
  audioFileCount: number;
  mappedPadCount: number;
  banks: Record<string, number>;
  issues: SP404CardValidationIssue[];
}

const AUDIO_EXTENSIONS = new Set(['.WAV', '.AIFF', '.AIF']);
const PAD_NAME = /(?:^|[/\\])(?:SMPL_)?([A-J])[_-]?0*([0-9]{1,2})\.(WAV|AIFF|AIF)$/i;

function relativePath(file: File): string {
  const candidate = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return (candidate || file.name).replace(/\\/g, '/');
}

function hasExpectedCardPath(path: string, profile: SP404HardwareProfile): boolean {
  const normalized = path.toUpperCase();
  if (profile.cardLayout === 'roland-import') {
    return normalized.includes('/ROLAND/IMPORT/') || normalized.includes('/ROLAND/SP-404A/SMPL/');
  }
  return normalized.includes('/FUGUEFAT/') || !normalized.includes('/');
}

/**
 * Validates a folder selected from a physical SP-404 card before importing it.
 * This deliberately validates the file/layout contract we can observe from a
 * browser; it does not claim to verify the card's proprietary filesystem.
 */
export function validateSP404CardFiles(
  files: FileList | File[],
  profile: SP404HardwareProfile
): SP404CardValidationReport {
  const issues: SP404CardValidationIssue[] = [];
  const banks: Record<string, number> = {};
  const mappedPads = new Set<string>();
  let audioFileCount = 0;

  for (const file of Array.from(files)) {
    const path = relativePath(file);
    const extension = path.slice(path.lastIndexOf('.')).toUpperCase();
    if (!AUDIO_EXTENSIONS.has(extension)) {
      if (extension) {
        issues.push({
          severity: 'warning',
          message: `Ignored non-SP-404 audio/file type: ${extension}`,
          path
        });
      }
      continue;
    }

    audioFileCount += 1;
    if (!hasExpectedCardPath(path, profile)) {
      issues.push({
        severity: 'warning',
        message: `File is outside the ${profile.label} card layout; it can still be preview-imported, but it is not a verified card path.`,
        path
      });
    }

    const match = path.match(PAD_NAME);
    if (!match) {
      issues.push({
        severity: 'warning',
        message: 'Filename does not expose a bank/pad mapping; it will be imported into the next empty slot.',
        path
      });
      continue;
    }

    const bank = match[1].toUpperCase();
    const padId = Number.parseInt(match[2], 10);
    if (padId < 1 || padId > profile.padsPerBank) {
      issues.push({
        severity: 'error',
        message: `Pad ${bank}${padId} is outside the ${profile.padsPerBank}-pad bank limit.`,
        path
      });
      continue;
    }

    const key = `${bank}:${padId}`;
    if (mappedPads.has(key)) {
      issues.push({ severity: 'error', message: `Duplicate mapping for pad ${bank}${padId}.`, path });
      continue;
    }
    mappedPads.add(key);
    banks[bank] = (banks[bank] || 0) + 1;
  }

  if (audioFileCount === 0) {
    issues.push({ severity: 'error', message: `No WAV/AIFF files were found for ${profile.label}.` });
  }
  if (audioFileCount > profile.importLimit) {
    issues.push({
      severity: 'error',
      message: `${audioFileCount} audio files exceed the ${profile.importLimit}-slot import limit.`
    });
  }

  return {
    profile,
    valid: !issues.some((issue) => issue.severity === 'error'),
    audioFileCount,
    mappedPadCount: mappedPads.size,
    banks,
    issues
  };
}

export function summarizeSP404CardValidation(report: SP404CardValidationReport): string {
  const errors = report.issues.filter((issue) => issue.severity === 'error').length;
  const warnings = report.issues.filter((issue) => issue.severity === 'warning').length;
  const suffix = [
    errors ? `${errors} error${errors === 1 ? '' : 's'}` : '',
    warnings ? `${warnings} warning${warnings === 1 ? '' : 's'}` : ''
  ].filter(Boolean).join(', ');
  return `${report.profile.label}: ${report.audioFileCount} audio files, ${report.mappedPadCount} mapped pads${suffix ? ` (${suffix})` : ''}.`;
}
