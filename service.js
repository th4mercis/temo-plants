import * as store from './store.js';
import {createServices} from './service-core.js';
const local=createServices(store);
export const receivePlant=(...args)=>store.demo?local.receivePlant(...args):store.command('receivePlant',args);
export const saveProduct=(...args)=>store.demo?local.saveProduct(...args):store.command('saveProduct',args);
export const stockChange=(...args)=>store.demo?local.stockChange(...args):store.command('stockChange',args);
export const createOrder=(...args)=>store.demo?local.createOrder(...args):store.command('createOrder',args);
export const discountOrder=(...args)=>store.demo?local.discountOrder(...args):store.command('discountOrder',args);
export const orderAction=(...args)=>store.demo?local.orderAction(...args):store.command('orderAction',args);
export const expense=(...args)=>store.demo?local.expense(...args):store.command('expense',args);
export const supply=(...args)=>store.demo?local.supply(...args):store.command('supply',args);
export const setVariantHidden=(...args)=>store.demo?local.setVariantHidden(...args):store.command('setVariantHidden',args);
export const appendOrderItems=(...args)=>store.demo?local.appendOrderItems(...args):store.command('appendOrderItems',args);
export const correctPurchaseCost=(...args)=>store.demo?local.correctPurchaseCost(...args):store.command('correctPurchaseCost',args);
export const correctOpeningCost=(...args)=>store.demo?local.correctOpeningCost(...args):store.command('correctOpeningCost',args);
export const saveCustomer=(...args)=>store.demo?local.saveCustomer(...args):store.command('saveCustomer',args);

export const linkOrderCustomer=(...args)=>store.demo?local.linkOrderCustomer(...args):store.command('linkOrderCustomer',args);

export const mergeCustomers=(...args)=>store.demo?local.mergeCustomers(...args):store.command('mergeCustomers',args);
