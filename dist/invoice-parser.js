/* Conservative field suggestions. OCR is ML-based; field matching is label-based. */
(function(root){
  function parseInvoice(text){
    const lines=String(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    const warnings=[]; const evidence={};
    const reserved=/^(?:date|invoice|invoice\s*(?:no\.?|number|#)?|customer\s*id|terms|description|hours|rate|total|subtotal|discount|tax\s*rate|other|bill\s*to|ship\s*to|company\s*name|email\s*address|name|template|page\s*break)$/i;
    const noise=/(?:try\s+smartsheet|smartsheet\s+for\s+free|simple\s+invoice\s+template|template\s+begins|\bdisclaimer\b|reference\s+only|articles,?\s+templates|www\.|please\s+make\s+check|thank\s+you|for\s+questions\s+concerning)/i;
    const placeholder=/(?:company\s+name|123\s+main\s+street|hamilton,?\s*oh|\(321\)\s*456-7890|email\s+address|attn:\s*name|enter\s+(?:total|percentage)|name,?\s*\(321\))/i;
    const blankTemplate=/(?:simple\s+invoice\s+template|template\s+begins\s+on\s+page)/i.test(text)&&/(?:try\s+smartsheet|company\s+name|enter\s+total\s+amount)/i.test(text);
    function labelled(labels){
      const re=new RegExp('^(?:'+labels+')\\s*(?:[:#：]|[-–]\\s)?\\s*(.*)$','i');
      for(let i=0;i<lines.length;i++){const m=lines[i].match(re);if(m){let value=(m[1]||'').trim();if(!value){const candidate=lines[i+1]||'';value=reserved.test(candidate)||noise.test(candidate)?'':candidate}return {value,line:lines[i]+(value?' '+value:'')}}}
      return {value:'',line:''};
    }
    let number=labelled('invoice\\s*(?:number|no\\.?|#|id)|bill\\s*(?:number|no\\.?|#)');
    if(!number.value){const inline=String(text).match(/\b(?:invoice|bill)\s*(?:number|no\.?|#|id)\s*(?:[:#-]\s*)?([A-Za-z0-9][A-Za-z0-9_\/-]{0,70})/i);if(inline)number={value:inline[1],line:inline[0]}}
    const numberCandidate=number.value.match(/^([A-Za-z0-9][A-Za-z0-9_\/-]{0,70})/)?.[1]||'';
    const invoiceNumber=reserved.test(numberCandidate)||placeholder.test(numberCandidate)?'':numberCandidate;
    evidence.number=number.line;
    function parseDateValue(s,key,warnAmbiguous=true){
      let match=s.match(/\b(20\d{2})[-/]([01]?\d)[-/]([0-3]?\d)\b/),y,m,d;
      if(match){[,y,m,d]=match}else{
        match=s.match(/\b([0-3]?\d)[/.-]([01]?\d)[/.-](20\d{2})\b/);
        if(match){[,d,m,y]=match;if(warnAmbiguous&&Number(d)<=12&&Number(m)<=12)warnings.push('Numeric '+key+' date interpreted as day/month/year. Verify it against the document.');}
        else {match=s.match(/\b(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s,-]+(20\d{2})\b/);if(match){d=match[1];m=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(match[2].slice(0,3).toLowerCase())+1;y=match[3]}}
      }
      if(!y||!m||!d)return '';
      let date=new Date(Date.UTC(Number(y),Number(m)-1,Number(d)));
      if(date.getUTCFullYear()!==Number(y)||date.getUTCMonth()+1!==Number(m)||date.getUTCDate()!==Number(d))return '';
      return [y,String(m).padStart(2,'0'),String(d).padStart(2,'0')].join('-');
    }
    function dateField(labels,key){const found=labelled(labels);evidence[key]=found.line;return parseDateValue(found.value,key)}
    let issued=dateField('invoice\\s*date|bill\\s*date|date\\s*of\\s*issue|issued(?:\\s*on)?|date','issue');
    if(!issued&&invoiceNumber){const headerDate=lines.slice(0,12).find(l=>/(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-]20\d{2}|\d{1,2}[\s-]+[A-Za-z]{3,9}[\s,-]+20\d{2})/.test(l));if(headerDate){issued=parseDateValue(headerDate,'issue');evidence.issue='Header date '+headerDate;if(issued)warnings.push('Issue date was read from the invoice header. Verify it before saving.')}}
    let due=dateField('due\\s*date|payment\\s*due(?:\\s*date)?|pay\\s*by','due');
    if(!due&&issued&&/\bdue\s+upon\s+receipt\b/i.test(text)){due=issued;evidence.due='Due upon receipt';warnings.push('“Due upon receipt” was interpreted as the issue date. Verify it before saving.')}
    const vendorLabel=labelled('vendor(?:\\s*name)?|supplier(?:\\s*name)?|seller(?:\\s*name)?|issued\\s*by');
    let vendor=(noise.test(vendorLabel.value)||placeholder.test(vendorLabel.value)||reserved.test(vendorLabel.value))?'':vendorLabel.value;
    if(!vendor&&!blankTemplate){vendor=lines.slice(0,10).find(l=>/[a-zA-Z]{3}/.test(l)&&!noise.test(l)&&!placeholder.test(l)&&!reserved.test(l)&&!/(invoice|receipt|bill\s*(to|no)|tax\s*id|gstin|date|www\.|@|^page\b|^\d|^cohort\b)/i.test(l))||'';if(vendor)warnings.push('Vendor name is a heading suggestion. Confirm the supplier, not the customer.');}
    evidence.vendor=vendorLabel.line||vendor;
    let amount=null;
    for(const labels of ['total\\s*due','amount\\s*due','balance\\s*due','grand\\s*total(?:\\s*\\(INR\\))?','invoice\\s*total','total\\s*(?:amount|payable)(?:\\s*\\(INR\\))?','total(?:\\s*\\(INR\\))?']){
      const found=labelled(labels);
      const match=found.value.match(/^(?:INR|USD|EUR|GBP|AED|AUD|CAD|Rs\.?|[₹$€£])?\s*([\d,]+(?:\.\d{1,2})?)(?:\s*(?:INR|USD|EUR|GBP|AED|AUD|CAD|Rs\.?)|\s*\/[-–])?\s*$/i);
      if(match){const value=Number(match[1].replace(/,/g,''));if(Number.isFinite(value)&&value>0){amount=value;evidence.amount=found.line;break}}
    }
    let currency=/\b(?:USD|EUR|GBP|AED|AUD|CAD)\b|[$€£]/i.exec(text)?.[0]?.toUpperCase()||(/\bINR\b|₹|\bRs\./i.test(text)?'INR':'Unknown');
    currency=currency==='$'?'USD':currency==='€'?'EUR':currency==='£'?'GBP':currency;
    if(blankTemplate)warnings.push('This appears to be a blank invoice template. No completed invoice values were found; choose a filled invoice or enter the details manually.');
    if(currency!=='INR'&&!blankTemplate)warnings.push(currency==='Unknown'?'Currency was not identified. Confirm that the invoice is in INR.':'A non-INR currency was found. This workspace supports INR only; do not save without verifying the currency.');
    if(!invoiceNumber)warnings.push('Invoice number needs to be entered.');
    if(amount===null)warnings.push('Invoice total was not confidently identified. Enter the total including taxes.');
    if(!issued)warnings.push('Issue date needs to be entered.');
    if(!due)warnings.push('Due date needs to be entered.');
    const lineItems=[];
    for(const line of lines){const item=line.match(/^(\d+(?:\.\d+)?)\s+(.+?)\s+(?:USD\s*)?[$₹€£]?\s*([\d,]+(?:\.\d{1,2})?)\s+(?:USD\s*)?[$₹€£]?\s*([\d,]+(?:\.\d{1,2})?)$/i);if(item&&!/(?:subtotal|tax|shipping|total\s*due)/i.test(item[2]))lineItems.push({quantity:Number(item[1]),description:item[2].trim(),unitPrice:Number(item[3].replace(/,/g,'')),total:Number(item[4].replace(/,/g,''))})}
    function summaryAmount(label){for(const line of lines){const match=line.match(new RegExp('^'+label+'\\s+(?:INR|USD|EUR|GBP|AED|AUD|CAD|Rs\\.?|[₹$€£])?\\s*([\\d,]+(?:\\.\\d{1,2})?)$','i'));if(match)return Number(match[1].replace(/,/g,''))}return null}
    const breakdown={subtotal:summaryAmount('subtotal'),tax:summaryAmount('(?:sales\\s*)?tax'),shipping:summaryAmount('shipping(?:\\s*&\\s*handling)?'),total:amount};
    const foundCount=[vendor,invoiceNumber,amount,issued,due].filter(v=>v!==''&&v!==null).length;
    return {number:invoiceNumber,amount,vendor,issued,due,currency,evidence,warnings,blankTemplate,foundCount,lineItems,breakdown};
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={parseInvoice};else root.parseInvoice=parseInvoice;
})(typeof window==='undefined'?globalThis:window);
