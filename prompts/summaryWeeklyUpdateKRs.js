module.exports = function generateKRPrompt({ week, krData }) {
    return `
  You are an OKR analyst at SunTec. Below is structured data for the Key Results of a team for the week "${week.label}".
  
  Strictly based on this data, write a concise summary with the following structure:
  
  1. 📊 **KR Progress Overview** – % progressing, % stalled (no update this week), % no progress ever  
  2. 🚀 **Key KRs That Progressed This Week** – Mention KRs with updates this week and their change  
  3. ⚠️ **KRs At Risk** – List KRs with no updates, past due dates, or unlikely to hit target  
  4. ✅ **Completed KRs** – KRs that hit 100% progress  
  
  Do not invent any KRs. Use only the provided data.
  
  KR Data:
  ${JSON.stringify(krData, null, 2)}
  `;
  };
  