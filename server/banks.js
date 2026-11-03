/* 公開測試題庫：非原始量表、不得施測。
 * 專業題庫僅可在確認授權且儲存庫設為 Private 後置換本檔。 */
const versions = {preschool:['學前兒童用',50],lower_elementary:['低年級學生用',47],upper_elementary_plus:['中年級以上學生用',47]};
export const BANKS = Object.fromEntries(Object.entries(versions).map(([version,[title,count]])=>[version,{
 version,title,count,status:'DEMO_ONLY｜非原始量表｜禁止正式施測',
 items:Array.from({length:count},(_,i)=>({number:i+1,text:`示範作答題第 ${i+1} 題（非原始量表內容，僅測試操作）。`}))
}]));