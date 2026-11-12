/**
 * The password someone typed on Create account, on its way to the screen that sends it with the code. A module
 * variable, on purpose: router state ends up in `history.state`, which browsers keep. The code screen copies this
 * into its own state and clears it at once, so the password is gone when that screen is, including on reload.
 */
export interface PendingRegistration {
  email: string;
  password: string;
  displayName: string;
}

let pending: PendingRegistration | null = null;

export const holdRegistration = (value: PendingRegistration) => {
  pending = value;
};
export const readRegistration = () => pending;
export const clearRegistration = () => {
  pending = null;
};
