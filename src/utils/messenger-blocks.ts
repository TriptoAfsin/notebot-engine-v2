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
  /** generic-template card title and subtitle */
  cardTitle: 80,
  cardSubtitle: 80,
  /** Meta accepts at most 13 quick replies, each with a 20-character title */
  quickReplies: 13,
  quickReplyTitle: 20,
  /** postback payloads are capped at 1000 characters */
  payload: 1000,
  /** a plain text message */
  text: 2000,
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

export const textBlock = (text: string) => ({ text: fit(text, LIMITS.text) });

/**
 * How a single note is presented: title and link in one bubble.
 *
 * Shared by topic pages and search results on purpose. A button title is capped at 20 characters,
 * which turns "Polymer Characterization(Jeba,2026)" into "Polymer Characteriz" — a text bubble has
 * no such limit, so the full title survives and the link is still tappable. This is the format v1
 * uses for leaves, so it is also what students already recognise.
 */
export const noteBlock = (title: string, url: string, context?: string) =>
  textBlock(context ? `${title}\n   ${context}\n${url}` : `${title} - \n${url}`);

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

/**
 * Splits more than 3 buttons across as many blocks as needed instead of dropping them.
 *
 * v1 repeats the same header on each block (`🔰 Select Topic for Math-I -`), which reads better in
 * a thread than a "(cont.)" suffix, so this matches that.
 */
export const buttonGroups = (text: string, buttons: Button[]) => {
  const blocks = [];
  for (let i = 0; i < buttons.length; i += LIMITS.buttonsPerGroup) {
    blocks.push(buttonBlock(text, buttons.slice(i, i + LIMITS.buttonsPerGroup)));
  }
  return blocks;
};

export const imageBlock = (url: string) => ({
  attachment: { type: "image", payload: { url, is_reusable: true } },
});

/** Generic-template card. Used for the sponsor/partner blocks v1 puts atop subject pages. */
export const cardBlock = (opts: {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  defaultUrl?: string;
  buttons?: Button[];
}) => ({
  attachment: {
    type: "template",
    payload: {
      template_type: "generic",
      elements: [
        {
          title: fit(opts.title, LIMITS.cardTitle),
          ...(opts.imageUrl ? { image_url: opts.imageUrl } : {}),
          ...(opts.subtitle ? { subtitle: fit(opts.subtitle, LIMITS.cardSubtitle) } : {}),
          ...(opts.defaultUrl
            ? { default_action: { type: "web_url", url: opts.defaultUrl } }
            : {}),
          ...(opts.buttons?.length
            ? { buttons: opts.buttons.slice(0, LIMITS.buttonsPerGroup) }
            : {}),
        },
      ],
    },
  },
});

export type QuickReply = { content_type: "text"; title: string; payload: string };

export const quickReply = (title: string, payload: string): QuickReply => ({
  content_type: "text",
  title: fit(title, LIMITS.quickReplyTitle),
  payload: fit(payload, LIMITS.payload),
});

export const quickReplyBlock = (text: string, replies: QuickReply[]) => ({
  text: fit(text, LIMITS.text),
  quick_replies: replies.slice(0, LIMITS.quickReplies),
});

/**
 * Sender actions.
 *
 * `mark_seen` deliberately has no trailing space: v1 sends `"mark_seen "`
 * (`chatBotService.js:45`), which is not one of the three values Meta documents, so v1's read
 * receipts have never actually worked. Typing indicators expire on their own after 20 seconds or
 * as soon as a message is sent, so there is no need to post `typing_off` after every block the way
 * v1 does — that tripled its Send API traffic for no visible effect.
 */
export type SenderAction = "mark_seen" | "typing_on" | "typing_off";
