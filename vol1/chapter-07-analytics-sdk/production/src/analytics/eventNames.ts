/* NOT PART OF THE INTERVIEW: production version. */

export const MAX_EVENT_NAME_LENGTH = 64;

/**
 * The naming rule: lower case words joined by "_", for example
 * `checkout_started`. One fixed form keeps "Checkout Started",
 * "checkoutStarted" and "checkout_started" from becoming three events in
 * the reports. A name is a fixed word of the product. It never holds a
 * value: no user name, no email address, no id.
 */
export function isValidEventName(name: string): boolean {
  return name.length <= MAX_EVENT_NAME_LENGTH && /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(name);
}
