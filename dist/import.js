(()=>{
  let pending=null, previewURL=null, controller=null, requestId=0;
  const dlg=document.createElement('dialog');dlg.id='import-dialog';dlg.className='import-dialog';dlg.setAttribute('aria-labelledby','import-title');document.body.append(dlg);
  const close=()=>{requestId++;controller?.abort();controller=null;if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;pending=null;dlg.close()};
  function frame(content){dlg.innerHTML=`<div class="dialog-head"><div><span class="genie-label">✦ Invoice Genie</span><h2 id="import-title">AI-assisted invoice import</h2><p>Read the document. Review the suggestions. Save when it looks right.</p></div><button type="button" id="import-close" aria-label="Close import">×</button></div>${content}`;dlg.querySelector('#import-close').onclick=close;}
  dlg.addEventListener('cancel',e=>{e.preventDefault();close()});
  window.openInvoiceImport=async()=>{
    if(!db.locations.length||!db.categories.length){toast('Add a location and expense category before importing an invoice.');return}
    frame(`<div class="genie-intro"><div class="genie-orb">✦</div><div><b>Drop in a completed invoice</b><p>Invoice Genie reads PDFs and scans on this Mac, then suggests the vendor, invoice number, total and dates for your review.</p></div></div><div class="import-privacy"><b>Private and on-device</b><p>Your document stays on this Mac. No account or API key required.</p></div><div id="import-status" role="status">Checking local recognition…</div><form id="upload-form"><label class="upload-zone">Select a PDF or scanned invoice<input id="invoice-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.heic,.heif" required disabled><small>One completed invoice · PDF up to 10 pages · PNG, JPEG or HEIC · Maximum 20 MB</small></label><p>Suggestions can be corrected before saving. Invoice Genie never saves automatically.</p><div class="dialog-foot"><button type="button" id="import-cancel">Cancel</button><button id="extract-button" class="primary" disabled>✦ Ask Invoice Genie</button></div></form>`);
    dlg.querySelector('#import-cancel').onclick=close;dlg.showModal();let token;const rid=++requestId;
    try{const r=await fetch('/api/extraction-status');if(!r.ok)throw Error('Start the app with the updated launcher (python3 server.py) to enable document extraction.');const status=await r.json();if(rid!==requestId)return;if(!status.available)throw Error('Local recognition is unavailable. Start the app on macOS with Apple Command Line Tools installed.');token=status.token;dlg.querySelector('#invoice-file').disabled=false;dlg.querySelector('#extract-button').disabled=false;dlg.querySelector('#import-status').textContent='Ready to read PDFs and scans on this Mac.';}
    catch(e){if(rid===requestId)dlg.querySelector('#import-status').textContent=e instanceof SyntaxError?'Use the updated launcher (python3 server.py) to enable extraction.':e.message;return}
    dlg.querySelector('#upload-form').onsubmit=async e=>{
      e.preventDefault();const file=dlg.querySelector('#invoice-file').files[0];if(!file)return;
      let ext=file.name.split('.').pop().toLowerCase(),mime={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',heic:'image/heic',heif:'image/heif'}[ext];
      if(!mime||file.size>20*1024*1024||!file.size){dlg.querySelector('#import-status').textContent='Choose a PDF or supported image smaller than 20 MB.';return}
      const id=++requestId;controller=new AbortController();const btn=dlg.querySelector('#extract-button');btn.disabled=true;dlg.querySelector('#invoice-file').disabled=true;btn.textContent='Invoice Genie is reading…';dlg.querySelector('#import-status').textContent='Reading the pages and matching invoice fields. Large scans may take up to two minutes.';
      try{
        const bytes=await file.arrayBuffer();const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
        if(db.invoices.some(i=>i.sourceFingerprint===fingerprint))throw Error('This document has already been imported. Open the existing invoice to make changes.');
        const res=await fetch('/api/extract',{method:'POST',headers:{'Content-Type':mime,'X-Cohort-Token':token},body:bytes,signal:controller.signal});const result=await res.json();if(!res.ok)throw Error(result.error||'Extraction failed.');if(id!==requestId)return;
        pending={file,fingerprint,result,fields:parseInvoice(result.text),mime};previewURL=URL.createObjectURL(file);review();
      }catch(err){if(id!==requestId)return;dlg.querySelector('#import-status').textContent=err.name==='AbortError'?'Reading cancelled.':err.message;btn.disabled=false;dlg.querySelector('#invoice-file').disabled=false;btn.textContent='✦ Ask Invoice Genie';}
    };
  };
  function review(){
    const {file,result,fields:f,mime}=pending;
    const matchedVendor=db.vendors.find(v=>v.name.toLowerCase()===f.vendor.toLowerCase());
    const documentText=result.text.toLowerCase();
    const suggestedLocation=db.locations.find(l=>documentText.includes(l.name.toLowerCase()));
    const categoryRules=[[/desk|cowork|membership|rent/,/rent|lease/],[/print|scan|stationery|office suppl/,/office supplies/],[/internet|wifi|software|subscription/,/internet|software/],[/repair|maintenance/,/maintenance/],[/furniture|chair|desk purchase/,/furniture/]];
    const categoryRule=categoryRules.find(([words])=>words.test(documentText));
    const suggestedCategory=categoryRule&&db.categories.find(c=>categoryRule[1].test(c.name.toLowerCase()));
    const preview=mime==='application/pdf'?`<object title="Original invoice PDF" data="${previewURL}" type="application/pdf"><p>PDF preview is unavailable. Open your original file and compare it with the suggestions.</p></object>`:mime==='image/heic'||mime==='image/heif'?'<p>HEIC preview is not supported in every browser. Check the extracted text or open your original file.</p>':`<img src="${previewURL}" alt="Original uploaded invoice">`;
    const resultTone=f.blankTemplate?'template':f.foundCount>=4?'good':'partial';
    const amountLabel=f.currency&&f.currency!=='Unknown'&&f.currency!=='INR'?`Document total (${f.currency}) · confirm INR value`:'Invoice total (INR)';
    frame(`<div class="import-review"><section class="source-panel"><div class="source-title"><b>${esc(file.name)}</b><small>${result.pages} page${result.pages===1?'':'s'} · ${result.ocrPages?'Scan recognition':'PDF text extraction'}</small></div>${preview}<details><summary>View what Invoice Genie read</summary><pre>${esc(result.text)}</pre></details></section><section><div class="genie-result ${resultTone}"><div class="genie-orb">✦</div><div><b>${f.blankTemplate?'Blank template detected':'Invoice Genie suggestions'}</b><p>${f.blankTemplate?'This file contains empty invoice fields, so there are no values to extract.':`Found ${f.foundCount} of 5 key details. Ask Genie about this document or your saved invoices.`}</p></div><span>${f.foundCount}/5</span></div>${f.warnings.length?`<ul class="import-warnings ${f.blankTemplate?'template-warning':''}">${f.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`:''}<form id="review-import"><div class="import-fields">${input('Vendor name','vendorName',matchedVendor?.name||f.vendor,'text',true,'list="import-vendors" maxlength="200"')}<datalist id="import-vendors">${db.vendors.map(v=>`<option value="${esc(v.name)}"></option>`).join('')}</datalist>${input('Invoice number','number',f.number,'text',true,'maxlength="100"')}${input(amountLabel,'amount',f.amount??'','number',true,'min="0.01" step="0.01"')}${select('Expense category','category',db.categories,suggestedCategory?.id||'')}${input('Issue date','issued',f.issued,'date')}${input('Due date','due',f.due,'date')}${select('Location','location',db.locations,suggestedLocation?.id||'')}${select('Project / cost center','project',db.projects,'',true)}${input('Notes','notes','','textarea',false)}</div><p class="import-hint">Category and location can be suggested from matching words in the document. Project and missing dates stay empty instead of being guessed.</p><label class="review-check"><input type="checkbox" id="review-confirm" required> I checked the vendor, dates and total against the document and confirm the saved amount is in INR.</label><div id="import-error" role="alert"></div><div class="dialog-foot"><button type="button" id="import-back">Choose another file</button><button class="primary">Save reviewed invoice</button></div></form></section></div><button type="button" id="genie-chat-toggle" class="genie-fab" aria-expanded="false" aria-controls="genie-chat" title="Ask Invoice Genie"><span>✦</span><b>Ask Genie</b></button><aside id="genie-chat" class="genie-chat" hidden><div class="genie-chat-head"><div><span class="genie-mini-orb">✦</span><b>Invoice Genie</b><small>Search and answers only</small></div><button type="button" id="genie-chat-close" aria-label="Close Genie">×</button></div><div id="genie-messages" class="genie-messages" aria-live="polite"><div class="genie-bubble bot">Ask me about the uploaded invoice or search for a saved invoice number. I never change the form.</div></div><div class="genie-quick"><button type="button" data-genie-prompt="Summarize this invoice">Summarize</button><button type="button" data-genie-prompt="What is this invoice total?">Ask total</button></div><form id="genie-chat-form"><input id="genie-question" aria-label="Ask Invoice Genie" placeholder="e.g. Show invoice 1234 details" autocomplete="off"><button class="primary" aria-label="Send to Genie">↑</button></form></aside>`);
    dlg.querySelector('#import-back').onclick=()=>{close();window.openInvoiceImport()};
    const chat=dlg.querySelector('#genie-chat'),toggle=dlg.querySelector('#genie-chat-toggle'),messages=dlg.querySelector('#genie-messages');
    const showChat=show=>{chat.hidden=!show;toggle.setAttribute('aria-expanded',String(show));if(show)dlg.querySelector('#genie-question').focus()};
    toggle.onclick=()=>showChat(chat.hidden);dlg.querySelector('#genie-chat-close').onclick=()=>showChat(false);
    const breakdownShortcut=document.createElement('button');breakdownShortcut.type='button';breakdownShortcut.dataset.geniePrompt='Show the price breakdown';breakdownShortcut.textContent='Price breakdown';chat.querySelector('.genie-quick').prepend(breakdownShortcut);
    const addMessage=(message,kind)=>{const bubble=document.createElement('div');bubble.className='genie-bubble '+kind;bubble.textContent=message;messages.append(bubble);messages.scrollTop=messages.scrollHeight};
    const currentDetails=()=>`Uploaded document: invoice ${f.number||'not found'}; vendor ${f.vendor||'not found'}; issue date ${f.issued||'not found'}; due date ${f.due||'not found'}; total ${f.amount===null?'not found':`${f.currency==='Unknown'?'currency unknown':f.currency} ${f.amount}`}.`;
    const priceBreakdown=data=>{const items=data.lineItems||[],breakdown=data.breakdown||{};if(!items.length)return 'No itemized price breakdown was found.';const parts=items.map(item=>`${item.quantity} × ${item.description}: ${data.currency||f.currency} ${item.total} (${data.currency||f.currency} ${item.unitPrice} each)`);if(breakdown.subtotal!==null&&breakdown.subtotal!==undefined)parts.push(`Subtotal: ${data.currency||f.currency} ${breakdown.subtotal}`);if(breakdown.tax!==null&&breakdown.tax!==undefined)parts.push(`Tax: ${data.currency||f.currency} ${breakdown.tax}`);if(breakdown.shipping!==null&&breakdown.shipping!==undefined)parts.push(`Shipping & handling: ${data.currency||f.currency} ${breakdown.shipping}`);if(breakdown.total!==null&&breakdown.total!==undefined)parts.push(`Total: ${data.currency||f.currency} ${breakdown.total}`);return parts.join('\n')};
    function askGenie(question){
      const q=question.trim(),lower=q.toLowerCase();if(!q)return;addMessage(q,'user');let reply='';
      const saved=db.invoices.find(i=>lower.includes(i.number.toLowerCase()));
      const meaningful=lower.split(/[^a-z0-9]+/).filter(word=>word.length>2&&!['what','which','price','cost','tell','show','invoice','about'].includes(word));
      const item=f.lineItems.find(row=>meaningful.some(word=>row.description.toLowerCase().includes(word)));
      if(saved&&/(?:breakdown|line\s*items?|itemized|prices?)/.test(lower)){reply=priceBreakdown(saved)}
      else if(saved){reply=`Saved invoice ${saved.number}: ${name('vendors',saved.vendor)}, ${money(saved.amount)}, issued ${saved.issued}, due ${saved.due}, status ${status(saved)}.`}
      else if(/breakdown|line\s*items?|itemized/.test(lower)){reply=priceBreakdown(f)}
      else if(item&&/(?:price|cost|amount|item|membership|desk|meeting|printing|scanning)/.test(lower)){reply=`${item.quantity} × ${item.description}: ${f.currency} ${item.total} total at ${f.currency} ${item.unitPrice} each.`}
      else if(/subtotal/.test(lower)){reply=f.breakdown.subtotal===null?'Subtotal was not found.':`The subtotal is ${f.currency} ${f.breakdown.subtotal}.`}
      else if(/tax/.test(lower)){reply=f.breakdown.tax===null?'Tax was not found.':`The tax is ${f.currency} ${f.breakdown.tax}.`}
      else if(/shipping|handling/.test(lower)){reply=f.breakdown.shipping===null?'Shipping and handling were not found.':`Shipping and handling are ${f.currency} ${f.breakdown.shipping}.`}
      else if(/invoice\s*(?:number|no\.?|#)/.test(lower)){reply=f.number?`The uploaded document’s invoice number is ${f.number}.`:'I could not find an invoice number in the uploaded document.'}
      else if(/vendor|supplier/.test(lower)){reply=f.vendor?`The extracted vendor is ${f.vendor}.`:'I could not confidently find a vendor in the uploaded document.'}
      else if(/due\s*date|when.*due/.test(lower)){reply=f.due?`The due date is ${f.due}${/due\s+upon\s+receipt/i.test(result.text)?' because the invoice says “Due upon receipt.”':''}.`:'I could not find a due date in the uploaded document.'}
      else if(/issue\s*date|invoice\s*date/.test(lower)){reply=f.issued?`The issue date is ${f.issued}.`:'I could not find an issue date in the uploaded document.'}
      else if(/total|amount/.test(lower)){reply=f.amount===null?'I could not confidently find the invoice total.':`The document total is ${f.currency==='Unknown'?'currency unknown':f.currency} ${f.amount}. This workspace saves amounts in INR, so verify the currency before saving.`}
      else if(/category/.test(lower)){reply=suggestedCategory?`The description suggests ${suggestedCategory.name}. This is a suggestion, not a value printed on the invoice.`:'I could not confidently suggest a category.'}
      else if(/location/.test(lower)){reply=suggestedLocation?`The document mentions ${suggestedLocation.name}, which matches a saved location.`:'I could not match the document to a saved location.'}
      else if(/fill|change|update|edit/.test(lower)){reply='I am read-only. I can search and answer questions, but I never change invoice fields.'}
      else if(/show|find|search|detail|summary|summarize|what.*found|invoice/.test(lower)){reply=currentDetails()}
      else {const matches=result.text.split(/\r?\n/).filter(line=>meaningful.some(word=>line.toLowerCase().includes(word))).slice(0,5);reply=matches.length?`I found these matching invoice details:\n${matches.join('\n')}`:'I could not find that detail in the extracted invoice text. Try asking for the price breakdown, a line item, invoice number, vendor, dates, tax, shipping, total, category, or location.'}
      addMessage(reply,'bot');
    }
    dlg.querySelectorAll('[data-genie-prompt]').forEach(button=>button.onclick=()=>askGenie(button.dataset.geniePrompt));
    dlg.querySelector('#genie-chat-form').onsubmit=e=>{e.preventDefault();const question=dlg.querySelector('#genie-question');askGenie(question.value);question.value=''};
    dlg.querySelector('#review-import').onsubmit=e=>{
      e.preventDefault();const data=Object.fromEntries(new FormData(e.target));Object.keys(data).forEach(k=>data[k]=data[k].trim());
      try{
        if(!dlg.querySelector('#review-confirm').checked)throw Error('Review the document and confirm the currency before saving.');
        const amount=Math.round(Number(data.amount)*100)/100;
        if(!data.vendorName||!data.number||!Number.isFinite(amount)||amount<=0)throw Error('Enter a vendor, invoice number and valid positive total.');
        if(!data.issued||!data.due||data.due<data.issued)throw Error('Enter both dates. Due date must be on or after issue date.');
        if(!db.locations.some(l=>l.id===data.location)||!db.categories.some(c=>c.id===data.category))throw Error('Select a location and category.');
        let vendor=db.vendors.find(v=>v.name.toLowerCase()===data.vendorName.toLowerCase());
        if(vendor&&db.invoices.some(i=>i.vendor===vendor.id&&i.number.toLowerCase()===data.number.toLowerCase()))throw Error('This vendor already has an invoice with that number. Open the existing invoice to update it.');
        if(db.invoices.some(i=>i.sourceFingerprint===pending.fingerprint))throw Error('This document has already been imported.');
        const before=JSON.stringify(db);
        if(!vendor){vendor={id:uid(),name:data.vendorName,email:'',phone:'',notes:''};db.vendors.push(vendor)}
        const invoice={id:uid(),vendor:vendor.id,number:data.number,amount,issued:data.issued,due:data.due,location:data.location,category:data.category,project:data.project,notes:data.notes,approval:'Pending',document:'',sourceFilename:pending.file.name,sourceFingerprint:pending.fingerprint,extractionEngine:pending.result.engine,currency:f.currency,lineItems:f.lineItems,breakdown:f.breakdown};
        db.invoices.push(invoice);audit('Imported and reviewed invoice '+data.number);
        if(!save()){db=JSON.parse(before);render();throw Error('Could not save to browser storage. Download a backup and free space before retrying.');}
        close();location.hash='invoices';toast('Invoice imported. Approval is pending.');
      }catch(err){dlg.querySelector('#import-error').textContent=err.message}
    };
  }
})();
