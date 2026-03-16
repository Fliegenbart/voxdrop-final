/**
 * Regelbasierte Textanalyse für Leichte Sprache
 * Analysiert Texte ohne KI-Aufruf
 */

import {
  WORD_REPLACEMENTS,
  ABBREVIATIONS,
  PASSIVE_INDICATORS,
  ANALYSIS_THRESHOLDS,
} from '../rules/simple-language-rules';

export interface TextIssue {
  type: 'long_sentence' | 'too_many_commas' | 'complex_word' | 'passive_voice' | 'genitive_case' | 'abbreviation' | 'replaceable_word';
  text: string;
  suggestion?: string;
  position?: { start: number; end: number };
}

export interface TextStats {
  characters: number;
  words: number;
  sentences: number;
  avgWordsPerSentence: number;
  complexWords: number;
  passiveConstructions: number;
  genitiveConstructions: number;
  abbreviations: number;
  replaceableWords: number;
  sentencesWithTooManyCommas: number;
}

export interface TextAnalysisResult {
  score: number;
  level: 'leicht' | 'mittel' | 'schwer';
  levelColor: 'green' | 'yellow' | 'red';
  issues: TextIssue[];
  stats: TextStats;
  suggestions: Array<{ original: string; replacement: string }>;
}

/**
 * Splittet Text in Sätze
 */
function splitIntoSentences(text: string): string[] {
  // Einfacher Satz-Splitter (berücksichtigt Abkürzungen)
  return text
    .replace(/([.!?])\s+/g, '$1|||')
    .split('|||')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Zählt Wörter in einem Text
 */
function countWords(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Findet lange Sätze
 */
function findLongSentences(text: string): TextIssue[] {
  const sentences = splitIntoSentences(text);
  const issues: TextIssue[] = [];

  for (const sentence of sentences) {
    const wordCount = countWords(sentence);
    if (wordCount > ANALYSIS_THRESHOLDS.maxWordsPerSentence) {
      issues.push({
        type: 'long_sentence',
        text: sentence,
        suggestion: `Dieser Satz hat ${wordCount} Wörter. Teilen Sie ihn in mehrere kurze Sätze (max. ${ANALYSIS_THRESHOLDS.maxWordsPerSentence} Wörter).`,
      });
    }
  }

  return issues;
}

/**
 * Findet Sätze mit zu vielen Kommas
 */
function findTooManyCommas(text: string): TextIssue[] {
  const sentences = splitIntoSentences(text);
  const issues: TextIssue[] = [];

  for (const sentence of sentences) {
    const commaCount = (sentence.match(/,/g) || []).length;
    if (commaCount > ANALYSIS_THRESHOLDS.maxCommasPerSentence) {
      issues.push({
        type: 'too_many_commas',
        text: sentence,
        suggestion: `Dieser Satz hat ${commaCount} Kommas. Teilen Sie ihn in mehrere einfache Sätze.`,
      });
    }
  }

  return issues;
}

/**
 * Findet komplexe/lange Wörter
 */
function findComplexWords(text: string): TextIssue[] {
  const words = text.match(/\b[a-zA-ZäöüÄÖÜß]+\b/g) || [];
  const issues: TextIssue[] = [];
  const seen = new Set<string>();

  for (const word of words) {
    const lowerWord = word.toLowerCase();

    // Überspringe bereits gefundene Wörter
    if (seen.has(lowerWord)) continue;

    if (word.length >= ANALYSIS_THRESHOLDS.complexWordMinLength) {
      // Prüfe ob es ein Kompositum ist (kann mit Bindestrich getrennt werden)
      const syllables = word.match(/[bcdfghjklmnpqrstvwxyzß]*[aeiouäöü]+[bcdfghjklmnpqrstvwxyzß]*/gi) || [];

      if (syllables.length >= 3) {
        issues.push({
          type: 'complex_word',
          text: word,
          suggestion: `Langes Wort (${word.length} Zeichen). Trennen Sie es mit Bindestrichen oder verwenden Sie ein einfacheres Wort.`,
        });
        seen.add(lowerWord);
      }
    }
  }

  return issues;
}

/**
 * Findet Passiv-Konstruktionen
 */
function findPassiveVoice(text: string): TextIssue[] {
  const issues: TextIssue[] = [];
  const sentences = splitIntoSentences(text);

  for (const sentence of sentences) {
    const lowerSentence = sentence.toLowerCase();

    // Suche nach "wird/werden ... Partizip II"
    for (const indicator of PASSIVE_INDICATORS) {
      if (lowerSentence.includes(indicator)) {
        // Prüfe ob ein Partizip II in der Nähe ist (endet auf -t, -en, ge-...-t/en)
        const hasParticiple = /\b(ge\w+t|ge\w+en|\w+iert|\w+iert)\b/i.test(sentence);

        if (hasParticiple) {
          issues.push({
            type: 'passive_voice',
            text: sentence,
            suggestion: 'Passiv-Konstruktion gefunden. Formulieren Sie den Satz im Aktiv um.',
          });
          break; // Nur eine Meldung pro Satz
        }
      }
    }
  }

  return issues;
}

/**
 * Findet Genitiv-Konstruktionen
 */
function findGenitiveCase(text: string): TextIssue[] {
  const issues: TextIssue[] = [];

  // Suche nach typischen Genitiv-Mustern
  const genitivePatterns = [
    /\bdes\s+[A-ZÄÖÜ][a-zäöüß]+s?\b/g,  // des Amtes, des Gesetzes
    /\bder\s+[A-ZÄÖÜ][a-zäöüß]+\b(?!\s+(ist|sind|hat|haben|wird|werden))/g, // der Behörde (nicht "der ist")
  ];

  for (const pattern of genitivePatterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        issues.push({
          type: 'genitive_case',
          text: match,
          suggestion: `Genitiv gefunden. Verwenden Sie "von" + Dativ stattdessen (z.B. "${match}" → "von dem/der ...")`,
        });
      }
    }
  }

  return issues;
}

