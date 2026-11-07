export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

/** In characters as a person counts them, so an emoji is one and not two. */
export const passwordLength = (password: string) => [...password].length;
