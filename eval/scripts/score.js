#!/usr/bin/env node

/**
 * Ground Truth Scoring Script
 *
 * Compares model_output against corrected (ground truth) in .gt.json files
 * and reports per-field exact match accuracy, Character Error Rate, and
 * needs_review precision/recall/F1.
 *
 * Usage:
 *   node eval/scripts/score.js                          # full report
 *   node eval/scripts/score.js --type burial_register   # single type
 *   node eval/scripts/score.js --check --floor 0.85     # CI gate
 *   node eval/scripts/score.js --json                   # JSON only
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// String metrics
// ---------------------------------------------------------------------------

/**
 * Wagner-Fischer Levenshtein distance.
 */
function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a || a.length === 0) return (b || '').length;
  if (!b || b.length === 0) return a.length;

  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,       // deletion
        curr[j - 1] + 1,   // insertion
        prev[j - 1] + cost  // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Character Error Rate = levenshtein(predicted, reference) / length(reference).
 * Returns 0 if both are null/empty. Returns 1 if reference is empty but predicted is not.
 */
function characterErrorRate(predicted, reference) {
  const p = normalise(predicted);
  const r = normalise(reference);
  if (p === r) return 0;
  if (r.length === 0) return p.length > 0 ? 1 : 0;
  return levenshteinDistance(p, r) / r.length;
}

/**
 * Exact match after trim. null === null is a match.
 * Returns 1 (match) or 0 (mismatch).
 */
function exactMatch(predicted, reference) {
  const p = normalise(predicted);
  const r = normalise(reference);
  return p === r ? 1 : 0;
}

