const KeyResult = require('../models/KeyResult');
const Objective = require('../models/Objective');

async function calculateObjectiveProgress(objectiveId) {
  const krs = await KeyResult.find({ objectiveId });

  if (!krs.length) return;

  const totalWeight = krs.reduce((sum, kr) => {
    const weight = kr.metricType === 'milestone'
      ? kr.milestones.reduce((wSum, m) => wSum + m.weight, 0)
      : 1;
    return sum + weight;
  }, 0);

  const totalProgress = krs.reduce((sum, kr) => {
    const weight = kr.metricType === 'milestone'
      ? kr.milestones.reduce((wSum, m) => wSum + m.weight, 0)
      : 1;
    return sum + (kr.progressValue * weight);
  }, 0);

  const finalProgress = totalWeight ? Math.round(totalProgress / totalWeight) : 0;

  // Determine status
  let status = 'on track';
  if (finalProgress < 40) status = 'off track';
  else if (finalProgress < 70) status = 'at risk';

  // Get latest KR comment (if any)
  const updates = krs.flatMap(k => k.updates || []);
  const latestComment = updates
    .sort((a, b) => new Date(b.updateDate) - new Date(a.updateDate))[0]?.updateText || '';

  // Update the objective with progressValue + status + latest comment + history push
  await Objective.findByIdAndUpdate(objectiveId, {
    progressValue: finalProgress,
    status,
    summaryUpdate: latestComment,
    $push: {
      progressHistory: {
        value: finalProgress,
        date: new Date()
      }
    }
  });
}

module.exports = calculateObjectiveProgress;