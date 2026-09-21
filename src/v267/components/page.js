import {createDialog} from './dialog.js';

// Reuse the authenticated request lifecycle without opening a modal dialog.
export function createPage(title,options={}){
 return createDialog(title,{...options,page:true});
}
