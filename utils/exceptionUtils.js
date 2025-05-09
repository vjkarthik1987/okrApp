async function buildExceptionPipeline(model, baseFilter, orgId) {
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  
    if (model === 'KeyResult') {
      return [
        {
          $match: {
            ...baseFilter,
            organization: orgId,
            $or: [
              { status: 'At Risk' },
              {
                updates: {
                  $not: {
                    $elemMatch: {
                      updateDate: { $gte: twoWeeksAgo }
                    }
                  }
                }
              }
            ]
          }
        },
        {
          $project: {
            title: 1,
            status: 1,
            lastUpdate: { $max: '$updates.updateDate' }
          }
        },
        {
          $sort: { lastUpdate: 1 }
        }
      ];
    }
  
    if (model === 'DiaryEntry') {
      return [
        {
          $match: {
            ...baseFilter,
            organization: orgId
          }
        },
        {
          $group: {
            _id: '$user',
            entryCount: { $sum: 1 }
          }
        }
      ];
    }
  
    return [{ $match: baseFilter }];
  }
  
  module.exports = {
    buildExceptionPipeline
  };
  