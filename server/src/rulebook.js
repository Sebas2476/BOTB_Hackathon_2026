// Loads the AEO & GEO audit rulebook (the reference database Maat reasons from):
// audit rules, the sources behind them, and the rulebook's own guidance records.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './csv.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'sample-data', 'aeo_geo_rulebook.csv');

const rows = parseCsv(fs.readFileSync(FILE, 'utf8'));
const pick = (r, ...keys) => keys.map((k) => r[k]).find((v) => v != null && v !== '') ?? '';

export const SOURCES = Object.fromEntries(rows
  .filter((r) => r.record_type === 'Source')
  .map((r) => [r.record_id, { id: r.record_id, title: pick(r, 'practice_/_title'), url: r.source_urls, sections: r.source_sections }]));

export const RULES = Object.fromEntries(rows
  .filter((r) => r.record_type === 'Audit rule')
  .map((r) => [r.record_id, {
    id: r.record_id,
    group: r.group,
    title: pick(r, 'practice_/_title'),
    evidence: r.evidence_status, // Established | Supported inference | Emerging
    platforms: r.platform_scope,
    risk: pick(r, 'risk_if_unresolved_(provisional)'), // High | Medium–High | Medium | Contextual | Opportunity
    applies: r.applicability,
    detection: r.detection_procedure,
    failWhen: r.finding_condition,
    exceptions: pick(r, 'exceptions_/_uncertainty'),
    correction: r.recommended_correction,
    passExample: r.passing_example,
    failExample: pick(r, 'failing_/_caution_example'),
    sources: r.source_ids.split(',').map((s) => s.trim()).filter(Boolean),
    benefit: r.expected_benefit,
    implementationRisk: r.implementation_risk_guidance,
  }]));

export const GUIDANCE = Object.fromEntries(rows
  .filter((r) => r.record_type === 'Reference guidance')
  .map((r) => [r.record_id, { id: r.record_id, title: pick(r, 'practice_/_title'), text: r.reference_instructions }]));

export const RULEBOOK_VERSION = GUIDANCE['GUIDE-01']?.text ?? '';

// Result states defined by the rulebook (GUIDE-05).
export const RESULT_STATES = ['Fail', 'Needs verification', 'Opportunity', 'Pass', 'Not assessed', 'Not applicable'];