/** Normalise a value to a trimmed string for comparison. null/undefined → '' */
function normalise(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

// ---------------------------------------------------------------------------
// Document scoring
// ---------------------------------------------------------------------------

/** Fields to evaluate per document type */
const FIELDS = {
  burial_register: {
    page: ['parish_header_raw', 'county_header_raw', 'year_header_raw', 'page_marginalia_raw'],
    entry: ['entry_no_raw', 'name_raw', 'abode_raw', 'burial_date_raw', 'age_raw', 'officiant_raw', 'marginalia_raw', 'extra_notes_raw'],
  },
  grave_card: {
    top: ['section', 'grave_number'],
  },
  memorial: {
    record: ['memorial_number', 'first_name', 'last_name', 'year_of_death', 'inscription'],
  },
};

/**
 * Score a single .gt.json file.
 * Returns { file, document_type, entry_count, fields: { [name]: { exact_match, cer } }, needs_review }
 */
function scoreDocument(gtFilePath) {
  const raw = fs.readFileSync(gtFilePath, 'utf8');
  const doc = JSON.parse(raw);
  const type = doc.document_type;

  const fieldStats = {};  // { fieldName: { matches: 0, total: 0, cerSum: 0 } }
  const reviewPairs = []; // [{ model: bool, actual: bool }]

  function initField(name) {
    if (!fieldStats[name]) fieldStats[name] = { matches: 0, total: 0, cerSum: 0 };
  }

  function compareFields(modelOutput, corrected, fieldNames) {
    for (const field of fieldNames) {
      initField(field);
      const predicted = modelOutput[field];
      const reference = corrected[field];
      fieldStats[field].matches += exactMatch(predicted, reference);
      fieldStats[field].cerSum += characterErrorRate(predicted, reference);
      fieldStats[field].total += 1;
    }
  }

  let entryCount = 0;

  if (type === 'burial_register') {
    // Page-level fields
    if (doc.page_level) {
      compareFields(doc.page_level.model_output, doc.page_level.corrected, FIELDS.burial_register.page);
    }
    // Entry-level fields
    for (const entry of (doc.entries || [])) {
      compareFields(entry.model_output, entry.corrected, FIELDS.burial_register.entry);
      reviewPairs.push({
        model: !!entry.needs_review_model,
        actual: !!entry.needs_review_actual,
      });
      entryCount++;
    }
  } else if (type === 'grave_card') {
    compareFields(doc.model_output, doc.corrected, FIELDS.grave_card.top);
    // For data_json, we do a deep comparison of known interment fields
    const modelInterments = doc.model_output?.data_json?.interments || [];
    const correctedInterments = doc.corrected?.data_json?.interments || [];
    const maxLen = Math.max(modelInterments.length, correctedInterments.length);
    const intermentFields = ['full_name', 'date_of_death', 'date_of_burial', 'age_at_death'];
    for (let i = 0; i < maxLen; i++) {
      const mi = modelInterments[i]?.name || modelInterments[i] || {};
      const ci = correctedInterments[i]?.name || correctedInterments[i] || {};
      for (const field of intermentFields) {
        const fname = `interment_${field}`;
        initField(fname);
        const predicted = mi[field] ?? (modelInterments[i] || {})[field];
        const reference = ci[field] ?? (correctedInterments[i] || {})[field];
        fieldStats[fname].matches += exactMatch(predicted, reference);
        fieldStats[fname].cerSum += characterErrorRate(predicted, reference);
        fieldStats[fname].total += 1;
      }
    }
    reviewPairs.push({
      model: !!doc.needs_review_model,
      actual: !!doc.needs_review_actual,
    });
    entryCount = 1;
  } else if (type === 'memorial') {
    for (const record of (doc.records || [])) {
      compareFields(record.model_output, record.corrected, FIELDS.memorial.record);
      reviewPairs.push({
        model: !!record.needs_review_model,
        actual: !!record.needs_review_actual,
      });
      entryCount++;
    }
  }

  // Compute per-field metrics
  const fields = {};
  for (const [name, stats] of Object.entries(fieldStats)) {
    if (stats.total === 0) continue;
    fields[name] = {
      exact_match: stats.matches / stats.total,
      cer: stats.cerSum / stats.total,
      count: stats.total,
    };
  }

  // Compute overall accuracy
  const fieldNames = Object.keys(fields);
  const overallExactMatch = fieldNames.length > 0
    ? fieldNames.reduce((sum, f) => sum + fields[f].exact_match, 0) / fieldNames.length
    : 0;
  const overallCer = fieldNames.length > 0
    ? fieldNames.reduce((sum, f) => sum + fields[f].cer, 0) / fieldNames.length
    : 0;

  // Compute needs_review metrics
  const needsReview = computeNeedsReviewMetrics(reviewPairs);

  return {
    file: path.basename(gtFilePath),
    document_type: type,
    entry_count: entryCount,
    difficulty: doc.difficulty || 0,
    blind_transcribed: doc.blind_transcribed || false,
    fields,
    overall_exact_match: overallExactMatch,
    overall_cer: overallCer,
    needs_review: needsReview,
  };
}

/**
 * Compute precision/recall/F1 for needs_review predictions.
 */
function computeNeedsReviewMetrics(pairs) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const { model, actual } of pairs) {
    if (model && actual) tp++;
    else if (model && !actual) fp++;
    else if (!model && actual) fn++;
    else tn++;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
  return { precision, recall, f1, tp, fp, fn, tn };
}

/**
 * Score all .gt.json files in a directory.
 */
function scoreDocumentType(gtDir) {
  if (!fs.existsSync(gtDir)) return null;

  const files = fs.readdirSync(gtDir).filter(f => f.endsWith('.gt.json'));
  if (files.length === 0) return null;

  const documents = files.map(f => scoreDocument(path.join(gtDir, f)));
  return aggregateScores(documents);
}

/**
 * Aggregate multiple document scores into a summary.
 * @param {Object[]} documents
 * @param {boolean} [includeDifficulty=true] - Whether to compute difficulty breakdown (disabled for sub-aggregations)
 */
