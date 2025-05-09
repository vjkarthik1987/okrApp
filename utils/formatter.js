// File: formatters/formatter.js

function formatActionItemsTable(actionItems) {
    if (!actionItems.length) return 'No action items found.';
  
    const header = `| Title | Assigned To | Status | Due Date | Description |
  |-------|--------------|--------|----------|-------------|`;
    const rows = actionItems.map(item => {
      const title = item.title || '-';
      const assigned = item.assignedTo?.name || 'Unassigned';
      const status = item.status || '-';
      const due = item.dueDate ? new Date(item.dueDate).toLocaleDateString() : '-';
      const desc = item.description?.slice(0, 50).replace(/\n/g, ' ') || '-';
      return `| ${title} | ${assigned} | ${status} | ${due} | ${desc} |`;
    });
  
    return ['📋 **Action Items:**', header, ...rows].join('\n');
  }
  
  function formatKeyResultsTable(keyResults) {
    if (!keyResults.length) return 'No key results found.';
  
    const header = `| Title | Owner Team | Status | Progress (%) | Due Date |
  |-------|-------------|--------|---------------|----------|`;
    const rows = keyResults.map(kr => {
      const title = kr.title || '-';
      const team = kr.ownerTeam?.name || '-';
      const status = kr.status || '-';
      const progress = kr.progressValue?.toFixed(1) ?? '0.0';
      const due = kr.dueDate ? new Date(kr.dueDate).toLocaleDateString() : '-';
      return `| ${title} | ${team} | ${status} | ${progress} | ${due} |`;
    });
  
    return ['📊 **Key Results:**', header, ...rows].join('\n');
  }
  
  function formatDiaryEntriesTable(diaryEntries) {
    if (!diaryEntries.length) return 'No diary entries found.';
  
    const header = `| Date | Submitted By | Summary |
  |------|---------------|---------|`;
    const rows = diaryEntries.map(entry => {
      const date = entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : '-';
      const user = entry.createdBy?.name || '-';
      const summary = entry.text?.slice(0, 100).replace(/\n/g, ' ') || '-';
      return `| ${date} | ${user} | ${summary} |`;
    });
  
    return ['📝 **Diary Entries:**', header, ...rows].join('\n');
  }
  
  function formatObjectivesTable(objectives) {
    if (!objectives.length) return 'No objectives found.';
  
    const header = `| Title | Team | Cycle | Status | Progress (%) |
  |-------|------|--------|--------|---------------|`;
    const rows = objectives.map(obj => {
      const title = obj.title || '-';
      const team = obj.team?.name || '-';
      const cycle = obj.cycle || '-';
      const status = obj.status || '-';
      const progress = obj.progressValue?.toFixed(1) ?? '0.0';
      return `| ${title} | ${team} | ${cycle} | ${status} | ${progress} |`;
    });
  
    return ['🎯 **Objectives:**', header, ...rows].join('\n');
  }
  
  module.exports = {
    formatActionItemsTable,
    formatKeyResultsTable,
    formatDiaryEntriesTable,
    formatObjectivesTable
  };
  