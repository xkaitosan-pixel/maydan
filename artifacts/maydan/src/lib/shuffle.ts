import type { Question } from "./questions";

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleQuestion(q: Question, seed?: number): Question {
  const rand = seed != null ? mulberry32(seed) : Math.random;
  const idxs = q.options.map((_, i) => i);
  for (let i = idxs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
  }
  return {
    ...q,
    options: idxs.map((i) => q.options[i]),
    correct: idxs.indexOf(q.correct),
  };
}

export function shuffleQuestions(qs: Question[], deterministic = false): Question[] {
  return qs.map((q) => shuffleQuestion(q, deterministic ? q.id : undefined));
}
