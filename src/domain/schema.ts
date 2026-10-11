import { z } from 'zod';

export const dimensions = ['chat', 'mahjong', 'character', 'social', 'humor', 'calm'] as const;
export type Dimension = (typeof dimensions)[number];
export type Vector = Record<Dimension, number>;

const text = z.string().trim().min(1);
const evidenceSchema = z.object({
  status: z.enum(['user-confirmed', 'prior-analysis-summary', 'design-proposal', 'unverified']),
  verified: z.boolean(),
  source: z.array(text).min(1),
  confidence: z.enum(['high', 'medium', 'low']),
}).strict();

const weights = Object.fromEntries(dimensions.map((dimension) => [dimension, z.number().min(0).max(2).optional()])) as Record<Dimension, z.ZodOptional<z.ZodNumber>>;
const vector = Object.fromEntries(dimensions.map((dimension) => [dimension, z.number().min(0).max(5)])) as Record<Dimension, z.ZodNumber>;
const uniqueIds = (items: { id: string }[]) => new Set(items.map((item) => item.id)).size === items.length;
const uniqueDimensions = (items: Dimension[]) => new Set(items).size === dimensions.length;

const questionSchema = z.object({
  id: text,
  text,
  answers: z.array(z.object({ id: text, text, weights: z.object(weights).strict() }).strict())
    .min(2).max(4).refine(uniqueIds, '回答IDは質問内で一意にする'),
}).strict();

export const questionDataSchema = z.object({
  status: z.literal('design-proposal'),
  note: text,
  evidence: evidenceSchema.extend({ status: z.literal('design-proposal'), verified: z.literal(false) }),
  dimensions: z.array(z.enum(dimensions)).length(6).refine(uniqueDimensions, '全6属性を重複なく指定する'),
  questions: z.array(questionSchema).min(8).max(12).refine(uniqueIds, '質問IDは一意にする'),
}).strict();

const sourcedTextSchema = z.object({ text, evidence: evidenceSchema }).strict();
const characterSchema = z.object({
  id: text,
  name: text,
  universe: z.enum(['mahjong-soul', 'other-franchise-thread-meme']),
  sourceStatus: text,
  evidence: evidenceSchema,
  officialProfile: sourcedTextSchema.nullable(),
  threadInterpretation: sourcedTextSchema.nullable(),
  traits: z.object({
    weights: z.object(vector).strict(),
    reviewed: z.boolean(),
    evidence: evidenceSchema.extend({ status: z.literal('design-proposal'), verified: z.literal(false) }),
  }).strict().nullable(),
  eligibleForDiagnosis: z.boolean(),
}).strict();

export const characterDataSchema = z.object({
  status: text,
  note: text,
  traitSchema: z.object(Object.fromEntries(dimensions.map((dimension) => [dimension, z.literal('0..5')])) as Record<Dimension, z.ZodLiteral<'0..5'>>).strict(),
  characters: z.array(characterSchema).refine(uniqueIds, 'キャラIDは一意にする'),
  threadMemeCharacters: z.array(z.object({
    id: text,
    name: text,
    universe: z.literal('other-franchise-thread-meme'),
    face: text,
    style: text,
    eligibleForDiagnosis: z.literal(false),
    sourceStatus: text,
    evidence: evidenceSchema,
  }).strict()).refine(uniqueIds, '参考キャラIDは一意にする'),
}).strict();

export const presentationSchema = z.object({
  evidence: evidenceSchema.extend({ status: z.literal('design-proposal'), verified: z.literal(false) }),
  title: text,
  subtitle: text,
  opening: text,
  resultLine: text,
  dimensions: z.object(Object.fromEntries(dimensions.map((dimension) => [dimension, z.object({ label: text, description: text }).strict()])) as Record<Dimension, z.ZodObject<{ label: typeof text; description: typeof text }>>).strict(),
  sourceNotes: z.array(z.object({ label: text, text }).strict()).min(1),
}).strict();

export type Question = z.infer<typeof questionSchema>;
export type Character = z.infer<typeof characterSchema>;
