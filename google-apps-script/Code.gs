/**
 * 自閉症兒童行為檢核表：短期收件系統（Google Apps Script）
 * 本檔僅處理傳遞與暫存；不得作為診斷或正式計分。
 * 部署時：執行身分選「我」；存取權依需求選擇可匿名開啟的網頁應用程式。
 * 重要：google.script.run 可以呼叫沒有底線結尾的函式，敏感函式務必檢查管理權限。
 */
var ASD_HEADERS = ['id','tokenHash','version','caseLabel','respondentRole','createdAt','expiresAt','status','pinHash','answersJson','updatedAt','submittedAt','retentionUntil'];
var ASD_CHOICES = ['always','often','sometimes','never'];
var ASD_VERSION_COUNTS = {preschool:50,lower_elementary:47,upper_elementary_plus:47};
var ASD_MAX_RETENTION_DAYS = 7;

function doGet(e) {
  var t = HtmlService.createTemplateFromFile('Index');
  var s = (e && e.parameter && e.parameter.invite) || '';
  t.initialInvite = /^[a-zA-Z0-9-]{30,100}$/.test(s) ? s : '';
  return t.evaluate().setTitle('自閉症兒童行為檢核表｜線上填答').addMetaTag('viewport','width=device-width, initial-scale=1');
}

// 僅由 Apps Script 擁有者在編輯器手動執行一次。名稱以底線結尾，禁止客戶端呼叫。
function setupSystem_() {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty('SHEET_ID');
  var setupPassword = props.getProperty('ADMIN_PASSWORD_SETUP');
  if (!sheetId) throw new Error('請先在「指令碼屬性」設定 SHEET_ID');
  if (!props.getProperty('ADMIN_PASSWORD_HASH')) {
    if (!setupPassword || setupPassword.length < 14) throw new Error('請設定至少14字的 ADMIN_PASSWORD_SETUP');
    var salt = randomToken_();
    props.setProperty('ADMIN_PASSWORD_SALT',salt);
    props.setProperty('ADMIN_PASSWORD_HASH',sha256_(salt + '|' + setupPassword));
  }
  if (setupPassword) props.deleteProperty('ADMIN_PASSWORD_SETUP');
  var ss = SpreadsheetApp.openById(sheetId);
  var sh = ss.getSheetByName('Invitations') || ss.insertSheet('Invitations');
  if (sh.getLastRow() === 0) sh.appendRow(ASD_HEADERS);
  var triggers = ScriptApp.getProjectTriggers();
  if (!triggers.some(function(x){return x.getHandlerFunction()==='cleanupExpired_';})) {
    ScriptApp.newTrigger('cleanupExpired_').timeBased().everyDays(1).atHour(2).create();
  }
  Logger.log('初始化成功。請不要記錄或分享管理密碼。');
}

function apiLogin(password) {
  if (typeof password !== 'string' || password.length > 250) throw new Error('密碼格式錯誤');
  var cache = CacheService.getScriptCache();
  var failures = Number(cache.get('admin_login_failures') || 0);
  if (failures >= 25) throw new Error('目前登入嘗試過多，請稍後再試');
  var props = PropertiesService.getScriptProperties();
  var expected = props.getProperty('ADMIN_PASSWORD_HASH');
  var salt = props.getProperty('ADMIN_PASSWORD_SALT');
  if (!expected || !salt) throw new Error('系統尚未初始化');
  if (sha256_(salt + '|' + password) !== expected) {
    cache.put('admin_login_failures',String(failures+1),600);
    throw new Error('管理密碼錯誤');
  }
  cache.remove('admin_login_failures');
  var session = randomToken_();
  cache.put('admin_session_' + sha256_(session), 'ok', 3600);
  return {token:session,expiresInSeconds:3600};
}

function apiCreateInvite(adminToken, options) {
  requireAdmin_(adminToken);
  options = options || {};
  var version = String(options.version || '');
  var count = ASD_VERSION_COUNTS[version];
  if (!count) throw new Error('量表版本無效');
  var hours = Number(options.hours);
  if (!Number.isInteger(hours) || hours < 1 || hours > 168) throw new Error('有效時間應為1至168小時');
  var label = String(options.caseLabel || '').trim().slice(0,80);
  if (/^[\s]*[=+\-@]/.test(label)) throw new Error('個案代號不可使用公式字元');
  var role = String(options.respondentRole || 'parent');
  if (['parent','teacher','reporter'].indexOf(role)===-1) throw new Error('填答身分錯誤');
  var token = randomToken_();
  var code = options.useCode ? generateCode_() : '';
  var now = new Date();
  var expiry = new Date(now.getTime() + hours * 3600000);
  var retention = new Date(expiry.getTime() + 86400000);
  var row = [Utilities.getUuid(),sha256_(token),version,label,role,now.toISOString(),expiry.toISOString(),'open',code?codeHash_(code):'', '{}',now.toISOString(),'',retention.toISOString()];
  lockAndRun_(function(){ sheet_().appendRow(row); });
  return {id:row[0],url:ScriptApp.getService().getUrl()+'?invite='+encodeURIComponent(token),code:code,expiresAt:row[6],version:version};
}

