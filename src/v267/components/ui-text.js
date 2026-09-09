import {message,t} from './locale.js';
import {node} from './dialog.js';
const messages=new WeakMap();

// Only interface templates are marked. Record values are substituted once as text.
export function setText(el,source,values={}) {
 messages.set(el,{source,values});el.dataset.aq267Text=source;refreshText(el);return el;
}
export const uiText=(tag,source,values={})=>setText(node(tag),source,values);
export function refreshText(el) {
 const saved=messages.get(el);
 el.textContent=saved?message(saved.source,saved.values):t(el.dataset.aq267Text);
}
