// Display names. A person's chosen name (auth user_metadata.full_name) always wins; when it is missing,
// a best guess is derived from the email address. The guess is only a default — people can edit it.

/** Common first names, used to split run-together local parts such as "michaelcollins". Lowercase. */
const FIRST_NAMES = new Set(
  (
    "aaron abdul abel abigail abraham adam adrian agnes ahmed aisha alan albert alex alexander alexandra alfred alice alicia allan alvin amanda amber amelia amina amy andre andrea andrew angela anita ann anna anne annie anthony antonio april arnold arthur ashley audrey austin " +
    "barbara barry beatrice ben benjamin bernard beth betty beverly bill blessing bob bonnie brad bradley brandon brenda brian bridget brittany bruce bryan " +
    "caleb calvin cameron carl carlos carol caroline carolyn catherine cecilia charles charlie charlotte chloe chris christian christina christine christopher chukwuma cindy claire clara clarence craig curtis cynthia " +
    "daniel danielle david dean deborah debra denis dennis derek diana diane dominic donald donna doris dorothy douglas duncan dylan " +
    "earl eddie edgar edith edward edwin elaine eleanor elijah elizabeth ella ellen emeka emily emma emmanuel eric erica erin ernest esther ethan eugene eunice evan evelyn " +
    "faith fatima felix fiona florence frances francis frank fred frederick " +
    "gabriel gail gary gavin george georgia gerald gilbert gloria godfrey grace graham grant gregory hannah harold harry hassan hazel heather helen henry herbert hilda holly howard hugh " +
    "ian ibrahim irene isaac isabel isabella ivan jack jacob jacqueline james jamie jane janet janice jason jean jeffrey jennifer jeremy jerry jessica jill joan joanna joel john johnny jonathan jordan joseph josephine joshua joy joyce juan judith judy julia julian julie justin " +
    "karen kate katherine kathleen kathryn katie keith kelly kenneth kevin kim kimberly kofi kwame kyle " +
    "larry laura lauren lawrence leah lee leo leonard leslie lillian lily linda lisa logan lois louis louise lucas lucy luke lydia lynn " +
    "marcus margaret maria marie marilyn mark martha martin mary mason matthew maureen max megan melissa michael michelle mike mildred miriam mohamed mohammed molly monica morgan moses muhammad " +
    "nancy naomi natalie nathan neil nicholas nicole noah norman obinna olivia oliver omar oscar owen " +
    "pamela patricia patrick paul paula peggy peter philip phillip phyllis rachel ralph raymond rebecca regina richard rita robert roberto robin roger ronald rose roy ruby russell ruth ryan " +
    "sally samantha samuel sandra sara sarah scott sean sharon shirley simon sofia sophia sophie stanley stella stephanie stephen steve steven susan sylvia " +
    "tamara teresa terry theresa thomas tiffany timothy tina todd tony tracy travis tyler valerie vanessa victor victoria vincent virginia walter wanda wayne wendy william willie yusuf zachary zainab"
  ).split(" "),
);

const capitalize = (w: string) => (w ? w[0].toUpperCase() + w.slice(1) : w);

/** Split a run-together lowercase word on the longest known first name that leaves a plausible surname. */
function splitRunTogether(word: string): string[] {
  if (FIRST_NAMES.has(word)) return [word];
  for (let len = Math.min(word.length - 3, 12); len >= 3; len--) {
    const head = word.slice(0, len);
    if (FIRST_NAMES.has(head)) return [head, word.slice(len)];
  }
  return [word];
}

/**
 * Best-guess display name from an email address.
 * "michaelcollins1406@gmail.com" → "Michael Collins", "jane.o-neill@x.com" → "Jane O Neill".
 * Returns "" when nothing name-like is left (e.g. "12345@x.com").
 */
export function nameFromEmail(email: string | null | undefined): string {
  if (!email) return "";
  const local = email.split("@")[0].split("+")[0].toLowerCase();
  const parts = local
    .split(/[._\-\s]+/)
    .map((p) => p.replace(/[^a-z]/g, ""))
    .filter(Boolean);
  if (parts.length === 0) return "";
  const words = parts.length === 1 ? splitRunTogether(parts[0]) : parts;
  return words.map(capitalize).join(" ");
}

type UserLike = { email?: string | null; user_metadata?: { full_name?: unknown } | null } | null | undefined;

/** The name to show for a user: their saved full name, else a guess from the email, else the email itself. */
export function displayName(user: UserLike): string {
  const saved = typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
  if (saved) return saved;
  return nameFromEmail(user?.email) || user?.email || "";
}

/** First word of a display name, for greetings. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** Up to two initials for an avatar. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}
