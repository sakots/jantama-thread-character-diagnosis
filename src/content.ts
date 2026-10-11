import questions from '../data/questions.json';
import characters from '../data/characters.json';
import presentation from '../data/presentation.json';
import { characterDataSchema, presentationSchema, questionDataSchema } from './domain/schema';

export function loadContent() {
  return {
    questions: questionDataSchema.parse(questions),
    characters: characterDataSchema.parse(characters),
    presentation: presentationSchema.parse(presentation),
  };
}
