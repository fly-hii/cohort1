const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const nodes=new Map();
function el(key){if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',value:'',dataset:{},style:{},addEventListener(){},showModal(){this.open=true},close(){this.open=false},click(){},focus(){},setSelectionRange(){}});return nodes.get(key)}
let saved=null;
const context=vm.createContext({console,Date,Intl,Math,JSON,Number,String,Set,Error,crypto:require('node:crypto').webcrypto,location:{hash:''},localStorage:{getItem:()=>saved,setItem:(k,v)=>saved=v},document:{querySelector:el,querySelectorAll:()=>[],body:{classList:{remove(){},toggle(){}}}},window:{addEventListener(){}},setTimeout:()=>1,clearTimeout(){},FormData:class{constructor(x){return Object.entries(x.values)[Symbol.iterator]()}},confirm:()=>true});
vm.runInContext(fs.readFileSync(__dirname+'/dist/app.js','utf8'),context);
const run=s=>vm.runInContext(s,context);
assert.equal(run('db.invoices.length'),18);assert.equal(run('db.payments.reduce((s,p)=>s+p.amount,0)'),808000);assert.equal(run('db.invoices.reduce((s,i)=>s+i.amount,0)'),1164000);
run('validateBackup(seed())');
for(const route of ['dashboard','invoices','payments','history','vendors','locations','categories','projects','reports','settings']){run(`page='${route}';render()`);assert.ok(el('#app').innerHTML.length>100)}
run("db.invoices.push({id:'test',number:'TEST',vendor:'v1',location:'l1',category:'c0',project:'',amount:.3,issued:today(),due:today(),approval:'Approved'});db.payments.push({id:'t1',invoice:'test',amount:.1},{id:'t2',invoice:'test',amount:.2})");assert.equal(run("remaining(db.invoices.find(x=>x.id==='test'))"),0);assert.equal(run("status(db.invoices.find(x=>x.id==='test'))"),'Paid');
run('db=seed();openForm("payments",null,"i0")');
function submit(values){el('#form').onsubmit({preventDefault(){},target:{values}})}
let count=run('db.payments.length');submit({invoice:'i0',amount:'999999',date:run('today()'),method:'UPI',reference:'test',notes:''});assert.equal(run('db.payments.length'),count);assert.match(el('#form-error').textContent,/no greater/);
submit({invoice:'i0',amount:'500',date:run('today()'),method:'UPI',reference:'test',notes:''});assert.equal(run('db.payments.length'),count+1);assert.equal(run('remaining(db.invoices[0])'),184500);assert.ok(JSON.parse(saved).payments.some(x=>x.reference==='test'));
run('openForm("invoices")');let base={number:'INV-2026-1041',vendor:'v1',location:'l1',category:'c0',project:'',amount:'1000',issued:run('today()'),due:run('today()'),approval:'Approved',notes:'',document:''};submit(base);assert.match(el('#form-error').textContent,/already has/);assert.equal(run('db.invoices.length'),18);
submit({...base,number:'TEST-NEW'});assert.equal(run('db.invoices.length'),19);
run('openForm("invoices","i0")');submit({...base,amount:'100'});assert.match(el('#form-error').textContent,/less than payments/);
assert.throws(()=>run("let invalid=seed();invalid.payments[0].amount=999999;validateBackup(invalid)"),/overpaid/);
assert.throws(()=>run("let invalid2=seed();invalid2.invoices[0].vendor='missing';validateBackup(invalid2)"),/missing linked/);
run("query='Airtel';locationFilter='';statusFilter='';");assert.equal(run('invoices().length'),3);
run("query='';locationFilter='l2';");assert.equal(run('invoices().length'),6);
run("db.invoices[0].currency='USD';db.invoices[0].lineItems=[{quantity:1,description:'Hot Desk Monthly Membership',unitPrice:250,total:250},{quantity:4,description:'Meeting Room Credits',unitPrice:25,total:100}];db.invoices[0].breakdown={subtotal:350,tax:0,shipping:0,total:350}");
assert.match(run("answerSavedInvoice('price breakdown for invoice INV-2026-1041')"),/Hot Desk Monthly Membership/);assert.match(run("answerSavedInvoice('hot desk price for INV-2026-1041')"),/USD 250/);assert.match(run("answerSavedInvoice('change INV-DOES-NOT-EXIST')"),/read-only/);
console.log('Passed: 10 screens, totals, cent precision, partial payment and persistence, overpayment prevention, duplicate invoice prevention, paid invoice floor, backup validation, search and location filtering.');
