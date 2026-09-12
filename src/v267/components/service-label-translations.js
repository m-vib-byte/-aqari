// Interface labels only; preserve saved record values.
const rows=[
 ['الموظفون والرواتب','Staff and payroll','कर्मचारी और वेतन','ملازمین اور تنخواہیں','ജീവനക്കാരും ശമ്പളവും'],
 ['عقود الإيجار','Rental contracts','किराया अनुबंध','کرایہ کے معاہدے','വാടകക്കരാറുകൾ']
];
export const SERVICE_LABEL_MESSAGES=Object.fromEntries(rows.map(([ar,en,hi,ur,ml])=>[ar,{en,hi,ur,ml}]));
