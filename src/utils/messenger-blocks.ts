/**
 * Messenger block builders with Meta's real limits.
 *
 * Deliberately not using the `simple-messenger-blocks` package here: the copy installed in this
 * repo is 1.2.0, which truncates button titles at 15 characters. Meta allows 20, and
 * notebot-engine-v1 was corrected to 20 in c724761 (via patch-package). If v2 served the bot
 * using the unpatched package, the two engines would render the same content differently — a
 * silent 377-title diff.
 */

export const LIMITS = {
  buttonTitle: 20,
  buttonsPerGroup: 3,
  templateText: 640,
} as const;

/** Truncates by UTF-16 code unit, matching what the platform itself does. */
const fit = (value: string, max: number) => {
  const s = String(value ?? "");
  return s.length > max ? s.slice(0, max) : s;
};

export type WebButton = { type: "web_url"; url: string; title: string };
export type PostbackButton = { type: "postback"; title: string; payload: string };
export type Button = WebButton | PostbackButton;

export const webButton = (title: string, url: string): WebButton => ({
  type: "web_url",
  url,
  title: fit(title, LIMITS.buttonTitle),
});

export const postbackButton = (title: string, payload: string): PostbackButton => ({
  type: "postback",
  title: fit(title, LIMITS.buttonTitle),
  payload,
});

export const textBlock = (text: string) => ({ text: fit(text, 2000) });

/**
 * A button template. Meta caps buttons at 3 and silently discards the rest, so callers that may
 * have more should use `buttonGroups` instead of losing them here.
 */
export const buttonBlock = (text: string, buttons: Button[]) => ({
  attachment: {
    type: "template",
    payload: {
      template_type: "button",
      text: fit(text, LIMITS.templateText),
      buttons: buttons.slice(0, LIMITS.buttonsPerGroup),
    },
  },
});

/** Splits more than 3 buttons across as many blocks as needed instead of dropping them. */
export const buttonGroups = (text: string, buttons: Button[]) => {
  const blocks = [];
  for (let i = 0; i < buttons.length; i += LIMITS.buttonsPerGroup) {
    const chunk = buttons.slice(i, i + LIMITS.buttonsPerGroup);
    blocks.push(buttonBlock(i === 0 ? text : `${text} (cont.)`, chunk));
  }
  return blocks;
};