function apiOpenInvite(token, code) {
  var row = inviteByToken_(token);
  verifyInvite_(row, code, true);
  var bank = bankFor_(row.version);
  return {version:row.version,title:bank.title,items:bank.items,expiresAt:row.expiresAt,role:row.respondentRole,
    answers:parseAnswers_(row.answersJson),requiresCode:Boolean(row.pinHash)};
}

function apiSaveDraft(token, code, answers) {
  return lockAndRun_(function(){
    var row=inviteByToken_(token); verifyInvite_(row,code,false);
    var normalized=normalizeAnswers_(row.version,answers,false);
    updateRow_(row.sheetRow,{answersJson:JSON.stringify(normalized),updatedAt:new Date().toISOString()});
    return {ok:true,savedAt:new Date().toISOString()};
  });
}

function apiSubmit(token, code, answers) {
  return lockAndRun_(function(){
    var row=inviteByToken_(token); verifyInvite_(row,code,false);
    var normalized=normalizeAnswers_(row.version,answers,true);
    var now=new Date();
    updateRow_(row.sheetRow,{answersJson:JSON.stringify(normalized),status:'submitted',submittedAt:now.toISOString(),updatedAt:now.toISOString(),retentionUntil:new Date(now.getTime()+ASD_MAX_RETENTION_DAYS*86400000).toISOString()});
    return {ok:true,message:'問卷已提交，無須另行傳送檔案。'};
  });
}

function apiListInvites(adminToken) {
  requireAdmin_(adminToken);
  var all=readRows_();
  return all.filter(function(r){return new Date(r.retentionUntil).getTime() > Date.now();}).map(function(r){
    return {id:r.id,version:r.version,caseLabel:r.caseLabel,respondentRole:r.respondentRole,createdAt:r.createdAt,
      expiresAt:r.expiresAt,status:effectiveStatus_(r),submittedAt:r.submittedAt,retentionUntil:r.retentionUntil};
  }).reverse();
}

function apiGetResult(adminToken,id) {
  requireAdmin_(adminToken);
  var row=inviteById_(id);
  if (!row || row.status!=='submitted' || new Date(row.retentionUntil).getTime()<=Date.now()) throw new Error('找不到可領取的已提交資料');
  var bank=bankFor_(row.version);
  return {id:row.id,version:row.version,title:bank.title,caseLabel:row.caseLabel,respondentRole:row.respondentRole,
    submittedAt:row.submittedAt,items:bank.items,answers:parseAnswers_(row.answersJson),scoringStatus:'未經核定，不計分'};
}

function apiRevokeInvite(adminToken,id) {
  requireAdmin_(adminToken);
  return lockAndRun_(function(){
    var row=inviteById_(id); if(!row) throw new Error('找不到該邀請');
    if (row.status!=='open') throw new Error('僅可撤銷未提交的邀請');
    updateRow_(row.sheetRow,{status:'revoked',updatedAt:new Date().toISOString()});
    return {ok:true};
  });
}

function apiDeleteInvite(adminToken,id) {
  requireAdmin_(adminToken);
  return lockAndRun_(function(){
    var row=inviteById_(id); if(!row) throw new Error('找不到資料');
    sheet_().deleteRow(row.sheetRow);
    return {ok:true};
  });
}

// 每日由 Apps Script 排程執行。對外開放的 API 不可呼叫此函式。
function cleanupExpired_() {
  var now=Date.now();
  return lockAndRun_(function(){
    var sh=sheet_(); var values=sh.getDataRange().getValues();
    var removed=0;
    for (var i=values.length-1;i>=1;i--) {
      var retention=values[i][12];
      if (retention && new Date(retention).getTime() <= now) { sh.deleteRow(i+1); removed++; }
    }
    return removed;
  });
}

