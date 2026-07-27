type ParticipantNameFields = {
  full_name?: string | null;
  f_name?: string | null;
  l_name?: string | null;
  m_initial?: string | null;
  suffix?: string | null;
};

/**
 * Normalizes names for official document output.
 *
 * Some imported records contain an invalid enye representation: `n` or `N`
 * followed by COMBINING DIAERESIS (U+0308), which renders as `n̈` instead of
 * `ñ`. NFC handles a correctly decomposed `n` + COMBINING TILDE, while the
 * explicit replacements repair the malformed diaeresis sequence.
 */
export const normalizeOfficialNameText = (value?: string | null): string =>
  (value || '')
    .normalize('NFC')
    .replace(/n\u0308/g, 'ñ')
    .replace(/N\u0308/g, 'Ñ')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ');

const formatMiddleInitial = (value?: string | null): string => {
  const normalized = normalizeOfficialNameText(value).replace(/\.+$/g, '');
  return normalized ? `${normalized}.` : '';
};

export const formatParticipantOfficialName = (
  participant: ParticipantNameFields
): string => {
  const firstName = normalizeOfficialNameText(participant.f_name);
  const lastName = normalizeOfficialNameText(participant.l_name);

  if (firstName || lastName) {
    return [
      firstName,
      formatMiddleInitial(participant.m_initial),
      lastName,
      normalizeOfficialNameText(participant.suffix)
    ]
      .filter(Boolean)
      .join(' ');
  }

  return normalizeOfficialNameText(participant.full_name) || 'Unnamed participant';
};