/**
 * Findet Abkürzungen
 */
function findAbbreviations(text: string): TextIssue[] {
  const issues: TextIssue[] = [];
  const seen = new Set<string>();

  for (const [abbr, expansion] of Object.entries(ABBREVIATIONS)) {
    if (text.includes(abbr) && !seen.has(abbr)) {
      issues.push({
        type: 'abbreviation',
        text: abbr,
        suggestion: `Schreiben Sie "${expansion}" statt "${abbr}"`,
      });
      seen.add(abbr);
    }
  }

  return issues;
}

/**
 * Findet ersetzbare Wörter aus dem Wörterbuch
 */
function findReplaceableWords(text: string): { issues: TextIssue[]; suggestions: Array<{ original: string; replacement: string }> } {
  const issues: TextIssue[] = [];
  const suggestions: Array<{ original: string; replacement: string }> = [];
  const lowerText = text.toLowerCase();
  const seen = new Set<string>();

  for (const [word, replacement] of Object.entries(WORD_REPLACEMENTS)) {
    const lowerWord = word.toLowerCase();

    if (lowerText.includes(lowerWord) && !seen.has(lowerWord)) {
      issues.push({
        type: 'replaceable_word',
        text: word,
        suggestion: replacement,
      });
      suggestions.push({ original: word, replacement });
      seen.add(lowerWord);
    }
  }

  return { issues, suggestions };
}

/**
 * Berechnet den Verständlichkeits-Score (0-100, höher = besser)
 * Score wird relativ zur Textlänge berechnet, um längere Texte fair zu bewerten.
 */
