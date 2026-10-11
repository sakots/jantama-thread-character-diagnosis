import { describe, expect, it } from 'vitest';
import rawQuestions from '../../data/questions.json';
import rawCharacters from '../../data/characters.json';
import { characterDataSchema, questionDataSchema, type Character, type Vector } from './schema';
import { diagnose, summarizeAnswers } from './diagnosis';

const questions = questionDataSchema.parse(rawQuestions).questions;
const answers = Object.fromEntries(questions.map((question) => [question.id, 'a']));
const vector: Vector = { chat: 5, mahjong: 0, character: 0, social: 0, humor: 0, calm: 3 };

// 架空の検証用候補。実在キャラの属性や公式出典ではない。
function candidate(id: string, weights = vector): Character {
  return {
    id, name: `テスト専用 ${id}`, universe: 'mahjong-soul', sourceStatus: 'test-fixture',
    evidence: { status: 'unverified', verified: false, source: ['test-fixture'], confidence: 'low' },
    officialProfile: {
      text: '検証専用の架空プロフィール',
      evidence: { status: 'user-confirmed', verified: true, source: ['test-fixture'], confidence: 'high' },
    },
    threadInterpretation: null,
    traits: {
      weights, reviewed: true,
      evidence: { status: 'design-proposal', verified: false, source: ['test-fixture'], confidence: 'low' },
    },
    eligibleForDiagnosis: true,
  };
}

describe('データ契約', () => {
  it('原ログ照合済みのスレ内扱いを受理し、公式設定と分離する', () => {
    const data = structuredClone(rawCharacters);
    Object.assign(data.characters[0], {
      threadInterpretation: {
        text: 'スレ内の愛称を原ログで確認したテストデータ',
        evidence: { status: 'corpus-verified', verified: true, source: ['docs/corpus-report.md'], confidence: 'medium' },
      },
    });
    expect(characterDataSchema.safeParse(data).success).toBe(true);
    expect(data.characters[0].officialProfile).toBeNull();
  });

  it('既存JSONを受理し、公開キャラの未確認属性をnullに保つ', () => {
    expect(questionDataSchema.parse(rawQuestions).questions).toHaveLength(10);
    expect(characterDataSchema.parse(rawCharacters).characters[0].traits).toBeNull();
  });

  it.each([
    ['未知の属性', (data: typeof rawQuestions) => { Object.assign(data.questions[0].answers[0].weights, { unknown: 1 }); }],
    ['範囲外の配点', (data: typeof rawQuestions) => { Object.assign(data.questions[0].answers[0].weights, { chat: 3 }); }],
    ['重複した質問ID', (data: typeof rawQuestions) => { data.questions[1].id = data.questions[0].id; }],
    ['重複した回答ID', (data: typeof rawQuestions) => { data.questions[0].answers[1].id = 'a'; }],
    ['空の質問文', (data: typeof rawQuestions) => { data.questions[0].text = ''; }],
  ])('%sを拒否する', (_, mutate) => {
    const data = structuredClone(rawQuestions);
    mutate(data);
    expect(questionDataSchema.safeParse(data).success).toBe(false);
  });

  it('キャラの属性欠損・範囲外・非有限数を拒否する', () => {
    for (const weights of [{ chat: 1 }, { ...vector, chat: 6 }, { ...vector, chat: NaN }]) {
      expect(characterDataSchema.safeParse({ ...rawCharacters, characters: [candidate('x', weights as Vector)] }).success).toBe(false);
    }
  });

  it('キャラIDの重複を拒否する', () => {
    expect(characterDataSchema.safeParse({ ...rawCharacters, characters: [candidate('x'), candidate('x')] }).success).toBe(false);
  });
});

