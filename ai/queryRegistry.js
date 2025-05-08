// queryRegistry.js
const queryRegistry = [
    // OBJECTIVES
    {
        name: "objectivesByTeamAndCycle",
        type: "objective",
        aiIntent: [
        "show objectives for my team this quarter",
        "objectives assigned to platform engineering in Q2",
        "list all team objectives for this cycle"
        ],
        params: ["teamId", "cycle"],
        queryBuilder: ({ teamId, cycle }) => ({
        assignedTeams: { $in: [teamId] },
        cycle: { $in: [cycle] }
        })
    },

    {
        name: "objectivesByStatus",
        type: "objective",
        aiIntent: [
            "what is the status of objectives",
            "show objective statuses",
            "objective progress and status overview"
        ],
        params: ["status"], // or [] if you want general status view
        queryBuilder: ({ status }) => (
            status
            ? { status }
            : {} // fallback to all if no filter
        )
    },

    {
        name: "objectivesByCreator",
        type: "objective",
        aiIntent: [
        "objectives I created",
        "objectives added by me",
        "my created objectives"
        ],
        params: ["userId"],
        queryBuilder: ({ userId }) => ({
        createdBy: userId
        })
    },

    {
        name: "objectivesAtRiskThisCycle",
        type: "objective",
        aiIntent: [
        "at risk objectives this quarter",
        "which objectives are failing this cycle",
        "objectives marked as at risk in Q2"
        ],
        params: ["cycle"],
        queryBuilder: ({ cycle }) => ({
        cycle: { $in: [cycle] },
        status: "at risk"
        })
    },

    {
        name: "objectivesWithLowProgress",
        type: "objective",
        aiIntent: [
        "objectives with progress below 40 percent",
        "low progress objectives",
        "which objectives are underperforming"
        ],
        params: ["threshold"],
        queryBuilder: ({ threshold }) => ({
        progressValue: { $lt: threshold }
        })
    },

    {
        name: "childObjectivesOf",
        type: "objective",
        aiIntent: [
        "what are the sub objectives under objective X",
        "child objectives of a parent objective",
        "breakdown of top-level objectives"
        ],
        params: ["parentObjectiveId"],
        queryBuilder: ({ parentObjectiveId }) => ({
        parentObjective: parentObjectiveId
        })
    },

    // KEY RESULTS

    {
        name: "keyResultsByTeamAndCycle",
        type: "key_result",
        aiIntent: [
        "show all key results for my team in Q2",
        "list KRs tagged to this cycle",
        "KRs assigned to product team for this quarter"
        ],
        params: ["teamId", "weekCycleIds"],
        queryBuilder: ({ teamId, weekCycleIds }) => ({
        assignedTeams: { $in: [teamId] },
        "updates.weekCycle": { $in: weekCycleIds },
        deactivated: false
        })
    },

    {
        name: "keyResultsAtRisk",
        type: "key_result",
        aiIntent: [
        "which KRs are at risk",
        "key results failing for my team",
        "at-risk metrics in this cycle"
        ],
        params: ["teamId"],
        queryBuilder: ({ teamId }) => ({
        assignedTeams: { $in: [teamId] },
        status: "at risk",
        deactivated: false
        })
    },

    {
        name: "objectivesByTeamAndStatus",
        type: "objective",
        aiIntent: [
          "status of objectives for People team",
          "track objective status for my team",
          "show team OKRs with status",
          "status of objectives for abc team"
        ],
        params: ["teamId", "status"],
        queryBuilder: ({ teamId, status }) => {
          const q = {
            assignedTeams: { $in: [teamId] }
          };
          if (status) q.status = status;
          return q;
        }
      },

    {
        name: "KeyResultsByTeam",
        type: "key_result",
        aiIntent: [
        "KRs for my team",
        "status of KRs",
        "track KRs for delivery team",
        "status of KRs for abc team",
        ],
        params: ["teamId"],
        queryBuilder: ({ teamId }) => ({
        assignedTeams: { $in: [teamId] },
        deactivated: false
        })
    },

    {
        name: "milestoneKeyResultsByTeam",
        type: "key_result",
        aiIntent: [
        "milestone KRs for my team",
        "key results that are milestone-based",
        "track milestone KRs for delivery team"
        ],
        params: ["teamId"],
        queryBuilder: ({ teamId }) => ({
        assignedTeams: { $in: [teamId] },
        metricType: "milestone",
        deactivated: false
        })
    },

    {
        name: "keyResultsWithNoUpdates",
        type: "key_result",
        aiIntent: [
        "KRs with no updates in last 14 days",
        "which key results are not updated recently",
        "key results that are stale"
        ],
        params: ["teamId", "cutoffDate"],
        queryBuilder: ({ teamId, cutoffDate }) => ({
        assignedTeams: { $in: [teamId] },
        updates: { $not: { $elemMatch: { updateDate: { $gte: cutoffDate } } } },
        deactivated: false
        })
    },

    {
        name: "keyResultsByUser",
        type: "key_result",
        aiIntent: [
        "key results assigned to me",
        "my KRs for this quarter",
        "KRs I am responsible for"
        ],
        params: ["userId"],
        queryBuilder: ({ userId }) => ({
        assignedTo: { $in: [userId] },
        deactivated: false
        })
    }
];

module.exports = queryRegistry;
  