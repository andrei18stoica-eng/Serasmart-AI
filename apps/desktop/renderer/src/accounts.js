// 0.7.40 (asked by the Owner: "a button to add another account, so you can switch between accounts"): the accounts
// signed in on this device, like Claude's account switcher. Each keeps its own session token in this browser (the same
// place the one signed-in account always kept it); switching puts that account's session in place and reloads the
// app, so nothing of the other account stays on the screen. Signing out of an account removes it from the list.
import { storage, TOKEN_KEY, USER_KEY, PERMISSIONS_KEY, ACCOUNT_KEYS } from "./core.jsx";

export const SAVED_ACCOUNTS_KEY = "serasmartSavedAccountsV1";
const MAX_ACCOUNTS = 10;

const clean = (a) => a && typeof a === "object" && typeof a.token === "string" && a.token && a.user && typeof a.user === "object";
export function savedAccounts() {
  const list = storage.json(SAVED_ACCOUNTS_KEY, []);
  return Array.isArray(list) ? list.filter(clean) : [];
}
function write(list) { storage.set(SAVED_ACCOUNTS_KEY, JSON.stringify(list.slice(0, MAX_ACCOUNTS))); }
const keyOf = (u) => String(u?.id || u?.email || "").toLowerCase();

// The account signed in now goes (back) to the top of the list, with its current token.
export function rememberCurrentAccount() {
  const token = storage.get(TOKEN_KEY), user = storage.json(USER_KEY, null);
  if (!token || !user) return;
  const permissions = storage.json(PERMISSIONS_KEY, {});
  const id = keyOf(user);
  const slim = { id: user.id, email: user.email, name: user.name, role: user.role, avatar: user.preferences?.avatar || user.avatar || "" };
  write([{ token, user: slim, fullUser: user, permissions, savedAt: Date.now() }, ...savedAccounts().filter((a) => keyOf(a.user) !== id)]);
}
export function forgetAccount(user) {
  const id = keyOf(user);
  write(savedAccounts().filter((a) => keyOf(a.user) !== id));
}
// The other accounts on this device (not the one signed in now).
export function otherAccounts(currentUser) {
  const id = keyOf(currentUser);
  return savedAccounts().filter((a) => keyOf(a.user) !== id);
}
// Put a saved account's session in place and reload.
export function switchToAccount(account) {
  rememberCurrentAccount();
  ACCOUNT_KEYS.forEach((k) => storage.remove(k));
  storage.set(TOKEN_KEY, account.token);
  storage.set(USER_KEY, JSON.stringify(account.fullUser || account.user));
  storage.set(PERMISSIONS_KEY, JSON.stringify(account.permissions || {}));
  location.reload();
}
// «Add another account»: the current one stays saved, the sign-in screen opens (without signing it out on the server).
export function leaveForNewAccount() {
  rememberCurrentAccount();
  ACCOUNT_KEYS.forEach((k) => storage.remove(k));
  location.reload();
}