function aggregateScores(documents, includeDifficulty = true) {
  if (documents.length === 0) return null;

  const totalEntries = documents.reduce((s, d) => s + d.entry_count, 0);

  // Aggregate field metrics (weighted by count)
  const fieldAgg = {};
  for (const doc of documents) {
    for (const [name, stats] of Object.entries(doc.fields)) {
      if (!fieldAgg[name]) fieldAgg[name] = { matchSum: 0, cerSum: 0, total: 0 };
      fieldAgg[name].matchSum += stats.exact_match * stats.count;
      fieldAgg[name].cerSum += stats.cer * stats.count;
      fieldAgg[name].total += stats.count;
    }
  }

  const fields = {};
  for (const [name, agg] of Object.entries(fieldAgg)) {
    fields[name] = {
      exact_match: agg.total > 0 ? agg.matchSum / agg.total : 0,
      cer: agg.total > 0 ? agg.cerSum / agg.total : 0,
      count: agg.total,
    };
  }

  const fieldNames = Object.keys(fields);
  const overallExactMatch = fieldNames.length > 0
    ? fieldNames.reduce((s, f) => s + fields[f].exact_match, 0) / fieldNames.length
    : 0;
  const overallCer = fieldNames.length > 0
    ? fieldNames.reduce((s, f) => s + fields[f].cer, 0) / fieldNames.length
    : 0;

  // Aggregate needs_review
  const allPairs = [];
  for (const doc of documents) {
    const nr = doc.needs_review;
    for (let i = 0; i < nr.tp; i++) allPairs.push({ model: true, actual: true });
    for (let i = 0; i < nr.fp; i++) allPairs.push({ model: true, actual: false });
    for (let i = 0; i < nr.fn; i++) allPairs.push({ model: false, actual: true });
    for (let i = 0; i < nr.tn; i++) allPairs.push({ model: false, actual: false });
  }
  const needsReview = computeNeedsReviewMetrics(allPairs);

  // Aggregate by difficulty (only at the top level to avoid infinite recursion)
  const difficultyBreakdown = {};
  if (includeDifficulty) {
    const byDifficulty = {};
    for (const doc of documents) {
      const d = doc.difficulty || 0;
      if (!byDifficulty[d]) byDifficulty[d] = [];
      byDifficulty[d].push(doc);
    }
    for (const [d, docs] of Object.entries(byDifficulty)) {
      const agg = aggregateScores(docs, false);
      if (agg) {
        difficultyBreakdown[d] = {
          exact_match: agg.overall_exact_match,
          cer: agg.overall_cer,
          documents: docs.length,
          entries: agg.total_entries,
        };
      }
    }
  }

  return {
    total_documents: documents.length,
    total_entries: totalEntries,
    overall_exact_match: overallExactMatch,
    overall_cer: overallCer,
    needs_review: needsReview,
    fields,
    by_difficulty: difficultyBreakdown,
    documents,
  };
}

/**
 * Run evaluation across all document types.
 *
 * `gtDir` is the directory holding the per-type subdirectories, e.g.
 * `burial-registers/`, `grave-cards/` and `memorials/`.
 */
function runFullEvaluation(gtDir) {
  const types = {
    burial_register: scoreDocumentType(path.join(gtDir, 'burial-registers')),
    grave_card: scoreDocumentType(path.join(gtDir, 'grave-cards')),
    memorial: scoreDocumentType(path.join(gtDir, 'memorials')),
  };

  // Overall across all types
  const allDocuments = [];
  for (const typeResult of Object.values(types)) {
    if (typeResult) allDocuments.push(...typeResult.documents);
  }

  const overall = allDocuments.length > 0 ? aggregateScores(allDocuments) : null;

  return {
    generated_at: new Date().toISOString(),
    schema_version: '1.0.0',
    total_documents: overall?.total_documents || 0,
    total_entries: overall?.total_entries || 0,
    overall_exact_match: overall?.overall_exact_match || 0,
    overall_cer: overall?.overall_cer || 0,
    needs_review_f1: overall?.needs_review?.f1 || 0,
    by_document_type: Object.fromEntries(
      Object.entries(types)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => {
          const { documents, ...summary } = v;
          return [k, summary];
        })
    ),
    by_difficulty: overall?.by_difficulty || {},
  };
}

// ---------------------------------------------------------------------------
// Console report formatter
// ---------------------------------------------------------------------------

