export const MAX_PROMPT_LENGTH = 500;

export type PromptValidation = { valid: true } | { valid: false; error: string };

/** 프롬프트 길이를 검증한다. 제출 시 trim되므로 앞뒤 공백은 길이에서 제외한다. */
export function validatePrompt(prompt: string): PromptValidation {
  if (prompt.trim().length > MAX_PROMPT_LENGTH) {
    return { valid: false, error: `프롬프트는 ${MAX_PROMPT_LENGTH}자 이하로 입력해주세요.` };
  }
  return { valid: true };
}
