// Only local, explicitly translated UI validation can opt in. Remote error
// objects cannot acquire this identity by supplying a similarly named field.
const trusted=new WeakSet();
export function uiError(localizedMessage){const error=new Error(String(localizedMessage));trusted.add(error);return error;}
export const isUiError=error=>Boolean(error&&typeof error==='object'&&trusted.has(error));