function formatReport(report) {
  const lines = [];
  lines.push('');
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('  TextHarvester Extraction Accuracy Report');
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`  Documents: ${report.total_documents}    Entries: ${report.total_entries}`);
  lines.push(`  Overall Exact Match: ${(report.overall_exact_match * 100).toFixed(1)}%`);
  lines.push(`  Overall CER:         ${(report.overall_cer * 100).toFixed(2)}%`);
  lines.push(`  Needs Review F1:     ${(report.needs_review_f1 * 100).toFixed(1)}%`);
  lines.push('');

  for (const [typeName, typeData] of Object.entries(report.by_document_type)) {
    lines.push(`  ── ${typeName} ──────────────────────────────────`);
    lines.push(`  Documents: ${typeData.total_documents}    Entries: ${typeData.total_entries}`);
    lines.push(`  Exact Match: ${(typeData.overall_exact_match * 100).toFixed(1)}%    CER: ${(typeData.overall_cer * 100).toFixed(2)}%`);
    lines.push('');
    lines.push('  Field                    Exact Match    CER       Count');
    lines.push('  ─────────────────────    ───────────    ──────    ─────');
    for (const [field, stats] of Object.entries(typeData.fields)) {
      const em = (stats.exact_match * 100).toFixed(1).padStart(8);
      const cer = (stats.cer * 100).toFixed(2).padStart(6);
      const count = String(stats.count).padStart(5);
      lines.push(`  ${field.padEnd(25)} ${em}%    ${cer}%    ${count}`);
    }
    lines.push('');
  }

  if (Object.keys(report.by_difficulty).length > 0) {
    lines.push('  ── By Difficulty ─────────────────────────────────');
    for (const [d, data] of Object.entries(report.by_difficulty)) {
      lines.push(`  Level ${d}: ${(data.exact_match * 100).toFixed(1)}% exact match, ${data.documents} docs, ${data.entries} entries`);
    }
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════════');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const jsonOnly = args.includes('--json');
  const check = args.includes('--check');
  const floorIdx = args.indexOf('--floor');
  const floor = floorIdx >= 0 ? parseFloat(args[floorIdx + 1]) : 0.85;
  const typeIdx = args.indexOf('--type');
  const typeFilter = typeIdx >= 0 ? args[typeIdx + 1] : null;
  const dirIdx = args.indexOf('--dir');

  const evalDir = path.resolve(__dirname, '..');
  // By default we score the real ground truth, which is deliberately NOT
  // committed (client data) and lives only on the local machine. `--dir` points
  // the scorer at another set, e.g. the tracked synthetic fixtures:
  //   npm run eval:synthetic
  const gtDir = dirIdx >= 0
    ? path.resolve(process.cwd(), args[dirIdx + 1])
    : path.join(evalDir, 'ground-truth');
  const report = runFullEvaluation(gtDir);

  if (report.total_entries === 0) {
    if (!jsonOnly) {
      console.log('\nNo ground truth files found. Run eval:export to generate annotation stubs.\n');
    }
    if (check) {
      console.log('WARNING: No data to evaluate. Exiting with code 0.');
      process.exit(0);
    }
    if (jsonOnly) console.log(JSON.stringify(report, null, 2));
    return;
  }

  // Filter to single type if requested
  let effectiveReport = report;
  if (typeFilter && report.by_document_type[typeFilter]) {
    const typeData = report.by_document_type[typeFilter];
    effectiveReport = {
      ...report,
      total_documents: typeData.total_documents,
      total_entries: typeData.total_entries,
      overall_exact_match: typeData.overall_exact_match,
      overall_cer: typeData.overall_cer,
      by_document_type: { [typeFilter]: typeData },
    };
  }

  // Output report
  if (jsonOnly) {
    console.log(JSON.stringify(effectiveReport, null, 2));
  } else {
    console.log(formatReport(effectiveReport));
  }

  // Write JSON report to eval/reports/
  const reportsDir = path.join(evalDir, 'reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `eval-report-${new Date().toISOString().split('T')[0]}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(effectiveReport, null, 2) + '\n');
  if (!jsonOnly) console.log(`Report written to: ${reportPath}\n`);

  // CI gate
  if (check) {
    if (report.total_entries < 50) {
      console.log(`WARNING: Only ${report.total_entries} entries (< 50). Floor check skipped.`);
      process.exit(0);
    }
    if (report.overall_exact_match < floor) {
      console.error(`FAIL: Overall exact match ${(report.overall_exact_match * 100).toFixed(1)}% is below floor ${(floor * 100).toFixed(1)}%`);
      process.exit(1);
    }
    console.log(`PASS: Overall exact match ${(report.overall_exact_match * 100).toFixed(1)}% meets floor ${(floor * 100).toFixed(1)}%`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  levenshteinDistance,
  characterErrorRate,
  exactMatch,
  scoreDocument,
  scoreDocumentType,
  runFullEvaluation,
  computeNeedsReviewMetrics,
};
