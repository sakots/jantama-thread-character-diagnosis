import { dimensions, type Character, type Dimension, type Question, type Vector } from './schema';

export type Answers = Record<string, string>;
const emptyVector = (): Vector => ({ chat: 0, mahjong: 0, character: 0, social: 0, humor: 0, calm: 0 });

export function summarizeAnswers(questions: Question[], answers: Answers) {
  for (const [id, value] of Object.entries(answers)) {
    const question = questions.find((item) => item.id === id);
    if (!question || !question.answers.some((item) => item.id === value)) {
      throw new Error(`未知の質問または回答: ${id}`);
    }
  }

  const raw = emptyVector();
  const maximum = emptyVector();
  for (const question of questions) {
    const selected = question.answers.find((answer) => answer.id === answers[question.id]);
    for (const dimension of dimensions) {
      raw[dimension] += selected?.weights[dimension] ?? 0;
      maximum[dimension] += Math.max(...question.answers.map((answer) => answer.weights[dimension] ?? 0));
    }
  }
  const normalized = emptyVector();
  for (const dimension of dimensions) {
    normalized[dimension] = maximum[dimension] ? raw[dimension] / maximum[dimension] : 0;
  }
  return { raw, maximum, normalized };
}

type Summary = ReturnType<typeof summarizeAnswers>;
export type Recommendation = { character: Character; compatibility: number; reasons: Dimension[] };
export type Diagnosis =
  | { status: 'incomplete'; missing: string[] }
  | { status: 'no-signal' | 'no-candidates'; summary: Summary }
  | { status: 'ready'; summary: Summary; ranking: Recommendation[] };

const magnitude = (vector: Vector) => Math.sqrt(dimensions.reduce((sum, dimension) => sum + vector[dimension] ** 2, 0));
const compareId = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;

export function diagnose(questions: Question[], characters: Character[], answers: Answers, hiddenIds: string[] = []): Diagnosis {
  const summary = summarizeAnswers(questions, answers);
  const missing = questions.filter((question) => !Object.hasOwn(answers, question.id)).map((question) => question.id);
  if (missing.length) return { status: 'incomplete', missing };

  const userMagnitude = magnitude(summary.normalized);
  if (!userMagnitude) return { status: 'no-signal', summary };
  const candidates = characters.filter((character) =>
    character.universe === 'mahjong-soul'
    && character.eligibleForDiagnosis
    && character.officialProfile?.evidence.verified
    && character.officialProfile.evidence.status !== 'unverified'
    && character.officialProfile.evidence.status !== 'design-proposal'
    && character.traits?.reviewed
    && magnitude(character.traits.weights) > 0
    && !hiddenIds.includes(character.id),
  );
  if (!candidates.length) return { status: 'no-candidates', summary };

  const ranking = candidates.map((character) => {
    const target = character.traits!.weights;
    const contribution = (dimension: Dimension) => summary.normalized[dimension] * (target[dimension] / 5);
    const dot = dimensions.reduce((sum, dimension) => sum + contribution(dimension), 0);
    const similarity = Math.max(0, Math.min(1, dot / (userMagnitude * (magnitude(target) / 5))));
    const reasons = [...dimensions]
      .filter((dimension) => contribution(dimension) > 0)
      .sort((a, b) => contribution(b) - contribution(a) || dimensions.indexOf(a) - dimensions.indexOf(b))
      .slice(0, 2);
    return { character, similarity, compatibility: Math.round(similarity * 1000) / 10, reasons };
  }).sort((a, b) => b.similarity - a.similarity || compareId(a.character.id, b.character.id))
    .map(({ similarity: _, ...recommendation }) => recommendation);

  return { status: 'ready', summary, ranking };
}
