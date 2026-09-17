export const PIN_LENGTH = 8;

const EIGHT_DIGIT_PIN = /^[0-9]{8}$/;

export function isEightDigitPin(value) {
  return typeof value === "string" && EIGHT_DIGIT_PIN.test(value);
}