function requireAdmin_(token) {
  if (typeof token!=='string' || token.length<40 || !CacheService.getScriptCache().get('admin_session_'+sha256_(token))) throw new Error('管理登入已失效，請重新登入');
}
function bankFor_(version) {
  if (!Object.prototype.hasOwnProperty.call(ASD_BANKS,version)) throw new Error('查無題庫');
  var bank=ASD_BANKS[version];
  if (!bank || !Array.isArray(bank.items) || bank.items.length!==ASD_VERSION_COUNTS[version]) throw new Error('題庫題數不正確');
  return bank;
}
function normalizeAnswers_(version,input,complete) {
  if (!input || typeof input!=='object' || Array.isArray(input)) throw new Error('答案格式錯誤');
  var count=ASD_VERSION_COUNTS[version], result={};
  var keys=Object.keys(input);
  if (keys.length>count) throw new Error('答案題數異常');
  keys.forEach(function(k){
    var n=Number(k), v=String(input[k]);
    if (!Number.isInteger(n) || n<1 || n>count || ASD_CHOICES.indexOf(v)===-1) throw new Error('第'+k+'題答案不符合規則');
    result[k]=v;
  });
  if (complete && keys.length!==count) throw new Error('尚有'+(count-keys.length)+'題未完成，不能提交');
  return result;
}
function verifyInvite_(row,code,allowOpen) {
  if (!row) throw new Error('連結無效或已被刪除');
  if (row.status!=='open') throw new Error(row.status==='submitted'?'此問卷已提交，不可再次填寫':'此連結已失效');
  if (new Date(row.expiresAt).getTime()<=Date.now()) throw new Error('填答連結已到期');
  if (row.pinHash) {
    var attempts=Number(CacheService.getScriptCache().get('code_fail_'+row.id)||0);
    if (attempts>=12) throw new Error('驗證嘗試過多，請稍後重試');
    if (!code || codeHash_(String(code).toUpperCase().trim())!==row.pinHash) {
      CacheService.getScriptCache().put('code_fail_'+row.id,String(attempts+1),600);
      throw new Error('填答驗證碼錯誤');
    }
    CacheService.getScriptCache().remove('code_fail_'+row.id);
  }
}
function effectiveStatus_(row) {return row.status==='open' && Date.parse(row.expiresAt)<=Date.now() ? 'expired':row.status;}
function parseAnswers_(s) {try{return JSON.parse(s||'{}');}catch(e){return {};}}
function codeHash_(code) {return sha256_(PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD_SALT')+'|pin|'+code);}
function generateCode_() {var alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789', bytes=Utilities.getUuid().replace(/-/g,'');var s='';for(var i=0;i<8;i++)s+=alphabet[parseInt(bytes.slice(i*2,i*2+2),16)%alphabet.length];return s;}
function randomToken_() {return Utilities.getUuid()+'-'+Utilities.getUuid();}
function sha256_(s) {return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(s),Utilities.Charset.UTF_8).map(function(b){return('0'+((b+256)%256).toString(16)).slice(-2);}).join('');}
function lockAndRun_(fn){var lock=LockService.getScriptLock();if(!lock.tryLock(15000))throw new Error('目前系統忙碌，請稍後再試');try{return fn();}finally{lock.releaseLock();}}
function sheet_(){var id=PropertiesService.getScriptProperties().getProperty('SHEET_ID');if(!id)throw new Error('尚未設定 SHEET_ID');var sh=SpreadsheetApp.openById(id).getSheetByName('Invitations');if(!sh)throw new Error('請先執行 setupSystem_ 初始化');return sh;}
function readRows_(){var all=sheet_().getDataRange().getValues();var rows=[];for(var i=1;i<all.length;i++){var r={sheetRow:i+1};for(var j=0;j<ASD_HEADERS.length;j++)r[ASD_HEADERS[j]]=String(all[i][j]||'');if(r.id)rows.push(r);}return rows;}
function inviteByToken_(token){if(typeof token!=='string'|| !/^[a-z0-9-]{30,100}$/i.test(token))return null;var hash=sha256_(token);return readRows_().find(function(r){return r.tokenHash===hash;})||null;}
function inviteById_(id){if(typeof id!=='string'||id.length>100)return null;return readRows_().find(function(r){return r.id===id;})||null;}
function updateRow_(rowNumber,values){var sh=sheet_();Object.keys(values).forEach(function(k){var i=ASD_HEADERS.indexOf(k);if(i<0)throw new Error('不合法欄位');sh.getRange(rowNumber,i+1).setValue(values[k]);});}