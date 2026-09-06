export const TAILORED_DIMENSIONS = Object.freeze([
  "direction",
  "consistency",
  "communication",
  "relationships",
  "content",
  "leadership",
  "learning",
  "resilience",
  "planning",
  "compliance",
]);

const forbiddenPromptPatterns = [
  /\b(?:password|passcode|otp|one[- ]time password|pin code|passport|social security|bank account|card number|cvv)\b/i,
  /(?:нууц үг|нэг удаагийн код|баталгаажуулах код|пин код|паспорт|регистрийн дугаар|банк(?:ны)? данс|дансны дугаар|картын дугаар)/i,
  /\b(?:diagnos(?:e|is)|medical history|health|religion|political affiliation|ethnicity|sexual orientation)\b/i,
  /(?:онош|өвчний түүх|эрүүл мэнд|шашин|улс төрийн үзэл|угсаа гарал|бэлгийн чиг баримжаа)/i,
  /(?:\bin[\s_-]*cruises\b|ин[\s_-]*круиз(?:ес)?)/i,
  /(?:\bboard[\s_-]+director\b|(?:боард|борд)[\s_-]+директор)/i,
];

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function cleanText(value, field, minimum, maximum) {
  if (typeof value !== "string") throw new Error(`${field}_must_be_text`);
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length < minimum || text.length > maximum) throw new Error(`${field}_length_invalid`);
  if (!/[А-ЯӨҮа-яөү]/u.test(text)) throw new Error(`${field}_must_be_mongolian`);
  if (forbiddenPromptPatterns.some((pattern) => pattern.test(text))) {
    throw new Error(`${field}_contains_forbidden_topic`);
  }
  return text;
}

function cleanQuestion(value, kind) {
  const question = asRecord(value);
  if (!question) throw new Error("question_must_be_object");
  return {
    prompt: cleanText(question.prompt, "prompt", 20, 360),
    helpText: cleanText(question.helpText, "help_text", 8, 220),
    responseType: kind === "scale" ? "scale" : "short_text",
  };
}

function normalizedPrompt(prompt) {
  return prompt
    .toLocaleLowerCase("mn-MN")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function buildTailoredQuestionSet(value) {
  if (!Array.isArray(value) || value.length !== TAILORED_DIMENSIONS.length) {
    throw new Error("dimension_count_invalid");
  }

  const byDimension = new Map();
  for (const item of value) {
    const section = asRecord(item);
    if (!section || !TAILORED_DIMENSIONS.includes(section.dimension)) {
      throw new Error("dimension_invalid");
    }
    if (byDimension.has(section.dimension)) throw new Error("dimension_duplicate");
    if (!Array.isArray(section.scales) || section.scales.length !== 8) {
      throw new Error("scale_count_invalid");
    }
    if (!Array.isArray(section.reflections) || section.reflections.length !== 2) {
      throw new Error("reflection_count_invalid");
    }
    byDimension.set(section.dimension, {
      scales: section.scales.map((question) => cleanQuestion(question, "scale")),
      reflections: section.reflections.map((question) => cleanQuestion(question, "reflection")),
    });
  }

  const orderedSections = TAILORED_DIMENSIONS.map((dimension) => ({
    dimension,
    ...byDimension.get(dimension),
  }));
  const questions = [];

  // Ten rounds keep the experience varied. Reflection prompts appear after
  // four scales and at the end of every dimension rather than in a block.
  for (let round = 0; round < 10; round += 1) {
    for (const section of orderedSections) {
      const question = round === 4
        ? section.reflections[0]
        : round === 9
          ? section.reflections[1]
          : section.scales[round < 4 ? round : round - 1];
      questions.push({
        position: questions.length + 1,
        dimension: section.dimension,
        prompt: question.prompt,
        helpText: question.helpText,
        responseType: question.responseType,
      });
    }
  }

  const uniquePrompts = new Set(questions.map((question) => normalizedPrompt(question.prompt)));
  if (questions.length !== 100 || uniquePrompts.size !== 100) {
    throw new Error("question_set_not_unique");
  }
  return questions;
}
