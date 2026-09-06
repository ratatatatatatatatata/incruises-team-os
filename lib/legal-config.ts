export type PublicLegalConfig = {
  legalEntityName: string | null;
  supportEmail: string | null;
  ready: boolean;
};

function clean(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function validEmail(value: string | null) {
  return value !== null && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function getPublicLegalConfig(): PublicLegalConfig {
  const legalEntityName = clean(process.env.NEXT_PUBLIC_LEGAL_ENTITY_NAME);
  const candidateEmail = clean(process.env.NEXT_PUBLIC_SUPPORT_EMAIL);
  const supportEmail = validEmail(candidateEmail) ? candidateEmail : null;

  return {
    legalEntityName,
    supportEmail,
    ready: legalEntityName !== null && supportEmail !== null,
  };
}

export function supportMailto(supportEmail: string, subject: string) {
  return `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}`;
}
