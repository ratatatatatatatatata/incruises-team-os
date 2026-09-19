export function parseWeeklyCapacityMinutes(value) {
  const normalized = value
    .normalize("NFKC")
    .toLocaleLowerCase("mn-MN")
    .replace(/\bminut\b|\bmins?\b|\bminutes?\b/gu, "минут")
    .replace(/\btsag\b/gu, "цаг")
    .replace(/,/g, ".")
    .replace(/\s+/g, " ")
    .trim();
  const bareMatch = normalized.match(/^([0-9]{1,3})$/u);
  const minuteMatch = normalized.match(/(?:^|\s)([0-9]{1,3})\s*(?:минут|мин)(?=\s|$|[.;])/u);
  const hourMatch = normalized.match(/(?:^|\s)([0-9]{1,2}(?:\.[0-9]{1,2})?)\s*цаг(?=\s|$|[.;])/u);
  const totalMinutes = bareMatch
    ? Number(bareMatch[1])
    : minuteMatch
      ? Number(minuteMatch[1])
      : hourMatch
        ? Math.round(Number(hourMatch[1]) * 60)
        : null;
  if (totalMinutes === null || !Number.isFinite(totalMinutes) || totalMinutes < 5) return null;
  return Math.min(45, totalMinutes);
}