describe('回答集計と診断', () => {
  it('同じ回答で同じ結果となり、入力を変更しない', () => {
    const input = structuredClone(answers);
    expect(diagnose(questions, [candidate('a')], answers)).toEqual(diagnose(questions, [candidate('a')], answers));
    expect(answers).toEqual(input);
  });

  it('未完了では計算せず、不足質問を返す', () => {
    expect(diagnose(questions, [], {})).toEqual({ status: 'incomplete', missing: questions.map((question) => question.id) });
  });

  it('未知の質問と回答を拒否する', () => {
    expect(() => diagnose(questions, [], { ...answers, typo: 'a' })).toThrow();
    expect(() => diagnose(questions, [], { ...answers, q01: 'unknown' })).toThrow();
  });

  it('回答を変更すると再集計する', () => {
    const before = summarizeAnswers(questions, answers);
    const after = summarizeAnswers(questions, { ...answers, q01: 'b' });
    expect(after.raw.chat).toBe(before.raw.chat - 2);
    expect(after.raw.mahjong).toBe(before.raw.mahjong + 2);
  });

  it('属性ごとの最大点で正規化し、0〜1に収める', () => {
    const summary = summarizeAnswers(questions, answers);
    expect(summary.raw.chat).toBe(13);
    expect(summary.maximum.chat).toBe(14);
    expect(summary.normalized.chat).toBe(13 / 14);
    expect(summary.normalized.mahjong).toBe(0);
    for (const value of Object.values(summary.normalized)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('同点は入力順に依存せずID順にする', () => {
    const result = diagnose(questions, [candidate('z'), candidate('a')], answers);
    expect(result.status).toBe('ready');
    if (result.status === 'ready') expect(result.ranking.map((item) => item.character.id)).toEqual(['a', 'z']);
  });

  it('一致した方向は100%、直交した方向は0%になる', () => {
    const normalized = summarizeAnswers(questions, answers).normalized;
    const result = diagnose(questions, [candidate('match', normalized), candidate('other', { ...vector, chat: 0, calm: 0, mahjong: 5 })], answers);
    if (result.status !== 'ready') throw new Error('推薦結果が必要');
    expect(result.ranking[0].compatibility).toBe(100);
    expect(result.ranking[1].compatibility).toBe(0);
    expect(result.ranking[0].reasons).toHaveLength(2);
  });

  it('丸め後に同じ相性でも、丸め前の類似度で順位を決める', () => {
    const normalized = summarizeAnswers(questions, answers).normalized;
    const result = diagnose(questions, [candidate('a', { ...normalized, mahjong: 0.001 }), candidate('z', normalized)], answers);
    if (result.status !== 'ready') throw new Error('推薦結果が必要');
    expect(result.ranking.map((item) => item.compatibility)).toEqual([100, 100]);
    expect(result.ranking[0].character.id).toBe('z');
  });

  it('公開データでは準備中となる', () => {
    expect(diagnose(questions, characterDataSchema.parse(rawCharacters).characters, answers).status).toBe('no-candidates');
  });

  it('レビュー前、未確認の公式紹介、対象外、無効、ゼロ属性の候補を除外する', () => {
    const unreviewed = candidate('unreviewed');
    unreviewed.traits!.reviewed = false;
    const unverified = candidate('unverified');
    unverified.officialProfile!.evidence.verified = false;
    const other = candidate('other');
    other.universe = 'other-franchise-thread-meme';
    const disabled = candidate('disabled');
    disabled.eligibleForDiagnosis = false;
    const zero = candidate('zero', { chat: 0, mahjong: 0, character: 0, social: 0, humor: 0, calm: 0 });
    expect(diagnose(questions, [unreviewed, unverified, other, disabled, zero], answers).status).toBe('no-candidates');
  });

  it('全候補が非表示でも安全に準備中となる', () => {
    expect(diagnose(questions, [candidate('x')], answers, ['x']).status).toBe('no-candidates');
  });

  it('全回答が0点なら相性を作らない', () => {
    const zeroQuestions = questions.map((question) => ({ ...question, answers: question.answers.map((answer) => ({ ...answer, weights: {} })) }));
    expect(diagnose(zeroQuestions, [candidate('x')], answers).status).toBe('no-signal');
  });
});