function calculateScore(issues: TextIssue[], stats: TextStats): number {
  const { weights } = ANALYSIS_THRESHOLDS;

  // Bei leerem Text: 100 Punkte
  if (stats.sentences === 0) {
    return 100;
  }

  // Zähle Issues nach Typ
  const counts = {
    long_sentence: 0,
    too_many_commas: 0,
    complex_word: 0,
    passive_voice: 0,
    genitive_case: 0,
    abbreviation: 0,
    replaceable_word: 0,
  };

  for (const issue of issues) {
    counts[issue.type]++;
  }

  // Berechne gewichtete Problempunkte
  let rawPenalty = 0;
  rawPenalty += counts.long_sentence * weights.longSentences;
  rawPenalty += counts.too_many_commas * weights.tooManyCommas;
  rawPenalty += counts.complex_word * weights.complexWords;
  rawPenalty += counts.passive_voice * weights.passiveVoice;
  rawPenalty += counts.genitive_case * weights.genitiveCase;
  rawPenalty += counts.abbreviation * weights.abbreviations;
  rawPenalty += counts.replaceable_word * weights.replaceableWords;

  // Normalisiere Strafe relativ zur Textlänge
  // Ein Text mit 10 Sätzen und 5 Problemen ist besser als
  // ein Text mit 3 Sätzen und 5 Problemen
  const sentenceCount = Math.max(stats.sentences, 1);
  const normalizedPenalty = rawPenalty / Math.sqrt(sentenceCount);

  // Zusätzliche leichte Strafe für sehr lange durchschnittliche Satzlänge (>20 Wörter)
  let avgSentencePenalty = 0;
  if (stats.avgWordsPerSentence > 20) {
    avgSentencePenalty = (stats.avgWordsPerSentence - 20) * 1.5;
  }

  // Score berechnen (100 - normalisierte Strafpunkte)
  // Max-Penalty bei 50 für 0 Punkte (damit nicht jeder Text 0 bekommt)
  const totalPenalty = normalizedPenalty + avgSentencePenalty;
  const score = Math.max(0, Math.min(100, 100 - totalPenalty * 2));

  return Math.round(score);
}

/**
 * Bestimmt das Level basierend auf dem Score
 */
function getLevel(score: number): { level: 'leicht' | 'mittel' | 'schwer'; color: 'green' | 'yellow' | 'red' } {
  const { levels } = ANALYSIS_THRESHOLDS;

  if (score >= levels.easy.min) {
    return { level: 'leicht', color: 'green' };
  } else if (score >= levels.medium.min) {
    return { level: 'mittel', color: 'yellow' };
  } else {
    return { level: 'schwer', color: 'red' };
  }
}

/**
 * Hauptfunktion: Analysiert einen Text
 */
export function analyzeText(text: string): TextAnalysisResult {
  const sentences = splitIntoSentences(text);
  const words = text.split(/\s+/).filter(w => w.length > 0);

  // Sammle alle Issues
  const longSentenceIssues = findLongSentences(text);
  const commaIssues = findTooManyCommas(text);
  const complexWordIssues = findComplexWords(text);
  const passiveIssues = findPassiveVoice(text);
  const genitiveIssues = findGenitiveCase(text);
  const abbreviationIssues = findAbbreviations(text);
  const { issues: replaceableIssues, suggestions } = findReplaceableWords(text);

  const allIssues = [
    ...longSentenceIssues,
    ...commaIssues,
    ...complexWordIssues,
    ...passiveIssues,
    ...genitiveIssues,
    ...abbreviationIssues,
    ...replaceableIssues,
  ];

  // Berechne Statistiken
  const stats: TextStats = {
    characters: text.length,
    words: words.length,
    sentences: sentences.length,
    avgWordsPerSentence: sentences.length > 0 ? Math.round((words.length / sentences.length) * 10) / 10 : 0,
    complexWords: complexWordIssues.length,
    passiveConstructions: passiveIssues.length,
    genitiveConstructions: genitiveIssues.length,
    abbreviations: abbreviationIssues.length,
    replaceableWords: replaceableIssues.length,
    sentencesWithTooManyCommas: commaIssues.length,
  };

  // Berechne Score und Level
  const score = calculateScore(allIssues, stats);
  const { level, color } = getLevel(score);

  return {
    score,
    level,
    levelColor: color,
    issues: allIssues,
    stats,
    suggestions,
  };
}
